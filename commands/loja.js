'use strict';

// ============================================================
// LOJA v2.3.0  (+categoria caixas)
// ============================================================

const { getShopItems } = require('../utils/shop.js');
const { CONFIG }       = require('../utils/economy.js');

const VALID_CATEGORIES = ['all', 'frames', 'fonts', 'reliquias', 'relics', 'caixas'];

module.exports = {
  name: 'loja',
  execute: async ({ sock, from, args }) => {
    const category = (args[0] || 'all').toLowerCase();

    if (!VALID_CATEGORIES.includes(category)) {
      return sock.sendMessage(from, {
        text: [
          `⚠️ Categoria inválida.`,
          ``,
          `📌 Categorias disponíveis:`,
          `  • all       — tudo`,
          `  • frames    — molduras`,
          `  • fonts     — fontes`,
          `  • reliquias — itens de batalha ⚔️`,
          `  • caixas    — loot boxes 🎰`,
          ``,
          `💡 Exemplo: *!loja caixas*`,
        ].join('\n'),
      });
    }

    let items;
    try {
      items = getShopItems(category);
    } catch (err) {
      console.error('[LOJA] Erro ao obter itens:', err.message);
      return sock.sendMessage(from, { text: '❌ Erro ao carregar a loja.' });
    }

    if (!items || items.length === 0) {
      return sock.sendMessage(from, { text: '📦 Nenhum item disponível nesta categoria.' });
    }

    const sym     = CONFIG?.coinSymbol || 'Z¢';
    const grouped = {};
    items.forEach(item => {
      if (!grouped[item.type]) grouped[item.type] = [];
      grouped[item.type].push(item);
    });

    const lines = [];

    if (grouped.frame) {
      lines.push(`🖼️ *MOLDURAS*`, `━━━━━━━━━━━━━━━━━━`);
      grouped.frame.forEach(item =>
        lines.push(`• *${item.name}*`, `  _${item.rarity}_ | ${item.price} ${sym}`, `  ID: \`${item.id}\``, ``));
    }

    if (grouped.font) {
      lines.push(`🔤 *FONTES*`, `━━━━━━━━━━━━━━━━━━`);
      grouped.font.forEach(item =>
        lines.push(`• *${item.name}*`, `  _${item.rarity}_ | ${item.price} ${sym}`, `  ID: \`${item.id}\``, ``));
    }

    if (grouped.relic) {
      lines.push(`⚔️ *RELÍQUIAS DE BATALHA*`, `━━━━━━━━━━━━━━━━━━`,
                 `_Equipar dá bônus automáticos no !duel e !duo_`, ``);
      grouped.relic.forEach(item =>
        lines.push(`${item.icon || '🔮'} *${item.name}*`,
                   `  _${item.rarity}_ | ${item.price} ${sym}`,
                   `  📌 ${item.desc}`,
                   `  ID: \`${item.id}\``, ``));
    }

    if (grouped.caixa) {
      lines.push(`🎰 *LOOT BOXES*`, `━━━━━━━━━━━━━━━━━━`,
                 `_Compre e guarde no inventário — abra quando quiser!_`, ``);
      grouped.caixa.forEach(item =>
        lines.push(`${item.icon} *${item.name}*`,
                   `  _${item.rarity}_ | ${item.price} ${sym}`,
                   `  📌 ${item.desc}`,
                   `  ID: \`${item.id}\``, ``));
    }

    const msg = [
      `━━━━━━━━━━━━━━━━━━`,
      `🛒 *LOJA SENTINEL*`,
      `━━━━━━━━━━━━━━━━━━`,
      ``,
      ...lines,
      `━━━━━━━━━━━━━━━━━━`,
      `💡 *Como comprar:*`,
      `  !comprar frame <id>`,
      `  !comprar font <id>`,
      `  !comprar relic <id>`,
      `  !comprar caixa <id> [qtd]`,
      ``,
      `💡 *Como equipar:*`,
      `  !equipar frame <id>`,
      `  !equipar font <id>`,
      `  !equipar relic <id>`,
      ``,
      `🎰 *Abrir caixa:*  !abrir <id>`,
      `📦 *Seu inventário de caixas:* !caixa`,
    ].join('\n');

    await sock.sendMessage(from, { text: msg });
  },
};
