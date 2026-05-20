'use strict';

// ============================================================
// WELCOME HANDLER — Sistema de boas-vindas
// ============================================================

const { MAIN_GROUP, SENTINEL_PREFIX } = require('../config/system.js');

const WELCOME_BODY = [
  `👾✨ *BOAS-VINDAS* ✨👾`,
  `━━━━━━━━━━━━━━━━━━`,
  `👋 *Novo membro detectado!*`,
  `━━━━━━━━━━━━━━━━━━`,
  ``,
  `Seja bem-vindo(a) ao grupo 😎📡`,
  `Aqui a comunidade é *ativa*, *organizada* e sempre em crescimento 🚀`,
  ``,
  `📌 *Antes de qualquer coisa:*`,
  `👉 _Leia a descrição do grupo_`,
  `Ela contém regras importantes e informações do sistema.`,
  ``,
  `━━━━━━━━━━━━━━━━━━`,
  `📢 *MISSÃO DOS MEMBROS*`,
  `━━━━━━━━━━━━━━━━━━`,
  `Para ajudar o grupo a crescer, cada novo membro deve adicionar *pelo menos 2 pessoas* 👥🔥`,
  ``,
  `_Quanto mais membros ativos, melhor o grupo fica._`,
  ``,
  `━━━━━━━━━━━━━━━━━━`,
  `🤖 *SISTEMA SENTINEL-BOT*`,
  `━━━━━━━━━━━━━━━━━━`,
  `Este grupo possui um bot ativo *24h* monitorando atividades:`,
  ``,
  `⚙️ _Comandos úteis_`,
  `🎮 _Minigames_`,
  `🧠 _IA integrada_`,
  `🛡️ _Proteção e automações_`,
  ``,
  `━━━━━━━━━━━━━━━━━━`,
  `🚨 *IMPORTANTE*`,
  `━━━━━━━━━━━━━━━━━━`,
  `• Respeite as regras`,
  `• Evite spam/flood`,
  `• Não envie conteúdo proibido`,
  `• Mantenha o ambiente saudável`,
  ``,
  `━━━━━━━━━━━━━━━━━━`,
  `💬 *Agora pode interagir!* 😄`,
  `_Chama amigos, participa e fortalece o grupo._ 🔥`,
].join('\n');

const WELCOME_MESSAGE = SENTINEL_PREFIX + WELCOME_BODY;

async function handleWelcome(sock, update) {
  const { id: groupId, participants, action } = update;

  if (groupId !== MAIN_GROUP)                          return;
  if (action !== 'add')                                return;
  if (!participants || participants.length === 0)       return;

  try {
    await sock.sendMessage(groupId, {
      text:     WELCOME_MESSAGE,
      mentions: participants,
    });

    const count = participants.length;
    const names = participants.map(p => p.split('@')[0]).join(', ');
    console.log(`[WELCOME] ${count} ${count === 1 ? 'membro entrou' : 'membros entraram'}: ${names}`);

  } catch (err) {
    console.error('[WELCOME] Erro ao enviar boas-vindas:', err.message);
  }
}

module.exports = { handleWelcome };
