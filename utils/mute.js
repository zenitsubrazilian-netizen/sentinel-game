'use strict';

// ============================================================
// UTILS/MUTE.JS — Sistema de silenciamento temporário
// ============================================================
// CORREÇÕES:
//   - Escrita atômica via rename para evitar corrupção de JSON
//   - withLock aplicado em addMute/removeMute/incrementMessageCount
// ============================================================

const fs   = require('fs');
const path = require('path');

const { withLock } = require('./fileQueue.js');

const MUTES_FILE = path.join(__dirname, '..', 'data', 'mutes.json');

// ─────────────────────────────────────────────────────────────
// I/O
// ─────────────────────────────────────────────────────────────

function readMutes() {
  try {
    return JSON.parse(fs.readFileSync(MUTES_FILE, 'utf-8'));
  } catch {
    return {};
  }
}

function writeMutes(data) {
  const tmp = MUTES_FILE + '.tmp';
  try {
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf-8');
    fs.renameSync(tmp, MUTES_FILE);
  } catch (error) {
    console.error('[MUTE] Erro ao salvar mutes.json:', error.message);
  }
}

// ─────────────────────────────────────────────────────────────
// TEMPO
// ─────────────────────────────────────────────────────────────

function parseTime(timeString) {
  const match = timeString.match(/^(\d+)([smhd])$/);
  if (!match) return null;

  const value = parseInt(match[1], 10);
  const unit  = match[2];

  const multipliers = {
    s: 1_000,
    m: 60 * 1_000,
    h: 60 * 60 * 1_000,
    d: 24 * 60 * 60 * 1_000,
  };

  return value * multipliers[unit];
}

function formatTime(ms) {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours   = Math.floor(minutes / 60);
  const days    = Math.floor(hours / 24);

  if (days > 0)    return `${days} dia${days > 1 ? 's' : ''}`;
  if (hours > 0)   return `${hours} hora${hours > 1 ? 's' : ''}`;
  if (minutes > 0) return `${minutes} minuto${minutes > 1 ? 's' : ''}`;
  return `${seconds} segundo${seconds > 1 ? 's' : ''}`;
}

// ─────────────────────────────────────────────────────────────
// FUNÇÕES PÚBLICAS
// ─────────────────────────────────────────────────────────────

function isMuted(groupId, userId) {
  const data = readMutes();
  if (!data[groupId] || !data[groupId][userId]) return null;

  const muteData = data[groupId][userId];

  if (Date.now() >= new Date(muteData.mutedUntil).getTime()) {
    removeMute(groupId, userId).catch(() => {});
    return null;
  }

  return muteData;
}

async function addMute(groupId, userId, timeMs, mutedBy) {
  return withLock('mutes', () => {
    const data = readMutes();
    if (!data[groupId]) data[groupId] = {};

    const now = Date.now();
    data[groupId][userId] = {
      mutedUntil:   new Date(now + timeMs).toISOString(),
      messageCount: 0,
      mutedBy,
      mutedAt:      new Date(now).toISOString(),
    };

    writeMutes(data);
    return true;
  });
}

async function removeMute(groupId, userId) {
  return withLock('mutes', () => {
    const data = readMutes();
    if (!data[groupId] || !data[groupId][userId]) return false;

    delete data[groupId][userId];
    if (Object.keys(data[groupId]).length === 0) delete data[groupId];

    writeMutes(data);
    return true;
  });
}

async function incrementMessageCount(groupId, userId) {
  return withLock('mutes', () => {
    const data = readMutes();
    if (!data[groupId] || !data[groupId][userId]) return 0;

    data[groupId][userId].messageCount++;
    const newCount = data[groupId][userId].messageCount;

    writeMutes(data);
    return newCount;
  });
}

function getMuteList(groupId) {
  const data = readMutes();
  if (!data[groupId]) return [];

  const now    = Date.now();
  const active = [];

  for (const [userId, muteData] of Object.entries(data[groupId])) {
    const expiresAt = new Date(muteData.mutedUntil).getTime();
    if (now < expiresAt) {
      active.push({ userId, ...muteData, remainingMs: expiresAt - now });
    } else {
      removeMute(groupId, userId).catch(() => {});
    }
  }

  return active;
}

module.exports = {
  isMuted,
  addMute,
  removeMute,
  incrementMessageCount,
  getMuteList,
  parseTime,
  formatTime,
};
