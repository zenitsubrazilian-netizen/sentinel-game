'use strict';

const {
  default: makeWASocket,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
  isJidBroadcast,
} = require('@whiskeysockets/baileys');

const path = require('path');
const pino = require('pino');

async function debug() {
  const { version } = await fetchLatestBaileysVersion();
  const { state, saveCreds } = await useMultiFileAuthState(
    path.join(__dirname, 'auth')
  );

  const sock = makeWASocket({
    version,
    logger: pino({ level: 'silent' }),
    auth: {
      creds: state.creds,
      keys: makeCacheableSignalKeyStore(state.keys, pino({ level: 'silent' })),
    },
    printQRInTerminal: false,
    markOnlineOnConnect: false,
    shouldIgnoreJid: jid => isJidBroadcast(jid),
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', async (update) => {
    if (update.connection !== 'open') return;

    const GROUP_ID = '120363407897145877@g.us';

    try {
      const metadata = await sock.groupMetadata(GROUP_ID);

      console.log('\n=== PARTICIPANTES DO GRUPO ===\n');

      for (const p of metadata.participants) {
        console.log('---');
        console.log('id:    ', p.id);
        console.log('lid:   ', p.lid);
        console.log('admin: ', p.admin);
        console.log('name:  ', p.name);
      }

      console.log('\n=== FIM ===\n');

    } catch (e) {
      console.error('Erro:', e.message);
    }

    process.exit(0);
  });
}

debug().catch(console.error);
