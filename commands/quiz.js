'use strict';

// ============================================================
// QUIZ — Perguntas fixas, sem IA, A/B/C/D v1.0.0
// Responder com reply da pergunta: a / b / c / d
// ============================================================

const { addXP, getUser, updateUser } = require('../utils/economy.js');
const { checkAchievements }          = require('../utils/achievements.js');

// ─────────────────────────────────────────────────────────────
// BANCO DE PERGUNTAS
// ─────────────────────────────────────────────────────────────

const QUESTIONS = [
  {
    question:  'Qual é a capital do Brasil?',
    options:   { a: 'São Paulo', b: 'Rio de Janeiro', c: 'Brasília', d: 'Salvador' },
    answer:    'c',
    category:  '🌎 Geografia',
  },
  {
    question:  'Quanto é 2² + 3²?',
    options:   { a: '10', b: '12', c: '13', d: '25' },
    answer:    'c',
    category:  '🔢 Matemática',
  },
  {
    question:  'Qual planeta é conhecido como o Planeta Vermelho?',
    options:   { a: 'Vênus', b: 'Júpiter', c: 'Saturno', d: 'Marte' },
    answer:    'd',
    category:  '🚀 Astronomia',
  },
  {
    question:  'Em que ano o Brasil ganhou a primeira Copa do Mundo?',
    options:   { a: '1950', b: '1954', c: '1958', d: '1962' },
    answer:    'c',
    category:  '⚽ Esportes',
  },
  {
    question:  'Qual o maior oceano do mundo?',
    options:   { a: 'Atlântico', b: 'Índico', c: 'Ártico', d: 'Pacífico' },
    answer:    'd',
    category:  '🌊 Geografia',
  },
  {
    question:  'Quem escreveu Dom Casmurro?',
    options:   { a: 'José de Alencar', b: 'Machado de Assis', c: 'Graciliano Ramos', d: 'Clarice Lispector' },
    answer:    'b',
    category:  '📚 Literatura',
  },
  {
    question:  'Qual é o elemento químico com símbolo "O"?',
    options:   { a: 'Ouro', b: 'Ósmio', c: 'Oxigênio', d: 'Ônio' },
    answer:    'c',
    category:  '🔬 Química',
  },
  {
    question:  'Quantos lados tem um hexágono?',
    options:   { a: '5', b: '6', c: '7', d: '8' },
    answer:    'b',
    category:  '📐 Matemática',
  },
  {
    question:  'Em que continente fica o Egito?',
    options:   { a: 'Ásia', b: 'Europa', c: 'África', d: 'Oriente Médio' },
    answer:    'c',
    category:  '🌍 Geografia',
  },
  {
    question:  'Qual animal é o mais rápido do mundo?',
    options:   { a: 'Leão', b: 'Guepardo', c: 'Falcão-peregrino', d: 'Cavalo' },
    answer:    'c',
    category:  '🐾 Animais',
  },
  {
    question:  'Qual é a fórmula da água?',
    options:   { a: 'H2O2', b: 'HO', c: 'H2O', d: 'H3O' },
    answer:    'c',
    category:  '🔬 Química',
  },
  {
    question:  'Quem pintou a Mona Lisa?',
    options:   { a: 'Michelangelo', b: 'Rafael', c: 'Leonardo da Vinci', d: 'Donatello' },
    answer:    'c',
    category:  '🎨 Arte',
  },
  {
    question:  'Quantos minutos tem uma hora?',
    options:   { a: '30', b: '60', c: '90', d: '100' },
    answer:    'b',
    category:  '⏰ Geral',
  },
  {
    question:  'Qual é o maior país do mundo em área?',
    options:   { a: 'China', b: 'EUA', c: 'Canadá', d: 'Rússia' },
    answer:    'd',
    category:  '🌎 Geografia',
  },
  {
    question:  'Qual linguagem de programação foi criada pela Netscape em 1995?',
    options:   { a: 'Python', b: 'Java', c: 'JavaScript', d: 'PHP' },
    answer:    'c',
    category:  '💻 Tecnologia',
  },
  {
    question:  'Quantos ossos tem o corpo humano adulto?',
    options:   { a: '186', b: '206', c: '256', d: '306' },
    answer:    'b',
    category:  '🩺 Biologia',
  },
  {
    question:  'Qual é a moeda oficial do Japão?',
    options:   { a: 'Yuan', b: 'Won', c: 'Iene', d: 'Baht' },
    answer:    'c',
    category:  '💴 Economia',
  },
  {
    question:  'Em que ano a Internet foi aberta ao público?',
    options:   { a: '1983', b: '1989', c: '1991', d: '1995' },
    answer:    'c',
    category:  '💻 Tecnologia',
  },
  {
    question:  'Qual é o rio mais longo do mundo?',
    options:   { a: 'Amazonas', b: 'Nilo', c: 'Yangtzé', d: 'Mississippi' },
    answer:    'b',
    category:  '🌊 Geografia',
  },
  {
    question:  'Quantos planetas existem no Sistema Solar?',
    options:   { a: '7', b: '8', c: '9', d: '10' },
    answer:    'b',
    category:  '🚀 Astronomia',
  },
];

// ─────────────────────────────────────────────────────────────
// ESTADO DAS PARTIDAS
// ─────────────────────────────────────────────────────────────

