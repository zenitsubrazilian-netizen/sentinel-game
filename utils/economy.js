'use strict';

const fs   = require('fs');
const path = require('path');

const DB_FILE = path.join(__dirname, '..', 'data', 'users.json');

const CONFIG = {
  xpCooldown:    30_000,
  minMessageLen: 5,
  xpPerMessage:  { min: 5, max: 15 },
  coinName:      'Zenith Coins',
  coinSymbol:    'Z¢',
  dailyReward:   { coins: 100, xp: 50 },
  weeklyReward:  { coins: 700, xp: 400 },
};

function xpForLevel(level) {
  return Math.floor(100 * Math.pow(level, 1.5));
}

function getRank(level) {
  if (level >= 100) return 'Void Master';
  if (level >= 75)  return 'Eclipse';
  if (level >= 50)  return 'Entidade';
  if (level >= 35)  return 'Supremo';
  if (level >= 25)  return 'Lendário';
  if (level >= 15)  return 'Elite';
  if (level >= 10)  return 'Ativo';
  if (level >= 5)   return 'Membro';
  return 'Iniciante';
}

function getStreakBonus(streak) {
  if (streak >= 30) return 1.20;
  if (streak >= 15) return 1.15;
  if (streak >= 7)  return 1.10;
  if (streak >= 3)  return 1.05;
  return 1.0;
}

function getDailyBonus(streak) {
  if (streak >= 30) return 2.0;
  if (streak >= 15) return 1.5;
  if (streak >= 7)  return 1.25;
  if (streak >= 3)  return 1.1;
  return 1.0;
}

let _cache  = null;
let _dirty  = false;
let _saving = false;

function loadDB() {
  if (_cache) return _cache;
  try {
    const dir = path.dirname(DB_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    if (!fs.existsSync(DB_FILE)) {
      fs.writeFileSync(DB_FILE, JSON.stringify({}, null, 2), 'utf-8');
      _cache = {};
      return _cache;
    }
    _cache = JSON.parse(fs.readFileSync(DB_FILE, 'utf-8'));
    return _cache;
  } catch (err) {
    console.error('[ECONOMY] Erro ao carregar DB:', err.message);
    if (!_cache) _cache = {};
    return _cache;
  }
}

function saveDB() {
  if (!_cache || !_dirty || _saving) return;
  _saving = true;
  try {
    const tmp = DB_FILE + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(_cache, null, 2), 'utf-8');
    fs.renameSync(tmp, DB_FILE);
    _dirty  = false;
    console.log('[ECONOMY] DB salvo com sucesso.');
  } catch (err) {
    console.error('[ECONOMY] Erro ao salvar DB:', err.message);
  } finally {
    _saving = false;
  }
}

setInterval(saveDB, 60_000);
process.on('SIGINT',  saveDB);
process.on('SIGTERM', saveDB);

function createUser(userId) {
  return {
    xp: 0, level: 1, coins: 0, streak: 0,
    lastDaily: null, lastWeekly: null, lastXP: 0, lastActive: Date.now(), messages: 0,
    inventory: {
      frames: ['default'], fonts: ['default'], relics: [], auras: [], boxes: [],
      equipped: { frame: 'default', font: 'default', aura: null, relic: null },
    },
    achievements: [],
    stats: {
      totalXP: 0, totalMessages: 0, totalCoins: 0,
      minigamesWon: 0, eventsWon: 0, dailyClaimed: 0, weeklyClaimed: 0,
    },
  };
}

function getUser(userId) {
  if (!userId) throw new Error('[ECONOMY] getUser: userId inválido');
  const db = loadDB();
  if (!db[userId]) { db[userId] = createUser(userId); _dirty = true; }
  const u = db[userId];
  if (!u.stats)     { u.stats     = createUser(userId).stats;     _dirty = true; }
  if (!u.inventory) { u.inventory = createUser(userId).inventory; _dirty = true; }
  return u;
}

function updateUser(userId, updates) {
  if (!userId) throw new Error('[ECONOMY] updateUser: userId inválido');
  const db   = loadDB();
  const user = getUser(userId);
  Object.assign(user, updates);
  db[userId] = user;
  _dirty = true;
  return user;
}

function canGainXP(user) {
  return (Date.now() - (user.lastXP || 0)) >= CONFIG.xpCooldown;
}

