'use strict';

// ============================================================
// DUO HANDLER v1.1.0
// ADIÇÃO: getBattleBonus aplicado ao joinTeam
// ============================================================

const duoGame            = require('../utils/duoGame.js');
const { getBattleBonus } = require('../utils/shop.js');

// ─────────────────────────────────────────────────────────────
// AÇÕES VÁLIDAS
// ─────────────────────────────────────────────────────────────

const VALID_ACTIONS = new Set([
  'ataque leve', 'ataque pesado', 'defesa', 'esquiva',
  'contra-ataque', 'break guard', 'focus', 'usar item',
  'ultimate', 'curar aliado', 'escudo aliado',
]);

const SPELL_LIST = duoGame.SPELL_LIST || [];

function parseAction(input) {
  const clean = (input || '').trim().toLowerCase();
  if (VALID_ACTIONS.has(clean)) return clean;

  const magiaMatch = clean.match(/^magia[:\s]+(.+)$/);
  if (magiaMatch) {
    const spellId = magiaMatch[1].trim().replace(/\s+/g, '_');
    if (SPELL_LIST.includes(spellId)) return `magia: ${spellId}`;
  }

  return null;
}

// ─────────────────────────────────────────────────────────────
// HANDLER PRINCIPAL
// ─────────────────────────────────────────────────────────────

async function handleDuoReply(sock, message, from, sender, text) {
  try {
    const contextInfo = message.message?.extendedTextMessage?.contextInfo;
    if (!contextInfo) return false;

    const quotedId = contextInfo.stanzaId;
    if (!quotedId) return false;

    if (!duoGame.isDuoMessage(from, quotedId)) return false;

    const duo = duoGame.getDuo(from);
    if (!duo) return false;

    const input = (text || '').trim();
    if (!input) return false;

    if (duo.phase === 'lobby')    return await handleLobbyInput(sock, from, sender, input, duo);
    if (duo.phase === 'fighting') return await handleFightingInput(sock, from, sender, input, duo);

    return false;

  } catch (err) {
    console.error('[DUO HANDLER] Erro inesperado:', err.message);
    if (err.stack) console.error(err.stack);
    return false;
  }
}

// ─────────────────────────────────────────────────────────────
// FASE LOBBY
// ─────────────────────────────────────────────────────────────

async function handleLobbyInput(sock, from, sender, input, duo) {
  const choice = parseInt(input, 10);
  if (choice !== 1 && choice !== 2) return false;

  // Busca o bônus de relíquia do jogador e passa ao joinTeam
  const bonus  = getBattleBonus(sender);
  const result = duoGame.joinTeam(from, sender, choice, bonus);

  if (result.error === 'already_joined') {
    await sock.sendMessage(from, {
      text:     `⚠️ @${sender.split('@')[0]} você já está em um time!`,
      mentions: [sender],
    });
    return true;
  }

  if (result.error === 'team_full') {
    const emoji = choice === 1 ? '🔴' : '🔵';
    await sock.sendMessage(from, {
      text: `⚠️ ${emoji} Time ${choice} já está cheio! Tente o outro time.`,
    });
    return true;
  }

  if (result.error) return true;

  const t1         = duo.team1;
  const t2         = duo.team2;
  const emoji      = choice === 1 ? '🔴' : '🔵';
  const bonusNote  = Object.keys(bonus).length > 0 ? ` 🔮` : '';

  await sock.sendMessage(from, {
    text: [
      `✅ @${sender.split('@')[0]} entrou no ${emoji} *Time ${choice}*!${bonusNote}`,
      ``,
      `🔴 *Time 1:* ${t1.players.length}/2 ${t1.players.map(p => `@${p.jid.split('@')[0]}`).join(', ') || '—'}`,
      `🔵 *Time 2:* ${t2.players.length}/2 ${t2.players.map(p => `@${p.jid.split('@')[0]}`).join(', ') || '—'}`,
      ``,
      t1.players.length < 2 || t2.players.length < 2
        ? `⏳ Aguardando mais jogadores...`
        : `🚀 Todos prontos! Iniciando batalha...`,
    ].join('\n'),
    mentions: [sender, ...t1.players.map(p => p.jid), ...t2.players.map(p => p.jid)],
  });

  if (result.ready) {
    if (duo.lobbyTimeout) { clearTimeout(duo.lobbyTimeout); duo.lobbyTimeout = null; }
    await new Promise(r => setTimeout(r, 1500));
    await startBattleMessage(sock, from, duo);
  }

  return true;
}

