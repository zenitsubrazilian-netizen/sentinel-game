'use strict';

// ============================================================
// COMANDO: !ping
// ============================================================
// Uso: !ping
// Resposta: 🏓 Pong!
//
// Este é o comando mais simples — serve para testar se o bot
// está online e respondendo corretamente.
//
// Estrutura padrão de todo comando:
//   module.exports = {
//     name: 'nome do comando',
//     execute: async ({ sock, from, message, ... }) => { }
//   }
// ============================================================

module.exports = {

  // Nome do comando (deve ser igual ao nome do arquivo)
  name: 'ping',

  // Função executada quando o comando é chamado
  // Recebe um objeto com tudo que pode precisar (veja handler.js)
  execute: async ({ sock, from }) => {

    // sock.sendMessage() é a função do Baileys para enviar mensagens
    // Primeiro argumento: para onde enviar (ID do chat)
    // Segundo argumento: objeto com o conteúdo da mensagem
    //   { text: '...' } → mensagem de texto simples
    await sock.sendMessage(from, { text: '🏓 Pong!' });

  },
};
