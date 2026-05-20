'use strict';

const { isGroupAdmin, getBanList } = require('../utils/moderation.js');

module.exports = {
  name: 'unban',
  execute: async ({ sock, from, sender, isGroup, pendingUnban }) => {
    if (!isGroup)
      return sock.sendMessage(from, { text: '⚠️ Esse comando só funciona em grupos.' });

    const senderIsAdmin = await isGroupAdmin(sock, from, sender);
    if (!senderIsAdmin)
      return sock.sendMessage(from, { text: '🚫 Você não tem permissão pra isso.' });

    const banList = getBanList(from);

    if (banList.length === 0)
      return sock.sendMessage(from, { text: '😌 Nenhum banimento registrado nesse grupo.' });

    // ── Monta lista com menções
    const lines = [];
    const mentions = [];

    banList.forEach((entry, index) => {
      const date = new Date(entry.bannedAt).toLocaleDateString('pt-BR', {
        day: '2-digit', 
        month: '2-digit', 
        year: 'numeric',
      });

      const jid = entry.userId;
      const mention = `@${jid.split('@')[0]}`;

      lines.push(`${index + 1}. 👤 ${mention}\n   📅 ${date}`);
      mentions.push(jid);
    });

    const total = banList.length;

    await sock.sendMessage(from, {
      text: [
        `━━━━━━━━━━━━━━━━━━`,
        `🔒 *LISTA DE BANIDOS*`,
        `━━━━━━━━━━━━━━━━━━`,
        `📊 Total: ${total} ${total === 1 ? 'usuário' : 'usuários'}`,
        ``,
        ...lines,
        ``,
        `━━━━━━━━━━━━━━━━━━`,
        `💬 *Responda com o número* para remover o banimento.`,
        `⏳ Você tem 60 segundos.`,
        `━━━━━━━━━━━━━━━━━━`,
      ].join('\n'),
      mentions, // array com todos os JIDs mencionados
    });

    pendingUnban.set(`${from}_${sender}`, {
      banList,
      groupId:   from,
      expiresAt: Date.now() + 60_000,
    });

    console.log(`[UNBAN] Lista enviada — ${total} registro(s)`);
  },
};
