'use strict';

// ============================================================
// APOSTAR.JS — Cassino completo v2.1.0
// FIXES: moedas deduzidas no início do BJ, removeCoins atômico,
//        validações reforçadas, try/catch em tudo
// ============================================================

const { getUser, addCoins, removeCoins, CONFIG } = require('../utils/economy.js');
const { setSession, hasSession, clearSession }   = require('../utils/gameSession.js');

const S       = () => CONFIG?.coinSymbol || 'Z¢';
const MIN_BET = 50;
const MAX_BET = 10_000;

// ─────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────

function parseBet(raw) {
  if (!raw) return null;
  const n = parseInt(String(raw).replace(/\D/g, ''), 10);
  return isNaN(n) ? null : n;
}

/**
 * Valida aposta e retorna mensagem de erro ou null se OK.
 */
function validateBet(sender, bet) {
  if (!bet || isNaN(bet) || bet < MIN_BET) {
    return `❌ Aposta mínima: *${MIN_BET} ${S()}*\n💡 Ex: \`!apostar slots 100\``;
  }
  if (bet > MAX_BET) {
    return `❌ Aposta máxima: *${MAX_BET.toLocaleString('pt-BR')} ${S()}*`;
  }
  try {
    const bal = getUser(sender).coins || 0;
    if (bal < bet) {
      return `❌ Saldo insuficiente.\n💳 Você tem *${bal.toLocaleString('pt-BR')} ${S()}*`;
    }
  } catch (err) {
    console.error('[APOSTAR] validateBet error:', err.message);
    return '❌ Erro ao verificar saldo. Tente novamente.';
  }
  return null;
}

// ─────────────────────────────────────────────────────────────
// BLACKJACK
// ─────────────────────────────────────────────────────────────

function createDeck() {
  const suits = ['♠', '♥', '♦', '♣'];
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
  if (hideSecond && hand.length >= 2) return `${hand[0].r}${hand[0].s} 🂠`;
  return hand.map(c => `${c.r}${c.s}`).join(' ');
}

async function startBlackjack(sock, from, sender, bet) {
  try {
    if (hasSession(sender)) {
      return sock.sendMessage(from, { text: `⚠️ Você já tem uma ação em andamento. Finalize antes de apostar.` });
    }

    const err = validateBet(sender, bet);
    if (err) return sock.sendMessage(from, { text: err });

    // ── Deduz imediatamente para evitar exploit de saldo ──
    const deduct = removeCoins(sender, bet);
    if (!deduct.ok) {
      return sock.sendMessage(from, {
        text: `❌ Não foi possível deduzir a aposta: ${deduct.reason}`,
      });
    }

    const deck   = createDeck();
    const player = [deck.pop(), deck.pop()];
    const dealer = [deck.pop(), deck.pop()];
    const pTotal = handTotal(player);

    // Blackjack natural → paga 2.5x imediato
    if (pTotal === 21) {
      const prize  = Math.floor(bet * 2.5);
      addCoins(sender, prize, 'blackjack_natural');
      const newBal = getUser(sender).coins || 0;
      console.log(`[BJ] ${sender.split('@')[0]} → Natural 21! +${prize} ${S()}`);
      return sock.sendMessage(from, {
        text: [
          `╭━━━〔 🃏 *BLACKJACK NATURAL!* 〕━━━╮`,
          `┃`,
          `┃ 🂠 Sua mão: ${showHand(player)} = *21*`,
          `┃ 🌟 Pagamento imediato *2.5x*!`,
          `┃`,
          `┃ 💰 *+${prize} ${S()}*`,
          `┃ 💳 Saldo: ${newBal.toLocaleString('pt-BR')} ${S()}`,
          `╰━━━━━━━━━━━━━━━━━━━━━━━━━╯`,
        ].join('\n'),
      });
    }

    setSession(sender, { game: 'blackjack', step: 'playing', deck, player, dealer, bet });

    return sock.sendMessage(from, {
      text: [
        `╭━━━〔 🃏 *BLACKJACK* 〕━━━╮`,
        `┃`,
        `┃ 🂠 Sua mão: ${showHand(player)} = *${pTotal}*`,
        `┃ 🏦 Dealer:  ${showHand(dealer, true)}`,
        `┃`,
        `┃ 💰 Aposta: *${bet.toLocaleString('pt-BR')} ${S()}*`,
        `┃ 💸 (já deduzido do saldo)`,
        `┃`,
        `┃ *1 / hit*   → pedir carta`,
        `┃ *2 / stand* → parar`,
        `╰━━━━━━━━━━━━━━━━━━╯`,
      ].join('\n'),
    });
  } catch (err) {
    console.error('[BJ] startBlackjack error:', err.message);
    // Devolve aposta em caso de erro interno
    if (bet) {
      try { addCoins(sender, bet, 'bj_refund_error'); } catch (_) {}
    }
    return sock.sendMessage(from, { text: `❌ Erro ao iniciar Blackjack. Aposta devolvida. Tente novamente.` });
  }
}

