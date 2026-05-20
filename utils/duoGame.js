'use strict';

// ============================================================
// DUO GAME v1.1.0
// ADIÇÃO: suporte a bônus de relíquias via createDuoPlayer(bonus)
//   e joinTeam(chatId, jid, teamNumber, bonus)
// ============================================================

const { addXP, getUser, updateUser } = require('./economy.js');
const { checkAchievements }          = require('./achievements.js');
const {
  SPELLS,
  SPELL_LIST,
  SENTINEL_JID,
} = require('./duelGame.js');

module.exports.SPELLS    = SPELLS;
module.exports.SPELL_LIST = SPELL_LIST;

const duos = new Map();

const DUO_LOBBY_TTL_MS  = 5  * 60_000;
const DUO_BATTLE_TTL_MS = 15 * 60_000;
const DUO_ACTION_TTL_MS = 45_000;

// ─────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────

function rand(min, max)       { return Math.floor(Math.random() * (max - min + 1)) + min; }
function clamp(val, min, max) { return Math.max(min, Math.min(max, val)); }
function chance(pct)          { return Math.random() * 100 < pct; }

function playerLabel(p) {
  if (!p) return '?';
  return `@${p.jid.split('@')[0]}`;
}

// ─────────────────────────────────────────────────────────────
// ESTADO DE UM JOGADOR NO DUO — aceita bônus de relíquias
// ─────────────────────────────────────────────────────────────

