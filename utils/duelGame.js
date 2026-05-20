'use strict';

// ============================================================
// DUEL GAME v3.3.0
// ADIÇÃO: suporte a bônus de relíquias via createPlayer(bonus)
//   dmgBonus, dodgeBonus, damageReduction, regenPerRound,
//   spellPowerBonus, manaCostReduction, ultimatePowerBonus,
//   extraPotions, maxHpBonus, maxManaBonus, maxEnergyBonus,
//   startUltimate
// ============================================================

const { addXP, getUser, updateUser } = require('./economy.js');
const { checkAchievements }          = require('./achievements.js');

const duels = new Map();

const DUEL_TTL_MS   = 10 * 60_000;
const ACCEPT_TTL_MS = 60_000;
const ACTION_TTL_MS = 45_000;

const SENTINEL_JID = 'sentinel@s.whatsapp.net';

setInterval(() => {
  const now = Date.now();
  for (const [id, duel] of duels.entries()) {
    if (now - duel.lastActivity > DUEL_TTL_MS) {
      duels.delete(id);
      console.log(`[DUEL] Duelo expirado: ${id}`);
    }
  }
}, 60_000);

// ─────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────

function rand(min, max)       { return Math.floor(Math.random() * (max - min + 1)) + min; }
function clamp(val, min, max) { return Math.max(min, Math.min(max, val)); }
function chance(pct)          { return Math.random() * 100 < pct; }

function playerLabel(player) {
  if (player.isBot) return '🤖 Sentinel';
  return `@${player.jid.split('@')[0]}`;
}

// ─────────────────────────────────────────────────────────────
// MAGIAS
// ─────────────────────────────────────────────────────────────

const SPELLS = {
  bola_de_fogo: {
    id: 'bola_de_fogo', name: 'Bola de Fogo', icon: '🔥',
    cost: 25, cooldown: 2, type: 'damage',
    power: { min: 20, max: 30 },
    effect: { type: 'burning', rounds: 2, dot: 5 },
    desc: '20-30 dano + queimadura 2r',
  },
  raio: {
    id: 'raio', name: 'Raio', icon: '⚡',
    cost: 30, cooldown: 3, type: 'damage',
    power: { min: 25, max: 40 },
    effect: { type: 'stun', rounds: 1 },
    desc: '25-40 dano + stun 1r',
  },
  gelo: {
    id: 'gelo', name: 'Tempestade de Gelo', icon: '🧊',
    cost: 20, cooldown: 2, type: 'damage',
    power: { min: 15, max: 22 },
    effect: { type: 'frozen', rounds: 2 },
    desc: '15-22 dano + congela 2r',
  },
  veneno: {
    id: 'veneno', name: 'Nuvem de Veneno', icon: '☠️',
    cost: 15, cooldown: 2, type: 'damage',
    power: { min: 8, max: 12 },
    effect: { type: 'poisoned', rounds: 3, dot: 6 },
    desc: '8-12 dano + veneno 3r',
  },
  cura: {
    id: 'cura', name: 'Cura Divina', icon: '💚',
    cost: 20, cooldown: 3, type: 'heal',
    power: { min: 30, max: 45 },
    effect: null,
    desc: 'Recupera 30-45 HP',
  },
  escudo_magico: {
    id: 'escudo_magico', name: 'Escudo Mágico', icon: '🛡️',
    cost: 18, cooldown: 3, type: 'buff',
    power: { min: 0, max: 0 },
    effect: { type: 'shielded', rounds: 2, reduction: 0.7 },
    desc: '-70% dano recebido 2r',
  },
  furia: {
    id: 'furia', name: 'Fúria Guerreira', icon: '😤',
    cost: 20, cooldown: 4, type: 'buff',
    power: { min: 0, max: 0 },
    effect: { type: 'enraged', rounds: 2, bonus: 10 },
    desc: '+10 dano em ataques 2r',
  },
  fraqueza: {
    id: 'fraqueza', name: 'Maldição da Fraqueza', icon: '💫',
    cost: 15, cooldown: 3, type: 'debuff',
    power: { min: 0, max: 0 },
    effect: { type: 'weakened', rounds: 2, penalty: 8 },
    desc: 'Inimigo -8 dano 2r',
  },
  silencio: {
    id: 'silencio', name: 'Silêncio', icon: '🔇',
    cost: 20, cooldown: 3, type: 'debuff',
    power: { min: 0, max: 0 },
    effect: { type: 'silenced', rounds: 2 },
    desc: 'Bloqueia magias do inimigo 2r',
  },
  correntes: {
    id: 'correntes', name: 'Correntes Eternas', icon: '⛓️',
    cost: 25, cooldown: 3, type: 'control',
    power: { min: 5, max: 10 },
    effect: { type: 'chained', rounds: 2 },
    desc: '5-10 dano + bloqueia esquiva 2r',
  },
};

