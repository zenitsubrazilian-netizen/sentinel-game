'use strict';

// ============================================================
// AI HANDLER — v2.2.0
// Ativação por !sentinel ou autoRespond (grupo 🤖 BOT)
// ============================================================

const { askGroq, popLastUserMessage } = require('../utils/ai.js');
const { selectModels, recordSuccess, recordFailure } = require('../utils/router.js');
const { getGroupContext, captureBotMessage } = require('../utils/groupMemory.js');

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

function extractQuery(body, autoRespond) {
  // Modo auto: usa o body inteiro como query
  if (autoRespond) return body.trim();

  // Modo normal: remove o prefixo !sentinel
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
//
// @param autoRespond {boolean} — quando true, responde qualquer
//   mensagem sem precisar do prefixo !sentinel (grupo 🤖 BOT)
// ─────────────────────────────────────────────────────────────

async function handleAIMessage(sock, message, from, sender, body, senderNum, autoRespond = false) {
  // Decide se deve ativar
  const activated = autoRespond || shouldActivate(body);
  if (!activated) return false;

  const query = extractQuery(body, autoRespond);

  if (!query) {
    // Só avisa sobre query vazia se foi chamado via !sentinel
    if (!autoRespond) {
      await sock.sendMessage(from, { text: MSG_EMPTY_QUERY });
    }
    return autoRespond; // no modo auto, consome a mensagem sem responder
  }

  console.log(`[AI] Ativado por ${senderNum}${autoRespond ? ' (auto)' : ''} | "${query.slice(0, 60)}"`);

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

      try { popLastUserMessage(sender); } catch (_) {}
    }
  }

  console.error('[AI] Todos os modelos falharam. Último erro:', lastError?.message);
  await sock.sendMessage(from, { text: MSG_UNAVAILABLE });
  return true;
}

module.exports = { handleAIMessage };
