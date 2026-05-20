'use strict';

module.exports = {
  name: 'regras',
  execute: async ({ sock, from }) => {
    const msg = [
      `━━━━━━━━━━━━━━━━━━`,
      `📜 REGRAS`,
      `━━━━━━━━━━━━━━━━━━`,
      `➕ Ao entrar: adicione pelo menos 2 pessoas (opcional)`,
      `🚫 Sem spam (figurinhas, emojis ou textos repetidos)`,
      `🔞 Proibido conteúdo +18 (links, vídeos, fotos ou figurinhas)`,
      `🩸 Proibido gore, violência explícita ou conteúdo perturbador`,
      `🤝 Respeito sempre, sem exceções`,
      `🚫 Sem racismo, xenofobia, homofobia ou qualquer tipo de preconceito`,
    ].join('\n');

    return sock.sendMessage(from, { text: msg });
  },
};
