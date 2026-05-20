'use strict';

// ============================================================
// DUEL HANDLER v3.1.0
// FIX: suporte completo a PvP e vs Sentinel
// FIX: reconhecimento robusto de ações e magias
// FIX: fluxo de turnos estável para todas as dificuldades
// ============================================================

const duelGame = require('../utils/duelGame.js');

// ─────────────────────────────────────────────────────────────
// AÇÕES VÁLIDAS
// ─────────────────────────────────────────────────────────────

const VALID_ACTIONS = new Set([
  'ataque leve',
  'ataque pesado',
  'defesa',
  'esquiva',
  'contra-ataque',
  'break guard',
  'focus',
  'usar item',
  'ultimate',
]);

function parseAction(input) {
  const clean = input.trim().toLowerCase();

  // Ação direta
  if (VALID_ACTIONS.has(clean)) return clean;

  // Magia: aceita "magia: nome", "magia:nome", "magia nome"
  const magiaMatch = clean.match(/^magia[:\s]+(.+)$/);
  if (magiaMatch) {
    const spellId = magiaMatch[1].trim().replace(/\s+/g, '_');
    if (duelGame.SPELL_LIST.includes(spellId)) {
      return `magia: ${spellId}`;
    }
  }

  return null; // ação inválida
}

// ─────────────────────────────────────────────────────────────
// HANDLER PRINCIPAL — chamado pelo handler.js
// ─────────────────────────────────────────────────────────────

async function handleDuelReply(sock, message, from, sender, text) {
  try {
    const contextInfo = message.message?.extendedTextMessage?.contextInfo;
    if (!contextInfo) return false;

    const quotedId = contextInfo.stanzaId;
    if (!quotedId) return false;

    if (!duelGame.isDuelMessage(from, quotedId)) return false;

    const duel = duelGame.getDuel(from);
    if (!duel) return false;

    const input = (text || '').trim();
    if (!input) return false;

    // ── FASE WAITING: aguarda "eu aceito" do desafiado (PvP)
    if (duel.phase === 'waiting') {
      return await handleWaitingPhase(sock, from, sender, input, duel);
    }

    // ── FASE FIGHTING: processa ação do jogador
    if (duel.phase === 'fighting') {
      return await handleFightingPhase(sock, from, sender, input, duel);
    }

    return false;

  } catch (err) {
    console.error('[DUEL HANDLER] Erro inesperado:', err.message);
    if (err.stack) console.error(err.stack);
    return false;
  }
}

// ─────────────────────────────────────────────────────────────
// FASE WAITING (PvP — aguarda aceitação)
// ─────────────────────────────────────────────────────────────

async function handleWaitingPhase(sock, from, sender, input, duel) {
  // Só o desafiado pode aceitar
  if (sender !== duel.challenged.jid) return true;
  if (input.toLowerCase() !== 'eu aceito') return true;

  const result = duelGame.acceptDuel(from);
  if (result.error) return true;

  if (duel.acceptTimeout) {
    clearTimeout(duel.acceptTimeout);
    duel.acceptTimeout = null;
  }

  const p1Num = duel.challenger.jid.split('@')[0];
  const p2Num = duel.challenged.jid.split('@')[0];

  const msg = await sock.sendMessage(from, {
    text: [
      `✅ @${p2Num} *aceitou o duelo!*`,
      ``,
      `━━━━━━━━━━━━━━━━━━`,
      `⚔️ *DUELO INICIADO!*`,
      `━━━━━━━━━━━━━━━━━━`,
      ``,
      `👤 @${p1Num} vs 👤 @${p2Num}`,
      ``,
      `❤️ HP: 120 | 🔵 Mana: 60 | ⚡ Energia: 50 | 🧪 Poções: 2`,
      `⏱️ 45 segundos por round para agir!`,
      duelGame.ACTIONS_HELP,
    ].join('\n'),
    mentions: [duel.challenger.jid, duel.challenged.jid],
  });

  duelGame.registerMessageId(from, msg.key.id);
  await startRound(sock, from, duel, result.duel);
  return true;
}

