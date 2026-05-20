'use strict';

// ============================================================
// UTILS/WARN.JS — Sistema de advertências
// ============================================================
// CORREÇÕES:
//   - Escrita atômica via rename para evitar corrupção de JSON
//   - withLock aplicado em addWarn/removeWarn/resetWarns
// ============================================================

const fs   = require('fs');
const path = require('path');

const { withLock } = require('./fileQueue.js');

const WARNS_FILE = path.join(__dirname, '..', 'data', 'warns.json');
const MAX_WARNS  = 3;

// ─────────────────────────────────────────────────────────────
// I/O
// ─────────────────────────────────────────────────────────────

function readWarns() {
  try {
    return JSON.parse(fs.readFileSync(WARNS_FILE, 'utf-8'));
  } catch {
    return {};
  }
}

function writeWarns(data) {
  const tmp = WARNS_FILE + '.tmp';
  try {
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf-8');
    fs.renameSync(tmp, WARNS_FILE);
  } catch (error) {
    console.error('[WARN] Erro ao salvar warns.json:', error.message);
  }
}

// ─────────────────────────────────────────────────────────────
// FUNÇÕES PÚBLICAS
// ─────────────────────────────────────────────────────────────

function getWarnData(groupId, userId) {
  const data = readWarns();
  return data[groupId]?.[userId] || { count: 0, reasons: [] };
}

async function addWarn(groupId, userId, reason, warnedBy) {
  return withLock('warns', () => {
    const data = readWarns();

    if (!data[groupId])         data[groupId]         = {};
    if (!data[groupId][userId]) data[groupId][userId] = { count: 0, reasons: [] };

    data[groupId][userId].count++;
    data[groupId][userId].reasons.push({
      reason:   reason || 'Sem motivo informado',
      warnedBy,
      warnedAt: new Date().toISOString(),
    });

    writeWarns(data);
    return data[groupId][userId].count;
  });
}

async function removeWarn(groupId, userId) {
  return withLock('warns', () => {
    const data = readWarns();

    if (!data[groupId]?.[userId] || data[groupId][userId].count === 0) return 0;

    data[groupId][userId].count--;
    data[groupId][userId].reasons.pop();

    if (data[groupId][userId].count === 0) {
      delete data[groupId][userId];
      if (Object.keys(data[groupId]).length === 0) delete data[groupId];
    }

    writeWarns(data);
    return data[groupId]?.[userId]?.count ?? 0;
  });
}

async function resetWarns(groupId, userId) {
  return withLock('warns', () => {
    const data = readWarns();
    if (!data[groupId]?.[userId]) return false;

    delete data[groupId][userId];
    if (Object.keys(data[groupId]).length === 0) delete data[groupId];

    writeWarns(data);
    return true;
  });
}

module.exports = {
  getWarnData,
  addWarn,
  removeWarn,
  resetWarns,
  MAX_WARNS,
};
