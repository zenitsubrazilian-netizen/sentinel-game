'use strict';

// ============================================================
// BOXES.JS — Sistema de loot boxes v4.0.0
// FILOSOFIA: Abrir uma caixa SEMPRE deve ser recompensador.
//   • Coins mínimo = preço da caixa (nunca há prejuízo)
//   • Sem itens básicos nos pools (sem 'classic', sem 'default')
//   • Duplicata = compensação generosa em coins (valor de mercado)
//   • Mensagens e estrutura pensadas para satisfação do jogador
// ============================================================

const { getUser, updateUser, addCoins, addXP } = require('./economy.js');

// ─────────────────────────────────────────────────────────────
// DEFINIÇÃO DAS CAIXAS
// Min de coins = preço da caixa | Max = 3-4x o preço
// ─────────────────────────────────────────────────────────────

const BOXES = {
  comum: {
    id: 'comum', name: 'Caixa Comum', icon: '📦',
    price: 150, rarity: 'Comum',
    desc: 'Sempre vale a pena. Coins, XP ou uma relíquia rara!',
    rewards: [
      { type: 'coins', min: 150,  max: 500,   weight: 50 },
      { type: 'xp',    min: 80,   max: 280,   weight: 35 },
      { type: 'relic', pool: 'raro',           weight: 15 },
    ],
  },

  rara: {
    id: 'rara', name: 'Caixa Rara', icon: '🎁',
    price: 500, rarity: 'Rara',
    desc: 'Boas recompensas garantidas, com chance de itens raros.',
    rewards: [
      { type: 'coins', min: 500,  max: 1600,  weight: 40 },
      { type: 'xp',    min: 300,  max: 1000,  weight: 28 },
      { type: 'frame', pool: 'raro',           weight: 16 },
      { type: 'relic', pool: 'raro',           weight: 16 },
    ],
  },

  epica: {
    id: 'epica', name: 'Caixa Épica', icon: '💎',
    price: 1500, rarity: 'Épica',
    desc: 'Itens épicos ou grandes fortunas — sempre vale o investimento.',
    rewards: [
      { type: 'coins', min: 1500, max: 5500,  weight: 33 },
      { type: 'xp',    min: 900,  max: 2800,  weight: 22 },
      { type: 'frame', pool: 'epico',          weight: 22 },
      { type: 'relic', pool: 'epico',          weight: 23 },
    ],
  },

  lendaria: {
    id: 'lendaria', name: 'Caixa Lendária', icon: '👑',
    price: 5000, rarity: 'Lendária',
    desc: 'Relíquias lendárias e fortunas reais aguardam.',
    rewards: [
      { type: 'coins', min: 5000, max: 15000, weight: 28 },
      { type: 'xp',    min: 2500, max: 7500,  weight: 18 },
      { type: 'frame', pool: 'lendario',       weight: 27 },
      { type: 'relic', pool: 'lendario',       weight: 27 },
    ],
  },

  celestial: {
    id: 'celestial', name: 'Caixa Celestial', icon: '🌌',
    price: 12000, rarity: 'Mítica',
    desc: 'O ápice da loja. Itens míticos e fortunas lendárias.',
    rewards: [
      { type: 'coins', min: 12000, max: 36000, weight: 22 },
      { type: 'xp',    min: 7000,  max: 22000, weight: 18 },
      { type: 'frame', pool: 'mitico',          weight: 30 },
      { type: 'relic', pool: 'mitico',          weight: 30 },
    ],
  },
};

// ─────────────────────────────────────────────────────────────
// POOLS DE ITENS POR RARIDADE
// 'classic' REMOVIDO — item básico disponível desde o início.
// Apenas itens que o jogador não possui por padrão.
// ─────────────────────────────────────────────────────────────

const RELIC_POOLS = {
  raro:    ['garra_do_lobo', 'escudo_runico', 'colar_vital'],
  epico:   ['orbe_arcano', 'botas_dos_ventos', 'cristal_de_furia', 'anel_de_regeneracao'],
  lendario:['manto_de_sombras', 'lamina_lendaria', 'tomo_arcano'],
  mitico:  ['coracao_de_tita', 'cetro_das_almas'],
};

const FRAME_POOLS = {
  // 'classic' removido — frame básico que não agrega valor real ao jogador
  raro:    ['shadow'],
  epico:   ['thunder', 'ice', 'crimson', 'void'],
  lendario:['root', 'galaxy', 'android'],
  mitico:  ['eclipse'],
};

// ─────────────────────────────────────────────────────────────
// COMPENSAÇÃO POR DUPLICATA
// Quando o jogador já tem todos os itens do pool, recebe coins
// equivalentes ao valor de mercado do item mais barato do pool.
// Sempre deve ser generoso — o jogador não deve sentir que perdeu.
// ─────────────────────────────────────────────────────────────

const DUPLICATE_COMP = {
  raro:    600,   // shadow (500) + bônus
  epico:   1400,  // média dos épicos + bônus
  lendario:2800,  // média dos lendários + bônus
  mitico:  6000,  // coração de titã (2500) + cetro (3500) → média + bônus
};

