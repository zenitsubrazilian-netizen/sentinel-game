'use strict';

require('dotenv').config();

const fs   = require('fs');
const path = require('path');

let groq = null;
try {
  const Groq = require('groq-sdk');
  groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
} catch (err) {
  console.warn('[MEMORY] groq-sdk não disponível:', err.message);
}

const MEMORY_FILE = path.join(__dirname, '..', 'data', 'ai-memory.json');

// ─────────────────────────────────────────────────────────────
// CONFIGURAÇÃO
// ─────────────────────────────────────────────────────────────

const MAX_MESSAGES_PER_GROUP = 120;
const SUMMARIZE_THRESHOLD    = 90;
const KEEP_AFTER_SUMMARY     = 40;
const MAX_MSG_AGE_MS         = 48 * 60 * 60 * 1000; // 48h
const MAX_GROUP_IDLE_MS      = 7  * 24 * 60 * 60 * 1000;
const FLOOD_WINDOW_MS        = 30_000;
const FLOOD_MAX_MSGS         = 6;
const CLEANUP_INTERVAL_MS    = 10 * 60_000;
const CLEANUP_REMOVE_COUNT   = 10;

const TRIVIAL_REGEX = /^(k+|kkk+|haha+|rs+|oi|hi|ok|blz|sim|não|n|s|👍|👎|😂|🤣|❤️|😍|👏|🙏|✅|❌|\.{1,3}|!{1,3}|\?{1,3})$/i;

// ─────────────────────────────────────────────────────────────
// ESTADO
// ─────────────────────────────────────────────────────────────

let data = { groups: {}, globalHistory: [], lastUpdate: null };

const floodTracker = new Map();
const summarizing  = new Set();

// ─────────────────────────────────────────────────────────────
// PERSISTÊNCIA
// ─────────────────────────────────────────────────────────────

function hasAnyData() {
  return Object.keys(data.groups || {}).length > 0 ||
         (data.globalHistory || []).length > 0;
}

