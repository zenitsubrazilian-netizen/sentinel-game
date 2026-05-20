'use strict';

const { callAIOnce }    = require('../utils/ai.js');
const { getRawMessages } = require('../utils/groupMemory.js');

// ─────────────────────────────────────────────────────────────
// DEDUPLICAÇÃO
// ─────────────────────────────────────────────────────────────

const processedIds = new Set();

setInterval(() => {
  if (processedIds.size > 2000) processedIds.clear();
}, 60 * 60_000);

// ─────────────────────────────────────────────────────────────
// PROMPT DE RESUMO
// ─────────────────────────────────────────────────────────────

const SUMMARY_SYSTEM = `Você é um assistente de resumo de conversas de WhatsApp.
Sua tarefa é resumir de forma objetiva e clara o que foi discutido.

REGRAS:
- Seja direto e conciso
- Não repita mensagens literalmente
- Não invente informações
- Não adicione opiniões ou julgamentos
- Capture os principais assuntos, decisões, eventos e informações compartilhadas
- Use bullet points curtos
- Se houver piadas ou memes relevantes, mencione brevemente
- Máximo de 10 bullet points
- Responda em português

FORMATO DE SAÍDA:
📋 *Resumo da conversa:*

• [ponto 1]
• [ponto 2]
...

Nada mais. Só o resumo.`;

// ─────────────────────────────────────────────────────────────
// GERAÇÃO DO RESUMO — usa o router via callAIOnce
// ─────────────────────────────────────────────────────────────

async function gerarResumo(mensagens) {
  const { TIMEZONE } = require('../config/system.js');

  const formatted = mensagens
    .map(m => {
      const time = new Date(m.ts).toLocaleTimeString('pt-BR', {
        hour:     '2-digit',
        minute:   '2-digit',
        timeZone: TIMEZONE,
      });
      return `[${time}] ${m.name}: ${m.content}`;
    })
    .join('\n');

  return callAIOnce(
    'resumir',
    SUMMARY_SYSTEM,
    `Resuma as seguintes mensagens:\n\n${formatted}`,
    800,
    0.3,
  );
}

// ─────────────────────────────────────────────────────────────
// COMANDO
// ─────────────────────────────────────────────────────────────

module.exports = {
  name: 'resumirchat',
  execute: async ({ sock, from, sender, message, isGroup }) => {

    if (!isGroup) {
      return sock.sendMessage(from, {
        text: 'Esse comando só funciona em grupos.',
      });
    }

    // ── Deduplicação
    const msgId = message.key?.id;
    if (msgId) {
      if (processedIds.has(msgId)) {
        console.log(`[RESUMIRCHAT] Duplicata ignorada: ${msgId}`);
        return;
      }
      processedIds.add(msgId);
    }

    // ── Busca mensagens do grupo
    const todasMensagens = getRawMessages(from);

    if (!todasMensagens || todasMensagens.length === 0) {
      return sock.sendMessage(from, {
        text: 'Ainda não tenho mensagens suficientes desse grupo para resumir.',
      });
    }

    // ── Encontra última mensagem desse usuário
    const authorKey = sender.split('@')[0].slice(-4);
    const agora     = Date.now();

    let ultimaMsgTs = null;
    for (let i = todasMensagens.length - 1; i >= 0; i--) {
      const m = todasMensagens[i];
      if (m.author === authorKey && agora - m.ts > 3000) {
        ultimaMsgTs = m.ts;
        break;
      }
    }

    // ── Filtra mensagens após a última participação
    let mensagensParaResumir;

    if (ultimaMsgTs) {
      mensagensParaResumir = todasMensagens.filter(m => m.ts > ultimaMsgTs);

      if (mensagensParaResumir.length === 0) {
        return sock.sendMessage(from, {
          text: 'Não rolou nada novo desde a sua última mensagem.',
        });
      }

      const { TIMEZONE } = require('../config/system.js');
      const desde = new Date(ultimaMsgTs).toLocaleTimeString('pt-BR', {
        hour: '2-digit', minute: '2-digit', timeZone: TIMEZONE,
      });

      console.log(`[RESUMIRCHAT] ${authorKey} | desde ${desde} | ${mensagensParaResumir.length} msgs`);
    } else {
      mensagensParaResumir = todasMensagens.slice(-50);
      console.log(`[RESUMIRCHAT] ${authorKey} | sem histórico | ${mensagensParaResumir.length} msgs recentes`);
    }

    // ── Gera o resumo
    const resumo = await gerarResumo(mensagensParaResumir);

    if (!resumo) {
      return sock.sendMessage(from, {
        text: '❌ Não consegui gerar o resumo agora. Tenta de novo em breve.',
      });
    }

    return sock.sendMessage(from, { text: resumo });
  },
};
