'use strict';

const { claimWeekly, CONFIG } = require('../utils/economy.js');

module.exports = {
  name: 'weekly',
  execute: async ({ sock, from, sender }) => {

    const result = claimWeekly(sender);

    // Cooldown ativo
    if (result.error === 'cooldown') {
      const msg = [
        `⏰ *RECOMPENSA SEMANAL*`,
        `━━━━━━━━━━━━━━━━━━`,
        ``,
        `⚠️ Você já coletou sua recompensa semanal!`,
        ``,
        `⏳ Volte em: *${result.days}d ${result.hours}h*`,
      ].join('\n');

      return sock.sendMessage(from, { text: msg });
    }

    // Sucesso
    const bonusPct = Math.floor((result.bonus - 1) * 100);
    const streakBonus = bonusPct > 0 ? `🔥 Bônus de streak: +${bonusPct}%` : '';

    const msg = [
      `╭━━━〔 🏆 *WEEKLY REWARD* 🏆 〕━━━╮`,
      `┃`,
      `┃ ✅ Recompensa coletada com sucesso!`,
      `┃`,
      `┃ 💰 +${result.coins} ${CONFIG.coinSymbol}`,
      `┃ 📈 +${result.xp} XP`,
      `┃ 🔥 Streak: ${result.streak} dia${result.streak !== 1 ? 's' : ''}`,
      streakBonus ? `┃ ${streakBonus}` : '',
      `┃`,
      `┃ ⏰ Próximo weekly: 7 dias`,
      `┃`,
      `╰━━━━━━━━━━━━━━━━━━━━━╯`,
      ``,
      `💡 Continue ativo para maximizar seus ganhos!`,
    ].filter(Boolean).join('\n');

    await sock.sendMessage(from, { text: msg });

    // Level up
    if (result.leveledUp) {
      const lvlMsg = `🎉 Você subiu para o *level ${result.leveledUp.level}*! (+${result.leveledUp.reward} ${CONFIG.coinSymbol})`;
      setTimeout(async () => {
        await sock.sendMessage(from, { text: lvlMsg });
      }, 1500);
    }
  },
};
