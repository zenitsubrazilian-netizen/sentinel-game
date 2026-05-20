'use strict';

const { calcularExpressao } = require('../utils/ai.js');

module.exports = {
  name: 'calcular',
  execute: async ({ sock, from, text }) => {
    const expression = text.replace(/^!calcular\s*/i, '').trim();

    if (!expression) {
      return sock.sendMessage(from, { text: 'Uso: !calcular <expressão>\n\nExemplo: !calcular 2 + 5 × (3² - 1)' });
    }

    console.log(`[CALCULAR] "${expression}"`);
    const result = await calcularExpressao(expression);

    return sock.sendMessage(from, {
      text: result || 'Não foi possível calcular no momento.',
    });
  },
};
