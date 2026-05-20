'use strict';

// ============================================================
// ACHIEVEMENTS.JS — Sistema de conquistas v2.1.0
// BUG FIXES:
//   - Acesso seguro a user.inventory (evita crash se undefined)
//   - Acesso seguro a user.stats (evita crash se undefined)
//   - updateUser chamado apenas uma vez ao final
// ============================================================

const { getUser, updateUser } = require('./economy.js');

// ─────────────────────────────────────────────────────────────
// DEFINIÇÃO DE CONQUISTAS
// ─────────────────────────────────────────────────────────────

const ACHIEVEMENTS = {

  // ── Mensagens
  first_message: {
    id:          'first_message',
    name:        'Primeira Mensagem',
    description: 'Envie sua primeira mensagem no grupo',
    icon:        '💬',
    rarity:      'Comum',
    reward:      { coins: 50, xp: 20 },
    check:       (user) => (user.stats?.totalMessages || user.messages || 0) >= 1,
  },

  chatterbox: {
    id:          'chatterbox',
    name:        'Tagarela',
    description: 'Envie 100 mensagens',
    icon:        '🗣️',
    rarity:      'Comum',
    reward:      { coins: 200, xp: 100 },
    check:       (user) => (user.stats?.totalMessages || user.messages || 0) >= 100,
  },

  speaker: {
    id:          'speaker',
    name:        'Comunicador',
    description: 'Envie 500 mensagens',
    icon:        '📢',
    rarity:      'Raro',
    reward:      { coins: 500, xp: 300 },
    check:       (user) => (user.stats?.totalMessages || user.messages || 0) >= 500,
  },

  legend_speaker: {
    id:          'legend_speaker',
    name:        'Lenda das Conversas',
    description: 'Envie 1000 mensagens',
    icon:        '👑',
    rarity:      'Épico',
    reward:      { coins: 1500, xp: 1000, item: 'frame_speaker' },
    check:       (user) => (user.stats?.totalMessages || user.messages || 0) >= 1000,
  },

  // ── Níveis
  level_10: {
    id:          'level_10',
    name:        'Iniciante Completo',
    description: 'Alcance o nível 10',
    icon:        '⭐',
    rarity:      'Comum',
    reward:      { coins: 300, xp: 0 },
    check:       (user) => (user.level || 1) >= 10,
  },

  level_25: {
    id:          'level_25',
    name:        'Elite Ascendente',
    description: 'Alcance o nível 25',
    icon:        '🎖️',
    rarity:      'Raro',
    reward:      { coins: 800, xp: 0 },
    check:       (user) => (user.level || 1) >= 25,
  },

  level_50: {
    id:          'level_50',
    name:        'Mestre do Grupo',
    description: 'Alcance o nível 50',
    icon:        '👑',
    rarity:      'Épico',
    reward:      { coins: 2000, xp: 0, item: 'frame_master' },
    check:       (user) => (user.level || 1) >= 50,
  },

  level_100: {
    id:          'level_100',
    name:        'Void Master',
    description: 'Alcance o nível 100',
    icon:        '💀',
    rarity:      'Lendário',
    reward:      { coins: 5000, xp: 0, item: 'aura_void' },
    check:       (user) => (user.level || 1) >= 100,
  },

  // ── Streak
  streak_7: {
    id:          'streak_7',
    name:        'Semana Perfeita',
    description: 'Mantenha 7 dias de streak',
    icon:        '🔥',
    rarity:      'Raro',
    reward:      { coins: 500, xp: 200 },
    check:       (user) => (user.streak || 0) >= 7,
  },

  streak_30: {
    id:          'streak_30',
    name:        'Dedicação Extrema',
    description: 'Mantenha 30 dias de streak',
    icon:        '🌟',
    rarity:      'Lendário',
    reward:      { coins: 3000, xp: 1500, item: 'aura_flame' },
    check:       (user) => (user.streak || 0) >= 30,
  },

  // ── Daily/Weekly
  daily_collector: {
    id:          'daily_collector',
    name:        'Coletor Diário',
    description: 'Colete 10 dailys',
    icon:        '📅',
    rarity:      'Comum',
    reward:      { coins: 300, xp: 150 },
    check:       (user) => (user.stats?.dailyClaimed || 0) >= 10,
  },

  weekly_master: {
    id:          'weekly_master',
    name:        'Mestre Semanal',
    description: 'Colete 5 weeklys',
    icon:        '🗓️',
    rarity:      'Raro',
    reward:      { coins: 800, xp: 400 },
    check:       (user) => (user.stats?.weeklyClaimed || 0) >= 5,
  },

  // ── Minigames
  first_win: {
    id:          'first_win',
    name:        'Primeira Vitória',
    description: 'Vença seu primeiro minigame',
    icon:        '🎮',
    rarity:      'Comum',
    reward:      { coins: 100, xp: 50 },
    check:       (user) => (user.stats?.minigamesWon || 0) >= 1,
  },

  gamer: {
    id:          'gamer',
    name:        'Gamer de Verdade',
    description: 'Vença 10 minigames',
    icon:        '🕹️',
    rarity:      'Raro',
    reward:      { coins: 600, xp: 300 },
    check:       (user) => (user.stats?.minigamesWon || 0) >= 10,
  },

  pro_gamer: {
    id:          'pro_gamer',
    name:        'Pro Gamer',
    description: 'Vença 50 minigames',
    icon:        '👾',
    rarity:      'Épico',
    reward:      { coins: 2000, xp: 1000, item: 'frame_gamer' },
    check:       (user) => (user.stats?.minigamesWon || 0) >= 50,
  },

  // ── Riqueza
  rich: {
    id:          'rich',
    name:        'Rico',
    description: 'Acumule 5.000 moedas',
    icon:        '💎',
    rarity:      'Raro',
    reward:      { coins: 500, xp: 200 },
    check:       (user) => (user.coins || 0) >= 5000,
  },

  millionaire: {
    id:          'millionaire',
    name:        'Milionário',
    description: 'Ganhe 50.000 moedas no total',
    icon:        '💰',
    rarity:      'Lendário',
    reward:      { coins: 5000, xp: 2000, item: 'frame_gold' },
    check:       (user) => (user.stats?.totalCoins || 0) >= 50000,
  },

  // ── Colecionador
  // CORREÇÃO: acesso seguro a user.inventory?.frames
  collector: {
    id:          'collector',
    name:        'Colecionador',
    description: 'Possua 5 molduras diferentes',
    icon:        '🖼️',
    rarity:      'Raro',
    reward:      { coins: 800, xp: 400 },
    check:       (user) => (user.inventory?.frames?.length || 0) >= 5,
  },

  font_master: {
    id:          'font_master',
    name:        'Mestre das Fontes',
    description: 'Possua 5 fontes diferentes',
    icon:        '🔤',
    rarity:      'Raro',
    reward:      { coins: 800, xp: 400 },
    check:       (user) => (user.inventory?.fonts?.length || 0) >= 5,
  },

};

