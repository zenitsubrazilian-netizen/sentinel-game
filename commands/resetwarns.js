'use strict';

const { isGroupAdmin } = require('../utils/moderation.js');
const { resetWarns, getWarnData } = require('../utils/warn.js');

module.exports = {
  name: 'resetwarns',
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
        text: '👤 Menciona o usuário.\n\n📌 Uso: *!resetwarns @usuario*',
      });

    const targetId = mentionedJids[0];
    const warnData = getWarnData(from, targetId);

    if (warnData.count === 0)
      return sock.sendMessage(from, {
        text: `😌 @${targetId.split('@')[0]} não tem nenhuma advertência pra resetar.`,
        mentions: [targetId],
      });

    resetWarns(from, targetId);

    console.log(`[RESETWARNS] ${targetId} — warns resetados`);

    await sock.sendMessage(from, {
      text: [
        `🔄 *Advertências zeradas!*`,
        ``,
        `👤 Usuário: @${targetId.split('@')[0]}`,
        `🗑️ Histórico limpo.`,
      ].join('\n'),
      mentions: [targetId],
    });
  },
};
