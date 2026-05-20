'use strict';

// ============================================================
// GROUP SCHEDULER v2.0.0
// • Abre/fecha grupos com avisos e contagem regressiva
// • Detecção de atraso: se a ação deveria ter ocorrido e o bot
//   estava ausente, executa imediatamente com mensagem de desculpa
// 🔒 23:00 BRT | 🔓 05:00 BRT
// ============================================================

const { SENTINEL_PREFIX } = require('../config/system.js');

const P = SENTINEL_PREFIX; // prefixo em todas as mensagens

let _getSock     = null;
let _groupIds    = [];
let _schedulerOn = false;

const CLOSE_HOUR = 23;
const CLOSE_MIN  = 0;
const OPEN_HOUR  = 5;
const OPEN_MIN   = 0;

// Janela de catch-up: se a ação atrasou até 60 min, ainda executa
const CATCHUP_WINDOW_SEC = 60 * 60;

let _executionLog = {
  closeWarning1min: null,
  closeCountdown:   null,
  closeAction:      null,
  openWarning1min:  null,
  openCountdown:    null,
  openAction:       null,
};

// ─────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────

function getSock() {
  return typeof _getSock === 'function' ? _getSock() : null;
}

function nowBRT() {
  const str = new Date().toLocaleString('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  });
  const [hours, minutes, seconds] = str.split(':').map(Number);
  return { hours, minutes, seconds };
}

function timeKey(h, m) {
  return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`;
}

// Chave única por dia (BRT) — usada para evitar ação dupla no mesmo dia
function dayKey() {
  return new Date().toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
}

// Segundos até o próximo horário alvo
function secondsUntil(tH, tM, nowH, nowM, nowS) {
  const nowTotal = nowH * 3600 + nowM * 60 + nowS;
  const tgt      = tH * 3600 + tM * 60;
  let diff = tgt - nowTotal;
  if (diff < 0) diff += 86400;
  return diff;
}

// Segundos desde o horário alvo (quanto atrasou)
function secondsSince(tH, tM, nowH, nowM, nowS) {
  const nowTotal = nowH * 3600 + nowM * 60 + nowS;
  const tgt      = tH * 3600 + tM * 60;
  let diff = nowTotal - tgt;
  if (diff < 0) diff += 86400;
  return diff;
}

function fmtDelay(secs) {
  if (secs < 60)  return `${secs} segundo${secs !== 1 ? 's' : ''}`;
  const m = Math.floor(secs / 60);
  return `${m} minuto${m !== 1 ? 's' : ''}`;
}

// ─────────────────────────────────────────────────────────────
// PARTICIPANTES
// ─────────────────────────────────────────────────────────────

async function getGroupParticipants(sock, groupId) {
  try {
    const meta = await sock.groupMetadata(groupId);
    return meta.participants.map(p => p.id);
  } catch (err) {
    console.error(`[SCHEDULER] Erro ao buscar participantes:`, err.message);
    return [];
  }
}

// ─────────────────────────────────────────────────────────────
// MENSAGENS — normais
// ─────────────────────────────────────────────────────────────

const MSG_CLOSE_1MIN = [
  `━━━━━━━━━━━━━━━━━━`,
  `⏰ *AVISO*`,
  `━━━━━━━━━━━━━━━━━━`,
  ``,
  `🔒 O grupo será fechado em *1 minuto*`,
  ``,
  `⏱️ Horário: 23:00`,
  `💤 Finalize suas conversas`,
  `━━━━━━━━━━━━━━━━━━`,
].join('\n');

const MSG_OPEN_1MIN = [
  `━━━━━━━━━━━━━━━━━━`,
  `⏰ *AVISO*`,
  `━━━━━━━━━━━━━━━━━━`,
  ``,
  `🔓 O grupo será aberto em *1 minuto*`,
  ``,
  `⏱️ Horário: 05:00`,
  `☀️ Prepare-se para o dia!`,
  `━━━━━━━━━━━━━━━━━━`,
].join('\n');

const MSG_CLOSE = [
  `━━━━━━━━━━━━━━━━━━`,
  `🌙 *GRUPO FECHADO*`,
  `━━━━━━━━━━━━━━━━━━`,
  ``,
  `🔒 O grupo foi fechado para manutenção da ordem.`,
  ``,
  `⏰ Horário: *23:00*`,
  `🔓 Reabre às: *05:00*`,
  ``,
  `💤 Boa noite! Descanse bem.`,
  `━━━━━━━━━━━━━━━━━━`,
].join('\n');

const MSG_OPEN = [
  `━━━━━━━━━━━━━━━━━━`,
  `☀️ *GRUPO ABERTO*`,
  `━━━━━━━━━━━━━━━━━━`,
  ``,
  `🔓 O grupo está aberto novamente!`,
  ``,
  `⏰ Horário: *05:00*`,
  ``,
  `✅ Todos podem enviar mensagens.`,
  `💬 Bom dia e ótimas conversas!`,
  `━━━━━━━━━━━━━━━━━━`,
].join('\n');

// ─────────────────────────────────────────────────────────────
// MENSAGENS — catch-up (atraso detectado)
// ─────────────────────────────────────────────────────────────

function MSG_CLOSE_LATE(delay) {
  return [
    `━━━━━━━━━━━━━━━━━━`,
    `🌙 *GRUPO FECHADO*`,
    `━━━━━━━━━━━━━━━━━━`,
    ``,
    `⚠️ Houve um problema técnico e o fechamento atrasou ${delay}.`,
    `Pedimos desculpas pela demora!`,
    ``,
    `🔒 O grupo está sendo fechado agora.`,
    `🔓 Reabre às: *05:00*`,
    ``,
    `💤 Boa noite!`,
    `━━━━━━━━━━━━━━━━━━`,
  ].join('\n');
}

function MSG_OPEN_LATE(delay) {
  return [
    `━━━━━━━━━━━━━━━━━━`,
    `☀️ *GRUPO ABERTO*`,
    `━━━━━━━━━━━━━━━━━━`,
    ``,
    `⚠️ Houve um problema técnico e a abertura atrasou ${delay}.`,
    `Pedimos desculpas pela demora!`,
    ``,
    `🔓 O grupo está sendo aberto agora.`,
    ``,
    `✅ Todos podem enviar mensagens novamente.`,
    `💬 Bom dia!`,
    `━━━━━━━━━━━━━━━━━━`,
  ].join('\n');
}

// ─────────────────────────────────────────────────────────────
// ENVIO
// ─────────────────────────────────────────────────────────────

async function sendMsg(sock, groupId, text, mentions) {
  try {
    await sock.sendMessage(groupId, { text: P + text, mentions });
  } catch (err) {
    console.error(`[SCHEDULER] Erro ao enviar mensagem:`, err.message);
  }
}

async function setAnnounce(sock, groupId, announce) {
  try {
    await sock.groupSettingUpdate(groupId, announce ? 'announcement' : 'not_announcement');
    console.log(`[SCHEDULER] ${announce ? '🔒' : '🔓'} ${groupId}`);
  } catch (err) {
    console.error(`[SCHEDULER] Erro ao atualizar grupo:`, err.message);
  }
}

// ─────────────────────────────────────────────────────────────
// AÇÕES — normais
// ─────────────────────────────────────────────────────────────

async function doCloseWarning1min() {
  const sock = getSock();
  if (!sock) return;
  for (const gid of _groupIds) {
    const p = await getGroupParticipants(sock, gid);
    await sendMsg(sock, gid, MSG_CLOSE_1MIN, p);
  }
}

async function doCountdown(n) {
  const sock = getSock();
  if (!sock) return;
  for (const gid of _groupIds) {
    const p = await getGroupParticipants(sock, gid);
    await sendMsg(sock, gid, `⏱️ *${n}...*`, p);
    await new Promise(r => setTimeout(r, 500));
  }
}

async function doCloseGroups(msgText) {
  const sock = getSock();
  if (!sock) return;
  for (const gid of _groupIds) {
    const p = await getGroupParticipants(sock, gid);
    await sendMsg(sock, gid, msgText, p);
    await new Promise(r => setTimeout(r, 1500));
    await setAnnounce(sock, gid, true);
  }
}

async function doOpenWarning1min() {
  const sock = getSock();
  if (!sock) return;
  for (const gid of _groupIds) {
    const p = await getGroupParticipants(sock, gid);
    await sendMsg(sock, gid, MSG_OPEN_1MIN, p);
  }
}

async function doOpenGroups(msgText) {
  const sock = getSock();
  if (!sock) return;
  for (const gid of _groupIds) {
    await setAnnounce(sock, gid, false);
    await new Promise(r => setTimeout(r, 1500));
    const p = await getGroupParticipants(sock, gid);
    await sendMsg(sock, gid, msgText, p);
  }
}

// ─────────────────────────────────────────────────────────────
// TICK — 1 segundo para precisão
// ─────────────────────────────────────────────────────────────

async function tick() {
  const sock = getSock();
  if (!sock || _groupIds.length === 0) return;

  const { hours, minutes, seconds } = nowBRT();
  const day = dayKey();

  // ── FECHAMENTO ─────────────────────────────────────────────

  // Aviso 1 min antes
  if (hours === CLOSE_HOUR - 1 && minutes === 59 && seconds === 0) {
    if (_executionLog.closeWarning1min !== day) {
      _executionLog.closeWarning1min = day;
      console.log('[SCHEDULER] ⏰ Aviso de fechamento (1 min)');
      await doCloseWarning1min();
    }
  }

  // Contagem regressiva
  const toClose = secondsUntil(CLOSE_HOUR, CLOSE_MIN, hours, minutes, seconds);
  for (const n of [3, 2, 1]) {
    const k = `${day}-${n}`;
    if (toClose === n && _executionLog.closeCountdown !== k) {
      _executionLog.closeCountdown = k;
      await doCountdown(n);
    }
  }

  // Fechamento exato
  if (hours === CLOSE_HOUR && minutes === CLOSE_MIN && seconds === 0) {
    if (_executionLog.closeAction !== day) {
      _executionLog.closeAction = day;
      console.log('[SCHEDULER] 🔒 Fechando grupos');
      await doCloseGroups(MSG_CLOSE);
    }
  }

  // Catch-up: fechamento atrasado (bot estava ausente)
  if (seconds === 0 && _executionLog.closeAction !== day) {
    const since = secondsSince(CLOSE_HOUR, CLOSE_MIN, hours, minutes, seconds);
    // Dentro da janela de atraso e é depois das 23h
    if (since > 0 && since <= CATCHUP_WINDOW_SEC) {
      // Confirma que o horário alvo realmente já passou hoje
      const pastClose = (hours > CLOSE_HOUR) ||
                        (hours === CLOSE_HOUR && (minutes > CLOSE_MIN || seconds > 0));
      if (pastClose) {
        _executionLog.closeAction = day;
        const delay = fmtDelay(since);
        console.log(`[SCHEDULER] 🔒 Catch-up: fechamento com atraso de ${delay}`);
        await doCloseGroups(MSG_CLOSE_LATE(delay));
      }
    }
  }

  // ── ABERTURA ───────────────────────────────────────────────

  // Aviso 1 min antes
  if (hours === OPEN_HOUR - 1 && minutes === 59 && seconds === 0) {
    if (_executionLog.openWarning1min !== day) {
      _executionLog.openWarning1min = day;
      console.log('[SCHEDULER] ⏰ Aviso de abertura (1 min)');
      await doOpenWarning1min();
    }
  }

  // Contagem regressiva
  const toOpen = secondsUntil(OPEN_HOUR, OPEN_MIN, hours, minutes, seconds);
  for (const n of [3, 2, 1]) {
    const k = `${day}-${n}`;
    if (toOpen === n && _executionLog.openCountdown !== k) {
      _executionLog.openCountdown = k;
      await doCountdown(n);
    }
  }

  // Abertura exata
  if (hours === OPEN_HOUR && minutes === OPEN_MIN && seconds === 0) {
    if (_executionLog.openAction !== day) {
      _executionLog.openAction = day;
      console.log('[SCHEDULER] 🔓 Abrindo grupos');
      await doOpenGroups(MSG_OPEN);
    }
  }

  // Catch-up: abertura atrasada (bot estava ausente)
  if (seconds === 0 && _executionLog.openAction !== day) {
    const since = secondsSince(OPEN_HOUR, OPEN_MIN, hours, minutes, seconds);
    if (since > 0 && since <= CATCHUP_WINDOW_SEC) {
      const pastOpen = (hours > OPEN_HOUR) ||
                       (hours === OPEN_HOUR && (minutes > OPEN_MIN || seconds > 0));
      if (pastOpen) {
        _executionLog.openAction = day;
        const delay = fmtDelay(since);
        console.log(`[SCHEDULER] 🔓 Catch-up: abertura com atraso de ${delay}`);
        await doOpenGroups(MSG_OPEN_LATE(delay));
      }
    }
  }
}

// ─────────────────────────────────────────────────────────────
// API PÚBLICA
// ─────────────────────────────────────────────────────────────

function registerSock(getSockFn) {
  _getSock = getSockFn;
  console.log(`[SCHEDULER] Sock registrado`);
}

function startScheduler(groupIds = []) {
  _groupIds = [...groupIds];
  if (!_schedulerOn) {
    _schedulerOn = true;
    setInterval(tick, 1000);
    console.log(`[SCHEDULER] ✅ Iniciado (tick: 1s)`);
  }
  console.log(`[SCHEDULER] 🔒 ${timeKey(CLOSE_HOUR, CLOSE_MIN)} | 🔓 ${timeKey(OPEN_HOUR, OPEN_MIN)} BRT`);
  console.log(`[SCHEDULER] Grupos: ${_groupIds.length}`);
}

function addGroup(groupId) {
  if (!_groupIds.includes(groupId)) {
    _groupIds.push(groupId);
    console.log(`[SCHEDULER] + ${groupId}`);
  }
}

function removeGroup(groupId) {
  _groupIds = _groupIds.filter(g => g !== groupId);
  console.log(`[SCHEDULER] - ${groupId}`);
}

function getGroups() {
  return [..._groupIds];
}

module.exports = { registerSock, startScheduler, addGroup, removeGroup, getGroups };
