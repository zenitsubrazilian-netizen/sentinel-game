'use strict';

// ============================================================
// PIX.JS — Transferência de Zenith Coins entre usuários v1.0.0
// ============================================================

const { getUser, removeCoins, addCoins, CONFIG } = require('../utils/economy.js');

module.exports = {
  name: 'pix',
  execute: async ({ sock, from, sender, args, message }) => {
    const sym = CONFIG?.coinSymbol || 'Z¢';

    // ── Extrai usuário mencionado ─────────────────────────
    const mentioned =
      message.message?.extendedTextMessage?.contextInfo?.mentionedJid ||
      message.message?.conversation?.contextInfo?.mentionedJid ||
      [];

    const target = mentioned[0] || null;

    // ── Validações ────────────────────────────────────────

    if (!target) {
      return sock.sendMessage(from, {
        text: [
          `⚠️ Você precisa marcar alguém!`,
          ``,
          `📌 Uso: *!pix @usuário <valor>*`,
          `💡 Exemplo: *!pix @João 500*`,
        ].join('\n'),
      });
    }

    if (target === sender) {
      return sock.sendMessage(from, {
        text: `❌ Você não pode transferir moedas para si mesmo.`,
      });
    }

    const rawAmount = args.find(a => !a.startsWith('@'));
    const amount    = parseInt(rawAmount, 10);

    if (!rawAmount || isNaN(amount) || amount <= 0) {
      return sock.sendMessage(from, {
        text: [
          `⚠️ Informe um valor válido!`,
          ``,
          `📌 Uso: *!pix @usuário <valor>*`,
          `💡 Exemplo: *!pix @João 500*`,
        ].join('\n'),
      });
    }

    const senderUser = getUser(sender);
    const balance    = senderUser.coins || 0;

    if (balance < amount) {
      return sock.sendMessage(from, {
        text: [
          `❌ Saldo insuficiente!`,
          ``,
          `💳 Seu saldo: *${balance.toLocaleString('pt-BR')} ${sym}*`,
          `💸 Valor solicitado: *${amount.toLocaleString('pt-BR')} ${sym}*`,
          `📉 Faltam: *${(amount - balance).toLocaleString('pt-BR')} ${sym}*`,
        ].join('\n'),
      });
    }

    // ── Transferência ─────────────────────────────────────

    const deducted = removeCoins(sender, amount);
    if (!deducted) {
      return sock.sendMessage(from, { text: `❌ Erro ao processar a transferência. Tente novamente.` });
    }

    addCoins(target, amount, `pix_de_${sender.split('@')[0]}`);

    const senderNew = getUser(sender);
    const targetNew = getUser(target);

    const senderTag = sender.split('@')[0];
    const targetTag = target.split('@')[0];

    console.log(`[PIX] ${senderTag} → ${targetTag}: ${amount} ${sym}`);

    // ── Confirmação ───────────────────────────────────────

    await sock.sendMessage(from, {
      text: [
        `╭━━━〔 💸 *TRANSFERÊNCIA REALIZADA* 〕━━━╮`,
        `┃`,
        `┃ 👤 *Remetente:*   @${senderTag}`,
        `┃ 👤 *Destinatário:* @${targetTag}`,
        `┃`,
        `┃ 🪙 *Valor:* ${amount.toLocaleString('pt-BR')} ${sym}`,
        `┃`,
        `┃ 💳 Seu saldo atual: ${(senderNew.coins || 0).toLocaleString('pt-BR')} ${sym}`,
        `┃`,
        `╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━╯`,
      ].join('\n'),
      mentions: [sender, target],
    });
  },
};
