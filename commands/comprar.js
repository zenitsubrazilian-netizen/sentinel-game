'use strict';

// ============================================================
// COMPRAR.JS — Compra de itens e caixas da loja
// Uso: !comprar <frame|font|relic|caixa> <id> [qtd]
// ============================================================

const { buyItem }  = require('../utils/shop.js');
const { CONFIG, getUser } = require('../utils/economy.js');

const TYPE_ALIASES = {
  frame:    'frame',
  moldura:  'frame',
  font:     'font',
  fonte:    'font',
  relic:    'relic',
  reliquia: 'relic',
  relíquia: 'relic',
  caixa:    'caixa',
  box:      'caixa',
};

module.exports = {
  name: 'comprar',
  execute: async ({ sock, from, sender, args }) => {
    const sym = CONFIG?.coinSymbol || 'Z¢';

    if (args.length < 2) {
      return sock.sendMessage(from, {
        text: [
          `⚠️ Uso correto:`,
          ``,
          `  *!comprar frame <id>*`,
          `  *!comprar font <id>*`,
          `  *!comprar relic <id>*`,
          `  *!comprar caixa <id> [qtd]*`,
          ``,
          `💡 Veja os itens em *!loja*`,
        ].join('\n'),
      });
    }

    const rawType = args[0].toLowerCase();
    const itemId  = args[1].toLowerCase();
    const qty     = parseInt(args[2]) || 1;
    const type    = TYPE_ALIASES[rawType];

    if (!type) {
      return sock.sendMessage(from, {
        text: `❌ Tipo inválido: *${rawType}*\n\nUse: frame | font | relic | caixa`,
      });
    }

    const result = buyItem(sender, type, itemId, qty);

    // ── Erros ──────────────────────────────────────────────
    if (result.error === 'not_found') {
      return sock.sendMessage(from, {
        text: `❌ Item *${itemId}* não encontrado.\n\nVeja os IDs disponíveis em *!loja*`,
      });
    }

    if (result.error === 'already_owned') {
      return sock.sendMessage(from, {
        text: `⚠️ Você já possui este item!\n\nUse *!equipar ${type} ${itemId}* para equipá-lo.`,
      });
    }

    if (result.error === 'not_purchasable') {
      return sock.sendMessage(from, {
        text: `❌ Este item não pode ser comprado diretamente.`,
      });
    }

    if (result.error === 'insufficient_funds') {
      const balance = getUser(sender).coins || 0;
      return sock.sendMessage(from, {
        text: [
          `💸 *Saldo insuficiente!*`,
          ``,
          `💰 Custo:    ${result.price} ${sym}`,
          `💳 Seu saldo: ${balance} ${sym}`,
          `📉 Faltam:    ${result.price - balance} ${sym}`,
          ``,
          `💡 Use *!daily* e *!weekly* para ganhar moedas!`,
        ].join('\n'),
      });
    }

    if (result.error) {
      return sock.sendMessage(from, { text: `❌ Erro ao comprar: ${result.error}` });
    }

    // ── Sucesso ────────────────────────────────────────────
    const item     = result.item;
    const icon     = item.icon || (type === 'frame' ? '🖼️' : type === 'font' ? '🔤' : '⚔️');
    const newBal   = getUser(sender).coins || 0;

    let extraInfo  = '';
    if (type === 'caixa') {
      extraInfo = `\n┃ 📦 Qtd comprada: ${result.qty}x\n┃ 💡 Abra com: *!abrir ${itemId}*`;
    } else {
      extraInfo = `\n┃ 💡 Equipe com: *!equipar ${type} ${itemId}*`;
    }

    const msg = [
      `╭━〔 🛒 *COMPRA FEITA* 🛒 〕━╮`,
      `┃`,
      `┃ ${icon} *${item.name}*`,
      `┃ Raridade: ${item.rarity}`,
      `┃ Valor: ${result.total || item.price} ${sym}`,
      `┃${extraInfo}`,
      `┃`,
      `┃ 💳 Saldo restante: ${newBal} ${sym}`,
      `┃`,
      `╰━━━━━━━━━━━━━━━━━━━━━╯`,
    ].join('\n');

    await sock.sendMessage(from, { text: msg });
    console.log(`[COMPRAR] ${sender.split('@')[0]} → ${type}:${itemId}${result.qty > 1 ? ` x${result.qty}` : ''}`);
  },
};
