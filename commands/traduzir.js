'use strict';

const { traduzirTexto } = require('../utils/ai.js');
const { translate }     = require('@vitalets/google-translate-api');

const LANGUAGE_CODES = {
  'inglês': 'en', 'ingles': 'en', 'english': 'en',
  'espanhol': 'es', 'português': 'pt', 'portugues': 'pt',
  'francês': 'fr', 'frances': 'fr', 'alemão': 'de', 'alemao': 'de',
  'italiano': 'it', 'japonês': 'ja', 'japones': 'ja',
  'chinês': 'zh', 'chines': 'zh', 'coreano': 'ko', 'russo': 'ru',
  'árabe': 'ar', 'arabe': 'ar', 'hindi': 'hi', 'turco': 'tr',
};

module.exports = {
  name: 'traduzir',
  execute: async ({ sock, from, text }) => {
    const content = text.replace(/^!traduzir\s*/i, '').trim();

    if (!content.includes('/')) {
      return sock.sendMessage(from, { text: 'Uso: !traduzir <frase> / <idioma>' });
    }

    const lastSlash  = content.lastIndexOf('/');
    const phrase     = content.slice(0, lastSlash).trim();
    const targetLang = content.slice(lastSlash + 1).trim();

    if (!phrase || !targetLang) {
      return sock.sendMessage(from, { text: 'Uso: !traduzir <frase> / <idioma>' });
    }

    console.log(`[TRADUZIR] "${phrase}" → ${targetLang}`);

    // Tenta via IA com fallback em cascata
    const aiResult = await traduzirTexto(phrase, targetLang);
    if (aiResult) {
      return sock.sendMessage(from, { text: aiResult });
    }

    // Último fallback: Google Translate
    try {
      const langCode = LANGUAGE_CODES[targetLang.toLowerCase()] || targetLang;
      const google   = await translate(phrase, { to: langCode });
      return sock.sendMessage(from, { text: google.text });
    } catch {
      return sock.sendMessage(from, { text: 'Não foi possível traduzir no momento.' });
    }
  },
};
