'use strict';

const { getTopUsers, getRank } = require('../utils/economy.js');

module.exports = {
  name: 'rank',
  execute: async ({ sock, from }) => {

    const top = getTopUsers(10);

    if (top.length === 0) {
      return sock.sendMessage(from, {
        text: '⚠️ Nenhum usuário no ranking ainda.',
      });
    }

    const lines = top.map((u, i) => {
      const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `  ${i + 1}.`;
      const rank  = getRank(u.level);
      const num   = u.id.split('@')[0];

      return `${medal} @${num}\n     Lv ${u.level} • ${rank}`;
    });

    const msg = [
      `━━━━━━━━━━━━━━━━━━`,
      `🏆 *RANKING DE LEVELS*`,
      `━━━━━━━━━━━━━━━━━━`,
      ``,
      ...lines,
      ``,
      `━━━━━━━━━━━━━━━━━━`,
      `📈 Continue ativo para subir!`,
    ].join('\n');

    const mentions = top.map(u => u.id);

    await sock.sendMessage(from, { text: msg, mentions });
  },
};