const SPELL_LIST = Object.keys(SPELLS);

// ─────────────────────────────────────────────────────────────
// ESTADO DO JOGADOR — aceita bônus de relíquias
// ─────────────────────────────────────────────────────────────

function createPlayer(jid, isBot = false, difficulty = null, bonus = {}) {
  return {
    jid,
    hp:                120 + (bonus.maxHpBonus     || 0),
    maxHp:             120 + (bonus.maxHpBonus     || 0),
    mana:               60 + (bonus.maxManaBonus   || 0),
    maxMana:            60 + (bonus.maxManaBonus   || 0),
    energy:             50 + (bonus.maxEnergyBonus || 0),
    maxEnergy:          50 + (bonus.maxEnergyBonus || 0),
    potions:             2 + (bonus.extraPotions   || 0),
    action:             null,
    defending:          false,
    effects:            [],
    ultimate:           bonus.startUltimate        || 0,
    spellCooldowns:     {},
    lastActions:        [],
    isBot,
    difficulty,
    // ── Bônus da relíquia ──────────────────────────────────
    dmgBonus:           bonus.dmgBonus           || 0,
    dodgeBonus:         bonus.dodgeBonus         || 0,
    damageReduction:    bonus.damageReduction    || 0,
    spellPowerBonus:    bonus.spellPowerBonus    || 0,
    manaCostReduction:  bonus.manaCostReduction  || 0,
    regenPerRound:      bonus.regenPerRound      || 0,
    ultimatePowerBonus: bonus.ultimatePowerBonus || 0,
  };
}

// ─────────────────────────────────────────────────────────────
// HELPERS DE EFEITO
// ─────────────────────────────────────────────────────────────

function hasEffect(player, type) {
  return (player.effects || []).some(e => e.type === type && e.rounds > 0);
}

function addEffect(target, effect) {
  target.effects = (target.effects || []).filter(e => e.type !== effect.type);
  target.effects.push({ ...effect });
}

function getEnrageBonus(player) {
  const e = (player.effects || []).find(e => e.type === 'enraged');
  return e ? (e.bonus || 0) : 0;
}

function getWeakenPenalty(player) {
  const e = (player.effects || []).find(e => e.type === 'weakened');
  return e ? (e.penalty || 0) : 0;
}

// ─────────────────────────────────────────────────────────────
// APLICAR EFEITOS ATIVOS + REGEN DA RELÍQUIA
// ─────────────────────────────────────────────────────────────

function applyEffects(player) {
  const log  = [];
  const L    = playerLabel(player);
  const keep = [];

  for (const effect of (player.effects || [])) {
    if (effect.type === 'burning')  { const dot = effect.dot || 5; player.hp -= dot; log.push(`🔥 *${L}* está queimando! _-${dot} HP_ (${effect.rounds - 1}r restantes)`); }
    if (effect.type === 'poisoned') { const dot = effect.dot || 6; player.hp -= dot; log.push(`☠️ *${L}* está envenenado! _-${dot} HP_ (${effect.rounds - 1}r restantes)`); }
    if (effect.type === 'bleeding') { const dot = effect.dot || 4; player.hp -= dot; log.push(`🩸 *${L}* está sangrando! _-${dot} HP_ (${effect.rounds - 1}r restantes)`); }
    if (effect.type === 'frozen')   log.push(`🧊 *${L}* está congelado! (${effect.rounds - 1}r restantes)`);
    if (effect.type === 'stun')     log.push(`⚡ *${L}* está atordoado! (${effect.rounds - 1}r restantes)`);
    if (effect.type === 'silenced') log.push(`🔇 *${L}* está silenciado! (${effect.rounds - 1}r restantes)`);
    if (effect.type === 'chained')  log.push(`⛓️ *${L}* está acorrentado! (${effect.rounds - 1}r restantes)`);
    if (effect.type === 'shielded') log.push(`🛡️ *${L}* com Escudo Mágico! (${effect.rounds - 1}r restantes)`);
    if (effect.type === 'enraged')  log.push(`😤 *${L}* em Fúria! +${effect.bonus} dano (${effect.rounds - 1}r restantes)`);
    if (effect.type === 'weakened') log.push(`💫 *${L}* Fraco! -${effect.penalty} dano (${effect.rounds - 1}r restantes)`);
    effect.rounds--;
    if (effect.rounds > 0) keep.push(effect);
  }

  player.effects = keep;

  for (const spellId of Object.keys(player.spellCooldowns || {})) {
    player.spellCooldowns[spellId]--;
    if (player.spellCooldowns[spellId] <= 0) delete player.spellCooldowns[spellId];
  }

  // ── Regeneração passiva (Anel de Regeneração)
  if ((player.regenPerRound || 0) > 0 && player.hp > 0) {
    const regen = player.regenPerRound;
    player.hp = clamp(player.hp + regen, 0, player.maxHp);
    log.push(`💚 *${L}* regenera _+${regen} HP_ (relíquia) → ${player.hp}/${player.maxHp}`);
  }

  return log;
}

