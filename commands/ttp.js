'use strict';

// ============================================================
// TTP.JS — Figurinha de texto v3.0.0
// Reescrito do zero para resolver:
//   • Círculos pontilhados em emojis
//   • Texto cortado / fora da imagem
//   • Alinhamento inconsistente
//   • Emojis sobrepostos ao texto
// ============================================================

const fs    = require('fs');
const os    = require('os');
const path  = require('path');
const https = require('https');
const { spawnSync } = require('child_process');

// ─────────────────────────────────────────────────────────────
// CONSTANTES
// ─────────────────────────────────────────────────────────────

const SIZE      = 512;
const PADDING   = 48;                     // px de margem em cada lado
const USABLE_W  = SIZE - PADDING * 2;     // 416 px utilizáveis
const USABLE_H  = SIZE - PADDING * 2;
const MAX_CHARS = 200;

// Font stack que o rsvg-convert consegue resolver no Termux
const FONT      = 'Liberation Sans, Arial, FreeSans, DejaVu Sans, sans-serif';

// Regex: detecta SOMENTE apresentação visual de emoji
// (não inclui símbolos de texto que têm codepoint de emoji)
const EMOJI_RE  = /\p{Emoji_Presentation}|\p{Extended_Pictographic}/gu;

const RSVG   = '/data/data/com.termux/files/usr/bin/rsvg-convert';
const FFMPEG = '/data/data/com.termux/files/usr/bin/ffmpeg';

// ─────────────────────────────────────────────────────────────
// ESTIMATIVA DE LARGURA
// Calibrada para Liberation Sans Bold
// ─────────────────────────────────────────────────────────────

const NARROW  = new Set([...'iljItf!|()[]{}\'".,;: ']);
const WIDE    = new Set([...'WMwm@']);
const MEDIUM  = new Set([...'ABCDEFGHKNOPRSUVXY0123456789abcdeghknopqrsuvxy&%#$?-_']);

function charRatio(ch) {
  // Emoji conta como quadrado cheio
  if (EMOJI_RE.test(ch)) return 1.10;
  if (WIDE.has(ch))      return 0.80;
  if (NARROW.has(ch))    return ch === ' ' ? 0.28 : 0.32;
  if (MEDIUM.has(ch))    return 0.68;
  return 0.62;
}

// Reseta o lastIndex após cada teste (flags globais retêm estado)
EMOJI_RE.lastIndex = 0;

function textWidth(str, fs) {
  return [...str].reduce((acc, ch) => {
    EMOJI_RE.lastIndex = 0;
    return acc + charRatio(ch) * fs;
  }, 0);
}

// ─────────────────────────────────────────────────────────────
// QUEBRA DE LINHA
// Margem de segurança de 6% para compensar imprecisão da estimativa
// ─────────────────────────────────────────────────────────────

function wrapLines(text, fs) {
  const maxW  = USABLE_W * 0.94;
  const words = text.split(/\s+/).filter(Boolean);
  const lines = [];
  let   cur   = '';

  for (const word of words) {
    const test = cur ? `${cur} ${word}` : word;

    if (textWidth(test, fs) <= maxW) {
      cur = test;
      continue;
    }

    // Palavra isolada já excede a linha → quebra forçada por caractere
    if (textWidth(word, fs) > maxW && word.length > 28) {
      if (cur) { lines.push(cur); cur = ''; }
      let chunk = '';
      for (const ch of [...word]) {
        const candidate = chunk + ch;
        if (textWidth(candidate, fs) <= maxW) {
          chunk = candidate;
        } else {
          if (chunk) lines.push(chunk);
          chunk = ch;
        }
      }
      cur = chunk;
    } else {
      if (cur) lines.push(cur);
      cur = word;
    }
  }

  if (cur) lines.push(cur);
  return lines.length ? lines : [''];
}

// ─────────────────────────────────────────────────────────────
// TAMANHO DE FONTE ÓTIMO
// Garante que todo o bloco de texto cabe no canvas
// ─────────────────────────────────────────────────────────────

function bestFont(text) {
  for (let fz = 112; fz >= 16; fz -= 2) {
    const lines   = wrapLines(text, fz);
    const lineH   = Math.round(fz * 1.35);
    const totalH  = lines.length * lineH;
    const maxLineW = Math.max(...lines.map(l => textWidth(l, fz)));

    if (totalH <= USABLE_H && maxLineW <= USABLE_W) {
      return { fz, lines, lineH };
    }
  }
  // Fallback extremo: nunca deve chegar aqui com MAX_CHARS=200
  const fz = 16, lines = wrapLines(text, fz);
  return { fz, lines, lineH: 22 };
}

