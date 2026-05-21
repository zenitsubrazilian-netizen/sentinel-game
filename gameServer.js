'use strict';

const express = require('express');
const http    = require('http');
const { Server } = require('socket.io');
const path    = require('path');

const app    = express();
const server = http.createServer(app);
const io     = new Server(server, { cors: { origin: '*' } });
const rooms  = new Map();

const rand   = (a, b) => Math.floor(Math.random() * (b - a + 1)) + a;
const chance = p => Math.random() * 100 < p;
const genId  = () => Math.random().toString(36).substr(2, 8).toUpperCase();
const clamp  = (v, min, max) => Math.max(min, Math.min(max, v));

app.use(express.json());

app.get('/health', (_req, res) =>
  res.json({ status: 'ok', rooms: rooms.size, uptime: process.uptime() })
);

// ─── Resultado de sala (polling pelo bot para conceder XP) ────────────────────
app.get('/room/:roomId/result', (req, res) => {
  const room = rooms.get(req.params.roomId);
  if (!room) return res.status(404).json({ error: 'not_found' });
  if (room.phase !== 'ended') return res.json({ ended: false });
  return res.json({
    ended:    true,
    winner:   room.winner,   // 'p1' | 'p2' | 'draw'
    p1Jid:    room.p1.jid,
    p2Jid:    room.p2.jid,
    p1IsBot:  room.p1.isBot,
    p2IsBot:  room.p2.isBot,
  });
});

app.post('/room', (req, res) => {
  const { p1Jid, p2Jid, isVsBot, difficulty, p1Bonus, p2Bonus } = req.body;
  if (!p1Jid) return res.status(400).json({ error: 'p1Jid obrigatório' });
  const roomId = genId();
  const p1 = makePlayer(p1Jid, false, p1Bonus || {});
  const p2 = isVsBot
    ? makePlayer('sentinel', true,  {})
    : makePlayer(p2Jid || 'unknown', false, p2Bonus || {});
  rooms.set(roomId, {
    id: roomId, phase: 'fighting', round: 1,
    isVsBot: !!isVsBot, difficulty: difficulty || 'medium',
    log: [], p1, p2, createdAt: Date.now(),
  });
  // Mantém sala por 25 min (5 extra após game para polling de XP)
  setTimeout(() => rooms.delete(roomId), 25 * 60_000);
  res.json({ roomId });
});

app.get(['/', '/game'], (req, res) => {
  const { room, player } = req.query;
  if (!room || !['p1', 'p2'].includes(player))
    return res.status(400).send('<h2 style="font-family:sans-serif;padding:20px;color:red">⚠️ Link inválido.</h2>');
  res.sendFile(path.join(__dirname, 'game.html'));
});

// ─── FACTORY DE JOGADOR — FIX: usa chaves corretas dos bônus de relíquia ─────
function makePlayer(jid, isBot = false, bonus = {}) {
  return {
    jid,
    isBot,
    hp:               120 + (bonus.maxHpBonus     || 0),
    maxHp:            120 + (bonus.maxHpBonus     || 0),
    mana:              60 + (bonus.maxManaBonus   || 0),
    maxMana:           60 + (bonus.maxManaBonus   || 0),
    energy:            50 + (bonus.maxEnergyBonus || 0),
    maxEnergy:         50 + (bonus.maxEnergyBonus || 0),
    potions:            2 + (bonus.extraPotions   || 0),
    effects:           [],
    ultimate:          bonus.startUltimate        || 0,
    action:          null,
    defending:       false,
    spellCooldowns:    {},
    // Bônus de relíquia armazenados e aplicados no combate
    manaCostReduction:  bonus.manaCostReduction  || 0,
    dmgBonus:           bonus.dmgBonus           || 0,
    dodgeBonus:         bonus.dodgeBonus         || 0,
    damageReduction:    bonus.damageReduction    || 0,
    regenPerRound:      bonus.regenPerRound      || 0,
    spellPowerBonus:    bonus.spellPowerBonus    || 0,
    ultimatePowerBonus: bonus.ultimatePowerBonus || 0,
  };
}

// ─── FEITIÇOS ─────────────────────────────────────────────────────────────────
// FIX: gelo cd=4 (2 ativo + 2 após) | raio cd=2 (1 ativo + 1 após)
const SPELLS = {
  bola_de_fogo:  { cost: 25, cd: 2 },
  raio:          { cost: 30, cd: 2 },   // FIX: era 3
  gelo:          { cost: 20, cd: 4 },   // FIX: era 2
  veneno:        { cost: 15, cd: 3 },
  cura:          { cost: 20, cd: 2 },
  escudo_magico: { cost: 18, cd: 2 },
  furia:         { cost: 20, cd: 2 },
  fraqueza:      { cost: 15, cd: 2 },
  silencio:      { cost: 20, cd: 3 },
  correntes:     { cost: 25, cd: 2 },
};

