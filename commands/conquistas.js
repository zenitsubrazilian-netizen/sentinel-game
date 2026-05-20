'use strict';

const { getUserAchievements } = require('../utils/achievements.js');

const USAGE = [
  `⚠️ *Uso incorreto!*`,
  ``,
  `📌 Subcomandos disponíveis:`,
  `  • *!conquistas pendentes* — mostra conquistas ainda não concluídas`,
  `  • *!conquistas concluidas* — mostra conquistas já desbloqueadas`,
].join('\n');

module.exports = {
  name: 'conquistas',
  execute: async ({ sock, from, sender, args }) => {

    const sub = (args[0] || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    // normaliza para aceitar "concluídas" e "concluidas" igualmente

    if (sub !== 'pendentes' && sub !== 'concluidas') {
      return sock.sendMessage(from, { text: USAGE });
    }

    const { owned, locked } = getUserAchievements(sender);
    const total = owned.length + locked.length;

    // ── CONCLUÍDAS ──────────────────────────────────────────
    if (sub === 'concluidas') {
      if (owned.length === 0) {
        return sock.sendMessage(from, {
          text: [
            `🏆 *CONQUISTAS CONCLUÍDAS*`,
            `━━━━━━━━━━━━━━━━━━`,
            ``,
            `Você ainda não desbloqueou nenhuma conquista.`,
            ``,
            `💡 Envie mensagens, jogue minigames e colete dailys para começar!`,
          ].join('\n'),
        });
      }

      const progress = total > 0 ? Math.floor((owned.length / total) * 100) : 0;

      const lines = owned.map((a, i) => {
        const recompensa = [];
        if (a.reward?.coins) recompensa.push(`💰 ${a.reward.coins} Z¢`);
        if (a.reward?.xp)    recompensa.push(`📈 ${a.reward.xp} XP`);
        if (a.reward?.item)  recompensa.push(`✨ item especial`);
        return `${i + 1}. ${a.icon} *${a.name}*\n   _${a.rarity}_ • ${a.description}\n   🎁 ${recompensa.join(' | ')}`;
      });

      const msg = [
        `━━━━━━━━━━━━━━━━━━`,
        `✅ *CONQUISTAS CONCLUÍDAS*`,
        `━━━━━━━━━━━━━━━━━━`,
        ``,
        `📊 Progresso geral: ${owned.length}/${total} (${progress}%)`,
        ``,
        lines.join('\n\n'),
        ``,
        `━━━━━━━━━━━━━━━━━━`,
        `🏆 Continue conquistando!`,
      ].join('\n');

      return sock.sendMessage(from, { text: msg });
    }

    // ── PENDENTES ───────────────────────────────────────────
    if (locked.length === 0) {
      return sock.sendMessage(from, {
        text: [
          `🔒 *CONQUISTAS PENDENTES*`,
          `━━━━━━━━━━━━━━━━━━`,
          ``,
          `🎉 Parabéns! Você desbloqueou todas as conquistas disponíveis!`,
        ].join('\n'),
      });
    }

    const lines = locked.map((a, i) => {
      const recompensa = [];
      if (a.reward?.coins) recompensa.push(`💰 ${a.reward.coins} Z¢`);
      if (a.reward?.xp)    recompensa.push(`📈 ${a.reward.xp} XP`);
      if (a.reward?.item)  recompensa.push(`✨ item especial`);
      return `${i + 1}. 🔒 *${a.name}*\n   _${a.rarity}_ • ${a.description}\n   🎁 ${recompensa.join(' | ')}`;
    });

    const msg = [
      `━━━━━━━━━━━━━━━━━━`,
      `🔒 *CONQUISTAS PENDENTES*`,
      `━━━━━━━━━━━━━━━━━━`,
      ``,
      `📊 Faltam: ${locked.length}/${owned.length + locked.length}`,
      ``,
      lines.join('\n\n'),
      ``,
      `━━━━━━━━━━━━━━━━━━`,
      `💡 Complete os objetivos para desbloquear recompensas!`,
    ].join('\n');

    return sock.sendMessage(from, { text: msg });
  },
};
