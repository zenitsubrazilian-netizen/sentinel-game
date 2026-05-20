'use strict';

// ============================================================
// GAMEHANDLER.JS — Handler de respostas de minigames v2.2.0
// Blackjack, Trabalhar, Crime
// FIXES: try/catch completo, logs detalhados, sessões corretas,
//        múltiplos usuários simultâneos, sem travamento
// ============================================================

const {
  getUser,
  addCoins,
  removeCoins,
  updateUser,
  addXP,
  CONFIG,
} = require('../utils/economy.js');

const { getSession, setSession, clearSession } = require('../utils/gameSession.js');

const S = CONFIG?.coinSymbol || 'Z¢';

// ─────────────────────────────────────────────────────────────
// BLACKJACK — HELPERS
// ─────────────────────────────────────────────────────────────

function cardVal(r) {
  if (['J', 'Q', 'K'].includes(r)) return 10;
  if (r === 'A') return 11;
  return parseInt(r, 10);
}

function handTotal(hand) {
  let total = 0;
  let aces  = 0;
  for (const c of hand) {
    total += cardVal(c.r);
    if (c.r === 'A') aces++;
  }
  while (total > 21 && aces-- > 0) total -= 10;
  return total;
}

function showHand(hand) {
  return hand.map(c => `${c.r}${c.s}`).join(' ');
}

async function resolveBlackjack(sock, from, sender, deck, player, dealer, bet) {
  const pTotal = handTotal(player);

  // Dealer saca até chegar em 17+
  let safetyCounter = 0;
  while (handTotal(dealer) < 17 && safetyCounter++ < 20) {
    if (!deck.length) break;
    dealer.push(deck.pop());
  }
  const dTotal = handTotal(dealer);

  let prize = 0;
  let resultText;

  if (dTotal > 21 || pTotal > dTotal) {
    prize = Math.floor(bet * 1.9);
    addCoins(sender, prize, 'blackjack_win');
    resultText = `┃ ✅ *Você venceu! (1.9x)*\n┃ 💰 *+${prize} ${S}*`;
    console.log(`[BJ] ${sender.split('@')[0]} VENCEU | player:${pTotal} dealer:${dTotal} | +${prize}`);
  } else if (pTotal === dTotal) {
    prize = bet;
    addCoins(sender, prize, 'blackjack_tie');
    resultText = `┃ 🤝 *Empate! Aposta devolvida.*\n┃ 💰 *+${prize} ${S}*`;
    console.log(`[BJ] ${sender.split('@')[0]} EMPATE | player:${pTotal} dealer:${dTotal}`);
  } else {
    resultText = `┃ ❌ *Dealer venceu.*\n┃ 💸 *-${bet} ${S}*`;
    console.log(`[BJ] ${sender.split('@')[0]} PERDEU | player:${pTotal} dealer:${dTotal}`);
  }

  const newBal = (getUser(sender).coins || 0);

  return sock.sendMessage(from, {
    text: [
      `╭━━━〔 🃏 *BLACKJACK — RESULTADO* 〕━━━╮`,
      `┃`,
      `┃ 🂠 Sua mão: ${showHand(player)} = *${pTotal}*`,
      `┃ 🏦 Dealer:  ${showHand(dealer)} = *${dTotal}*`,
      `┃`,
      resultText,
      `┃ 💳 Saldo: ${newBal.toLocaleString('pt-BR')} ${S}`,
      `╰━━━━━━━━━━━━━━━━━━━━━━━━━╯`,
    ].join('\n'),
  });
}

