'use strict';

const { isGroupAdmin } = require('../utils/moderation.js');
const { removeWarn, getWarnData, MAX_WARNS } = require('../utils/warn.js');

module.exports = {
  name: 'removewarn',
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
        text: '👤 Menciona o usuário.\n\n📌 Uso: *!removewarn @usuario*',
      });

    const targetId = mentionedJids[0];
    const warnData = getWarnData(from, targetId);

    if (warnData.count === 0)
      return sock.sendMessage(from, {
        text: `😌 @${targetId.split('@')[0]} não tem nenhuma advertência registrada.`,
        mentions: [targetId],
      });

    const newTotal = removeWarn(from, targetId);

    console.log(`[REMOVEWARN] ${targetId} — ${newTotal}/${MAX_WARNS}`);

    const warnBar = buildWarnBar(newTotal, MAX_WARNS);

    await sock.sendMessage(from, {
      text: [
        `✅ *Advertência removida!*`,
        ``,
        `👤 Usuário: @${targetId.split('@')[0]}`,
        ``,
        `${warnBar} ${newTotal}/${MAX_WARNS}`,
      ].join('\n'),
      mentions: [targetId],
    });
  },
};

function buildWarnBar(current, max) {
  return `[${'■'.repeat(current)}${'□'.repeat(max - current)}]`;
}
