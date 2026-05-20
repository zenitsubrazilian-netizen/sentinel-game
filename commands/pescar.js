'use strict';

// ============================================================
// PESCAR.JS — Pesca v1.1.0
// FIXES: try/catch, lixo sem addCoins desnecessário, logs
// ============================================================

const { getUser, updateUser, addCoins, CONFIG } = require('../utils/economy.js');

const COOLDOWN_MS = 30 * 60_000;

const FISH = [
  { emoji:'👟',  name:'Tênis velho',       rarity:'Lixo',     min:0,   max:0,   weight:12 },
  { emoji:'🛢️', name:'Latinha amassada',   rarity:'Lixo',     min:0,   max:0,   weight:10 },
  { emoji:'🧦',  name:'Meia sem par',      rarity:'Lixo',     min:0,   max:0,   weight:8  },
  { emoji:'🐟',  name:'Peixe comum',       rarity:'Comum',    min:30,  max:80,  weight:28 },
  { emoji:'🦀',  name:'Siri pequenininho', rarity:'Comum',    min:40,  max:90,  weight:15 },
  { emoji:'🐡',  name:'Baiacu irritado',   rarity:'Comum',    min:35,  max:75,  weight:12 },
  { emoji:'🦑',  name:'Lula gigante',      rarity:'Raro',     min:120, max:280, weight:8  },
  { emoji:'🐬',  name:'Golfinho amigável', rarity:'Raro',     min:150, max:350, weight:4  },
  { emoji:'🦞',  name:'Lagosta premiada',  rarity:'Raro',     min:180, max:400, weight:3  },
  { emoji:'🐉',  name:'Peixe Dragão',      rarity:'Lendário', min:500, max:800, weight:1  },
  { emoji:'🧜',  name:'Sereia (devolvida)',rarity:'Lendário', min:400, max:700, weight:1  },
];

const RARITY_LABEL = {
  'Lixo':     '🗑️ Lixo',
  'Comum':    '⚪ Comum',
  'Raro':     '🔵 Raro',
  'Lendário': '🌟 Lendário',
};

const CAST_MSGS = [
  'jogou a linha e esperou pacientemente...',
  'lançou a isca e ficou olhando pro nada...',
  'colocou minhoca no anzol e rezou baixinho...',
  'joga a linha e fecha os olhos pra concentrar...',
];

function rollFish() {
  const total = FISH.reduce((s, f) => s + f.weight, 0);
  let roll    = Math.random() * total;
  for (const f of FISH) { roll -= f.weight; if (roll <= 0) return f; }
  return FISH[0];
}

function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function fmtCooldown(ms) {
  const m = Math.floor(ms / 60_000);
  return m < 1 ? 'menos de 1 minuto' : `${m} minuto${m !== 1 ? 's' : ''}`;
}

module.exports = {
  name: 'pescar',
  execute: async ({ sock, from, sender }) => {
    try {
      const sym  = CONFIG?.coinSymbol || 'Z¢';
      const user = getUser(sender);
      const now  = Date.now();

      const elapsed = now - (user.lastPescar || 0);
      if (elapsed < COOLDOWN_MS) {
        return sock.sendMessage(from, {
          text: [
            `⏳ *A linha ainda está na água!*`,
            ``,
            `🎣 Aguarde *${fmtCooldown(COOLDOWN_MS - elapsed)}* para pescar de novo.`,
            `💡 Enquanto isso: *!trabalhar* *!crime* *!minerar*`,
          ].join('\n'),
        });
      }

      user.lastPescar = now;
      updateUser(sender, user);

      const fish    = rollFish();
      const isTrash = fish.rarity === 'Lixo';
      const earned  = isTrash ? 0 : randInt(fish.min, fish.max);
      const cast    = CAST_MSGS[Math.floor(Math.random() * CAST_MSGS.length)];

      if (earned > 0) addCoins(sender, earned, 'pescar');

      const newBal     = getUser(sender).coins || 0;
      const rewardLine = isTrash
        ? `┃ 🗑️ Pescou lixo. Nada de valor hoje.`
        : `┃ 💰 *+${earned} ${sym}*`;

      console.log(`[PESCAR] ${sender.split('@')[0]} → ${fish.name} (${fish.rarity}) +${earned}`);

      await sock.sendMessage(from, {
        text: [
          `╭━━━〔 🎣 *PESCARIA* 〕━━━╮`,
          `┃`,
          `┃ 🌊 ${cast}`,
          `┃`,
          `┃ ${fish.emoji} *${fish.name}*`,
          `┃ 🏷️ Raridade: ${RARITY_LABEL[fish.rarity] || fish.rarity}`,
          `┃`,
          rewardLine,
          `┃ 💳 Saldo: ${newBal.toLocaleString('pt-BR')} ${sym}`,
          `┃`,
          `┃ ⏰ Próxima pesca em *30 minutos*`,
          `╰━━━━━━━━━━━━━━━━━━━╯`,
        ].join('\n'),
      });
    } catch (err) {
      console.error('[PESCAR] execute error:', err.message, err.stack);
      return sock.sendMessage(from, { text: `❌ Erro ao pescar. Tente novamente.` });
    }
  },
};
