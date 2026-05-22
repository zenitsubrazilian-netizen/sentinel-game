'use strict';

// ============================================================
// DUEL LOGIC v4.0 — Sistema de turnos estratégico
// Modo retrato, sem escolha de personagem, matchmaking auto
// ============================================================

const rooms = new Map();

const genId  = () => Math.random().toString(36).substr(2, 8).toUpperCase();
const clamp  = (v, mn, mx) => Math.max(mn, Math.min(mx, v));
const rand   = (a, b) => Math.floor(Math.random() * (b - a + 1)) + a;
const chance = p => Math.random() < p;

const MAX_HP       = 200;
const MAX_MANA     = 120;
const MAX_ENERGY   = 100;
const MAX_POTIONS  = 3;
const TURN_TIMEOUT = 60000; // 60s por turno

// ─── DEFINIÇÃO DE AÇÕES ───────────────────────────────────────
const ACTIONS = {
  // ── Físicas
  ataque_leve:    { type:'physical', label:'⚔️ Ataque Leve',    energyCost:0,  manaCost:0,  dmgMin:12, dmgMax:22, accuracy:0.95, cd:0, desc:'Rápido e preciso' },
  ataque_pesado:  { type:'physical', label:'💢 Ataque Pesado',   energyCost:20, manaCost:0,  dmgMin:28, dmgMax:45, accuracy:0.70, cd:0, desc:'Alto dano, pode errar' },
  investida:      { type:'physical', label:'🏃 Investida',       energyCost:15, manaCost:0,  dmgMin:18, dmgMax:30, accuracy:0.85, cd:1, desc:'Chance de crítico 30%', critBonus:0.30 },
  quebrar_defesa: { type:'physical', label:'🔨 Quebrar Defesa',  energyCost:25, manaCost:0,  dmgMin:15, dmgMax:25, accuracy:0.80, cd:2, desc:'Reduz defesa do inimigo 2 rounds' },
  // ── Reativas
  defender:       { type:'reactive', label:'🛡️ Defender',        energyCost:0,  manaCost:0,  cd:0, desc:'Reduz 60% dano + recupera 8 energia' },
  esquiva:        { type:'reactive', label:'💨 Esquiva',          energyCost:10, manaCost:0,  cd:0, desc:'70% chance de evitar dano' },
  contra_ataque:  { type:'reactive', label:'↩️ Contra-ataque',   energyCost:20, manaCost:0,  dmgMin:10, dmgMax:20, cd:1, desc:'Bloqueia + rebate se atacado' },
  // ── Utilitário
  concentrar:     { type:'utility',  label:'🧘 Concentrar',      energyCost:0,  manaCost:0,  cd:0, desc:'Recupera 30 mana + 15 energia' },
  usar_pocao:     { type:'utility',  label:'🧪 Poção',           energyCost:0,  manaCost:0,  cd:0, desc:'Recupera 60-80 HP' },
  provocar:       { type:'utility',  label:'😤 Provocar',        energyCost:5,  manaCost:0,  cd:3, desc:'Inimigo -25% precisão por 2 rounds' },
  // ── Magias
  cura:           { type:'spell',    label:'💚 Cura',            energyCost:0,  manaCost:35, cd:2, desc:'Recupera 50-70 HP' },
  bola_de_fogo:   { type:'spell',    label:'🔥 Bola de Fogo',    energyCost:0,  manaCost:25, dmgMin:22, dmgMax:35, cd:1, desc:'Dano médio + queimadura 2r' },
  raio:           { type:'spell',    label:'⚡ Raio',            energyCost:0,  manaCost:35, dmgMin:35, dmgMax:55, cd:2, desc:'Alto dano + chance crítico 25%', critBonus:0.25 },
  gelo:           { type:'spell',    label:'🧊 Tempestade Gelo', energyCost:0,  manaCost:30, dmgMin:20, dmgMax:32, cd:3, desc:'Dano + congela 1 round' },
  veneno:         { type:'spell',    label:'☠️ Veneno',          energyCost:0,  manaCost:20, dmgMin:8,  dmgMax:14, cd:2, desc:'Dano + veneno 3 rounds' },
  escudo_magico:  { type:'spell',    label:'🛡️ Escudo Mágico',   energyCost:0,  manaCost:28, cd:3, desc:'Absorve próximos 50 de dano' },
  tornado:        { type:'spell',    label:'🌪️ Tornado',         energyCost:0,  manaCost:30, cd:3, desc:'50% chance cancelar ação inimiga' },
  sombra:         { type:'spell',    label:'🌑 Sombra',          energyCost:0,  manaCost:22, cd:2, desc:'+40% esquiva por 2 rounds' },
  explosao_arcana:{ type:'spell',    label:'💥 Explosão Arcana', energyCost:0,  manaCost:60, dmgMin:60, dmgMax:90, cd:4, desc:'Dano extremo, gasta muita mana' },
  prisao_gelo:    { type:'spell',    label:'❄️ Prisão de Gelo',  energyCost:0,  manaCost:40, dmgMin:15, dmgMax:22, cd:4, desc:'Imobiliza inimigo 1 round' },
  maldicao:       { type:'spell',    label:'🔮 Maldição',        energyCost:0,  manaCost:25, cd:3, desc:'Inimigo -30% dano por 3 rounds' },
  vampirismo:     { type:'spell',    label:'🩸 Vampirismo',      energyCost:0,  manaCost:32, dmgMin:20, dmgMax:32, cd:3, desc:'Rouba vida do adversário' },
};

