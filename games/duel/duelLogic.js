'use strict';

// ============================================================
// games/duel/duelLogic.js — Lógica Duel Arena 2D
// FIX: lógica de ready baseada em flags, não em socket count
// FIX: performance — tick otimizado, broadcast throttlado
// ============================================================

const path  = require('path');
const rooms = new Map();

const genId = () => Math.random().toString(36).substr(2, 8).toUpperCase();
const clamp = (v, mn, mx) => Math.max(mn, Math.min(mx, v));
const rand  = (a, b) => Math.floor(Math.random() * (b - a + 1)) + a;

const ARENA_W    = 800;
const ARENA_H    = 450;
const FLOOR_Y    = 340;
const GRAVITY    = 0.55;
const JUMP_VEL   = -13;
const MOVE_SPEED = 4.2;
const MAX_HP     = 120;
const ROUND_DUR  = 60;
const TICK_MS    = 50;   // 20 ticks/s
const CHAR_W     = 28;
const CHAR_H     = 44;

// ─── Bônus de relíquias ───────────────────────────────────────
function applyBonusToPlayer(player, bonus) {
  const b = bonus || {};
  player.maxHp           += (Number(b.maxHpBonus)       || 0);
  player.hp               = player.maxHp;
  player.dmgBonus        += (Number(b.dmgBonus)          || 0);
  player.dodgeBonus      += (Number(b.dodgeBonus)        || 0);
  player.damageReduction += (Number(b.damageReduction)   || 0);
  player.regenPerRound   += (Number(b.regenPerRound)     || 0);
  player.ultBonus        += (Number(b.ultimatePowerBonus)|| 0);
  if (b.startUltimate)    player.ult = clamp(Number(b.startUltimate), 0, 100);
  return player;
}

// ─── Factory de jogador 2D ────────────────────────────────────
function makePlayer2D(slot, jid, bonus) {
  const p = {
    slot, jid,
    x: slot === 'p1' ? 150 : 620,
    y: FLOOR_Y,
    vx: 0, vy: 0,
    onGround: true,
    hp: MAX_HP, maxHp: MAX_HP,
    ult: 0,
    state:   'idle',
    flipped: slot === 'p2',
    charId:  'warrior',
    skin:    slot === 'p1' ? '#ef4444' : '#3b82f6',
    nick:    slot,
    effects: [],
    blocking:       false,
    attackCooldown: 0,
    hurtTimer:      0,
    dmgBonus:          0,
    dodgeBonus:        0,
    damageReduction:   0,
    regenPerRound:     0,
    ultBonus:          0,
    lastInputDx:       0,
    ready:             false,
  };
  applyBonusToPlayer(p, bonus || {});
  return p;
}

// ─── Factory de sala ──────────────────────────────────────────
function makeRoom(roomId, p1Jid, p2Jid, p1Bonus, p2Bonus, isVsBot, difficulty) {
  return {
    id:         roomId,
    phase:      'lobby',
    round:      1,
    maxRounds:  3,
    wins:       { p1: 0, p2: 0 },
    timeLeft:   ROUND_DUR,
    isVsBot:    !!isVsBot,
    difficulty: difficulty || 'medium',
    p1: makePlayer2D('p1', p1Jid,         p1Bonus),
    p2: makePlayer2D('p2', p2Jid || 'bot', p2Bonus),
    tickInterval:  null,
    lastTick:      Date.now(),
    lastBroadcast: 0,
    createdAt:     Date.now(),
    sockets:       { p1: null, p2: null },
    winner:        null,
    _io:           null,
  };
}

// ─── Hitboxes ─────────────────────────────────────────────────
function getHitbox(p)   { return { x: p.x - CHAR_W/2, y: p.y - CHAR_H, w: CHAR_W, h: CHAR_H }; }
function rectsOverlap(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x &&
         a.y < b.y + b.h && a.y + a.h > b.y;
}
function getAttackBox(p) {
  const base = getHitbox(p);
  return { x: p.flipped ? base.x - 30 : base.x + CHAR_W, y: base.y + 8, w: 32, h: 28 };
}
function getHeavyBox(p) {
  const base = getAttackBox(p);
  return { x: base.x, y: base.y - 4, w: 40, h: 36 };
}

