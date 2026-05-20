'use strict';

// ============================================================
// AI HANDLER — Ativação exclusiva por !sentinel v2.1.0
// BUG FIX: getRecentMessages não existe em groupMemory.js
//          substituído por getGroupContext
// ============================================================

const { askGroq, popLastUserMessage } = require('../utils/ai.js');
const { selectModels, recordSuccess, recordFailure } = require('../utils/router.js');
const { getGroupContext,
  captureBotMessage
} = require('../utils/groupMemory.js');

// ─────────────────────────────────────────────────────────────
// CONFIGURAÇÃO
// ─────────────────────────────────────────────────────────────

const AI_PREFIX       = '!sentinel';
const MSG_UNAVAILABLE = '_deu ruim aqui mn, tenta dnv em instantes_ 💀';
const MSG_EMPTY_QUERY = '_fala aí, pq vc me chamou sem falar nada?_ 🤨';
const TASK            = 'chat';

// ─────────────────────────────────────────────────────────────
// DETECÇÃO DE ATIVAÇÃO
// ─────────────────────────────────────────────────────────────

function shouldActivate(body) {
  return body.toLowerCase().trimStart().startsWith(AI_PREFIX);
}

function extractQuery(body) {
  return body.slice(body.toLowerCase().indexOf(AI_PREFIX) + AI_PREFIX.length).trim();
}

// ─────────────────────────────────────────────────────────────
// CONTEXTO DO GRUPO
// ─────────────────────────────────────────────────────────────

function buildGroupContext(groupId) {
  try {
    const ctx = getGroupContext(groupId);
    if (!ctx) return '';
    console.log(`[AI] Contexto do grupo obtido para ${groupId.slice(0, 15)}`);
    return ctx;
  } catch (err) {
    console.error('[AI] Erro ao obter contexto do grupo:', err.message);
    return '';
  }
}

// ─────────────────────────────────────────────────────────────
// HANDLER PRINCIPAL
// ─────────────────────────────────────────────────────────────

async function handleAIMessage(sock, message, from, sender, body, senderNum) {
  if (!shouldActivate(body)) return false;

  const query = extractQuery(body);

  if (!query) {
    await sock.sendMessage(from, { text: MSG_EMPTY_QUERY });
    return true;
  }

  console.log(`[AI] Ativado por ${senderNum} | "${query.slice(0, 60)}"`);

  const extraContext    = buildGroupContext(from);
  const estimatedTokens = Math.ceil((query.length + extraContext.length) / 3) + 200;

  let candidates;
  try {
    candidates = selectModels(TASK, estimatedTokens);
  } catch (err) {
    console.error('[AI] Erro ao selecionar modelos:', err.message);
    candidates = [];
  }

  if (!candidates || candidates.length === 0) {
    console.warn('[AI] Nenhum modelo disponível');
    await sock.sendMessage(from, { text: MSG_UNAVAILABLE });
    return true;
  }

  let lastError = null;

  for (const { model } of candidates) {
    try {
      console.log(`[AI] Tentando modelo: ${model}`);

      const { reply, tokens, latencyMs } = await askGroq(
        sender,
        query,
        model,
        extraContext,
      );

      recordSuccess(model, tokens, latencyMs);
      console.log(`[AI] ✅ ${model} — ${latencyMs}ms, ${tokens} tokens`);

      await sock.sendMessage(from, { text: reply });
      return true;

    } catch (err) {
      lastError = err;

      const status = err?.status ?? err?.error?.status ?? 0;
      const errMsg = (err?.message ?? '').toLowerCase();

      let reason = 'error';
      if (status === 429 || errMsg.includes('rate limit'))                                   reason = 'rate_limit';
      else if (status === 404 || errMsg.includes('not found'))                               reason = 'not_found';
      else if (status === 403 || errMsg.includes('blocked') || errMsg.includes('forbidden')) reason = 'blocked';
      else if (errMsg.includes('timeout') || errMsg.includes('timed out'))                   reason = 'timeout';

      recordFailure(model, reason);
      console.warn(`[AI] ❌ ${model} falhou (${reason}): ${err.message}`);

      // Remove do histórico para não duplicar na próxima tentativa
      try { popLastUserMessage(sender); } catch (_) {}
    }
  }

  console.error('[AI] Todos os modelos falharam. Último erro:', lastError?.message);
  await sock.sendMessage(from, { text: MSG_UNAVAILABLE });
  return true;
}

module.exports = { handleAIMessage };
