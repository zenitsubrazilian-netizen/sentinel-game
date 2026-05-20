'use strict';

// ============================================================
// CAIXA.JS — Inventário de loot boxes do usuário
// ============================================================

const { getBoxList, BOXES, getBoxInventory } = require('../utils/boxes.js');
const { CONFIG } = require('../utils/economy.js');

module.exports = {
  name: 'caixa',
  execute: async ({ sock, from, sender }) => {
    const sym       = CONFIG?.coinSymbol || 'Z¢';
    const inventory = getBoxInventory(sender);
    const hasBoxes  = Object.keys(inventory).some(k => inventory[k] > 0);

    // ── Inventário do usuário ──────────────────────────────
    const invLines = [];
    if (hasBoxes) {
      invLines.push(`📬 *Suas caixas:*`);
      for (const [id, qty] of Object.entries(inventory)) {
        if (qty <= 0) continue;
        const box = BOXES[id];
        if (!box) continue;
        invLines.push(`  ${box.icon} *${box.name}* — ${qty}x`);
      }
      invLines.push(``, `💡 Use *!abrir <id>* para abrir uma caixa`, ``);
    } else {
      invLines.push(`📭 Você não tem caixas no inventário.`,
                    `💡 Compre com *!comprar caixa <id>*`, ``);
    }

    // ── Catálogo disponível ────────────────────────────────
    const boxes    = getBoxList();
    const catalog  = boxes.map(b =>
      `${b.icon} *${b.name}*\n   _${b.rarity}_ | ${b.price} ${sym}\n   ${b.desc}`
    );

    const msg = [
      `━━━━━━━━━━━━━━━━━━`,
      `📦 *CAIXAS SENTINEL*`,
      `━━━━━━━━━━━━━━━━━━`,
      ``,
      ...invLines,
      `🛒 *Disponíveis na loja:*`,
      `━━━━━━━━━━━━━━━━━━`,
      ``,
      ...catalog,
      ``,
      `━━━━━━━━━━━━━━━━━━`,
      `📌 *!comprar caixa <id> [qtd]*`,
      `📌 *!abrir <id>*`,
      ``,
      `💡 IDs: comum | rara | epica | lendaria | celestial`,
    ].join('\n');

    await sock.sendMessage(from, { text: msg });
  },
};