// ─────────────────────────────────────────────────────────────
// FASE FIGHTING (processa ação do jogador)
// ─────────────────────────────────────────────────────────────

async function handleFightingPhase(sock, from, sender, input, duel) {
  const action = parseAction(input);

  // Ação não reconhecida — ignora silenciosamente
  if (!action) return false;

  const result = duelGame.submitAction(from, sender, action);

  if (result.error === 'not_in_duel')   return true;
  if (result.error === 'wrong_phase')   return true;
  if (result.error === 'no_duel')       return true;

  if (result.error === 'already_acted') {
    const num = sender.split('@')[0];
    await sock.sendMessage(from, {
      text:     `⚠️ @${num} você já escolheu sua ação neste round!`,
      mentions: [sender],
    });
    return true;
  }

  if (result.error) return true;

  // Confirma ação registrada
  const num = sender.split('@')[0];
  await sock.sendMessage(from, {
    text:     `✅ @${num} ação registrada: *${action}*`,
    mentions: [sender],
  });

  // Cancela timeout se ambos agiram (PvP) ou se é vs bot (age sempre)
  if (result.bothActed || duel.isVsBot) {
    if (duel.roundTimeout) {
      clearTimeout(duel.roundTimeout);
      duel.roundTimeout = null;
    }

    // Pequeno delay para não sobrepor mensagens
    await new Promise(r => setTimeout(r, 800));
    await resolveAndContinue(sock, from, duel);
  }

  return true;
}

// ─────────────────────────────────────────────────────────────
// INICIA UM ROUND
// ─────────────────────────────────────────────────────────────

async function startRound(sock, from, duelRef, freshDuel) {
  // Busca o estado mais recente do duelo
  const duel  = duelGame.getDuel(from) || freshDuel || duelRef;
  if (!duel || duel.phase !== 'fighting') return;

  const round = duel.round;

  const mentions = [];
  if (!duel.challenger.isBot) mentions.push(duel.challenger.jid);
  if (!duel.challenged.isBot) mentions.push(duel.challenged.jid);

  const msg = await sock.sendMessage(from, {
    text: [
      `━━━━━━━━━━━━━━━━━━`,
      `🔥 *ROUND ${round}*`,
      `━━━━━━━━━━━━━━━━━━`,
      ``,
      duelGame.statusBlock(duel.challenger, duel.challenged),
      duelGame.ACTIONS_HELP,
    ].join('\n'),
    mentions,
  });

  duelGame.registerMessageId(from, msg.key.id);

  // ── ESCOLHE AÇÃO DO SENTINEL (se for vs bot)
  if (duel.isVsBot) {
    let botAction = 'ataque leve';
    try {
      botAction = await duelGame.chooseBotActionAsync(duel);
      console.log(`[DUEL] Sentinel escolheu: "${botAction}" (${duel.difficulty})`);
    } catch (err) {
      console.error('[DUEL] Erro ao escolher ação do Sentinel:', err.message);
      botAction = 'ataque leve';
    }

    // Registra ação do bot diretamente no estado
    const currentDuel = duelGame.getDuel(from);
    if (currentDuel && currentDuel.phase === 'fighting') {
      currentDuel.challenged.action = botAction;
    }
  }

  // ── TIMEOUT DO ROUND
  const timeout = setTimeout(async () => {
    const currentDuel = duelGame.getDuel(from);
    if (!currentDuel || currentDuel.phase !== 'fighting') return;
    if (currentDuel.round !== round) return;

    const p1 = currentDuel.challenger;
    const p2 = currentDuel.challenged;
    const timedOut = [];

    if (!p1.isBot && p1.action === null) {
      timedOut.push(`@${p1.jid.split('@')[0]}`);
    }
    if (!p2.isBot && p2.action === null) {
      timedOut.push(`@${p2.jid.split('@')[0]}`);
    }

    if (timedOut.length > 0) {
      await sock.sendMessage(from, {
        text:     `⏰ Tempo esgotado! ${timedOut.join(' e ')} usou *Ataque Leve* automaticamente.`,
        mentions: mentions,
      });
    }

    await resolveAndContinue(sock, from, currentDuel);
  }, duelGame.ACTION_TTL_MS);

  // Salva referência do timeout
  const currentDuel = duelGame.getDuel(from);
  if (currentDuel) currentDuel.roundTimeout = timeout;
}

