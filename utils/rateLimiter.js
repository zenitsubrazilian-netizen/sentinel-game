'use strict';

// ─────────────────────────────────────────────────────────────
// RATE LIMITER — Anti-ban WhatsApp
// ─────────────────────────────────────────────────────────────
// Estratégias:
// 1. Delay mínimo entre mensagens para o mesmo JID
// 2. Jitter aleatório (simula comportamento humano)
// 3. Limite global de mensagens por minuto
// 4. Fila serializada por JID (sem sobreposição)
// ─────────────────────────────────────────────────────────────

const MIN_DELAY_MS          = 800;   // mínimo entre msgs para o mesmo chat
const JITTER_MAX_MS         = 700;   // jitter aleatório adicional
const GLOBAL_MAX_PER_MINUTE = 25;    // máximo global de msgs/min

const lastSentTime  = new Map();  // jid → timestamp do último envio
const jidQueues     = new Map();  // jid → Promise (serialização por chat)

let globalCount       = 0;
let globalWindowStart = Date.now();

// ─────────────────────────────────────────────────────────────
// CONTROLE GLOBAL
// ─────────────────────────────────────────────────────────────

function checkAndCountGlobal() {
  const now = Date.now();
  if (now - globalWindowStart >= 60_000) {
    globalCount       = 0;
    globalWindowStart = now;
  }
  if (globalCount >= GLOBAL_MAX_PER_MINUTE) return false;
  globalCount++;
  return true;
}

async function waitForGlobalSlot() {
  while (!checkAndCountGlobal()) {
    const remaining = 60_000 - (Date.now() - globalWindowStart);
    console.warn(`[RATE] Limite global atingido. Aguardando ${(remaining / 1000).toFixed(1)}s`);
    await sleep(Math.min(remaining + 200, 60_000));
  }
}

// ─────────────────────────────────────────────────────────────
// DELAY POR JID
// ─────────────────────────────────────────────────────────────

function calcDelay(jid) {
  const now     = Date.now();
  const last    = lastSentTime.get(jid) || 0;
  const elapsed = now - last;
  const jitter  = Math.floor(Math.random() * JITTER_MAX_MS);
  return Math.max(0, MIN_DELAY_MS - elapsed) + jitter;
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

// ─────────────────────────────────────────────────────────────
// ENVIO THROTTLED
// Serializa por JID + respeita limites globais
// ─────────────────────────────────────────────────────────────

function throttledSend(jid, sendFn) {
  const prev = jidQueues.get(jid) || Promise.resolve();

  const next = prev.then(async () => {
    await waitForGlobalSlot();

    const delay = calcDelay(jid);
    if (delay > 0) await sleep(delay);

    const result      = await sendFn();
    lastSentTime.set(jid, Date.now());
    return result;

  }).catch(err => { throw err; });

  // Armazena apenas a "cauda" da fila — erros não bloqueiam próximas msgs
  jidQueues.set(jid, next.catch(() => {}));

  return next;
}

// Limpeza periódica de JIDs inativos
setInterval(() => {
  const cutoff = Date.now() - 5 * 60_000;
  for (const [jid, _] of lastSentTime.entries()) {
    if ((lastSentTime.get(jid) || 0) < cutoff) {
      lastSentTime.delete(jid);
      jidQueues.delete(jid);
    }
  }
}, 5 * 60_000);

module.exports = { throttledSend };
