'use strict';

const { CONFIG, getUser } = require('../utils/economy.js');

module.exports = {
  name: 'saldo',
  execute: async ({ sock, from, sender }) => {
    const user = getUser(sender);

    const msg = [
      `💰 *SEU SALDO*`,
      `━━━━━━━━━━━━━━━━━━`,
      ``,
      `💵 ${user.coins} ${CONFIG.coinSymbol}`,
      ``,
      `📊 Level: ${user.level}`,
      `🔥 Streak: ${user.streak} dias`,
    ].join('\n');

    await sock.sendMessage(from, { text: msg });
  },
};
