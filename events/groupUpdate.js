'use strict';

// ============================================================
// EVENTO: group-participants.update
// ============================================================

const { isBanned, isBotAdmin } = require('../utils/moderation.js');
const { updateCache }          = require('../utils/cache.js');

async function handleGroupUpdate(sock, update) {
  const { id: groupId, participants, action } = update;

  if (action !== 'add') return;

  for (const participant of participants) {
    const jid = participant.id;
    const lid = participant.lid;

    // Atualiza o cache LID → JID
    updateCache(lid, jid);

    // Verifica banimento
    const isUserBanned = isBanned(groupId, jid) || isBanned(groupId, lid);

    if (isUserBanned) {
      const localTime = new Date().toLocaleTimeString('pt-BR');
      console.log(`[${localTime}] [AUTOBAN] ${jid || lid} tentou entrar em ${groupId} — removendo.`);

      const botIsAdmin = await isBotAdmin(sock, groupId);
      if (!botIsAdmin) {
        console.log(`[AUTOBAN] Bot não é admin em ${groupId}. Remoção ignorada.`);
        continue;
      }

      try {
        // ✅ CORRIGIDO: passa a string do JID, não o objeto participant
        const targetId = jid || lid;
        await sock.groupParticipantsUpdate(groupId, [targetId], 'remove');
        await sock.sendMessage(groupId, { text: 'Entrada bloqueada.' });
      } catch (error) {
        console.error(`[AUTOBAN] Falha ao remover ${jid || lid}:`, error.message);
      }
    }
  }
}

module.exports = { handleGroupUpdate };