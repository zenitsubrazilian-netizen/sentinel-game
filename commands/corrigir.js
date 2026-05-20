'use strict';

const { corrigirTexto } = require('../utils/ai.js');

module.exports = {
  name: 'corrigir',
  execute: async ({ sock, from, text }) => {
    const content = text.replace(/^!corrigir\s*/i, '').trim();

    if (!content || content.length < 3) {
      return sock.sendMessage(from, { text: 'Uso: !corrigir <texto>' });
    }

    console.log(`[CORRIGIR] "${content}"`);
    const result = await corrigirTexto(content);

    return sock.sendMessage(from, {
      text: result || 'Não foi possível corrigir no momento.',
    });
  },
};
