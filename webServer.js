'use strict';

// ============================================================
// WEBSERVER.JS — Servidor central de minigames web v1.0.0
// Rode com: node webServer.js
// Adicionar novo minigame: veja seção "REGISTRAR MINIGAME"
// ============================================================

const express  = require('express');
const http     = require('http');
const { Server } = require('socket.io');
const path     = require('path');

const app    = express();
const server = http.createServer(app);
const io     = new Server(server, { cors: { origin: '*' } });

app.use(express.json());

// ─────────────────────────────────────────────────────────────
// REGISTRO DE MINIGAMES
// Cada minigame tem:
//   id       — identificador único (usado na URL e nos arquivos)
//   file     — arquivo HTML a servir
//   handler  — módulo com { setupRoutes(app), setupSocket(io) }
// ─────────────────────────────────────────────────────────────

const MINIGAMES = [
  {
    id:      'duel',
    label:   '⚔️ Duel Arena',
    file:    'duel.html',
    handler: require('./games/duel/duelLogic.js'),
  },

  // ── TEMPLATE para novos minigames ──────────────────────────
  // {
  //   id:      'poker',
  //   label:   '🃏 Poker',
  //   file:    'poker.html',
  //   handler: require('./games/poker/pokerLogic.js'),
  // },
];

// ─────────────────────────────────────────────────────────────
// HEALTH CHECK
// ─────────────────────────────────────────────────────────────

app.get('/health', (_req, res) => {
  res.json({
    status:   'ok',
    uptime:   process.uptime(),
    games:    MINIGAMES.map(g => g.id),
    time:     new Date().toISOString(),
  });
});

// ─────────────────────────────────────────────────────────────
// LOBBY — lista todos os minigames disponíveis
// ─────────────────────────────────────────────────────────────

app.get('/', (req, res) => {
  // Se vier com ?room e ?player, é link direto para um jogo — não mostra lobby
  if (req.query.room && req.query.player) {
    return res.status(400).send(
      '<h2 style="font-family:sans-serif;padding:20px;color:red">⚠️ Acesse pelo link enviado pelo bot.</h2>'
    );
  }

  const gameLinks = MINIGAMES
    .map(g => `<li><a href="/${g.id}">${g.label}</a></li>`)
    .join('\n');

  res.send(`<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>🎮 Sentinel Games</title>
  <style>
    body{background:#0d0d1a;color:#e2e8f0;font-family:system-ui,sans-serif;
         display:flex;flex-direction:column;align-items:center;justify-content:center;
         min-height:100vh;gap:16px}
    h1{font-size:24px}
    ul{list-style:none;padding:0;display:flex;flex-direction:column;gap:10px}
    a{color:#c4b5fd;font-size:16px;text-decoration:none}
    a:hover{text-decoration:underline}
    p{color:#64748b;font-size:12px}
  </style>
</head>
<body>
  <h1>🎮 Sentinel Games</h1>
  <ul>${gameLinks}</ul>
  <p>Acesse pelo link enviado pelo bot no WhatsApp.</p>
</body>
</html>`);
});

// ─────────────────────────────────────────────────────────────
// REGISTRA ROTAS E SOCKET DE CADA MINIGAME
// ─────────────────────────────────────────────────────────────

for (const game of MINIGAMES) {
  // Rota HTML: GET /<id>?room=X&player=Y
  app.get(`/${game.id}`, (req, res) => {
    const { room, player } = req.query;
    if (!room || !['p1', 'p2'].includes(player)) {
      return res.status(400).send(
        `<h2 style="font-family:sans-serif;padding:20px;color:red">⚠️ Link inválido para ${game.label}.</h2>`
      );
    }
    res.sendFile(path.join(__dirname, 'games', game.id, game.file));
  });

  // Rotas REST do minigame (ex: POST /duel/room, GET /duel/room/:id/result)
  if (typeof game.handler.setupRoutes === 'function') {
    game.handler.setupRoutes(app);
    console.log(`[WEBSERVER] 🗺️  Rotas REST registradas: /${game.id}`);
  }

  // Eventos Socket.IO do minigame
  if (typeof game.handler.setupSocket === 'function') {
    game.handler.setupSocket(io);
    console.log(`[WEBSERVER] 🔌 Socket registrado: /${game.id}`);
  }

  console.log(`[WEBSERVER] ✅ Minigame carregado: ${game.label} → /${game.id}`);
}

// ─────────────────────────────────────────────────────────────
// START
// ─────────────────────────────────────────────────────────────

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log('');
  console.log('╔═══════════════════════════════════╗');
  console.log('║   🎮 SENTINEL WEBSERVER v1.0.0    ║');
  console.log(`║   Porta: ${String(PORT).padEnd(26)}║`);
  console.log('╠═══════════════════════════════════╣');
  MINIGAMES.forEach(g => {
    console.log(`║   ${(g.label + ' → /' + g.id).padEnd(34)}║`);
  });
  console.log('╚═══════════════════════════════════╝');
  console.log('');
});
