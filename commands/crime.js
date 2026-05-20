'use strict';

// ============================================================
// CRIME.JS — Crime interativo v2.1.0
// FIXES: try/catch, cooldown apenas após validação, logs
// ============================================================

const { getUser, updateUser, CONFIG } = require('../utils/economy.js');
const { setSession, hasSession }      = require('../utils/gameSession.js');

const COOLDOWN_MS = 45 * 60_000;

const CRIME_TIERS = [
  [
    { emoji:'🎭', name:'Golpe do WhatsApp',        min:120, max:380,  fine_min:40,  fine_max:120, successRate:0.72 },
    { emoji:'🏪', name:'Furto em banca',            min:100, max:300,  fine_min:30,  fine_max:100, successRate:0.70 },
    { emoji:'📱', name:'Venda de celular suspeito', min:130, max:350,  fine_min:50,  fine_max:150, successRate:0.68 },
  ],
  [
    { emoji:'💳', name:'Fraude em cartão',  min:300, max:700,  fine_min:100, fine_max:300, successRate:0.58 },
    { emoji:'🏦', name:'Esquema bancário',  min:400, max:900,  fine_min:150, fine_max:400, successRate:0.55 },
    { emoji:'🚗', name:'Desmanche',         min:350, max:800,  fine_min:120, fine_max:350, successRate:0.57 },
  ],
  [
    { emoji:'🖥️', name:'Hack corporativo', min:700, max:1800, fine_min:300, fine_max:700, successRate:0.42 },
    { emoji:'🏦', name:'Assalto ao cofre', min:900, max:2200, fine_min:400, fine_max:900, successRate:0.38 },
    { emoji:'💊', name:'Tráfico de dados', min:600, max:1500, fine_min:250, fine_max:600, successRate:0.45 },
  ],
];

function fmtCooldown(ms) {
  const m = Math.floor(ms / 60_000);
  return m < 1 ? 'menos de 1 minuto' : `${m} minuto${m !== 1 ? 's' : ''}`;
}

function pickCrimes() {
  return CRIME_TIERS.map(tier => tier[Math.floor(Math.random() * tier.length)]);
}

module.exports = {
  name: 'crime',
  execute: async ({ sock, from, sender }) => {
    try {
      const S    = CONFIG?.coinSymbol || 'Z¢';
      const user = getUser(sender);
      const now  = Date.now();

      // ── Cooldown ──
      const elapsed = now - (user.lastCrime || 0);
      if (elapsed < COOLDOWN_MS) {
        return sock.sendMessage(from, {
          text: [
            `⏳ *Fica quieto por enquanto.*`,
            ``,
            `👮 Aguarda *${fmtCooldown(COOLDOWN_MS - elapsed)}* antes de tentar de novo.`,
            `💡 Enquanto isso: *!trabalhar* *!pescar* *!apostar*`,
          ].join('\n'),
        });
      }

      // ── Sessão ativa ──
      if (hasSession(sender)) {
        return sock.sendMessage(from, {
          text: `⚠️ Você tem uma ação pendente. Responde primeiro antes de cometer um crime.`,
        });
      }

      // ── Registra cooldown só depois de validar ──
      user.lastCrime = now;
      updateUser(sender, user);

      const crimes     = pickCrimes();
      const riskLabels = ['🟢 Baixo risco', '🟡 Médio risco', '🔴 Alto risco'];

      setSession(sender, { game: 'crime', step: 'picking_crime', crimes });

      console.log(`[CRIME] ${sender.split('@')[0]} iniciou escolha de crime`);

      await sock.sendMessage(from, {
        text: [
          `╭━━━〔 🦹 *ESCOLHA O CRIME* 〕━━━╮`,
          `┃`,
          `┃ 1️⃣ ${crimes[0].emoji} *${crimes[0].name}*`,
          `┃    ${riskLabels[0]} | ${crimes[0].min}–${crimes[0].max} ${S}`,
          `┃    📊 Chance: ${Math.round(crimes[0].successRate * 100)}%`,
          `┃`,
          `┃ 2️⃣ ${crimes[1].emoji} *${crimes[1].name}*`,
          `┃    ${riskLabels[1]} | ${crimes[1].min}–${crimes[1].max} ${S}`,
          `┃    📊 Chance: ${Math.round(crimes[1].successRate * 100)}%`,
          `┃`,
          `┃ 3️⃣ ${crimes[2].emoji} *${crimes[2].name}*`,
          `┃    ${riskLabels[2]} | ${crimes[2].min}–${crimes[2].max} ${S}`,
          `┃    📊 Chance: ${Math.round(crimes[2].successRate * 100)}%`,
          `┃`,
          `┃ _(responda com 1, 2 ou 3)_`,
          `╰━━━━━━━━━━━━━━━━━━━━━━━╯`,
        ].join('\n'),
      });
    } catch (err) {
      console.error('[CRIME] execute error:', err.message, err.stack);
      return sock.sendMessage(from, { text: `❌ Erro ao iniciar crime. Tente novamente.` });
    }
  },
};