const hasEffect    = (p, type) => p.effects.some(e => e.type === type && e.rounds > 0);
const removeEffect = (p, type) => { p.effects = p.effects.filter(e => e.type !== type); };
function addEffect(p, type, rounds, value = 0) {
  removeEffect(p, type);
  p.effects.push({ type, rounds, value });
}

io.on('connection', socket => {
  socket.on('join', ({ roomId, player }) => {
    const room = rooms.get(roomId);
    if (!room) return socket.emit('error', 'Sala não encontrada');
    socket.join(roomId);
    socket.emit('state', sanitize(room));
  });

  socket.on('action', ({ roomId, player, action }) => {
    const room = rooms.get(roomId);
    if (!room || room.phase !== 'fighting') return;
    const p = room[player];
    if (!p || p.action !== null) return;
    if (!isValidAction(action, p)) { socket.emit('error', 'Ação inválida ou recursos insuficientes.'); return; }
    p.action = action;
    if (room.isVsBot && room.p2.action === null) room.p2.action = botAction(room, room.p2, room.p1);
    if (room.p1.action !== null && room.p2.action !== null) {
      const log = processRound(room);
      room.log = [...room.log, `━━ Round ${room.round} ━━`, ...log].slice(-80);
      const dead1 = room.p1.hp <= 0, dead2 = room.p2.hp <= 0;
      if (dead1 || dead2) {
        room.phase  = 'ended';
        room.winner = dead1 && dead2 ? 'draw' : dead2 ? 'p1' : 'p2';
      } else {
        room.round++;
      }
    }
    io.to(roomId).emit('state', sanitize(room));
  });
});

function isValidAction(action, player) {
  if (!action || typeof action !== 'string') return false;
  if (action.startsWith('magia:')) {
    const id = action.split(':')[1]?.trim();
    if (!SPELLS[id]) return false;
    const cost = Math.max(0, SPELLS[id].cost - (player.manaCostReduction || 0));
    if (player.mana < cost)                   return false;
    if ((player.spellCooldowns[id] || 0) > 0) return false;
  }
  const VALID = ['ataque leve','ataque pesado','defesa','esquiva','contra-ataque','break guard','focus','usar item','ultimate'];
  if (!action.startsWith('magia:') && !VALID.includes(action)) return false;
  return true;
}

function tickEffects(p, log, name) {
  for (const eff of p.effects) {
    if (eff.type === '🔥 Queimadura') { const dmg = rand(4, 7); p.hp -= dmg; log.push(`🔥 ${name} queimadura! -${dmg} HP`); }
    if (eff.type === '☠️ Veneno')     { const dmg = rand(5, 9); p.hp -= dmg; log.push(`☠️ ${name} veneno! -${dmg} HP`); }
    eff.rounds--;
  }
  p.effects = p.effects.filter(e => e.rounds > 0);
}

function tickCooldowns(p) {
  for (const k of Object.keys(p.spellCooldowns)) {
    p.spellCooldowns[k]--;
    if (p.spellCooldowns[k] <= 0) delete p.spellCooldowns[k];
  }
}

