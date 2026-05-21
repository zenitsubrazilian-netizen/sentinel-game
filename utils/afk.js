'use strict';

// ─────────────────────────────────────────────────────────────
// AFK STORE
// key  → sender JID (string)
// value → { reason, since, name }
// ─────────────────────────────────────────────────────────────

const afkMap = new Map();

/**
 * Ativa o AFK de um usuário.
 * @param {string} userId  JID do usuário
 * @param {string} reason  Motivo (pode ser vazio)
 * @param {string} name    Nome/pushName do usuário
 */
function setAfk(userId, reason = '', name = '') {
  afkMap.set(userId, {
    reason:  reason.trim(),
    since:   Date.now(),
    name:    name || userId.replace('@s.whatsapp.net', '').replace('@lid', ''),
  });
}

/**
 * Retorna os dados AFK do usuário ou null se não estiver AFK.
 * @param {string} userId
 * @returns {{ reason: string, since: number, name: string }|null}
 */
function getAfk(userId) {
  return afkMap.get(userId) ?? null;
}

/**
 * Remove o AFK do usuário.
 * @param {string} userId
 * @returns {boolean} true se havia AFK, false se não havia
 */
function removeAfk(userId) {
  return afkMap.delete(userId);
}

/**
 * Verifica se o usuário está AFK.
 * @param {string} userId
 * @returns {boolean}
 */
function isAfk(userId) {
  return afkMap.has(userId);
}

/**
 * Formata tempo ausente em texto legível.
 * @param {number} since  timestamp em ms
 * @returns {string}
 */
function formatAusente(since) {
  const diffMs = Date.now() - since;
  const mins   = Math.floor(diffMs / 60_000);
  const hours  = Math.floor(mins / 60);

  if (hours > 0) return `${hours}h${mins % 60 > 0 ? ` ${mins % 60}min` : ''}`;
  if (mins  > 0) return `${mins}min`;
  return 'agora pouco';
}

module.exports = { setAfk, getAfk, removeAfk, isAfk, formatAusente };