function loadMemory() {
  try {
    const dir = path.dirname(MEMORY_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    if (!fs.existsSync(MEMORY_FILE)) {
      data = { groups: {}, globalHistory: [], lastUpdate: null };
      fs.writeFileSync(MEMORY_FILE, '{}', 'utf-8');
      console.log('[MEMORY] Arquivo criado (novo).');
      return;
    }

    const raw = fs.readFileSync(MEMORY_FILE, 'utf-8').trim();
    if (!raw || raw === '{}') {
      data = { groups: {}, globalHistory: [], lastUpdate: null };
      console.log('[MEMORY] Arquivo vazio — memória limpa.');
      return;
    }

    const parsed = JSON.parse(raw);

    if (parsed.history && !parsed.groups) {
      data = {
        groups:        {},
        globalHistory: parsed.history || [],
        lastUpdate:    parsed.lastUpdate || null,
      };
      console.log('[MEMORY] Migrado do formato legado.');
    } else {
      data = {
        groups:        parsed.groups        || {},
        globalHistory: parsed.globalHistory || [],
        lastUpdate:    parsed.lastUpdate    || null,
      };
    }

    const gc = Object.keys(data.groups).length;
    const mc = Object.values(data.groups).reduce((s, g) => s + (g.messages?.length || 0), 0);
    console.log(`[MEMORY] Carregado: ${gc} grupos, ${mc} msgs`);

  } catch (err) {
    console.error('[MEMORY] Erro ao carregar:', err.message);
    data = { groups: {}, globalHistory: [], lastUpdate: null };
  }
}

function saveMemory() {
  try {
    if (!hasAnyData()) {
      fs.writeFileSync(MEMORY_FILE, '{}', 'utf-8');
      return;
    }
    data.lastUpdate = new Date().toISOString();
    const tmp = MEMORY_FILE + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf-8');
    fs.renameSync(tmp, MEMORY_FILE);
  } catch (err) {
    console.error('[MEMORY] Erro ao salvar:', err.message);
  }
}

function resetMemory() {
  data.groups        = {};
  data.globalHistory = [];
  data.lastUpdate    = null;
  try {
    const dir = path.dirname(MEMORY_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(MEMORY_FILE, '{}', 'utf-8');
    console.log('[MEMORY] ✅ Reset completo');
  } catch (err) {
    console.error('[MEMORY] Erro no reset:', err.message);
  }
}

// ─────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────

function initGroup(groupId) {
  if (!data.groups[groupId]) {
    data.groups[groupId] = {
      messages:     [],
      summary:      null,
      summaryTs:    null,
      lastActivity: Date.now(),
    };
  }
}

// ─────────────────────────────────────────────────────────────
// ANTI-FLOOD / TRIVIAL
// ─────────────────────────────────────────────────────────────

function isFlood(senderId) {
  const now = Date.now();
  const log = (floodTracker.get(senderId) || []).filter(t => now - t < FLOOD_WINDOW_MS);
  log.push(now);
  floodTracker.set(senderId, log);
  return log.length > FLOOD_MAX_MSGS;
}

function isTrivial(text) {
  return TRIVIAL_REGEX.test(text.trim());
}

function shouldCapture(groupId, senderId, text) {
  if (!text || text.trim().length < 4) return false;
  if (/^!/.test(text.trim()))          return false;
  if (isTrivial(text))                 return false;
  if (isFlood(senderId))               return false;

  const group = data.groups[groupId];
  if (group) {
    const isDup = group.messages.slice(-5).some(m => m.content === text.trim());
    if (isDup) return false;
  }

  return true;
}

// ─────────────────────────────────────────────────────────────
// CAPTURA — mensagens de usuários
// ─────────────────────────────────────────────────────────────

async function captureMessage(groupId, senderId, senderName, text) {
  if (!shouldCapture(groupId, senderId, text)) return;

  initGroup(groupId);
  const group = data.groups[groupId];

  group.messages.push({
    role:    'user',
    author:  senderId.split('@')[0],
    name:    senderName || senderId.split('@')[0].slice(-4),
    content: text.trim(),
    ts:      Date.now(),
  });

  group.lastActivity = Date.now();

  // Limita tamanho máximo
  if (group.messages.length > MAX_MESSAGES_PER_GROUP) {
    group.messages.splice(0, group.messages.length - MAX_MESSAGES_PER_GROUP);
  }

  if (group.messages.length >= SUMMARIZE_THRESHOLD && !summarizing.has(groupId)) {
    summarizing.add(groupId);
    summarizeOldMessages(groupId).finally(() => summarizing.delete(groupId));
  }
}

// ─────────────────────────────────────────────────────────────
// CAPTURA — respostas do próprio bot (Sentinel)
// Chamado externamente pelo aiHandler após enviar resposta
// ─────────────────────────────────────────────────────────────

async function captureBotMessage(groupId, text) {
  if (!text || text.trim().length < 4) return;

  initGroup(groupId);
  const group = data.groups[groupId];

  group.messages.push({
    role:    'assistant',
    author:  'sentinel',
    name:    'Sentinel',
    content: text.trim(),
    ts:      Date.now(),
  });

  group.lastActivity = Date.now();

  if (group.messages.length > MAX_MESSAGES_PER_GROUP) {
    group.messages.splice(0, group.messages.length - MAX_MESSAGES_PER_GROUP);
  }
}

// ─────────────────────────────────────────────────────────────
// RESUMO AUTOMÁTICO
// ─────────────────────────────────────────────────────────────

async function summarizeOldMessages(groupId) {
  if (!groq) return;

  const group = data.groups[groupId];
  if (!group) return;

  const toSummarize = group.messages.slice(0, group.messages.length - KEEP_AFTER_SUMMARY);
  const keep        = group.messages.slice(group.messages.length - KEEP_AFTER_SUMMARY);

  if (toSummarize.length < 10) return;

  const formatted = toSummarize.map(m => {
    const time = new Date(m.ts).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    const who  = m.role === 'assistant' ? `[Sentinel]` : `[${m.name}]`;
    return `${who} ${time}: ${m.content}`;
  }).join('\n');

  const basePrompt = group.summary
    ? `Resumo anterior:\n"${group.summary}"\n\nIntegre as novas mensagens abaixo, atualizando o contexto de forma compacta:`
    : `Resuma a conversa abaixo em um parágrafo. Inclua: assuntos, quem falou o quê, piadas internas, eventos relevantes:`;

  const messages = [
    { role: 'system', content: 'Você resume conversas de WhatsApp. Inclua quem disse cada coisa importante. Responda APENAS com o resumo.' },
    { role: 'user',   content: `${basePrompt}\n\n${formatted}` },
  ];

  const models = ['llama-3.1-8b-instant', 'meta-llama/llama-4-scout-17b-16e-instruct'];

  for (const model of models) {
    try {
      const response = await groq.chat.completions.create({
        model, messages, max_tokens: 500, temperature: 0.3,
      });
      const summary = response.choices[0].message.content.trim();
      if (summary) {
        group.summary   = summary;
        group.summaryTs = Date.now();
        group.messages  = keep;
        saveMemory();
        console.log(`[MEMORY] Resumo gerado: ${groupId.slice(0, 15)} (${summary.length} chars)`);
        return;
      }
    } catch (err) {
      console.warn(`[MEMORY] Erro no resumo com ${model}:`, err.message);
    }
  }

  group.messages = keep;
  saveMemory();
}

// ─────────────────────────────────────────────────────────────
// CONTEXTO PARA A IA
// Inclui resumo + conversa recente com identificação de quem falou
// ─────────────────────────────────────────────────────────────

function getGroupContext(groupId) {
  const group = data.groups?.[groupId];
  if (!group) return null;

  const parts = [];

  if (group.summary) {
    const summaryDate = group.summaryTs
      ? new Date(group.summaryTs).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })
      : 'anteriormente';
    parts.push(`=== CONTEXTO ANTERIOR (até ${summaryDate}) ===\n${group.summary}\n=== FIM ===`);
  }

  if (group.messages?.length > 0) {
    const recent    = group.messages.slice(-30);
    const formatted = recent.map(m => {
      const time = new Date(m.ts).toLocaleTimeString('pt-BR', {
        hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo',
      });
      const who = m.role === 'assistant'
        ? `[Sentinel 🛡]`
        : `[${m.name} | ${m.author}]`;
      return `${who} ${time}: ${m.content}`;
    }).join('\n');

    parts.push(`=== CONVERSA RECENTE ===\n${formatted}\n=== FIM ===`);
  }

  return parts.length > 0 ? parts.join('\n\n') : null;
}

