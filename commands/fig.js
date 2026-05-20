'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const {
  downloadMediaMessage
} = require('@whiskeysockets/baileys');

const FFMPEG =
  '/data/data/com.termux/files/usr/bin/ffmpeg';

function runFFmpeg(args) {

  const result = spawnSync(
    FFMPEG,
    args,
    {
      encoding: 'utf8',
      stdio: 'pipe',
    }
  );

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    throw new Error(
      result.stderr ||
      'ffmpeg falhou'
    );
  }
}

module.exports = {

  name: 'fig',

  execute: async ({
    sock,
    message,
    from,
  }) => {

    try {

      // ─────────────────────────────
      // Detecta imagem
      // ─────────────────────────────

      const imageMessage =
        message.message?.imageMessage ||
        message.message?.extendedTextMessage
          ?.contextInfo
          ?.quotedMessage
          ?.imageMessage;

      if (!imageMessage) {

        return sock.sendMessage(
          from,
          {
            text:
              '❌ Envie uma imagem com a legenda *!fig*',
          }
        );
      }

      // ─────────────────────────────
      // Download da imagem
      // ─────────────────────────────

      const buffer =
        await downloadMediaMessage(
          message,
          'buffer',
          {},
          {
            logger: {
              info: () => {},
              warn: () => {},
              error: () => {},
            },
            reuploadRequest:
              sock.updateMediaMessage,
          }
        );

      if (
        !buffer ||
        !buffer.length
      ) {

        return sock.sendMessage(
          from,
          {
            text:
              '❌ Não consegui baixar a imagem.',
          }
        );
      }

      // ─────────────────────────────
      // Arquivos temporários
      // ─────────────────────────────

      const tmpDir =
        fs.mkdtempSync(
          path.join(
            os.tmpdir(),
            'fig-'
          )
        );

      const input =
        path.join(
          tmpDir,
          'input.jpg'
        );

      const fullWebp =
        path.join(
          tmpDir,
          'full.webp'
        );

      const squareWebp =
        path.join(
          tmpDir,
          'square.webp'
        );

      fs.writeFileSync(
        input,
        buffer
      );

      // ─────────────────────────────
      // Figurinha completa
      // ─────────────────────────────

      runFFmpeg([
        '-y',
        '-i', input,

        '-vf',
        'scale=512:512:force_original_aspect_ratio=decrease,pad=512:512:(ow-iw)/2:(oh-ih)/2:color=0x00000000',

        '-vcodec', 'libwebp',
        '-lossless', '1',
        '-q:v', '80',

        fullWebp,
      ]);

      // ─────────────────────────────
      // Figurinha quadrada
      // ─────────────────────────────

      runFFmpeg([
        '-y',
        '-i', input,

        '-vf',
        'scale=512:512:force_original_aspect_ratio=increase,crop=512:512',

        '-vcodec', 'libwebp',
        '-lossless', '1',
        '-q:v', '80',

        squareWebp,
      ]);

      // ─────────────────────────────
      // Buffers
      // ─────────────────────────────

      const sticker1 =
        fs.readFileSync(
          fullWebp
        );

      const sticker2 =
        fs.readFileSync(
          squareWebp
        );

      // ─────────────────────────────
      // Envia
      // ─────────────────────────────

      await sock.sendMessage(
        from,
        {
          sticker: sticker1,
        }
      );

      await sock.sendMessage(
        from,
        {
          sticker: sticker2,
        }
      );

      console.log(
        `[FIG] 2 figurinhas enviadas para ${from}`
      );

      // ─────────────────────────────
      // Limpeza
      // ─────────────────────────────

      try {

        fs.rmSync(
          tmpDir,
          {
            recursive: true,
            force: true,
          }
        );

      } catch {}

    } catch (err) {

      console.error(
        '[FIG]',
        err
      );

      return sock.sendMessage(
        from,
        {
          text:
            `❌ Erro ao criar figurinha:\n${err.message}`,
        }
      );
    }
  },
};
