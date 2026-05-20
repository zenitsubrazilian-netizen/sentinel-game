'use strict';

const { isGroupAdmin, isBotAdmin } = require('../utils/moderation.js');

module.exports = {
  name: 'promote',
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
        text: '👤 Menciona quem quer promover.\n\n📌 Uso: *!promote @usuario*',
      });

    const targetId = mentionedJids[0];

    if (targetId === sender)
      return sock.sendMessage(from, { text: '😐 Você não pode se auto-promover.' });

    try {
      const metadata = await sock.groupMetadata(from);
      const target   = metadata.participants.find(p => p.id === targetId || p.lid === targetId);

      if (!target)
        return sock.sendMessage(from, { text: '🤔 Usuário não encontrado no grupo.' });

      if (target.admin === 'admin' || target.admin === 'superadmin')
        return sock.sendMessage(from, { text: '⭐ Esse usuário já é administrador.' });
    } catch (error) {
      console.error('[PROMOTE] Erro ao verificar metadados:', error.message);
      return sock.sendMessage(from, { text: '❌ Não consegui verificar os dados do grupo.' });
    }

    try {
      await sock.groupParticipantsUpdate(from, [targetId], 'promote');
    } catch (error) {
      console.error('[PROMOTE] Erro ao promover participante:', error.message);
      return sock.sendMessage(from, { text: '❌ Falha ao promover. Tenta de novo.' });
    }

    console.log(`[PROMOTE] ${targetId} promovido em ${from} por ${sender}`);

    await sock.sendMessage(from, {
      text: `⭐ @${targetId.split('@')[0]} agora é administrador do grupo! 🎉`,
      mentions: [targetId],
    });
  },
};
