'use strict';

// ============================================================
// games/duel/duelLogic.js — Lógica Duel Arena 2D
// Exporta setupRoutes(app) e setupSocket(io)
// ============================================================

const path  = require('path');
const rooms = new Map(); // salas 2D

const genId = () => Math.random().toString(36).substr(2, 8).toUpperCase();
const clamp = (v, mn, mx) => Math.max(mn, Math.min(mx, v));
const rand  = (a, b) => Math.floor(Math.random() * (b - a + 1)) + a;

// ─── Constantes de física/jogo ────────────────────────────────
const ARENA_W    = 800;
const ARENA_H    = 450;
const FLOOR_Y    = 340;
const GRAVITY    = 0.55;
const JUMP_VEL   = -13;
const MOVE_SPEED = 4.2;
const MAX_HP     = 120;
const ROUND_DUR  = 60;   // segundos
const TICK_MS    = 50;   // 20 ticks/s
const CHAR_W     = 28;
const CHAR_H     = 44;

// ─── Dados de relíquias (mapeamento para stats 2D) ───────────
// Mantém compatibilidade total com o sistema de relíquias existente
function applyBonusToPlayer(player, bonus) {
  const b = bonus || {};
  player.maxHp           += (Number(b.maxHpBonus)      || 0);
  player.hp               = player.maxHp;
  player.dmgBonus        += (Number(b.dmgBonus)         || 0);
  player.dodgeBonus      += (Number(b.dodgeBonus)       || 0);
  player.damageReduction += (Number(b.damageReduction)  || 0);
  player.regenPerRound   += (Number(b.regenPerRound)    || 0);
  player.ultBonus        += (Number(b.ultimatePowerBonus)|| 0);
  if (b.startUltimate)   player.ult = clamp(Number(b.startUltimate), 0, 100);
  return player;
}

