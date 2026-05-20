'use strict';

// ============================================================
// MINERAR.JS — Mineração v1.1.0
// FIXES: try/catch, rarity 'Nada' sem ganho, logs
// ============================================================

const { getUser, updateUser, addCoins, CONFIG } = require('../utils/economy.js');

const COOLDOWN_MS = 45 * 60_000;

const MINERALS = [
  { emoji:'🪨',  name:'Pedra comum',        rarity:'Nada',      min:0,   max:0,    weight:20 },
  { emoji:'🌑',  name:'Carvão de lei',      rarity:'Comum',     min:40,  max:90,   weight:28 },
  { emoji:'🔩',  name:'Fragmento de ferro', rarity:'Comum',     min:60,  max:130,  weight:20 },
  { emoji:'🥈',  name:'Prata bruta',        rarity:'Incomum',   min:100, max:220,  weight:14 },
  { emoji:'🥇',  name:'Pepita de ouro',     rarity:'Raro',      min:180, max:380,  weight:10 },
  { emoji:'💎',  name:'Diamante',           rarity:'Épico',     min:400, max:750,  weight:5  },
  { emoji:'🔮',  name:'Cristal Arcano',     rarity:'Lendário',  min:700, max:1000, weight:2  },
  { emoji:'☄️', name:'Minério Celestial',  rarity:'Mítico',    min:900, max:1500, weight:1  },
];

const RARITY_LABEL = {
  'Nada':     '🪨 Nada',
  'Comum':    '⚪ Comum',
  'Incomum':  '🟢 Incomum',
  'Raro':     '🔵 Raro',
  'Épico':    '🟣 Épico',
  'Lendário': '🌟 Lendário',
  'Mítico':   '✨ Mítico',
};

const MINE_MSGS = [
  'Pegou a picareta e foi fundo...',
  'Escavou por horas no escuro...',
  'Entrou na mina cantarolando...',
  'Usou o capacete torto mas foi mesmo assim...',
  'Desceu pelo elevador enferrujado e rezou...',
];

function rollMineral() {
  const total = MINERALS.reduce((s, m) => s + m.weight, 0);
  let roll    = Math.random() * total;
  for (const m of MINERALS) { roll -= m.weight; if (roll <= 0) return m; }
  return MINERALS[0];
}

function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function fmtCooldown(ms) {
  const m = Math.floor(ms / 60_000);
  return m < 1 ? 'menos de 1 minuto' : `${m} minuto${m !== 1 ? 's' : ''}`;
}

module.exports = {
  name: 'minerar',
  execute: async ({ sock, from, sender }) => {
    try {
      const sym  = CONFIG?.coinSymbol || 'Z¢';
      const user = getUser(sender);
      const now  = Date.now();

      const elapsed = now - (user.lastMinerar || 0);
      if (elapsed < COOLDOWN_MS) {
        return sock.sendMessage(from, {
          text: [
            `⏳ *A mina ainda está sendo escavada!*`,
            ``,
            `⛏️ Aguarde *${fmtCooldown(COOLDOWN_MS - elapsed)}* para minerar de novo.`,
            `💡 Enquanto isso: *!trabalhar* *!crime* *!pescar*`,
          ].join('\n'),
        });
      }

      user.lastMinerar = now;
      updateUser(sender, user);

      const mineral  = rollMineral();
      const isNada   = mineral.rarity === 'Nada';
      const earned   = isNada ? 0 : randInt(mineral.min, mineral.max);
      const mineMsg  = MINE_MSGS[Math.floor(Math.random() * MINE_MSGS.length)];

      if (earned > 0) addCoins(sender, earned, 'minerar');

      const newBal     = getUser(sender).coins || 0;
      const rewardLine = isNada
        ? `┃ 😔 Só pedra. Nada de valor desta vez.`
        : `┃ 💰 *+${earned} ${sym}*`;

      console.log(`[MINERAR] ${sender.split('@')[0]} → ${mineral.name} (${mineral.rarity}) +${earned}`);

      await sock.sendMessage(from, {
        text: [
          `╭━━━〔 ⛏️ *MINERAÇÃO* 〕━━━╮`,
          `┃`,
          `┃ 🪖 ${mineMsg}`,
          `┃`,
          `┃ ${mineral.emoji} *${mineral.name}*`,
          `┃ 🏷️ Raridade: ${RARITY_LABEL[mineral.rarity] || mineral.rarity}`,
          `┃`,
          rewardLine,
          `┃ 💳 Saldo: ${newBal.toLocaleString('pt-BR')} ${sym}`,
          `┃`,
          `┃ ⏰ Próxima mineração em *45 minutos*`,
          `╰━━━━━━━━━━━━━━━━━━━━━╯`,
        ].join('\n'),
      });
    } catch (err) {
      console.error('[MINERAR] execute error:', err.message, err.stack);
      return sock.sendMessage(from, { text: `❌ Erro ao minerar. Tente novamente.` });
    }
  },
};