// ─────────────────────────────────────────────────────────────
// GLOBAL HISTORY (compatibilidade)
// ─────────────────────────────────────────────────────────────

function getGlobalHistory()        { return data.globalHistory || []; }
function setGlobalHistory(history) { data.globalHistory = history;    }

function getRawMessages(groupId) {
  return data.groups?.[groupId]?.messages || [];
}

function getRecentMessages(groupId, limit = 20) {
  return getRawMessages(groupId).slice(-limit).map(m => ({
    name: m.name,
    text: m.content,
    ts:   m.ts,
    role: m.role,
  }));
}

// ─────────────────────────────────────────────────────────────
// LIMPEZA PERIÓDICA
// ─────────────────────────────────────────────────────────────

function runCleanup() {
  if (!hasAnyData()) return;

  const now   = Date.now();
  let removed = 0;
  let pruned  = 0;

  for (const [groupId, group] of Object.entries(data.groups || {})) {
    const before   = group.messages.length;
    group.messages = group.messages.filter(m => now - m.ts < MAX_MSG_AGE_MS);
    pruned        += before - group.messages.length;

    if (group.messages.length > CLEANUP_REMOVE_COUNT) {
      group.messages.splice(0, CLEANUP_REMOVE_COUNT);
      pruned += CLEANUP_REMOVE_COUNT;
    }

    if (now - (group.lastActivity || 0) > MAX_GROUP_IDLE_MS) {
      delete data.groups[groupId];
      removed++;
    }
  }

  if (removed > 0 || pruned > 0) {
    console.log(`[MEMORY] Cleanup: ${removed} grupos removidos, ${pruned} msgs expiradas`);
    saveMemory();
  }
}

loadMemory();
setInterval(saveMemory,  5  * 60_000);
setInterval(runCleanup,  CLEANUP_INTERVAL_MS);

module.exports = {
  captureMessage,
  captureBotMessage,
  getGroupContext,
  getGlobalHistory,
  setGlobalHistory,
  getRawMessages,
  getRecentMessages,
  resetMemory,
  saveMemory,
};