function processRound(room) {
  const { p1, p2 } = room;
  const log  = [];
  const n1   = p1.isBot ? 'Sentinel' : 'P1';
  const n2   = p2.isBot ? 'Sentinel' : 'P2';
  const act1 = p1.action;
  const act2 = p2.action;
  p1.defending = false; p2.defending = false;
  let dodge1 = false, dodge2 = false;

  // Bloqueia ação se congelado/atordoado
  const isStunned = p => hasEffect(p, '🧊 Congelado') || hasEffect(p, '⚡ Stun');

  const resolvePassive = (actor, action, aName) => {
    if (isStunned(actor)) { log.push(`🚫 ${aName} está impedido de agir!`); return; }
    if (action === 'defesa') {
      actor.defending = true;
      log.push(`🛡️ ${aName} em postura defensiva! (-50% dano)`);
    } else if (action === 'esquiva') {
      if (hasEffect(actor, '⛓️ Correntes')) { log.push(`⛓️ ${aName} está preso! Não pode esquivar!`); }
      else if (chance(40 + (actor.dodgeBonus || 0))) {
        if (actor === p1) dodge1 = true; else dodge2 = true;
        log.push(`💨 ${aName} se prepara para esquivar!`);
      } else { log.push(`💨 ${aName} tentou esquivar mas falhou!`); }
    } else if (action === 'focus') {
      const mGain = rand(15, 25), eGain = rand(10, 20);
      actor.mana   = clamp(actor.mana   + mGain, 0, actor.maxMana);
      actor.energy = clamp(actor.energy + eGain, 0, actor.maxEnergy);
      log.push(`🧘 ${aName} foca! +${mGain} Mana, +${eGain} ⚡`);
    } else if (action === 'usar item') {
      if (actor.potions > 0) {
        const heal = rand(30, 45);
        actor.hp = clamp(actor.hp + heal, 0, actor.maxHp);
        actor.potions--;
        log.push(`🧪 ${aName} usa poção! +${heal} HP (${actor.potions} restante(s))`);
      } else { log.push(`🧪 ${aName} não tem poções!`); }
    }
  };

  resolvePassive(p1, act1, n1);
  resolvePassive(p2, act2, n2);

  // FIX: aplica dmgBonus e ultimatePowerBonus da relíquia
  const applyDamage = (target, rawDmg, attackerName, targetName, logMsg) => {
    if (isStunned(target)) {} // alvo congelado/stunado ainda sofre dano
    let dmg = rawDmg;
    const shieldEff = target.effects.find(e => e.type === '🛡️ Escudo Mágico' && e.rounds > 0);
    if (shieldEff) {
      dmg = Math.ceil(dmg * (1 - shieldEff.value));
    } else if (target.defending) {
      dmg = Math.ceil(dmg * 0.5);
    } else if ((target.damageReduction || 0) > 0) {
      // FIX: relíquia de redução de dano
      dmg = Math.ceil(dmg * (1 - target.damageReduction));
      log.push(`🌑 ${targetName} relíquia absorve parte do dano!`);
    }
    const dodged = (target === p1 && dodge1) || (target === p2 && dodge2);
    if (dodged) { log.push(`💨 ${targetName} esquiva do ataque!`); return; }
    dmg = Math.max(1, dmg);
    target.hp -= dmg;
    log.push(logMsg.replace('{DMG}', dmg));
  };

  const resolveOffensive = (actor, target, action, aName, dName) => {
    if (isStunned(actor)) return; // já logado em resolvePassive
    const furyBonus   = hasEffect(actor, '😤 Fúria')   ? 10 : 0;
    const weaknessPen = hasEffect(actor, '💫 Fraqueza') ?  8 : 0;
    const dmgPlus     = actor.dmgBonus || 0;   // FIX: bônus da relíquia

    if (action === 'ataque leve') {
      const base = rand(8, 15) + furyBonus - weaknessPen + dmgPlus;
      applyDamage(target, base, aName, dName, `⚔️ ${aName} ataque leve em ${dName}! -{DMG} HP`);
      actor.ultimate = clamp(actor.ultimate + 5, 0, 100);

    } else if (action === 'ataque pesado') {
      if (actor.energy < 15) { log.push(`💢 ${aName} sem energia!`); return; }
      actor.energy -= 15;
      const base = rand(20, 32) + furyBonus - weaknessPen + dmgPlus;
      applyDamage(target, base, aName, dName, `💢 ${aName} ataque pesado em ${dName}! -{DMG} HP`);
      actor.ultimate = clamp(actor.ultimate + 8, 0, 100);

    } else if (action === 'contra-ataque') {
      if (actor.energy < 20) { log.push(`↩️ ${aName} sem energia!`); return; }
      actor.energy -= 20;
      const base  = rand(10, 18) + furyBonus - weaknessPen + dmgPlus;
      const bonus = ['ataque leve','ataque pesado'].includes(target.action) ? rand(5, 10) : 0;
      applyDamage(target, base + bonus, aName, dName,
        `↩️ ${aName} contra-ataca ${dName}!${bonus ? ` (COUNTER +${bonus})` : ''} -{DMG} HP`);
      actor.ultimate = clamp(actor.ultimate + 6, 0, 100);

    } else if (action === 'break guard') {
      if (actor.energy < 25) { log.push(`🔨 ${aName} sem energia!`); return; }
      actor.energy -= 25;
      const savedDef = target.defending;
      target.defending = false;
      const base = rand(12, 20) + furyBonus - weaknessPen + dmgPlus;
      applyDamage(target, base, aName, dName,
        `🔨 ${aName} quebra a guarda de ${dName}! -{DMG} HP${savedDef ? ' (GUARD QUEBRADO!)' : ''}`);
      actor.ultimate = clamp(actor.ultimate + 7, 0, 100);

    } else if (action === 'ultimate') {
      if (actor.ultimate < 100) { log.push(`✨ ${aName} ultimate não carregado!`); return; }
      // FIX: aplica ultimatePowerBonus da relíquia
      const base = rand(45, 65 + (actor.ultimatePowerBonus || 0));
      applyDamage(target, base, aName, dName, `✨✨ ${aName} ULTIMATE em ${dName}! -{DMG} HP`);
      actor.ultimate = 0;

    } else if (action.startsWith('magia:')) {
      const spellId = action.split(':')[1]?.trim();
      processSpell(actor, target, spellId, aName, dName, log);
    }
  };

  resolveOffensive(p1, p2, act1, n1, n2);
  resolveOffensive(p2, p1, act2, n2, n1);

  // Regen de energia
  p1.energy = clamp(p1.energy + rand(8, 12), 0, p1.maxEnergy);
  p2.energy = clamp(p2.energy + rand(8, 12), 0, p2.maxEnergy);

  // FIX: regen por round da relíquia
  if ((p1.regenPerRound || 0) > 0 && p1.hp > 0) {
    p1.hp = clamp(p1.hp + p1.regenPerRound, 0, p1.maxHp);
    log.push(`💚 ${n1} regenera +${p1.regenPerRound} HP (relíquia) → ${p1.hp}/${p1.maxHp}`);
  }
  if ((p2.regenPerRound || 0) > 0 && p2.hp > 0) {
    p2.hp = clamp(p2.hp + p2.regenPerRound, 0, p2.maxHp);
    log.push(`💚 ${n2} regenera +${p2.regenPerRound} HP (relíquia) → ${p2.hp}/${p2.maxHp}`);
  }

  tickEffects(p1, log, n1);
  tickEffects(p2, log, n2);
  tickCooldowns(p1);
  tickCooldowns(p2);

  p1.action = null; p2.action = null;
  return log;
}