// ─────────────────────────────────────────────────────────────
// SLOTS
// ─────────────────────────────────────────────────────────────

const SLOT_SYMBOLS = [
  { sym: '🍒', weight: 30, name: 'Cereja',   mult: 1.5 },
  { sym: '🍋', weight: 25, name: 'Limão',    mult: 2   },
  { sym: '🔔', weight: 18, name: 'Sino',     mult: 3   },
  { sym: '⭐', weight: 12, name: 'Estrela',  mult: 5   },
  { sym: '💎', weight: 8,  name: 'Diamante', mult: 10  },
  { sym: '🌟', weight: 5,  name: 'Jackpot',  mult: 20  },
  { sym: '👑', weight: 2,  name: 'Coroa',    mult: 50  },
];

function spinReel() {
  const total = SLOT_SYMBOLS.reduce((s, x) => s + x.weight, 0);
  let roll    = Math.random() * total;
  for (const x of SLOT_SYMBOLS) { roll -= x.weight; if (roll <= 0) return x; }
  return SLOT_SYMBOLS[0];
}

async function playSlots(sock, from, sender, bet) {
  try {
    const err = validateBet(sender, bet);
    if (err) return sock.sendMessage(from, { text: err });

    const deduct = removeCoins(sender, bet);
    if (!deduct.ok) {
      return sock.sendMessage(from, { text: `❌ Falha ao processar aposta: ${deduct.reason}` });
    }

    const reels  = [spinReel(), spinReel(), spinReel()];
    const line   = reels.map(r => r.sym).join(' ');
    const isJack = reels.every(r => r.sym === reels[0].sym);
    const isPair = !isJack && (
      reels[0].sym === reels[1].sym ||
      reels[1].sym === reels[2].sym ||
      reels[0].sym === reels[2].sym
    );

    let mult = 0, resultLine = '';

    if (isJack) {
      mult = reels[0].mult;
      resultLine = reels[0].name === 'Coroa'
        ? `👑 *JACKPOT MÁXIMO! ${mult}x!*`
        : `🎉 *JACKPOT! ${reels[0].name} x${mult}!*`;
    } else if (isPair) {
      mult       = 0.5;
      resultLine = `🟡 Par detectado! Recuperou metade.`;
    } else {
      resultLine = `❌ Sem combinação. Boa sorte da próxima!`;
    }

    const prize  = mult > 0 ? Math.floor(bet * mult) : 0;
    if (prize > 0) addCoins(sender, prize, 'slots_win');
    const newBal = getUser(sender).coins || 0;

    const lucroLine = prize > 0
      ? `┃ 💰 *+${prize} ${S()}* (${mult}x)`
      : `┃ 💸 Perdeu *-${bet} ${S()}*`;

    console.log(`[SLOTS] ${sender.split('@')[0]} | bet:${bet} | mult:${mult} | prize:${prize}`);

    return sock.sendMessage(from, {
      text: [
        `╭━━━〔 🎰 *SLOT MACHINE* 〕━━━╮`,
        `┃`,
        `┃  [ ${line} ]`,
        `┃`,
        `┃ ${resultLine}`,
        `┃`,
        lucroLine,
        `┃ 💳 Saldo: ${newBal.toLocaleString('pt-BR')} ${S()}`,
        `╰━━━━━━━━━━━━━━━━━━━╯`,
      ].join('\n'),
    });
  } catch (err) {
    console.error('[SLOTS] error:', err.message);
    return sock.sendMessage(from, { text: `❌ Erro nos slots. Tente novamente.` });
  }
}

// ─────────────────────────────────────────────────────────────
// ROLETA
// ─────────────────────────────────────────────────────────────

const RED_NUMS = new Set([1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36]);