const activeQuizzes = new Map(); // chatId → { question, answer, messageId, startedBy, ts }
const QUIZ_TTL_MS   = 5 * 60_000;

// Limpeza periódica
setInterval(() => {
  const now = Date.now();
  for (const [id, q] of activeQuizzes.entries()) {
    if (now - q.ts > QUIZ_TTL_MS) {
      activeQuizzes.delete(id);
      console.log(`[QUIZ] Pergunta expirada: ${id}`);
    }
  }
}, 60_000);

// ─────────────────────────────────────────────────────────────
// COMANDO PRINCIPAL
// ─────────────────────────────────────────────────────────────

module.exports = {
  name: 'quiz',

  execute: async ({ sock, from, sender, args }) => {

    // ── Já há quiz ativo?
    if (activeQuizzes.has(from)) {
      const q = activeQuizzes.get(from);
      await sock.sendMessage(from, {
        text: [
          '⚠️ Já existe um quiz em andamento!',
          '',
          `${q.category}`,
          `❓ *${q.question.question}*`,
          '',
          `🅰️ ${q.question.options.a}`,
          `🅱️ ${q.question.options.b}`,
          `🅲 ${q.question.options.c}`,
          `🅳 ${q.question.options.d}`,
          '',
          '📌 Responda com *reply* nesta mensagem: a / b / c / d',
        ].join('\n'),
      });
      return;
    }

    // ── Sorteia pergunta
    const q = QUESTIONS[Math.floor(Math.random() * QUESTIONS.length)];

    const msg = await sock.sendMessage(from, {
      text: [
        '🧠 *QUIZ TIME!*',
        '',
        `${q.category}`,
        `❓ *${q.question}*`,
        '',
        `🅰️ ${q.options.a}`,
        `🅱️ ${q.options.b}`,
        `🅲 ${q.options.c}`,
        `🅳 ${q.options.d}`,
        '',
        '📌 Responda com *reply* nesta mensagem: a / b / c / d',
        `⏳ Você tem ${Math.floor(QUIZ_TTL_MS / 60000)} minutos!`,
      ].join('\n'),
    });

    const msgId = msg?.key?.id;

    activeQuizzes.set(from, {
      question:   q,
      answer:     q.answer,
      messageId:  msgId,
      startedBy:  sender,
      ts:         Date.now(),
    });

    console.log(`[QUIZ] Novo quiz em ${from} | Pergunta: "${q.question.slice(0, 40)}"`);
  },

  // ── Handler de respostas (chamado pelo handler.js via handleQuizReply)
  handleReply: handleQuizReply,
};

// ─────────────────────────────────────────────────────────────
// PROCESSAR RESPOSTA DO QUIZ
// ─────────────────────────────────────────────────────────────

async function handleQuizReply(sock, message, from, sender, text) {
  const contextInfo = message.message?.extendedTextMessage?.contextInfo;
  if (!contextInfo) return false;

  const quotedId = contextInfo.stanzaId;
  if (!quotedId) return false;

  const quiz = activeQuizzes.get(from);
  if (!quiz) return false;

  // Só processa se for reply da mensagem do quiz
  if (quiz.messageId !== quotedId) return false;

  const input = text.trim().toLowerCase();
  if (!['a', 'b', 'c', 'd'].includes(input)) return false;

  const q    = quiz.question;
  const isCorrect = input === quiz.answer;

  // Remove o quiz independente do resultado
  activeQuizzes.delete(from);

  const correctLetter = quiz.answer.toUpperCase();
  const correctText   = q.options[quiz.answer];

  if (isCorrect) {
    // Recompensa XP
    const xpGain = 30;
    try {
      addXP(sender, xpGain, 'quiz_win');
      const user = getUser(sender);
      if (!user.stats) user.stats = { minigamesWon: 0, totalMessages: 0, dailysCollected: 0 };
      user.stats.minigamesWon = (user.stats.minigamesWon || 0) + 1;
      updateUser(sender, user);
      checkAchievements(sender);
    } catch (err) {
      console.error('[QUIZ] Erro ao conceder recompensa:', err.message);
    }

    await sock.sendMessage(from, {
      text: [
        `✅ *CORRETO!* @${sender.split('@')[0]}`,
        '',
        `${q.category}`,
        `❓ ${q.question}`,
        `✅ Resposta: *${correctLetter}) ${correctText}*`,
        '',
        `🎉 +${30} XP concedidos!`,
      ].join('\n'),
      mentions: [sender],
    });

  } else {
    await sock.sendMessage(from, {
      text: [
        `❌ *ERROU!* @${sender.split('@')[0]}`,
        '',
        `${q.category}`,
        `❓ ${q.question}`,
        `Você respondeu: *${input.toUpperCase()}) ${q.options[input]}*`,
        `✅ Resposta correta: *${correctLetter}) ${correctText}*`,
        '',
        'Tente novamente com *!quiz*',
      ].join('\n'),
      mentions: [sender],
    });
  }

  return true;
}

// ─────────────────────────────────────────────────────────────
// EXPORTA HANDLER PARA USO EXTERNO
// ─────────────────────────────────────────────────────────────

module.exports.handleQuizReply = handleQuizReply;
module.exports.activeQuizzes   = activeQuizzes;