async function handleBlackjackReply(sock, from, sender, body, session) {
  const input   = body.trim().toLowerCase();
  const isHit   = ['1', 'hit', 'h', 'pedir', 'carta', 'more'].includes(input);
  const isStand = ['2', 'stand', 's', 'parar', 'stop', 'ficar', 'nao', 'não'].includes(input);

  if (!isHit && !isStand) {
    console.log(`[BJ] Input não reconhecido: "${input}" — ignorando sem encerrar sessão`);
    return false; // Mantém sessão aberta, não consome a mensagem
  }

  const { deck, player, dealer, bet } = session;

  if (isHit) {
    clearSession(sender); // Encerra antes de processar para evitar duplos

    try {
      if (!deck.length) {
        return await sock.sendMessage(from, { text: `❌ Baralho esgotado. Blackjack encerrado.` });
      }

      player.push(deck.pop());
      const pTotal = handTotal(player);

      console.log(`[BJ] ${sender.split('@')[0]} HIT | mão: ${showHand(player)} = ${pTotal}`);

      if (pTotal > 21) {
        // Estourou — aposta já foi deduzida no início
        const newBal = getUser(sender).coins || 0;
        return await sock.sendMessage(from, {
          text: [
            `╭━━━〔 🃏 *BLACKJACK* 〕━━━╮`,
            `┃`,
            `┃ 🂠 Sua mão: ${showHand(player)} = *${pTotal}*`,
            `┃`,
            `┃ 💥 *Estourou! Perdeu!*`,
            `┃ 💸 *-${bet} ${S}*`,
            `┃ 💳 Saldo: ${newBal.toLocaleString('pt-BR')} ${S}`,
            `╰━━━━━━━━━━━━━━━━━━╯`,
          ].join('\n'),
        });
      }

      if (pTotal === 21) {
        // 21 → resolve automaticamente (Stand automático)
        return await resolveBlackjack(sock, from, sender, deck, player, dealer, bet);
      }

      // Continua jogo — recria sessão atualizada
      setSession(sender, { game: 'blackjack', step: 'playing', deck, player, dealer, bet });

      return await sock.sendMessage(from, {
        text: [
          `╭━━━〔 🃏 *BLACKJACK* 〕━━━╮`,
          `┃`,
          `┃ 🂠 Sua mão: ${showHand(player)} = *${pTotal}*`,
          `┃ 🏦 Dealer:  🂠 ?`,
          `┃`,
          `┃ 💰 Aposta: *${bet.toLocaleString('pt-BR')} ${S}*`,
          `┃`,
          `┃ *1 / hit*   → pedir carta`,
          `┃ *2 / stand* → parar`,
          `╰━━━━━━━━━━━━━━━━━━╯`,
        ].join('\n'),
      });

    } catch (err) {
      console.error('[BJ] handleBlackjackReply HIT error:', err.message, err.stack);
      try { addCoins(sender, bet, 'bj_refund_error'); } catch (_) {}
      return await sock.sendMessage(from, {
        text: `❌ Erro no Blackjack. Aposta de *${bet} ${S}* devolvida.`,
      });
    }
  }

  // STAND
  clearSession(sender);

  try {
    console.log(`[BJ] ${sender.split('@')[0]} STAND | mão: ${showHand(player)} = ${handTotal(player)}`);
    return await resolveBlackjack(sock, from, sender, deck, player, dealer, bet);
  } catch (err) {
    console.error('[BJ] handleBlackjackReply STAND error:', err.message, err.stack);
    try { addCoins(sender, bet, 'bj_refund_error'); } catch (_) {}
    return await sock.sendMessage(from, {
      text: `❌ Erro ao resolver Blackjack. Aposta de *${bet} ${S}* devolvida.`,
    });
  }
}

// ─────────────────────────────────────────────────────────────
// TRABALHAR — REPLY
// ─────────────────────────────────────────────────────────────

