'use strict';
// ============================================================
// INDEX.JS — Sentinel-Bot v2.2.0
// ============================================================

const {
  default: makeWASocket,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
  isJidBroadcast,
} = require('@whiskeysockets/baileys');

const fs   = require('fs');
const path = require('path');
const pino = require('pino');

const { VERSION, MAIN_GROUP } = require('./config/system.js');
const config = require('./config/config.js');
const { handleMessage } = require('./handler.js');
const { handleConnectionUpdate } = require('./events/connection.js');
const { handleGroupUpdate } = require('./events/groupUpdate.js');
const { handleWelcome } = require('./events/welcomeHandler.js');
const { startInviteReminder } = require('./utils/inviteReminder.js');
const { startMuteMonitor }    = require('./utils/muteMonitor.js');
const { saveDB } = require('./utils/economy.js');
const { shouldSendOnline, clearOnlineFlag, setOnlineFlag } = require('./utils/onlineFlag.js');

const silentLogger = pino({ level: 'silent' });


const AUTH_FOLDER  = path.join(__dirname, 'auth');

let wsock              = null;
let _isConnected       = false;   // flag de estado real da conexão

// ─────────────────────────────────────────────────────────────
// MENSAGEM DE STATUS ONLINE
// ─────────────────────────────────────────────────────────────
const MSG_ONLINE = [
  `━━━━━━━━━━━━━━━━━━`,
  `🟢 *SENTINEL-BOT ONLINE*`,
  `━━━━━━━━━━━━━━━━━━`,
  ``,
  `✅ Bot de volta ao ar!`,
  ``,
  `⚙️ Versão: *${VERSION}*`,
  `🤖 Sistemas ativos:`,
  `  • IA integrada 🧠`,
  `  • Anti-spam 🚨`,
  `  • Anti-link adulto 🔞`,
  `  • Scheduler 23h/05h ⏰`,
  `  • Sistema de Level & XP 📈`,
  `  • Economia & Loja 💰`,
  `  • Minigames 🎮`,
  ``,
  `💬 Pode interagir normalmente!`,
  `━━━━━━━━━━━━━━━━━━`,
].join('\n');

// ─────────────────────────────────────────────────────────────
// MENSAGEM DE STATUS OFFLINE
// ─────────────────────────────────────────────────────────────
const MSG_OFFLINE = [
  `━━━━━━━━━━━━━━━━━━`,
  `🔴 *SENTINEL-BOT OFFLINE*`,
  `━━━━━━━━━━━━━━━━━━`,
  ``,
  `⚙️ O bot foi desligado temporariamente para:`,
  ``,
  `🔧 Manutenção`,
  `🐛 Correção de bugs`,
  `🚀 Atualizações`,
  ``,
  `⏳ Voltará em breve!`,
  `━━━━━━━━━━━━━━━━━━`,
].join('\n');

// ─────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Tenta buscar participantes até 4 vezes com backoff progressivo.
// Isso resolve a falha quando o grupo ainda está carregando.
async function getGroupParticipants(sock, groupId, attempts = 4) {
  for (let i = 0; i < attempts; i++) {
    try {
      const metadata = await sock.groupMetadata(groupId);
      return metadata.participants.map(p => p.id);
    } catch (err) {
      const wait = (i + 1) * 8000; // 8s, 16s, 24s, 32s
      console.warn(`[INDEX] groupMetadata falhou (tentativa ${i + 1}/${attempts}): ${err.message}`);
      if (i < attempts - 1) {
        console.log(`[INDEX] Aguardando ${wait / 1000}s antes de tentar novamente...`);
        await sleep(wait);
      }
    }
  }
  console.error('[INDEX] Não foi possível buscar participantes após todas as tentativas.');
  return [];
}

async function sendStatusMessage(sock, groupId, text) {
  try {
    const participants = await getGroupParticipants(sock, groupId);
    if (participants.length === 0) {
      // Envia mesmo sem menções para não suprimir o aviso
      await sock.sendMessage(groupId, { text });
      console.log('[INDEX] Status enviado (sem menções — grupo ainda não carregado)');
      return;
    }
    await sock.sendMessage(groupId, { text, mentions: participants });
    console.log(`[INDEX] Status enviado (${participants.length} menções)`);
  } catch (err) {
    console.error('[INDEX] Erro ao enviar status:', err.message);
  }
}

// ─────────────────────────────────────────────────────────────
// FECHA SOCKET ANTERIOR
// ─────────────────────────────────────────────────────────────
function closeExistingSocket() {
  if (!wsock) return;
  try {
    wsock.ev.removeAllListeners();
    if (wsock.ws && typeof wsock.ws.close === 'function') wsock.ws.close();
    console.log('[SISTEMA] 🔌 Socket anterior fechado');
  } catch (err) {
    console.warn('[SISTEMA] Aviso ao fechar socket:', err.message);
  }
  wsock        = null;
  _isConnected = false;
}

