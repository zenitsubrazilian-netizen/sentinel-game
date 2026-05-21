'use strict';

const axios = require('axios');
const { getBattleBonus } = require('../utils/shop.js');
const { addXP, removeXP } = require('../utils/economy.js');

const SERVER = 'https://sentinel-game-3.onrender.com';
const DIFFS  = ['easy', 'medium', 'hard', 'ai'];

const genUrl = (roomId, player) => `${SERVER}/duel?room=${roomId}&player=${player}`;

// ─── Polling: verifica resultado e concede/remove XP ─────────────────────────
function pollResult(sock, from, roomId, p1Jid, p2Jid) {
  const MAX   = 25;
  let   tries = 0;

  const timer = setInterval(async () => {
    tries++;
    if (tries > MAX) { clearInterval(timer); return; }

    try {
      const { data } = await axios.get(
        `${SERVER}/duel/room/${roomId}/result`,
        { timeout: 8000 }
      );
      if (!data.ended) return;

      clearInterval(timer);

      const mentions = [p1Jid, p2Jid].filter(j => j && j !== 'sentinel@s.whatsapp.net');
      const msgLines = [
        `━━━━━━━━━━━━━━━━━━`,
        `⚔️ *RESULTADO DO DUELO WEB*`,
        `━━━━━━━━━━━━━━━━━━`,
        ``,
      ];

      if (data.winner === 'draw') {
        if (!data.p1IsBot) addXP(data.p1Jid, 20, 'duel_draw_web');
        if (!data.p2IsBot) addXP(data.p2Jid, 20, 'duel_draw_web');
        msgLines.push(`🤝 *EMPATE!* Ambos recebem _+20 XP_`);
      } else {
        const winnerJid = data.winner === 'p1' ? data.p1Jid : data.p2Jid;
        const loserJid  = data.winner === 'p1' ? data.p2Jid : data.p1Jid;
        const winnerBot = data.winner === 'p1' ? data.p1IsBot : data.p2IsBot;
        const loserBot  = data.winner === 'p1' ? data.p2IsBot : data.p1IsBot;

        if (!winnerBot) addXP(winnerJid, 100, 'duel_win_web');
        if (!loserBot)  removeXP(loserJid, 100);

        const wLabel = winnerBot ? '🤖 Sentinel' : `@${winnerJid.split('@')[0]}`;
        const lLabel = loserBot  ? '🤖 Sentinel' : `@${loserJid.split('@')[0]}`;

        msgLines.push(
          `🏆 ${wLabel} *venceu!*`,
          ``,
          `📈 ${wLabel}: _+100 XP_`,
          `📉 ${lLabel}: _-100 XP_`,
        );
      }

      msgLines.push(``, `━━━━━━━━━━━━━━━━━━`);
      await sock.sendMessage(from, { text: msgLines.join('\n'), mentions }).catch(() => {});

    } catch (_) {
      // sala ainda ativa ou erro de rede — tenta na próxima iteração
    }
  }, 60_000);
}

// ─── Busca bônus de relíquia com log de diagnóstico ──────────────────────────
function fetchBonus(jid) {
  try {
    const bonus = getBattleBonus(jid);
    const keys  = Object.keys(bonus || {});
    if (keys.length > 0) {
      console.log(`[DUEL] Relíquia ativa para ${jid.split('@')[0]}:`, JSON.stringify(bonus));
    } else {
      console.log(`[DUEL] Sem relíquia equipada para ${jid.split('@')[0]}`);
    }
    return bonus || {};
  } catch (err) {
    console.error(`[DUEL] Erro ao buscar bonus para ${jid}:`, err.message);
    return {};
  }
}

