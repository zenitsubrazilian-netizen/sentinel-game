'use strict';

// ============================================================
// TRAINAI.JS — Sistema de ensinamentos da IA v2.1.0
// Subcomandos: add | view | remove
// ============================================================

const fs = require('fs');
const path = require('path');

const TRAINING_FILE = path.join(__dirname, '..', 'data', 'ai-training.json');

const OWNER_PHONE = '5518997732279';
const OWNER_LID = '115809867276438';

function isOwner(sender) {
  const raw = sender?.split('@')[0];
  return raw === OWNER_PHONE || raw === OWNER_LID;
}

function loadTrainings() {
  try {
    const dir = path.dirname(TRAINING_FILE);

    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    if (!fs.existsSync(TRAINING_FILE)) {
      return [];
    }

    const raw = fs.readFileSync(TRAINING_FILE, 'utf-8').trim();

    if (!raw || raw === '{}') {
      return [];
    }

    const data = JSON.parse(raw);

    return Array.isArray(data.trainings)
      ? data.trainings
      : [];

  } catch (err) {
    console.error('[TRAINAI] Erro ao carregar:', err.message);
    return [];
  }
}

function saveTrainings(trainings) {
  const dir = path.dirname(TRAINING_FILE);

  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const tmp = TRAINING_FILE + '.tmp';

  fs.writeFileSync(
    tmp,
    JSON.stringify({ trainings }, null, 2),
    'utf-8'
  );

  fs.renameSync(tmp, TRAINING_FILE);
}

const HELP_MSG = [
  '🧠 *TRAINAI — Subcomandos*',
  '━━━━━━━━━━━━━━━━━━',
  '',
  '➕ *!trainai add "<ensinamento>" <nome>*',
  '   Adiciona ensinamento com identificador único',
  '   💡 Ex: !trainai add "Neymar é o melhor do mundo" neymar_goat',
  '',
  '📋 *!trainai view*',
  '   Lista todos os ensinamentos cadastrados',
  '',
  '🗑️ *!trainai remove <nome>*',
  '   Remove o ensinamento pelo identificador',
  '   💡 Ex: !trainai remove neymar_goat',
  '━━━━━━━━━━━━━━━━━━',
].join('\n');

module.exports = {
  name: 'trainai',

  execute: async ({ sock, from, sender, args }) => {

    if (!isOwner(sender)) {
      return sock.sendMessage(from, {
        text: '🚫 Só o dono pode usar esse comando.'
      });
    }

    const sub = (args[0] || '').toLowerCase();

    // ========================================================
    // ADD
    // ========================================================

    if (sub === 'add') {

      const full = args.slice(1).join(' ');

      const match = full.match(/"([\s\S]+)"\s+(\S+)$/);

      if (!match) {
        return sock.sendMessage(from, {
          text: [
            '⚠️ Formato inválido.',
            '',
            '📌 Uso: *!trainai add "<ensinamento>" <nome>*',
            '💡 Ex: !trainai add "Neymar é o melhor do mundo" neymar_goat',
          ].join('\n'),
        });
      }

      const content = match[1].trim();
      const name = match[2].trim();

      if (content.length < 3) {
        return sock.sendMessage(from, {
          text: '⚠️ O ensinamento está muito curto.'
        });
      }

      if (!/^[\w\-]+$/.test(name)) {
        return sock.sendMessage(from, {
          text: [
            `⚠️ Nome inválido: *${name}*`,
            '',
            'Use apenas letras, números, _ e -',
          ].join('\n'),
        });
      }

      const trainings = loadTrainings();

      const duplicate = trainings.find(
        t => (t.name || '').toLowerCase() === name.toLowerCase()
      );

      if (duplicate) {
        return sock.sendMessage(from, {
          text: [
            `⚠️ Já existe um ensinamento com o nome *${name}*.`,
            '',
            `📝 _${duplicate.content}_`,
            '',
            `🗑️ Use *!trainai remove ${name}* para substituir.`,
          ].join('\n'),
        });
      }

      const entry = {
        name,
        content,
        date: new Date().toISOString().split('T')[0],
      };

      trainings.push(entry);

      saveTrainings(trainings);

      console.log(
        `[TRAINAI] ➕ Add: [${name}] "${content}"`
      );

      return sock.sendMessage(from, {
        text: [
          '🧠 *Ensinamento registrado!*',
          '',
          `🏷️ Nome: *${name}*`,
          `📝 Conteúdo: _${content}_`,
          `📅 Data: ${entry.date}`,
          `📦 Total: ${trainings.length}`,
        ].join('\n'),
      });
    }

    // ========================================================
    // VIEW
    // ========================================================

    if (sub === 'view') {

      const trainings = loadTrainings();

      if (trainings.length === 0) {
        return sock.sendMessage(from, {
          text: [
            '📭 Nenhum ensinamento registrado.',
            '',
            '💡 Use *!trainai add* para adicionar.',
          ].join('\n'),
        });
      }

      const lines = [
        '🧠 *ENSINAMENTOS DA IA*',
        '━━━━━━━━━━━━━━━━━━',
        `📦 Total: ${trainings.length}`,
        '',
      ];

      trainings.forEach((t, i) => {
        lines.push(`*${i + 1}. ${t.name}*`);
        lines.push(`📝 ${t.content}`);
        lines.push(`📅 ${t.date}`);
        lines.push('');
      });

      lines.push('━━━━━━━━━━━━━━━━━━');

      return sock.sendMessage(from, {
        text: lines.join('\n'),
      });
    }

    // ========================================================
    // REMOVE
    // ========================================================

    if (sub === 'remove') {

      const name = args[1];

      if (!name) {
        return sock.sendMessage(from, {
          text: [
            '⚠️ Informe o nome.',
            '',
            '📌 Uso: *!trainai remove <nome>*',
          ].join('\n'),
        });
      }

      const trainings = loadTrainings();

      const idx = trainings.findIndex(
        t => (t.name || '').toLowerCase() === name.toLowerCase()
      );

      if (idx === -1) {
        return sock.sendMessage(from, {
          text: [
            `❌ Nenhum ensinamento encontrado com o nome *${name}*.`,
          ].join('\n'),
        });
      }

      const [removed] = trainings.splice(idx, 1);

      saveTrainings(trainings);

      console.log(
        `[TRAINAI] 🗑️ Remove: [${removed.name}]`
      );

      return sock.sendMessage(from, {
        text: [
          '🗑️ *Ensinamento removido!*',
          '',
          `🏷️ Nome: *${removed.name}*`,
          `📝 ${removed.content}`,
          `📦 Restam: ${trainings.length}`,
        ].join('\n'),
      });
    }

    return sock.sendMessage(from, {
      text: HELP_MSG
    });
  },
};
