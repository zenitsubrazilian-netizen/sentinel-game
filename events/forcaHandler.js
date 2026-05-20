'use strict';

// ============================================================
// FORCA HANDLER v2.1.0
// BUG FIXES:
//   - Verificação robusta de messageIds
//   - Fluxo de resposta sem race condition
//   - Tratamento de erros em cada etapa
// ============================================================

const game       = require('../utils/forcaGame.js');
const MAX_ERRORS = game.MAX_ERRORS || 6;

/**
 * Processa respostas às mensagens do jogo da forca.
 * Retorna true se a mensagem foi consumida pelo handler.
 */
async function handleForcaReply(sock, message, from, sender, text) {
  try {
    // ── Precisa ser uma resposta (reply)
    const contextInfo = message.message?.extendedTextMessage?.contextInfo;
    if (!contextInfo) return false;

    const quotedId = contextInfo.stanzaId;
    if (!quotedId) return false;

    // ── Verifica se é reply de uma mensagem da forca
    if (!game.isGameMessage(from, quotedId)) return false;

    // ── Verifica se há jogo ativo
    if (!game.hasActiveGame(from)) {
      await sock.sendMessage(from, {
        text: '⚠️ Essa partida já foi encerrada.\n\nUse *!forca* para iniciar uma nova.',
      });
      return true;
    }

    const input = (text || '').trim();

    // Ignora vazio ou comandos
    if (!input || input.startsWith('!')) return false;

    // ── Tentativa de palavra (2+ caracteres)
    if (input.length > 1) {
      return await processWordGuess(sock, from, input);
    }

    // ── Tentativa de letra (1 caractere)
    if (input.length === 1 && /[a-zA-ZÀ-ú]/.test(input)) {
      return await processLetterGuess(sock, from, input);
    }

    return false;

  } catch (err) {
    console.error('[FORCA HANDLER] Erro inesperado:', err.message);
    return false;
  }
}

// ─────────────────────────────────────────────────────────────
// PROCESSAMENTO DE LETRA
// ─────────────────────────────────────────────────────────────

async function processLetterGuess(sock, from, letter) {
  const r = game.guessLetter(from, letter);

  if (!r) return false;

  if (r.error === 'no_game') {
    await sock.sendMessage(from, {
      text: '⚠️ Partida encerrada. Use *!forca* para uma nova.',
    });
    return true;
  }

  if (r.error === 'already_guessed') {
    await sock.sendMessage(from, {
      text: `🔄 A letra *${letter.toUpperCase()}* já foi tentada.`,
    });
    return true;
  }

  if (r.error === 'invalid') {
    await sock.sendMessage(from, { text: '❌ Letra inválida.' });
    return true;
  }

  // ── VITÓRIA
  if (r.won) {
    await sock.sendMessage(from, {
      text: [
        r.hangman,
        '',
        '🏆 *PARABÉNS! Você venceu!*',
        '',
        `✅ Palavra: *${r.word}*`,
        '',
        '🎉 +50 XP concedidos!',
        'Use *!forca* para jogar novamente.',
      ].join('\n'),
    });
    return true;
  }

  // ── DERROTA
  if (r.lost) {
    await sock.sendMessage(from, {
      text: [
        r.hangman,
        '',
        '💀 *Game Over!*',
        '',
        `A palavra era: *${r.word}*`,
        '',
        'Use *!forca* para tentar novamente.',
      ].join('\n'),
    });
    return true;
  }

  // ── ACERTO (jogo continua)
  if (r.hit) {
    const lines = [
      r.hangman,
      '',
      `✅ A letra *${r.letter}* está na palavra!`,
      '',
      `📝 *${r.display}*`,
      `❌ Erros: ${r.errors}/${MAX_ERRORS}`,
    ];
    if (r.wrongLetters) lines.push(`🔤 Erradas: ${r.wrongLetters}`);
    lines.push('', '💬 Responda com uma letra ou palavra');

    const sent = await sock.sendMessage(from, { text: lines.join('\n') });
    if (sent?.key?.id) game.updateMessageId(from, sent.key.id);
    return true;
  }

  // ── ERRO (jogo continua)
  const lines = [
    r.hangman,
    '',
    `❌ A letra *${r.letter}* não está na palavra.`,
    '',
    `📝 *${r.display}*`,
    `💔 Vidas restantes: ${MAX_ERRORS - r.errors}/${MAX_ERRORS}`,
    `🔤 Erradas: ${r.wrongLetters || '—'}`,
    '',
    '💬 Responda com uma letra ou palavra',
  ];

  const sent = await sock.sendMessage(from, { text: lines.join('\n') });
  if (sent?.key?.id) game.updateMessageId(from, sent.key.id);
  return true;
}

// ─────────────────────────────────────────────────────────────
// PROCESSAMENTO DE PALAVRA
// ─────────────────────────────────────────────────────────────

async function processWordGuess(sock, from, word) {
  const r = game.guessWord(from, word);

  if (!r) return false;

  if (r.error === 'no_game') {
    await sock.sendMessage(from, {
      text: '⚠️ Partida encerrada. Use *!forca* para uma nova.',
    });
    return true;
  }

  // ── VITÓRIA
  if (r.won) {
    await sock.sendMessage(from, {
      text: [
        '🏆 *PARABÉNS!* Você acertou a palavra!',
        '',
        `✅ Palavra: *${r.word}*`,
        '',
        '🎉 +80 XP concedidos!',
        'Use *!forca* para jogar novamente.',
      ].join('\n'),
    });
    return true;
  }

  // ── DERROTA
  if (r.lost) {
    await sock.sendMessage(from, {
      text: [
        r.hangman,
        '',
        `💀 *Game Over!* Tentativa errada _(-2 vidas)_.`,
        '',
        `A palavra era: *${r.word}*`,
        '',
        'Use *!forca* para tentar novamente.',
      ].join('\n'),
    });
    return true;
  }

  // ── ERROU (jogo continua)
  const lines = [
    r.hangman,
    '',
    `❌ *${word.toUpperCase()}* não é a palavra. _(-2 vidas)_`,
    '',
    `📝 *${r.display}*`,
    `💔 Vidas restantes: ${MAX_ERRORS - r.errors}/${MAX_ERRORS}`,
    `🔤 Erradas: ${r.wrongLetters || '—'}`,
    '',
    '💬 Responda com uma letra ou palavra',
  ];

  const sent = await sock.sendMessage(from, { text: lines.join('\n') });
  if (sent?.key?.id) game.updateMessageId(from, sent.key.id);
  return true;
}

module.exports = { handleForcaReply };
