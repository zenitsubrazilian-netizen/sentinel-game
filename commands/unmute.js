'use strict';

const { isGroupAdmin } = require('../utils/moderation.js');
const { removeMute, isMuted } = require('../utils/mute.js');

module.exports = {
  name: 'unmute',
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
        text: '👤 Menciona quem quer desmutar.\n\n📌 Uso: *!unmute @usuario*',
      });

    const targetId = mentionedJids[0];

    if (!isMuted(from, targetId))
      return sock.sendMessage(from, { text: '🔊 Esse usuário não está mutado.' });

    removeMute(from, targetId);

    console.log(`[UNMUTE] ${targetId} desmutado no grupo ${from}`);

    await sock.sendMessage(from, {
      text: `🔊 @${targetId.split('@')[0]} foi desmutado. Pode falar! 😄`,
      mentions: [targetId],
    });
  },
};
