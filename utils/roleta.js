'use strict';

// ============================================================
// ROLETA DA DESGRAÇA v1.0.0
// Sistema de minigame caótico integrado ao Sentinel-Bot
// ============================================================

const { getUser, updateUser, addXP, getTopUsers } = require('./economy.js');

// ─────────────────────────────────────────────────────────────
// CONSTANTES
// ─────────────────────────────────────────────────────────────

const COOLDOWN_PADRAO_MS  = 30 * 60_000;   // 30 minutos
const COOLDOWN_PUNITIVO_MS = 60 * 60_000;  // 60 minutos (lag da existência)
const VERGONHA_DURACAO_MS  = 24 * 60 * 60_000; // 24 horas

// ─────────────────────────────────────────────────────────────
// TABELA DE RESULTADOS
// peso: quanto maior, mais frequente
// ─────────────────────────────────────────────────────────────

const OUTCOMES = [

  // ── LENDÁRIOS (peso 2 cada) ─────────────────────────────
  {
    id: 'jackpot_supremo',
    categoria: 'lendario',
    emoji: '👑',
    nome: 'Jackpot Supremo do Multiverso',
    xp: 2000,
    descricao: 'O universo inteiro apostou em você. E acertou.',
    efeito: { tipo: 'bonus_random' },
    peso: 2,
  },
  {
    id: 'deus_da_sorte',
    categoria: 'lendario',
    emoji: '🌟',
    nome: 'Deus da Sorte te escolheu como favorito',
    xp: 1500,
    descricao: 'Divindades do caos votaram: você é o preferido.',
    efeito: { tipo: 'giro_gratis', quantidade: 1 },
    peso: 2,
  },
  {
    id: 'rei_do_caos',
    categoria: 'lendario',
    emoji: '🔥',
    nome: 'Rei do Caos Ascendido',
    xp: 1200,
    descricao: 'O caos te reconheceu como rei. Por hoje.',
    efeito: { tipo: 'titulo_temporario', titulo: '👑 Rei do Caos' },
    peso: 2,
  },
  {
    id: 'evento_celestial',
    categoria: 'lendario',
    emoji: '✨',
    nome: 'Evento Celestial de Sorte Pura',
    xp: 1800,
    descricao: 'Astros alinhados. Karma zerado. Só lucro.',
    efeito: null,
    peso: 2,
  },

  // ── RAROS (peso 8 cada) ─────────────────────────────────
  {
    id: 'bolso_infinito',
    categoria: 'raro',
    emoji: '💰',
    nome: 'Bolso infinito suspeito',
    xp: 800,
    descricao: 'De onde saiu isso? Não pergunte. Aceite.',
    efeito: null,
    peso: 8,
  },
  {
    id: 'sabio_do_acaso',
    categoria: 'raro',
    emoji: '🧠',
    nome: 'Sábio do acaso',
    xp: 650,
    descricao: 'A aleatória te iluminou. Use com sabedoria.',
    efeito: null,
    peso: 8,
  },
  {
    id: 'trevo_cosmico',
    categoria: 'raro',
    emoji: '🍀',
    nome: 'Trevo cósmico encontrado',
    xp: 700,
    descricao: 'Sorte rara num universo injusto. Aproveite.',
    efeito: null,
    peso: 8,
  },
  {
    id: 'caixa_lendaria',
    categoria: 'raro',
    emoji: '📦',
    nome: 'Caixa lendária esquecida no universo',
    xp: 900,
    descricao: 'Alguém perdeu isso há séculos. Você encontrou.',
    efeito: null,
    peso: 8,
  },
  {
    id: 'energia_hype',
    categoria: 'raro',
    emoji: '⚡',
    nome: 'Energia de hype acumulada',
    xp: 750,
    descricao: 'O universo te deu um turbo. Não desperdice.',
    efeito: null,
    peso: 8,
  },

  // ── NORMAIS (peso 25 cada) ──────────────────────────────
  {
    id: 'caixa_comum',
    categoria: 'normal',
    emoji: '📫',
    nome: 'Caixa comum do sistema',
    xp: 300,
    descricao: 'Nem bom, nem ruim. A mediocridade te acolheu.',
    efeito: null,
    peso: 25,
  },
  {
    id: 'sorte_online',
    categoria: 'normal',
    emoji: '🖥️',
    nome: 'Sorte de quem tava online',
    xp: 250,
    descricao: 'Você estava aqui. Isso já conta.',
    efeito: null,
    peso: 25,
  },
  {
    id: 'resultado_neutro',
    categoria: 'normal',
    emoji: '🎲',
    nome: 'Resultado neutro calculado pelo caos',
    xp: 200,
    descricao: 'O caos fez a média. Você foi a média.',
    efeito: null,
    peso: 25,
  },
  {
    id: 'acerto_basico',
    categoria: 'normal',
    emoji: '✅',
    nome: 'Acerto básico da realidade',
    xp: 150,
    descricao: 'A realidade te reconheceu. Minimamente.',
    efeito: null,
    peso: 25,
  },
  {
    id: 'moedas_digitais',
    categoria: 'normal',
    emoji: '🪙',
    nome: 'Moedas caídas no chão digital',
    xp: 180,
    descricao: 'Você abaixou. Você catou. Isso é dignidade.',
    efeito: null,
    peso: 25,
  },

  // ── RUINS (peso 15 cada) ────────────────────────────────
  {
    id: 'carteira_evaporou',
    categoria: 'ruim',
    emoji: '💸',
    nome: 'Carteira evaporou',
    xp: -400,
    descricao: 'Sumiu. Sem explicação. Sem ressarcimento.',
    efeito: null,
    peso: 15,
  },
  {
    id: 'azar_exemplo',
    categoria: 'ruim',
    emoji: '🎯',
    nome: 'Azar te escolheu como exemplo',
    xp: -250,
    descricao: 'O caos precisava de um voluntário. Você se candidatou sem querer.',
    efeito: null,
    peso: 15,
  },
  {
    id: 'lag_existencia',
    categoria: 'ruim',
    emoji: '📡',
    nome: 'Lag da existência atingiu você',
    xp: -200,
    descricao: 'Timeout. O universo não respondeu a tempo.',
    efeito: { tipo: 'cooldown_aumentado' },
    peso: 15,
  },
  {
    id: 'investimento_ruim',
    categoria: 'ruim',
    emoji: '📉',
    nome: 'Investimento emocional ruim',
    xp: -300,
    descricao: 'Você acreditou. A roleta não acreditou em você.',
    efeito: null,
    peso: 15,
  },
  {
    id: 'universo_ignorou',
    categoria: 'ruim',
    emoji: '🌌',
    nome: 'O universo ignorou seu pedido',
    xp: -150,
    descricao: 'O pedido foi recebido. Avaliado. E descartado.',
    efeito: null,
    peso: 15,
  },

  // ── DESGRAÇA PURA (peso 8 cada) ─────────────────────────
  {
    id: 'explosao_destino',
    categoria: 'desgraca',
    emoji: '💀',
    nome: 'Explosão do destino reverso',
    xp: -600,
    descricao: 'O destino explodiu na sua cara. Em câmera lenta.',
    efeito: { tipo: 'vergonha_publica' },
    peso: 8,
  },
  {
    id: 'todo_mundo_viu',
    categoria: 'desgraca',
    emoji: '👁️',
    nome: 'Todo mundo viu isso acontecer',
    xp: -500,
    descricao: 'Não dá pra negar. Tem prova. Você girou.',
    efeito: { tipo: 'vergonha_publica' },
    peso: 8,
  },
  {
    id: 'rip_reputacao',
    categoria: 'desgraca',
    emoji: '🪦',
    nome: 'RIP reputação no grupo',
    xp: -450,
    descricao: 'Descanse em paz, credibilidade. 2024-hoje.',
    efeito: { tipo: 'vergonha_publica' },
    peso: 8,
  },
  {
    id: 'silencio_constrangedor',
    categoria: 'desgraca',
    emoji: '😶',
    nome: 'Silêncio constrangedor universal',
    xp: -350,
    descricao: 'Ninguém falou nada. Mas todo mundo viu.',
    efeito: { tipo: 'vergonha_publica' },
    peso: 8,
  },
  {
    id: 'derrota_estatistica',
    categoria: 'desgraca',
    emoji: '📊',
    nome: 'Derrota estatística confirmada',
    xp: -550,
    descricao: 'Os números não mentem. Você perdeu com mérito.',
    efeito: { tipo: 'vergonha_publica' },
    peso: 8,
  },

  // ── ESPECIAIS / CAOS PURO (peso 4 cada) ─────────────────
  {
    id: 'glitch_universo',
    categoria: 'especial',
    emoji: '🌀',
    nome: 'Glitch do universo instável',
    xp: null, // calculado em tempo real
    descricao: 'A simulação travou. O resultado foi aleatório dentro do aleatório.',
    efeito: { tipo: 'xp_aleatorio', min: -1200, max: 2200 },
    peso: 4,
  },
  {
    id: 'realidade_bugou',
    categoria: 'especial',
    emoji: '🐛',
    nome: 'Realidade bugou você',
    xp: null,
    descricao: 'Erro 404: destino não encontrado. Improvisando.',
    efeito: { tipo: 'efeito_aleatorio' },
    peso: 4,
  },
  {
    id: 'loop_temporal',
    categoria: 'especial',
    emoji: '🔄',
    nome: 'Loop temporal da roleta',
    xp: 0,
    descricao: 'Déjà vu detectado. Girando novamente... automaticamente.',
    efeito: { tipo: 'loop_temporal' },
    peso: 4,
  },
  {
    id: 'reacao_em_cadeia',
    categoria: 'especial',
    emoji: '💥',
    nome: 'Reação em cadeia do caos',
    xp: 400,
    descricao: 'O caos se espalhou. Outros usuários foram afetados. Você é o catalisador.',
    efeito: { tipo: 'reacao_cadeia' },
    peso: 4,
  },
  {
    id: 'tempestade_dupla',
    categoria: 'especial',
    emoji: '⛈️',
    nome: 'Tempestade de sorte e azar simultâneos',
    xp: null,
    descricao: 'Ganhou e perdeu ao mesmo tempo. O paradoxo te escolheu.',
    efeito: { tipo: 'resultado_duplo' },
    peso: 4,
  },

  // ── ULTRA RAROS SECRETOS (peso 1 cada) ──────────────────
  {
    id: 'sistema_observou',
    categoria: 'ultra_raro',
    emoji: '🤖',
    nome: 'O sistema te observou jogando',
    xp: 999,
    descricao: 'O Sentinel anotou seu comportamento. E aprovou.',
    efeito: null,
    peso: 1,
  },
  {
    id: 'protecao_rng',
    categoria: 'ultra_raro',
    emoji: '🛡️',
    nome: 'Proteção do RNG supremo',
    xp: 500,
    descricao: 'Escudo ativado. Próximos 3 giros: imunidade total a punições.',
    efeito: { tipo: 'protecao_giros', quantidade: 3 },
    peso: 1,
  },
  {
    id: 'manipulacao_acaso',
    categoria: 'ultra_raro',
    emoji: '🎭',
    nome: 'Manipulação do acaso desbloqueada',
    xp: 600,
    descricao: 'Você viu as cartas. Uma vez. Use com responsabilidade.',
    efeito: { tipo: 'escolha_proxima' },
    peso: 1,
  },
  {
    id: 'escolhido_sentinel',
    categoria: 'ultra_raro',
    emoji: '⚡',
    nome: 'Escolhido do Sentinel',
    xp: 800,
    descricao: 'O bot te elegeu. XP dobrado por 1 hora.',
    efeito: { tipo: 'multiplicador_xp', fator: 2, duracaoMs: 3_600_000 },
    peso: 1,
  },
  {
    id: 'reset_destino',
    categoria: 'ultra_raro',
    emoji: '🔃',
    nome: 'Reset parcial do destino',
    xp: 300,
    descricao: 'Penalidades recentes limpas. Ficha zerada. Recomeço autorizado.',
    efeito: { tipo: 'reset_penalidades' },
    peso: 1,
  },
];

