'use strict';

// ============================================================
// XP HANDLER v2.2.0
// FIXES: canGainXP verificado ANTES de chamar addXP,
//        try/catch em cada etapa, logs descritivos
// ============================================================

const {
  CONFIG,
  getUser,
  updateUser,
  canGainXP,
  addXP,
  updateStreak,
  xpForLevel,
  getRank,
} = require('../utils/economy.js');

const { checkAchievements }           = require('../utils/achievements.js');
const { MAIN_GROUP, SENTINEL_PREFIX } = require('../config/system.js');

const XP_RANGES = {
  text:  { min: 5,  max: 15 },
  image: { min: 15, max: 25 },
  video: { min: 25, max: 35 },
};

function randXP(type) {
  const r = XP_RANGES[type] || XP_RANGES.text;
  return Math.floor(Math.random() * (r.max - r.min + 1)) + r.min;
}

function detectContentType(message) {
  const msg = message?.message || {};
  if (msg.imageMessage)                          return 'image';
  if (msg.videoMessage)                          return 'video';
  if (msg.documentMessage)                       return 'text';
  if (msg.extendedTextMessage || msg.conversation) return 'text';
  return 'text';
}

// ── Anti-spam interno ──────────────────────────────────────
const spamDetector = new Map();
const SPAM_WINDOW  = 10_000;
const SPAM_LIMIT   = 5;

setInterval(() => {
  const now = Date.now();
  for (const [id, d] of spamDetector.entries()) {
    if (now > d.resetAt + SPAM_WINDOW) spamDetector.delete(id);
  }
}, 60_000);

function isSpam(userId) {
  const now = Date.now();
  if (!spamDetector.has(userId)) {
    spamDetector.set(userId, { count: 1, resetAt: now + SPAM_WINDOW });
    return false;
  }
  const d = spamDetector.get(userId);
  if (now > d.resetAt) { d.count = 1; d.resetAt = now + SPAM_WINDOW; return false; }
  d.count++;
  return d.count > SPAM_LIMIT;
}

function isValidMessage(text) {
  if (!text || typeof text !== 'string') return false;
  const clean  = text.trim();
  const minLen = CONFIG?.minMessageLen || 3;
  if (clean.length < minLen)            return false;
  if (/^[\p{Emoji}\s]+$/u.test(clean))  return false;
  if (/^[.,!?;:\-_]+$/.test(clean))     return false;
  return true;
}

// ─────────────────────────────────────────────────────────────
// HANDLER PRINCIPAL
// ─────────────────────────────────────────────────────────────

async function handleXPGain(sock, message, from, sender, text) {
  try {
    if (from !== MAIN_GROUP)        return;
    if (message.key?.fromMe)        return;
    if (!sender)                    return;
    if (!isValidMessage(text))      return;
    if (isSpam(sender))             return;

    let user;
    try { user = getUser(sender); } catch (err) {
      console.error('[XP] getUser error:', err.message); return;
    }
    if (!user) return;

    // ── Verifica cooldown ANTES de fazer qualquer coisa ──
    if (typeof canGainXP === 'function' && !canGainXP(user)) return;

    // ── Streak ──
    try { if (typeof updateStreak === 'function') updateStreak(sender); } catch (_) {}

    // ── Calcula e aplica XP ──
    const contentType = detectContentType(message);
    const baseXP      = randXP(contentType);
    let result;
    try {
      result = addXP(sender, baseXP, 'message');
    } catch (err) {
      console.error('[XP] addXP error:', err.message); return;
    }

    // ── Incrementa contadores ──
    try {
      const fresh = getUser(sender);
      if (!fresh.stats) fresh.stats = {};
      fresh.messages            = (fresh.messages            || 0) + 1;
      fresh.stats.totalMessages = (fresh.stats.totalMessages || 0) + 1;
      updateUser(sender, fresh);
    } catch (err) {
      console.error('[XP] contador error:', err.message);
    }

    // ── Conquistas ──
    let achievements = [];
    try {
      achievements = checkAchievements(sender) || [];
    } catch (err) {
      console.error('[XP] checkAchievements error:', err.message);
    }

    // ── Level up ──
    if (result?.leveledUp) {
      try { await sendLevelUpMessage(sock, from, sender, result.leveledUp); }
      catch (err) { console.error('[XP] levelUp msg error:', err.message); }
    }

    // ── Notifica conquistas com delay ──
    if (achievements.length > 0) {
      setTimeout(async () => {
        for (const ach of achievements) {
          try {
            await sendAchievementUnlocked(sock, from, sender, ach);
            await new Promise(r => setTimeout(r, 1200));
          } catch (err) {
            console.error('[XP] achievement msg error:', err.message);
          }
        }
      }, 2000);
    }
  } catch (err) {
    console.error('[XP] handleXPGain error:', err.message);
  }
}

