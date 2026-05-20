'use strict';

// ============================================================
// COMMAND: !hidetag
// ============================================================
// Menciona todos os participantes do grupo invisivelmente
// QUALQUER USUÁRIO pode usar
// ============================================================

module.exports = {
  name: 'hidetag',
  execute: async ({ sock, from, isGroup, text, config }) => {
    
    // ── 1. Verifica se é grupo ──────────────────────────────
    
    if (!isGroup) {
      return sock.sendMessage(from, {
        text: 'Esse comando só funciona em grupos, gênio.',
      });
    }

    // ── 2. Extrai mensagem personalizada ────────────────────

    const fullCommand = text.trim();
    const prefixAndCmd = config.prefix + 'hidetag';
    
    let customMessage = fullCommand.slice(prefixAndCmd.length).trim();
    
    if (!customMessage) {
      customMessage = '📢 Atenção geral.';
    }

    // ── 3. Obtém todos os participantes do grupo ────────────

    let metadata;
    
    try {
      metadata = await sock.groupMetadata(from);
    } catch (error) {
      console.error('[HIDETAG] Erro ao obter metadata:', error.message);
      return sock.sendMessage(from, {
        text: 'Não foi possível obter os dados do grupo.',
      });
    }

    // Extrai todos os IDs dos participantes
    const participantIds = metadata.participants.map(p => {
      return p.id || p.lid;
    }).filter(Boolean);

    // Remove duplicatas usando Set
    const uniqueIds = [...new Set(participantIds)];

    // ── 4. Adiciona o próprio bot à lista ──────────────────

    try {
      const botId = sock.user?.id;
      
      if (botId && !uniqueIds.includes(botId)) {
        uniqueIds.push(botId);
      }
    } catch (error) {
      console.error('[HIDETAG] Erro ao adicionar bot às menções:', error.message);
    }

    // ── 5. Envia mensagem com menções invisíveis ────────────

    try {
      await sock.sendMessage(from, {
        text: customMessage,
        mentions: uniqueIds,
      });

      const localTime = new Date().toLocaleTimeString('pt-BR');
      console.log(
        `[${localTime}] [HIDETAG] ${uniqueIds.length} participantes mencionados | Msg: "${customMessage}"`
      );

    } catch (error) {
      console.error('[HIDETAG] Erro ao enviar mensagem:', error.message);
      await sock.sendMessage(from, {
        text: 'Erro ao enviar menção coletiva.',
      });
    }
  },
};