async function handleTrabalharReply(sock, from, sender, body, session) {
  const input  = body.trim();
  const choice = parseInt(input, 10);

  if (!['1', '2', '3'].includes(input)) {
    console.log(`[TRABALHAR] Input não reconhecido: "${input}"`);
    return false; // Mantém sessão viva
  }

  clearSession(sender);

  try {
    const { jobs } = session;

    if (!jobs || !Array.isArray(jobs) || !jobs[choice - 1]) {
      console.error('[TRABALHAR] Jobs ausentes ou inválidos na sessão');
      return await sock.sendMessage(from, {
        text: `❌ Sessão de trabalho inválida. Use *!trabalhar* para recomeçar.`,
      });
    }

    const job    = jobs[choice - 1];
    const earned = Math.floor(Math.random() * (job.max - job.min + 1)) + job.min;
    const xpGain = Math.floor(earned * 0.15);

    addCoins(sender, earned, 'trabalhar');

    try {
      addXP(sender, xpGain, 'trabalhar');
    } catch (xpErr) {
      console.warn('[TRABALHAR] Erro ao adicionar XP:', xpErr.message);
    }

    const newBal = getUser(sender).coins || 0;

    console.log(`[TRABALHAR] ${sender.split('@')[0]} | ${job.name} | +${earned} ${S} | +${xpGain} XP`);

    const phrases = [
      `✅ Trabalho concluído com sucesso!`,
      `✅ Missão cumprida. Bom trabalho!`,
      `✅ Serviço entregue com qualidade.`,
      `✅ Você mandou muito bem hoje!`,
      `✅ Cliente satisfeito, pagamento feito.`,
    ];
    const phrase = phrases[Math.floor(Math.random() * phrases.length)];

    return await sock.sendMessage(from, {
      text: [
        `╭━━━〔 💼 *TRABALHO CONCLUÍDO* 〕━━━╮`,
        `┃`,
        `┃ ${job.emoji} *${job.name}*`,
        `┃`,
        `┃ ${phrase}`,
        `┃`,
        `┃ 💰 *+${earned} ${S}*`,
        `┃ ✨ *+${xpGain} XP*`,
        `┃ 💳 Saldo: ${newBal.toLocaleString('pt-BR')} ${S}`,
        `╰━━━━━━━━━━━━━━━━━━━━━━━╯`,
      ].join('\n'),
    });

  } catch (err) {
    console.error('[TRABALHAR] handleTrabalharReply error:', err.message, err.stack);
    return await sock.sendMessage(from, {
      text: `❌ Erro ao processar trabalho. Use *!trabalhar* para tentar novamente.`,
    });
  }
}

// ─────────────────────────────────────────────────────────────
// CRIME — REPLY
// ─────────────────────────────────────────────────────────────

