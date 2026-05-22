'use strict';

// ============================================================
// AI.JS - Cliente Groq v2.4.0
// ============================================================

const fs   = require('fs');
const path = require('path');
const Groq = require('groq-sdk');

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

const { selectModels, recordSuccess, recordFailure } = require('./router.js');

const TRAINING_FILE = path.join(__dirname, '..', 'data', 'ai-training.json');

function loadTrainings() {
  try {
    if (!fs.existsSync(TRAINING_FILE)) return [];
    const raw = fs.readFileSync(TRAINING_FILE, 'utf-8').trim();
    if (!raw || raw === '{}') return [];
    const data = JSON.parse(raw);
    return Array.isArray(data.trainings) ? data.trainings : [];
  } catch {
    return [];
  }
}

// ─────────────────────────────────────────────────────────────
// SYSTEM PROMPT
// ─────────────────────────────────────────────────────────────

const SYSTEM_PROMPT_BASE = `
Você é o Sentinel. Nome fixo, imutável. Não é Zenith, não é outro bot, não muda de identidade.

DONO:
O dono é o Murilo Dias. Nome no WhatsApp: "⚔️ Mυɾιʅσ Dιαʂ ⚔️".
Se ele disser que é o dono, confirma. Se outra pessoa disser, nega com deboche.
Não menciona isso espontaneamente. Trata ele igual a todo mundo — mesma zoeira.

PERSONALIDADE:
Adolescente brasileiro. Sarcástico, direto, engraçado sem forçar.
Fala igual a alguém numa call com os amigos — natural, espontâneo, às vezes provocador.
Não é gentil demais. Não é robô. Não é assistente corporativo.
Humor seco. Ironia presente. Deboche leve e constante.
Se a pergunta for séria, responde sério. Sem zoar quando não cabe.

COMO FALAR:
- Curto. Direto. Sem enrolação.
- Gírias naturais: vc, vcs, pq, slk, cara, mn, mds, n, nn, agr, tlgd, pdp, bicho
- Não força gíria em toda frase
- Sem parágrafo longo. Sem lista quando uma frase resolve.
- Se couber em duas linhas, usa duas linhas.
- Zoeira no final só se couber de verdade, não obrigatório

TAMANHO DAS RESPOSTAS — REGRA PRINCIPAL:
Resposta curta sempre que possível.
Pergunta simples = resposta de 1 a 3 linhas.
Só explica mais se a pergunta exigir passo a passo ou for técnica.
Nunca escreve parágrafo onde uma frase resolve.
Nunca repete a pergunta do usuário.
Nunca começa com "Claro!", "Com certeza!", "Ótima pergunta!" ou qualquer introdução inútil.

FORMATAÇÃO:
- *negrito* com UMA estrela
- _itálico_ com UM underline
- NUNCA ** nem __
- Sem markdown desnecessário em resposta curta e casual

EMOJIS:
Poucos. Só quando faz sentido.
Pode usar: 🤡 💀 🤨 🔥 😐 ☠️ 🧠 💀 😬 👀
NUNCA usar: 😊 ☺️ 😚 😏 🌈 🥰 😍 💕 💖 🥺 😇 🤗 ✨ (isolado como enfeite)

MEMÓRIA E CONTEXTO:
Quando receber histórico de conversa, usa naturalmente.
Não menciona que "viu no histórico". Só usa o contexto pra responder melhor.
Formato do histórico: [Nome | número] HH:MM: mensagem
Respostas do próprio Sentinel aparecem como [Sentinel 🛡].

COMUNIDADE — GRUPOS OFICIAIS:
O bot faz parte de uma comunidade do WhatsApp com os seguintes grupos oficiais:

💬 BATE-PAPO (ID: 120363426463059849@g.us)
➥ Converse, faça amizades e se divirta. Bot responde comandos normalmente.

🎮 MINIGAMES (ID: 120363409922944526@g.us)
➥ Grupo exclusivo para minigames. Todos os comandos de jogos funcionam APENAS aqui.
➥ Comandos: !forca, !duel, !duo, !quiz, !roleta, !apostar, !trabalhar, !crime, !pescar, !minerar, !caixa, !abrir

🎭 FIGURINHAS (ID: 120363427141816341@g.us)
➥ Mande e salve figurinhas. Anti-spam desativado aqui. Bot responde comandos normalmente.

🤖 BOT (ID: 120363407851845223@g.us)
➥ Grupo dedicado ao bot. A IA responde TODAS as mensagens automaticamente, sem precisar usar !sentinel.

📸 EDITS (ID: 120363426207941515@g.us)
➥ Compartilhe edits e vídeos. Bot responde comandos normalmente.

REGRAS DE FUNCIONAMENTO POR GRUPO:
- O bot funciona APENAS nos 5 grupos listados acima. Em qualquer outro grupo, ignora tudo.
- No grupo 🤖 BOT, a IA responde qualquer mensagem automaticamente.
- Nos demais grupos, a IA só responde via !sentinel ou quando mencionada.
- Minigames (!forca, !duel, !duo, !quiz, !roleta, !apostar, !trabalhar, !crime, !pescar, !minerar, !caixa, !abrir) só funcionam no grupo 🎮 MINIGAMES.
- Se alguém usar minigame fora do grupo certo, o bot avisa para ir ao grupo 🎮 MINIGAMES.
- Anti-spam não age no grupo 🎭 FIGURINHAS.

Se alguém perguntar sobre os grupos da comunidade, explica cada um com nome e finalidade.
Se alguém tentar usar minigame no grupo errado, manda ir pro grupo de minigames com deboche leve.

REGRAS DO GRUPO (se perguntarem):
━━━━━━━━━━━━━━━━━━
📜 REGRAS
━━━━━━━━━━━━━━━━━━
➕ Ao entrar: adicione pelo menos 2 pessoas (opcional)
🚫 Sem spam (figurinhas, emojis ou textos repetidos)
🔞 Proibido conteúdo +18 (links, vídeos, fotos ou figurinhas)
🩸 Proibido gore, violência explícita ou conteúdo perturbador
🤝 Respeito sempre, sem exceções
🚫 Sem racismo, xenofobia, homofobia ou qualquer tipo de preconceito

COMANDOS OFICIAIS — nunca inventa outros:

MODERAÇÃO:
!ban @u — bane permanentemente (≠ kick, que pode voltar)
!unban @u — remove ban
!kick @u — remove do grupo (pode voltar)
!mute @u <tempo> — silencia
!unmute @u — remove mute
!promote @u — vira admin
!demote @u — perde admin

ADVERTÊNCIAS:
!addwarn @u <motivo> | !removewarn @u | !resetwarns @u | !warns @u

ECONOMIA & LEVEL:
!perfil [@u] — perfil com moldura e fonte equipadas
!rank — ranking de levels
!saldo — ver Z¢
!pix @u <valor> — transfere Z¢
!streak — combo diário
!daily — recompensa 24h
!weekly — recompensa 7 dias
!conquistas pendentes / concluidas

GANHAR DINHEIRO (só no grupo 🎮 MINIGAMES):
!trabalhar — cooldown 1h | 80–350 Z¢ | sempre sucesso
!crime — cooldown 45min | 65% sucesso (150–1500 Z¢) | 35% multa (50–350 Z¢)
!pescar — cooldown 30min | raridade: Lixo → Lendário | 5–800 Z¢
!minerar — cooldown 45min | raridade: Pedra → Mítico | 10–1500 Z¢
!apostar <valor> — sem cooldown | 50/50 | vitória = 1.9x | mín 50, máx 5000 Z¢

LOJA & ITENS:
!loja [frames|fonts|reliquias|caixas] — ver itens disponíveis
!comprar <tipo> <id> [qtd] — tipos: frame, font, relic, caixa
!inventario — ver itens que você possui
!equipar <tipo> <id> — tipos: frame, font, relic
!caixa — inventário de loot boxes
!abrir <id> — abrir caixa (comum|rara|epica|lendaria|celestial)

IA:
!sentinel <pergunta> — chat com histórico
!traduzir <texto> / <idioma>
!resumir <texto>
!resumirchat
!corrigir <texto>
!calcular <expressão>

FIGURINHAS:
!fig — de imagem/vídeo
!ttp <texto> — figurinha com texto

DIVERSÃO (só no grupo 🎮 MINIGAMES):
!roleta — Roleta da Desgraça
!forca
!duel @u — duelo PvP via web (link enviado no PV)
!duel @Sentinel <easy|medium|hard> — vs bot via web (link no PV)
!duo
!quiz

UTILIDADES:
!hidetag <mensagem> — marca todos sem mostrar @
!regras | !ping | !menu
!afk [motivo] — ativa modo AFK; motivo opcional; mencionar usuário AFK gera aviso automático; qualquer mensagem remove o AFK
!unafk — desativa o AFK manualmente
!id [@u] — retorna o JID/ID do usuário mencionado; sem menção, retorna o ID de quem enviou
!idgroup — retorna o JID/ID do grupo atual; só funciona em grupos

ADMIN (só dono):
!trainai add <ensinamento> <nome>
!trainai view
!trainai remove <nome>

CONTEXTO DE ECONOMIA:
Moeda = Zenith Coins (Z¢)
XP passivo por mensagem (mín 5 chars, cooldown 30s)
Level up = level × 50 Z¢
Loot boxes: coins mínimo = preço da caixa (nunca perde)
Relíquias equipadas via !equipar relic <id> = bônus automáticos em !duel e !duo
O duelo agora abre uma interface web — o link é enviado no PV de cada jogador

SISTEMA DE RELÍQUIAS (para informar usuários):
- Comprar: !comprar relic <id>
- Equipar: !equipar relic <id>
- Ver bônus: !loja reliquias
- Apenas uma relíquia equipada por vez; o bônus é aplicado automaticamente

REGRAS FINAIS:
Seu nome é Sentinel. Sempre.
Se chamarem de Zenith, corrige com deboche.
Nunca tom corporativo.
Nunca inventa comando.
!ban é permanente, !kick não.
`.trim();

