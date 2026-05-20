'use strict';

const game = require('../utils/forcaGame.js');

const MAX_ERRORS = 6;

module.exports = {
  name: 'forca',
  execute: async ({ sock, from, sender, args }) => {

    const sub = (args[0] || '').toLowerCase();

    // ── !forca cancelar ───────────────────────────────────────
    if (sub === 'cancelar' || sub === 'stop' || sub === 'sair') {
      const r = game.stopGame(from);
      if (r.error === 'no_game') {
        return sock.sendMessage(from, { text: 'Nenhuma partida ativa no momento.' });
      }
      return sock.sendMessage(from, {
        text: `🏳️ Partida encerrada.\n\nA palavra era: *${r.word}*`,
      });
    }

    // ── !forca status ─────────────────────────────────────────
    if (sub === 'status' || sub === 'ver') {
      const state = game.getState(from);
      if (!state) {
        return sock.sendMessage(from, {
          text: 'Nenhuma partida ativa. Use *!forca* para iniciar.',
        });
      }
      const msg = await sock.sendMessage(from, { 
        text: buildStatus(state) + '\n\n💬 Responda com uma letra ou palavra',
      });
      game.updateMessageId(from, msg.key.id);
      return;
    }

    // ── !forca → iniciar ──────────────────────────────────────
    if (game.hasActiveGame(from)) {
      const state = game.getState(from);
      const msg = await sock.sendMessage(from, {
        text: `⚠️ Já existe uma partida em andamento!\n\n${buildStatus(state)}\n\nUse *!forca cancelar* para encerrar.\n\n💬 Responda com uma letra ou palavra`,
      });
      game.updateMessageId(from, msg.key.id);
      return;
    }

    const r = game.startGame(from, sender);
    const msg = await sock.sendMessage(from, {
      text:
        `🎮 *Jogo da Forca iniciado!*\n\n` +
        `\`\`\`\n  +---+\n  |   |\n      |\n      |\n      |\n      |\n=========\`\`\`\n\n` +
        `📝 Palavra: *${r.display}*\n` +
        `🔤 Letras: *${r.length}*\n\n` +
        `━━━━━━━━━━━━━━━━━━\n` +
        `💬 *COMO JOGAR:*\n` +
        `━━━━━━━━━━━━━━━━━━\n` +
        `📌 Responda esta mensagem com:\n` +
        `  • Uma letra (ex: A)\n` +
        `  • A palavra completa (ex: CACHORRO)\n\n` +
        `⚠️ Erro na palavra = -2 vidas\n\n` +
        `🎯 *Comandos úteis:*\n` +
        `  • !forca status — ver estado atual\n` +
        `  • !forca cancelar — encerrar partida`,
    });

    // Salva o messageId para detectar respostas
    game.updateMessageId(from, msg.key.id);
  },
};

function buildStatus(state) {
  return (
    `${state.hangman}\n\n` +
    `📝 *${state.display}*\n` +
    `💔 Vidas restantes: ${state.maxErrors - state.errors}/${state.maxErrors}\n` +
    `🔤 Erradas: ${state.wrongLetters || '—'}`
  );
}
