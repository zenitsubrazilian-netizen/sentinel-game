'use strict';

// ============================================================
// TRABALHAR.JS — Emprego interativo v2.1.0
// FIXES: try/catch, cooldown após validação, logs claros
// ============================================================

const { getUser, updateUser, CONFIG } = require('../utils/economy.js');
const { setSession, hasSession }      = require('../utils/gameSession.js');

const COOLDOWN_MS = 60 * 60_000;

const ALL_JOBS = [
  { emoji:'👨‍💻', name:'Dev Freelancer',      min:150, max:420 },
  { emoji:'🍔',  name:'Delivery',             min:80,  max:200 },
  { emoji:'🔧',  name:'Mecânico',             min:110, max:310 },
  { emoji:'🎨',  name:'Designer Gráfico',     min:100, max:290 },
  { emoji:'📦',  name:'Repositor',            min:70,  max:170 },
  { emoji:'🍕',  name:'Pizzaiolo',            min:90,  max:220 },
  { emoji:'💇',  name:'Cabeleireiro',         min:100, max:260 },
  { emoji:'🚗',  name:'Motorista de App',     min:80,  max:200 },
  { emoji:'📸',  name:'Fotógrafo',            min:110, max:300 },
  { emoji:'🏗️', name:'Pedreiro',             min:100, max:240 },
  { emoji:'🎓',  name:'Professor Particular', min:130, max:340 },
  { emoji:'🌿',  name:'Jardineiro',           min:70,  max:180 },
  { emoji:'🏪',  name:'Caixa de Mercado',     min:75,  max:175 },
  { emoji:'🐾',  name:'Pet Sitter',           min:80,  max:200 },
  { emoji:'🧹',  name:'Faxineiro',            min:70,  max:160 },
];

function fmtCooldown(ms) {
  const m = Math.floor(ms / 60_000);
  return m < 1 ? 'menos de 1 minuto' : `${m} minuto${m !== 1 ? 's' : ''}`;
}

function pickThree(arr) {
  return [...arr].sort(() => Math.random() - 0.5).slice(0, 3);
}

module.exports = {
  name: 'trabalhar',
  execute: async ({ sock, from, sender }) => {
    try {
      const S    = CONFIG?.coinSymbol || 'Z¢';
      const user = getUser(sender);
      const now  = Date.now();

      // ── Cooldown ──
      const elapsed = now - (user.lastTrabalhar || 0);
      if (elapsed < COOLDOWN_MS) {
        return sock.sendMessage(from, {
          text: [
            `⏳ *Você tá cansado!*`,
            ``,
            `😴 Descanse *${fmtCooldown(COOLDOWN_MS - elapsed)}* antes de trabalhar de novo.`,
            `💡 Enquanto isso: *!crime* *!pescar* *!minerar* *!apostar*`,
          ].join('\n'),
        });
      }

      // ── Sessão ativa ──
      if (hasSession(sender)) {
        return sock.sendMessage(from, {
          text: `⚠️ Você tem uma ação em andamento. Finalize antes de trabalhar.`,
        });
      }

      // ── Registra cooldown apenas após validações ──
      user.lastTrabalhar = now;
      updateUser(sender, user);

      const jobs = pickThree(ALL_JOBS);
      setSession(sender, { game: 'trabalhar', step: 'picking_job', jobs });

      console.log(`[TRABALHAR] ${sender.split('@')[0]} escolhendo emprego`);

      await sock.sendMessage(from, {
        text: [
          `╭━━━〔 💼 *VAGAS DISPONÍVEIS* 〕━━━╮`,
          `┃`,
          `┃ Escolha um emprego:`,
          `┃`,
          `┃ 1️⃣ ${jobs[0].emoji} *${jobs[0].name}*`,
          `┃    💰 ${jobs[0].min}–${jobs[0].max} ${S}`,
          `┃`,
          `┃ 2️⃣ ${jobs[1].emoji} *${jobs[1].name}*`,
          `┃    💰 ${jobs[1].min}–${jobs[1].max} ${S}`,
          `┃`,
          `┃ 3️⃣ ${jobs[2].emoji} *${jobs[2].name}*`,
          `┃    💰 ${jobs[2].min}–${jobs[2].max} ${S}`,
          `┃`,
          `┃ _(responda com 1, 2 ou 3)_`,
          `╰━━━━━━━━━━━━━━━━━━━━━━━╯`,
        ].join('\n'),
      });
    } catch (err) {
      console.error('[TRABALHAR] execute error:', err.message, err.stack);
      return sock.sendMessage(from, { text: `❌ Erro ao buscar vagas. Tente novamente.` });
    }
  },
};