const PHYSICAL_ACTIONS = ['ataque_leve','ataque_pesado','investida','quebrar_defesa'];
const SPELL_ACTIONS    = Object.keys(ACTIONS).filter(k => ACTIONS[k].type === 'spell');

// ─── PLAYER FACTORY ──────────────────────────────────────────
function makePlayer(slot, jid, bonus) {
  const b = bonus || {};
  return {
    slot, jid,
    hp:      MAX_HP  + (Number(b.maxHpBonus)   || 0),
    maxHp:   MAX_HP  + (Number(b.maxHpBonus)   || 0),
    mana:    MAX_MANA + (Number(b.maxManaBonus) || 0),
    maxMana: MAX_MANA + (Number(b.maxManaBonus) || 0),
    energy:  MAX_ENERGY,
    maxEnergy: MAX_ENERGY,
    potions: MAX_POTIONS + (Number(b.extraPotions) || 0),
    action:  null,
    effects: [],         // { type, rounds, value }
    shield:  0,          // escudo mágico HP
    cooldowns: {},       // { actionId: rounds }
    dmgBonus:  Number(b.dmgBonus)         || 0,
    dodgeBonus:Number(b.dodgeBonus)       || 0,
    dmgReduction: Number(b.damageReduction) || 0,
    regenPerRound: Number(b.regenPerRound) || 0,
    lastAction: null,
    ready: false,
    connected: false,
  };
}

// ─── ROOM FACTORY ────────────────────────────────────────────
function makeRoom(roomId, p1Jid, p2Jid, p1Bonus, p2Bonus, isVsBot, difficulty) {
  return {
    id: roomId,
    phase: 'waiting',   // waiting → fight → ended
    round: 1,
    isVsBot: !!isVsBot,
    difficulty: difficulty || 'medium',
    p1: makePlayer('p1', p1Jid,          p1Bonus || {}),
    p2: makePlayer('p2', p2Jid || 'bot', p2Bonus || {}),
    log: [],            // histórico de ações
    winner: null,
    _io: null,
    turnTimer: null,
    createdAt: Date.now(),
    sockets: { p1: null, p2: null },
  };
}