module.exports = {
  name: 'duel',

  execute: async ({ sock, message, from, sender, args, isGroup }) => {
    try {
      if (!isGroup)
        return sock.sendMessage(from, { text: '⚠️ Apenas em grupos.' });

      if (!args.length)
        return sock.sendMessage(from, { text: helpText() });

      const p1Num   = sender.split('@')[0];
      const p1Bonus = fetchBonus(sender);

      const vsBot = args.some(a =>
        a.replace(/^@/, '').toLowerCase() === 'sentinel'
      );

      // ── VS BOT ───────────────────────────────────────────────────────────
      if (vsBot) {
        const diff      = args.find(a => DIFFS.includes(a.toLowerCase()))?.toLowerCase() || 'medium';
        const diffLabel = { easy: '🟢 Fácil', medium: '🟡 Médio', hard: '🔴 Difícil', ai: '🤖 IA' }[diff] || diff;

        let data;
        try {
          ({ data } = await axios.post(
            `${SERVER}/duel/room`,
            { p1Jid: sender, isVsBot: true, difficulty: diff, p1Bonus },
            { timeout: 15000, headers: { 'Content-Type': 'application/json' } }
          ));
        } catch (e) {
          console.error('[DUEL] Falha ao criar sala vs bot:', e.message);
          return sock.sendMessage(from, { text: '❌ Servidor de duelos indisponível. Tente novamente.' });
        }

        const link      = genUrl(data.roomId, 'p1');
        const relicInfo = Object.keys(p1Bonus).length
          ? `\n🔮 Relíquia: ${Object.entries(p1Bonus).map(([k,v]) => `${k}: +${v}`).join(' | ')}`
          : '';

        await sock.sendMessage(sender, {
          text: `⚔️ *Duelo contra Sentinel — ${diffLabel}*${relicInfo}\n\n🔗 ${link}\n\n⏳ Link válido por 20 min`,
        });

        await sock.sendMessage(from, {
          text: `⚔️ @${p1Num} vs 🤖 Sentinel (${diffLabel})`,
          mentions: [sender],
        });

        pollResult(sock, from, data.roomId, sender, 'sentinel@s.whatsapp.net');
        return;
      }

      // ── VS PLAYER ────────────────────────────────────────────────────────
      const mentioned =
        message.message?.extendedTextMessage?.contextInfo?.mentionedJid || [];

      if (!mentioned.length)
        return sock.sendMessage(from, { text: helpText() });

      const p2Jid = mentioned[0];
      if (p2Jid === sender)
        return sock.sendMessage(from, { text: '😐 Você não pode duelar consigo mesmo.' });

      const p2Num   = p2Jid.split('@')[0];
      const p2Bonus = fetchBonus(p2Jid);

      let data;
      try {
        ({ data } = await axios.post(
          `${SERVER}/duel/room`,
          { p1Jid: sender, p2Jid, isVsBot: false, p1Bonus, p2Bonus },
          { timeout: 15000, headers: { 'Content-Type': 'application/json' } }
        ));
      } catch (e) {
        console.error('[DUEL] Falha ao criar sala pvp:', e.message);
        return sock.sendMessage(from, { text: '❌ Servidor de duelos indisponível. Tente novamente.' });
      }

      await Promise.allSettled([
        sock.sendMessage(sender, {
          text: `⚔️ Duelo contra @${p2Num}\n\n🔗 ${genUrl(data.roomId, 'p1')}\n\n⏳ 20 min`,
          mentions: [p2Jid],
        }),
        sock.sendMessage(p2Jid, {
          text: `⚔️ Você foi desafiado por @${p1Num}!\n\n🔗 ${genUrl(data.roomId, 'p2')}\n\n⏳ 20 min`,
          mentions: [sender],
        }),
      ]);

      await sock.sendMessage(from, {
        text: `⚔️ @${p1Num} desafiou @${p2Num}! Links enviados no PV.`,
        mentions: [sender, p2Jid],
      });

      pollResult(sock, from, data.roomId, sender, p2Jid);

    } catch (err) {
      console.error('[DUEL ERROR]', err.message, err.stack);
      return sock.sendMessage(from, { text: '❌ Erro inesperado no sistema de duelos.' });
    }
  },
};

function helpText() {
  return [
    '⚔️ *DUELO RPG (via web)*', '',
    '`!duel @usuário` — duelo PvP',
    '`!duel @Sentinel` — vs bot (médio)',
    '`!duel @Sentinel easy|medium|hard|ai` — escolher dificuldade',
    '',
    '🔮 Equipe uma relíquia com `!equipar relic <id>` para bônus!',
  ].join('\n');
}