// ─────────────────────────────────────────────────────────────
// FRASES DE VERGONHA PÚBLICA
// ─────────────────────────────────────────────────────────────

const VERGONHA_FRASES = [
  { titulo: '💀 VERGONHA DO MOMENTO:', texto: '"esse cara foi visto pela sociedade e rejeitado em HD"' },
  { titulo: '😵 STATUS SOCIAL:', texto: '"proibido de opinar até amanhã"' },
  { titulo: '👁️ REGISTRO PÚBLICO:', texto: '"todo mundo viu e fingiu que não viu, menos o bot"' },
  { titulo: '🤡 NOTA OFICIAL:', texto: '"a roleta não mente, só expõe"' },
  { titulo: '📢 AVISO DO SISTEMA:', texto: '"reputação comprometida. aguardar recuperação."' },
  { titulo: '😬 SITUAÇÃO ATUAL:', texto: '"vivendo no silêncio pós-desgraça"' },
  { titulo: '🪦 EPITÁFIO TEMPORÁRIO:', texto: '"aqui jaz alguém que girou a roleta e se arrependeu"' },
  { titulo: '🔔 ALERTA DE CRINGE:', texto: '"nível de constrangimento: máximo. socorro indisponível."' },
  { titulo: '📋 LAUDO TÉCNICO:', texto: '"diagnóstico: girou sem ler as advertências"' },
  { titulo: '🗂️ FICHA ATUALIZADA:', texto: '"status: queimado na praça pública digital"' },
];

