'use strict';

const { isGroupAdmin } = require('../utils/moderation.js');
const { getWarnData, MAX_WARNS } = require('../utils/warn.js');

module.exports = {
  name: 'warns',
  execute: async ({ sock, message, from, sender, isGroup }) => {
    if (!isGroup)
      return sock.sendMessage(from, { text: '⚠️ Esse comando só funciona em grupos.' });

    const senderIsAdmin = await isGroupAdmin(sock, from, sender);
    if (!senderIsAdmin)
      return sock.sendMessage(from, { text: '🚫 Você não tem permissão pra isso.' });

    const mentionedJids =
      message.message?.extendedTextMessage?.contextInfo?.mentionedJid || [];

    if (mentionedJids.length === 0)
      return sock.sendMessage(from, {
        text: '👤 Menciona o usuário.\n\n📌 Uso: *!warns @usuario*',
      });

    const targetId = mentionedJids[0];
    const warnData = getWarnData(from, targetId);
    const warnBar  = buildWarnBar(warnData.count, MAX_WARNS);

    if (warnData.count === 0) {
      return sock.sendMessage(from, {
        text: [
          `📋 *Advertências*`,
          ``,
          `👤 Usuário: @${targetId.split('@')[0]}`,
          ``,
          `${warnBar} 0/${MAX_WARNS}`,
          `😌 Nenhuma advertência registrada.`,
        ].join('\n'),
        mentions: [targetId],
      });
    }

    const reasonLines = warnData.reasons.map((entry, index) => {
      const date = new Date(entry.warnedAt).toLocaleDateString('pt-BR', {
        day: '2-digit', month: '2-digit', year: 'numeric',
      });
      return `${index + 1}. ${entry.reason} — ${date}`;
    });

    await sock.sendMessage(from, {
      text: [
        `📋 *Advertências*`,
        ``,
        `👤 Usuário: @${targetId.split('@')[0]}`,
        ``,
        `${warnBar} ${warnData.count}/${MAX_WARNS}`,
        ``,
        `📝 Registros:`,
        ...reasonLines,
      ].join('\n'),
      mentions: [targetId],
    });
  },
};

function buildWarnBar(current, max) {
  return `[${'■'.repeat(current)}${'□'.repeat(max - current)}]`;
}
