'use strict';

module.exports = {
  name: 'id',

  execute: async ({ sock, from, sender, message }) => {
    const msgContent = message.message;

    // Pega a primeira menção explícita, se houver
    const mentioned =
      msgContent?.extendedTextMessage?.contextInfo?.mentionedJid?.[0] ?? null;

    if (mentioned) {
      const num = mentioned.replace('@s.whatsapp.net', '').replace('@lid', '');
      await sock.sendMessage(from, {
        text: `🪪 ID de @${num}:\n\`${mentioned}\``,
        mentions: [mentioned],
      });
      return;
    }

    // Sem menção → ID de quem enviou
    await sock.sendMessage(from, {
      text: `🪪 Seu ID:\n\`${sender}\``,
    });
  },
};
