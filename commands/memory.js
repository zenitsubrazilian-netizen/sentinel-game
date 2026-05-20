'use strict';

const fs   = require('fs');
const path = require('path');

const MEMORY_FILE = path.join(__dirname, '..', 'data', 'ai-memory.json');
const OWNER_PHONE = '5518997732279';
const OWNER_LID   = '115809867276438';

function isOwner(sender) {
  const raw = sender?.split('@')[0];
  return raw === OWNER_PHONE || raw === OWNER_LID;
}

module.exports = {
  name: 'memory',
  execute: async ({ sock, from, sender }) => {

    if (!isOwner(sender))
      return sock.sendMessage(from, { text: '🚫 Só o dono pode usar esse comando.' });

    if (!fs.existsSync(MEMORY_FILE))
      return sock.sendMessage(from, { text: '⚠️ Nenhuma memória encontrada.' });

    try {
      const raw  = fs.readFileSync(MEMORY_FILE, 'utf-8');
      const data = JSON.parse(raw);
      const size = (Buffer.byteLength(raw, 'utf-8') / 1024).toFixed(1);

      // ── Grupos ────────────────────────────────────────────
      const groups      = data.groups || {};
      const groupIds    = Object.keys(groups);
      const groupCount  = groupIds.length;

      let totalMsgs  = 0;
      let nameSet    = new Set();
      let lastMsgs   = [];

      for (const gid of groupIds) {
        const msgs = groups[gid].messages || [];
        totalMsgs += msgs.length;

        for (const m of msgs) {
          if (m.name) nameSet.add(m.name);
        }

        // Últimas mensagens de cada grupo
        const recent = msgs.slice(-3);
        for (const m of recent) {
          lastMsgs.push({ ts: m.ts || 0, text: `${m.name}: ${m.content}` });
        }
      }

      // ── Histórico privado ─────────────────────────────────
      const globalHistory = data.globalHistory || [];

      // Ordena últimas msgs por timestamp
      lastMsgs.sort((a, b) => b.ts - a.ts);
      const top5 = lastMsgs.slice(0, 5);

      // ── Resumos existentes ────────────────────────────────
      const groupsWithSummary = groupIds.filter(g => groups[g].summary).length;

      const lines = [
        `🧠 *MEMÓRIA DA IA*`,
        ``,
        `📦 Total de mensagens: *${totalMsgs}*`,
        `🏘️ Grupos monitorados: *${groupCount}*`,
        `📝 Grupos com resumo: *${groupsWithSummary}*`,
        `👥 Usuários distintos: *${nameSet.size}*`,
        `💬 Histórico privado: *${globalHistory.length} msgs*`,
        `💾 Tamanho do arquivo: *${size} KB*`,
      ];

      if (top5.length > 0) {
        lines.push(``, `🕒 *Últimas mensagens:*`);
        for (const m of top5) {
          const preview = m.text.length > 60 ? m.text.slice(0, 57) + '...' : m.text;
          lines.push(`• ${preview}`);
        }
      }

      if (nameSet.size > 0) {
        const sample = [...nameSet].slice(0, 8).join(', ');
        lines.push(``, `👤 *Usuários:* ${sample}${nameSet.size > 8 ? ` e mais ${nameSet.size - 8}` : ''}`);
      }

      return sock.sendMessage(from, { text: lines.join('\n') });

    } catch (err) {
      console.error('[MEMORY] Erro:', err.message);
      return sock.sendMessage(from, { text: `❌ Erro ao ler a memória:\n${err.message}` });
    }
  },
};