// ─────────────────────────────────────────────────────────────
// RESOLVE ROUND E CONTINUA OU ENCERRA
// ─────────────────────────────────────────────────────────────

async function resolveAndContinue(sock, from, duel) {
  // Verifica se o duelo ainda existe
  const currentDuel = duelGame.getDuel(from);
  if (!currentDuel) return;

  const result = duelGame.processRound(from);
  if (!result || result.error) {
    console.error('[DUEL] Erro ao processar round:', result?.error);
    return;
  }

  const p1 = result.p1;
  const p2 = result.p2;

  const mentions = [
    ...(p1.isBot ? [] : [p1.jid]),
    ...(p2.isBot ? [] : [p2.jid]),
  ];

  const roundNum = result.ended ? duel.round : duel.round - 1;

  // ── Envia log do round
  if (result.log && result.log.length > 0) {
    await sock.sendMessage(from, {
      text: [
        `⚔️ *RESOLUÇÃO — ROUND ${roundNum}*`,
        `━━━━━━━━━━━━━━━━━━`,
        ...result.log,
      ].join('\n'),
      mentions,
    });
  }

  // ── FIM DO DUELO
  if (result.ended) {
    await sendFinalMessage(sock, from, result, p1, p2, mentions);
    return;
  }

  // ── PRÓXIMO ROUND — delay para legibilidade
  await new Promise(r => setTimeout(r, 1200));

  const nextDuel = duelGame.getDuel(from);
  if (nextDuel && nextDuel.phase === 'fighting') {
    await startRound(sock, from, nextDuel, null);
  }
}

// ─────────────────────────────────────────────────────────────
// MENSAGEM FINAL
// ─────────────────────────────────────────────────────────────

async function sendFinalMessage(sock, from, result, p1, p2, mentions) {
  let finalMsg;

  if (result.draw) {
    finalMsg = [
      `━━━━━━━━━━━━━━━━━━`,
      `🤝 *EMPATE!*`,
      `━━━━━━━━━━━━━━━━━━`,
      ``,
      `Ambos caíram ao mesmo tempo!`,
      ``,
      `${p1.isBot ? '🤖 Sentinel' : `@${p1.jid.split('@')[0]}`} ❤️ ${p1.hp} HP`,
      `${p2.isBot ? '🤖 Sentinel' : `@${p2.jid.split('@')[0]}`} ❤️ ${p2.hp} HP`,
      ``,
      `💰 _+20 XP_ de participação para ambos.`,
    ].join('\n');

  } else {
    const winner = result.winner;
    const loser  = winner.jid === p1.jid ? p2 : p1;

    const wLabel = winner.isBot ? '🤖 *Sentinel*' : `@${winner.jid.split('@')[0]}`;
    const lLabel = loser.isBot  ? '🤖 *Sentinel*' : `@${loser.jid.split('@')[0]}`;

    finalMsg = [
      `━━━━━━━━━━━━━━━━━━`,
      `🏆 *VITÓRIA!*`,
      `━━━━━━━━━━━━━━━━━━`,
      ``,
      `🥇 ${wLabel} *venceu o duelo!*`,
      ``,
      `❤️ HP restante: ${winner.hp}/${winner.maxHp}`,
      `💀 ${lLabel} foi derrotado!`,
      ``,
      winner.isBot
        ? `😔 Você perdeu para o Sentinel. _+25 XP_ de participação.`
        : `🎉 _+100 XP_ para o vencedor! _+25 XP_ para o perdedor.`,
      ``,
      `━━━━━━━━━━━━━━━━━━`,
      `⚔️ Use *!duel* para um novo duelo.`,
    ].join('\n');
  }

  await sock.sendMessage(from, { text: finalMsg, mentions });
}

module.exports = { handleDuelReply, startRound, resolveAndContinue };
