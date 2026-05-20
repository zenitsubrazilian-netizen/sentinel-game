'use strict';

// ============================================================
// UTILS/FILEQUOTA.JS — Fila de acesso exclusivo a arquivos
// Evita race conditions em escritas concorrentes nos JSONs
// ============================================================

const queues = new Map();

/**
 * Executa fn com lock exclusivo na chave fornecida.
 * Garante que apenas uma operação por arquivo rode por vez.
 */
async function withLock(key, fn) {
  if (!queues.has(key)) queues.set(key, Promise.resolve());

  const queue = queues.get(key).then(fn);

  // Mantém a cadeia viva mesmo se fn lançar erro
  queues.set(key, queue.catch(() => {}));

  return queue;
}

module.exports = { withLock };
