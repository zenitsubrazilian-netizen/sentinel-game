'use strict';

const { isAfk, removeAfk } = require('../utils/afk.js');

module.exports = {
  name: 'unafk',

  execute: async ({ sock, from, sender }) => {
    if (!isAfk(sender)) {
      await sock.sendMessage(from, { text: 'você nem tava AFK 💀' });
      return;
    }

    removeAfk(sender);

    await sock.sendMessage(from, { text: '✅ AFK desativado. Bem-vindo de volta!' });
  },
};