// ─── EFEITOS ─────────────────────────────────────────────────
function hasEffect(p, type) { return p.effects.some(e => e.type === type && e.rounds > 0); }
function addEffect(p, type, rounds, value) {
  p.effects = p.effects.filter(e => e.type !== type);
  p.effects.push({ type, rounds, value: value || 0 });
}
function removeEffect(p, type) { p.effects = p.effects.filter(e => e.type !== type); }
function tickEffects(p) {
  const events = [];
  for (const eff of p.effects) {
    if (eff.type === 'burning')  { const d = rand(8,14);  p.hp = Math.max(0, p.hp-d); events.push({ type:'dot', target:p.slot, dmg:d, label:'🔥 Queimadura' }); }
    if (eff.type === 'poison')   { const d = rand(6,12);  p.hp = Math.max(0, p.hp-d); events.push({ type:'dot', target:p.slot, dmg:d, label:'☠️ Veneno' }); }
    if (eff.type === 'regen')    { const h = rand(10,18); p.hp = clamp(p.hp+h, 0, p.maxHp); events.push({ type:'heal', target:p.slot, val:h, label:'💚 Regen' }); }
    eff.rounds--;
  }
  p.effects = p.effects.filter(e => e.rounds > 0);
  return events;
}
function tickCooldowns(p) {
  for (const k of Object.keys(p.cooldowns)) {
    p.cooldowns[k]--;
    if (p.cooldowns[k] <= 0) delete p.cooldowns[k];
  }
  // regen passivo de energia
  p.energy = clamp(p.energy + 8, 0, p.maxEnergy);
  if (p.regenPerRound > 0 && p.hp > 0) p.hp = clamp(p.hp + p.regenPerRound, 0, p.maxHp);
}

// ─── VALIDAÇÃO DE AÇÃO ────────────────────────────────────────
function canUseAction(p, actionId) {
  const def = ACTIONS[actionId];
  if (!def) return { ok: false, reason: 'Ação inválida' };
  if ((p.cooldowns[actionId] || 0) > 0) return { ok: false, reason: `Em cooldown (${p.cooldowns[actionId]}r)` };
  if (actionId === 'usar_pocao' && p.potions <= 0) return { ok: false, reason: 'Sem poções' };
  if (p.energy < def.energyCost) return { ok: false, reason: 'Sem energia' };
  if (p.mana   < def.manaCost)   return { ok: false, reason: 'Sem mana' };
  if (hasEffect(p, 'frozen') || hasEffect(p, 'stunned')) return { ok: false, reason: 'Imobilizado!' };
  return { ok: true };
}

// ─── PROCESSAR ROUND ─────────────────────────────────────────
function processRound(room) {
  const p1 = room.p1, p2 = room.p2;
  const events = [];

  // 1. DOT e regen de efeitos
  events.push(...tickEffects(p1));
  events.push(...tickEffects(p2));

  // 2. Verifica se alguém morreu com DOT
  if (p1.hp <= 0 || p2.hp <= 0) return finalizeRound(room, events);

  // 3. Verifica tornado (cancela ação)
  if (hasEffect(p1, 'tornado_target') && chance(0.5)) {
    events.push({ type:'cancel', target:'p1', label:'🌪️ Tornado cancelou ação de P1!' });
    p1.action = 'defender';
    removeEffect(p1, 'tornado_target');
  }
  if (hasEffect(p2, 'tornado_target') && chance(0.5)) {
    events.push({ type:'cancel', target:'p2', label:'🌪️ Tornado cancelou ação de P2!' });
    p2.action = 'defender';
    removeEffect(p2, 'tornado_target');
  }

  // 4. Resolve ações
  const act1 = p1.action || 'defender';
  const act2 = p2.action || 'defender';
  const res1 = resolveAction(p1, p2, act1, act2, events);
  const res2 = resolveAction(p2, p1, act2, act1, events);

  // 5. Aplica danos cruzados com interações
  applyDamage(p2, res1, p1, act2, events);
  applyDamage(p1, res2, p2, act1, events);

  // 6. Cooldowns e energia passiva
  tickCooldowns(p1);
  tickCooldowns(p2);

  // 7. Limpa ações
  p1.lastAction = p1.action; p1.action = null;
  p2.lastAction = p2.action; p2.action = null;

  return finalizeRound(room, events);
}

