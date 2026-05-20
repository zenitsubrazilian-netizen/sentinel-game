'use strict';

// ============================================================
// DUO COMMAND v1.0.0
// ============================================================

const duoGame = require('../utils/duoGame.js');

module.exports = {
  name: 'duo',
  execute: async ({ sock, from, sender, args, isGroup }) => {

    if (!isGroup) {
      return sock.sendMessage(from, {
        text: '⚠️ O modo Duo só pode ser iniciado em grupos.',
      });
    }

    const sub = (args[0] || '').toLowerCase();

    // ── !duo cancelar
    if (sub === 'cancelar' || sub === 'cancel') {
      const result = duoGame.cancelDuo(from);
      if (result.error) {
        return sock.sendMessage(from, { text: '⚠️ Nenhuma sala Duo ativa para cancelar.' });
      }
      return sock.sendMessage(from, { text: '🏳️ Sala Duo cancelada.' });
    }

    // ── Verifica sala ativa
    if (duoGame.hasDuo(from)) {
      return sock.sendMessage(from, {
        text: '⚠️ Já existe uma sala Duo ativa!\n\nUse *!duo cancelar* para encerrar.',
      });
    }

    // ── Cria sala
    const result = duoGame.createDuo(from, sender);
    if (result.error === 'already_active') {
      return sock.sendMessage(from, { text: '⚠️ Já existe uma sala Duo ativa.' });
    }

    const duo = result.duo;

    const msg = await sock.sendMessage(from, {
      text: [
        `━━━━━━━━━━━━━━━━━━`,
        `⚔️ *BATALHA DUO 2v2*`,
        `━━━━━━━━━━━━━━━━━━`,
        ``,
        `@${sender.split('@')[0]} criou uma sala de batalha!`,
        ``,
        `🔴 *Time 1 — Vermelho:* 0/2`,
        `🔵 *Time 2 — Azul:* 0/2`,
        ``,
        `━━━━━━━━━━━━━━━━━━`,
        `📌 *Como entrar:*`,
        `Responda *esta mensagem* com:`,
        `  \`1\` → entrar no 🔴 Time 1`,
        `  \`2\` → entrar no 🔵 Time 2`,
        ``,
        `👥 São necessários *4 jogadores* para começar.`,
        `⏳ A sala fecha em *5 minutos* automaticamente.`,
        `━━━━━━━━━━━━━━━━━━`,
      ].join('\n'),
      mentions: [sender],
    });

    duoGame.registerMessageId(from, msg.key.id);

    console.log(`[DUO] Sala criada por ${sender.split('@')[0]} em ${from}`);

    // Timeout de lobby: cancela após 5 minutos se não completar
    const lobbyTimeout = setTimeout(async () => {
      const currentDuo = duoGame.getDuo(from);
      if (!currentDuo || currentDuo.phase !== 'lobby') return;

      const t1Count = currentDuo.team1.players.length;
      const t2Count = currentDuo.team2.players.length;

      duoGame.cancelDuo(from);

      await sock.sendMessage(from, {
        text: [
          `⏰ *Tempo esgotado!*`,
          ``,
          `A sala Duo foi encerrada por falta de jogadores.`,
          ``,
          `🔴 Time 1: ${t1Count}/2 jogadores`,
          `🔵 Time 2: ${t2Count}/2 jogadores`,
          ``,
          `Use *!duo* para criar uma nova sala.`,
        ].join('\n'),
      });
    }, 5 * 60_000);

    duo.lobbyTimeout = lobbyTimeout;
  },
};