// ─────────────────────────────────────────────────────────────
// EMOJI — download via Twemoji
// Tenta com e sem U+FE0F (variação de apresentação)
// Retorna null se falhar — nunca lança erro
// ─────────────────────────────────────────────────────────────

function emojiCodepoint(emoji) {
  return Array.from(emoji)
    .map(c => c.codePointAt(0).toString(16).toLowerCase())
    .join('-');
}

function dlEmoji(url, timeoutMs = 4500) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout')), timeoutMs);
    const req   = https.get(url, res => {
      clearTimeout(timer);
      if (res.statusCode !== 200) {
        res.resume();
        return reject(new Error(`HTTP ${res.statusCode}`));
      }
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks)));
      res.on('error', reject);
    });
    req.on('error', e => { clearTimeout(timer); reject(e); });
  });
}

async function fetchEmoji(emoji) {
  const base = 'https://cdnjs.cloudflare.com/ajax/libs/twemoji/14.0.2/svg';

  // Constrói variantes do codepoint (com e sem fe0f)
  const allPoints = Array.from(emoji).map(c => c.codePointAt(0));
  const cp1       = allPoints.map(p => p.toString(16)).join('-');
  const cp2       = allPoints.filter(p => p !== 0xfe0f).map(p => p.toString(16)).join('-');

  const variants = [...new Set([cp1, cp2])].filter(Boolean);

  for (const cp of variants) {
    try {
      const buf = await dlEmoji(`${base}/${cp}.svg`);
      if (buf && buf.length > 50) return buf; // SVG válido
    } catch { /* tenta a próxima variante */ }
  }
  return null;
}

// Cache em memória para evitar downloads repetidos na mesma execução
const emojiCache = new Map();

async function getEmoji(emoji) {
  const key = emojiCodepoint(emoji);
  if (emojiCache.has(key)) return emojiCache.get(key);
  const result = await fetchEmoji(emoji);
  emojiCache.set(key, result); // armazena null também (falha conhecida)
  return result;
}

// ─────────────────────────────────────────────────────────────
// TOKENIZAÇÃO — separa texto e emojis em segmentos
// NUNCA coloca caractere de emoji dentro de <text> SVG
// (causa os círculos pontilhados)
// ─────────────────────────────────────────────────────────────

function tokenize(line) {
  const tokens = [];
  let   last   = 0;

  // Reseta o lastIndex antes de iterar
  EMOJI_RE.lastIndex = 0;
  const matches = [...line.matchAll(EMOJI_RE)];

  for (const m of matches) {
    if (m.index > last) {
      const txt = line.slice(last, m.index);
      if (txt) tokens.push({ t: 'text', v: txt });
    }
    tokens.push({ t: 'emoji', v: m[0] });
    last = m.index + m[0].length;
  }
  if (last < line.length) {
    const txt = line.slice(last);
    if (txt) tokens.push({ t: 'text', v: txt });
  }
  return tokens;
}

// ─────────────────────────────────────────────────────────────
// RENDERIZA UMA LINHA NO SVG
// ─────────────────────────────────────────────────────────────

function escXml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

async function renderLine(line, fz, baselineY) {
  const tokens = tokenize(line);
  const hasEmoji = tokens.some(t => t.t === 'emoji');

  // ── Linha sem emoji: text-anchor="middle" — SVG centraliza perfeitamente
  if (!hasEmoji) {
    return (
      `  <text` +
      ` x="${SIZE / 2}"` +
      ` y="${baselineY.toFixed(2)}"` +
      ` text-anchor="middle"` +
      ` font-size="${fz}"` +
      ` font-family="${FONT}"` +
      ` font-weight="bold"` +
      ` fill="#111111"` +
      `>${escXml(line)}</text>\n`
    );
  }

  // ── Linha mista (texto + emoji): posicionamento manual centralizado

  // Tamanho visual do emoji: alinha com o cap-height do texto
  const eSz = fz * 1.05;

  // Calcula largura total da linha
  let totalW = 0;
  for (const tok of tokens) {
    totalW += tok.t === 'emoji' ? eSz : textWidth(tok.v, fz);
  }

  // x inicial para centralizar
  let x   = SIZE / 2 - totalW / 2;
  let out = '';

  for (const tok of tokens) {
    if (tok.t === 'text') {
      const w = textWidth(tok.v, fz);
      out +=
        `  <text` +
        ` x="${x.toFixed(2)}"` +
        ` y="${baselineY.toFixed(2)}"` +
        ` text-anchor="start"` +
        ` font-size="${fz}"` +
        ` font-family="${FONT}"` +
        ` font-weight="bold"` +
        ` fill="#111111"` +
        `>${escXml(tok.v)}</text>\n`;
      x += w;

    } else {
      // Emoji: topo do image = baseline - cap-height (≈ fz * 0.80)
      const imgY = baselineY - fz * 0.82;
      const buf  = await getEmoji(tok.v);

      if (buf) {
        const b64 = buf.toString('base64');
        out +=
          `  <image` +
          ` xlink:href="data:image/svg+xml;base64,${b64}"` +
          ` href="data:image/svg+xml;base64,${b64}"` +
          ` x="${x.toFixed(2)}"` +
          ` y="${imgY.toFixed(2)}"` +
          ` width="${eSz.toFixed(2)}"` +
          ` height="${eSz.toFixed(2)}"` +
          ` preserveAspectRatio="xMidYMid meet"` +
          `/>\n`;
      }
      // Se buf === null: simplesmente não renderiza o emoji
      // (evita círculos pontilhados — melhor que renderizar quebrado)

      x += eSz;
    }
  }

  return out;
}