// ─────────────────────────────────────────────────────────────
// RESOLVER MAGIA — usa spellPowerBonus e manaCostReduction
// ─────────────────────────────────────────────────────────────

function resolveSpell(caster, target, spellId, result, log) {
  const LC    = playerLabel(caster);
  const spell = SPELLS[spellId];

  if (!spell) {
    log.push(`🔮 *${LC}* tentou magia desconhecida! → Ataque Leve`);
    result.damage = rand(8, 15);
    return;
  }
  if (hasEffect(caster, 'silenced')) {
    log.push(`🔇 *${LC}* está silenciado! Não pode usar magias. → Ataque Leve`);
    result.damage = rand(8, 15);
    return;
  }
  if ((caster.spellCooldowns[spellId] || 0) > 0) {
    log.push(`🔮 *${LC}* tentou *${spell.name}* mas está em cooldown! (${caster.spellCooldowns[spellId]}r) → Ataque Leve`);
    result.damage = rand(8, 15);
    return;
  }

  // Custo reduzido pela relíquia
  const effectiveCost = Math.max(0, spell.cost - (caster.manaCostReduction || 0));

  if (caster.mana < effectiveCost) {
    log.push(`🔮 *${LC}* tentou *${spell.name}* mas sem mana! (${caster.mana}/${effectiveCost}) → Ataque Leve`);
    result.damage = rand(8, 15);
    return;
  }

  caster.mana -= effectiveCost;
  caster.spellCooldowns[spellId] = spell.cooldown;
  caster.ultimate = clamp(caster.ultimate + 15, 0, 100);

  const spellPower = caster.spellPowerBonus || 0;

  switch (spell.type) {
    case 'damage':
      result.damage = Math.max(0,
        rand(spell.power.min, spell.power.max) + spellPower + getEnrageBonus(caster) - getWeakenPenalty(caster)
      );
      log.push(`${spell.icon} *${LC}* conjura *${spell.name}*! _${result.damage} dano_ (-${effectiveCost} mana)`);
      if (spell.effect) {
        addEffect(target, { ...spell.effect });
        log.push(`  ↳ Efeito: *${spell.effect.type}*`);
      }
      break;

    case 'heal': {
      const healAmt = rand(spell.power.min, spell.power.max) + Math.floor(spellPower * 0.5);
      caster.hp   = clamp(caster.hp + healAmt, 0, caster.maxHp);
      result.heal = healAmt;
      log.push(`${spell.icon} *${LC}* conjura *${spell.name}*! _+${healAmt} HP_ (${caster.hp}/${caster.maxHp}) (-${effectiveCost} mana)`);
      break;
    }

    case 'buff':
      addEffect(caster, { ...spell.effect });
      log.push(`${spell.icon} *${LC}* conjura *${spell.name}*! Buff ativo. (-${effectiveCost} mana)`);
      break;

    case 'debuff':
      addEffect(target, { ...spell.effect });
      log.push(`${spell.icon} *${LC}* conjura *${spell.name}* no adversário! (-${effectiveCost} mana)`);
      break;

    case 'control':
      result.damage = Math.max(0, rand(spell.power.min, spell.power.max) + spellPower);
      addEffect(target, { ...spell.effect });
      log.push(`${spell.icon} *${LC}* conjura *${spell.name}*! _${result.damage} dano_ + controle (-${effectiveCost} mana)`);
      break;
  }
}

// ─────────────────────────────────────────────────────────────
// RESOLVER AÇÃO — usa dmgBonus, dodgeBonus, ultimatePowerBonus
// ─────────────────────────────────────────────────────────────

