'use strict';

// ============================================================
// UTILS/ANTISPAM.JS — Sistema automático de anti-spam
// ============================================================
// CORREÇÕES:
//   - Limpeza periódica do Map de sequências (evita memory leak)
//   - Escrita atômica via rename no antispam.json
//   - withLock em incrementInfraction para evitar race condition
// ============================================================

const fs   = require('fs');
const path = require('path');

const { addMute, isMuted } = require('./mute.js');
const { isGroupAdmin }     = require('./moderation.js');
const { withLock }         = require('./fileQueue.js');

const ANTISPAM_FILE   = path.join(__dirname, '..', 'data', 'antispam.json');

const STICKER_LIMIT   = 7;
const TEXT_LIMIT      = 10;
const TIME_WINDOW_MS  = 10_000;
const SEQUENCE_TTL_MS = 60_000;

const PUNISHMENTS = [
  { type: 'mute', duration: 10 * 60 * 1000, label: '10 minutos' },
  { type: 'mute', duration: 30 * 60 * 1000, label: '30 minutos' },
  { type: 'kick', duration: 0,              label: 'remoção'     },
];

// ─────────────────────────────────────────────────────────────
// I/O
// ─────────────────────────────────────────────────────────────

function readInfractions() {
  try {
    return JSON.parse(fs.readFileSync(ANTISPAM_FILE, 'utf-8'));
  } catch {
    return {};
  }
}

function writeInfractions(data) {
  const tmp = ANTISPAM_FILE + '.tmp';
  try {
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf-8');
    fs.renameSync(tmp, ANTISPAM_FILE);
  } catch (error) {
    console.error('[ANTISPAM] Erro ao salvar antispam.json:', error.message);
  }
}

async function incrementInfraction(groupId, userId) {
  return withLock('antispam', () => {
    const data = readInfractions();

    if (!data[groupId])         data[groupId]         = {};
    if (!data[groupId][userId]) data[groupId][userId] = { count: 0, lastAt: null };

    data[groupId][userId].count++;
    data[groupId][userId].lastAt = new Date().toISOString();

    writeInfractions(data);
    return data[groupId][userId].count;
  });
}

// ─────────────────────────────────────────────────────────────
// SEQUÊNCIAS EM MEMÓRIA
// ─────────────────────────────────────────────────────────────

const sequences = new Map();

function getSequence(groupId, userId) {
  const key = `${groupId}_${userId}`;
  const now = Date.now();

  if (!sequences.has(key)) {
    sequences.set(key, {
      stickerCount:  0,
      lastStickerAt: 0,
      textCount:     0,
      lastText:      '',
      lastTextAt:    0,
      lastActivity:  now,
    });
  }

  const seq = sequences.get(key);
  seq.lastActivity = now;
  return seq;
}

// Limpeza periódica — evita memory leak em grupos grandes
setInterval(() => {
  const cutoff = Date.now() - SEQUENCE_TTL_MS;
  let removed  = 0;

  for (const [key, seq] of sequences.entries()) {
    if (seq.lastActivity < cutoff) {
      sequences.delete(key);
      removed++;
    }
  }

  if (removed > 0) {
    console.log(`[ANTISPAM] Limpeza: ${removed} sequência(s) expirada(s) removida(s)`);
  }
}, 30_000);

function resetStickerSequence(groupId, userId) {
  const seq         = getSequence(groupId, userId);
  seq.stickerCount  = 0;
  seq.lastStickerAt = 0;
}

function resetTextSequence(groupId, userId) {
  const seq      = getSequence(groupId, userId);
  seq.textCount  = 0;
  seq.lastText   = '';
  seq.lastTextAt = 0;
}

// ─────────────────────────────────────────────────────────────
// PUNIÇÃO
// ─────────────────────────────────────────────────────────────

async function applyPunishment(sock, groupId, userId, reason) {
  const infraction  = await incrementInfraction(groupId, userId);
  const punishment  = PUNISHMENTS[Math.min(infraction - 1, PUNISHMENTS.length - 1)];
  const userDisplay = `@${userId.split('@')[0]}`;

  console.log(
    `[ANTISPAM] ${userId} — Infração ${infraction} | Punição: ${punishment.type} | Motivo: ${reason}`
  );

  if (punishment.type === 'mute') {
    await addMute(groupId, userId, punishment.duration, 'system');

    await sock.sendMessage(groupId, {
      text: [
        `🔇 *Anti-spam*`,
        ``,
        `${userDisplay} foi silenciado por ${punishment.label}.`,
        `Motivo: ${reason}`,
        `Infração: ${infraction}/${PUNISHMENTS.length}`,
      ].join('\n'),
      mentions: [userId],
    });

  } else if (punishment.type === 'kick') {
    try {
      await sock.groupParticipantsUpdate(groupId, [userId], 'remove');

      await sock.sendMessage(groupId, {
        text: [
          `🚫 *Anti-spam*`,
          ``,
          `${userDisplay} foi removido por spam excessivo.`,
          `Motivo: ${reason}`,
          `Infração: ${infraction}/${PUNISHMENTS.length}`,
        ].join('\n'),
        mentions: [userId],
      });
    } catch (error) {
      console.error('[ANTISPAM] Erro ao remover por spam:', error.message);
    }
  }
}

// ─────────────────────────────────────────────────────────────
// DETECÇÃO PRINCIPAL
// ─────────────────────────────────────────────────────────────

async function checkSpam(sock, message, groupId, userId) {
  const now        = Date.now();
  const msgContent = message.message;

  const isSticker = !!msgContent?.stickerMessage;
  const rawText   =
    msgContent?.conversation ||
    msgContent?.extendedTextMessage?.text ||
    '';
  const text = rawText.trim().toLowerCase();

  if (isMuted(groupId, userId)) return false;

  const userIsAdmin = await isGroupAdmin(sock, groupId, userId);
  if (userIsAdmin) return false;

  const seq = getSequence(groupId, userId);

  // ── DETECÇÃO 1: Spam de figurinhas ──────────────────────

  if (isSticker) {
    const timeSinceLast = now - seq.lastStickerAt;

    if (seq.lastStickerAt > 0 && timeSinceLast <= TIME_WINDOW_MS) {
      seq.stickerCount++;
    } else {
      seq.stickerCount = 1;
    }

    seq.lastStickerAt = now;
    resetTextSequence(groupId, userId);

    console.log(`[ANTISPAM] ${userId} — Stickers: ${seq.stickerCount}/${STICKER_LIMIT}`);

    if (seq.stickerCount >= STICKER_LIMIT) {
      resetStickerSequence(groupId, userId);
      await applyPunishment(sock, groupId, userId, 'spam de figurinhas');
      return true;
    }

    return false;
  }

  // ── DETECÇÃO 2: Flood de texto repetido ─────────────────

  if (text) {
    const timeSinceLast = now - seq.lastTextAt;
    const sameText      = text === seq.lastText;

    if (sameText && seq.lastTextAt > 0 && timeSinceLast <= TIME_WINDOW_MS) {
      seq.textCount++;
    } else {
      seq.textCount = 1;
      seq.lastText  = text;
    }

    seq.lastTextAt = now;
    resetStickerSequence(groupId, userId);

    console.log(`[ANTISPAM] ${userId} — Texto repetido: ${seq.textCount}/${TEXT_LIMIT}`);

    if (seq.textCount >= TEXT_LIMIT) {
      resetTextSequence(groupId, userId);
      await applyPunishment(sock, groupId, userId, 'flood de mensagens');
      return true;
    }

    return false;
  }

  return false;
}

module.exports = { checkSpam };