// ─────────────────────────────────────────────────────────────
// MONTA O SVG COMPLETO
// ─────────────────────────────────────────────────────────────

async function buildSvg(text) {
  const { fz, lines, lineH } = bestFont(text);

  // Centralização vertical
  const totalH  = lines.length * lineH;
  // startY = topo do bloco de texto
  // baseline da primeira linha = startY + fz * 0.82
  const blockTop  = (SIZE - totalH) / 2;
  const firstBase = blockTop + fz * 0.82;

  let svg =
    `<svg xmlns="http://www.w3.org/2000/svg"` +
    ` xmlns:xlink="http://www.w3.org/1999/xlink"` +
    ` width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}">\n` +
    `  <rect width="${SIZE}" height="${SIZE}" fill="#ffffff"/>\n`;

  for (let i = 0; i < lines.length; i++) {
    const baseline = firstBase + i * lineH;
    svg += await renderLine(lines[i], fz, baseline);
  }

  svg += `</svg>\n`;
  return svg;
}

// ─────────────────────────────────────────────────────────────
// SVG → PNG → WEBP
// ─────────────────────────────────────────────────────────────

function svgToWebp(svgPath, outPath, tmpDir) {
  const pngPath = path.join(tmpDir, 'tmp.png');

  // SVG → PNG via rsvg-convert
  const r1 = spawnSync(RSVG, [
    '-w', String(SIZE),
    '-h', String(SIZE),
    '--background-color', '#ffffff',
    '-o', pngPath,
    svgPath,
  ], { encoding: 'utf8' });

  if (r1.status !== 0) {
    throw new Error(`rsvg-convert: ${(r1.stderr || r1.stdout || '').slice(0, 200)}`);
  }

  // PNG → WEBP via ffmpeg
  const r2 = spawnSync(FFMPEG, [
    '-y',
    '-i',              pngPath,
    '-vcodec',         'libwebp',
    '-lossless',       '1',
    '-compression_level', '6',
    '-q:v',            '100',
    '-loop',           '0',
    outPath,
  ], { encoding: 'utf8' });

  if (r2.status !== 0) {
    throw new Error(`ffmpeg: ${(r2.stderr || r2.stdout || '').slice(0, 200)}`);
  }

  return fs.readFileSync(outPath);
}

// ─────────────────────────────────────────────────────────────
// COMANDO
// ─────────────────────────────────────────────────────────────

module.exports = {
  name: 'ttp',
  execute: async ({ sock, from, text }) => {
    const content = String(text || '').replace(/^!ttp\s*/i, '').trim();

    if (!content) {
      return sock.sendMessage(from, {
        text: '❌ Uso: *!ttp <texto>*\n💡 Ex: !ttp Olá mundo 👋',
      });
    }

    if (content.length > MAX_CHARS) {
      return sock.sendMessage(from, {
        text: `❌ Máximo de ${MAX_CHARS} caracteres (você usou ${content.length}).`,
      });
    }

    let tmpDir = null;

    try {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ttp-'));

      const svgPath = path.join(tmpDir, 'sticker.svg');
      const wpPath  = path.join(tmpDir, 'sticker.webp');

      const svg = await buildSvg(content);
      fs.writeFileSync(svgPath, svg, 'utf8');

      const sticker = svgToWebp(svgPath, wpPath, tmpDir);
      await sock.sendMessage(from, { sticker });

      console.log(`[TTP] ✅ "${content.slice(0, 50)}"`);

    } catch (err) {
      console.error('[TTP] Erro:', err.message);
      await sock.sendMessage(from, {
        text: `❌ Erro ao criar figurinha:\n${err.message}`,
      });
    } finally {
      if (tmpDir) {
        try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
      }
    }
  },
};
