'use strict';

// ============================================================
// ROUTER.JS — Roteador dinâmico v2.5
// ============================================================

const MODELS = {

  'llama-3.3-70b-versatile': {
    rpm: 30, rpd: 1000, tpm: 12000, tpd: 100000,
    strength: 95, speed: 72,
  },
  'openai/gpt-oss-120b': {
    rpm: 30, rpd: 1000, tpm: 8000, tpd: 200000,
    strength: 93, speed: 60,
  },
  'meta-llama/llama-4-scout-17b-16e-instruct': {
    rpm: 30, rpd: 1000, tpm: 30000, tpd: 500000,
    strength: 88, speed: 82,
  },
  'qwen/qwen3-32b': {
    rpm: 60, rpd: 1000, tpm: 6000, tpd: 500000,
    strength: 85, speed: 75,
  },
  'groq/compound': {
    rpm: 30, rpd: 250, tpm: 70000, tpd: null,
    strength: 82, speed: 80,
  },
  'compound-beta': {
    rpm: 30, rpd: 250, tpm: 70000, tpd: null,
    strength: 80, speed: 80,
  },
  'openai/gpt-oss-20b': {
    rpm: 30, rpd: 1000, tpm: 8000, tpd: 200000,
    strength: 78, speed: 82,
  },
  'groq/compound-mini': {
    rpm: 30, rpd: 250, tpm: 70000, tpd: null,
    strength: 68, speed: 90,
  },
  'compound-beta-mini': {
    rpm: 30, rpd: 250, tpm: 70000, tpd: null,
    strength: 66, speed: 90,
  },
  'llama-3.1-8b-instant': {
    rpm: 30, rpd: 14400, tpm: 6000, tpd: 500000,
    strength: 65, speed: 97,
  },

};

const TASK_MIN_STRENGTH = {
  chat:     65,
  chatCaos: 65,
  calcular: 78,
  resumir:  65,
  traduzir: 60,
  corrigir: 60,
};

// ─────────────────────────────────────────────────────────────
// CIRCUIT BREAKER — configuração
// ─────────────────────────────────────────────────────────────

// Janela de tempo para contar falhas (60s)
// Falhas fora dessa janela não contam para o CB
const CB_WINDOW_MS       = 60_000;

// Quantas falhas dentro da janela disparam o CB
const CB_THRESHOLD       = 5;

// Tempos de bloqueio por tipo de erro
const CB_TIMEOUT_MS      = 90_000;
const NOT_FOUND_BLOCK_MS = 24 * 60 * 60 * 1_000;
const BLOCKED_BLOCK_MS   = 60 * 60 * 1_000;

// ─────────────────────────────────────────────────────────────
// HEALTH STATE
// ─────────────────────────────────────────────────────────────

const health = {};

function initHealth(model) {
  if (!health[model]) {
    health[model] = {
      score:        100,
      successes:    0,
      failures:     0,
      failureLog:   [],   // timestamps de falhas recentes (janela CB_WINDOW_MS)
      lastLatency:  0,
      blockedUntil: null,
      rpmLog:       [],
      tpmLog:       [],
      rpdCount:     0,
      tpdTokens:    0,
      dayResetAt:   getNextMidnight(),
    };
  }
}

function getNextMidnight() {
  const d = new Date();
  return new Date(Date.UTC(
    d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1
  ));
}

function checkDayReset(model) {
  const h = health[model];
  if (new Date() >= h.dayResetAt) {
    h.rpdCount   = 0;
    h.tpdTokens  = 0;
    h.dayResetAt = getNextMidnight();
    console.log(`[ROUTER] Reset diário: ${model}`);
  }
}

function prune(model) {
  const h   = health[model];
  const min = Date.now() - 60_000;
  h.rpmLog     = h.rpmLog.filter(t => t > min);
  h.tpmLog     = h.tpmLog.filter(t => t.at > min);
  // Prune do failureLog usa a própria janela do CB
  const cbMin  = Date.now() - CB_WINDOW_MS;
  h.failureLog = h.failureLog.filter(t => t > cbMin);
}

// ─────────────────────────────────────────────────────────────
// CAPACIDADE
// ─────────────────────────────────────────────────────────────

function hasCapacity(model, estimatedTokens = 300) {
  const limits = MODELS[model];
  const h      = health[model];

  checkDayReset(model);
  prune(model);

  if (h.rpmLog.length >= limits.rpm * 0.85)                            return false;
  if (h.rpdCount >= limits.rpd * 0.9)                                  return false;

  const tpmUsed = h.tpmLog.reduce((s, t) => s + t.tokens, 0);
  if (tpmUsed + estimatedTokens > limits.tpm * 0.8)                    return false;

  if (limits.tpd && h.tpdTokens + estimatedTokens > limits.tpd * 0.9) return false;

  return true;
}

