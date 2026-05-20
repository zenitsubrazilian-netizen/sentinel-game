'use strict';

const { equipItem } = require('../utils/shop.js');

module.exports = {
  name: 'equipar',
  execute: async ({ sock, from, sender, args }) => {

    if (args.length < 2) {
      return sock.sendMessage(from, {
        text: [
          `⚠️ Informe o tipo e o ID do item!`,
          ``,
          `📌 Uso: *!equipar <tipo> <id>*`,
          `💡 Exemplos:`,
          `  *!equipar frame shadow*`,
          `  *!equipar font royal*`,
          `  *!equipar relic garra_do_lobo*`,
          ``,
          `🎒 Use *!inventario* para ver seus itens`,
        ].join('\n'),
      });
    }

    const itemType = args[0].toLowerCase();
    const itemId   = args[1].toLowerCase();

    if (!['frame', 'font', 'relic'].includes(itemType)) {
      return sock.sendMessage(from, {
        text: '❌ Tipo inválido.\n\nTipos disponíveis: frame | font | relic',
      });
    }

    const result = equipItem(sender, itemType, itemId);

    if (result.error === 'not_owned') {
      return sock.sendMessage(from, {
        text: '❌ Você não possui este item.\n\n🛒 Use *!loja* para comprar.',
      });
    }

    const icon = itemType === 'frame' ? '🖼️' : itemType === 'font' ? '🔤' : '⚔️';
    const name = itemType === 'frame' ? 'Moldura' : itemType === 'font' ? 'Fonte' : 'Relíquia';

    await sock.sendMessage(from, {
      text: [
        `✅ *${name} equipada com sucesso!*`,
        ``,
        `${icon} ID: \`${itemId}\``,
        ``,
        `💡 Use *!inventario* para conferir`,
      ].join('\n'),
    });
  },
};