const ROULETTE_BETS = {
  vermelho: { check: n => RED_NUMS.has(n),            mult: 1.9, label: '🔴 Vermelho'    },
  preto:    { check: n => n > 0 && !RED_NUMS.has(n),  mult: 1.9, label: '⚫ Preto'       },
  par:      { check: n => n > 0 && n % 2 === 0,       mult: 1.9, label: '🔵 Par'         },
  impar:    { check: n => n > 0 && n % 2 !== 0,       mult: 1.9, label: '🟣 Ímpar'       },
  baixo:    { check: n => n >= 1 && n <= 18,           mult: 1.9, label: '🟡 Baixo 1-18'  },
  alto:     { check: n => n >= 19 && n <= 36,          mult: 1.9, label: '🟠 Alto 19-36'  },
  duzia1:   { check: n => n >= 1 && n <= 12,           mult: 2.8, label: '1ª Dúzia 1-12'  },
  duzia2:   { check: n => n >= 13 && n <= 24,          mult: 2.8, label: '2ª Dúzia 13-24' },
  duzia3:   { check: n => n >= 25 && n <= 36,          mult: 2.8, label: '3ª Dúzia 25-36' },
};

const ROLETA_HELP = [
  `🎡 *ROLETA — Tipos de aposta:*`,
  ``,
  `🔴 vermelho  ⚫ preto`,
  `🔵 par       🟣 impar`,
  `🟡 baixo     🟠 alto`,
  `📦 duzia1  duzia2  duzia3`,
  `🔢 número exato (0-36) → paga *35x*`,
  ``,
  `📌 Uso: *!apostar roleta <valor> <aposta>*`,
  `💡 Ex: *!apostar roleta 200 vermelho*`,
  `💡 Ex: *!apostar roleta 100 17*`,
].join('\n');

async function playRoleta(sock, from, sender, bet, betArg) {
  try {
    if (!betArg) return sock.sendMessage(from, { text: ROLETA_HELP });

    const err = validateBet(sender, bet);
    if (err) return sock.sendMessage(from, { text: err });

    const deduct = removeCoins(sender, bet);
    if (!deduct.ok) {
      return sock.sendMessage(from, { text: `❌ Falha ao processar aposta: ${deduct.reason}` });
    }

    const number = Math.floor(Math.random() * 37); // 0-36
    const numArg = parseInt(betArg);
    let won      = false;
    let mult     = 0;
    let betLabel = '';

    if (!isNaN(numArg) && numArg >= 0 && numArg <= 36) {
      // Número exato
      won      = number === numArg;
      mult     = 35;
      betLabel = `🔢 Número ${numArg}`;
    } else {
      const type = ROULETTE_BETS[betArg.toLowerCase()];
      if (!type) {
        // Aposta inválida: devolve moedas
        addCoins(sender, bet, 'roleta_refund');
        return sock.sendMessage(from, {
          text: `❌ Tipo de aposta inválido.\n\n${ROLETA_HELP}`,
        });
      }
      won      = type.check(number);
      mult     = type.mult;
      betLabel = type.label;
    }

    const prize  = won ? Math.floor(bet * mult) : 0;
    if (prize > 0) addCoins(sender, prize, 'roleta_win');
    const newBal = getUser(sender).coins || 0;

    const colorNum = number === 0
      ? '🟩'
      : RED_NUMS.has(number) ? '🔴' : '⚫';

    const resultBlock = won
      ? `┃ ✅ *Ganhou! ${mult}x*\n┃ 💰 *+${prize} ${S()}*`
      : `┃ ❌ Não foi desta vez.\n┃ 💸 *-${bet} ${S()}*`;

    console.log(`[ROLETA] ${sender.split('@')[0]} | número:${number} | aposta:${betArg} | won:${won}`);

    return sock.sendMessage(from, {
      text: [
        `╭━━━〔 🎡 *ROLETA* 〕━━━╮`,
        `┃`,
        `┃ ${colorNum} *Saiu: ${number}*`,
        `┃ 🎯 Sua aposta: ${betLabel}`,
        `┃`,
        resultBlock,
        `┃ 💳 Saldo: ${newBal.toLocaleString('pt-BR')} ${S()}`,
        `╰━━━━━━━━━━━━━━━━━╯`,
      ].join('\n'),
    });
  } catch (err) {
    console.error('[ROLETA] error:', err.message);
    return sock.sendMessage(from, { text: `❌ Erro na roleta. Tente novamente.` });
  }
}

// ─────────────────────────────────────────────────────────────
// COINFLIP
// ─────────────────────────────────────────────────────────────

