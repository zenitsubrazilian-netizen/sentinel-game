'use strict';

const fs   = require('fs');
const path = require('path');

const { MAIN_GROUP, SENTINEL_PREFIX } = require('./config/system.js');
const config = require('./config/config.js');

const { removeBan }                            = require('./utils/moderation.js');
const { isMuted, incrementMessageCount, removeMute } = require('./utils/mute.js');
const { checkSpam }                            = require('./utils/antispam.js');
const { handleAIMessage }                      = require('./events/aiHandler.js');
const { startTyping, stopTyping }              = require('./utils/presence.js');
const { captureMessage }                       = require('./utils/groupMemory.js');
const { throttledSend }                        = require('./utils/rateLimiter.js');
const { checkAdultLink }                       = require('./utils/antiadult.js');

const { handleForcaReply }  = require('./events/forcaHandler.js');
const { handleDuelReply }   = require('./events/duelHandler.js');
const { handleXPGain }      = require('./events/xpHandler.js');
const { handleQuizReply }   = require('./commands/quiz.js');

// ── [AFK] importa utilitários de AFK
const { isAfk, getAfk, removeAfk, formatAusente } = require('./utils/afk.js');

// ── GAME HANDLER — importado aqui para ser chamado ANTES da IA
const { handleGameReply } = require('./events/gameHandler.js');

// ─────────────────────────────────────────────────────────────
// COMUNIDADE — grupos oficiais e regras por grupo
// ─────────────────────────────────────────────────────────────

const GROUPS = {
  BATE_PAPO:  '120363426463059849@g.us',
  MINIGAMES:  '120363409922944526@g.us',
  FIGURINHAS: '120363427141816341@g.us',
  BOT:        '120363407851845223@g.us',
  EDITS:      '120363426207941515@g.us',
};

// Apenas esses grupos são atendidos pelo bot
const ALLOWED_GROUPS = new Set(Object.values(GROUPS));

// Comandos exclusivos do grupo de minigames
const MINIGAME_COMMANDS = new Set([
  'forca', 'duel', 'duo', 'quiz', 'roleta',
  'apostar', 'trabalhar', 'crime', 'pescar', 'minerar',
  'caixa', 'abrir',
]);

const MINIGAMES_GROUP_NAME = '🎮 MINIGAMES';

// ─────────────────────────────────────────────────────────────
// DEDUPLICAÇÃO
// ─────────────────────────────────────────────────────────────

const processedMessages = new Map();
const MSG_DEDUPE_TTL    = 5 * 60_000;

setInterval(() => {
  const cutoff = Date.now() - MSG_DEDUPE_TTL;
  for (const [id, ts] of processedMessages.entries()) {
    if (ts < cutoff) processedMessages.delete(id);
  }
}, 60_000);

function isDuplicate(msgId) {
  if (!msgId) return false;
  if (processedMessages.has(msgId)) return true;
  processedMessages.set(msgId, Date.now());
  return false;
}

// ─────────────────────────────────────────────────────────────
// FILTRO DE MENSAGENS ANTIGAS
// ─────────────────────────────────────────────────────────────

const MAX_MSG_AGE_MS = 2 * 60_000;

function isStale(message) {
  const raw = message.messageTimestamp;
  if (!raw) return false;
  const ts = (typeof raw === 'object' ? (raw.low ?? raw.high) : raw) * 1000;
  return Date.now() - ts > MAX_MSG_AGE_MS;
}

// ─────────────────────────────────────────────────────────────
// PROXY DO SOCK
// ─────────────────────────────────────────────────────────────

function wrapSock(sock, originalMessage) {
  return new Proxy(sock, {
    get(target, prop) {
      if (prop !== 'sendMessage') return target[prop];

      return (jid, content, options = {}) => {
        if (content.delete || content.react) {
          return target.sendMessage(jid, content, options);
        }

        if (!options.quoted) {
          options = { ...options, quoted: originalMessage };
        }

        if (typeof content.text === 'string' && !content.text.startsWith(SENTINEL_PREFIX)) {
          content = { ...content, text: SENTINEL_PREFIX + content.text };
        }

        if (typeof content.caption === 'string' && !content.caption.startsWith(SENTINEL_PREFIX)) {
          content = { ...content, caption: SENTINEL_PREFIX + content.caption };
        }

        return throttledSend(jid, () => target.sendMessage(jid, content, options));
      };
    },
  });
}

// ─────────────────────────────────────────────────────────────
// PENDING UNBAN
// ─────────────────────────────────────────────────────────────

const pendingUnban = new Map();

setInterval(() => {
  const now = Date.now();
  for (const [key, value] of pendingUnban.entries()) {
    if (now > value.expiresAt) pendingUnban.delete(key);
  }
}, 120_000);

// ─────────────────────────────────────────────────────────────
// [AFK] HELPER — coleta JIDs mencionados na mensagem
// ─────────────────────────────────────────────────────────────