// ─── Factory de jogador 2D ────────────────────────────────────
function makePlayer2D(slot, jid, bonus = {}) {
  const p = {
    slot, jid,
    x: slot === 'p1' ? 150 : 620,
    y: FLOOR_Y,
    vx: 0, vy: 0,
    onGround: true,
    hp: MAX_HP, maxHp: MAX_HP,
    ult: 0,
    state:   'idle',   // idle | walk | jump | attack | hurt | block | dead
    flipped: slot === 'p2',
    charId:  'warrior',
    skin:    '#ef4444',
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
  applyBonusToPlayer(p, bonus);
  return p;
}

// ─── Factory de sala ──────────────────────────────────────────
function makeRoom(roomId, p1Jid, p2Jid, p1Bonus, p2Bonus, isVsBot, difficulty) {
  const room = {
    id:       roomId,
    phase:    'lobby',   // lobby | countdown | fight | round_end | ended
    round:    1,
    maxRounds:3,
    wins:     { p1: 0, p2: 0 },
    timeLeft: ROUND_DUR,
    isVsBot:  !!isVsBot,
    difficulty: difficulty || 'medium',
    p1: makePlayer2D('p1', p1Jid, p1Bonus),
    p2: makePlayer2D('p2', p2Jid || 'bot', p2Bonus),
    tickInterval: null,
    lastTick: Date.now(),
    createdAt: Date.now(),
    sockets: { p1: null, p2: null },
    winner: null,
  };
  return room;
}

// ─── Hitboxes ─────────────────────────────────────────────────
function getHitbox(p) {
  return { x: p.x - CHAR_W/2, y: p.y - CHAR_H, w: CHAR_W, h: CHAR_H };
}
function rectsOverlap(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x &&
         a.y < b.y + b.h && a.y + a.h > b.y;
}
function getAttackBox(p) {
  const dir  = p.flipped ? -1 : 1;
  const base = getHitbox(p);
  return {
    x: p.flipped ? base.x - 30 : base.x + CHAR_W,
    y: base.y + 8,
    w: 32, h: 28,
  };
}
function getHeavyBox(p) {
  const base = getAttackBox(p);
  return { x: base.x, y: base.y - 4, w: 40, h: 36 };
}

// ─── Dano / hit ───────────────────────────────────────────────
function dealDamage(attacker, target, rawDmg, isHeavy, isUlt) {
  if (target.hp <= 0 || target.state === 'dead') return 0;
  let dmg = rawDmg + (attacker.dmgBonus || 0);
  const isCrit = Math.random() < 0.12;
  if (isCrit) dmg = Math.floor(dmg * 1.5);
  if (isHeavy) dmg = Math.floor(dmg * 1.35);
  if (isUlt)   dmg = Math.floor(dmg * 1.8);
  // Redução de dano (relíquia / blocking)
  if (target.blocking) dmg = Math.floor(dmg * 0.2);
  else if ((target.damageReduction || 0) > 0)
    dmg = Math.floor(dmg * (1 - target.damageReduction));
  dmg = Math.max(1, dmg);
  target.hp = Math.max(0, target.hp - dmg);
  target.hurtTimer = 8;
  target.state     = 'hurt';
  // Knockback
  const dir = attacker.x < target.x ? 1 : -1;
  target.vx += dir * (isHeavy ? 5 : 2.5);
  target.vy += isUlt ? -5 : -2;
  // Carga de ultimate
  attacker.ult = clamp(attacker.ult + (isUlt ? 0 : isHeavy ? 12 : 8), 0, 100);
  return dmg;
}

// ─── Física ───────────────────────────────────────────────────
function stepPhysics(p) {
  // Gravidade
  if (!p.onGround) {
    p.vy += GRAVITY;
  }
  // Fricção horizontal
  if (p.onGround) {
    p.vx *= 0.78;
  } else {
    p.vx *= 0.92;
  }
  // Movimento de input
  if (p.state !== 'attack' && p.state !== 'hurt' && p.state !== 'dead' && !p.blocking) {
    p.vx += p.lastInputDx * MOVE_SPEED;
  }

  p.x += p.vx;
  p.y += p.vy;

  // Chão
  if (p.y >= FLOOR_Y) {
    p.y        = FLOOR_Y;
    p.vy       = 0;
    p.onGround = true;
    if (p.state === 'jump') p.state = 'idle';
  } else {
    p.onGround = false;
  }
  // Paredes
  p.x = clamp(p.x, 20, ARENA_W - 20);

  // Face o oponente (flipping) — apenas se não atacando
  // Feito pelo servidor com os dados de posição
}

// ─── Estado de animação ───────────────────────────────────────
function updatePlayerState(p) {
  if (p.state === 'dead') return;
  if (p.attackCooldown > 0) p.attackCooldown--;
  if (p.hurtTimer > 0) {
    p.hurtTimer--;
    if (p.hurtTimer <= 0 && p.state === 'hurt') p.state = 'idle';
    return;
  }
  if (p.blocking) { p.state = 'block'; return; }
  if (!p.onGround) { if (p.state !== 'attack') p.state = 'jump'; return; }
  if (p.state === 'attack') return; // mantém até cooldown acabar
  if (Math.abs(p.vx + p.lastInputDx * MOVE_SPEED) > 0.5) {
    p.state = 'walk';
  } else {
    p.state = 'idle';
  }
}

// ─── IA do bot ────────────────────────────────────────────────
function botAI(room) {
  const bot    = room.p2;
  const enemy  = room.p1;
  const diff   = room.difficulty;
  const dist   = Math.abs(bot.x - enemy.x);

  if (diff === 'easy') {
    if (bot.hp < 30) { bot.blocking = true; return; }
    bot.blocking     = false;
    bot.lastInputDx  = bot.x > enemy.x ? -0.6 : 0.6;
    if (dist < 60 && bot.attackCooldown <= 0 && Math.random() < 0.3) {
      doAttack(bot, enemy, 'light', room);
    }
    return;
  }

  bot.blocking = false;

  // Move para o inimigo
  if (dist > 55) {
    bot.lastInputDx = bot.x > enemy.x ? -1 : 1;
  } else {
    bot.lastInputDx = 0;
  }

  if (diff === 'medium') {
    if (enemy.ult >= 100 && Math.random() < 0.4) { bot.blocking = true; return; }
    if (dist < 65 && bot.attackCooldown <= 0) {
      if (Math.random() < 0.5) doAttack(bot, enemy, 'heavy', room);
      else                     doAttack(bot, enemy, 'light', room);
    }
    if (bot.ult >= 100 && dist < 80) doAttack(bot, enemy, 'ult', room);
    return;
  }

  // hard / ai
  if (enemy.hp < 30 && bot.ult >= 100 && dist < 90) {
    doAttack(bot, enemy, 'ult', room); return;
  }
  if (enemy.blocking && dist < 65 && bot.attackCooldown <= 0) {
    doAttack(bot, enemy, 'heavy', room); return;
  }
  if (dist < 60 && bot.attackCooldown <= 0) {
    const r = Math.random();
    if (r < 0.35)      doAttack(bot, enemy, 'heavy',   room);
    else if (r < 0.55) doAttack(bot, enemy, 'special', room);
    else               doAttack(bot, enemy, 'light',   room);
    return;
  }
  // Pulo evasivo se inimigo atacar
  if (enemy.state === 'attack' && bot.onGround && Math.random() < 0.4) {
    bot.vy       = JUMP_VEL * 0.8;
    bot.onGround = false;
    bot.state    = 'jump';
  }
}

// ─── Executar ataque ─────────────────────────────────────────
function doAttack(attacker, target, type, room) {
  if (attacker.attackCooldown > 0) return;
  if (attacker.state === 'dead')   return;

  attacker.state = 'attack';

  switch (type) {
    case 'light': {
      attacker.attackCooldown = 14;
      const box = getAttackBox(attacker);
      const thb = getHitbox(target);
      if (rectsOverlap(box, thb)) {
        const dmg = dealDamage(attacker, target, rand(8, 15), false, false);
        if (dmg > 0) emitHit(room, target, dmg, false);
      }
      break;
    }
    case 'heavy': {
      attacker.attackCooldown = 22;
      const box = getHeavyBox(attacker);
      const thb = getHitbox(target);
      if (rectsOverlap(box, thb)) {
        const dmg = dealDamage(attacker, target, rand(18, 28), true, false);
        if (dmg > 0) emitHit(room, target, dmg, false);
      }
      break;
    }
    case 'special': {
      attacker.attackCooldown = 30;
      // Projétil especial: verifica distância
      const dist = Math.abs(attacker.x - target.x);
      if (dist < 180) {
        const dmg = dealDamage(attacker, target, rand(12, 22), false, false);
        if (dmg > 0) emitHit(room, target, dmg, true);
      }
      break;
    }
    case 'ult': {
      if (attacker.ult < 100) return;
      attacker.attackCooldown = 40;
      attacker.ult = 0;
      const dist = Math.abs(attacker.x - target.x);
      if (dist < 120) {
        const ultDmg = rand(40, 55 + (attacker.ultBonus || 0));
        const dmg = dealDamage(attacker, target, ultDmg, false, true);
        if (dmg > 0) emitHit(room, target, dmg, true);
      }
      break;
    }
  }
}

// ─── Emite evento de hit ──────────────────────────────────────
function emitHit(room, target, dmg, isCrit) {
  if (!room._io) return;
  room._io.to(room.id).emit('hit_event', {
    target: target.slot,
    dmg,
    isCrit,
    x: target.x,
    y: target.y - 40,
  });
}

// ─── Atualizar face (flipping) ────────────────────────────────
function updateFacing(p1, p2) {
  if (p1.state !== 'attack' && p1.state !== 'hurt') p1.flipped = p1.x > p2.x;
  if (p2.state !== 'attack' && p2.state !== 'hurt') p2.flipped = p2.x < p1.x;
}

// ─── Tick principal ───────────────────────────────────────────
function gameTick(room) {
  if (room.phase !== 'fight') return;

  const now   = Date.now();
  const dt    = (now - room.lastTick) / 1000;
  room.lastTick = now;

  room.timeLeft = Math.max(0, room.timeLeft - dt);

  // IA do bot
  if (room.isVsBot) botAI(room);

  // Física
  stepPhysics(room.p1);
  stepPhysics(room.p2);

  // Face
  updateFacing(room.p1, room.p2);

  // Estado
  updatePlayerState(room.p1);
  updatePlayerState(room.p2);

  // Regen de HP por relíquia
  if (room.p1.regenPerRound > 0 && room.p1.hp > 0)
    room.p1.hp = clamp(room.p1.hp + room.p1.regenPerRound * dt, 0, room.p1.maxHp);
  if (room.p2.regenPerRound > 0 && room.p2.hp > 0)
    room.p2.hp = clamp(room.p2.hp + room.p2.regenPerRound * dt, 0, room.p2.maxHp);

  // Verifica fim de round
  const p1Dead = room.p1.hp <= 0;
  const p2Dead = room.p2.hp <= 0;
  const timeout = room.timeLeft <= 0;

  if (p1Dead || p2Dead || timeout) {
    endRound(room, p1Dead, p2Dead, timeout);
    return;
  }

  // Envia estado
  broadcastState(room);
}

// ─── Fim de round ─────────────────────────────────────────────
function endRound(room, p1Dead, p2Dead, timeout) {
  room.phase = 'round_end';
  clearInterval(room.tickInterval);
  room.tickInterval = null;

  let roundWinner = null;
  const draw = (p1Dead && p2Dead) || (timeout && Math.abs(room.p1.hp - room.p2.hp) < 5);

  if (!draw) {
    if (timeout) roundWinner = room.p1.hp >= room.p2.hp ? 'p1' : 'p2';
    else         roundWinner = p2Dead ? 'p1' : 'p2';
    room.wins[roundWinner]++;
  }

  if (room._io) {
    room._io.to(room.id).emit('round_end', {
      winner: roundWinner,
      draw,
      wins: room.wins,
      round: room.round,
    });
  }

  // Verifica fim de jogo (melhor de 3)
  const maxWins = Math.ceil(room.maxRounds / 2);
  if (room.wins.p1 >= maxWins || room.wins.p2 >= maxWins) {
    setTimeout(() => endGame(room, room.wins.p1 > room.wins.p2 ? 'p1' : 'p2', false), 3200);
    return;
  }

  // Próximo round
  room.round++;
  setTimeout(() => startFight(room), 3200);
}

// ─── Inicia fase de luta ──────────────────────────────────────
function startFight(room) {
  // Reset posições e HP parcial (não regenera tudo)
  room.p1.x = 150; room.p1.y = FLOOR_Y; room.p1.vx = 0; room.p1.vy = 0;
  room.p2.x = 620; room.p2.y = FLOOR_Y; room.p2.vx = 0; room.p2.vy = 0;
  room.p1.hp = clamp(room.p1.hp + 20, 1, room.p1.maxHp);
  room.p2.hp = clamp(room.p2.hp + 20, 1, room.p2.maxHp);
  room.p1.state = 'idle'; room.p2.state = 'idle';
  room.p1.effects = []; room.p2.effects = [];
  room.p1.blocking = false; room.p2.blocking = false;
  room.p1.attackCooldown = 0; room.p2.attackCooldown = 0;
  room.timeLeft = ROUND_DUR;
  room.phase    = 'fight';
  room.lastTick = Date.now();

  room.tickInterval = setInterval(() => gameTick(room), TICK_MS);
  broadcastState(room);
}

// ─── Fim de jogo ─────────────────────────────────────────────
function endGame(room, winner, draw) {
  room.phase  = 'ended';
  room.winner = draw ? 'draw' : winner;

  if (room._io) {
    room._io.to(room.id).emit('game_over', {
      winner: room.winner,
      draw:   !!draw,
      wins:   room.wins,
    });
    room._io.to(room.id).emit('game_state', sanitize(room));
  }
}

// ─── Broadcast de estado ──────────────────────────────────────
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
  // Resultado para polling do bot (XP)
  app.get('/duel/room/:roomId/result', (req, res) => {
    const room = rooms.get(req.params.roomId);
    if (!room) return res.status(404).json({ error: 'not_found' });
    if (room.phase !== 'ended') return res.json({ ended: false });
    return res.json({
      ended:   true,
      winner:  room.winner,
      p1Jid:   room.p1.jid,
      p2Jid:   room.p2.jid,
      p1IsBot: false,
      p2IsBot: room.isVsBot,
    });
  });

  // Cria sala
  app.post('/duel/room', (req, res) => {
    const { p1Jid, p2Jid, isVsBot, difficulty, p1Bonus, p2Bonus } = req.body;
    if (!p1Jid) return res.status(400).json({ error: 'p1Jid obrigatório' });

    console.log(`[DUEL2D] Sala criada | p1:${p1Jid} | vsBot:${isVsBot} | diff:${difficulty}`);
    console.log(`[DUEL2D] p1Bonus:`, JSON.stringify(p1Bonus || {}));
    console.log(`[DUEL2D] p2Bonus:`, JSON.stringify(p2Bonus || {}));

    const roomId = genId();
    const room   = makeRoom(roomId, p1Jid, p2Jid, p1Bonus || {}, p2Bonus || {}, isVsBot, difficulty);
    rooms.set(roomId, room);

    // Expira em 30 min
    setTimeout(() => {
      if (rooms.has(roomId)) {
        clearInterval(rooms.get(roomId).tickInterval);
        rooms.delete(roomId);
      }
    }, 30 * 60_000);

    res.json({ roomId });
  });
}

