'use strict';

// ─────────────────────────────────────────────────────────────
// FORCA GAME — com integração de XP v2.1.0
// BUG FIXES:
//   - checkAchievements importado de achievements.js (não economy.js)
//   - XP/win só concedido ao VENCER (não ao acertar letra)
//   - Race condition no messageIds corrigida
// ─────────────────────────────────────────────────────────────

const { addXP, getUser, updateUser } = require('./economy.js');
const { checkAchievements }          = require('./achievements.js');

const WORDS = [
  'GATO', 'CACHORRO', 'ELEFANTE', 'GIRAFA', 'LEAO', 'TIGRE', 'COBRA',
  'GOLFINHO', 'URSO', 'LOBO', 'RAPOSA', 'COELHO', 'TARTARUGA', 'PAPAGAIO',
  'AGUIA', 'PINGUIM', 'MACACO', 'CAMELO', 'ZEBRA', 'RINOCERONTE',
  'HIPOPOTAMO', 'CROCODILO', 'ESCORPIAO', 'BORBOLETA', 'ARANHA',
  'PIZZA', 'HAMBURGUER', 'SORVETE', 'CHOCOLATE', 'BISCOITO',
  'MACARRAO', 'FRANGO', 'FEIJAO', 'MANGA', 'ABACAXI',
  'MORANGO', 'MELANCIA', 'LARANJA', 'BANANA', 'AMENDOIM',
  'TAPIOCA', 'COXINHA', 'PASTEL', 'BRIGADEIRO', 'PUDIM',
  'BRASIL', 'PORTUGAL', 'FRANCA', 'ESPANHA', 'ITALIA',
  'ALEMANHA', 'JAPAO', 'CHINA', 'MEXICO', 'ARGENTINA',
  'COLOMBIA', 'ANGOLA', 'MOCAMBIQUE', 'CANADA', 'AUSTRALIA',
  'COMPUTADOR', 'CELULAR', 'INTERNET', 'TELEVISAO', 'GELADEIRA',
  'MICROFONE', 'TECLADO', 'IMPRESSORA', 'PROJETOR', 'CARREGADOR',
  'BLUETOOTH', 'ROTEADOR', 'PROCESSADOR', 'MEMORIA', 'BATERIA',
  'ESCOLA', 'HOSPITAL', 'BIBLIOTECA', 'SUPERMERCADO', 'RESTAURANTE',
  'AEROPORTO', 'CINEMA', 'TEATRO', 'MUSEU', 'ESTADIO',
  'PARQUE', 'PRAIA', 'MONTANHA', 'DESERTO', 'FLORESTA',
  'FUTEBOL', 'BASQUETE', 'NATACAO', 'CICLISMO', 'TENIS',
  'VOLEIBOL', 'BOXE', 'JUDO', 'KARATE', 'GINASTICA',
  'MOCHILA', 'GUARDA-CHUVA', 'ESPELHO', 'TRAVESSEIRO', 'COBERTOR',
  'TESOURA', 'MARTELO', 'LANTERNA', 'RELOGIO', 'CALENDARIO',
  'GARRAFA', 'CANECA', 'GUARDANAPO', 'VASSOURA', 'ESCADA',
  'MEDICO', 'PROFESSOR', 'ENGENHEIRO', 'ADVOGADO', 'ARQUITETO',
  'JORNALISTA', 'BOMBEIRO', 'POLICIAL', 'DENTISTA', 'ENFERMEIRO',
];

const games      = new Map();
const MAX_ERRORS  = 6;
const GAME_TTL_MS = 30 * 60_000;

// ─────────────────────────────────────────────────────────────
// LIMPEZA PERIÓDICA
// ─────────────────────────────────────────────────────────────

setInterval(() => {
  const now = Date.now();
  for (const [id, g] of games.entries()) {
    if (now - g.lastActivity > GAME_TTL_MS) {
      games.delete(id);
      console.log(`[FORCA] Partida expirada: ${id}`);
    }
  }
}, 5 * 60_000);

// ─────────────────────────────────────────────────────────────
// ESTÁGIOS DA FORCA
// ─────────────────────────────────────────────────────────────

const HANGMAN_STAGES = [
  '```\n  +---+\n  |   |\n      |\n      |\n      |\n      |\n=========```',
  '```\n  +---+\n  |   |\n  O   |\n      |\n      |\n      |\n=========```',
  '```\n  +---+\n  |   |\n  O   |\n  |   |\n      |\n      |\n=========```',
  '```\n  +---+\n  |   |\n  O   |\n /|   |\n      |\n      |\n=========```',
  '```\n  +---+\n  |   |\n  O   |\n /|\\  |\n      |\n      |\n=========```',
  '```\n  +---+\n  |   |\n  O   |\n /|\\  |\n /    |\n      |\n=========```',
  '```\n  +---+\n  |   |\n  O   |\n /|\\  |\n / \\  |\n      |\n=========```',
];

// ─────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────

function randomWord() {
  return WORDS[Math.floor(Math.random() * WORDS.length)];
}

