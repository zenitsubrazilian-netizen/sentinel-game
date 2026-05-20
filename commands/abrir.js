'use strict';

// ============================================================
// ABRIR.JS — Abre loot boxes do inventário v3.0.0
// FILOSOFIA: Toda abertura deve terminar com o jogador satisfeito.
//   • Mensagens sempre positivas e animadas
//   • Duplicata vira "bônus em coins" (sem negatividade)
//   • Exibe claramente o valor recebido vs preço pago
// ============================================================

const { openBox, BOXES, getBoxInventory } = require('../utils/boxes.js');
const { FRAMES, BATTLE_ITEMS }            = require('../utils/shop.js');
const { CONFIG }                          = require('../utils/economy.js');

// ─────────────────────────────────────────────────────────────
// HELPERS DE NOME / ÍCONE
// ─────────────────────────────────────────────────────────────

function resolveItemName(itemType, itemId) {
  if (itemType === 'frame') return FRAMES[itemId]?.name        || itemId;
  if (itemType === 'relic') return BATTLE_ITEMS[itemId]?.name  || itemId;
  return itemId;
}

function resolveItemIcon(itemType, itemId) {
  if (itemType === 'frame') return '🖼️';
  if (itemType === 'relic') return BATTLE_ITEMS[itemId]?.icon  || '⚔️';
  return '✨';
}

function resolveItemRarity(itemType, itemId) {
  if (itemType === 'frame') return FRAMES[itemId]?.rarity        || '';
  if (itemType === 'relic') return BATTLE_ITEMS[itemId]?.rarity  || '';
  return '';
}

// ─────────────────────────────────────────────────────────────
// FRASE DE ABERTURA ALEATÓRIA (hype)
// ─────────────────────────────────────────────────────────────

const OPENING_LINES = [
  '🎲 Os dados foram lançados...',
  '✨ O destino escolheu para você...',
  '🌀 A caixa se abre lentamente...',
  '⚡ O universo decidiu...',
  '🔮 A magia foi revelada...',
  '🎴 Sua sorte foi selada...',
];

function randomOpeningLine() {
  return OPENING_LINES[Math.floor(Math.random() * OPENING_LINES.length)];
}

// ─────────────────────────────────────────────────────────────
// COMANDO
// ─────────────────────────────────────────────────────────────

module.exports = {
  name: 'abrir',
  execute: async ({ sock, from, sender, args }) => {
    const sym     = CONFIG?.coinSymbol || 'Z¢';
    const boxType = (args[0] || '').toLowerCase();

    // ── Nenhum argumento ──────────────────────────────────
    if (!boxType) {
      return sock.sendMessage(from, {
        text: [
          `⚠️ Informe o tipo de caixa!`,
          ``,
          `📌 Uso: *!abrir <tipo>*`,
          `💡 Exemplo: *!abrir comum*`,
          ``,
          `🎰 Tipos disponíveis:`,
          `  📦 comum     (150 ${sym})`,
          `  🎁 rara      (500 ${sym})`,
          `  💎 epica    (1.500 ${sym})`,
          `  👑 lendaria (5.000 ${sym})`,
          `  🌌 celestial (12.000 ${sym})`,
          ``,
          `📦 Veja seu inventário: *!caixa*`,
        ].join('\n'),
      });
    }

    // ── Tipo de caixa inválido ────────────────────────────
    const box = BOXES[boxType];
    if (!box) {
      return sock.sendMessage(from, {
        text: `❌ Tipo de caixa inválido.\n\nUse *!caixa* para ver os tipos disponíveis.`,
      });
    }

    // ── Sem estoque no inventário ─────────────────────────
    const inventory = getBoxInventory(sender);
    if (!inventory[boxType] || inventory[boxType] <= 0) {
      return sock.sendMessage(from, {
        text: [
          `📭 Você não tem *${box.name}* no inventário.`,
          ``,
          `💰 Preço: ${box.price.toLocaleString('pt-BR')} ${sym}`,
          ``,
          `💡 Compre com: *!comprar caixa ${boxType}*`,
        ].join('\n'),
      });
    }

    // ── Abre a caixa ─────────────────────────────────────
    const result = openBox(sender, boxType);

    if (result.error === 'not_in_inventory') {
      return sock.sendMessage(from, { text: `❌ Caixa não encontrada no inventário.` });
    }
    if (result.error) {
      return sock.sendMessage(from, { text: `❌ Erro ao abrir a caixa (${result.error}).` });
    }

    // ── Monta bloco de recompensa ─────────────────────────
    const { reward } = result;
    let rewardLines  = [];

    if (reward.type === 'coins') {
      const profit = reward.amount - box.price;
      rewardLines = [
        `💰 *+${reward.amount.toLocaleString('pt-BR')} ${sym}*`,
        profit > 0
          ? `📈 Lucro líquido: *+${profit.toLocaleString('pt-BR')} ${sym}*`
          : `✅ Reembolso completo do investimento!`,
      ];

    } else if (reward.type === 'xp') {
      rewardLines = [
        `📈 *+${reward.amount.toLocaleString('pt-BR')} XP*`,
        `⭐ Progresso puro rumo ao próximo nível!`,
      ];

    } else if (reward.type === 'frame' || reward.type === 'relic') {
      const icon    = resolveItemIcon(reward.type, reward.id);
      const name    = resolveItemName(reward.type, reward.id);
      const rarity  = resolveItemRarity(reward.type, reward.id);
      const equip   = reward.type === 'frame' ? 'frame' : 'relic';
      rewardLines = [
        `${icon} *${name}*  _(${rarity})_`,
        `✨ Item adicionado ao inventário!`,
        `💡 Equipe agora: *!equipar ${equip} ${reward.id}*`,
      ];

    } else if (reward.type === 'duplicate_comp') {
      // Jogador já tinha todos os itens do pool → bônus em coins
      const icon = reward.itemType === 'relic' ? '⚔️' : '🖼️';
      rewardLines = [
        `${icon} Você já domina todos os itens deste nível!`,
        `💰 *Bônus de colecionador: +${reward.comp.toLocaleString('pt-BR')} ${sym}*`,
        `🏅 Colecionar tudo tem suas recompensas.`,
      ];
    }

    // ── Estoque restante ──────────────────────────────────
    const remaining = getBoxInventory(sender)[boxType] || 0;
    const stockLine = remaining > 0
      ? `┃ 📦 Ainda no inventário: *${remaining}x ${box.name}*`
      : `┃ 📭 Última ${box.name} aberta — compre mais em *!loja caixas*`;

    // ── Mensagem final ────────────────────────────────────
    const msg = [
      `╭━━━〔 🎰 *CAIXA ABERTA!* 〕━━━╮`,
      `┃`,
      `┃ ${box.icon} *${box.name}*  _(${box.rarity})_`,
      `┃ ${randomOpeningLine()}`,
      `┃`,
      `┃ ╔═══ 🎁 RECOMPENSA ═══╗`,
      ...rewardLines.map(l => `┃ ║  ${l}`),
      `┃ ╚════════════════════╝`,
      `┃`,
      stockLine,
      `┃`,
      `╰━━━━━━━━━━━━━━━━━━━━━━━╯`,
    ].join('\n');

    await sock.sendMessage(from, { text: msg });
  },
};
