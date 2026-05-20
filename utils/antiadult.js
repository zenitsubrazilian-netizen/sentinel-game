'use strict';

// ─────────────────────────────────────────────────────────────
// ANTI-LINK ADULTO — Tolerância zero
// Detecta domínios +18 em mensagens e expulsa o usuário
// ─────────────────────────────────────────────────────────────

// Domínios adultos conhecidos
// Subdomínios são cobertos automaticamente pelo matcher
const ADULT_DOMAINS = new Set([
  // Pornografia geral
  'pornhub.com',
  'xvideos.com',
  'xnxx.com',
  'youporn.com',
  'redtube.com',
  'spankbang.com',
  'tube8.com',
  'beeg.com',
  'tnaflix.com',
  'eporner.com',
  'porn.com',
  'motherless.com',
  'xhamster.com',
  'xhamster2.com',
  'xhamster3.com',
  'brazzers.com',
  'bangbros.com',
  'naughtyamerica.com',
  'reality kings.com',
  'mofos.com',
  'bangbros.com',
  'pornone.com',
  'porndoe.com',
  'faphouse.com',
  'porntube.com',
  'xtube.com',
  'slutload.com',
  'empflix.com',
  'porndig.com',
  'txxx.com',
  'hclips.com',
  'drtuber.com',
  'youjizz.com',
  'megatube.xxx',
  'porntrex.com',
  'fuq.com',
  'sexvid.xxx',
  'sex.com',
  'freeporn.com',
  'pichunter.com',
  'bravotube.net',
  'xmovies8.com',

  // Hentai / adulto anime
  'nhentai.net',
  'hanime.tv',
  'hentaiera.com',
  'hentaihaven.xxx',
  'fakku.net',
  'hentai2read.com',
  'tsumino.com',
  'luscious.net',
  'simply-hentai.com',
  'hentaimama.io',
  'hentaibros.com',

  // TLDs adultos genéricos (domínios que terminam em .xxx/.sex/.porn/.adult)
  // tratados separado no matcher
]);

// TLDs exclusivamente adultos
const ADULT_TLDS = ['.xxx', '.sex', '.porn', '.adult'];

// Regex para extrair URLs de uma mensagem
// Captura http/https e também URLs sem protocolo (ex: pornhub.com/...)
const URL_REGEX = /(?:https?:\/\/)?(?:www\.)?([a-zA-Z0-9\-]+(?:\.[a-zA-Z0-9\-]+)*\.[a-zA-Z]{2,})(?:\/[^\s]*)?/gi;

// ─────────────────────────────────────────────────────────────
// EXTRAÇÃO DE DOMÍNIO BASE
// Remove subdomínios para comparar com a lista
// ex: m.pornhub.com → pornhub.com
//     pt.xvideos.com → xvideos.com
// ─────────────────────────────────────────────────────────────

function extractBaseDomain(hostname) {
  const parts = hostname.toLowerCase().split('.');
  // Mantém os 2 últimos segmentos (domínio + TLD)
  // ex: ['m', 'pornhub', 'com'] → 'pornhub.com'
  if (parts.length >= 2) {
    return parts.slice(-2).join('.');
  }
  return hostname.toLowerCase();
}

// ─────────────────────────────────────────────────────────────
// VERIFICAÇÃO
// ─────────────────────────────────────────────────────────────

function hasAdultLink(text) {
  if (!text) return { found: false };

  const matches = text.matchAll(URL_REGEX);

  for (const match of matches) {
    const fullHostname = (match[1] || '').toLowerCase();
    const baseDomain   = extractBaseDomain(fullHostname);

    // Verifica TLD adulto
    for (const tld of ADULT_TLDS) {
      if (fullHostname.endsWith(tld)) {
        return { found: true, domain: fullHostname };
      }
    }

    // Verifica domínio base na lista
    if (ADULT_DOMAINS.has(baseDomain)) {
      return { found: true, domain: baseDomain };
    }

    // Verifica o hostname completo também (caso de subdomínio direto na lista)
    if (ADULT_DOMAINS.has(fullHostname)) {
      return { found: true, domain: fullHostname };
    }
  }

  return { found: false };
}

// ─────────────────────────────────────────────────────────────
// AÇÃO — apaga mensagem e expulsa usuário
// ─────────────────────────────────────────────────────────────

async function handleAdultLink(sock, message, from, sender, detectedDomain) {
  const senderNum = sender.replace('@s.whatsapp.net', '').replace('@lid', '');
  const localTime = new Date().toLocaleTimeString('pt-BR');

  console.log(`[ANTIADULT] ⛔ ${localTime} | ${senderNum} | domínio: ${detectedDomain} | grupo: ${from}`);

  // 1. Apaga a mensagem
  try {
    await sock.sendMessage(from, { delete: message.key });
  } catch (err) {
    console.error('[ANTIADULT] Erro ao apagar mensagem:', err.message);
  }

  // 2. Expulsa o usuário
  try {
    await sock.groupParticipantsUpdate(from, [sender], 'remove');
    console.log(`[ANTIADULT] ✅ ${senderNum} expulso por enviar link adulto`);
  } catch (err) {
    console.error('[ANTIADULT] Erro ao expulsar usuário:', err.message);
  }

  // 3. Avisa o grupo
  try {
    await sock.sendMessage(from, {
      text: `⛔ @${senderNum} foi expulso por enviar link de conteúdo adulto.`,
      mentions: [sender],
    });
  } catch (err) {
    console.error('[ANTIADULT] Erro ao enviar aviso:', err.message);
  }
}

// ─────────────────────────────────────────────────────────────
// CHECAGEM PRINCIPAL
// Retorna true se detectou e agiu (mensagem deve ser ignorada)
// ─────────────────────────────────────────────────────────────

async function checkAdultLink(sock, message, from, sender, text) {
  const result = hasAdultLink(text);
  if (!result.found) return false;

  await handleAdultLink(sock, message, from, sender, result.domain);
  return true;
}

module.exports = { checkAdultLink };
