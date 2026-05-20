'use strict';

// ============================================================
// GAME REPLY HANDLER — Roteia respostas para o jogo ativo
// Jogos suportados: trabalhar | crime | blackjack
// ============================================================

const { getSession, clearSession, setSession } = require('../utils/gameSession.js');
const { addCoins, removeCoins, getUser, updateUser, CONFIG } = require('../utils/economy.js');

const sym = () => CONFIG?.coinSymbol || 'Z¢';

// ─────────────────────────────────────────────────────────────
// BLACKJACK — helpers
// ─────────────────────────────────────────────────────────────

function createDeck() {
  const suits = ['♠','♥','♦','♣'];
  const ranks = ['A','2','3','4','5','6','7','8','9','10','J','Q','K'];
  const deck  = [];
  for (const s of suits) for (const r of ranks) deck.push({ r, s });
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

function cardVal(r) {
  if (['J','Q','K'].includes(r)) return 10;
  if (r === 'A') return 11;
  return parseInt(r);
}

function handTotal(hand) {
  let total = 0, aces = 0;
  for (const c of hand) { total += cardVal(c.r); if (c.r === 'A') aces++; }
  while (total > 21 && aces-- > 0) total -= 10;
  return total;
}

function showHand(hand, hideSecond = false) {
  if (hideSecond && hand.length >= 2)
    return `${hand[0].r}${hand[0].s} 🂠`;
  return hand.map(c => `${c.r}${c.s}`).join(' ');
}

// ─────────────────────────────────────────────────────────────
// TRABALHAR REPLY
// ─────────────────────────────────────────────────────────────

async function handleTrabalharReply(sock, from, sender, body, session) {
  const S = sym();

  // ── Etapa 1: escolha do emprego ───────────────────────────
  if (session.step === 'picking_job') {
    const pick = parseInt(body);
    if (isNaN(pick) || pick < 1 || pick > 3) {
      await sock.sendMessage(from, { text: `❌ Responde com *1*, *2* ou *3*, bicho.` });
      return true;
    }

    const job = session.jobs[pick - 1];
    const challenges = [
      { text: '🎯 Seu chefe pediu algo urgente. O que você faz?\n1️⃣ Resolvo agora\n2️⃣ Delego\n3️⃣ Finjo que não vi', bonus: [0.3, -0.1, -0.2] },
      { text: '⚡ Um colega te pede ajuda no horário de pico. O que faz?\n1️⃣ Ajudo\n2️⃣ Ignoro\n3️⃣ Peço algo em troca', bonus: [0.25, -0.05, 0.15] },
      { text: '🔥 Deu problema no trabalho. Sua reação:\n1️⃣ Resolvo na raça\n2️⃣ Chamo o responsável\n3️⃣ Fingo que não é meu problema', bonus: [0.2, 0.1, -0.15] },
      { text: '💼 Oportunidade de fazer hora extra. Você:\n1️⃣ Aceito (mais dinheiro)\n2️⃣ Recuso (cansado)\n3️⃣ Nego mas fico pro café', bonus: [0.4, 0, 0.05] },
    ];
    const challenge = challenges[Math.floor(Math.random() * challenges.length)];

    setSession(sender, { game: 'trabalhar', step: 'picking_challenge', job, challenge });

    await sock.sendMessage(from, {
      text: [
        `╭━━━〔 ${job.emoji} *${job.name}* 〕━━━╮`,
        `┃`,
        `┃ 💼 Você começou a trabalhar!`,
        `┃ Um imprevisto surgiu...`,
        `┃`,
        `┃ ${challenge.text}`,
        `┃`,
        `┃ _(responda com 1, 2 ou 3)_`,
        `╰━━━━━━━━━━━━━━━━━━━╯`,
      ].join('\n'),
    });
    return true;
  }

  // ── Etapa 2: desafio ──────────────────────────────────────
  if (session.step === 'picking_challenge') {
    const pick = parseInt(body);
    if (isNaN(pick) || pick < 1 || pick > 3) {
      await sock.sendMessage(from, { text: `❌ Responde com *1*, *2* ou *3*.` });
      return true;
    }

    clearSession(sender);

    const { job, challenge } = session;
    const base    = Math.floor(Math.random() * (job.max - job.min + 1)) + job.min;
    const bonusPct = challenge.bonus[pick - 1];

    // Evento aleatório extra
    const roll = Math.random();
    let event = '';
    let eventMult = 0;
    if (roll < 0.05) { event = '🌟 *SORTE RARA!* Gorjeta especial!'; eventMult = 0.8; }
    else if (roll < 0.15) { event = '✨ Elogio do chefe. Bônus extra!'; eventMult = 0.3; }
    else if (roll < 0.25) { event = '😤 Dia difícil. Desconto pequeno.'; eventMult = -0.1; }
    else { event = ''; eventMult = 0; }

    const total = Math.max(10, Math.floor(base * (1 + bonusPct + eventMult)));
    addCoins(sender, total, 'trabalhar');

    const user    = getUser(sender);
    const newBal  = user.coins || 0;
    const bonusLine = bonusPct >= 0
      ? `┃ 📈 Bônus de escolha: +${Math.round(bonusPct * 100)}%`
      : `┃ 📉 Penalidade: ${Math.round(bonusPct * 100)}%`;

    const lines = [
      `╭━━━〔 ${job.emoji} *TRABALHO CONCLUÍDO* 〕━━━╮`,
      `┃`,
      `┃ 💼 *${job.name}*`,
      `┃`,
      bonusLine,
      event ? `┃ ${event}` : null,
      `┃`,
      `┃ 💰 *+${total} ${S}*`,
      `┃ 💳 Saldo: ${newBal.toLocaleString('pt-BR')} ${S}`,
      `┃`,
      `┃ ⏰ Próximo trabalho em *1 hora*`,
      `╰━━━━━━━━━━━━━━━━━━━━━━━━╯`,
    ].filter(Boolean).join('\n');

    await sock.sendMessage(from, { text: lines });
    return true;
  }

  return false;
}

// ─────────────────────────────────────────────────────────────
// CRIME REPLY
// ─────────────────────────────────────────────────────────────

async function handleCrimeReply(sock, from, sender, body, session) {
  const S = sym();

  // ── Etapa 1: escolha do crime ─────────────────────────────
  if (session.step === 'picking_crime') {
    const pick = parseInt(body);
    if (isNaN(pick) || pick < 1 || pick > 3) {
      await sock.sendMessage(from, { text: `❌ Escolhe 1, 2 ou 3.` });
      return true;
    }

    const crime = session.crimes[pick - 1];
    setSession(sender, { game: 'crime', step: 'picking_strategy', crime });

    await sock.sendMessage(from, {
      text: [
        `╭━━━〔 🦹 *PLANEJAMENTO* 〕━━━╮`,
        `┃`,
        `┃ ${crime.emoji} *${crime.name}* selecionado`,
        `┃`,
        `┃ Como você vai executar?`,
        `┃`,
        `┃ 1️⃣ 🕵️ *Furtivo* — discreto, menos risco`,
        `┃ 2️⃣ 💪 *Força bruta* — rápido, mais risco`,
        `┃ 3️⃣ 🧠 *Planejado* — demorado, mais lucro`,
        `┃`,
        `┃ _(responda com 1, 2 ou 3)_`,
        `╰━━━━━━━━━━━━━━━━━━━╯`,
      ].join('\n'),
    });
    return true;
  }

  // ── Etapa 2: estratégia → resultado ──────────────────────
  if (session.step === 'picking_strategy') {
    const pick = parseInt(body);
    if (isNaN(pick) || pick < 1 || pick > 3) {
      await sock.sendMessage(from, { text: `❌ Escolhe 1, 2 ou 3.` });
      return true;
    }

    clearSession(sender);

    const { crime } = session;
    // Modificadores por estratégia: [furtivo, força, planejado]
    const stratMods = [
      { name: 'Furtivo',      successMod: +0.10, rewardMod: 0.85 },
      { name: 'Força Bruta',  successMod: -0.15, rewardMod: 1.00 },
      { name: 'Planejado',    successMod: +0.05, rewardMod: 1.35 },
    ][pick - 1];

    const successRate = Math.min(0.90, Math.max(0.20, crime.successRate + stratMods.successMod));
    const success     = Math.random() < successRate;

    const user    = getUser(sender);
    const balance = user.coins || 0;

    if (success) {
      // Evento especial (10% chance)
      const special = Math.random();
      let specialLine = '';
      let specialMult = 1;
      if (special < 0.05) { specialLine = '┃ 🌟 *JACKPOT CRIMINAL!* Achaste o cofre secreto!'; specialMult = 2.5; }
      else if (special < 0.12) { specialLine = '┃ 💎 Achou item valioso durante o crime!'; specialMult = 1.6; }

      const base   = Math.floor(Math.random() * (crime.max - crime.min + 1)) + crime.min;
      const earned = Math.floor(base * stratMods.rewardMod * specialMult);
      addCoins(sender, earned, 'crime');
      const newBal = getUser(sender).coins || 0;

      const lines = [
        `╭━━━〔 ✅ *CRIME BEM-SUCEDIDO* 〕━━━╮`,
        `┃`,
        `┃ ${crime.emoji} *${crime.name}*`,
        `┃ 🧩 Estratégia: *${stratMods.name}*`,
        specialLine || null,
        `┃`,
        `┃ 💰 *+${earned} ${S}*`,
        `┃ 💳 Saldo: ${newBal.toLocaleString('pt-BR')} ${S}`,
        `┃`,
        `┃ ⏰ Próximo crime em *45 minutos*`,
        `╰━━━━━━━━━━━━━━━━━━━━━━━━━╯`,
      ].filter(Boolean).join('\n');

      await sock.sendMessage(from, { text: lines });

    } else {
      const fines = ['Pagou fiança', 'Levou multa', 'Danificou algo e pagou', 'Cúmplice te dedurou'];
      const fine  = Math.floor(Math.random() * (crime.fine_max - crime.fine_min + 1)) + crime.fine_min;
      const lost  = Math.min(fine, balance);
      if (lost > 0) removeCoins(sender, lost);
      const newBal = getUser(sender).coins || 0;
      const fineReason = fines[Math.floor(Math.random() * fines.length)];

      await sock.sendMessage(from, {
        text: [
          `╭━━━〔 ❌ *CRIME FALHOU* 〕━━━╮`,
          `┃`,
          `┃ ${crime.emoji} *${crime.name}*`,
          `┃ 🧩 Estratégia: *${stratMods.name}*`,
          `┃`,
          `┃ 😬 ${fineReason}`,
          `┃ 💸 *-${lost} ${S}*`,
          `┃ 💳 Saldo: ${newBal.toLocaleString('pt-BR')} ${S}`,
          `┃`,
          `┃ ⏰ Próxima tentativa em *45 minutos*`,
          `╰━━━━━━━━━━━━━━━━━━━━━━╯`,
        ].join('\n'),
      });
    }
    return true;
  }

  return false;
}

// ─────────────────────────────────────────────────────────────
// BLACKJACK REPLY
// ─────────────────────────────────────────────────────────────

async function handleBlackjackReply(sock, from, sender, body, session) {
  const S   = sym();
  const cmd = body.trim().toLowerCase();

  if (!['h', 'hit', 's', 'stand', '1', '2'].includes(cmd)) return false;

  const hit = cmd === 'h' || cmd === 'hit' || cmd === '1';

  let { deck, player, dealer, bet } = session;

  if (hit) {
    player.push(deck.pop());
    const total = handTotal(player);

    if (total > 21) {
      // Bust
      clearSession(sender);
      removeCoins(sender, bet);
      const newBal = getUser(sender).coins || 0;

      return sock.sendMessage(from, {
        text: [
          `╭━━━〔 🃏 *BLACKJACK — BUST!* 〕━━━╮`,
          `┃`,
          `┃ 🂠 Sua mão: ${showHand(player)} = *${total}*`,
          `┃ 💥 Passou de 21! Perdeu.`,
          `┃`,
          `┃ 💸 *-${bet} ${S}*`,
          `┃ 💳 Saldo: ${newBal.toLocaleString('pt-BR')} ${S}`,
          `╰━━━━━━━━━━━━━━━━━━━━━╯`,
        ].join('\n'),
      }).then(() => true);
    }

    if (total === 21) {
      // Auto-stand on 21
      return resolveBlackjack(sock, from, sender, { deck, player, dealer, bet });
    }

    setSession(sender, { game: 'blackjack', step: 'playing', deck, player, dealer, bet });

    await sock.sendMessage(from, {
      text: [
        `╭━━━〔 🃏 *BLACKJACK* 〕━━━╮`,
        `┃`,
        `┃ 🂠 Sua mão: ${showHand(player)} = *${handTotal(player)}*`,
        `┃ 🏦 Dealer: ${showHand(dealer, true)}`,
        `┃`,
        `┃ *1 - Hit* | *2 - Stand*`,
        `╰━━━━━━━━━━━━━━━━━━╯`,
      ].join('\n'),
    });
    return true;
  }

  // Stand → dealer plays
  return resolveBlackjack(sock, from, sender, { deck, player, dealer, bet });
}

async function resolveBlackjack(sock, from, sender, { deck, player, dealer, bet }) {
  const S = sym();
  clearSession(sender);

  // Dealer hits até >= 17
  while (handTotal(dealer) < 17) dealer.push(deck.pop());

  const pTotal = handTotal(player);
  const dTotal = handTotal(dealer);

  const balance = getUser(sender).coins || 0;

  let resultLine, coinLine, newBal;

  if (dTotal > 21 || pTotal > dTotal) {
    const isBlackjack = player.length === 2 && pTotal === 21;
    const multi = isBlackjack ? 1.5 : 1;
    const prize = Math.floor(bet * (1 + multi));
    addCoins(sender, prize, 'blackjack_win');
    newBal      = getUser(sender).coins || 0;
    resultLine  = isBlackjack ? '🌟 *BLACKJACK! Pagamento 1.5x!*' : '✅ *Você venceu!*';
    coinLine    = `💰 *+${prize} ${S}*`;
  } else if (pTotal === dTotal) {
    addCoins(sender, bet, 'blackjack_push');
    newBal     = getUser(sender).coins || 0;
    resultLine = '🤝 *Empate! Aposta devolvida.*';
    coinLine   = `↩️ ${bet} ${S} devolvidos`;
  } else {
    removeCoins(sender, bet);
    newBal     = getUser(sender).coins || 0;
    resultLine = '❌ *Dealer venceu.*';
    coinLine   = `💸 *-${bet} ${S}*`;
  }

  await sock.sendMessage(from, {
    text: [
      `╭━━━〔 🃏 *BLACKJACK — RESULTADO* 〕━━━╮`,
      `┃`,
      `┃ 🂠 Sua mão: ${showHand(player)} = *${pTotal}*`,
      `┃ 🏦 Dealer:  ${showHand(dealer)} = *${dTotal}*`,
      `┃`,
      `┃ ${resultLine}`,
      `┃ ${coinLine}`,
      `┃ 💳 Saldo: ${newBal.toLocaleString('pt-BR')} ${S}`,
      `╰━━━━━━━━━━━━━━━━━━━━━━━━━━━╯`,
    ].join('\n'),
  });
  return true;
}

// ─────────────────────────────────────────────────────────────
// ROTEADOR PRINCIPAL
// ─────────────────────────────────────────────────────────────

async function handleGameReply(wsock, message, from, sender, body) {
  const { getSession } = require('../utils/gameSession.js');
  const session = getSession(sender);
  if (!session) return false;

  try {
    switch (session.game) {
      case 'trabalhar':  return handleTrabalharReply(wsock, from, sender, body, session);
      case 'crime':      return handleCrimeReply(wsock, from, sender, body, session);
      case 'blackjack':  return handleBlackjackReply(wsock, from, sender, body, session);
      default:           return false;
    }
  } catch (err) {
    console.error('[GAME-REPLY] Erro:', err.message);
    return false;
  }
}

module.exports = { handleGameReply };