function createDuoPlayer(jid, bonus = {}) {
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
    teamShielded:       false,
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
// ESTADO DE UM TIME
// ─────────────────────────────────────────────────────────────

function createTeam(id, color, emoji) {
  return { id, color, emoji, players: [] };
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

function isAlive(player)   { return player.hp > 0; }
function teamAlive(team)   { return team.players.some(p => isAlive(p)); }

// ─────────────────────────────────────────────────────────────
// APLICAR EFEITOS ATIVOS + REGEN DA RELÍQUIA
// ─────────────────────────────────────────────────────────────

function applyEffects(player) {
  const log  = [];
  const L    = playerLabel(player);
  const keep = [];

  for (const effect of (player.effects || [])) {
    if (effect.type === 'burning')  { const dot = effect.dot || 5; player.hp -= dot; log.push(`🔥 *${L}* queimando! _-${dot} HP_ (${effect.rounds - 1}r restantes)`); }
    if (effect.type === 'poisoned') { const dot = effect.dot || 6; player.hp -= dot; log.push(`☠️ *${L}* envenenado! _-${dot} HP_ (${effect.rounds - 1}r restantes)`); }
    if (effect.type === 'bleeding') { const dot = effect.dot || 4; player.hp -= dot; log.push(`🩸 *${L}* sangrando! _-${dot} HP_ (${effect.rounds - 1}r restantes)`); }
    if (effect.type === 'frozen')   log.push(`🧊 *${L}* congelado! (${effect.rounds - 1}r restantes)`);
    if (effect.type === 'stun')     log.push(`⚡ *${L}* atordoado! (${effect.rounds - 1}r restantes)`);
    if (effect.type === 'silenced') log.push(`🔇 *${L}* silenciado! (${effect.rounds - 1}r restantes)`);
    if (effect.type === 'chained')  log.push(`⛓️ *${L}* acorrentado! (${effect.rounds - 1}r restantes)`);
    if (effect.type === 'shielded') log.push(`🛡️ *${L}* Escudo Mágico ativo! (${effect.rounds - 1}r restantes)`);
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
  const LT    = playerLabel(target);
  const spell = SPELLS[spellId];

  if (!spell) {
    log.push(`🔮 *${LC}* tentou magia desconhecida! → Ataque Leve`);
    result.damage = rand(8, 15);
    return;
  }
  if (hasEffect(caster, 'silenced')) {
    log.push(`🔇 *${LC}* silenciado! Não pode usar magias. → Ataque Leve`);
    result.damage = rand(8, 15);
    return;
  }
  if ((caster.spellCooldowns[spellId] || 0) > 0) {
    log.push(`🔮 *${LC}* tentou *${spell.name}* em cooldown! (${caster.spellCooldowns[spellId]}r) → Ataque Leve`);
    result.damage = rand(8, 15);
    return;
  }

  const effectiveCost = Math.max(0, spell.cost - (caster.manaCostReduction || 0));

  if (caster.mana < effectiveCost) {
    log.push(`🔮 *${LC}* sem mana para *${spell.name}*! (${caster.mana}/${effectiveCost}) → Ataque Leve`);
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
      log.push(`${spell.icon} *${LC}* → *${LT}*: *${spell.name}*! _${result.damage} dano_ (-${effectiveCost} mana)`);
      if (spell.effect) { addEffect(target, { ...spell.effect }); log.push(`  ↳ Efeito: *${spell.effect.type}*`); }
      break;
    case 'heal': {
      const h = rand(spell.power.min, spell.power.max) + Math.floor(spellPower * 0.5);
      caster.hp = clamp(caster.hp + h, 0, caster.maxHp);
      result.heal = h;
      log.push(`${spell.icon} *${LC}* usa *${spell.name}*! _+${h} HP_ (${caster.hp}/${caster.maxHp}) (-${effectiveCost} mana)`);
      break;
    }
    case 'buff':
      addEffect(caster, { ...spell.effect });
      log.push(`${spell.icon} *${LC}* ativa *${spell.name}*! (-${effectiveCost} mana)`);
      break;
    case 'debuff':
      addEffect(target, { ...spell.effect });
      log.push(`${spell.icon} *${LC}* lança *${spell.name}* em *${LT}*! (-${effectiveCost} mana)`);
      break;
    case 'control':
      result.damage = Math.max(0, rand(spell.power.min, spell.power.max) + spellPower);
      addEffect(target, { ...spell.effect });
      log.push(`${spell.icon} *${LC}* → *${LT}*: *${spell.name}*! _${result.damage} dano_ + controle (-${effectiveCost} mana)`);
      break;
  }
}

// ─────────────────────────────────────────────────────────────
// MECÂNICAS EXCLUSIVAS DO DUO
// ─────────────────────────────────────────────────────────────

function resolveHealAlly(caster, ally, log) {
  if (!ally || !isAlive(ally)) {
    log.push(`💚 *${playerLabel(caster)}* tentou curar aliado mas ele está fora de combate!`);
    return;
  }
  if (caster.mana < 20) {
    log.push(`💚 *${playerLabel(caster)}* tentou curar aliado mas sem mana! (${caster.mana}/20)`);
    return;
  }
  caster.mana -= 20;
  const heal = rand(25, 40);
  ally.hp = clamp(ally.hp + heal, 0, ally.maxHp);
  caster.ultimate = clamp(caster.ultimate + 10, 0, 100);
  log.push(`💚 *${playerLabel(caster)}* cura *${playerLabel(ally)}*! _+${heal} HP_ (${ally.hp}/${ally.maxHp}) (-20 mana)`);
}

function resolveTeamShield(caster, ally, log) {
  if (!ally || !isAlive(ally)) {
    log.push(`🛡️ *${playerLabel(caster)}* tentou proteger aliado mas ele está fora de combate!`);
    return;
  }
  if (caster.mana < 15) {
    log.push(`🛡️ *${playerLabel(caster)}* tentou Escudo de Equipe mas sem mana! (${caster.mana}/15)`);
    return;
  }
  caster.mana -= 15;
  addEffect(ally, { type: 'shielded', rounds: 1, reduction: 0.6 });
  caster.ultimate = clamp(caster.ultimate + 8, 0, 100);
  log.push(`🛡️ *${playerLabel(caster)}* protege *${playerLabel(ally)}*! Escudo 60% por 1 round (-15 mana)`);
}

function resolveCombo(attacker1, attacker2, target, log) {
  const dmg = rand(28, 42);
  log.push(`💥 *COMBO!* *${playerLabel(attacker1)}* + *${playerLabel(attacker2)}* atacam *${playerLabel(target)}* juntos! _${dmg} dano em área!_`);
  target.hp -= dmg;
  attacker1.ultimate = clamp(attacker1.ultimate + 20, 0, 100);
  attacker2.ultimate = clamp(attacker2.ultimate + 20, 0, 100);
}

// ─────────────────────────────────────────────────────────────
// RESOLVER AÇÃO — usa dmgBonus, dodgeBonus, ultimatePowerBonus
// ─────────────────────────────────────────────────────────────

function resolvePlayerAction(player, target, ally, log) {
  const action = (player.action || 'ataque leve').toLowerCase().trim();
  const L      = playerLabel(player);
  const result = { damage: 0, heal: 0, dodged: false, broken: false, healAlly: false, teamShield: false };

  if (hasEffect(player, 'frozen') || hasEffect(player, 'stun')) {
    log.push(`🚫 *${L}* está impedido de agir!`);
    return result;
  }

  const enrage  = getEnrageBonus(player);
  const weaken  = getWeakenPenalty(player);
  const dmgPlus = player.dmgBonus || 0;

  switch (action) {

    case 'ataque leve':
      result.damage = Math.max(0, rand(8, 15) + enrage - weaken + dmgPlus);
      log.push(`⚔️ *${L}* → *${playerLabel(target)}*: *Ataque Leve*! _${result.damage} dano_`);
      player.ultimate = clamp(player.ultimate + 8, 0, 100);
      break;

    case 'ataque pesado':
      if (player.energy < 15) {
        log.push(`💢 *${L}* sem energia para Ataque Pesado! → Ataque Leve`);
        result.damage = rand(8, 15);
      } else {
        player.energy -= 15;
        result.damage  = Math.max(0, rand(20, 32) + enrage - weaken + dmgPlus);
        log.push(`💢 *${L}* → *${playerLabel(target)}*: *Ataque Pesado*! _${result.damage} dano_ (-15 energia)`);
        player.ultimate = clamp(player.ultimate + 12, 0, 100);
      }
      break;

    case 'defesa':
      player.defending = true;
      log.push(`🛡️ *${L}* assume posição de *Defesa*!`);
      player.ultimate = clamp(player.ultimate + 5, 0, 100);
      break;

    case 'esquiva':
      if (hasEffect(player, 'chained')) {
        log.push(`⛓️ *${L}* tentou Esquivar mas está acorrentado!`);
      } else if (chance(40 + (player.dodgeBonus || 0))) {
        player.defending = true;
        result.dodged    = true;
        log.push(`💨 *${L}* esquivou com sucesso!`);
        player.ultimate = clamp(player.ultimate + 10, 0, 100);
      } else {
        log.push(`💨 *${L}* tentou Esquivar mas falhou!`);
      }
      break;

    case 'contra-ataque':
      if (player.energy < 20) {
        log.push(`↩️ *${L}* sem energia para Contra-Ataque! → Ataque Leve`);
        result.damage = rand(8, 15);
      } else {
        player.energy   -= 20;
        player.defending = true;
        result.damage    = Math.max(0, rand(12, 20) + enrage + dmgPlus);
        log.push(`↩️ *${L}* usa *Contra-Ataque*! Devolve _${result.damage}_ se absorver (-20 energia)`);
        player.ultimate  = clamp(player.ultimate + 15, 0, 100);
      }
      break;

    case 'break guard':
      if (player.energy < 25) {
        log.push(`🔨 *${L}* sem energia para Break Guard! → Ataque Leve`);
        result.damage = rand(8, 15);
      } else {
        player.energy -= 25;
        result.damage  = Math.max(0, rand(10, 18) + dmgPlus);
        result.broken  = true;
        log.push(`🔨 *${L}* → *${playerLabel(target)}*: *Break Guard*! _${result.damage} dano_ + quebra defesa! (-25 energia)`);
        player.ultimate = clamp(player.ultimate + 12, 0, 100);
      }
      break;

    case 'focus': {
      const mg = rand(15, 25);
      const eg = rand(10, 18);
      player.mana   = clamp(player.mana   + mg, 0, player.maxMana);
      player.energy = clamp(player.energy + eg, 0, player.maxEnergy);
      player.ultimate = clamp(player.ultimate + 8, 0, 100);
      log.push(`🧘 *${L}* usa *Focus*! _+${mg} mana, +${eg} energia_`);
      break;
    }

    case 'usar item':
      if (player.potions <= 0) {
        log.push(`🧪 *${L}* sem poções! → Ataque Leve`);
        result.damage = rand(8, 15);
      } else {
        player.potions--;
        const heal    = rand(30, 45);
        player.hp     = clamp(player.hp + heal, 0, player.maxHp);
        result.heal   = heal;
        log.push(`🧪 *${L}* usa *Poção*! _+${heal} HP_ (${player.hp}/${player.maxHp}) — Poções: ${player.potions}`);
        player.ultimate = clamp(player.ultimate + 5, 0, 100);
      }
      break;

    case 'ultimate':
      if (player.ultimate < 100) {
        log.push(`✨ *${L}* tentou Ultimate mas não está carregado! (${player.ultimate}/100) → Ataque Leve`);
        result.damage = rand(8, 15);
      } else {
        const ultBonus   = player.ultimatePowerBonus || 0;
        const ultDmg     = Math.max(0, rand(45, 65 + ultBonus) + enrage + dmgPlus);
        player.ultimate  = 0;
        result.damage    = ultDmg;
        result.broken    = true;
        log.push(`✨ *${L}* usa *ULTIMATE*! _${ultDmg} dano massivo!_ ✨`);
      }
      break;

    case 'curar aliado':
      result.healAlly = true;
      resolveHealAlly(player, ally, log);
      break;

    case 'escudo aliado':
      result.teamShield = true;
      resolveTeamShield(player, ally, log);
      break;

    default:
      if (action.startsWith('magia:')) {
        const spellId = action.replace('magia:', '').trim().replace(/\s+/g, '_');
        resolveSpell(player, target, spellId, result, log);
      } else {
        log.push(`❓ *${L}* ficou confuso! → Ataque Leve`);
        result.damage = rand(8, 15);
      }
      break;
  }

  result.damage = Math.max(0, result.damage || 0);
  player.lastActions.push(action);
  if (player.lastActions.length > 5) player.lastActions.shift();
  return result;
}

// ─────────────────────────────────────────────────────────────
// APLICAR DANO — usa damageReduction da relíquia
// ─────────────────────────────────────────────────────────────

function applyDamage(target, attackResult, log) {
  if (!attackResult || !target) return;
  const L   = playerLabel(target);
  let total = attackResult.damage || 0;
  if (total <= 0) return;

  if (attackResult.broken) {
    log.push(`💢 *${L}* recebe _${total}_ de dano (defesa ignorada)!`);
    target.hp -= total;
    return;
  }

  if (hasEffect(target, 'shielded')) {
    const shield = target.effects.find(e => e.type === 'shielded');
    total = Math.floor(total * (1 - (shield?.reduction || 0.5)));
    log.push(`🛡️ *${L}* absorveu com Escudo! _(${total} dano após redução)_`);
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
// ESCOLHA DE ALVO
// ─────────────────────────────────────────────────────────────

function pickTarget(enemies) {
  const alive = enemies.filter(p => isAlive(p));
  if (alive.length === 0) return null;
  return alive[Math.floor(Math.random() * alive.length)];
}

// ─────────────────────────────────────────────────────────────
// RESOLVER ROUND COMPLETO
// ─────────────────────────────────────────────────────────────

function resolveRound(duo) {
  const log = [];
  const t1  = duo.team1;
  const t2  = duo.team2;

  for (const p of [...t1.players, ...t2.players]) {
    if (isAlive(p)) log.push(...applyEffects(p));
  }

  const checkCombo = (team, enemies) => {
    const [a, b] = team.players;
    if (!a || !b || !isAlive(a) || !isAlive(b)) return false;
    const attackActions = ['ataque leve', 'ataque pesado'];
    const bothAttacking = attackActions.includes((a.action || '').toLowerCase()) &&
                          attackActions.includes((b.action || '').toLowerCase());
    if (bothAttacking && chance(30)) {
      const target = pickTarget(enemies);
      if (target) {
        resolveCombo(a, b, target, log);
        a.action = 'defesa';
        b.action = 'defesa';
        return true;
      }
    }
    return false;
  };

  const comboT1 = checkCombo(t1, t2.players);
  const comboT2 = checkCombo(t2, t1.players);

  const resolveTeam = (team, enemies) => {
    for (let i = 0; i < team.players.length; i++) {
      const player = team.players[i];
      if (!isAlive(player)) continue;

      const ally   = team.players[1 - i];
      const allyOk = ally && isAlive(ally) ? ally : null;
      const action = (player.action || 'ataque leve').toLowerCase();

      if (action === 'curar aliado' || action === 'escudo aliado' ||
          action === 'defesa'       || action === 'esquiva'       ||
          action === 'focus'        || action === 'usar item') {
        resolvePlayerAction(player, null, allyOk, log);
      } else {
        const target = pickTarget(enemies);
        if (!target) {
          log.push(`⚔️ *${playerLabel(player)}* não encontrou alvo vivo!`);
          continue;
        }
        const result = resolvePlayerAction(player, target, allyOk, log);
        applyDamage(target, result, log);
      }
    }
  };

  if (!comboT1) resolveTeam(t1, t2.players);
  if (!comboT2) resolveTeam(t2, t1.players);

  for (const p of [...t1.players, ...t2.players]) {
    p.action    = null;
    p.defending = false;
    p.hp     = clamp(p.hp,     0, p.maxHp);
    p.mana   = clamp(p.mana,   0, p.maxMana);
    p.energy = clamp(p.energy, 0, p.maxEnergy);
  }

  return log;
}

// ─────────────────────────────────────────────────────────────
// BARRAS DE STATUS
// ─────────────────────────────────────────────────────────────

function hpBar(hp, maxHp) {
  const pct    = Math.max(0, hp) / maxHp;
  const filled = Math.round(pct * 8);
  return `[${'█'.repeat(filled)}${'░'.repeat(8 - filled)}] ${hp}/${maxHp}`;
}

function manaBar(mana, maxMana) {
  const pct    = Math.max(0, mana) / maxMana;
  const filled = Math.round(pct * 6);
  return `[${'▓'.repeat(filled)}${'░'.repeat(6 - filled)}] ${mana}/${maxMana}`;
}

function playerStatus(p) {
  if (!isAlive(p)) return `${playerLabel(p)} — ☠️ _Fora de combate_`;
  const efx  = (p.effects || []).map(e => e.type).join(', ') || '—';
  const reli = (p.dmgBonus || p.regenPerRound || p.dodgeBonus || p.damageReduction) ? ` 🔮` : '';
  return [
    `  ${playerLabel(p)}${reli}`,
    `  ❤️ ${hpBar(p.hp, p.maxHp)} | 🔵 ${manaBar(p.mana, p.maxMana)}`,
    `  ⚡ ${p.energy}/${p.maxEnergy} | 🧪 ${p.potions} | ✨ ${p.ultimate}/100`,
    `  🌀 ${efx}`,
  ].join('\n');
}

function statusBlock(duo) {
  const t1 = duo.team1, t2 = duo.team2;
  return [
    `📊 *STATUS DO CAMPO*`, ``,
    `${t1.emoji} *Time ${t1.id} — ${t1.color}*`,
    ...t1.players.map(p => playerStatus(p)), ``,
    `${t2.emoji} *Time ${t2.id} — ${t2.color}*`,
    ...t2.players.map(p => playerStatus(p)),
  ].join('\n');
}

// ─────────────────────────────────────────────────────────────
// RECOMPENSAS
// ─────────────────────────────────────────────────────────────

function grantDuoRewards(winTeam, loseTeam, draw) {
  const grantTo = (jid, xp, reason) => {
    try { addXP(jid, xp, reason); checkAchievements(jid); } catch (err) {
      console.error(`[DUO] Erro XP ${jid}:`, err.message);
    }
  };

  if (draw) {
    [...(winTeam?.players || []), ...(loseTeam?.players || [])].forEach(p => grantTo(p.jid, 30, 'duo_draw'));
    return;
  }
  if (winTeam) {
    winTeam.players.forEach(p => {
      grantTo(p.jid, 120, 'duo_win');
      try {
        const u = getUser(p.jid);
        if (!u.stats) u.stats = { minigamesWon: 0 };
        u.stats.minigamesWon = (u.stats.minigamesWon || 0) + 1;
        updateUser(p.jid, u);
      } catch (_) {}
    });
  }
  if (loseTeam) {
    loseTeam.players.forEach(p => grantTo(p.jid, 30, 'duo_loss'));
  }
}

// ─────────────────────────────────────────────────────────────
// HELP TEXT
// ─────────────────────────────────────────────────────────────

const ACTIONS_HELP = [
  ``,
  `🎮 *AÇÕES DISPONÍVEIS:*`, ``,
  `⚔️ Ataque:`,
  `  \`ataque leve\`   — 8-15 dano`,
  `  \`ataque pesado\` — 20-32 dano (-15 energia)`,
  `  \`break guard\`   — 10-18 dano + quebra defesa (-25 energia)`,
  `  \`ultimate\`      — 45-65 dano (100 de carga)`, ``,
  `🛡️ Defesa:`,
  `  \`defesa\`        — reduz 50% do dano`,
  `  \`esquiva\`       — 40% de evitar tudo`,
  `  \`contra-ataque\` — absorve + devolve (-20 energia)`, ``,
  `⚙️ Suporte:`,
  `  \`focus\`         — recupera mana e energia`,
  `  \`usar item\`     — usa poção (+30-45 HP)`, ``,
  `🤝 *Exclusivo Duo:*`,
  `  \`curar aliado\`  — cura seu parceiro (+25-40 HP, -20 mana)`,
  `  \`escudo aliado\` — protege parceiro 60% 1r (-15 mana)`, ``,
  `🔮 *Magias:* \`magia: <nome>\``,
  `  bola_de_fogo • raio • gelo • veneno • cura`,
  `  escudo_magico • furia • fraqueza • silencio • correntes`, ``,
  `📌 *Responda ESTA mensagem com sua ação!*`,
].join('\n');

// ─────────────────────────────────────────────────────────────
// API PÚBLICA
// ─────────────────────────────────────────────────────────────

function hasDuo(chatId)  { return duos.has(chatId); }
function getDuo(chatId)  { return duos.get(chatId) || null; }

function isDuoMessage(chatId, messageId) {
  const duo = duos.get(chatId);
  return duo && Array.isArray(duo.messageIds) && duo.messageIds.includes(messageId);
}

function registerMessageId(chatId, messageId) {
  const duo = duos.get(chatId);
  if (!duo || !messageId) return;
  if (!Array.isArray(duo.messageIds)) duo.messageIds = [];
  if (!duo.messageIds.includes(messageId)) duo.messageIds.push(messageId);
  if (duo.messageIds.length > 40) duo.messageIds = duo.messageIds.slice(-40);
}

function createDuo(chatId, creatorJid) {
  if (duos.has(chatId)) return { error: 'already_active' };

  const duo = {
    chatId,
    phase:          'lobby',
    team1:          createTeam(1, 'Vermelho', '🔴'),
    team2:          createTeam(2, 'Azul',     '🔵'),
    round:          0,
    lastActivity:   Date.now(),
    messageIds:     [],
    lobbyTimeout:   null,
    roundTimeout:   null,
    roundLog:       [],
    pendingActions: new Set(),
  };

  duos.set(chatId, duo);
  return { ok: true, duo };
}

// bonus vem de getBattleBonus(jid) em duoHandler.js
function joinTeam(chatId, jid, teamNumber, bonus = {}) {
  const duo = duos.get(chatId);
  if (!duo)                  return { error: 'no_duo' };
  if (duo.phase !== 'lobby') return { error: 'not_lobby' };

  const t1 = duo.team1, t2 = duo.team2;
  const inT1 = t1.players.some(p => p.jid === jid);
  const inT2 = t2.players.some(p => p.jid === jid);
  if (inT1 || inT2) return { error: 'already_joined' };

  const target = teamNumber === 1 ? t1 : t2;
  if (target.players.length >= 2) return { error: 'team_full' };

  target.players.push(createDuoPlayer(jid, bonus));
  duo.lastActivity = Date.now();

  const ready = t1.players.length === 2 && t2.players.length === 2;
  return { ok: true, ready, t1Count: t1.players.length, t2Count: t2.players.length };
}

function startBattle(chatId) {
  const duo = duos.get(chatId);
  if (!duo)                  return { error: 'no_duo' };
  if (duo.phase !== 'lobby') return { error: 'not_lobby' };

  duo.phase = 'fighting';
  duo.round = 1;
  duo.lastActivity = Date.now();
  duo.pendingActions = new Set([
    ...duo.team1.players.map(p => p.jid),
    ...duo.team2.players.map(p => p.jid),
  ]);

  return { ok: true, duo };
}

function submitAction(chatId, playerJid, action) {
  const duo = duos.get(chatId);
  if (!duo)                     return { error: 'no_duo' };
  if (duo.phase !== 'fighting') return { error: 'wrong_phase' };

  duo.lastActivity = Date.now();

  const allPlayers = [...duo.team1.players, ...duo.team2.players];
  const player     = allPlayers.find(p => p.jid === playerJid);

  if (!player)                return { error: 'not_in_duo' };
  if (!isAlive(player))       return { error: 'player_dead' };
  if (player.action !== null) return { error: 'already_acted' };

  player.action = action;
  duo.pendingActions.delete(playerJid);

  const aliveJids = allPlayers.filter(p => isAlive(p)).map(p => p.jid);
  const allActed  = aliveJids.every(jid => {
    const p = allPlayers.find(x => x.jid === jid);
    return p && p.action !== null;
  });

  return { ok: true, allActed, duo };
}

function processRound(chatId) {
  const duo = duos.get(chatId);
  if (!duo) return { error: 'no_duo' };

  const allPlayers = [...duo.team1.players, ...duo.team2.players];
  for (const p of allPlayers) {
    if (isAlive(p) && p.action === null) p.action = 'ataque leve';
  }

  const log = resolveRound(duo);
  duo.roundLog.push(...log);
  if (duo.roundLog.length > 50) duo.roundLog = duo.roundLog.slice(-50);
  duo.lastActivity = Date.now();

  const t1Alive = teamAlive(duo.team1);
  const t2Alive = teamAlive(duo.team2);

  if (!t1Alive || !t2Alive) {
    duo.phase = 'ended';
    duos.delete(chatId);

    const draw     = !t1Alive && !t2Alive;
    const winTeam  = draw ? null : (t1Alive ? duo.team1 : duo.team2);
    const loseTeam = draw ? null : (t1Alive ? duo.team2 : duo.team1);

    grantDuoRewards(winTeam, loseTeam, draw);
    return { ok: true, log, ended: true, winTeam, loseTeam, draw, duo };
  }

  duo.round++;
  duo.pendingActions = new Set(allPlayers.filter(p => isAlive(p)).map(p => p.jid));

  return { ok: true, log, ended: false, round: duo.round, duo, status: statusBlock(duo) };
}

function cancelDuo(chatId) {
  const duo = duos.get(chatId);
  if (!duo) return { error: 'no_duo' };
  if (duo.lobbyTimeout) { clearTimeout(duo.lobbyTimeout); duo.lobbyTimeout = null; }
  if (duo.roundTimeout) { clearTimeout(duo.roundTimeout); duo.roundTimeout = null; }
  duos.delete(chatId);
  return { ok: true };
}

setInterval(() => {
  const now = Date.now();
  for (const [id, duo] of duos.entries()) {
    const ttl = duo.phase === 'lobby' ? DUO_LOBBY_TTL_MS : DUO_BATTLE_TTL_MS;
    if (now - duo.lastActivity > ttl) {
      duos.delete(id);
      console.log(`[DUO] Sala expirada: ${id}`);
    }
  }
}, 60_000);

module.exports = {
  hasDuo,
  getDuo,
  isDuoMessage,
  registerMessageId,
  createDuo,
  joinTeam,
  startBattle,
  submitAction,
  processRound,
  cancelDuo,
  statusBlock,
  playerLabel,
  isAlive,
  teamAlive,
  ACTIONS_HELP,
  DUO_ACTION_TTL_MS,
};
