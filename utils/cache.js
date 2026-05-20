'use strict';

// ============================================================
// UTILS/CACHE.JS — Gerenciador do cache LID → JID
// ============================================================
// CORREÇÕES:
//   - Cache carregado uma única vez em memória (sem I/O por evento)
//   - Escrita atômica via rename para evitar corrupção
// ============================================================

const fs   = require('fs');
const path = require('path');

const CACHE_FILE = path.join(__dirname, '..', 'data', 'jid-cache.json');

// Cache em memória — carregado uma vez na inicialização
let memoryCache = null;

function loadCache() {
  if (memoryCache !== null) return memoryCache;
  try {
    memoryCache = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf-8'));
  } catch {
    memoryCache = {};
  }
  return memoryCache;
}

function persistCache() {
  const tmp = CACHE_FILE + '.tmp';
  try {
    fs.writeFileSync(tmp, JSON.stringify(memoryCache, null, 2), 'utf-8');
    fs.renameSync(tmp, CACHE_FILE);
  } catch (error) {
    console.error('[CACHE] Erro ao salvar jid-cache.json:', error.message);
  }
}

function updateCache(lid, jid) {
  if (!lid || !jid || !jid.endsWith('@s.whatsapp.net') || lid === jid) return;

  const cache = loadCache();
  if (cache[lid]) return;

  cache[lid] = jid;
  persistCache();

  console.log(`[CACHE] Mapeamento salvo: ${lid} -> ${jid}`);
}

function resolveFromCache(lid) {
  return loadCache()[lid] || null;
}

module.exports = {
  updateCache,
  resolveFromCache,
};