async function handleCrimeReply(sock, from, sender, body, session) {
  const input  = body.trim();
  const choice = parseInt(input, 10);

  if (!['1', '2', '3'].includes(input)) {
    console.log(`[CRIME] Input não reconhecido: "${input}"`);
    return false; // Mantém sessão viva
  }

  clearSession(sender);

  try {
    const { crimes } = session;

    if (!crimes || !Array.isArray(crimes) || !crimes[choice - 1]) {
      console.error('[CRIME] Crimes ausentes ou inválidos na sessão');
      return await sock.sendMessage(from, {
        text: `❌ Sessão de crime inválida. Use *!crime* para recomeçar.`,
      });
    }

    const crime   = crimes[choice - 1];
    const success = Math.random() < crime.successRate;

    if (success) {
      const earned = Math.floor(Math.random() * (crime.max - crime.min + 1)) + crime.min;
      const xpGain = Math.floor(earned * 0.1);

      addCoins(sender, earned, 'crime_success');

      try {
        addXP(sender, xpGain, 'crime');
      } catch (xpErr) {
        console.warn('[CRIME] Erro ao adicionar XP:', xpErr.message);
      }

      const newBal = getUser(sender).coins || 0;

      console.log(`[CRIME] ${sender.split('@')[0]} SUCESSO | ${crime.name} | +${earned} ${S}`);

      const escapePhrases = [
        `🏃 Você fugiu antes da polícia chegar!`,
        `🕵️ Executou o plano sem deixar rastros.`,
        `😎 Limpo. Ninguém suspeita de nada.`,
        `🌙 Saiu pelas sombras sem ser visto.`,
        `🎭 Personagem perfeito. Ninguém desconfiou.`,
      ];
      const phrase = escapePhrases[Math.floor(Math.random() * escapePhrases.length)];

      return await sock.sendMessage(from, {
        text: [
          `╭━━━〔 🦹 *CRIME BEM-SUCEDIDO* 〕━━━╮`,
          `┃`,
          `┃ ${crime.emoji} *${crime.name}*`,
          `┃`,
          `┃ ${phrase}`,
          `┃`,
          `┃ 💰 *+${earned} ${S}*`,
          `┃ ✨ *+${xpGain} XP*`,
          `┃ 💳 Saldo: ${newBal.toLocaleString('pt-BR')} ${S}`,
          `╰━━━━━━━━━━━━━━━━━━━━━━━━╯`,
        ].join('\n'),
      });

    } else {
      // Falhou — aplica multa proporcional ao saldo atual
      const user       = getUser(sender);
      const bal        = user.coins || 0;
      const fineRaw    = Math.floor(Math.random() * (crime.fine_max - crime.fine_min + 1)) + crime.fine_min;
      const actualFine = Math.min(fineRaw, bal); // Não cobrar mais do que o saldo

      if (actualFine > 0) {
        removeCoins(sender, actualFine);
      }

      const newBal = getUser(sender).coins || 0;

      console.log(`[CRIME] ${sender.split('@')[0]} FALHOU | ${crime.name} | multa: -${actualFine} ${S}`);

      const caughtPhrases = [
        `👮 A polícia chegou antes de você terminar!`,
        `🚨 Você foi flagrado em plena ação!`,
        `📡 Câmera de segurança captou tudo.`,
        `🐕 O cão farejador não perdoou.`,
        `📞 Um vizinho te dedurou.`,
      ];
      const phrase = caughtPhrases[Math.floor(Math.random() * caughtPhrases.length)];

      return await sock.sendMessage(from, {
        text: [
          `╭━━━〔 🚔 *CRIME FRUSTRADO* 〕━━━╮`,
          `┃`,
          `┃ ${crime.emoji} *${crime.name}*`,
          `┃`,
          `┃ ${phrase}`,
          `┃`,
          `┃ 💸 *Multa: -${actualFine} ${S}*`,
          `┃ 💳 Saldo: ${newBal.toLocaleString('pt-BR')} ${S}`,
          `╰━━━━━━━━━━━━━━━━━━━━━━━╯`,
        ].join('\n'),
      });
    }

  } catch (err) {
    console.error('[CRIME] handleCrimeReply error:', err.message, err.stack);
    return await sock.sendMessage(from, {
      text: `❌ Erro ao processar crime. Use *!crime* para tentar novamente.`,
    });
  }
}

// ─────────────────────────────────────────────────────────────
// DISPATCHER PRINCIPAL
// ─────────────────────────────────────────────────────────────

async function handleGameReply(sock, message, from, sender, body) {
  try {
    if (!sender || !body) return false;

    const session = getSession(sender);

    if (!session) return false;

    console.log(
      `[GAME] 📨 Resposta recebida | user: ${sender.split('@')[0]}` +
      ` | game: ${session.game} | step: ${session.step} | input: "${body.trim()}"`
    );

    switch (session.game) {
      case 'blackjack':
        if (session.step === 'playing') {
          return await handleBlackjackReply(sock, from, sender, body, session);
        }
        break;

      case 'trabalhar':
        if (session.step === 'picking_job') {
          return await handleTrabalharReply(sock, from, sender, body, session);
        }
        break;

      case 'crime':
        if (session.step === 'picking_crime') {
          return await handleCrimeReply(sock, from, sender, body, session);
        }
        break;

      default:
        console.warn(`[GAME] ⚠️  Jogo desconhecido na sessão: ${session.game}`);
    }

    return false;

  } catch (err) {
    console.error('[GAME] handleGameReply erro inesperado:', err.message, err.stack);
    // Encerra sessão em caso de erro grave para evitar travamento
    try { clearSession(sender); } catch (_) {}
    return false;
  }
}

module.exports = { handleGameReply };