// ─── Dano ─────────────────────────────────────────────────────
function dealDamage(attacker, target, rawDmg, isHeavy, isUlt) {
  if (target.hp <= 0 || target.state === 'dead') return 0;
  let dmg = rawDmg + (attacker.dmgBonus || 0);
  if (Math.random() < 0.12) dmg = Math.floor(dmg * 1.5);
  if (isHeavy) dmg = Math.floor(dmg * 1.35);
  if (isUlt)   dmg = Math.floor(dmg * 1.8);
  if (target.blocking)                  dmg = Math.floor(dmg * 0.2);
  else if ((target.damageReduction||0) > 0) dmg = Math.floor(dmg * (1 - target.damageReduction));
  dmg = Math.max(1, dmg);
  target.hp        = Math.max(0, target.hp - dmg);
  target.hurtTimer = 8;
  target.state     = 'hurt';
  const dir = attacker.x < target.x ? 1 : -1;
  target.vx += dir * (isHeavy ? 5 : 2.5);
  target.vy += isUlt ? -5 : -2;
  attacker.ult = clamp(attacker.ult + (isUlt ? 0 : isHeavy ? 12 : 8), 0, 100);
  return dmg;
}

// ─── Física ───────────────────────────────────────────────────
function stepPhysics(p) {
  if (!p.onGround) p.vy += GRAVITY;
  p.vx *= p.onGround ? 0.78 : 0.92;
  if (p.state !== 'attack' && p.state !== 'hurt' && p.state !== 'dead' && !p.blocking) {
    p.vx += p.lastInputDx * MOVE_SPEED;
  }
  p.x += p.vx;
  p.y += p.vy;
  if (p.y >= FLOOR_Y) {
    p.y = FLOOR_Y; p.vy = 0; p.onGround = true;
    if (p.state === 'jump') p.state = 'idle';
  } else {
    p.onGround = false;
  }
  p.x = clamp(p.x, 20, ARENA_W - 20);
}

function updatePlayerState(p) {
  if (p.state === 'dead') return;
  if (p.attackCooldown > 0) p.attackCooldown--;
  if (p.hurtTimer > 0) {
    if (--p.hurtTimer <= 0 && p.state === 'hurt') p.state = 'idle';
    return;
  }
  if (p.blocking) { p.state = 'block'; return; }
  if (!p.onGround) { if (p.state !== 'attack') p.state = 'jump'; return; }
  if (p.state === 'attack') return;
  p.state = Math.abs(p.vx + p.lastInputDx * MOVE_SPEED) > 0.5 ? 'walk' : 'idle';
}

// ─── IA do bot ────────────────────────────────────────────────
function botAI(room) {
  const bot   = room.p2;
  const enemy = room.p1;
  const diff  = room.difficulty;
  const dist  = Math.abs(bot.x - enemy.x);

  if (diff === 'easy') {
    if (bot.hp < 30) { bot.blocking = true; return; }
    bot.blocking    = false;
    bot.lastInputDx = bot.x > enemy.x ? -0.6 : 0.6;
    if (dist < 60 && bot.attackCooldown <= 0 && Math.random() < 0.3)
      doAttack(bot, enemy, 'light', room);
    return;
  }
  bot.blocking = false;
  if (dist > 55) bot.lastInputDx = bot.x > enemy.x ? -1 : 1;
  else           bot.lastInputDx = 0;

  if (diff === 'medium') {
    if (enemy.ult >= 100 && Math.random() < 0.4) { bot.blocking = true; return; }
    if (dist < 65 && bot.attackCooldown <= 0)
      doAttack(bot, enemy, Math.random() < 0.5 ? 'heavy' : 'light', room);
    if (bot.ult >= 100 && dist < 80) doAttack(bot, enemy, 'ult', room);
    return;
  }
  // hard/ai
  if (enemy.hp < 30 && bot.ult >= 100 && dist < 90) { doAttack(bot, enemy, 'ult', room); return; }
  if (enemy.blocking && dist < 65 && bot.attackCooldown <= 0) { doAttack(bot, enemy, 'heavy', room); return; }
  if (dist < 60 && bot.attackCooldown <= 0) {
    const r = Math.random();
    if      (r < 0.35) doAttack(bot, enemy, 'heavy',   room);
    else if (r < 0.55) doAttack(bot, enemy, 'special', room);
    else               doAttack(bot, enemy, 'light',   room);
    return;
  }
  if (enemy.state === 'attack' && bot.onGround && Math.random() < 0.4) {
    bot.vy = JUMP_VEL * 0.8; bot.onGround = false; bot.state = 'jump';
  }
}