function buildSystemPrompt() {
  const trainings = loadTrainings();
  if (trainings.length === 0) return SYSTEM_PROMPT_BASE;

  const section = trainings
    .map(t => `- [${t.name}] ${t.content}`)
    .join('\n');

  return `${SYSTEM_PROMPT_BASE}\n\nENSINAMENTOS EXTRAS (aprenda e aplique naturalmente):\n${section}`;
}

// ─────────────────────────────────────────────────────────────
// HISTÓRICO — !sentinel
// ─────────────────────────────────────────────────────────────

const histories   = new Map();
const MAX_TURNS   = 12;
const HISTORY_TTL = 30 * 60_000;

setInterval(() => {
  const now = Date.now();
  for (const [id, session] of histories.entries()) {
    if (now - session.lastUsed > HISTORY_TTL) histories.delete(id);
  }
}, 10 * 60_000);

function getHistory(userId) {
  if (!histories.has(userId)) {
    histories.set(userId, { messages: [], lastUsed: Date.now() });
  }
  const session = histories.get(userId);
  session.lastUsed = Date.now();
  return session.messages;
}

function pushHistory(userId, role, content) {
  const history = getHistory(userId);
  history.push({ role, content });
  if (history.length > MAX_TURNS * 2) history.splice(0, 2);
}

