'use strict';

// ============================================================
// GAMESESSION.JS — Gerenciador de sessões de minigames v2.2.0
// Suporte a múltiplos usuários simultâneos, TTL automático,
// sem vazamento de memória, logs detalhados
// ============================================================

const SESSION_TTL = 5 * 60_000; // 5 minutos

/** @type {Map<string, object>} */
const sessions = new Map();

// Limpeza automática de sessões expiradas a cada 60s
setInterval(() => {
  const now = Date.now();
  for (const [userId, session] of sessions.entries()) {
    if (now - session._createdAt > SESSION_TTL) {
      sessions.delete(userId);
      console.log(`[SESSION] ⏰ Expirada e removida: ${userId.split('@')[0]} | game: ${session.game}`);
    }
  }
}, 60_000);

/**
 * Cria ou atualiza sessão de um usuário.
 * @param {string} userId
 * @param {object} data
 */
function setSession(userId, data) {
  if (!userId) {
    console.warn('[SESSION] setSession: userId inválido');
    return;
  }
  // _createdAt sempre renovado ao criar/atualizar sessão
  sessions.set(userId, { ...data, _createdAt: Date.now() });
  console.log(`[SESSION] ✅ Sessão criada: ${userId.split('@')[0]} | game: ${data.game} | step: ${data.step}`);
}

/**
 * Retorna sessão ativa ou null se inexistente/expirada.
 * @param {string} userId
 * @returns {object|null}
 */
function getSession(userId) {
  if (!userId) return null;

  const session = sessions.get(userId);

  if (!session) {
    console.log(`[SESSION] ❌ Sem sessão: ${userId.split('@')[0]}`);
    return null;
  }

  if (Date.now() - session._createdAt > SESSION_TTL) {
    sessions.delete(userId);
    console.log(`[SESSION] ⏰ Sessão expirada no get: ${userId.split('@')[0]} | game: ${session.game}`);
    return null;
  }

  console.log(`[SESSION] 🔍 Sessão encontrada: ${userId.split('@')[0]} | game: ${session.game} | step: ${session.step}`);
  return session;
}

/**
 * Verifica se usuário tem sessão ativa.
 * @param {string} userId
 * @returns {boolean}
 */
function hasSession(userId) {
  return getSession(userId) !== null;
}

/**
 * Encerra sessão de um usuário.
 * @param {string} userId
 */
function clearSession(userId) {
  if (!userId) return;
  const session = sessions.get(userId);
  if (session) {
    sessions.delete(userId);
    console.log(`[SESSION] 🗑️  Encerrada: ${userId.split('@')[0]} | game: ${session.game}`);
  }
}

/**
 * Retorna todas as sessões ativas (para diagnóstico).
 * @returns {Map}
 */
function getAllSessions() {
  return sessions;
}

module.exports = { setSession, getSession, hasSession, clearSession, getAllSessions };
