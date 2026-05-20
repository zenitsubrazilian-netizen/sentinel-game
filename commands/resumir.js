'use strict';

const { resumirTexto } = require('../utils/ai.js');

module.exports = {
  name: 'resumir',
  execute: async ({ sock, from, text }) => {
    const content = text.replace(/^!resumir\s*/i, '').trim();

    if (!content || content.length < 20) {
      return sock.sendMessage(from, { text: 'Uso: !resumir <texto>' });
    }

    console.log(`[RESUMIR] ${content.length} caracteres`);
    const result = await resumirTexto(content);

    return sock.sendMessage(from, {
      text: result || 'Não foi possível resumir no momento.',
    });
  },
};