function resolveAction(attacker, defender, log) {
  const action = (attacker.action || 'ataque leve').toLowerCase().trim();
  const L      = playerLabel(attacker);
  const result = { damage: 0, extraDamage: 0, hits: 1, heal: 0, dodged: false, broken: false };

  if (hasEffect(attacker, 'frozen') || hasEffect(attacker, 'stun')) {
    log.push(`🚫 *${L}* está impedido de agir neste round!`);
    return result;
  }

  const enrage  = getEnrageBonus(attacker);
  const weaken  = getWeakenPenalty(attacker);
  const dmgPlus = attacker.dmgBonus || 0;

  switch (action) {

    case 'ataque leve':
      result.damage = Math.max(0, rand(8, 15) + enrage - weaken + dmgPlus);
      log.push(`⚔️ *${L}* usa *Ataque Leve*! _${result.damage} dano_`);
      attacker.ultimate = clamp(attacker.ultimate + 8, 0, 100);
      break;

    case 'ataque pesado':
      if (attacker.energy < 15) {
        log.push(`💢 *${L}* sem energia para Ataque Pesado! → Ataque Leve`);
        result.damage = rand(8, 15);
      } else {
        attacker.energy -= 15;
        result.damage    = Math.max(0, rand(20, 32) + enrage - weaken + dmgPlus);
        log.push(`💢 *${L}* usa *Ataque Pesado*! _${result.damage} dano_ (-15 energia)`);
        attacker.ultimate = clamp(attacker.ultimate + 12, 0, 100);
      }
      break;

    case 'defesa':
      attacker.defending = true;
      log.push(`🛡️ *${L}* assume posição de *Defesa*!`);
      attacker.ultimate = clamp(attacker.ultimate + 5, 0, 100);
      break;

    case 'esquiva':
      if (hasEffect(attacker, 'chained')) {
        log.push(`⛓️ *${L}* tentou Esquivar mas está acorrentado!`);
      } else if (chance(40 + (attacker.dodgeBonus || 0))) {
        attacker.defending = true;
        result.dodged      = true;
        log.push(`💨 *${L}* esquivou com sucesso!`);
        attacker.ultimate = clamp(attacker.ultimate + 10, 0, 100);
      } else {
        log.push(`💨 *${L}* tentou Esquivar mas falhou!`);
      }
      break;

    case 'contra-ataque':
      if (attacker.energy < 20) {
        log.push(`↩️ *${L}* sem energia para Contra-Ataque! → Ataque Leve`);
        result.damage = rand(8, 15);
      } else {
        attacker.energy   -= 20;
        attacker.defending = true;
        result.damage      = Math.max(0, rand(12, 20) + enrage + dmgPlus);
        log.push(`↩️ *${L}* usa *Contra-Ataque*! Se absorver dano, devolve _${result.damage}_ (-20 energia)`);
        attacker.ultimate = clamp(attacker.ultimate + 15, 0, 100);
      }
      break;

    case 'break guard':
      if (attacker.energy < 25) {
        log.push(`🔨 *${L}* sem energia para Break Guard! → Ataque Leve`);
        result.damage = rand(8, 15);
      } else {
        attacker.energy -= 25;
        result.damage    = Math.max(0, rand(10, 18) + dmgPlus);
        result.broken    = true;
        log.push(`🔨 *${L}* usa *Break Guard*! _${result.damage} dano_ + quebra defesa! (-25 energia)`);
        attacker.ultimate = clamp(attacker.ultimate + 12, 0, 100);
      }
      break;

    case 'focus': {
      const manaGain   = rand(15, 25);
      const energyGain = rand(10, 18);
      attacker.mana    = clamp(attacker.mana   + manaGain,   0, attacker.maxMana);
      attacker.energy  = clamp(attacker.energy + energyGain, 0, attacker.maxEnergy);
      attacker.ultimate = clamp(attacker.ultimate + 8, 0, 100);
      log.push(`🧘 *${L}* usa *Focus*! _+${manaGain} mana, +${energyGain} energia_`);
      break;
    }

    case 'usar item':
      if (attacker.potions <= 0) {
        log.push(`🧪 *${L}* sem poções! → Ataque Leve`);
        result.damage = rand(8, 15);
      } else {
        attacker.potions--;
        const heal    = rand(30, 45);
        attacker.hp   = clamp(attacker.hp + heal, 0, attacker.maxHp);
        result.heal   = heal;
        log.push(`🧪 *${L}* usa *Poção*! _+${heal} HP_ (${attacker.hp}/${attacker.maxHp}) — Poções: ${attacker.potions}`);
        attacker.ultimate = clamp(attacker.ultimate + 5, 0, 100);
      }
      break;

    case 'ultimate':
      if (attacker.ultimate < 100) {
        log.push(`✨ *${L}* tentou Ultimate mas não está carregado! (${attacker.ultimate}/100) → Ataque Leve`);
        result.damage = rand(8, 15);
      } else {
        const ultBonus   = attacker.ultimatePowerBonus || 0;
        const ultDmg     = Math.max(0, rand(45, 65 + ultBonus) + enrage + dmgPlus);
        attacker.ultimate = 0;
        result.damage    = ultDmg;
        result.broken    = true;
        log.push(`✨ *${L}* usa seu *ULTIMATE*! _${ultDmg} dano massivo!_ ✨`);
      }
      break;

    default:
      if (action.startsWith('magia:')) {
        const spellId = action.replace('magia:', '').trim().replace(/\s+/g, '_');
        resolveSpell(attacker, defender, spellId, result, log);
      } else {
        log.push(`❓ *${L}* ficou confuso! → Ataque Leve`);
        result.damage = rand(8, 15);
      }
      break;
  }

  result.damage      = Math.max(0, result.damage      || 0);
  result.extraDamage = Math.max(0, result.extraDamage  || 0);
  attacker.lastActions.push(action);
  if (attacker.lastActions.length > 5) attacker.lastActions.shift();
  return result;
}