function resolveAction(actor, target, actId, enemyActId, events) {
  const def = ACTIONS[actId] || ACTIONS['ataque_leve'];
  const result = { actorSlot: actor.slot, actionId: actId, label: def.label,
                   dmg: 0, heal: 0, missed: false, crit: false,
                   shieldSet: 0, manaDrain: 0, effects: [] };

  // Custo
  actor.energy = Math.max(0, actor.energy - def.energyCost);
  actor.mana   = Math.max(0, actor.mana   - def.manaCost);

  // Cooldown
  if (def.cd > 0) actor.cooldowns[actId] = def.cd;

  const isStunned = hasEffect(actor, 'frozen') || hasEffect(actor, 'stunned');
  if (isStunned) { result.missed = true; result.label += ' (IMOBILIZADO)'; return result; }

  // Bônus de maldição sobre atacante
  const dmgMult = hasEffect(actor, 'cursed') ? 0.70 : 1.0;
  // Bônus de provocação sobre atacante
  const accMod  = hasEffect(actor, 'taunted') ? -0.25 : 0;

  switch (def.type) {
    case 'physical': {
      const acc = clamp((def.accuracy || 0.9) + accMod, 0.1, 1);
      if (!chance(acc)) { result.missed = true; break; }
      let dmg = rand(def.dmgMin, def.dmgMax) + (actor.dmgBonus || 0);
      // sinergia: concentrar + magia / veneno + ataque leve
      if (hasEffect(actor, 'focused') && SPELL_ACTIONS.includes(actId)) dmg = Math.floor(dmg * 1.3);
      if (hasEffect(target, 'poison') && actId === 'ataque_leve') dmg += rand(4,8);
      if (hasEffect(actor, 'sombra_buff')) dmg = Math.floor(dmg * 1.2);
      // crítico
      const critChance = (def.critBonus || 0) + (hasEffect(actor, 'focused') ? 0.1 : 0);
      if (chance(critChance)) { dmg = Math.floor(dmg * 1.6); result.crit = true; }
      result.dmg = Math.floor(dmg * dmgMult);
      // efeitos especiais
      if (actId === 'quebrar_defesa') { addEffect(target, 'defense_broken', 2, 0.35); result.effects.push('defense_broken'); }
      if (actId === 'provocar')       { addEffect(target, 'taunted', 2, 0.25);        result.effects.push('taunted'); }
      break;
    }
    case 'reactive': {
      if (actId === 'defender') {
        actor.energy = clamp(actor.energy + 8, 0, actor.maxEnergy);
      }
      if (actId === 'esquiva') {
        const dodgeChance = 0.70 + (actor.dodgeBonus || 0) + (hasEffect(actor, 'sombra_buff') ? 0.4 : 0);
        if (chance(dodgeChance)) result.effects.push('dodging');
      }
      if (actId === 'contra_ataque') {
        result.effects.push('counter');
        // dano de counter será calculado no applyDamage do inimigo
      }
      break;
    }
    case 'utility': {
      if (actId === 'concentrar') {
        const mGain = rand(25, 35), eGain = rand(10, 18);
        actor.mana   = clamp(actor.mana + mGain, 0, actor.maxMana);
        actor.energy = clamp(actor.energy + eGain, 0, actor.maxEnergy);
        addEffect(actor, 'focused', 2, 1);
        result.heal = mGain; // reaproveitamos como "mana ganho"
        events.push({ type:'mana', target:actor.slot, val:mGain, label:`🧘 Concentrou +${mGain} mana` });
      }
      if (actId === 'usar_pocao' && actor.potions > 0) {
        const h = rand(60, 80);
        actor.hp = clamp(actor.hp + h, 0, actor.maxHp);
        actor.potions--;
        result.heal = h;
        events.push({ type:'heal', target:actor.slot, val:h, label:`🧪 Poção +${h} HP` });
      }
      if (actId === 'provocar') {
        addEffect(target, 'taunted', 2, 0.25);
        result.effects.push('taunted');
      }
      break;
    }
    case 'spell': {
      switch (actId) {
        case 'cura': {
          const h = rand(50, 70) + (hasEffect(actor, 'focused') ? 15 : 0);
          actor.hp = clamp(actor.hp + h, 0, actor.maxHp);
          result.heal = h;
          events.push({ type:'heal', target:actor.slot, val:h, label:`💚 Cura +${h} HP` });
          break;
        }
        case 'bola_de_fogo': {
          result.dmg = rand(def.dmgMin, def.dmgMax) + (actor.dmgBonus || 0);
          if (hasEffect(actor, 'focused')) result.dmg = Math.floor(result.dmg * 1.3);
          result.dmg = Math.floor(result.dmg * dmgMult);
          addEffect(target, 'burning', 2);
          result.effects.push('burning');
          break;
        }
        case 'raio': {
          let dmg = rand(def.dmgMin, def.dmgMax) + (actor.dmgBonus || 0);
          if (hasEffect(actor, 'focused')) dmg = Math.floor(dmg * 1.4);
          if (chance((def.critBonus || 0) + 0.15)) { dmg = Math.floor(dmg * 1.7); result.crit = true; }
          result.dmg = Math.floor(dmg * dmgMult);
          break;
        }
        case 'gelo': {
          result.dmg = rand(def.dmgMin, def.dmgMax);
          result.dmg = Math.floor(result.dmg * dmgMult);
          addEffect(target, 'frozen', 1);
          result.effects.push('frozen');
          break;
        }
        case 'veneno': {
          result.dmg = rand(def.dmgMin, def.dmgMax);
          addEffect(target, 'poison', 3, 8);
          result.effects.push('poison');
          break;
        }
        case 'escudo_magico': {
          actor.shield = 50 + (hasEffect(actor, 'focused') ? 20 : 0);
          result.shieldSet = actor.shield;
          events.push({ type:'shield', target:actor.slot, val:actor.shield, label:`🛡️ Escudo +${actor.shield}` });
          break;
        }
        case 'tornado': {
          addEffect(target, 'tornado_target', 1);
          result.effects.push('tornado');
          events.push({ type:'debuff', target:target.slot, label:'🌪️ Tornado aplicado!' });
          break;
        }
        case 'sombra': {
          addEffect(actor, 'sombra_buff', 2);
          result.effects.push('sombra');
          events.push({ type:'buff', target:actor.slot, label:'🌑 Sombra: +40% esquiva 2r' });
          break;
        }
        case 'explosao_arcana': {
          let dmg = rand(def.dmgMin, def.dmgMax) + (actor.dmgBonus || 0);
          if (hasEffect(actor, 'focused')) dmg = Math.floor(dmg * 1.5);
          result.dmg = Math.floor(dmg * dmgMult);
          result.crit = chance(0.2);
          if (result.crit) result.dmg = Math.floor(result.dmg * 1.5);
          break;
        }
        case 'prisao_gelo': {
          result.dmg = rand(def.dmgMin, def.dmgMax);
          addEffect(target, 'stunned', 1);
          result.effects.push('stunned');
          break;
        }
        case 'maldicao': {
          addEffect(target, 'cursed', 3, 0.30);
          result.effects.push('cursed');
          events.push({ type:'debuff', target:target.slot, label:'🔮 Maldição: -30% dano 3r' });
          break;
        }
        case 'vampirismo': {
          let dmg = rand(def.dmgMin, def.dmgMax);
          result.dmg = dmg;
          const stolen = Math.floor(dmg * 0.6);
          actor.hp = clamp(actor.hp + stolen, 0, actor.maxHp);
          result.heal = stolen;
          events.push({ type:'heal', target:actor.slot, val:stolen, label:`🩸 Vampirismo +${stolen} HP` });
          break;
        }
      }
      // consome 'focused' após usar magia
      if (hasEffect(actor, 'focused')) removeEffect(actor, 'focused');
      break;
    }
  }

  return result;
}

