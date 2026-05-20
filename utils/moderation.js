'use strict';

// ============================================================
// UTILS/MODERATION.JS — Banimentos e verificações de admin
// ============================================================
// CORREÇÕES:
//   - Escrita atômica via rename para evitar corrupção de JSON
//   - isBotAdmin compara tanto phone quanto LID corretamente
//   - withLock aplicado em addBan/removeBan para evitar race condition
// ============================================================

const fs   = require('fs');
const path = require('path');

const config       = require('../config/config.js');
const { withLock } = require('./fileQueue.js');

const BANS_FILE = path.join(__dirname, '..', 'data', 'bans.json');

// ─────────────────────────────────────────────────────────────
// I/O
// ─────────────────────────────────────────────────────────────

function readBans() {
  try {
    return JSON.parse(fs.readFileSync(BANS_FILE, 'utf-8'));
  } catch {
    return {};
  }
}

function writeBans(data) {
  const tmp = BANS_FILE + '.tmp';
  try {
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf-8');
    fs.renameSync(tmp, BANS_FILE);
  } catch (error) {
    console.error('[MODERATION] Erro ao salvar bans.json:', error.message);
  }
}

// ─────────────────────────────────────────────────────────────
// FUNÇÕES PÚBLICAS
// ─────────────────────────────────────────────────────────────

function isBanned(groupId, userId) {
  const data = readBans();
  return !!(data[groupId] && data[groupId][userId]);
}

async function addBan(groupId, userId, name, bannedBy) {
  return withLock('bans', () => {
    const data = readBans();
    if (!data[groupId]) data[groupId] = {};
    if (data[groupId][userId]) return false;

    data[groupId][userId] = {
      name:     name || 'Sem nome',
      bannedAt: new Date().toISOString(),
      bannedBy,
    };
    writeBans(data);
    return true;
  });
}

async function removeBan(groupId, userId) {
  return withLock('bans', () => {
    const data = readBans();
    if (!data[groupId]?.[userId]) return false;

    delete data[groupId][userId];
    if (Object.keys(data[groupId]).length === 0) delete data[groupId];

    writeBans(data);
    return true;
  });
}

function getBanList(groupId) {
  const data = readBans();
  if (!data[groupId]) return [];
  return Object.entries(data[groupId]).map(([userId, info]) => ({
    userId,
    name:     info.name,
    bannedAt: info.bannedAt,
    bannedBy: info.bannedBy,
  }));
}

// ─────────────────────────────────────────────────────────────
// METADADOS E ADMINS
// ─────────────────────────────────────────────────────────────

async function getGroupMetadata(sock, groupId) {
  try {
    return await sock.groupMetadata(groupId);
  } catch {
    return null;
  }
}

async function isGroupAdmin(sock, groupId, userId) {
  const metadata = await getGroupMetadata(sock, groupId);
  if (!metadata) return false;

  const admins = metadata.participants.filter(
    p => p.admin === 'admin' || p.admin === 'superadmin'
  );

  return admins.some(p => p.id === userId || p.lid === userId);
}

async function isBotAdmin(sock, groupId) {
  const metadata = await getGroupMetadata(sock, groupId);
  if (!metadata) return false;

  const botPhone = config.botNumber.replace(/[^0-9]/g, '');
  const botLid   = config.botLid.split('@')[0];

  return metadata.participants.some(p => {
    if (p.admin !== 'admin' && p.admin !== 'superadmin') return false;

    const pPhone = (p.id  || '').split('@')[0];
    const pLid   = (p.lid || '').split('@')[0];

    return (
      pPhone === botPhone ||
      pLid   === botLid
    );
  });
}

module.exports = {
  isBanned,
  addBan,
  removeBan,
  getBanList,
  isGroupAdmin,
  isBotAdmin,
};