// ─── FEITIÇOS ─────────────────────────────────────────────────────────────────
function processSpell(caster, target, spellId, aName, dName, log) {
  if (!SPELLS[spellId]) { log.push(`🔮 ${aName} feitiço inválido!`); return; }
  if (hasEffect(caster, '🔇 Silêncio')) { log.push(`🔇 ${aName} silenciado! Não pode usar feitiços!`); return; }
  const spell = SPELLS[spellId];
  const cost  = Math.max(0, spell.cost - (caster.manaCostReduction || 0));
  if (caster.mana < cost) { log.push(`🔮 ${aName} sem mana!`); return; }
  caster.mana -= cost;
  caster.spellCooldowns[spellId] = spell.cd;

  // FIX: aplica spellPowerBonus da relíquia em todos os feitiços de dano
  const spellPower = caster.spellPowerBonus || 0;

  switch (spellId) {
    case 'bola_de_fogo': {
      const dmg = rand(20, 30) + spellPower;
      target.hp -= dmg;
      addEffect(target, '🔥 Queimadura', 2);
      log.push(`🔥 ${aName} Bola de Fogo em ${dName}! -${dmg} HP + Queimadura 2r`);
      break;
    }
    case 'raio': {
      const dmg = rand(25, 40) + spellPower;
      target.hp -= dmg;
      addEffect(target, '⚡ Stun', 1);
      log.push(`⚡ ${aName} Raio em ${dName}! -${dmg} HP + Stun 1r (cd: 2 rounds)`);
      break;
    }
    case 'gelo': {
      const dmg = rand(15, 22) + spellPower;
      target.hp -= dmg;
      addEffect(target, '🧊 Congelado', 2);
      log.push(`🧊 ${aName} Tempestade de Gelo em ${dName}! -${dmg} HP + Congelado 2r (cd: 4 rounds)`);
      break;
    }
    case 'veneno': {
      const dmg = rand(8, 12) + spellPower;
      target.hp -= dmg;
      addEffect(target, '☠️ Veneno', 3);
      log.push(`☠️ ${aName} Veneno em ${dName}! -${dmg} HP + Veneno 3r`);
      break;
    }
    case 'cura': {
      const heal = rand(30, 45) + Math.floor(spellPower * 0.5);
      caster.hp = clamp(caster.hp + heal, 0, caster.maxHp);
      log.push(`💚 ${aName} Cura Divina! +${heal} HP`);
      break;
    }
    case 'escudo_magico':
      addEffect(caster, '🛡️ Escudo Mágico', 2, 0.7);
      log.push(`🛡️ ${aName} ativa Escudo Mágico! -70% dano 2r`);
      break;
    case 'furia':
      addEffect(caster, '😤 Fúria', 2);
      log.push(`😤 ${aName} entra em Fúria! +10 dano 2r`);
      break;
    case 'fraqueza':
      addEffect(target, '💫 Fraqueza', 2);
      log.push(`💫 ${aName} aplica Fraqueza em ${dName}! -8 dano 2r`);
      break;
    case 'silencio':
      addEffect(target, '🔇 Silêncio', 2);
      log.push(`🔇 ${aName} silencia ${dName}! Feitiços bloqueados 2r`);
      break;
    case 'correntes': {
      const dmg = rand(5, 10) + spellPower;
      target.hp -= dmg;
      addEffect(target, '⛓️ Correntes', 2);
      log.push(`⛓️ ${aName} prende ${dName}! -${dmg} HP + Esquiva bloqueada 2r`);
      break;
    }
  }
  caster.ultimate = clamp(caster.ultimate + 10, 0, 100);
}