function normalize(str) {
  return str
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function buildDisplay(word, guessed) {
  return word
    .split('')
    .map(letter => (guessed.has(letter) ? letter : '_'))
    .join(' ');
}

function isWordComplete(word, guessed) {
  return word.split('').every(l => guessed.has(l));
}

// ─────────────────────────────────────────────────────────────
// RECOMPENSAS — só chamadas quando o jogo REALMENTE termina com vitória
// ─────────────────────────────────────────────────────────────

function grantWinRewards(userId, xpAmount, reason) {
  try {
    // XP
    addXP(userId, xpAmount, reason);

    // Incrementa minigamesWon
    const user = getUser(userId);
    if (!user.stats) user.stats = { minigamesWon: 0, totalMessages: 0 };
    user.stats.minigamesWon = (user.stats.minigamesWon || 0) + 1;
    updateUser(userId, user);

    // Conquistas
    checkAchievements(userId);

    console.log(`[FORCA] Recompensa: ${userId.split('@')[0]} +${xpAmount} XP (${reason})`);
  } catch (err) {
    console.error('[FORCA] Erro ao conceder recompensa:', err.message);
  }
}

// ─────────────────────────────────────────────────────────────
// API PÚBLICA
// ─────────────────────────────────────────────────────────────

function hasActiveGame(chatId) {
  return games.has(chatId);
}

function isGameMessage(chatId, messageId) {
  const g = games.get(chatId);
  if (!g) return false;
  return Array.isArray(g.messageIds) && g.messageIds.includes(messageId);
}

function updateMessageId(chatId, messageId) {
  const g = games.get(chatId);
  if (!g || !messageId) return;

  if (!Array.isArray(g.messageIds)) g.messageIds = [];

  // Evita duplicatas
  if (!g.messageIds.includes(messageId)) {
    g.messageIds.push(messageId);
  }

  // Mantém apenas os últimos 10
  if (g.messageIds.length > 10) {
    g.messageIds = g.messageIds.slice(-10);
  }
}

function startGame(chatId, startedBy) {
  if (games.has(chatId)) return { error: 'already_active' };

  const word = randomWord();
  games.set(chatId, {
    word,
    guessed:      new Set(),
    wrongLetters: new Set(),
    errors:       0,
    startedBy,
    lastActivity: Date.now(),
    messageIds:   [],
  });

  return {
    ok:      true,
    display: buildDisplay(word, new Set()),
    length:  word.length,
  };
}

function stopGame(chatId) {
  const g = games.get(chatId);
  if (!g) return { error: 'no_game' };
  const word = g.word;
  games.delete(chatId);
  return { ok: true, word };
}

function guessLetter(chatId, rawLetter) {
  const g = games.get(chatId);
  if (!g) return { error: 'no_game' };

  const letter = normalize(rawLetter).charAt(0);
  if (!letter.match(/[A-Z]/)) return { error: 'invalid' };

  g.lastActivity = Date.now();

  // Letra já tentada?
  if (g.guessed.has(letter) || g.wrongLetters.has(letter)) {
    return { error: 'already_guessed', letter };
  }

  const wordNorm = normalize(g.word);

  if (wordNorm.includes(letter)) {
    // Adiciona todas as ocorrências da letra na palavra original
    g.word.split('').forEach((char) => {
      if (normalize(char) === letter) g.guessed.add(char);
    });

    const display = buildDisplay(g.word, g.guessed);
    const won     = isWordComplete(g.word, g.guessed);

    if (won) {
      // ✅ Apenas aqui concede XP e minigamesWon
      const userId = g.startedBy;
      const word   = g.word;
      games.delete(chatId);

      grantWinRewards(userId, 50, 'forca_win');

      return {
        hit:     true,
        letter,
        display,
        errors:  g.errors,
        won:     true,
        word,
        hangman: HANGMAN_STAGES[g.errors],
      };
    }

    // Acertou letra mas ainda não venceu — SEM recompensa
    return {
      hit:     true,
      letter,
      display,
      errors:  g.errors,
      won:     false,
      word:    null,
      hangman: HANGMAN_STAGES[g.errors],
    };

  } else {
    // Letra errada
    g.wrongLetters.add(letter);
    g.errors++;

    const lost = g.errors >= MAX_ERRORS;
    const word = lost ? g.word : null;

    if (lost) games.delete(chatId);

    return {
      hit:          false,
      letter,
      display:      buildDisplay(g.word, g.guessed),
      errors:       g.errors,
      maxErrors:    MAX_ERRORS,
      wrongLetters: [...g.wrongLetters].join(' '),
      lost,
      word,
      hangman:      HANGMAN_STAGES[Math.min(g.errors, MAX_ERRORS)],
    };
  }
}

function guessWord(chatId, rawWord) {
  const g = games.get(chatId);
  if (!g) return { error: 'no_game' };

  g.lastActivity = Date.now();

  const attempt  = normalize(rawWord);
  const wordNorm = normalize(g.word);

  if (attempt === wordNorm) {
    // ✅ Vitória por palavra completa
    const word   = g.word;
    const userId = g.startedBy;
    games.delete(chatId);

    grantWinRewards(userId, 80, 'forca_full_word');

    return { won: true, word };
  }

  // Palavra errada — penalidade de 2 erros
  g.errors = Math.min(g.errors + 2, MAX_ERRORS);
  const lost = g.errors >= MAX_ERRORS;
  const word = lost ? g.word : null;

  if (lost) games.delete(chatId);

  return {
    won:          false,
    lost,
    errors:       g.errors,
    maxErrors:    MAX_ERRORS,
    display:      buildDisplay(g.word, g.guessed),
    wrongLetters: [...g.wrongLetters].join(' '),
    word,
    hangman:      HANGMAN_STAGES[Math.min(g.errors, MAX_ERRORS)],
  };
}

function getState(chatId) {
  const g = games.get(chatId);
  if (!g) return null;
  return {
    display:      buildDisplay(g.word, g.guessed),
    errors:       g.errors,
    maxErrors:    MAX_ERRORS,
    wrongLetters: [...g.wrongLetters].join(' '),
    hangman:      HANGMAN_STAGES[g.errors],
    length:       g.word.length,
  };
}

module.exports = {
  hasActiveGame,
  isGameMessage,
  updateMessageId,
  startGame,
  stopGame,
  guessLetter,
  guessWord,
  getState,
  MAX_ERRORS,
};