// ─── Executar ataque ──────────────────────────────────────────
function doAttack(attacker, target, type, room) {
  if (attacker.attackCooldown > 0 || attacker.state === 'dead') return;
  attacker.state = 'attack';
  switch (type) {
    case 'light': {
      attacker.attackCooldown = 14;
      if (rectsOverlap(getAttackBox(attacker), getHitbox(target))) {
        const dmg = dealDamage(attacker, target, rand(8,15), false, false);
        if (dmg > 0) emitHit(room, target, dmg, false);
      }
      break;
    }
    case 'heavy': {
      attacker.attackCooldown = 22;
      if (rectsOverlap(getHeavyBox(attacker), getHitbox(target))) {
        const dmg = dealDamage(attacker, target, rand(18,28), true, false);
        if (dmg > 0) emitHit(room, target, dmg, false);
      }
      break;
    }
    case 'special': {
      attacker.attackCooldown = 30;
      if (Math.abs(attacker.x - target.x) < 180) {
        const dmg = dealDamage(attacker, target, rand(12,22), false, false);
        if (dmg > 0) emitHit(room, target, dmg, true);
      }
      break;
    }
    case 'ult': {
      if (attacker.ult < 100) return;
      attacker.attackCooldown = 40;
      attacker.ult = 0;
      if (Math.abs(attacker.x - target.x) < 120) {
        const dmg = dealDamage(attacker, target, rand(40, 55 + (attacker.ultBonus||0)), false, true);
        if (dmg > 0) emitHit(room, target, dmg, true);
      }
      break;
    }
  }
}

function emitHit(room, target, dmg, isCrit) {
  if (!room._io) return;
  room._io.to(room.id).emit('hit_event', { target: target.slot, dmg, isCrit, x: target.x, y: target.y - 40 });
}

function updateFacing(p1, p2) {
  if (p1.state !== 'attack' && p1.state !== 'hurt') p1.flipped = p1.x > p2.x;
  if (p2.state !== 'attack' && p2.state !== 'hurt') p2.flipped = p2.x < p1.x;
}

// ─── Tick principal ───────────────────────────────────────────
function gameTick(room) {
  if (room.phase !== 'fight') return;

  const now = Date.now();
  const dt  = Math.min((now - room.lastTick) / 1000, 0.1); // cap em 100ms
  room.lastTick = now;

  room.timeLeft = Math.max(0, room.timeLeft - dt);

  if (room.isVsBot) botAI(room);

  stepPhysics(room.p1);
  stepPhysics(room.p2);
  updateFacing(room.p1, room.p2);
  updatePlayerState(room.p1);
  updatePlayerState(room.p2);

  if (room.p1.regenPerRound > 0 && room.p1.hp > 0)
    room.p1.hp = clamp(room.p1.hp + room.p1.regenPerRound * dt, 0, room.p1.maxHp);
  if (room.p2.regenPerRound > 0 && room.p2.hp > 0)
    room.p2.hp = clamp(room.p2.hp + room.p2.regenPerRound * dt, 0, room.p2.maxHp);

  const p1Dead  = room.p1.hp <= 0;
  const p2Dead  = room.p2.hp <= 0;
  const timeout = room.timeLeft <= 0;

  if (p1Dead || p2Dead || timeout) { endRound(room, p1Dead, p2Dead, timeout); return; }

  // Broadcast throttlado: máximo 20x/s (já que TICK_MS=50)
  // mas evita flood se tick atrasar
  if (now - room.lastBroadcast >= 50) {
    room.lastBroadcast = now;
    broadcastState(room);
  }
}

// ─── Fim de round ─────────────────────────────────────────────
function endRound(room, p1Dead, p2Dead, timeout) {
  room.phase = 'round_end';
  clearInterval(room.tickInterval);
  room.tickInterval = null;

  let roundWinner = null;
  const draw = (p1Dead && p2Dead) || (timeout && Math.abs(room.p1.hp - room.p2.hp) < 5);

  if (!draw) {
    roundWinner = timeout ? (room.p1.hp >= room.p2.hp ? 'p1' : 'p2') : (p2Dead ? 'p1' : 'p2');
    room.wins[roundWinner]++;
  }

  if (room._io) {
    room._io.to(room.id).emit('round_end', { winner: roundWinner, draw, wins: room.wins, round: room.round });
  }

  const maxWins = Math.ceil(room.maxRounds / 2);
  if (room.wins.p1 >= maxWins || room.wins.p2 >= maxWins) {
    setTimeout(() => endGame(room, room.wins.p1 > room.wins.p2 ? 'p1' : 'p2', false), 3200);
    return;
  }
  room.round++;
  setTimeout(() => startFight(room), 3200);
}