// ─── IA DO BOT ────────────────────────────────────────────────────────────────
function botAction(room, bot, enemy) {
  const diff      = room.difficulty;
  const notSilent = !hasEffect(bot, '🔇 Silêncio');
  const canSpell  = id => (bot.spellCooldowns[id] || 0) === 0 &&
                           bot.mana >= Math.max(0, (SPELLS[id]?.cost || 99) - (bot.manaCostReduction || 0));

  if (diff === 'easy') {
    if (bot.hp < 30 && bot.potions > 0) return 'usar item';
    if (chance(20)) return 'defesa';
    return chance(70) ? 'ataque leve' : 'esquiva';
  }
  if (diff === 'hard') {
    if (bot.hp < 40 && bot.potions > 0) return 'usar item';
    if (bot.ultimate >= 100) return 'ultimate';
    if (notSilent && chance(50)) {
      const avail = ['raio','bola_de_fogo','veneno','correntes','fraqueza'].filter(canSpell);
      if (avail.length) return `magia: ${avail[Math.floor(Math.random() * avail.length)]}`;
    }
    if (notSilent && bot.hp < 60 && canSpell('cura'))          return 'magia: cura';
    if (notSilent && bot.hp < 80 && canSpell('escudo_magico')) return 'magia: escudo_magico';
    if (bot.energy >= 25 && chance(30)) return 'break guard';
    if (bot.energy >= 15 && chance(50)) return 'ataque pesado';
    if (chance(15)) return 'contra-ataque';
    return chance(25) ? 'defesa' : 'ataque leve';
  }
  // medium
  if (bot.hp < 35 && bot.potions > 0) return 'usar item';
  if (bot.ultimate >= 100) return 'ultimate';
  if (notSilent && bot.hp < 50 && canSpell('cura') && chance(60))         return 'magia: cura';
  if (notSilent && canSpell('bola_de_fogo') && chance(30))                 return 'magia: bola_de_fogo';
  if (bot.energy >= 15 && chance(40)) return 'ataque pesado';
  if (chance(20)) return 'defesa';
  return 'ataque leve';
}

// ─── SANITIZE — FIX: inclui todos os campos de bônus de relíquia ─────────────
function sanitize(room) {
  const sp = p => ({
    hp:                 Math.max(0, p.hp),
    maxHp:              p.maxHp,
    mana:               Math.max(0, p.mana),
    maxMana:            p.maxMana,
    energy:             Math.max(0, p.energy || 0),
    maxEnergy:          p.maxEnergy,
    potions:            p.potions,
    effects:            p.effects.filter(e => e.rounds > 0),
    ultimate:           clamp(p.ultimate || 0, 0, 100),
    action:             p.action,
    isBot:              p.isBot || false,
    spellCooldowns:     p.spellCooldowns || {},
    manaCostReduction:  p.manaCostReduction  || 0,
    dmgBonus:           p.dmgBonus           || 0,
    dodgeBonus:         p.dodgeBonus         || 0,
    damageReduction:    p.damageReduction    || 0,
    regenPerRound:      p.regenPerRound      || 0,
    spellPowerBonus:    p.spellPowerBonus    || 0,
    ultimatePowerBonus: p.ultimatePowerBonus || 0,
  });
  return {
    phase:   room.phase,
    round:   room.round,
    isVsBot: room.isVsBot,
    winner:  room.winner,
    log:     room.log.slice(-60),
    p1:      sp(room.p1),
    p2:      sp(room.p2),
  };
}

server.listen(process.env.PORT || 3000, () =>
  console.log('🎮 Game server online na porta', process.env.PORT || 3000)
);
