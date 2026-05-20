'use strict';

// ============================================================
// SHUTDOWN NOTIFIER — Envia mensagem de offline de forma síncrona
// Usa arquivo de estado + script separado para garantir entrega
// ============================================================

const fs   = require('fs');
const path = require('path');

const STATE_FILE = path.join(__dirname, '..', 'data', 'shutdown-state.json');

function saveShutdownState(groupId, authFolder) {
  const dir = path.dirname(STATE_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  fs.writeFileSync(STATE_FILE, JSON.stringify({
    groupId,
    authFolder,
    pendingOffline: true,
    ts: Date.now(),
  }), 'utf-8');
}

function clearShutdownState() {
  try {
    if (fs.existsSync(STATE_FILE)) fs.unlinkSync(STATE_FILE);
  } catch {}
}

function getShutdownState() {
  try {
    const data = JSON.parse(fs.readFileSync(STATE_FILE, 'utf-8'));
    // Ignora se for muito antigo (mais de 5 minutos)
    if (Date.now() - data.ts > 5 * 60_000) {
      clearShutdownState();
      return null;
    }
    return data;
  } catch {
    return null;
  }
}

module.exports = { saveShutdownState, clearShutdownState, getShutdownState };
