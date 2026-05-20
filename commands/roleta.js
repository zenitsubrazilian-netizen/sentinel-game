'use strict';

// ============================================================
// COMANDO ROLETA DA DESGRAÇA v1.0.0
// ============================================================

const {
  checkCooldown,
  spin,
  spinLoop,
  aplicarXP,
  processarEfeito,
  processarReacaoCadeia,
  CATEGORIA_LABEL,
  msParaHMS,
} = require('../utils/roleta.js');

// ─────────────────────────────────────────────────────────────
// ANIMAÇÃO DE SPIN (texto)
// ─────────────────────────────────────────────────────────────

function buildResultMsg(outcome, xpFinal, efeitoMsg, extraLines = []) {
  const catLabel  = CATEGORIA_LABEL[outcome.categoria] || '🎲 DESCONHECIDO';
  const sinal     = xpFinal >= 0 ? '+' : '';
  const xpDisplay = outcome.xp === null && xpFinal === 0
    ? '± 0 XP'
    : `${sinal}${xpFinal} XP`;

  const lines = [
    `🎰 *ROLETA DA DESGRAÇA*`,
    `━━━━━━━━━━━━━━━━━━`,
    ``,
    `${outcome.emoji} *${outcome.nome}*`,
    ``,
    `📊 Categoria: ${catLabel}`,
    ``,
    `💫 *${xpDisplay}*`,
    ``,
    `💬 _${outcome.descricao}_`,
  ];

  if (efeitoMsg) {
    lines.push(``);
    lines.push(`⚠️ EFEITO ESPECIAL:`);
    lines.push(efeitoMsg);
  }

  for (const extra of extraLines) {
    lines.push(extra);
  }

  lines.push(``);
  lines.push(`━━━━━━━━━━━━━━━━━━`);
  lines.push(`💡 Próximo giro disponível em 30 minutos`);

  return lines.join('\n');
}

// ─────────────────────────────────────────────────────────────
// EXECUTE
// ─────────────────────────────────────────────────────────────

module.exports = {
  name: 'roleta',

  execute: async ({ sock, from, sender, isGroup }) => {

    if (!isGroup) {
      return sock.sendMessage(from, {
        text: '🎰 A Roleta da Desgraça só funciona em grupos.\n\n_A vergonha precisa de plateia._',
      });
    }

    const senderNum = sender.split('@')[0];

    // ── Verificar cooldown ──────────────────────────────────
    const { getUser } = require('../utils/economy.js');
    const user = getUser(sender);
    const cooldown = checkCooldown(user);

    if (!cooldown.podeJogar) {
      return sock.sendMessage(from, {
        text: [
          `🎰 *ROLETA DA DESGRAÇA*`,
          `━━━━━━━━━━━━━━━━━━`,
          ``,
          `⏳ Calma lá, @${senderNum}.`,
          ``,
          `A roleta ainda está se recuperando do trauma que você causou.`,
          ``,
          `🕐 Tempo restante: *${cooldown.restanteStr}*`,
          ``,
          `━━━━━━━━━━━━━━━━━━`,
          `_Paciência é uma virtude. Você não tem, mas aprenda._`,
        ].join('\n'),
        mentions: [sender],
      });
    }

    // ── Aviso de giro grátis ────────────────────────────────
    const prefixGratis = cooldown.gratuito
      ? `🎟️ _Usando giro grátis!_\n\n`
      : '';

    // ── Sortear ─────────────────────────────────────────────
    let outcome = spin(sender);
    const extraLines = [];
    let xpFinal = 0;

    // ── Loop temporal: sorteia de novo ──────────────────────
    if (outcome.efeito?.tipo === 'loop_temporal') {
      const outcomeLoop = spinLoop(sender);

      await sock.sendMessage(from, {
        text: [
          `${prefixGratis}🎰 *ROLETA DA DESGRAÇA*`,
          `━━━━━━━━━━━━━━━━━━`,
          ``,
          `🔄 *Loop temporal da roleta*`,
          ``,
          `💬 _Déjà vu detectado. Girando novamente..._`,
          ``,
          `━━━━━━━━━━━━━━━━━━`,
        ].join('\n'),
        mentions: [sender],
      });

      // Pequeno delay dramático
      await new Promise(r => setTimeout(r, 2000));

      // Substitui pelo resultado do loop
      outcome = outcomeLoop;
    }

    // ── Calcular XP do resultado ────────────────────────────
    let xpBase = outcome.xp;

    // Efeitos que definem o XP em tempo real
    if (outcome.efeito?.tipo === 'xp_aleatorio') {
      const min = outcome.efeito.min || -1200;
      const max = outcome.efeito.max ||  2200;
      xpBase = Math.floor(Math.random() * (max - min + 1)) + min;
    } else if (outcome.efeito?.tipo === 'resultado_duplo') {
      const { getUser: GU } = require('../utils/economy.js');
      const { randInt } = (() => {
        function randInt(a, b) { return Math.floor(Math.random() * (b - a + 1)) + a; }
        return { randInt };
      })();
      const xpA = randInt(100, 800);
      const xpB = randInt(-500, -100);
      xpBase = xpA + xpB;
    }

    // ── Aplicar XP ──────────────────────────────────────────
    if (xpBase !== null && xpBase !== undefined && xpBase !== 0) {
      const resultXP = aplicarXP(sender, xpBase);
      xpFinal = resultXP.xp;

      // Level up
      if (resultXP.leveledUp) {
        extraLines.push(``);
        extraLines.push(`🎉 *LEVEL UP!* Você subiu para o nível *${resultXP.leveledUp.level}*! (+${resultXP.leveledUp.reward} Z¢)`);
      }
    }

    // ── Processar efeito especial ────────────────────────────
    let efeitoMsg = null;
    let xpExtra   = 0;

    if (outcome.efeito && outcome.efeito.tipo !== 'xp_aleatorio' && outcome.efeito.tipo !== 'resultado_duplo') {
      const efeitoResult = processarEfeito(sender, outcome.efeito, outcome);
      efeitoMsg  = efeitoResult.mensagemEfeito;
      xpExtra    = efeitoResult.xpExtra || 0;

      if (xpExtra !== 0) {
        const resultExtra = aplicarXP(sender, xpExtra);
        xpFinal += resultExtra.xp;
      }

      // Reação em cadeia: afeta outros
      if (outcome.efeito.tipo === 'reacao_cadeia') {
        const afetados = processarReacaoCadeia(sender);
        if (afetados.length > 0) {
          extraLines.push(``);
          extraLines.push(`💥 *Usuários afetados pela reação:*`);
          extraLines.push(...afetados);
        }
      }
    }

    // ── Montar XP total exibido ─────────────────────────────
    const xpTotal = xpFinal + xpExtra;

    // ── Enviar resultado ────────────────────────────────────
    const corpo = prefixGratis + buildResultMsg(outcome, xpTotal, efeitoMsg, extraLines);

    await sock.sendMessage(from, {
      text: corpo,
      mentions: [sender],
    });

    console.log(`[ROLETA] @${senderNum} → ${outcome.id} (${xpTotal > 0 ? '+' : ''}${xpTotal} XP)`);
  },
};