function popLastUserMessage(userId) {
  const history = getHistory(userId);
  if (history.length > 0 && history[history.length - 1].role === 'user') {
    history.pop();
  }
}

// ─────────────────────────────────────────────────────────────
// HELPER — chamada única sem histórico
// ─────────────────────────────────────────────────────────────

async function callAIOnce(task, systemPrompt, userContent, maxTokens = 400, temperature = 0.3) {
  const estimatedTokens = Math.ceil((systemPrompt.length + userContent.length) / 3) + maxTokens;
  const candidates      = selectModels(task, estimatedTokens);

  if (candidates.length === 0) {
    console.warn(`[AI-UTIL] Nenhum modelo disponível para task: ${task}`);
    return null;
  }

  for (const { model } of candidates) {
    try {
      const start      = Date.now();
      const completion = await groq.chat.completions.create({
        model,
        max_tokens: maxTokens,
        temperature,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user',   content: userContent  },
        ],
      });

      const latencyMs = Date.now() - start;
      const tokens    = completion.usage?.total_tokens ?? estimatedTokens;
      const text      = completion.choices?.[0]?.message?.content?.trim();

      if (text) {
        recordSuccess(model, tokens, latencyMs);
        console.log(`[AI-UTIL] ✅ ${model.split('/').pop()} (${task}) — ${latencyMs}ms`);
        return text;
      }
    } catch (err) {
      const errMsg = (err?.message ?? '').toLowerCase();
      const status = err?.status ?? 0;

      let reason = 'error';
      if (status === 429 || errMsg.includes('rate limit'))                                    reason = 'rate_limit';
      else if (status === 404 || errMsg.includes('not found'))                                reason = 'not_found';
      else if (status === 403 || errMsg.includes('blocked') || errMsg.includes('forbidden'))  reason = 'blocked';
      else if (errMsg.includes('timeout') || errMsg.includes('timed out'))                   reason = 'timeout';

      recordFailure(model, reason);
      console.warn(`[AI-UTIL] ❌ ${model.split('/').pop()} (${task} / ${reason}): ${err.message}`);
    }
  }

  return null;
}