function applyDamage(target, attackResult, attacker, targetActionId, events) {
  let dmg = attackResult.dmg || 0;
  if (dmg <= 0) return;

  // Esquiva
  if (targetActionId === 'esquiva') {
    const dodgeChance = 0.70 + (target.dodgeBonus || 0) + (hasEffect(target, 'sombra_buff') ? 0.4 : 0);
    if (chance(dodgeChance)) {
      events.push({ type:'dodge', target:target.slot, label:'💨 Esquivou!' });
      return;
    }
  }

  // Contra-ataque
  const isCountering = targetActionId === 'contra_ataque';
  if (isCountering && PHYSICAL_ACTIONS.includes(attackResult.actionId)) {
    dmg = Math.floor(dmg * 0.5);
    const counterDmg = rand(12, 22) + (target.dmgBonus || 0);
    attacker.hp = Math.max(0, attacker.hp - counterDmg);
    events.push({ type:'counter', target:attacker.slot, dmg:counterDmg, label:`↩️ Contra-ataque ${counterDmg} dano!` });
  }

  // Sinergia Defender + Contra-ataque
  if (isCountering && targetActionId === 'defender') dmg = Math.floor(dmg * 0.3);

  // Defender
  const isDefending = targetActionId === 'defender';
  if (isDefending) dmg = Math.floor(dmg * 0.40);

  // Defense broken
  if (isDefending && hasEffect(target, 'defense_broken')) dmg = Math.floor(dmg * 1.5);

  // Escudo mágico
  if (target.shield > 0) {
    const absorbed = Math.min(target.shield, dmg);
    target.shield -= absorbed;
    dmg -= absorbed;
    events.push({ type:'absorb', target:target.slot, val:absorbed, label:`🛡️ Absorveu ${absorbed}` });
  }

  // Redução de dano (relíquia)
  if (target.dmgReduction > 0 && dmg > 0) {
    const reduced = Math.floor(dmg * (1 - target.dmgReduction));
    dmg = reduced;
  }

  dmg = Math.max(dmg > 0 ? 1 : 0, dmg);
  if (dmg <= 0) return;

  target.hp = Math.max(0, target.hp - dmg);

  const label = attackResult.crit
    ? `💥 CRÍTICO! ${attackResult.label} → ${dmg} dano!`
    : `${attackResult.label} → ${dmg} dano`;

  events.push({
    type: attackResult.crit ? 'crit' : 'damage',
    target: target.slot,
    dmg,
    label,
    actionId: attackResult.actionId,
  });
}

