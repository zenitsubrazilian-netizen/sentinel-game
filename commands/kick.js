'use strict';

const { isGroupAdmin, isBotAdmin } = require('../utils/moderation.js');

const BOT_LID = '115809867276438@lid';

module.exports = {
  name: 'kick',
  execute: async ({ sock, message, from, sender, isGroup }) => {
    if (!isGroup)
      return sock.sendMessage(from, { text: '⚠️ Esse comando só funciona em grupos.' });

    const senderIsAdmin = await isGroupAdmin(sock, from, sender);
    if (!senderIsAdmin)
      return sock.sendMessage(from, { text: '🚫 Você não tem permissão pra isso.' });

    const botIsAdmin = await isBotAdmin(sock, from);
    if (!botIsAdmin)
      return sock.sendMessage(from, { text: '😅 Preciso ser admin do grupo pra fazer isso.' });

    const mentionedJids =
      message.message?.extendedTextMessage?.contextInfo?.mentionedJid || [];

    if (mentionedJids.length === 0)
      return sock.sendMessage(from, {
        text: '👤 Menciona quem quer expulsar.\n\n📌 Uso: *!kick @usuario*',
      });

    const targetId = mentionedJids[0];

    if (targetId === sender)
      return sock.sendMessage(from, { text: '😐 Você não pode se auto-expulsar.' });

    if (targetId === BOT_LID || targetId.split('@')[0] === BOT_LID.split('@')[0])
      return sock.sendMessage(from, { text: '😅 Não vou me expulsar não.' });

    try {
      const metadata = await sock.groupMetadata(from);
      const target   = metadata.participants.find(p => p.id === targetId || p.lid === targetId);

      if (target?.admin === 'superadmin')
        return sock.sendMessage(from, { text: '👑 Não dá pra expulsar o dono do grupo.' });

      if (target?.admin === 'admin')
        return sock.sendMessage(from, { text: '🛡️ Não posso expulsar um administrador.' });
    } catch (error) {
      console.error('[KICK] Erro ao verificar metadados:', error.message);
    }

    try {
      await sock.groupParticipantsUpdate(from, [targetId], 'remove');
    } catch (error) {
      console.error('[KICK] Erro ao remover participante:', error.message);
      return sock.sendMessage(from, { text: '❌ Não consegui expulsar. Tenta de novo.' });
    }

    console.log(`[KICK] ${targetId} removido de ${from} por ${sender}`);
    await sock.sendMessage(from, {
      text: `🚪 @${targetId.split('@')[0]} foi expulso do grupo. 👋`,
      mentions: [targetId],
    });
  },
};