// ─────────────────────────────────────────────────────────────
// LEVEL UP
// ─────────────────────────────────────────────────────────────

async function sendLevelUpMessage(sock, groupId, userId, levelData) {
  try {
    const { level, reward, rank } = levelData;
    const user     = getUser(userId);
    const coinSym  = CONFIG?.coinSymbol || 'Z¢';
    const xpCur    = user.xp    || 0;
    const xpNeeded = typeof xpForLevel === 'function' ? xpForLevel(level) : 1;
    const progress = Math.min(10, Math.floor((xpCur / xpNeeded) * 10));
    const bar      = '█'.repeat(progress) + '░'.repeat(10 - progress);
    const pct      = Math.min(100, Math.floor((xpCur / xpNeeded) * 100));
    const streak   = user.streak || 0;
    const rankLbl  = rank || (typeof getRank === 'function' ? getRank(level) : '—');

    const unlocks = [];
    if (level === 10)  unlocks.push('🛒 Loja desbloqueada');
    if (level === 25)  unlocks.push('✨ Sistema de auras');
    if (level === 50)  unlocks.push('🏆 Molduras lendárias');
    if (level === 100) unlocks.push('👑 Prestígio disponível');

    const body = [
      `╭━━━〔 📈 *LEVEL UP* 📈 〕━━━╮`,
      `┃`,
      `┃ 👤 *Usuário:* @${userId.split('@')[0]}`,
      `┃ ⭐ *Novo nível:* ${level}`,
      `┃ 🎖️ *Patente:* ${rankLbl}`,
      `┃ 💰 *Recompensa:* +${reward || 0} ${coinSym}`,
      `┃ 🔥 *Streak:* ${streak} dia${streak !== 1 ? 's' : ''}`,
      `┃`,
      `┃ 📊 *Progresso:* [${bar}] ${pct}%`,
      ...(unlocks.length > 0
        ? [`┃`, `┃ ✨ *Desbloqueios:*`, ...unlocks.map(u => `┃    ${u}`)]
        : []),
      `┃`,
      `╰━━━━━━━━━━━━━━━━━━━━━╯`,
    ].join('\n');

    await sock.sendMessage(groupId, {
      text:     SENTINEL_PREFIX + body,
      mentions: [userId],
    });
  } catch (err) {
    console.error('[XP] sendLevelUpMessage error:', err.message);
  }
}

// ─────────────────────────────────────────────────────────────
// CONQUISTA DESBLOQUEADA
// ─────────────────────────────────────────────────────────────

async function sendAchievementUnlocked(sock, groupId, userId, achievement) {
  try {
    const coinSym = CONFIG?.coinSymbol || 'Z¢';
    const rewards = [];
    if (achievement.reward?.coins) rewards.push(`💰 +${achievement.reward.coins} ${coinSym}`);
    if (achievement.reward?.xp)    rewards.push(`📈 +${achievement.reward.xp} XP`);
    if (achievement.reward?.item)  rewards.push(`✨ Item especial desbloqueado`);
    if (rewards.length === 0)      rewards.push('🎖️ Título exclusivo');

    const body = [
      `╭━━━〔 🏆 *CONQUISTA DESBLOQUEADA* 🏆 〕━━━╮`,
      `┃`,
      `┃ ${achievement.icon || '🏅'} *${achievement.name}*`,
      `┃ ${achievement.description}`,
      `┃`,
      `┃ 🎁 *Recompensas:*`,
      ...rewards.map(r => `┃    ${r}`),
      `┃`,
      `╰━━━━━━━━━━━━━━━━━━━━━╯`,
    ].join('\n');

    await sock.sendMessage(groupId, {
      text:     SENTINEL_PREFIX + body,
      mentions: [userId],
    });
  } catch (err) {
    console.error('[XP] sendAchievementUnlocked error:', err.message);
  }
}

module.exports = { handleXPGain };
