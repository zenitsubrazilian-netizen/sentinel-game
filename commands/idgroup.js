'use strict';

module.exports = {
  name: 'idgroup',

  execute: async ({ sock, from, isGroup }) => {
    if (!isGroup) {
      await sock.sendMessage(from, { text: 'esse comando só funciona em grupos.' });
      return;
    }

    await sock.sendMessage(from, {
      text: `🪪 ID do grupo:\n\`${from}\``,
    });
  },
};