// ─────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────

function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function msParaHMS(ms) {
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h}h ${m}min`;
  if (m > 0) return `${m}min ${s}s`;
  return `${s}s`;
}

// ─────────────────────────────────────────────────────────────
// GARANTE ESTRUTURA ROLETA NO USER
// ─────────────────────────────────────────────────────────────

function ensureRoletaData(user) {
  if (!user.roleta) user.roleta = {};
  const r = user.roleta;
  if (!r.lastUsed)         r.lastUsed         = 0;
  if (!r.cooldownMs)       r.cooldownMs       = COOLDOWN_PADRAO_MS;
  if (!r.girosGratis)      r.girosGratis      = 0;
  if (!r.girosProtegidos)  r.girosProtegidos  = 0;
  if (!r.vergonha)         r.vergonha         = { ativa: false, expiraEm: 0 };
  if (!r.multiplicador)    r.multiplicador    = { ativo: false, fator: 1, expiraEm: 0 };
  if (!r.proximaEscolha)   r.proximaEscolha   = false;
}

// ─────────────────────────────────────────────────────────────
// VERIFICAR COOLDOWN
// ─────────────────────────────────────────────────────────────

function checkCooldown(user) {
  ensureRoletaData(user);
  const r = user.roleta;

  // Giro grátis disponível
  if (r.girosGratis > 0) return { podeJogar: true, gratuito: true };

  const agora    = Date.now();
  const cooldownMs = r.cooldownMs || COOLDOWN_PADRAO_MS;
  const proximo  = (r.lastUsed || 0) + cooldownMs;

  if (agora >= proximo) return { podeJogar: true, gratuito: false };

  return {
    podeJogar:  false,
    gratuito:   false,
    restante:   proximo - agora,
    restanteStr: msParaHMS(proximo - agora),
  };
}

// ─────────────────────────────────────────────────────────────
// SORTEAR RESULTADO
// ─────────────────────────────────────────────────────────────

function sortearOutcome() {
  const totalPeso = OUTCOMES.reduce((sum, o) => sum + o.peso, 0);
  let rand = Math.random() * totalPeso;
  for (const outcome of OUTCOMES) {
    rand -= outcome.peso;
    if (rand <= 0) return outcome;
  }
  return OUTCOMES[OUTCOMES.length - 1];
}

// ─────────────────────────────────────────────────────────────
// APLICAR XP (positivo ou negativo)
// ─────────────────────────────────────────────────────────────

function aplicarXP(userId, delta) {
  if (delta === 0) return { xp: 0, leveledUp: null };

  const user = getUser(userId);

  // Verifica multiplicador ativo
  if (user.roleta?.multiplicador?.ativo) {
    const mult = user.roleta.multiplicador;
    if (Date.now() < mult.expiraEm && delta > 0) {
      delta = Math.floor(delta * (mult.fator || 2));
    } else if (Date.now() >= mult.expiraEm) {
      user.roleta.multiplicador = { ativo: false, fator: 1, expiraEm: 0 };
      updateUser(userId, user);
    }
  }

  if (delta > 0) {
    return addXP(userId, delta, 'roleta');
  }

  // XP negativo: subtrai diretamente, sem penalidade de streak
  const freshUser = getUser(userId);
  freshUser.xp = Math.max(0, (freshUser.xp || 0) + delta);
  updateUser(userId, freshUser);
  return { xp: delta, leveledUp: null };
}

// ─────────────────────────────────────────────────────────────
// PROCESSAR EFEITO ESPECIAL
// ─────────────────────────────────────────────────────────────

function processarEfeito(userId, efeito, outcome) {
  if (!efeito) return { xpExtra: 0, mensagemEfeito: null };

  const user = getUser(userId);
  ensureRoletaData(user);
  const r = user.roleta;
  let xpExtra = 0;
  let mensagemEfeito = null;

  switch (efeito.tipo) {

    case 'vergonha_publica':
      r.vergonha = { ativa: true, expiraEm: Date.now() + VERGONHA_DURACAO_MS };
      mensagemEfeito = `💀 *VERGONHA PÚBLICA ATIVADA* — dura 24 horas. Será exibida no seu perfil.`;
      break;

    case 'giro_gratis':
      r.girosGratis = (r.girosGratis || 0) + (efeito.quantidade || 1);
      mensagemEfeito = `🎟️ *+${efeito.quantidade || 1} giro(s) grátis* guardado(s) para a próxima vez!`;
      break;

    case 'cooldown_aumentado':
      r.cooldownMs = COOLDOWN_PUNITIVO_MS;
      r.cooldownPunitivoAte = Date.now() + COOLDOWN_PUNITIVO_MS;
      mensagemEfeito = `⏳ Cooldown aumentado para *60 minutos* desta vez.`;
      break;

    case 'protecao_giros':
      r.girosProtegidos = (r.girosProtegidos || 0) + (efeito.quantidade || 3);
      mensagemEfeito = `🛡️ Escudo ativado! Próximos *${efeito.quantidade || 3}* giros sem punição.`;
      break;

    case 'multiplicador_xp':
      r.multiplicador = {
        ativo:    true,
        fator:    efeito.fator || 2,
        expiraEm: Date.now() + (efeito.duracaoMs || 3_600_000),
      };
      mensagemEfeito = `⚡ XP *x${efeito.fator}* ativado por 1 hora!`;
      break;

    case 'reset_penalidades':
      r.vergonha = { ativa: false, expiraEm: 0 };
      r.cooldownMs = COOLDOWN_PADRAO_MS;
      mensagemEfeito = `🔃 Vergonha removida e cooldown resetado. Ficha limpa.`;
      break;

    case 'escolha_proxima':
      r.proximaEscolha = true;
      mensagemEfeito = `🎭 No próximo *!roleta*, use *!roleta sort* para ver 3 opções e escolher!`;
      break;

    case 'titulo_temporario':
      mensagemEfeito = `👑 Título temporário: *${efeito.titulo}* — exibido no perfil por hoje.`;
      break;

    case 'xp_aleatorio': {
      xpExtra = randInt(efeito.min || -1200, efeito.max || 2200);
      const sinal = xpExtra >= 0 ? '+' : '';
      mensagemEfeito = `🌀 XP glitchado: *${sinal}${xpExtra}* (aleatório real dentro do aleatório)`;
      break;
    }

    case 'efeito_aleatorio': {
      const efeitos = ['vergonha_publica', 'giro_gratis', 'cooldown_aumentado', 'protecao_giros'];
      const efeitoRand = efeitos[randInt(0, efeitos.length - 1)];
      return processarEfeito(userId, { tipo: efeitoRand, quantidade: 1 }, outcome);
    }

    case 'resultado_duplo': {
      const xpA = randInt(100, 800);
      const xpB = randInt(-500, -100);
      xpExtra = xpA + xpB;
      const sinalA = '+';
      const sinalB = xpB < 0 ? '' : '+';
      mensagemEfeito = `⛈️ Resultado duplo: *${sinalA}${xpA} XP* e *${sinalB}${xpB} XP* = líquido: *${xpExtra > 0 ? '+' : ''}${xpExtra}*`;
      break;
    }

    case 'reacao_cadeia': {
      // Registrar para ser processado após salvar o user atual
      mensagemEfeito = `💥 Reação em cadeia disparada! Outros usuários serão afetados.`;
      break;
    }

    case 'bonus_random': {
      xpExtra = randInt(200, 500);
      mensagemEfeito = `🎁 Bônus aleatório: *+${xpExtra} XP* extras!`;
      break;
    }

    default:
      break;
  }

  updateUser(userId, user);
  return { xpExtra, mensagemEfeito };
}

// ─────────────────────────────────────────────────────────────
// SPIN PRINCIPAL
// ─────────────────────────────────────────────────────────────

function spin(userId) {
  const user = getUser(userId);
  ensureRoletaData(user);
  const r = user.roleta;

  // Verifica proteção ativa
  const temProtecao = (r.girosProtegidos || 0) > 0;
  if (temProtecao) r.girosProtegidos--;

  // Sorteia
  let outcome = sortearOutcome();

  // Se protegido e outcome é negativo, re-sorteia até positivo (máx 10 tentativas)
  if (temProtecao && outcome.xp !== null && outcome.xp < 0) {
    for (let i = 0; i < 10; i++) {
      outcome = sortearOutcome();
      if (outcome.xp === null || outcome.xp >= 0) break;
    }
  }

  // Registra uso (consome giro grátis ou atualiza cooldown)
  if ((r.girosGratis || 0) > 0) {
    r.girosGratis--;
  } else {
    r.lastUsed   = Date.now();
    r.cooldownMs = COOLDOWN_PADRAO_MS; // reseta cooldown punitivo se já passou
  }

  updateUser(userId, user);

  return outcome;
}

// ─────────────────────────────────────────────────────────────
// REAÇÃO EM CADEIA — afeta outros usuários do DB
// ─────────────────────────────────────────────────────────────

function processarReacaoCadeia(userId) {
  const resultados = [];
  try {
    const topUsers = getTopUsers(5);
    const alvos = topUsers
      .map(u => u.id)
      .filter(id => id !== userId)
      .slice(0, 3);

    for (const alvoId of alvos) {
      const xpCadeia = randInt(-200, 300);
      aplicarXP(alvoId, xpCadeia);
      const num = alvoId.split('@')[0];
      resultados.push(`  @${num}: ${xpCadeia >= 0 ? '+' : ''}${xpCadeia} XP`);
    }
  } catch (err) {
    console.error('[ROLETA] Erro na reação em cadeia:', err.message);
  }
  return resultados;
}

// ─────────────────────────────────────────────────────────────
// SPIN LOOP TEMPORAL — sorteia novamente (sem gravar cooldown 2x)
// ─────────────────────────────────────────────────────────────

function spinLoop(userId) {
  // Não registra novo cooldown, só sorteia
  const user = getUser(userId);
  ensureRoletaData(user);
  const r = user.roleta;
  const temProtecao = (r.girosProtegidos || 0) > 0;
  if (temProtecao) r.girosProtegidos--;
  updateUser(userId, user);
  return sortearOutcome();
}

// ─────────────────────────────────────────────────────────────
// VERIFICAR VERGONHA (para o !perfil)
// ─────────────────────────────────────────────────────────────

function getVergonha(userId) {
  try {
    const user = getUser(userId);
    ensureRoletaData(user);
    const v = user.roleta.vergonha;
    if (!v || !v.ativa) return null;
    if (Date.now() >= v.expiraEm) {
      // Expira automaticamente
      user.roleta.vergonha = { ativa: false, expiraEm: 0 };
      updateUser(userId, user);
      return null;
    }
    return { expiraEm: v.expiraEm, restante: v.expiraEm - Date.now() };
  } catch {
    return null;
  }
}

function getFraseVergonha() {
  return VERGONHA_FRASES[randInt(0, VERGONHA_FRASES.length - 1)];
}

// ─────────────────────────────────────────────────────────────
// CATEGORIA → RÓTULO VISUAL
// ─────────────────────────────────────────────────────────────

const CATEGORIA_LABEL = {
  lendario:   '🟢 LENDÁRIO',
  raro:       '🟡 RARO',
  normal:     '🟠 NORMAL',
  ruim:       '🔴 RUIM',
  desgraca:   '☠️ DESGRAÇA',
  especial:   '🌀 ESPECIAL',
  ultra_raro: '🔥 ULTRA RARO SECRETO',
};

module.exports = {
  OUTCOMES,
  VERGONHA_FRASES,
  CATEGORIA_LABEL,
  ensureRoletaData,
  checkCooldown,
  sortearOutcome,
  spin,
  spinLoop,
  aplicarXP,
  processarEfeito,
  processarReacaoCadeia,
  getVergonha,
  getFraseVergonha,
  msParaHMS,
};