// ═══════════════════════════════════════════════════════════════
// SOCKET.IO
// ═══════════════════════════════════════════════════════════════
function setupSocket(io) {
  io.on('connection', socket => {

    // ── Join: identifica sala e slot
    socket.on('join_2d', ({ roomId, slot }) => {
      const room = rooms.get(roomId);
      if (!room) { socket.emit('error_msg', 'Sala não encontrada.'); return; }
      socket.join(roomId);
      room.sockets[slot] = socket.id;
      room._io = io;
      socket.emit('game_state', sanitize(room));
    });

    // ── Player pronto (saiu do lobby)
    socket.on('player_ready', ({ roomId, slot, nick, charId, skin }) => {
      const room = rooms.get(roomId);
      if (!room) return;

      const p = room[slot];
      if (!p) return;
      p.nick   = (nick  || slot).substring(0, 16);
      p.charId = charId || 'warrior';
      p.skin   = skin   || '#ef4444';
      p.ready  = true;

      console.log(`[DUEL2D] ${slot} pronto: ${p.nick} | char:${p.charId}`);

      const p1Ready = room.p1.ready;
      const p2Ready = room.isVsBot ? true : room.p2.ready;

      if (p1Ready && p2Ready) {
        // Se vs bot, configura bot
        if (room.isVsBot) {
          room.p2.nick   = 'Sentinel';
          room.p2.charId = ['warrior','mage','ninja','demon'][Math.floor(Math.random()*4)];
          room.p2.skin   = '#ef4444';
        }
        io.to(roomId).emit('both_ready');
        setTimeout(() => startFight(room), 1000);
      } else {
        socket.emit('waiting_opponent');
      }
    });

    // ── Input do jogador
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
            p.vy       = JUMP_VEL;
            p.onGround = false;
            p.state    = 'jump';
          }
          break;

        case 'block':
          p.blocking = !p.blocking;
          p.state    = p.blocking ? 'block' : 'idle';
          break;

        case 'attack_light':
          if (p.attackCooldown <= 0 && p.state !== 'hurt') {
            doAttack(p, target, 'light', room);
          }
          break;

        case 'attack_heavy':
          if (p.attackCooldown <= 0 && p.state !== 'hurt') {
            doAttack(p, target, 'heavy', room);
          }
          break;

        case 'special':
          if (p.attackCooldown <= 0 && p.state !== 'hurt') {
            doAttack(p, target, 'special', room);
          }
          break;

        case 'ultimate':
          if (p.ult >= 100 && p.attackCooldown <= 0) {
            doAttack(p, target, 'ult', room);
          }
          break;
      }
    });

    socket.on('disconnect', () => {
      // Marca slot como desconectado — sala não destrói imediatamente (permite reconexão)
      for (const [, room] of rooms) {
        if (room.sockets.p1 === socket.id) room.sockets.p1 = null;
        if (room.sockets.p2 === socket.id) room.sockets.p2 = null;
      }
    });
  });
}

module.exports = { setupRoutes, setupSocket };