// ─────────────────────────────────────────────────────────────
// GARANTE ESTRUTURA MÍNIMA DO USUÁRIO
// Evita crashes ao acessar campos que podem não existir
// ─────────────────────────────────────────────────────────────

function ensureUserStructure(user) {
  if (!user.achievements)  user.achievements  = [];
  if (!user.stats)         user.stats         = {};
  if (user.stats.totalMessages  === undefined) user.stats.totalMessages  = user.messages || 0;
  if (user.stats.minigamesWon   === undefined) user.stats.minigamesWon   = 0;
  if (user.stats.dailyClaimed   === undefined) user.stats.dailyClaimed   = 0;
  if (user.stats.weeklyClaimed  === undefined) user.stats.weeklyClaimed  = 0;
  if (user.stats.totalCoins     === undefined) user.stats.totalCoins     = 0;
  if (user.stats.totalXP        === undefined) user.stats.totalXP        = 0;
  if (!user.inventory)     user.inventory     = {};
  if (!user.inventory.frames)   user.inventory.frames   = ['default'];
  if (!user.inventory.fonts)    user.inventory.fonts    = ['default'];
  if (!user.inventory.equipped) user.inventory.equipped = { frame: 'default', font: 'default' };
  if (!user.coins)         user.coins         = 0;
  if (!user.xp)            user.xp            = 0;
  if (!user.level)         user.level         = 1;
  if (!user.streak)        user.streak        = 0;
}

