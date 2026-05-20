'use strict';

const { isGroupAdmin, isBotAdmin } = require('../utils/moderation.js');

const BOT_LID = '115809867276438@lid';

module.exports = {
  name: 'demote',
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
        text: '👤 Menciona quem quer rebaixar.\n\n📌 Uso: *!demote @usuario*',
      });

    const targetId = mentionedJids[0];

    if (targetId === sender)
      return sock.sendMessage(from, { text: '😐 Você não pode se auto-rebaixar.' });

    if (targetId === BOT_LID || targetId.split('@')[0] === BOT_LID.split('@')[0])
      return sock.sendMessage(from, { text: '😅 Não vou me rebaixar não.' });

    try {
      const metadata = await sock.groupMetadata(from);
      const target   = metadata.participants.find(p => p.id === targetId || p.lid === targetId);

      if (!target)
        return sock.sendMessage(from, { text: '🤔 Usuário não encontrado no grupo.' });

      if (!target.admin)
        return sock.sendMessage(from, { text: '🤷 Esse usuário nem é administrador.' });

      if (target.admin === 'superadmin')
        return sock.sendMessage(from, { text: '👑 Não dá pra rebaixar o dono do grupo.' });
    } catch (error) {
      console.error('[DEMOTE] Erro ao verificar metadados:', error.message);
      return sock.sendMessage(from, { text: '❌ Não consegui verificar os dados do grupo.' });
    }

    try {
      await sock.groupParticipantsUpdate(from, [targetId], 'demote');
    } catch (error) {
      console.error('[DEMOTE] Erro ao rebaixar participante:', error.message);
      return sock.sendMessage(from, { text: '❌ Falha ao rebaixar. Tenta de novo.' });
    }

    console.log(`[DEMOTE] ${targetId} rebaixado em ${from} por ${sender}`);

    await sock.sendMessage(from, {
      text: `📉 @${targetId.split('@')[0]} foi removido do cargo de administrador.`,
      mentions: [targetId],
    });
  },
};