// ─── Inicia fase de luta ──────────────────────────────────────
function startFight(room) {
  room.p1.x = 150; room.p1.y = FLOOR_Y; room.p1.vx = 0; room.p1.vy = 0;
  room.p2.x = 620; room.p2.y = FLOOR_Y; room.p2.vx = 0; room.p2.vy = 0;
  room.p1.hp = clamp(room.p1.hp + 20, 1, room.p1.maxHp);
  room.p2.hp = clamp(room.p2.hp + 20, 1, room.p2.maxHp);
  room.p1.state = 'idle'; room.p2.state = 'idle';
  room.p1.effects = []; room.p2.effects = [];
  room.p1.blocking = false; room.p2.blocking = false;
  room.p1.attackCooldown = 0; room.p2.attackCooldown = 0;
  room.p1.lastInputDx = 0; room.p2.lastInputDx = 0;
  room.timeLeft  = ROUND_DUR;
  room.phase     = 'fight';
  room.lastTick  = Date.now();
  room.lastBroadcast = 0;

  if (room.tickInterval) clearInterval(room.tickInterval);
  room.tickInterval = setInterval(() => gameTick(room), TICK_MS);

  // Envia estado inicial antes do primeiro tick
  broadcastState(room);
}

// ─── Fim de jogo ──────────────────────────────────────────────
function endGame(room, winner, draw) {
  room.phase  = 'ended';
  room.winner = draw ? 'draw' : winner;
  if (room._io) {
    room._io.to(room.id).emit('game_over',  { winner: room.winner, draw: !!draw, wins: room.wins });
    room._io.to(room.id).emit('game_state', sanitize(room));
  }
}

// ─── Broadcast ───────────────────────────────────────────────
function broadcastState(room) {
  if (!room._io) return;
  room._io.to(room.id).emit('game_state', sanitize(room));
}

// ─── Sanitize ─────────────────────────────────────────────────
function sanitize(room) {
  const sp = p => ({
    slot:    p.slot,
    x:       Math.round(p.x * 10) / 10,
    y:       Math.round(p.y * 10) / 10,
    hp:      Math.max(0, Math.round(p.hp)),
    maxHp:   p.maxHp,
    ult:     Math.round(p.ult),
    state:   p.state,
    flipped: p.flipped,
    charId:  p.charId,
    skin:    p.skin,
    nick:    p.nick,
    effects: p.effects || [],
    blocking:p.blocking || false,
  });
  return {
    p1:       sp(room.p1),
    p2:       sp(room.p2),
    round:    room.round,
    timeLeft: Math.round(room.timeLeft * 10) / 10,
    phase:    room.phase,
    wins:     room.wins,
  };
}

// ═══════════════════════════════════════════════════════════════
// ROTAS REST
// ═══════════════════════════════════════════════════════════════
function setupRoutes(app) {
  app.get('/duel/room/:roomId/result', (req, res) => {
    const room = rooms.get(req.params.roomId);
    if (!room) return res.status(404).json({ error: 'not_found' });
    if (room.phase !== 'ended') return res.json({ ended: false });
    return res.json({ ended: true, winner: room.winner, p1Jid: room.p1.jid, p2Jid: room.p2.jid, p1IsBot: false, p2IsBot: room.isVsBot });
  });

  app.post('/duel/room', (req, res) => {
    const { p1Jid, p2Jid, isVsBot, difficulty, p1Bonus, p2Bonus } = req.body;
    if (!p1Jid) return res.status(400).json({ error: 'p1Jid obrigatório' });
    console.log(`[DUEL2D] Sala criada | p1:${p1Jid} | vsBot:${isVsBot} | diff:${difficulty}`);
    const roomId = genId();
    const room   = makeRoom(roomId, p1Jid, p2Jid, p1Bonus || {}, p2Bonus || {}, isVsBot, difficulty);
    rooms.set(roomId, room);
    setTimeout(() => {
      const r = rooms.get(roomId);
      if (r) { clearInterval(r.tickInterval); rooms.delete(roomId); }
    }, 30 * 60_000);
    res.json({ roomId });
  });
}