function finalizeRound(room, events) {
  const p1 = room.p1, p2 = room.p2;
  p1.hp = clamp(p1.hp, 0, p1.maxHp);
  p2.hp = clamp(p2.hp, 0, p2.maxHp);

  const p1Dead = p1.hp <= 0, p2Dead = p2.hp <= 0;
  const ended  = p1Dead || p2Dead;

  if (ended) {
    room.phase  = 'ended';
    room.winner = (p1Dead && p2Dead) ? 'draw' : (p2Dead ? 'p1' : 'p2');
    if (room.turnTimer) { clearTimeout(room.turnTimer); room.turnTimer = null; }
  } else {
    room.round++;
  }

  return { events, ended, winner: room.winner, round: room.round };
}

// ─── IA DO BOT ───────────────────────────────────────────────
function botChooseAction(room) {
  const bot   = room.p2, enemy = room.p1;
  const diff  = room.difficulty;

  const available = Object.keys(ACTIONS).filter(id => {
    const c = canUseAction(bot, id);
    return c.ok;
  });

  if (diff === 'easy') {
    const pool = available.filter(a => ['ataque_leve','ataque_pesado','defender','usar_pocao'].includes(a));
    return pool[rand(0, pool.length-1)] || 'ataque_leve';
  }

  if (bot.hp < 50 && bot.potions > 0 && available.includes('usar_pocao')) return 'usar_pocao';
  if (bot.hp < 80 && bot.mana >= 35 && available.includes('cura')) return 'cura';
  if (bot.shield === 0 && bot.mana >= 28 && available.includes('escudo_magico') && diff === 'hard') return 'escudo_magico';
  if (bot.mana < 30 && available.includes('concentrar')) return 'concentrar';

  if (diff === 'hard') {
    if (available.includes('explosao_arcana') && bot.mana >= 60) return 'explosao_arcana';
    if (available.includes('raio')            && bot.mana >= 35) return 'raio';
    if (available.includes('maldicao')        && bot.mana >= 25) return 'maldicao';
    if (available.includes('veneno')          && bot.mana >= 20) return 'veneno';
    if (available.includes('prisao_gelo')     && bot.mana >= 40) return 'prisao_gelo';
  }

  const spells = available.filter(a => ACTIONS[a].type === 'spell' && a !== 'cura');
  if (spells.length && chance(0.45)) return spells[rand(0, spells.length-1)];

  const physical = available.filter(a => ACTIONS[a].type === 'physical');
  return physical[rand(0, physical.length-1)] || 'ataque_leve';
}

