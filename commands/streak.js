'use strict';

const { getUser, getStreakBonus } = require('../utils/economy.js');

module.exports = {
  name: 'streak',
  execute: async ({ sock, from, sender }) => {
    const user  = getUser(sender);
    const bonus = getStreakBonus(user.streak);
    const pct   = Math.floor((bonus - 1) * 100);

    const msg = [
      `🔥 *SEU STREAK*`,
      `━━━━━━━━━━━━━━━━━━`,
      ``,
      `⏱️ Dias consecutivos: *${user.streak}*`,
      `📈 Bônus de XP: *+${pct}%*`,
      ``,
      `💡 Continue ativo diariamente para manter seu combo!`,
    ].join('\n');

    await sock.sendMessage(from, { text: msg });
  },
};