function addXP(userId, amount, source = 'message') {
  if (!userId || typeof amount !== 'number') {
    console.warn('[ECONOMY] addXP: parâmetros inválidos');
    return { xp: 0, leveledUp: null, newLevel: 1 };
  }
  try {
    const user    = getUser(userId);
    const bonus   = getStreakBonus(user.streak || 0);
    const finalXP = Math.max(0, Math.floor(amount * bonus));
    user.xp               = (user.xp || 0) + finalXP;
    user.stats.totalXP    = (user.stats.totalXP || 0) + finalXP;
    user.lastXP           = Date.now();
    user.lastActive       = Date.now();
    const leveledUp = checkLevelUp(user);
    updateUser(userId, user);
    console.log(`[ECONOMY] +${finalXP} XP → ${userId.split('@')[0]} (${source})`);
    return { xp: finalXP, leveledUp, newLevel: user.level };
  } catch (err) {
    console.error('[ECONOMY] addXP error:', err.message);
    return { xp: 0, leveledUp: null, newLevel: 1 };
  }
}

// ─── NOVO: remove XP (mínimo 0, não vai negativo) ────────────────────────────
function removeXP(userId, amount) {
  if (!userId || typeof amount !== 'number' || amount <= 0) {
    console.warn('[ECONOMY] removeXP: parâmetros inválidos');
    return;
  }
  try {
    const user  = getUser(userId);
    const antes = user.xp || 0;
    user.xp     = Math.max(0, antes - amount);
    updateUser(userId, user);
    console.log(`[ECONOMY] -${amount} XP → ${userId.split('@')[0]} (${antes} → ${user.xp})`);
  } catch (err) {
    console.error('[ECONOMY] removeXP error:', err.message);
  }
}

function checkLevelUp(user) {
  let lastResult = null;
  let iterations = 0;
  while (iterations++ < 100) {
    const xpNeeded = xpForLevel(user.level);
    if ((user.xp || 0) < xpNeeded) break;
    user.xp    -= xpNeeded;
    user.level  = (user.level || 1) + 1;
    const reward = user.level * 50;
    user.coins            = (user.coins || 0) + reward;
    user.stats.totalCoins = (user.stats.totalCoins || 0) + reward;
    console.log(`[ECONOMY] Level UP! Nível ${user.level} (+${reward} moedas)`);
    lastResult = { level: user.level, reward, rank: getRank(user.level) };
  }
  return lastResult;
}

function addCoins(userId, amount, source = 'system') {
  if (!userId || typeof amount !== 'number' || amount < 0) {
    console.warn(`[ECONOMY] addCoins: parâmetros inválidos`);
    return null;
  }
  try {
    const user = getUser(userId);
    user.coins            = (user.coins || 0) + Math.floor(amount);
    user.stats.totalCoins = (user.stats.totalCoins || 0) + Math.floor(amount);
    updateUser(userId, user);
    return user.coins;
  } catch (err) {
    console.error('[ECONOMY] addCoins error:', err.message);
    return null;
  }
}

function removeCoins(userId, amount) {
  if (!userId || typeof amount !== 'number' || amount <= 0)
    return { ok: false, reason: 'parâmetros inválidos' };
  try {
    const user = getUser(userId);
    const bal  = user.coins || 0;
    if (bal < amount) return { ok: false, reason: 'saldo insuficiente', balance: bal };
    user.coins = bal - Math.floor(amount);
    updateUser(userId, user);
    return { ok: true, balance: user.coins };
  } catch (err) {
    console.error('[ECONOMY] removeCoins error:', err.message);
    return { ok: false, reason: err.message };
  }
}

function getCoins(userId) {
  try { return getUser(userId).coins || 0; } catch { return 0; }
}

function transferCoins(fromId, toId, amount) {
  if (!fromId || !toId || fromId === toId || amount <= 0)
    return { ok: false, reason: 'parâmetros inválidos' };
  const result = removeCoins(fromId, amount);
  if (!result.ok) return result;
  addCoins(toId, amount, 'transfer');
  return { ok: true };
}

function updateStreak(userId) {
  try {
    const user       = getUser(userId);
    const now        = Date.now();
    const lastActive = user.lastActive || 0;
    const dayMs      = 24 * 60 * 60 * 1000;
    const diff       = now - lastActive;
    if (diff < dayMs * 2) {
      if (diff >= dayMs) user.streak = (user.streak || 0) + 1;
    } else {
      user.streak = 0;
    }
    user.lastActive = now;
    updateUser(userId, user);
    return user.streak;
  } catch (err) {
    console.error('[ECONOMY] updateStreak error:', err.message);
    return 0;
  }
}