// ─── SANITIZE ────────────────────────────────────────────────
function sanitize(room) {
  const sp = p => ({
    slot:       p.slot,
    hp:         Math.max(0, Math.round(p.hp)),
    maxHp:      p.maxHp,
    mana:       Math.max(0, Math.round(p.mana)),
    maxMana:    p.maxMana,
    energy:     Math.max(0, Math.round(p.energy)),
    maxEnergy:  p.maxEnergy,
    potions:    p.potions,
    shield:     Math.max(0, Math.round(p.shield)),
    effects:    p.effects.filter(e => e.rounds > 0).map(e => ({ type:e.type, rounds:e.rounds })),
    cooldowns:  { ...p.cooldowns },
    lastAction: p.lastAction,
    action:     p.action ? '✓' : null,  // não revela a ação ao inimigo
    ready:      p.ready,
    connected:  p.connected,
  });
  return {
    phase:   room.phase,
    round:   room.round,
    isVsBot: room.isVsBot,
    winner:  room.winner,
    p1:      sp(room.p1),
    p2:      sp(room.p2),
  };
}

// ─── TURN TIMER ──────────────────────────────────────────────
function startTurnTimer(room, io) {
  if (room.turnTimer) clearTimeout(room.turnTimer);
  room.turnTimer = setTimeout(() => {
    if (room.phase !== 'fight') return;
    // Força ação padrão para quem não agiu
    if (!room.p1.action) room.p1.action = 'defender';
    if (!room.p2.action) room.p2.action = 'defender';
    executeRound(room, io);
  }, TURN_TIMEOUT);
}

function executeRound(room, io) {
  if (room.phase !== 'fight') return;
  if (room.turnTimer) { clearTimeout(room.turnTimer); room.turnTimer = null; }

  if (room.isVsBot && !room.p2.action) room.p2.action = botChooseAction(room);

  const result = processRound(room);

  io.to(room.id).emit('round_result', {
    events:  result.events,
    ended:   result.ended,
    winner:  result.winner,
    state:   sanitize(room),
  });

  if (!result.ended) startTurnTimer(room, io);
}