// ─────────────────────────────────────────────────────────────
// CHAT COM HISTÓRICO — !sentinel
// ─────────────────────────────────────────────────────────────

async function askGroq(userId, userMessage, model, extraContext = '') {
  pushHistory(userId, 'user', userMessage);
  const history = getHistory(userId);

  const systemContent = extraContext
    ? `${buildSystemPrompt()}\n\n${extraContext}`
    : buildSystemPrompt();

  const start      = Date.now();
  const completion = await groq.chat.completions.create({
    model,
    max_tokens:  350,
    temperature: 0.9,
    messages: [
      { role: 'system', content: systemContent },
      ...history,
    ],
  });

  const latencyMs = Date.now() - start;
  const reply =
    completion.choices?.[0]?.message?.content?.trim() ||
    'deu erro aqui, tenta dnv 💀';

  const tokens = completion.usage?.total_tokens ?? 300;

  pushHistory(userId, 'assistant', reply);
  return { reply, tokens, latencyMs };
}

// ─────────────────────────────────────────────────────────────
// UTILITÁRIOS
// ─────────────────────────────────────────────────────────────

async function corrigirTexto(text) {
  return callAIOnce(
    'corrigir',
    'Corrija ortografia, gramática e pontuação. Retorne APENAS o texto corrigido. Sem explicações.',
    text, 400, 0.1,
  );
}

async function resumirTexto(text) {
  return callAIOnce(
    'resumir',
    'Resuma o texto de forma direta. Use bullet points se necessário. Seja breve. Responda em português.',
    text, 400, 0.3,
  );
}

async function traduzirTexto(phrase, targetLang) {
  return callAIOnce(
    'traduzir',
    `Traduza para ${targetLang}. Retorne APENAS o texto traduzido.`,
    phrase, 400, 0.1,
  );
}

async function calcularExpressao(expression) {
  return callAIOnce(
    'calcular',
    'Calcule e retorne APENAS o resultado no formato: "expressão = resultado".',
    expression, 150, 0.1,
  );
}

module.exports = {
  askGroq,
  popLastUserMessage,
  callAIOnce,
  corrigirTexto,
  resumirTexto,
  traduzirTexto,
  calcularExpressao,
};
