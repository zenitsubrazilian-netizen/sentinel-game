'use strict';

// ============================================================
// PERFIL v2.5.0
// ALTERAÇÃO v2.5.0: Exibe "Vergonha Pública" se ativa
// ============================================================

const { getUser, getRank, xpForLevel, CONFIG } = require('../utils/economy.js');
const { applyFont }                            = require('../utils/shop.js');
const { ensureUserStructure }                  = require('../utils/achievements.js');
const { getVergonha, getFraseVergonha, msParaHMS } = require('../utils/roleta.js');

// ─────────────────────────────────────────────────────────────
// DEFINIÇÃO DOS FRAMES
// ─────────────────────────────────────────────────────────────

const FRAMES = {
  default: {
    header:  (name) => [`╔════════════════╗`, `   👤 *PERFIL*`, `   ${name}`],
    side:    '   ',
    footer:  [`╚════════════════╝`],
  },
  shadow: {
    header:  (name) => [`▓▓▒▒ *SHADOW USER* ▒▒▓▓`, `█ ${name}`],
    side:    '█',
    footer:  [],
  },
  void: {
    header:  (name) => [`◤ *VOID ENTITY* ◢`, `✦ ${name}`],
    side:    '✦',
    footer:  [],
  },
  classic: {
    header:  (name) => [`╔════════════╗`, `   ${name}`],
    side:    '   ',
    footer:  [`╚════════════╝`],
  },
  thunder: {
    header:  (name) => [`╔⚡══════⚡╗`, `   ${name}`],
    side:    '   ',
    footer:  [`╚⚡══════⚡╝`],
  },
  root: {
    header:  (name) => [`[root@sentinel ~]#`, `> ${name}`],
    side:    '>',
    footer:  [],
  },
  galaxy: {
    header:  (name) => [`✦･ﾟ *GALAXY CORE* ･ﾟ✦`, `☄ ${name}`],
    side:    '☄',
    footer:  [],
  },
  ice: {
    header:  (name) => [`╔══ *ICE CORE* ══╗`, `❄ ${name}`],
    side:    '❄',
    footer:  [`╚══════════════╝`],
  },
  crimson: {
    header:  (name) => [`██ *CRIMSON* ██`, `█ ${name}`],
    side:    '█',
    footer:  [],
  },
  android: {
    header:  (name) => [`:: *ANDROID PROFILE* ::`, `ID: ${name}`],
    side:    '::',
    footer:  [],
  },
  eclipse: {
    header:  (name) => [`◢ *ECLIPSE* ◣`, `┃ ${name}`],
    side:    '┃',
    footer:  [`◤━━━━━━━━◥`],
  },
};

// ─────────────────────────────────────────────────────────────
// MONTA PERFIL COMPLETO
// ─────────────────────────────────────────────────────────────

function buildProfile({ frameId, fontId, name, level, rank, xp, xpNeeded, bar, pct,
  coins, coinName, coinSymbol, streak, messages, wins, dailys }) {

  const frame = FRAMES[frameId] || FRAMES['default'];
  const F     = (s) => applyFont(String(s ?? ''), fontId);
  const S     = frame.side;
  const streakSfx = streak !== 1 ? 'dias' : 'dia';

  return [
    ...frame.header(name),
    ``,
    `${S} ⭐ *Level:* ${F(level)}`,
    `${S} 🎖️ *Patente:* ${F(rank)}`,
    ``,
    `${S} 📊 *XP:* ${F(xp)} / ${F(xpNeeded)}`,
    `    [${F(bar)}] ${F(pct)}%`,
    ``,
    `${S} 💰 *${coinName}:* ${F(coins)} ${coinSymbol}`,
    `${S} 🔥 *Streak:* ${F(streak)} ${F(streakSfx)}`,
    ``,
    `${S} 💬 *Mensagens:* ${F(messages)}`,
    `${S} 🏆 *Minigames ganhos:* ${F(wins)}`,
    `${S} 🎁 *Dailys coletados:* ${F(dailys)}`,
    ...(frame.footer.length > 0 ? [``, ...frame.footer] : []),
  ].join('\n');
}

// ─────────────────────────────────────────────────────────────
// BLOCO DE VERGONHA PÚBLICA
// ─────────────────────────────────────────────────────────────

function buildVergonhaBlock(vergonhaData) {
  if (!vergonhaData) return null;

  const frase     = getFraseVergonha();
  const restante  = msParaHMS(vergonhaData.restante);

  return [
    ``,
    `╔══════════════════╗`,
    `   ☠️ *VERGONHA PÚBLICA*`,
    `╚══════════════════╝`,
    ``,
    `${frase.titulo}`,
    `${frase.texto}`,
    ``,
    `⏳ Expira em: *${restante}*`,
    ``,
    `_Girou a roleta. Se arrependeu. A história registrou._`,
  ].join('\n');
}

// ─────────────────────────────────────────────────────────────
// COMANDO
// ─────────────────────────────────────────────────────────────

module.exports = {
  name: 'perfil',

  execute: async ({ sock, from, sender, message }) => {

    // Resolve alvo
    const mentionedJids =
      message.message?.extendedTextMessage?.contextInfo?.mentionedJid || [];

    const targetJid = mentionedJids.length > 0 ? mentionedJids[0] : sender;
    const targetNum = targetJid
      .replace('@s.whatsapp.net', '')
      .replace('@lid', '');

    let user;
    try {
      user = getUser(targetJid);
    } catch (err) {
      console.error('[PERFIL] Erro ao obter usuário:', err.message);
      return sock.sendMessage(from, { text: '❌ Erro ao carregar perfil.' });
    }

    if (!user) {
      return sock.sendMessage(from, {
        text:     `⚠️ @${targetNum} ainda não tem perfil.\n\nEnvie mensagens para criar um!`,
        mentions: [targetJid],
      });
    }

    ensureUserStructure(user);

    const frameId    = user.inventory?.equipped?.frame || 'default';
    const fontId     = user.inventory?.equipped?.font  || 'default';
    const level      = user.level    || 1;
    const xp         = user.xp       || 0;
    const coins      = user.coins    || 0;
    const streak     = user.streak   || 0;
    const messages   = user.stats?.totalMessages ?? user.messages ?? 0;
    const wins       = user.stats?.minigamesWon  ?? 0;
    const dailys     = user.stats?.dailyClaimed  ?? 0;
    const rank       = getRank(level);
    const xpNeeded   = xpForLevel(level);
    const pct        = Math.min(100, Math.floor((xp / xpNeeded) * 100));
    const filled     = Math.floor(pct / 10);
    const bar        = '█'.repeat(filled) + '░'.repeat(10 - filled);
    const coinName   = CONFIG?.coinName   || 'Zenith Coins';
    const coinSymbol = CONFIG?.coinSymbol || 'Z¢';
    const styledName = applyFont(`@${targetNum}`, fontId);

    let body = buildProfile({
      frameId, fontId, name: styledName,
      level, rank, xp, xpNeeded, bar, pct,
      coins, coinName, coinSymbol,
      streak, messages, wins, dailys,
    });

    // ── Vergonha pública ─────────────────────────────────────
    try {
      const vergonhaData = getVergonha(targetJid);
      if (vergonhaData) {
        const blocoVergonha = buildVergonhaBlock(vergonhaData);
        if (blocoVergonha) body += '\n' + blocoVergonha;
      }
    } catch (err) {
      console.error('[PERFIL] Erro ao checar vergonha:', err.message);
    }

    await sock.sendMessage(from, {
      text:     body,
      mentions: [targetJid],
    });
  },
};