// ─── SETUP ROTAS ─────────────────────────────────────────────
function setupRoutes(app) {
  app.get('/duel/room/:roomId/result', (req, res) => {
    const room = rooms.get(req.params.roomId);
    if (!room) return res.status(404).json({ error: 'not_found' });
    if (room.phase !== 'ended') return res.json({ ended: false });
    return res.json({
      ended:   true,
      winner:  room.winner,
      p1Jid:   room.p1.jid,
      p2Jid:   room.p2.jid,
      p1IsBot: false,
      p2IsBot: room.isVsBot,
    });
  });

  app.post('/duel/room', (req, res) => {
    const { p1Jid, p2Jid, isVsBot, difficulty, p1Bonus, p2Bonus } = req.body;
    if (!p1Jid) return res.status(400).json({ error: 'p1Jid obrigatório' });
    const roomId = genId();
    const room   = makeRoom(roomId, p1Jid, p2Jid, p1Bonus, p2Bonus, isVsBot, difficulty);
    rooms.set(roomId, room);
    // TTL 30 min
    setTimeout(() => {
      const r = rooms.get(roomId);
      if (r && r.turnTimer) clearTimeout(r.turnTimer);
      rooms.delete(roomId);
    }, 30 * 60_000);
    console.log(`[DUEL] Sala criada: ${roomId} | vsBot:${isVsBot} | diff:${difficulty}`);
    res.json({ roomId });
  });
}

// ─── SETUP SOCKET ────────────────────────────────────────────
function setupSocket(io) {
  io.on('connection', socket => {

    socket.on('duel_join', ({ roomId, slot }) => {
      const room = rooms.get(roomId);
      if (!room) { socket.emit('duel_error', 'Sala não encontrada.'); return; }

      socket.join(roomId);
      room.sockets[slot] = socket.id;
      room._io = io;

      const p = room[slot];
      if (p) { p.connected = true; p.ready = true; }

      console.log(`[DUEL] join | slot:${slot} | room:${roomId}`);

      // Notifica o jogador do estado atual
      socket.emit('duel_state', sanitize(room));

      // Verifica se ambos estão conectados para iniciar
      const p1Ok = room.p1.connected;
      const p2Ok = room.isVsBot ? true : room.p2.connected;

      if (p1Ok && p2Ok && room.phase === 'waiting') {
        room.phase = 'fight';
        if (room.isVsBot) { room.p2.connected = true; room.p2.ready = true; }

        // Pequeno delay dramático
        setTimeout(() => {
          io.to(roomId).emit('duel_start', sanitize(room));
          startTurnTimer(room, io);
        }, 1500);
      } else if (room.phase === 'waiting') {
        socket.emit('duel_waiting', { msg: 'Esperando adversário...' });
        // Notifica o outro jogador se já estiver na sala
        socket.to(roomId).emit('duel_opponent_joined');
      }
    });

    socket.on('duel_action', ({ roomId, slot, actionId }) => {
      const room = rooms.get(roomId);
      if (!room || room.phase !== 'fight') return;

      const p = room[slot];
      if (!p) return;
      if (p.action !== null) { socket.emit('duel_error', 'Você já escolheu uma ação!'); return; }

      const check = canUseAction(p, actionId);
      if (!check.ok) { socket.emit('duel_error', check.reason); return; }

      p.action = actionId;
      console.log(`[DUEL] ação | slot:${slot} | ${actionId} | room:${roomId}`);

      // Confirma ao jogador
      socket.emit('duel_action_confirmed', { actionId });

      // Notifica adversário que o outro já escolheu (sem revelar qual)
      socket.to(roomId).emit('duel_opponent_ready');

      // Ambos escolheram?
      const p1Done = room.p1.action !== null;
      const p2Done = room.isVsBot  ? true : room.p2.action !== null;

      if (p1Done && p2Done) executeRound(room, io);
    });

    socket.on('disconnect', () => {
      for (const [, room] of rooms) {
        if (room.sockets.p1 === socket.id) {
          room.p1.connected = false;
          room.sockets.p1   = null;
          io.to(room.id).emit('duel_disconnect', { slot: 'p1' });
        }
        if (room.sockets.p2 === socket.id) {
          room.p2.connected = false;
          room.sockets.p2   = null;
          io.to(room.id).emit('duel_disconnect', { slot: 'p2' });
        }
      }
    });
  });
}

module.exports = { setupRoutes, setupSocket };
