'use strict';

async function startTyping(sock, from) {
  try {
    await sock.sendPresenceUpdate('composing', from);
  } catch {}
}

async function stopTyping(sock, from) {
  try {
    await sock.sendPresenceUpdate('paused', from);
  } catch {}
}

module.exports = { startTyping, stopTyping };