function getMentionedJids(msgContent, botJid) {
  const mentioned = new Set();

  const explicitMentions =
    msgContent?.extendedTextMessage?.contextInfo?.mentionedJid ?? [];
  for (const jid of explicitMentions) mentioned.add(jid);

  const quotedParticipant =
    msgContent?.extendedTextMessage?.contextInfo?.participant ?? null;

  if (quotedParticipant && quotedParticipant !== botJid) {
    mentioned.add(quotedParticipant);
  }

  return [...mentioned];
}

// ─────────────────────────────────────────────────────────────
// HANDLER PRINCIPAL
// ─────────────────────────────────────────────────────────────

async function handleMessage(sock, message) {
  const { key, message: msgContent } = message;

  if (!msgContent)                          return;
  if (key.remoteJid === 'status@broadcast') return;
  if (!key.remoteJid)                       return;
  if (key.fromMe)                           return;

  const from    = key.remoteJid;
  const isGroup = from.endsWith('@g.us');

  // ── Whitelist: só atende os grupos oficiais da comunidade
  if (isGroup && !ALLOWED_GROUPS.has(from)) return;

  // ── Newsletters do WhatsApp são ignoradas
  if (!isGroup && from.endsWith('@newsletter')) return;

  if (isDuplicate(key.id)) {
    console.log(`[HANDLER] Duplicata ignorada: ${key.id}`);
    return;
  }

  if (isStale(message)) {
    console.log(`[HANDLER] Mensagem antiga ignorada: ${key.id}`);
    return;
  }

  const sender = isGroup ? key.participant : from;
  const wsock  = wrapSock(sock, message);

  // ── MUTE
  if (isGroup && sender) {
    let muteData;
    try { muteData = isMuted(from, sender); } catch { muteData = null; }

    if (muteData) {
      try { await wsock.sendMessage(from, { delete: key }); } catch {}

      let count = 0;
      try { count = await incrementMessageCount(from, sender); } catch {}

      const senderNum = sender.replace('@s.whatsapp.net', '').replace('@lid', '');
      console.log(`[MUTE] ${senderNum} tentou enviar (${count}/3)`);

      if (count >= 3) {
        try {
          await sock.groupParticipantsUpdate(from, [sender], 'remove');
          await removeMute(from, sender);
          await wsock.sendMessage(from, {
            text:     `@${sender.split('@')[0]} foi removido por desrespeitar o mute.`,
            mentions: [sender],
          });
        } catch {}
      }
      return;
    }
  }

  // ── ANTI-SPAM (desativado no grupo de figurinhas)
  if (isGroup && sender && from !== GROUPS.FIGURINHAS) {
    try {
      const spamDetected = await checkSpam(wsock, message, from, sender);
      if (spamDetected) return;
    } catch (err) {
      console.error('[HANDLER] Erro no anti-spam:', err.message);
    }
  }

  // ── ANTI-LINK ADULTO
  if (isGroup && sender) {
    const rawText =
      msgContent?.conversation ||
      msgContent?.extendedTextMessage?.text ||
      msgContent?.imageMessage?.caption ||
      msgContent?.videoMessage?.caption ||
      '';

    if (rawText) {
      try {
        const blocked = await checkAdultLink(sock, message, from, sender, rawText);
        if (blocked) return;
      } catch (err) {
        console.error('[HANDLER] Erro no antiadult:', err.message);
      }
    }
  }

  // ── EXTRAÇÃO DE TEXTO
  const text =
    msgContent?.conversation ||
    msgContent?.extendedTextMessage?.text ||
    msgContent?.imageMessage?.caption ||
    msgContent?.videoMessage?.caption ||
    msgContent?.documentMessage?.caption ||
    msgContent?.documentWithCaptionMessage?.message?.documentMessage?.caption ||
    '';

  if (!text.trim()) return;

  const senderNum  = sender ? sender.replace('@s.whatsapp.net', '').replace('@lid', '') : '';
  const senderName = message.pushName || senderNum;
  const body       = text.trim();

  // ── [AFK] AUTO-REMOVE: usuário enviou mensagem → sai do AFK automaticamente
  if (sender && isAfk(sender)) {
    const isSettingAfk = body.toLowerCase().startsWith(`${config.prefix}afk`);

    if (!isSettingAfk) {
      const afkData = getAfk(sender);
      const ausente = formatAusente(afkData.since);
      removeAfk(sender);
      console.log(`[AFK] ${senderNum} voltou (ausente por ${ausente})`);

      try {
        await wsock.sendMessage(from, {
          text:     `Bem-vindo de volta, @${senderNum}! 👋\nSeu AFK foi removido automaticamente. _(ausente por ${ausente})_`,
          mentions: [sender],
        });
      } catch (err) {
        console.error('[AFK] Erro ao notificar retorno:', err.message);
      }
    }
  }

  // ── [AFK] VERIFICAR MENÇÕES
  if (sender && !body.startsWith(config.prefix)) {
    try {
      const botJid        = sock.user?.id ?? null;
      const mentionedJids = getMentionedJids(msgContent, botJid);

      for (const mentionedJid of mentionedJids) {
        if (mentionedJid === sender) continue;

        if (isAfk(mentionedJid)) {
          const afkData    = getAfk(mentionedJid);
          const ausente    = formatAusente(afkData.since);
          const afkName    = afkData.name || mentionedJid.replace('@s.whatsapp.net', '').replace('@lid', '');
          const motivoLine = afkData.reason ? `\n*Motivo:* ${afkData.reason}` : '';

          await wsock.sendMessage(from, {
            text: `⚠️ *${afkName}* está AFK no momento.${motivoLine}\n_(ausente há ${ausente})_`,
          });

          console.log(`[AFK] ${senderNum} mencionou ${afkName} que está AFK`);
        }
      }
    } catch (err) {
      console.error('[AFK] Erro ao checar menções:', err.message);
    }
  }

  // ── CAPTURA PASSIVA
  if (isGroup && sender) {
    captureMessage(from, sender, senderName, body).catch(err => {
      console.error('[HANDLER] Erro na captura:', err.message);
    });
  }

  // ── XP PASSIVO
  if (isGroup && sender && !body.startsWith(config.prefix)) {
    try {
      await handleXPGain(sock, message, from, sender, body);
    } catch (err) {
      console.error('[HANDLER] Erro no XP passivo:', err.message);
    }
  }

  // ─────────────────────────────────────────────────────────
  // GAME HANDLERS — exclusivos do grupo de minigames
  //
  // handleGameReply processa sessões ativas (respostas dentro
  // de minigames em andamento). Só faz sentido no grupo certo.
  // ─────────────────────────────────────────────────────────

  if (from === GROUPS.MINIGAMES) {
    try {
      const handledByGame = await handleGameReply(wsock, message, from, sender, body);
      if (handledByGame) {
        console.log(`[HANDLER] Resposta de minigame processada: ${senderNum}`);
        return;
      }
    } catch (err) {
      console.error('[HANDLER] Erro no gameReply:', err.message, err.stack);
    }

    try {
      const handledByQuiz = await handleQuizReply(wsock, message, from, sender, body);
      if (handledByQuiz) return;
    } catch (err) {
      console.error('[HANDLER] Erro no quizReply:', err.message);
    }

    try {
      const handledByForca = await handleForcaReply(wsock, message, from, sender, body);
      if (handledByForca) return;
    } catch (err) {
      console.error('[HANDLER] Erro no forcaReply:', err.message);
    }

    try {
      const handledByDuel = await handleDuelReply(wsock, message, from, sender, body);
      if (handledByDuel) return;
    } catch (err) {
      console.error('[HANDLER] Erro no duelReply:', err.message);
    }

    try {
      const handledByDuo = await handleDuoReply(wsock, message, from, sender, body);
      if (handledByDuo) return;
    } catch (err) {
      console.error('[HANDLER] Erro no duoReply:', err.message);
    }
  }

  // ── IA
  // No grupo 🤖 BOT, a IA responde todas as mensagens automaticamente
  // (passa autoRespond=true para o aiHandler).
  // Nos demais grupos, responde apenas quando chamada normalmente.
  try {
    const autoRespond = (from === GROUPS.BOT && !body.startsWith(config.prefix));
    const aiHandled   = await handleAIMessage(wsock, message, from, sender, body, senderNum, autoRespond);
    if (aiHandled) return;
  } catch (err) {
    console.error('[HANDLER] Erro no aiHandler:', err.message);
  }

  // ── COMANDOS
  if (!body.startsWith(config.prefix)) return;

  const args        = body.slice(config.prefix.length).trim().split(/\s+/);
  const commandName = args.shift().toLowerCase();
  const localTime   = new Date().toLocaleTimeString('pt-BR');

  console.log(
    `[${localTime}] Comando: ${config.prefix}${commandName}` +
    ` | De: ${senderNum} | Em: ${isGroup ? 'Grupo' : 'Privado'}`
  );

  // ── Bloqueia minigames fora do grupo correto
  if (MINIGAME_COMMANDS.has(commandName) && from !== GROUPS.MINIGAMES) {
    await wsock.sendMessage(from, {
      text: `🎮 Os comandos de minigame só funcionam no grupo *${MINIGAMES_GROUP_NAME}*.\nVá pra lá e tente de novo.`,
    });
    return;
  }

  const commandPath = path.join(__dirname, 'commands', `${commandName}.js`);

  if (!fs.existsSync(commandPath)) {
    console.log(`[HANDLER] Comando não encontrado: ${commandName}`);
    return;
  }

  await startTyping(wsock, from);

  try {
    const command = require(commandPath);
    await command.execute({
      sock: wsock,
      message,
      from,
      sender,
      senderNum,
      args,
      text,
      isGroup,
      config,
      pendingUnban,
    });
  } catch (err) {
    console.error(`[HANDLER] Erro ao executar '${commandName}':`, err.message);
    if (err.stack) console.error(err.stack);
  } finally {
    await stopTyping(wsock, from);
  }
}

module.exports = { handleMessage };
