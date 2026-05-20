'use strict';

// ─────────────────────────────────────────────────────────────
// RASTREADOR DE TOKENS — janela deslizante de 10 minutos
// ─────────────────────────────────────────────────────────────

const WINDOW_MS = 10 * 60_000;

const events = []; // { ts, input, output, model }

function recordTokens(model, inputTokens, outputTokens) {
  events.push({
    ts:     Date.now(),
    input:  inputTokens  || 0,
    output: outputTokens || 0,
    model,
  });
}

function getStats() {
  const now    = Date.now();
  const cutoff = now - WINDOW_MS;

  // Remove eventos fora da janela
  while (events.length > 0 && events[0].ts < cutoff) events.shift();

  if (events.length === 0) {
    return { empty: true };
  }

  let totalInput  = 0;
  let totalOutput = 0;

  for (const e of events) {
    totalInput  += e.input;
    totalOutput += e.output;
  }

  const total   = totalInput + totalOutput;
  const count   = events.length;
  const average = Math.round(total / count);

  return {
    empty:       false,
    totalInput,
    totalOutput,
    total,
    count,
    average,
  };
}

// Limpeza periódica
setInterval(() => {
  const cutoff = Date.now() - WINDOW_MS;
  while (events.length > 0 && events[0].ts < cutoff) events.shift();
}, 60_000);

module.exports = { recordTokens, getStats };