// ─────────────────────────────────────────────────────────────
// APLICAR DANO — usa damageReduction da relíquia
// ─────────────────────────────────────────────────────────────

function applyDamage(target, attackResult, log) {
  if (!attackResult) return;
  const L   = playerLabel(target);
  let total = (attackResult.damage || 0) + (attackResult.extraDamage || 0);
  if (total <= 0) return;

  if (attackResult.broken) {
    log.push(`💢 *${L}* recebe _${total}_ de dano (defesa ignorada)!`);
    target.hp -= total;
    return;
  }

  if (hasEffect(target, 'shielded')) {
    const shield = target.effects.find(e => e.type === 'shielded');
    total = Math.floor(total * (1 - (shield?.reduction || 0.5)));
    log.push(`🛡️ *${L}* absorveu com Escudo Mágico! _(${total} dano após redução)_`);
    target.hp -= total;
    return;
  }

  if (target.defending) {
    total = Math.floor(total * 0.5);
    log.push(`🛡️ *${L}* defendeu! _(${total} dano após defesa)_`);
  } else if ((target.damageReduction || 0) > 0) {
    const reduced = Math.floor(total * (1 - target.damageReduction));
    log.push(`🌑 *${L}* absorve parte do dano pela relíquia! _(${total} → ${reduced})_`);
    total = reduced;
  } else {
    log.push(`💢 *${L}* recebe _${total}_ de dano!`);
  }

  target.hp -= total;
}

// ─────────────────────────────────────────────────────────────
// RESOLVER ROUND
// ─────────────────────────────────────────────────────────────

function resolveRound(p1, p2) {
  const log = [];
  log.push(...applyEffects(p1));
  log.push(...applyEffects(p2));
  const p1Result = resolveAction(p1, p2, log);
  const p2Result = resolveAction(p2, p1, log);
  applyDamage(p1, p2Result, log);
  applyDamage(p2, p1Result, log);
  p1.action = null; p1.defending = false;
  p2.action = null; p2.defending = false;
  p1.hp     = clamp(p1.hp,     0, p1.maxHp);
  p2.hp     = clamp(p2.hp,     0, p2.maxHp);
  p1.mana   = clamp(p1.mana,   0, p1.maxMana);
  p2.mana   = clamp(p2.mana,   0, p2.maxMana);
  p1.energy = clamp(p1.energy, 0, p1.maxEnergy);
  p2.energy = clamp(p2.energy, 0, p2.maxEnergy);
  return log;
}

// ─────────────────────────────────────────────────────────────
// IA DO SENTINEL
// ─────────────────────────────────────────────────────────────

function sentinelEasy(bot, enemy) {
  if (chance(30)) return 'ataque leve';
  const opts = ['ataque leve', 'defesa', 'esquiva', 'focus', 'usar item'];
  return opts[rand(0, opts.length - 1)];
}

function sentinelMedium(bot, enemy) {
  if (bot.hp < 40 && bot.potions > 0)                                                               return 'usar item';
  if (bot.hp < 50 && bot.mana >= SPELLS.cura.cost && !(bot.spellCooldowns['cura'] > 0))             return 'magia: cura';
  if (enemy.hp < 30)                                                                                 return 'ataque pesado';
  if (chance(25))                                                                                    return 'defesa';
  if (bot.energy < 10)                                                                               return 'focus';
  return ['ataque leve', 'ataque pesado', 'esquiva'][rand(0, 2)];
}

function sentinelHard(bot, enemy) {
  if (bot.hp < 30 && bot.potions > 0)                                                               return 'usar item';
  if (bot.hp < 40 && bot.mana >= SPELLS.cura.cost && !(bot.spellCooldowns['cura'] > 0))             return 'magia: cura';
  if (bot.ultimate >= 100)                                                                           return 'ultimate';
  if (enemy.hp < 25)                                                                                 return 'ataque pesado';
  if ((hasEffect(enemy, 'frozen') || hasEffect(enemy, 'stun')) && enemy.hp > 0)                     return 'ataque pesado';
  if (!hasEffect(enemy, 'burning')  && bot.mana >= SPELLS.bola_de_fogo.cost && !(bot.spellCooldowns['bola_de_fogo'] > 0)) return 'magia: bola_de_fogo';
  if (!hasEffect(enemy, 'poisoned') && bot.mana >= SPELLS.veneno.cost       && !(bot.spellCooldowns['veneno'] > 0))       return 'magia: veneno';
  if (!hasEffect(bot,   'enraged')  && bot.mana >= SPELLS.furia.cost        && !(bot.spellCooldowns['furia'] > 0))        return 'magia: furia';
  if (enemy.defending && bot.energy >= 25)                                                          return 'break guard';
  if (bot.energy < 15 || bot.mana < 20)                                                             return 'focus';
  return chance(50) ? 'ataque pesado' : 'ataque leve';
}

