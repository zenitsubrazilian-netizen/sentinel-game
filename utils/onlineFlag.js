'use strict';

// ============================================================
// ONLINE FLAG — Controla o envio único da mensagem de online
//
// CICLO DE VIDA DA FLAG:
//   ./start.sh        → cria  data/.send_online
//   Bot conecta       → lê flag, envia mensagem, APAGA flag
//   Reconexão auto    → flag não existe → silêncio
//   Ctrl+C (SIGINT)   → gracefulShutdown recria flag
//                        (prepara o próximo ./start.sh)
// ============================================================

const fs   = require('fs');
const path = require('path');

const FLAG_PATH = path.join(__dirname, '..', 'data', '.send_online');

function _ensureDir() {
  const dir = path.dirname(FLAG_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

/** Retorna true se a flag existe (mensagem deve ser enviada). */
function shouldSendOnline() {
  try { return fs.existsSync(FLAG_PATH); } catch (_) { return false; }
}

/** Apaga a flag após enviar a mensagem. */
function clearOnlineFlag() {
  try {
    if (fs.existsSync(FLAG_PATH)) fs.unlinkSync(FLAG_PATH);
    console.log('[ONLINE-FLAG] Flag apagada — próximas reconexões serão silenciosas.');
  } catch (err) {
    console.error('[ONLINE-FLAG] Erro ao apagar flag:', err.message);
  }
}

/** Recria a flag — chamado apenas no shutdown por Ctrl+C. */
function setOnlineFlag() {
  try {
    _ensureDir();
    fs.writeFileSync(FLAG_PATH, String(Date.now()), 'utf-8');
    console.log('[ONLINE-FLAG] Flag recriada — próximo ./start.sh enviará mensagem de online.');
  } catch (err) {
    console.error('[ONLINE-FLAG] Erro ao criar flag:', err.message);
  }
}

module.exports = { shouldSendOnline, clearOnlineFlag, setOnlineFlag };
