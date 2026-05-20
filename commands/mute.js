'use strict';

const { isGroupAdmin } = require('../utils/moderation.js');
const { addMute, parseTime, formatTime, isMuted } = require('../utils/mute.js');

module.exports = {
  name: 'mute',
  execute: async ({ sock, message, from, sender, args, isGroup }) => {
    if (!isGroup)
      return sock.sendMessage(from, { text: '⚠️ Esse comando só funciona em grupos.' });

    const senderIsAdmin = await isGroupAdmin(sock, from, sender);
    if (!senderIsAdmin)
      return sock.sendMessage(from, { text: '🚫 Você não tem permissão pra isso.' });

    const mentionedJids =
      message.message?.extendedTextMessage?.contextInfo?.mentionedJid || [];

    if (mentionedJids.length === 0)
      return sock.sendMessage(from, {
        text: '👤 Menciona quem quer mutar.\n\n📌 Uso: *!mute @usuario <tempo>*\n⏱️ Ex: !mute @user 10m',
      });

    const targetId = mentionedJids[0];

    if (targetId === sender)
      return sock.sendMessage(from, { text: '😐 Você não pode se auto-mutar.' });

    const targetIsAdmin = await isGroupAdmin(sock, from, targetId);
    if (targetIsAdmin)
      return sock.sendMessage(from, { text: '🛡️ Não posso mutar um administrador.' });

    const timeArg = args.find(arg => !arg.startsWith('@') && !arg.includes('@'));

    if (!timeArg)
      return sock.sendMessage(from, {
        text: '⏱️ Informa o tempo do mute.\n\n📌 Ex: *!mute @user 10m*\n🕐 Formatos: 30s, 10m, 2h, 1d',
      });

    const timeMs = parseTime(timeArg);
    if (!timeMs)
      return sock.sendMessage(from, {
        text: '❌ Tempo inválido.\n\n🕐 Use: 30s, 10m, 2h ou 1d',
      });

    if (isMuted(from, targetId))
      return sock.sendMessage(from, { text: '🔇 Esse usuário já está mutado.' });

    addMute(from, targetId, timeMs, sender);

    const timeFormatted = formatTime(timeMs);
    console.log(`[MUTE] ${targetId} mutado por ${timeFormatted} no grupo ${from}`);

    await sock.sendMessage(from, {
      text: `🔇 @${targetId.split('@')[0]} foi mutado por *${timeFormatted}*. 🤫`,
      mentions: [targetId],
    });
  },
};