async function sentinelAI(bot, enemy, roundLog) {
  let callAIOnce;
  try {
    callAIOnce = require('./ai.js').callAIOnce;
  } catch (err) {
    console.error('[DUEL AI] Não foi possível carregar ai.js:', err.message);
    return sentinelHard(bot, enemy);
  }

  const availableSpells = SPELL_LIST
    .filter(id => bot.mana >= SPELLS[id].cost && !(bot.spellCooldowns[id] > 0))
    .map(id => `${id} (${SPELLS[id].desc})`)
    .join(', ') || 'nenhuma';

  const systemPrompt = [
    'Você é o Sentinel, guerreiro lendário em duelo RPG estratégico.',
    'Analise o estado e escolha a MELHOR ação.',
    'Responda APENAS com o nome exato da ação, sem explicações.',
    '',
    'Ações válidas:',
    'ataque leve, ataque pesado, defesa, esquiva, contra-ataque, break guard, focus, usar item, ultimate',
    'Para magias: magia: <id_da_magia>',
    '',
    'Regras:',
    '- "usar item" exige potions > 0',
    '- "ultimate" exige ultimate >= 100',
    '- magias exigem mana e sem cooldown',
    '- priorize sobreviver quando HP < 30',
  ].join('\n');

  const userContent = [
    `=== ESTADO DA BATALHA ===`,
    `[SENTINEL] HP:${bot.hp}/${bot.maxHp} Mana:${bot.mana}/${bot.maxMana} Energia:${bot.energy}/${bot.maxEnergy} Poções:${bot.potions} Ult:${bot.ultimate}/100`,
    `Efeitos: ${bot.effects.map(e => `${e.type}(${e.rounds}r)`).join(', ') || 'nenhum'}`,
    `Magias disponíveis: ${availableSpells}`,
    `Últimas ações: ${bot.lastActions.slice(-3).join(', ') || 'nenhuma'}`,
    ``,
    `[INIMIGO] HP:${enemy.hp}/${enemy.maxHp} Mana:${enemy.mana}/${enemy.maxMana} Energia:${enemy.energy}/${enemy.maxEnergy} Ult:${enemy.ultimate}/100`,
    `Efeitos: ${enemy.effects.map(e => `${e.type}(${e.rounds}r)`).join(', ') || 'nenhum'}`,
    `Últimas ações: ${enemy.lastActions.slice(-3).join(', ') || 'nenhuma'}`,
    ``,
    `Log recente: ${roundLog.slice(-5).join(' | ') || 'início'}`,
    ``,
    `Qual ação você escolhe?`,
  ].join('\n');

  let response = null;
  try {
    response = await callAIOnce('duel_ai', systemPrompt, userContent, 60, 0.2);
  } catch (err) {
    console.error('[DUEL AI] Erro ao chamar Groq:', err.message);
  }

  if (!response) return sentinelHard(bot, enemy);

  const cleaned = response.toLowerCase().trim().replace(/['"*`]/g, '');
  for (const id of SPELL_LIST) { if (cleaned.includes(id)) return `magia: ${id}`; }
  for (const a of ['ataque pesado', 'ataque leve', 'break guard', 'contra-ataque', 'usar item', 'ultimate', 'focus', 'esquiva', 'defesa']) {
    if (cleaned.includes(a)) return a;
  }
  return sentinelHard(bot, enemy);
}

// ─────────────────────────────────────────────────────────────
// RECOMPENSAS
// ─────────────────────────────────────────────────────────────

function grantDuelRewards(winner, loser, draw) {
  if (draw) {
    [winner, loser].filter(Boolean).forEach(p => {
      if (p.isBot) return;
      try { addXP(p.jid, 20, 'duel_draw'); checkAchievements(p.jid); } catch (_) {}
    });
    return;
  }
  if (winner && !winner.isBot) {
    try {
      addXP(winner.jid, 100, 'duel_win');
      const u = getUser(winner.jid);
      if (!u.stats) u.stats = { minigamesWon: 0 };
      u.stats.minigamesWon = (u.stats.minigamesWon || 0) + 1;
      updateUser(winner.jid, u);
      checkAchievements(winner.jid);
    } catch (_) {}
  }
  if (loser && !loser.isBot) {
    try { addXP(loser.jid, 25, 'duel_loss'); checkAchievements(loser.jid); } catch (_) {}
  }
}

// ─────────────────────────────────────────────────────────────
// STATUS BLOCK
// ─────────────────────────────────────────────────────────────

function hpBar(hp, maxHp) {
  const pct    = Math.max(0, hp) / maxHp;
  const filled = Math.round(pct * 10);
  return `[${'█'.repeat(filled)}${'░'.repeat(10 - filled)}] ${hp}/${maxHp}`;
}

function manaBar(mana, maxMana) {
  const pct    = Math.max(0, mana) / maxMana;
  const filled = Math.round(pct * 8);
  return `[${'▓'.repeat(filled)}${'░'.repeat(8 - filled)}] ${mana}/${maxMana}`;
}

function statusBlock(p1, p2) {
  const efx1 = (p1.effects || []).map(e => e.type).join(', ') || 'nenhum';
  const efx2 = (p2.effects || []).map(e => e.type).join(', ') || 'nenhum';
  const rel1 = (p1.dmgBonus || p1.regenPerRound || p1.dodgeBonus || p1.damageReduction) ? ` 🔮` : '';
  const rel2 = (p2.dmgBonus || p2.regenPerRound || p2.dodgeBonus || p2.damageReduction) ? ` 🔮` : '';

  return [
    `📊 *STATUS*`, ``,
    `*${playerLabel(p1)}*${rel1}`,
    `❤️ HP: ${hpBar(p1.hp, p1.maxHp)}`,
    `🔵 Mana: ${manaBar(p1.mana, p1.maxMana)}`,
    `⚡ Energia: ${p1.energy}/${p1.maxEnergy} | 🧪 Poções: ${p1.potions} | ✨ Ult: ${p1.ultimate}/100`,
    `🌀 Efeitos: ${efx1}`, ``,
    `*${playerLabel(p2)}*${rel2}`,
    `❤️ HP: ${hpBar(p2.hp, p2.maxHp)}`,
    `🔵 Mana: ${manaBar(p2.mana, p2.maxMana)}`,
    `⚡ Energia: ${p2.energy}/${p2.maxEnergy} | 🧪 Poções: ${p2.potions} | ✨ Ult: ${p2.ultimate}/100`,
    `🌀 Efeitos: ${efx2}`,
  ].join('\n');
}

// ─────────────────────────────────────────────────────────────
// HELP TEXT
// ─────────────────────────────────────────────────────────────

const ACTIONS_HELP = [
  ``,
  `🎮 *AÇÕES DISPONÍVEIS:*`, ``,
  `⚔️ \`ataque leve\`   — 8-15 dano`,
  `💢 \`ataque pesado\` — 20-32 dano (-15 energia)`,
  `🔨 \`break guard\`   — 10-18 dano + quebra defesa (-25 energia)`,
  `✨ \`ultimate\`      — 45-65 dano (precisa 100 de carga)`,
  `🛡️ \`defesa\`        — reduz 50% do dano`,
  `💨 \`esquiva\`       — 40% de evitar tudo`,
  `↩️ \`contra-ataque\` — absorve + devolve dano (-20 energia)`,
  `🧘 \`focus\`         — recupera mana e energia`,
  `🧪 \`usar item\`     — usa poção (+30-45 HP)`, ``,
  `🔮 *Magias:* \`magia: <nome>\``,
  `  bola_de_fogo • raio • gelo • veneno • cura`,
  `  escudo_magico • furia • fraqueza • silencio • correntes`, ``,
  `📌 *Responda ESTA mensagem com sua ação!*`,
].join('\n');

// ─────────────────────────────────────────────────────────────
// API PÚBLICA
// ─────────────────────────────────────────────────────────────

function hasDuel(chatId)    { return duels.has(chatId); }
function getDuel(chatId)    { return duels.get(chatId) || null; }
function isSentinelJid(jid) { return jid === SENTINEL_JID; }

function isDuelMessage(chatId, messageId) {
  const duel = duels.get(chatId);
  return duel && Array.isArray(duel.messageIds) && duel.messageIds.includes(messageId);
}

function registerMessageId(chatId, messageId) {
  const duel = duels.get(chatId);
  if (!duel || !messageId) return;
  if (!Array.isArray(duel.messageIds)) duel.messageIds = [];
  if (!duel.messageIds.includes(messageId)) duel.messageIds.push(messageId);
  if (duel.messageIds.length > 30) duel.messageIds = duel.messageIds.slice(-30);
}

// challengerBonus e challengedBonus vêm de getBattleBonus() em duel.js
function createDuel(chatId, challengerJid, challengedJid, difficulty = null, challengerBonus = {}, challengedBonus = {}) {
  if (duels.has(chatId)) return { error: 'already_active' };

  const isVsBot = challengedJid === SENTINEL_JID;

  const duel = {
    chatId,
    phase:         isVsBot ? 'fighting' : 'waiting',
    challenger:    createPlayer(challengerJid, false,   null,       challengerBonus),
    challenged:    createPlayer(challengedJid, isVsBot, difficulty, isVsBot ? {} : challengedBonus),
    round:         isVsBot ? 1 : 0,
    isVsBot,
    difficulty,
    lastActivity:  Date.now(),
    messageIds:    [],
    acceptTimeout: null,
    roundTimeout:  null,
    roundLog:      [],
  };

  duels.set(chatId, duel);
  return { ok: true, duel };
}

function acceptDuel(chatId) {
  const duel = duels.get(chatId);
  if (!duel)                    return { error: 'no_duel' };
  if (duel.phase !== 'waiting') return { error: 'wrong_phase' };
  duel.phase        = 'fighting';
  duel.round        = 1;
  duel.lastActivity = Date.now();
  return { ok: true, duel };
}

function submitAction(chatId, playerJid, action) {
  const duel = duels.get(chatId);
  if (!duel)                     return { error: 'no_duel' };
  if (duel.phase !== 'fighting') return { error: 'wrong_phase' };
  duel.lastActivity = Date.now();

  const p1 = duel.challenger, p2 = duel.challenged;
  const isP1 = p1.jid === playerJid, isP2 = p2.jid === playerJid;
  if (!isP1 && !isP2)         return { error: 'not_in_duel' };
  const player = isP1 ? p1 : p2;
  if (player.action !== null) return { error: 'already_acted' };

  player.action = action;
  const bothActed = duel.isVsBot ? true : (p1.action !== null && p2.action !== null);
  return { ok: true, bothActed, duel };
}

function chooseBotAction(duel) {
  const bot = duel.challenged, enemy = duel.challenger;
  switch (duel.difficulty) {
    case 'easy':   return sentinelEasy(bot, enemy);
    case 'medium': return sentinelMedium(bot, enemy);
    case 'hard':   return sentinelHard(bot, enemy);
    default:       return sentinelMedium(bot, enemy);
  }
}

async function chooseBotActionAsync(duel) {
  if (duel.difficulty === 'ai') {
    try {
      return await sentinelAI(duel.challenged, duel.challenger, duel.roundLog);
    } catch (err) {
      console.error('[DUEL] Erro modo AI, fallback hard:', err.message);
      return sentinelHard(duel.challenged, duel.challenger);
    }
  }
  return chooseBotAction(duel);
}

function processRound(chatId) {
  const duel = duels.get(chatId);
  if (!duel) return { error: 'no_duel' };

  const p1 = duel.challenger, p2 = duel.challenged;
  if (p1.action === null) p1.action = 'ataque leve';
  if (p2.action === null) p2.action = 'ataque leve';

  const log = resolveRound(p1, p2);
  duel.roundLog.push(...log);
  if (duel.roundLog.length > 40) duel.roundLog = duel.roundLog.slice(-40);
  duel.lastActivity = Date.now();

  const p1Dead = p1.hp <= 0, p2Dead = p2.hp <= 0;
  if (p1Dead || p2Dead) {
    duel.phase = 'ended';
    duels.delete(chatId);
    const draw   = p1Dead && p2Dead;
    const winner = draw ? null : (p2Dead ? p1 : p2);
    const loser  = draw ? null : (p2Dead ? p2 : p1);
    grantDuelRewards(winner, loser, draw);
    return { ok: true, log, ended: true, winner, draw, p1, p2 };
  }

  duel.round++;
  return { ok: true, log, ended: false, round: duel.round, p1, p2, statusBlock: statusBlock(p1, p2), actionsHelp: ACTIONS_HELP };
}

function cancelDuel(chatId) {
  const duel = duels.get(chatId);
  if (!duel) return { error: 'no_duel' };
  if (duel.acceptTimeout) { clearTimeout(duel.acceptTimeout); duel.acceptTimeout = null; }
  if (duel.roundTimeout)  { clearTimeout(duel.roundTimeout);  duel.roundTimeout  = null; }
  duels.delete(chatId);
  return { ok: true };
}

module.exports = {
  SENTINEL_JID,
  SPELLS,
  SPELL_LIST,
  hasDuel,
  getDuel,
  isSentinelJid,
  isDuelMessage,
  registerMessageId,
  createDuel,
  acceptDuel,
  submitAction,
  chooseBotAction,
  chooseBotActionAsync,
  processRound,
  cancelDuel,
  statusBlock,
  hpBar,
  ACTIONS_HELP,
  ACTION_TTL_MS,
  ACCEPT_TTL_MS,
};