// ─────────────────────────────────────────────────────────────
// VERIFICAÇÃO E DESBLOQUEIO
// BUG FIX: updateUser chamado apenas UMA vez ao final
// BUG FIX: try/catch por conquista para evitar crash em cadeia
// ─────────────────────────────────────────────────────────────

function checkAchievements(userId) {
  if (!userId) return [];

  let user;
  try {
    user = getUser(userId);
  } catch (err) {
    console.error('[ACH] Erro ao obter usuário:', err.message);
    return [];
  }

  if (!user) return [];

  // Garante estrutura antes de checar
  ensureUserStructure(user);

  const unlocked = [];
  let   modified = false;

  for (const [id, achievement] of Object.entries(ACHIEVEMENTS)) {
    // Já possui esta conquista?
    if (user.achievements.includes(id)) continue;

    // Verifica condição com proteção contra erro
    let conditionMet = false;
    try {
      conditionMet = achievement.check(user);
    } catch (err) {
      console.error(`[ACH] Erro na condição de ${id}:`, err.message);
      continue;
    }

    if (!conditionMet) continue;

    // Desbloqueia
    user.achievements.push(id);

    // Aplica recompensas
    if (achievement.reward.coins) {
      user.coins             = (user.coins || 0) + achievement.reward.coins;
      user.stats.totalCoins  = (user.stats.totalCoins || 0) + achievement.reward.coins;
    }

    if (achievement.reward.xp) {
      user.xp            = (user.xp || 0) + achievement.reward.xp;
      user.stats.totalXP = (user.stats.totalXP || 0) + achievement.reward.xp;
    }

    if (achievement.reward.item) {
      console.log(`[ACH] Item reward: ${achievement.reward.item} → ${userId.split('@')[0]}`);
    }

    unlocked.push(achievement);
    modified = true;

    console.log(`[ACH] ✅ ${userId.split('@')[0]} desbloqueou: ${achievement.name}`);
  }

  // Salva apenas uma vez se houve mudança
  if (modified) {
    try {
      updateUser(userId, user);
    } catch (err) {
      console.error('[ACH] Erro ao salvar após conquistas:', err.message);
    }
  }

  return unlocked;
}

// ─────────────────────────────────────────────────────────────
// UTILITÁRIOS
// ─────────────────────────────────────────────────────────────

function getUserAchievements(userId) {
  let user;
  try {
    user = getUser(userId);
  } catch (err) {
    return { owned: [], locked: [] };
  }

  ensureUserStructure(user);

  const owned  = user.achievements
    .map(id => ACHIEVEMENTS[id])
    .filter(Boolean);

  const locked = Object.values(ACHIEVEMENTS)
    .filter(a => !user.achievements.includes(a.id));

  return { owned, locked };
}

function getAchievementProgress(userId, achievementId) {
  const achievement = ACHIEVEMENTS[achievementId];
  if (!achievement) return null;

  let user;
  try {
    user = getUser(userId);
  } catch (err) {
    return null;
  }

  ensureUserStructure(user);

  const completed = user.achievements.includes(achievementId);
  return { achievement, completed, user };
}

module.exports = {
  ACHIEVEMENTS,
  checkAchievements,
  getUserAchievements,
  getAchievementProgress,
  ensureUserStructure,
};
