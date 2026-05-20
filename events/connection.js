'use strict';

const { DisconnectReason } = require('@whiskeysockets/baileys');

// ─────────────────────────────────────────────────────────────
// RECONEXÃO CENTRALIZADA — sem limite de tentativas
// O bot sempre tenta reconectar, exceto em casos fatais
// (logout, sessão substituída, conflito multidevice).
// ─────────────────────────────────────────────────────────────

const BASE_DELAY_MS = 3_000;
const MAX_DELAY_MS  = 60_000;  // teto de 1 min entre tentativas

let attempts        = 0;
let _reconnecting   = false;   // evita disparos duplos

function reconnectDelay() {
  const exp    = Math.min(BASE_DELAY_MS * Math.pow(1.6, attempts), MAX_DELAY_MS);
  const jitter = Math.floor(Math.random() * 2_000);
  return Math.floor(exp + jitter);
}

function handleConnectionUpdate(update, startBot) {
  const { connection, lastDisconnect } = update;

  if (connection === 'connecting') {
    console.log('[CONEXÃO] 🔄 Conectando ao WhatsApp...');
    return;
  }

  if (connection === 'open') {
    attempts      = 0;
    _reconnecting = false;
    console.log('[CONEXÃO] ✅ Conectado com sucesso');
    return;
  }

  if (connection !== 'close') return;

  const statusCode = lastDisconnect?.error?.output?.statusCode;
  const reason     = lastDisconnect?.error?.message || 'motivo desconhecido';

  console.log(`[CONEXÃO] ❌ Desconectado | código: ${statusCode} | ${reason}`);

  // ── Casos fatais — não reconecta ─────────────────────────

  if (statusCode === DisconnectReason.loggedOut) {
    console.error('[CONEXÃO] 🚫 Logout detectado. Delete a pasta auth/ e reinicie.');
    return;
  }

  if (statusCode === DisconnectReason.connectionReplaced) {
    console.error('[CONEXÃO] 🚫 Sessão substituída por outra instância ativa.');
    return;
  }

  if (statusCode === DisconnectReason.multideviceMismatch) {
    console.error('[CONEXÃO] 🚫 Conflito multidevice. Delete auth/ e reinicie.');
    return;
  }

  // ── Reconexão automática sem limite de tentativas ─────────

  if (_reconnecting) {
    console.log('[CONEXÃO] ⚠️ Reconexão já em andamento — ignorando disparo duplo.');
    return;
  }

  _reconnecting = true;
  attempts++;

  const delay = reconnectDelay();

  console.log(
    `[CONEXÃO] ⏳ Reconectando em ${(delay / 1000).toFixed(1)}s ` +
    `(tentativa ${attempts})`
  );

  setTimeout(() => {
    _reconnecting = false;
    startBot().catch(err => {
      console.error('[CONEXÃO] Erro ao reconectar:', err.message);
    });
  }, delay);
}

module.exports = { handleConnectionUpdate };