// ─────────────────────────────────────────────────────────────
// SHUTDOWN GRACIOSO
// ─────────────────────────────────────────────────────────────
async function gracefulShutdown(signal) {
  console.log(`\n[SISTEMA] Sinal ${signal} recebido. Encerrando...`);

  try { saveDB(); } catch (_) {}
  setOnlineFlag(); // Ctrl+C → recria flag para próximo ./start.sh

  if (wsock) {
    try {
      console.log('[SISTEMA] 📢 Enviando aviso de offline...');
      const participants = await getGroupParticipants(wsock, MAIN_GROUP);
      await wsock.sendMessage(MAIN_GROUP, {
        text:     MSG_OFFLINE,
        mentions: participants,
      });
      console.log('[SISTEMA] ✅ Aviso de offline enviado.');
    } catch (err) {
      console.error('[SISTEMA] Erro ao enviar offline:', err.message);
    }

    try {
      wsock.ev.removeAllListeners();
      if (wsock.ws && typeof wsock.ws.close === 'function') wsock.ws.close();
    } catch (_) {}
  }

  setTimeout(() => process.exit(0), 2500);
}

// ─────────────────────────────────────────────────────────────
// ESTABILIDADE DO PROCESSO
// ─────────────────────────────────────────────────────────────

process.on('uncaughtException', err => {
  console.error('[CRÍTICO] uncaughtException:', err.message);
  console.error(err.stack);
  // Não encerra o processo — apenas loga
});

process.on('unhandledRejection', reason => {
  const msg = reason instanceof Error ? reason.message : String(reason);
  console.error('[CRÍTICO] unhandledRejection:', msg);
  // Não encerra o processo — apenas loga
});