// ─────────────────────────────────────────────────────────────
// INÍCIO DA BATALHA
// ─────────────────────────────────────────────────────────────

async function startBattleMessage(sock, from, duo) {
  const result = duoGame.startBattle(from);
  if (result.error) return;

  const t1          = duo.team1;
  const t2          = duo.team2;
  const allMentions = [...t1.players.map(p => p.jid), ...t2.players.map(p => p.jid)];

  const msg = await sock.sendMessage(from, {
    text: [
      `━━━━━━━━━━━━━━━━━━`,
      `⚔️ *BATALHA DUO 2v2 INICIADA!*`,
      `━━━━━━━━━━━━━━━━━━`,
      ``,
      `🔴 *Time 1 — Vermelho*`,
      ...t1.players.map(p => `  👤 @${p.jid.split('@')[0]}${(p.dmgBonus || p.regenPerRound || p.dodgeBonus || p.damageReduction) ? ' 🔮' : ''}`),
      ``,
      `🆚`,
      ``,
      `🔵 *Time 2 — Azul*`,
      ...t2.players.map(p => `  👤 @${p.jid.split('@')[0]}${(p.dmgBonus || p.regenPerRound || p.dodgeBonus || p.damageReduction) ? ' 🔮' : ''}`),
      ``,
      `🔮 _Jogadores com relíquia equipada têm bônus de batalha!_`,
      ``,
      `✨ *Novidade do modo Duo:*`,
      `  • \`curar aliado\` — cura seu parceiro`,
      `  • \`escudo aliado\` — protege seu parceiro`,
      `  • *COMBO*: 30% de chance quando ambos atacam no mesmo round!`,
      ``,
      `⏱️ 45 segundos por round para agir!`,
      duoGame.ACTIONS_HELP,
    ].join('\n'),
    mentions: allMentions,
  });

  duoGame.registerMessageId(from, msg.key.id);
  await new Promise(r => setTimeout(r, 1000));
  await startRound(sock, from, duo);
}

// ─────────────────────────────────────────────────────────────
// FASE FIGHTING
// ─────────────────────────────────────────────────────────────

async function handleFightingInput(sock, from, sender, input, duo) {
  const action = parseAction(input);
  if (!action) return false;

  const result = duoGame.submitAction(from, sender, action);

  if (result.error === 'not_in_duo')    return true;
  if (result.error === 'player_dead') {
    await sock.sendMessage(from, {
      text:     `☠️ @${sender.split('@')[0]} você está fora de combate!`,
      mentions: [sender],
    });
    return true;
  }
  if (result.error === 'already_acted') {
    await sock.sendMessage(from, {
      text:     `⚠️ @${sender.split('@')[0]} você já escolheu sua ação!`,
      mentions: [sender],
    });
    return true;
  }
  if (result.error) return true;

  const allPlayers = [...duo.team1.players, ...duo.team2.players];
  const alive      = allPlayers.filter(p => duoGame.isAlive(p));
  const waiting    = alive.filter(p => p.action === null).map(p => `@${p.jid.split('@')[0]}`);

  await sock.sendMessage(from, {
    text: waiting.length > 0
      ? `✅ @${sender.split('@')[0]} ação registrada! Aguardando: ${waiting.join(', ')}`
      : `✅ @${sender.split('@')[0]} ação registrada!`,
    mentions: [sender],
  });

  if (result.allActed) {
    if (duo.roundTimeout) { clearTimeout(duo.roundTimeout); duo.roundTimeout = null; }
    await new Promise(r => setTimeout(r, 800));
    await resolveAndContinue(sock, from, duo);
  }

  return true;
}

// ─────────────────────────────────────────────────────────────
// INICIA UM ROUND
// ─────────────────────────────────────────────────────────────

