'use strict';

// ============================================================
// MUTE MONITOR — Verifica mutes expirados e notifica o grupo
// Roda a cada 30s | Envia mensagem de desmute automático
// ============================================================

const fs   = require('fs');
const path = require('path');

const MUTES_FILE    = path.join(__dirname, '..', 'data', 'mutes.json');
const CHECK_INTERVAL = 30_000; // verifica a cada 30s

let _getSock     = null;
let _intervalRef = null;

// ─────────────────────────────────────────────────────────────
// I/O (leitura/escrita direta, sem importar mute.js
//  para evitar dependência circular com withLock)
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
  } catch (err) {
    console.error('[MUTE-MONITOR] Erro ao salvar mutes:', err.message);
  }
}

// ─────────────────────────────────────────────────────────────
// VERIFICAÇÃO DE EXPIRADOS
// ─────────────────────────────────────────────────────────────

async function checkExpiredMutes() {
  const sock = typeof _getSock === 'function' ? _getSock() : null;
  if (!sock) return;

  const data    = readMutes();
  const now     = Date.now();
  let   changed = false;

  for (const [groupId, members] of Object.entries(data)) {
    for (const [userId, muteData] of Object.entries(members)) {
      const expiresAt = new Date(muteData.mutedUntil).getTime();

      if (now < expiresAt) continue; // ainda mutado

      // Mute expirou — remove e notifica
      delete data[groupId][userId];
      if (Object.keys(data[groupId]).length === 0) delete data[groupId];
      changed = true;

      const tag = userId.split('@')[0];
      console.log(`[MUTE-MONITOR] ⏰ Mute expirado: ${tag} em ${groupId.slice(0, 15)}`);

      // Envia notificação no grupo
      try {
        await sock.sendMessage(groupId, {
          text: `🔊 @${tag} foi desmutado automaticamente. O tempo de punição chegou ao fim.`,
          mentions: [userId],
        });
      } catch (err) {
        console.error(`[MUTE-MONITOR] Erro ao notificar desmute de ${tag}:`, err.message);
      }
    }
  }

  if (changed) writeMutes(data);
}

// ─────────────────────────────────────────────────────────────
// API PÚBLICA
// ─────────────────────────────────────────────────────────────

function startMuteMonitor(getSockFn) {
  _getSock = getSockFn;

  if (_intervalRef) {
    clearInterval(_intervalRef);
    _intervalRef = null;
  }

  _intervalRef = setInterval(() => {
    checkExpiredMutes().catch(err =>
      console.error('[MUTE-MONITOR] Erro no ciclo:', err.message)
    );
  }, CHECK_INTERVAL);

  console.log('[MUTE-MONITOR] Iniciado — verificando a cada 30s');
}

function stopMuteMonitor() {
  if (_intervalRef) {
    clearInterval(_intervalRef);
    _intervalRef = null;
    console.log('[MUTE-MONITOR] Parado.');
  }
}

module.exports = { startMuteMonitor, stopMuteMonitor };