process.on('SIGPIPE', () => {});
process.on('SIGINT',  () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

// ─────────────────────────────────────────────────────────────
// WATCHDOG
// Só reinicia se realmente desconectado E inativo.
// Nunca interrompe uma conexão ativa e funcional.
// ─────────────────────────────────────────────────────────────

let lastActivity        = Date.now();
const WATCHDOG_INTERVAL = 60_000;        // verifica a cada 1 min
const WATCHDOG_TIMEOUT  = 10 * 60_000;  // 10 min sem atividade (antes era 5)

function touchActivity() {
  lastActivity = Date.now();
}

setInterval(() => {
  // Se há conexão ativa, apenas renova o timestamp e não faz nada
  if (_isConnected) {
    touchActivity();
    return;
  }

  const idle = Date.now() - lastActivity;
  if (idle > WATCHDOG_TIMEOUT) {
    console.warn(`[WATCHDOG] Desconectado e inativo por ${(idle / 60000).toFixed(1)} min. Reiniciando...`);
    closeExistingSocket();
    startBot().catch(err => console.error('[WATCHDOG] Erro:', err.message));
    lastActivity = Date.now();
  }
}, WATCHDOG_INTERVAL);

// ─────────────────────────────────────────────────────────────
// INICIALIZAÇÃO DO BOT
// ─────────────────────────────────────────────────────────────

let _reconnectDelay = 5_000;  // começa em 5s, cresce com backoff

async function startBot() {
  // Reseta watchdog para que o tempo de conexão inicial não o acione
  touchActivity();

  let version;
  try {
    const result = await fetchLatestBaileysVersion();
    version = result.version;
    console.log(`[SISTEMA] Protocolo WA: ${version.join('.')}`);
  } catch (err) {
    console.error('[SISTEMA] Erro ao buscar versão Baileys:', err.message);
    version = [2, 3000, 0];
  }

  const { state, saveCreds } = await useMultiFileAuthState(AUTH_FOLDER);

  const sock = makeWASocket({
    version,
    logger: silentLogger,
    auth: {
      creds: state.creds,
      keys:  makeCacheableSignalKeyStore(state.keys, silentLogger),
    },
    printQRInTerminal:   false,
    markOnlineOnConnect: false,
    syncFullHistory:     false,
    connectTimeoutMs:    60_000,
    keepAliveIntervalMs: 25_000,
    shouldIgnoreJid:     jid => isJidBroadcast(jid),
    getMessage:          async () => ({ conversation: '' }),
  });

  wsock = sock;

  // ── Pareamento por código (se não registrado)
  if (!sock.authState.creds.registered) {
    await sleep(3000);
    const phoneNumber = config.botNumber.replace(/[^0-9]/g, '');
    try {
      const code = await sock.requestPairingCode(phoneNumber);
      console.log('');
      console.log('╔══════════════════════════════════════╗');
      console.log('║       🔐 CÓDIGO DE PAREAMENTO         ║');
      console.log('║                                      ║');
      console.log(`║   Código: ${code}                  ║`);
      console.log('║                                      ║');
      console.log('║  1. WhatsApp → Configurações         ║');
      console.log('║  2. Dispositivos conectados          ║');
      console.log('║  3. Conectar dispositivo             ║');
      console.log('║  4. Código do telefone               ║');
      console.log(`║  5. Digite: ${code}               ║`);
      console.log('╚══════════════════════════════════════╝');
      console.log('');
    } catch (error) {
      console.error('[PAIRING] Erro ao solicitar código:', error.message);
    }
  }

  // ── Eventos
  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', async update => {
    touchActivity();

    try {
      handleConnectionUpdate(update, startBot);
    } catch (err) {
      console.error('[INDEX] Erro no connectionUpdate:', err.message);
    }

    if (update.connection === 'open') {
      _isConnected    = true;
      _reconnectDelay = 5_000; // reseta backoff após conexão bem-sucedida
      console.log('[SISTEMA] ✅ Conectado ao WhatsApp');

      if (!global._schedulerStarted) {
        try {
          startScheduler([MAIN_GROUP]);
          global._schedulerStarted = true;
          console.log('[SISTEMA] 📅 Scheduler iniciado');
        } catch (err) {
          console.error('[SISTEMA] Erro ao iniciar scheduler:', err.message);
        }
      }

      if (!global._inviteReminderStarted) {
        try {
          startInviteReminder(() => wsock, MAIN_GROUP);
          global._inviteReminderStarted = true;
          console.log('[SISTEMA] 📣 Invite reminder iniciado');
        } catch (err) {
          console.error('[SISTEMA] Erro ao iniciar invite reminder:', err.message);
        }
      }

      if (shouldSendOnline()) {
        clearOnlineFlag(); // apaga após enviar

        // Aguarda 20s para o WhatsApp terminar de carregar os metadados
        // do grupo antes de tentar buscar participantes.
        console.log('[SISTEMA] ⏳ Aguardando 20s para o grupo carregar...');
        setTimeout(async () => {
          console.log('[SISTEMA] 📢 Enviando aviso de online...');
          await sendStatusMessage(sock, MAIN_GROUP, MSG_ONLINE);
        }, 20_000);

      } else {
        console.log('[SISTEMA] 🔄 Reconexão automática — aviso de online suprimido');
      }
    }

    if (update.connection === 'close') {
      _isConnected = false;
      const reason = update.lastDisconnect?.error?.output?.statusCode;
      console.log(`[SISTEMA] Conexão encerrada — código: ${reason}`);

      if (reason === 401 || reason === 428) {
        clearOnlineFlag(); // apaga após enviar
        console.log('[SISTEMA] Sessão encerrada — flag recriada para próximo login.');
      }

    }
  });

  sock.ev.on('messages.upsert', async upsert => {
    console.log(`[DEBUG] upsert | type: ${upsert.type} | total: ${upsert.messages?.length}`);

    if (upsert.type !== 'notify') return;
    touchActivity();

    for (const message of upsert.messages) {
      const from       = message.key?.remoteJid;
      const hasContent = !!message.message;
      const fromMe     = message.key?.fromMe;
      console.log(`[DEBUG] msg | from: ${from} | hasContent: ${hasContent} | fromMe: ${fromMe}`);

      try {
        await handleMessage(sock, message);
      } catch (error) {
        console.error('[INDEX] Erro ao processar mensagem:', error.message);
        if (error.stack) console.error(error.stack);
      }
    }
  });

  sock.ev.on('group-participants.update', async update => {
    touchActivity();
    try {
      await handleWelcome(sock, update);
    } catch (err) {
      console.error('[INDEX] Erro no welcome:', err.message);
    }
    try {
      await handleGroupUpdate(sock, update);
    } catch (err) {
      console.error('[INDEX] Erro no groupUpdate:', err.message);
    }
  });

  return sock;
}

// ─────────────────────────────────────────────────────────────
// START
// ─────────────────────────────────────────────────────────────

console.log('');
console.log('╔════════════════════════════════════╗');
console.log(`║     🛡️  SENTINEL-BOT v${VERSION}        ║`);
console.log('║     Sistema de Gamificação Ativo   ║');
console.log('╚════════════════════════════════════╝');
console.log('');


startBot().catch(error => {
  console.error('[CRÍTICO] Falha ao iniciar:', error.message);
  if (error.stack) console.error(error.stack);
  setTimeout(() => startBot(), 10_000);
});