function canClaimDaily(user) {
  if (!user.lastDaily) return true;
  return Date.now() - user.lastDaily >= 24 * 60 * 60 * 1000;
}

function claimDaily(userId) {
  try {
    const user = getUser(userId);
    if (!canClaimDaily(user)) {
      const remaining = (24 * 60 * 60 * 1000) - (Date.now() - user.lastDaily);
      return { error: 'cooldown', hours: Math.floor(remaining / 3600000), minutes: Math.floor((remaining % 3600000) / 60000) };
    }
    updateStreak(userId);
    const freshUser  = getUser(userId);
    const bonus      = getDailyBonus(freshUser.streak || 0);
    const finalCoins = Math.floor(CONFIG.dailyReward.coins * bonus);
    const finalXP    = Math.floor(CONFIG.dailyReward.xp    * bonus);
    freshUser.coins              = (freshUser.coins || 0) + finalCoins;
    freshUser.xp                 = (freshUser.xp    || 0) + finalXP;
    freshUser.stats.totalCoins   = (freshUser.stats.totalCoins || 0) + finalCoins;
    freshUser.stats.totalXP      = (freshUser.stats.totalXP    || 0) + finalXP;
    freshUser.stats.dailyClaimed = (freshUser.stats.dailyClaimed || 0) + 1;
    freshUser.lastDaily           = Date.now();
    const leveledUp = checkLevelUp(freshUser);
    updateUser(userId, freshUser);
    return { ok: true, coins: finalCoins, xp: finalXP, streak: freshUser.streak, bonus, leveledUp };
  } catch (err) {
    console.error('[ECONOMY] claimDaily error:', err.message);
    return { error: 'internal', message: err.message };
  }
}

function canClaimWeekly(user) {
  if (!user.lastWeekly) return true;
  return Date.now() - user.lastWeekly >= 7 * 24 * 60 * 60 * 1000;
}

function claimWeekly(userId) {
  try {
    const user = getUser(userId);
    if (!canClaimWeekly(user)) {
      const remaining = (7 * 24 * 60 * 60 * 1000) - (Date.now() - user.lastWeekly);
      return { error: 'cooldown', days: Math.floor(remaining / 86400000), hours: Math.floor((remaining % 86400000) / 3600000) };
    }
    updateStreak(userId);
    const freshUser  = getUser(userId);
    const bonus      = getDailyBonus(freshUser.streak || 0);
    const finalCoins = Math.floor(CONFIG.weeklyReward.coins * bonus);
    const finalXP    = Math.floor(CONFIG.weeklyReward.xp    * bonus);
    freshUser.coins               = (freshUser.coins || 0) + finalCoins;
    freshUser.xp                  = (freshUser.xp    || 0) + finalXP;
    freshUser.stats.totalCoins    = (freshUser.stats.totalCoins || 0) + finalCoins;
    freshUser.stats.totalXP       = (freshUser.stats.totalXP    || 0) + finalXP;
    freshUser.stats.weeklyClaimed = (freshUser.stats.weeklyClaimed || 0) + 1;
    freshUser.lastWeekly           = Date.now();
    const leveledUp = checkLevelUp(freshUser);
    updateUser(userId, freshUser);
    return { ok: true, coins: finalCoins, xp: finalXP, streak: freshUser.streak, bonus, leveledUp };
  } catch (err) {
    console.error('[ECONOMY] claimWeekly error:', err.message);
    return { error: 'internal', message: err.message };
  }
}

function getTopUsers(limit = 10) {
  try {
    const db = loadDB();
    return Object.entries(db)
      .map(([id, data]) => ({ id, level: data.level || 1, xp: data.xp || 0, coins: data.coins || 0, totalXP: data.stats?.totalXP ?? 0 }))
      .sort((a, b) => b.level !== a.level ? b.level - a.level : b.totalXP - a.totalXP)
      .slice(0, limit);
  } catch (err) {
    console.error('[ECONOMY] getTopUsers error:', err.message);
    return [];
  }
}

module.exports = {
  CONFIG, xpForLevel, getRank, getStreakBonus, getDailyBonus,
  getUser, updateUser, canGainXP, addXP, removeXP,
  addCoins, removeCoins, getCoins, transferCoins,
  updateStreak, canClaimDaily, claimDaily, canClaimWeekly, claimWeekly,
  getTopUsers, saveDB,
};