async function playCoinflip(sock, from, sender, bet, side) {
  try {
    const err = validateBet(sender, bet);
    if (err) return sock.sendMessage(from, { text: err });

    const validSides = ['cara', 'coroa', 'h', 't', '1', '2'];
    const sideInput  = (side || '').toLowerCase();

    if (sideInput && !validSides.includes(sideInput)) {
      return sock.sendMessage(from, {
        text: `❌ Lado inválido. Use *cara* ou *coroa*.\n💡 Ex: *!apostar coinflip 200 cara*`,
      });
    }

    const choice = !sideInput || ['cara','h','1'].includes(sideInput) ? 'cara' : 'coroa';
    const result = Math.random() < 0.5 ? 'cara' : 'coroa';
    const won    = choice === result;

    const deduct = removeCoins(sender, bet);
    if (!deduct.ok) {
      return sock.sendMessage(from, { text: `❌ Falha ao processar aposta: ${deduct.reason}` });
    }

    const prize = won ? Math.floor(bet * 1.9) : 0;
    if (prize > 0) addCoins(sender, prize, 'coinflip_win');
    const newBal = getUser(sender).coins || 0;

    console.log(`[COINFLIP] ${sender.split('@')[0]} | choice:${choice} | result:${result} | won:${won}`);

    return sock.sendMessage(from, {
      text: [
        `╭━━━〔 🪙 *COINFLIP* 〕━━━╮`,
        `┃`,
        `┃ 🎯 Você escolheu: *${choice}*`,
        `┃ 🪙 Resultado:     *${result}*`,
        `┃`,
        won
          ? `┃ ✅ *Acertou!*\n┃ 💰 *+${prize} ${S()}* (1.9x)`
          : `┃ ❌ Errou.\n┃ 💸 *-${bet} ${S()}*`,
        `┃ 💳 Saldo: ${newBal.toLocaleString('pt-BR')} ${S()}`,
        `╰━━━━━━━━━━━━━━━━━╯`,
      ].join('\n'),
    });
  } catch (err) {
    console.error('[COINFLIP] error:', err.message);
    return sock.sendMessage(from, { text: `❌ Erro no coinflip. Tente novamente.` });
  }
}

// ─────────────────────────────────────────────────────────────
// MENU
// ─────────────────────────────────────────────────────────────

const MENU_MSG = [
  `╭━━━〔 🎰 *CASSINO SENTINEL* 〕━━━╮`,
  `┃`,
  `┃ 🃏 *Blackjack*`,
  `┃    !apostar blackjack <valor>`,
  `┃    Bata o dealer com 21. Vitória: 1.9x`,
  `┃    Natural 21: 2.5x instantâneo`,
  `┃`,
  `┃ 🎰 *Slots*`,
  `┃    !apostar slots <valor>`,
  `┃    3 iguais = jackpot | Par = 0.5x`,
  `┃    Mult máx: 👑 50x`,
  `┃`,
  `┃ 🎡 *Roleta*`,
  `┃    !apostar roleta <valor> <aposta>`,
  `┃    Cor/par/ímpar: 1.9x | Número exato: 35x`,
  `┃`,
  `┃ 🪙 *Coinflip*`,
  `┃    !apostar coinflip <valor> [cara|coroa]`,
  `┃    50/50 → 1.9x`,
  `┃`,
  `┃ 📏 Mín: ${MIN_BET} Z¢ | Máx: ${MAX_BET.toLocaleString('pt-BR')} Z¢`,
  `╰━━━━━━━━━━━━━━━━━━━━━━━━━╯`,
].join('\n');

// ─────────────────────────────────────────────────────────────
// COMANDO PRINCIPAL
// ─────────────────────────────────────────────────────────────

module.exports = {
  name: 'apostar',
  execute: async ({ sock, from, sender, args }) => {
    try {
      const sub   = (args[0] || '').toLowerCase();
      if (!sub) return sock.sendMessage(from, { text: MENU_MSG });

      const bet   = parseBet(args[1]);
      const extra = (args[2] || '').toLowerCase();

      switch (sub) {
        case 'blackjack':
        case 'bj':
          return startBlackjack(sock, from, sender, bet);

        case 'slots':
        case 'slot':
        case 'cacaniqel':
        case 'maquina':
          return playSlots(sock, from, sender, bet);

        case 'roleta':
        case 'roulette':
          return playRoleta(sock, from, sender, bet, extra || args[2]);

        case 'coinflip':
        case 'cf':
        case 'moeda':
          return playCoinflip(sock, from, sender, bet, extra);

        default:
          return sock.sendMessage(from, { text: MENU_MSG });
      }
    } catch (err) {
      console.error('[APOSTAR] execute error:', err.message);
      return sock.sendMessage(from, { text: `❌ Erro inesperado. Tente novamente.` });
    }
  },
};
