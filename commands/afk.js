'use strict';

const { setAfk } = require('../utils/afk.js');

module.exports = {
  name: 'afk',

  execute: async ({ sock, from, sender, message, senderNum, args }) => {
    const senderName = message.pushName || senderNum;
    const reason     = args.join(' ').trim();
    const motivo     = reason || 'Não informado';

    // Sobrescreve AFK existente sem reclamar
    setAfk(sender, reason, senderName);

    await sock.sendMessage(from, {
      text: `Estado ausente ativado.\n*Motivo:* ${motivo}\nVou avisar quem te menciona :)`,
    });
  },
};
