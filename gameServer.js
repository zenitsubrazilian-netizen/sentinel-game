'use strict';

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const rooms = new Map();

// ─────────────────────────────
// Utils
// ─────────────────────────────
const rand = (a, b) => Math.floor(Math.random() * (b - a + 1)) + a;
const chance = p => Math.random() * 100 < p;
const genId = () => Math.random().toString(36).substr(2, 8).toUpperCase();

// ─────────────────────────────
// Middlewares
// ─────────────────────────────
app.use(express.json());

// ─────────────────────────────
// Health check
// ─────────────────────────────
app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    rooms: rooms.size,
    uptime: process.uptime()
  });
});

// ─────────────────────────────
// Create room (bot uses this)
// ─────────────────────────────
app.post('/room', (req, res) => {
  const { p1Jid, p2Jid, isVsBot, difficulty, p1Bonus, p2Bonus } = req.body;

  if (!p1Jid) {
    return res.status(400).json({ error: 'p1Jid obrigatório' });
  }

  const roomId = genId();

  rooms.set(roomId, {
    id: roomId,
    phase: 'fighting',
    round: 1,
    isVsBot: !!isVsBot,
    difficulty: difficulty || 'medium',
    log: [],
    p1: makePlayer(p1Jid),
    p2: isVsBot ? makePlayer('sentinel') : makePlayer(p2Jid || 'unknown'),
    createdAt: Date.now()
  });

  setTimeout(() => rooms.delete(roomId), 20 * 60_000);

  res.json({ roomId });
});

// ─────────────────────────────
// Game page (FIX /game error)
// ─────────────────────────────
app.get(['/','/game'], (req, res) => {
  const { room, player } = req.query;

  if (!room || !['p1', 'p2'].includes(player)) {
    return res.status(400).send(`
      <h2 style="font-family:sans-serif;padding:20px;color:red">
      ⚠️ Link inválido. Use o link enviado pelo bot.
      </h2>
    `);
  }

  res.sendFile(path.join(__dirname, 'game.html'));
});

// ─────────────────────────────
// Player factory
// ─────────────────────────────
function makePlayer(jid) {
  return {
    jid,
    hp: 120,
    maxHp: 120,
    mana: 60,
    maxMana: 60,
    energy: 50,
    maxEnergy: 50,
    potions: 2,
    effects: [],
    ultimate: 0,
    action: null,
    defending: false
  };
}

// ─────────────────────────────
// Socket system
// ─────────────────────────────
io.on('connection', socket => {

  socket.on('join', ({ roomId }) => {
    const room = rooms.get(roomId);
    if (!room) return socket.emit('error', 'Sala não encontrada');

    socket.join(roomId);
    socket.emit('state', sanitize(room));
  });

  socket.on('action', ({ roomId, player, action }) => {
    const room = rooms.get(roomId);
    if (!room || room.phase !== 'fighting') return;

    const p = room[player];
    if (!p || p.action !== null) return;

    p.action = action;

    if (room.isVsBot) {
      room.p2.action = botAction(room.p2);
    }

    const ready =
      room.p1.action !== null &&
      room.p2.action !== null;

    if (ready) {
      const log = processRound(room);

      room.log = [...room.log, `━━ Round ${room.round} ━━`, ...log].slice(-80);

      const dead1 = room.p1.hp <= 0;
      const dead2 = room.p2.hp <= 0;

      if (dead1 || dead2) {
        room.phase = 'ended';
        room.winner = dead1 && dead2 ? 'draw' : dead2 ? 'p1' : 'p2';
      } else {
        room.round++;
      }
    }

    io.to(roomId).emit('state', sanitize(room));
  });
});

// ─────────────────────────────
// Battle logic (simplificado estável)
// ─────────────────────────────
function processRound(room) {
  const { p1, p2 } = room;
  const log = [];

  const d1 = rand(8, 15);
  const d2 = rand(8, 15);

  p1.hp -= d2;
  p2.hp -= d1;

  log.push(`⚔️ P1 causa ${d1}`);
  log.push(`⚔️ P2 causa ${d2}`);

  p1.action = null;
  p2.action = null;

  return log;
}

// ─────────────────────────────
// Bot
// ─────────────────────────────
function botAction(bot) {
  if (bot.hp < 40 && bot.potions > 0) return 'usar item';
  if (chance(30)) return 'defesa';
  return chance(50) ? 'ataque leve' : 'ataque pesado';
}

// ─────────────────────────────
// Safe output
// ─────────────────────────────
function sanitize(room) {
  return {
    phase: room.phase,
    round: room.round,
    isVsBot: room.isVsBot,
    log: room.log.slice(-60),
    p1: { hp: room.p1.hp },
    p2: { hp: room.p2.hp }
  };
}

// ─────────────────────────────
// Start server (Render safe)
// ─────────────────────────────
server.listen(process.env.PORT || 3000, () => {
  console.log('🎮 Game server online');
});
