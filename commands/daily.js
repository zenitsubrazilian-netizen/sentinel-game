'use strict';

const { claimDaily, CONFIG } = require('../utils/economy.js');

module.exports = {
  name: 'daily',
  execute: async ({ sock, from, sender }) => {

    const result = claimDaily(sender);

    // Cooldown ativo
    if (result.error === 'cooldown') {
      const msg = [
        `⏰ *RECOMPENSA DIÁRIA*`,
        `━━━━━━━━━━━━━━━━━━`,
        ``,
        `⚠️ Você já coletou sua recompensa diária!`,
        ``,
        `⏳ Volte em: *${result.hours}h ${result.minutes}min*`,
      ].join('\n');

      return sock.sendMessage(from, { text: msg });
    }

    // Sucesso
    const bonusPct = Math.floor((result.bonus - 1) * 100);
    const streakBonus = bonusPct > 0 ? `🔥 Bônus de streak: +${bonusPct}%` : '';

    const msg = [
      `╭━━━〔 🎁 *DAILY REWARD* 🎁 〕━━━╮`,
      `┃`,
      `┃ ✅ Recompensa coletada com sucesso!`,
      `┃`,
      `┃ 💰 +${result.coins} ${CONFIG.coinSymbol}`,
      `┃ 📈 +${result.xp} XP`,
      `┃ 🔥 Streak: ${result.streak} dia${result.streak !== 1 ? 's' : ''}`,
      streakBonus ? `┃ ${streakBonus}` : '',
      `┃`,
      `┃ ⏰ Próximo daily: 24 horas`,
      `┃`,
      `╰━━━━━━━━━━━━━━━━━━━━━╯`,
      ``,
      `💡 Mantenha seu streak ativo para ganhar bônus!`,
    ].filter(Boolean).join('\n');

    await sock.sendMessage(from, { text: msg });

    // Se subiu de level, envia notificação
    if (result.leveledUp) {
      const lvlMsg = `🎉 Você subiu para o *level ${result.leveledUp.level}*! (+${result.leveledUp.reward} ${CONFIG.coinSymbol})`;
      setTimeout(async () => {
        await sock.sendMessage(from, { text: lvlMsg });
      }, 1500);
    }
  },
};
