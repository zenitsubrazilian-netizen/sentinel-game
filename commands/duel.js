'use strict';
const axios = require('axios');

// 🔥 USE URL REAL DO SEU BACKEND (RENDER / NGROK / VPS)
const SERVER = 'https://sentinel-game-3.onrender.com';

let getBattleBonus = () => ({});
try { getBattleBonus = require('../utils/shop.js').getBattleBonus; } catch(_) {}

const DIFFS = ['easy','medium','hard'];

const genUrl = (roomId, player) =>
  `${SERVER}/game?room=${roomId}&player=${player}`;

module.exports = {
  name: 'duel',

  execute: async ({ sock, message, from, sender, args, isGroup }) => {
    try {
      if (!isGroup)
        return sock.sendMessage(from, { text: '⚠️ Apenas em grupos.' });

      if (!args.length)
        return sock.sendMessage(from, { text: helpText() });

      const p1Num = sender.split('@')[0];
      const p1Bonus = getBattleBonus(sender);

      const vsBot = args.some(a =>
        a.replace(/^@/, '').toLowerCase() === 'sentinel'
      );

      // 🤖 VS BOT
      if (vsBot) {
        const diff =
          args.find(a => DIFFS.includes(a.toLowerCase()))?.toLowerCase() ||
          'medium';

        const { data } = await axios.post(
          `${SERVER}/room`,
          {
            p1Jid: sender,
            isVsBot: true,
            difficulty: diff,
            p1Bonus,
          },
          { timeout: 15000 }
        );

        const link = genUrl(data.roomId, 'p1');

        await sock.sendMessage(sender, {
          text: `⚔️ *Duelo contra Sentinel pronto!*\n\n🔗 ${link}\n\n⏳ 20 min`,
        });

        return sock.sendMessage(from, {
          text: `⚔️ @${p1Num} vs 🤖 Sentinel`,
          mentions: [sender],
        });
      }

      // 👤 VS PLAYER
      const mentioned =
        message.message?.extendedTextMessage?.contextInfo?.mentionedJid || [];

      if (!mentioned.length)
        return sock.sendMessage(from, { text: helpText() });

      const p2Jid = mentioned[0];
      if (p2Jid === sender)
        return sock.sendMessage(from, {
          text: '😐 Não pode duelar consigo mesmo.',
        });

      const p2Num = p2Jid.split('@')[0];
      const p2Bonus = getBattleBonus(p2Jid);

      const { data } = await axios.post(
        `${SERVER}/room`,
        {
          p1Jid: sender,
          p2Jid,
          isVsBot: false,
          p1Bonus,
          p2Bonus,
        },
        { timeout: 15000 }
      );

      await sock.sendMessage(sender, {
        text: `⚔️ Duelo contra @${p2Num}\n\n🔗 ${genUrl(data.roomId, 'p1')}`,
        mentions: [p2Jid],
      });

      await sock.sendMessage(p2Jid, {
        text: `⚔️ Você foi desafiado por @${p1Num}\n\n🔗 ${genUrl(data.roomId, 'p2')}`,
        mentions: [sender],
      });

      return sock.sendMessage(from, {
        text: `⚔️ @${p1Num} desafiou @${p2Num}!`,
        mentions: [sender, p2Jid],
      });

    } catch (err) {
      console.log('[DUEL ERROR]', err.message);

      return sock.sendMessage(from, {
        text: '❌ Erro ao conectar no sistema de duelos.',
      });
    }
  },
};

function helpText() {
  return [
    '⚔️ *DUELO RPG*',
    '',
    '!duel @usuário',
    '!duel @Sentinel easy|medium|hard',
  ].join('\n');
}
