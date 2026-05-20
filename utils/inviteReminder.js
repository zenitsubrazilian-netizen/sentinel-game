'use strict';

// ============================================================
// INVITE REMINDER v1.1.0
// Envia mensagem aleatória pedindo convites — sempre com prefix
// • Intervalo base: verifica a cada 1h
// • Janela ativa: 10h–23h (horário local)
// • Chance de disparo por verificação: 25%
// • Cooldown mínimo entre envios: 4h
// ============================================================

const { SENTINEL_PREFIX } = require('../config/system.js');

const CHECK_INTERVAL_MS = 60 * 60_000;
const FIRE_CHANCE       = 0.25;
const COOLDOWN_MS       = 4 * 60 * 60_000;
const ACTIVE_HOUR_START = 10;
const ACTIVE_HOUR_END   = 23;

// Todas as mensagens obrigatoriamente começam com SENTINEL_PREFIX
const MESSAGES = [
  `*Sentinel 🛡:*\n\n📢 Ei, pessoal! Quem ainda não adicionou ninguém no grupo, que tal convidar pelo menos *2 pessoas* de confiança? Cada novo membro fortalece nossa comunidade! 🚀`,
  `*Sentinel 🛡:*\n\n🌟 Lembrete rápido: se você ainda não trouxe ninguém pro grupo, esse é o momento! Convide pelo menos *2 amigos* e ajude a comunidade a crescer. 💪`,
  `*Sentinel 🛡:*\n\n🤝 A força do grupo está em cada um de nós! Quem ainda não convidou ninguém, por favor traga pelo menos *2 pessoas* — quanto mais, melhor! 🚀`,
  `*Sentinel 🛡:*\n\n📣 Crescer juntos é a chave! Se você ainda não adicionou ninguém, convide *2 ou mais pessoas* para o grupo. Sua indicação faz a diferença! ✨`,
  `*Sentinel 🛡:*\n\n💬 Missão do dia: quem ainda não trouxe ninguém, convide pelo menos *2 pessoas* para o grupo! Vamos expandir essa comunidade juntos. 🌐`,
];

let _sock        = null;
let _groupId     = null;
let _lastSentAt  = 0;
let _intervalRef = null;

function randomMessage() {
  return MESSAGES[Math.floor(Math.random() * MESSAGES.length)];
}

function activeHour() {
  const h = new Date().getHours();
  return h >= ACTIVE_HOUR_START && h < ACTIVE_HOUR_END;
}

async function tryFire() {
  if (!_sock || !_groupId)                    return;
  if (!activeHour())                          return;
  if (Date.now() - _lastSentAt < COOLDOWN_MS) return;
  if (Math.random() > FIRE_CHANCE)            return;

  try {
    const metadata     = await _sock.groupMetadata(_groupId);
    const participants = metadata.participants.map(p => p.id);

    await _sock.sendMessage(_groupId, {
      text:     randomMessage(),
      mentions: participants,
    });

    _lastSentAt = Date.now();
    console.log(`[INVITE-REMINDER] Mensagem enviada (${participants.length} menções)`);
  } catch (err) {
    console.error('[INVITE-REMINDER] Erro ao enviar:', err.message);
  }
}

function startInviteReminder(getSock, groupId) {
  _groupId = groupId;

  if (_intervalRef) {
    clearInterval(_intervalRef);
    _intervalRef = null;
  }

  _intervalRef = setInterval(() => {
    _sock = getSock();
    tryFire().catch(err => console.error('[INVITE-REMINDER] Erro no ciclo:', err.message));
  }, CHECK_INTERVAL_MS);

  console.log(`[INVITE-REMINDER] Iniciado — verifica a cada 1h, chance 25%, cooldown 4h`);
}

function stopInviteReminder() {
  if (_intervalRef) {
    clearInterval(_intervalRef);
    _intervalRef = null;
    console.log('[INVITE-REMINDER] Parado.');
  }
}

module.exports = { startInviteReminder, stopInviteReminder };