// ═══════════════════════════════════════════════════════════════
// SOCKET.IO
// FIX PRINCIPAL: ready baseado em flags p1.ready / p2.ready
// não em contagem de sockets na sala
// ═══════════════════════════════════════════════════════════════
function setupSocket(io) {
  io.on('connection', socket => {

    // ── Join ──────────────────────────────────────────────────
    socket.on('join_2d', ({ roomId, slot }) => {
      const room = rooms.get(roomId);
      if (!room) { socket.emit('error_msg', 'Sala não encontrada.'); return; }
      socket.join(roomId);
      room.sockets[slot] = socket.id;
      room._io = io;
      console.log(`[DUEL2D] join_2d | slot:${slot} | room:${roomId} | socket:${socket.id}`);
      socket.emit('game_state', sanitize(room));
    });

    // ── Pronto — FIX: usa flags, não socket count ─────────────
    socket.on('player_ready', ({ roomId, slot, nick, charId, skin }) => {
      const room = rooms.get(roomId);
      if (!room) { socket.emit('error_msg', 'Sala não encontrada.'); return; }

      // Garante que o socket está na sala (pode ter reconectado)
      socket.join(roomId);
      room.sockets[slot] = socket.id;
      room._io = io;

      const p = room[slot];
      if (!p) { socket.emit('error_msg', 'Slot inválido.'); return; }

      p.nick   = (nick   || slot).substring(0, 16);
      p.charId = charId  || 'warrior';
      p.skin   = skin    || (slot === 'p1' ? '#ef4444' : '#3b82f6');
      p.ready  = true;

      console.log(`[DUEL2D] player_ready | slot:${slot} | nick:${p.nick} | room:${roomId}`);
      console.log(`[DUEL2D] status ready | p1:${room.p1.ready} | p2:${room.p2.ready} | vsBot:${room.isVsBot}`);

      // FIX: condição correta — p2 é sempre "pronto" em vsBot
      const p1Ready = room.p1.ready;
      const p2Ready = room.isVsBot ? true : room.p2.ready;

      if (p1Ready && p2Ready && room.phase === 'lobby') {
        // Configura bot se necessário
        if (room.isVsBot) {
          room.p2.nick   = 'Sentinel';
          room.p2.charId = ['warrior','mage','ninja','demon'][Math.floor(Math.random() * 4)];
          room.p2.skin   = '#ef4444';
          room.p2.ready  = true;
        }

        room.phase = 'starting'; // Evita duplo disparo
        console.log(`[DUEL2D] ✅ Ambos prontos! Iniciando combate | room:${roomId}`);

        io.to(roomId).emit('both_ready');
        // Delay de 1s para o cliente processar a tela "iniciando"
        setTimeout(() => startFight(room), 1000);
      } else {
        // Informa ao jogador que está aguardando o oponente
        socket.emit('waiting_opponent');
        console.log(`[DUEL2D] ⏳ Aguardando oponente | room:${roomId}`);
      }
    });

    // ── Input do jogador ──────────────────────────────────────
    socket.on('player_input', ({ roomId, slot, type, dx }) => {
      const room = rooms.get(roomId);
      if (!room || room.phase !== 'fight') return;
      const p      = room[slot];
      const target = slot === 'p1' ? room.p2 : room.p1;
      if (!p || p.state === 'dead') return;

      switch (type) {
        case 'move':
          p.lastInputDx = clamp(dx || 0, -1, 1);
          break;
        case 'jump':
          if (p.onGround && p.state !== 'hurt') {
            p.vy = JUMP_VEL; p.onGround = false; p.state = 'jump';
          }
          break;
        case 'block':
          p.blocking = !p.blocking;
          p.state    = p.blocking ? 'block' : 'idle';
          break;
        case 'attack_light':
          if (p.attackCooldown <= 0 && p.state !== 'hurt') doAttack(p, target, 'light',   room);
          break;
        case 'attack_heavy':
          if (p.attackCooldown <= 0 && p.state !== 'hurt') doAttack(p, target, 'heavy',   room);
          break;
        case 'special':
          if (p.attackCooldown <= 0 && p.state !== 'hurt') doAttack(p, target, 'special', room);
          break;
        case 'ultimate':
          if (p.ult >= 100 && p.attackCooldown <= 0)       doAttack(p, target, 'ult',     room);
          break;
      }
    });

    // ── Disconnect ────────────────────────────────────────────
    socket.on('disconnect', () => {
      for (const [, room] of rooms) {
        if (room.sockets.p1 === socket.id) { room.sockets.p1 = null; console.log(`[DUEL2D] p1 desconectou | room:${room.id}`); }
        if (room.sockets.p2 === socket.id) { room.sockets.p2 = null; console.log(`[DUEL2D] p2 desconectou | room:${room.id}`); }
      }
    });
  });
}

module.exports = { setupRoutes, setupSocket };