// ─────────────────────────────────────────────────────────────
// CIRCUIT BREAKER
// ─────────────────────────────────────────────────────────────

function isBlocked(model) {
  const h = health[model];
  if (!h.blockedUntil) return false;

  if (Date.now() >= h.blockedUntil) {
    h.blockedUntil = null;
    h.failures     = 0;
    h.failureLog   = [];
    h.score        = Math.min(h.score + 20, 100);
    console.log(`[ROUTER] ♻️  Expirado: ${model.split('/').pop()}`);
    return false;
  }

  return true;
}

// ─────────────────────────────────────────────────────────────
// SCORE DINÂMICO
// ─────────────────────────────────────────────────────────────

function calculateScore(model, estimatedTokens) {
  const limits = MODELS[model];
  const h      = health[model];

  checkDayReset(model);
  prune(model);

  let score = limits.strength;

  const total = h.successes + h.failures;
  if (total > 0) {
    const successRate = h.successes / total;
    score += (successRate - 0.5) * 30;
  }

  if (h.lastLatency > 3000) score -= 10;
  if (h.lastLatency > 5000) score -= 20;

  const rpmUsed = h.rpmLog.length / limits.rpm;
  score -= rpmUsed * 20;

  if (limits.tpd) {
    const tpdUsed = h.tpdTokens / limits.tpd;
    score -= tpdUsed * 30;
  }

  score += (limits.speed - 75) * 0.2;

  return Math.max(0, Math.min(100, score));
}

// ─────────────────────────────────────────────────────────────
// SELEÇÃO DE MODELOS
// ─────────────────────────────────────────────────────────────

function selectModels(task, estimatedTokens = 300, forceAll = false) {
  const minStrength = TASK_MIN_STRENGTH[task] || 60;

  const candidates = Object.keys(MODELS)
    .filter(model => {
      initHealth(model);
      if (isBlocked(model))                                          return false;
      if (!hasCapacity(model, estimatedTokens))                      return false;
      if (!forceAll && MODELS[model].strength < minStrength)         return false;
      return true;
    })
    .map(model => ({
      model,
      score: calculateScore(model, estimatedTokens),
    }))
    .sort((a, b) => b.score - a.score);

  if (candidates.length === 0 && !forceAll) {
    return Object.keys(MODELS)
      .filter(model => !isBlocked(model) && hasCapacity(model, estimatedTokens))
      .map(model => ({ model, score: calculateScore(model, estimatedTokens) }))
      .sort((a, b) => b.score - a.score);
  }

  return candidates;
}

// ─────────────────────────────────────────────────────────────
// REGISTRO DE RESULTADO
// ─────────────────────────────────────────────────────────────

function recordSuccess(model, tokens, latencyMs) {
  initHealth(model);
  const h   = health[model];
  const now = Date.now();

  h.successes++;
  h.lastLatency = latencyMs;
  h.rpmLog.push(now);
  h.rpdCount++;
  h.tpmLog.push({ tokens, at: now });
  h.tpdTokens += tokens;
  h.score = Math.min(100, h.score + 5);
}

function recordFailure(model, reason) {
  initHealth(model);
  const h   = health[model];
  const now = Date.now();

  h.failures++;
  h.score = Math.max(0, h.score - 15);

  // Erros permanentes/externos: bloqueia imediatamente, sem usar CB_THRESHOLD
  if (reason === 'not_found') {
    h.blockedUntil = now + NOT_FOUND_BLOCK_MS;
    console.error(`[ROUTER] ❌ Não encontrado: ${model.split('/').pop()} — 24h`);
    return;
  }

  if (reason === 'blocked') {
    h.blockedUntil = now + BLOCKED_BLOCK_MS;
    console.error(`[ROUTER] 🔒 Bloqueado: ${model.split('/').pop()} — 1h`);
    return;
  }

  if (reason === 'rate_limit') {
    h.score = Math.max(0, h.score - 5);
    return;
  }

  // Erros genéricos (error, timeout): usa janela deslizante
  // Só dispara CB se acumulou CB_THRESHOLD falhas nos últimos CB_WINDOW_MS
  h.failureLog.push(now);
  const cbMin         = now - CB_WINDOW_MS;
  const recentFails   = h.failureLog.filter(t => t > cbMin).length;

  if (recentFails >= CB_THRESHOLD) {
    h.failureLog   = [];   // reseta janela após disparar
    h.blockedUntil = now + CB_TIMEOUT_MS;
    console.warn(`[ROUTER] ⚡ Circuit breaker: ${model.split('/').pop()} — 90s (${recentFails} falhas em ${CB_WINDOW_MS / 1000}s)`);
  }
}

module.exports = {
  selectModels,
  recordSuccess,
  recordFailure,
  hasCapacity,
  isBlocked,
};