// ─────────────────────────────────────────────────────────────
// INVENTÁRIO DE CAIXAS  { comum: 2, rara: 1, ... }
// ─────────────────────────────────────────────────────────────

function _normalizeBoxInv(user) {
  if (!user.inventory) user.inventory = {};
  if (Array.isArray(user.inventory.boxes) || !user.inventory.boxes) {
    user.inventory.boxes = {};
  }
  return user.inventory.boxes;
}

function getBoxInventory(userId) {
  const user = getUser(userId);
  return { ..._normalizeBoxInv(user) };
}

function addBoxToInventory(userId, boxId, qty = 1) {
  const user  = getUser(userId);
  const boxes = _normalizeBoxInv(user);
  boxes[boxId] = (boxes[boxId] || 0) + qty;
  updateUser(userId, user);
  return boxes[boxId];
}

function removeBoxFromInventory(userId, boxId) {
  const user  = getUser(userId);
  const boxes = _normalizeBoxInv(user);
  if (!boxes[boxId] || boxes[boxId] <= 0) return false;
  boxes[boxId]--;
  if (boxes[boxId] <= 0) delete boxes[boxId];
  updateUser(userId, user);
  return true;
}

// ─────────────────────────────────────────────────────────────
// SORTEIO
// Garante que o mínimo de coins seja sempre >= preço da caixa.
// ─────────────────────────────────────────────────────────────

function rollReward(boxId) {
  const box = BOXES[boxId];
  if (!box) return null;

  const total = box.rewards.reduce((s, r) => s + r.weight, 0);
  let roll    = Math.random() * total;

  for (const r of box.rewards) {
    roll -= r.weight;
    if (roll > 0) continue;

    if (r.type === 'coins' || r.type === 'xp') {
      // Garante que o min nunca seja menor que o declarado
      // (que já foi definido como >= preço da caixa para coins)
      const amount = Math.floor(Math.random() * (r.max - r.min + 1)) + r.min;
      return { type: r.type, amount };
    }

    if (r.type === 'frame' || r.type === 'relic') {
      return { type: r.type, pool: r.pool };
    }
  }

  // Fallback seguro: devolve o preço da caixa em coins (nunca perde)
  return { type: 'coins', amount: box.price };
}

// ─────────────────────────────────────────────────────────────
// RESOLUÇÃO DE ITEM (frame ou relic)
// Se todos os itens do pool já forem possuídos, paga compensação
// generosa em coins em vez de dar um item duplicado sem valor.
// ─────────────────────────────────────────────────────────────

function resolveItemReward(userId, itemType, pool) {
  const pools  = itemType === 'relic' ? RELIC_POOLS : FRAME_POOLS;
  const invKey = itemType === 'relic' ? 'relics' : 'frames';
  const all    = pools[pool] || [];

  const user      = getUser(userId);
  const owned     = user.inventory?.[invKey] || [];
  const available = all.filter(id => !owned.includes(id));

  // Jogador já tem todos os itens deste pool → compensação em coins
  if (available.length === 0) {
    const comp = DUPLICATE_COMP[pool] || DUPLICATE_COMP.raro;
    addCoins(userId, comp, 'box_duplicate_comp');
    return { type: 'duplicate_comp', itemType, pool, comp };
  }

  // Sorteia um item que o jogador ainda não possui
  const chosen    = available[Math.floor(Math.random() * available.length)];
  const freshUser = getUser(userId);
  if (!freshUser.inventory[invKey]) freshUser.inventory[invKey] = [];
  freshUser.inventory[invKey].push(chosen);
  updateUser(userId, freshUser);

  return { type: itemType, id: chosen, pool };
}

// ─────────────────────────────────────────────────────────────
// ABRIR CAIXA (exige item no inventário)
// ─────────────────────────────────────────────────────────────

function openBox(userId, boxId) {
  const box = BOXES[boxId];
  if (!box) return { error: 'invalid_box' };

  if (!removeBoxFromInventory(userId, boxId)) {
    return { error: 'not_in_inventory' };
  }

  const raw = rollReward(boxId);
  if (!raw) return { error: 'roll_failed' };

  let finalReward;

  if (raw.type === 'coins') {
    addCoins(userId, raw.amount, `box_${boxId}`);
    finalReward = raw;
  } else if (raw.type === 'xp') {
    addXP(userId, raw.amount, `box_${boxId}`);
    finalReward = raw;
  } else {
    finalReward = resolveItemReward(userId, raw.type, raw.pool);
  }

  console.log(`[BOX] ${userId.split('@')[0]} abriu ${boxId}: ${JSON.stringify(finalReward)}`);
  return { ok: true, reward: finalReward, box };
}

// ─────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────

function getBoxList() {
  return Object.values(BOXES).map(b => ({
    id: b.id, name: b.name, icon: b.icon,
    price: b.price, rarity: b.rarity, desc: b.desc,
  }));
}

module.exports = {
  BOXES, RELIC_POOLS, FRAME_POOLS,
  getBoxList, openBox,
  addBoxToInventory, removeBoxFromInventory, getBoxInventory,
};