async function startRound(sock, from, duoRef) {
  const duo = duoGame.getDuo(from) || duoRef;
  if (!duo || duo.phase !== 'fighting') return;

  const round       = duo.round;
  const allMentions = [...duo.team1.players.map(p => p.jid), ...duo.team2.players.map(p => p.jid)];

  const msg = await sock.sendMessage(from, {
    text: [
      `━━━━━━━━━━━━━━━━━━`,
      `🔥 *ROUND ${round}*`,
      `━━━━━━━━━━━━━━━━━━`,
      ``,
      duoGame.statusBlock(duo),
      duoGame.ACTIONS_HELP,
    ].join('\n'),
    mentions: allMentions,
  });

  duoGame.registerMessageId(from, msg.key.id);

  const timeout = setTimeout(async () => {
    const currentDuo = duoGame.getDuo(from);
    if (!currentDuo || currentDuo.phase !== 'fighting') return;
    if (currentDuo.round !== round) return;

    const allPlayers = [...currentDuo.team1.players, ...currentDuo.team2.players];
    const timedOut   = allPlayers
      .filter(p => duoGame.isAlive(p) && p.action === null)
      .map(p => `@${p.jid.split('@')[0]}`);

    if (timedOut.length > 0) {
      await sock.sendMessage(from, {
        text:     `⏰ Tempo! ${timedOut.join(', ')} ${timedOut.length > 1 ? 'usaram' : 'usou'} *Ataque Leve* automaticamente.`,
        mentions: allMentions,
      });
    }

    await resolveAndContinue(sock, from, currentDuo);
  }, duoGame.DUO_ACTION_TTL_MS);

  const currentDuo = duoGame.getDuo(from);
  if (currentDuo) currentDuo.roundTimeout = timeout;
}

// ─────────────────────────────────────────────────────────────
// RESOLVE ROUND E CONTINUA
// ─────────────────────────────────────────────────────────────

async function resolveAndContinue(sock, from, duo) {
  const current = duoGame.getDuo(from);
  if (!current) return;

  const result = duoGame.processRound(from);
  if (!result || result.error) {
    console.error('[DUO] Erro ao processar round:', result?.error);
    return;
  }

  const allMentions = [
    ...current.team1.players.map(p => p.jid),
    ...current.team2.players.map(p => p.jid),
  ];

  const roundNum = result.ended ? current.round : current.round - 1;

  if (result.log?.length > 0) {
    await sock.sendMessage(from, {
      text: [
        `⚔️ *RESOLUÇÃO — ROUND ${roundNum}*`,
        `━━━━━━━━━━━━━━━━━━`,
        ...result.log,
      ].join('\n'),
      mentions: allMentions,
    });
  }

  if (result.ended) {
    await sendFinalMessage(sock, from, result, allMentions);
    return;
  }

  await new Promise(r => setTimeout(r, 1500));
  const nextDuo = duoGame.getDuo(from);
  if (nextDuo && nextDuo.phase === 'fighting') {
    await startRound(sock, from, nextDuo);
  }
}

// ─────────────────────────────────────────────────────────────
// MENSAGEM FINAL
// ─────────────────────────────────────────────────────────────

async function sendFinalMessage(sock, from, result, mentions) {
  let finalMsg;

  if (result.draw) {
    finalMsg = [
      `━━━━━━━━━━━━━━━━━━`,
      `🤝 *EMPATE ÉPICO!*`,
      `━━━━━━━━━━━━━━━━━━`,
      ``,
      `Ambos os times caíram ao mesmo tempo!`,
      ``,
      `💰 _+30 XP_ para todos pela batalha!`,
    ].join('\n');
  } else {
    const win  = result.winTeam;
    const lose = result.loseTeam;
    finalMsg = [
      `━━━━━━━━━━━━━━━━━━`,
      `🏆 *VITÓRIA!*`,
      `━━━━━━━━━━━━━━━━━━`,
      ``,
      `${win.emoji} *Time ${win.id} — ${win.color}* venceu!`,
      ``,
      `🥇 Vencedores:`,
      ...win.players.map(p => `  👤 @${p.jid.split('@')[0]} ❤️ ${p.hp} HP`),
      ``,
      `💀 Derrotados:`,
      ...lose.players.map(p => `  👤 @${p.jid.split('@')[0]}`),
      ``,
      `💰 Vencedores: _+120 XP_ | Perdedores: _+30 XP_`,
      ``,
      `━━━━━━━━━━━━━━━━━━`,
      `⚔️ Use *!duo* para uma nova batalha!`,
    ].join('\n');
  }

  await sock.sendMessage(from, { text: finalMsg, mentions });
}

module.exports = { handleDuoReply, startRound, resolveAndContinue };
