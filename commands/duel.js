'use strict';
const axios = require('axios');

const SERVER = 'https://sentinel-game-3.onrender.com';

let getBattleBonus = () => ({});
try { getBattleBonus = require('../utils/shop.js').getBattleBonus; } catch (_) {}

const DIFFS  = ['easy', 'medium', 'hard'];
const genUrl = (roomId, player) => `${SERVER}/game?room=${roomId}&player=${player}`;

module.exports = {
  name: 'duel',

  execute: async ({ sock, message, from, sender, args, isGroup }) => {
    try {
      if (!isGroup)
        return sock.sendMessage(from, { text: '⚠️ Apenas em grupos.' });

      if (!args.length)
        return sock.sendMessage(from, { text: helpText() });

      const p1Num   = sender.split('@')[0];
      const p1Bonus = getBattleBonus(sender);

      const vsBot = args.some(a =>
        a.replace(/^@/, '').toLowerCase() === 'sentinel'
      );

      // ── VS BOT ────────────────────────────────────────────────────────────
      if (vsBot) {
        const diff = args.find(a => DIFFS.includes(a.toLowerCase()))?.toLowerCase() || 'medium';

        let data;
        try {
          ({ data } = await axios.post(
            `${SERVER}/room`,
            { p1Jid: sender, isVsBot: true, difficulty: diff, p1Bonus },
            { timeout: 15000 }
          ));
        } catch (e) {
          console.error('[DUEL] Falha ao criar sala vs bot:', e.message);
          return sock.sendMessage(from, { text: '❌ Servidor de duelos indisponível. Tente novamente.' });
        }

        const link = genUrl(data.roomId, 'p1');
        const diffLabel = { easy: '🟢 Fácil', medium: '🟡 Médio', hard: '🔴 Difícil' }[diff];

        await sock.sendMessage(sender, {
          text: `⚔️ *Duelo contra Sentinel — ${diffLabel}*\n\n🔗 ${link}\n\n⏳ Link válido por 20 min`,
        });

        return sock.sendMessage(from, {
          text: `⚔️ @${p1Num} vs 🤖 Sentinel (${diffLabel})`,
          mentions: [sender],
        });
      }

      // ── VS PLAYER ─────────────────────────────────────────────────────────
      const mentioned =
        message.message?.extendedTextMessage?.contextInfo?.mentionedJid || [];

      if (!mentioned.length)
        return sock.sendMessage(from, { text: helpText() });

      const p2Jid = mentioned[0];

      if (p2Jid === sender)
        return sock.sendMessage(from, { text: '😐 Você não pode duelar consigo mesmo.' });

      const p2Num   = p2Jid.split('@')[0];
      const p2Bonus = getBattleBonus(p2Jid);

      let data;
      try {
        ({ data } = await axios.post(
          `${SERVER}/room`,
          { p1Jid: sender, p2Jid, isVsBot: false, p1Bonus, p2Bonus },
          { timeout: 15000 }
        ));
      } catch (e) {
        console.error('[DUEL] Falha ao criar sala pvp:', e.message);
        return sock.sendMessage(from, { text: '❌ Servidor de duelos indisponível. Tente novamente.' });
      }

      // Envia links individualmente no PV
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

      return sock.sendMessage(from, {
        text: `⚔️ @${p1Num} desafiou @${p2Num}! Links enviados no PV.`,
        mentions: [sender, p2Jid],
      });

    } catch (err) {
      console.error('[DUEL ERROR]', err.message);
      return sock.sendMessage(from, { text: '❌ Erro inesperado no sistema de duelos.' });
    }
  },
};

function helpText() {
  return [
    '⚔️ *DUELO RPG*',
    '',
    '`!duel @usuário` — duelo PvP',
    '`!duel @Sentinel` — vs bot (médio)',
    '`!duel @Sentinel easy|medium|hard` — escolher dificuldade',
  ].join('\n');
}
