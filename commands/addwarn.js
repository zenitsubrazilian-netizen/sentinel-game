'use strict';

const config = require('../config/config.js');
const { isGroupAdmin, isBotAdmin } = require('../utils/moderation.js');
const { addWarn, resetWarns, MAX_WARNS } = require('../utils/warn.js');

module.exports = {
  name: 'addwarn',
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
        text: '👤 Menciona quem quer advertir.\n\n📌 Uso: *!addwarn @usuario <motivo>*',
      });

    const targetId = mentionedJids[0];

    if (targetId === sender)
      return sock.sendMessage(from, { text: '😐 Você não pode se advertir.' });

    if (
      targetId === config.botLid ||
      targetId.split('@')[0] === config.botLid.split('@')[0]
    ) return sock.sendMessage(from, { text: '😅 Não vou me advertir não.' });

    try {
      const metadata = await sock.groupMetadata(from);
      const target   = metadata.participants.find(p => p.id === targetId || p.lid === targetId);

      if (target?.admin === 'superadmin')
        return sock.sendMessage(from, { text: '👑 Não é possível advertir o dono do grupo.' });
    } catch (error) {
      console.error('[ADDWARN] Erro ao verificar metadados:', error.message);
    }

    const filteredArgs = args.filter(arg =>
      !arg.startsWith('@') &&
      !arg.includes('@lid') &&
      !arg.includes('@s.whatsapp.net') &&
      !/^\d{10,}$/.test(arg)
    );
    const reason = filteredArgs.length > 0 ? filteredArgs.join(' ') : 'Sem motivo informado';

    const totalWarns = addWarn(from, targetId, reason, sender);

    console.log(`[WARN] ${targetId} — ${totalWarns}/${MAX_WARNS} | Motivo: ${reason}`);

    if (totalWarns >= MAX_WARNS) {
      const botIsAdmin = await isBotAdmin(sock, from);

      if (botIsAdmin) {
        try {
          await sock.groupParticipantsUpdate(from, [targetId], 'remove');
          resetWarns(from, targetId);

          await sock.sendMessage(from, {
            text: `💥 @${targetId.split('@')[0]} atingiu *${MAX_WARNS} advertências* e foi removido do grupo. 🚪`,
            mentions: [targetId],
          });
          return;
        } catch (error) {
          console.error('[ADDWARN] Erro ao remover por warns:', error.message);
        }
      } else {
        await sock.sendMessage(from, {
          text: `⚠️ @${targetId.split('@')[0]} atingiu *${MAX_WARNS} advertências*.\n😅 Mas não tenho permissão pra remover.`,
          mentions: [targetId],
        });
        return;
      }
    }

    const warnBar = buildWarnBar(totalWarns, MAX_WARNS);

    await sock.sendMessage(from, {
      text: [
        `⚠️ *Advertência registrada!*`,
        ``,
        `👤 Usuário: @${targetId.split('@')[0]}`,
        `📝 Motivo: ${reason}`,
        ``,
        `${warnBar} ${totalWarns}/${MAX_WARNS}`,
      ].join('\n'),
      mentions: [targetId],
    });
  },
};

function buildWarnBar(current, max) {
  return `[${'■'.repeat(current)}${'□'.repeat(max - current)}]`;
}
