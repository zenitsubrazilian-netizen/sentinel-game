'use strict';

const { isGroupAdmin, isBotAdmin, addBan, isBanned } = require('../utils/moderation.js');
const { resolveFromCache } = require('../utils/cache.js');

/**
 * Tenta extrair o nome "bonitinho" do usuário automaticamente
 */
async function getTargetName(sock, message, targetJid, groupId) {
  // 1. Tenta pelo push name da mensagem
  const quotedMsg = message.message?.extendedTextMessage?.contextInfo?.quotedMessage;
  if (quotedMsg?.conversation || quotedMsg?.extendedTextMessage?.text) {
    const participant = message.message?.extendedTextMessage?.contextInfo?.participant;
    if (participant === targetJid) {
      const pushName = message.message?.extendedTextMessage?.contextInfo?.pushName;
      if (pushName && pushName.trim()) return pushName.trim();
    }
  }

  // 2. Tenta pelos metadados do grupo
  try {
    const metadata = await sock.groupMetadata(groupId);
    const participant = metadata.participants.find(p => p.id === targetJid);
    
    if (participant) {
      if (participant.notify && participant.notify.trim()) {
        return participant.notify.trim();
      }
      if (participant.vname && participant.vname.trim()) {
        return participant.vname.trim();
      }
    }
  } catch (err) {
    console.error('[BAN] Erro ao buscar metadados:', err.message);
  }

  // 3. Tenta via onWhatsApp
  try {
    const [result] = await sock.onWhatsApp(targetJid.split('@')[0]);
    if (result?.verifiedName && result.verifiedName.trim()) {
      return result.verifiedName.trim();
    }
  } catch (err) {
    // Ignora
  }

  // 4. Fallback: usa o número como identificador
  return targetJid.split('@')[0];
}

module.exports = {
  name: 'ban',
  execute: async ({ sock, message, from, sender, args, isGroup }) => {
    if (!isGroup)
      return sock.sendMessage(from, { text: '⚠️ Esse comando só funciona em grupos.' });

    const senderIsAdmin = await isGroupAdmin(sock, from, sender);
    if (!senderIsAdmin)
      return sock.sendMessage(from, { text: '🚫 Você não tem permissão pra isso.' });

    const botIsAdmin = await isBotAdmin(sock, from);
    if (!botIsAdmin)
      return sock.sendMessage(from, { text: '😅 Preciso ser admin do grupo pra fazer isso.' });

    const mentionedJids =
      message.message?.extendedTextMessage?.contextInfo?.mentionedJid || [];

    if (mentionedJids.length === 0)
      return sock.sendMessage(from, {
        text: '👤 Menciona quem quer banir.\n\n📌 Uso: *!ban @usuario*',
      });

    const rawId = mentionedJids[0];

    if (rawId === sender)
      return sock.sendMessage(from, { text: '😐 Você não pode se auto-banir.' });

    const resolvedJid = resolveFromCache(rawId) || rawId;

    if (isBanned(from, resolvedJid) || isBanned(from, rawId))
      return sock.sendMessage(from, { text: '📋 Esse usuário já está na lista de banidos.' });

    // ── Identifica o nome automaticamente (para salvar no registro)
    const targetName = await getTargetName(sock, message, resolvedJid, from);

    console.log(`[BAN] Nome identificado: "${targetName}" para JID ${resolvedJid}`);

    try {
      await sock.groupParticipantsUpdate(from, [resolvedJid], 'remove');
    } catch (error) {
      console.error('[BAN] Erro ao remover participante:', error.message);
      return sock.sendMessage(from, { text: '❌ Não consegui remover o usuário. Tenta de novo.' });
    }

    await addBan(from, resolvedJid, targetName, sender);
    if (rawId !== resolvedJid) await addBan(from, rawId, targetName, sender);

    console.log(`[BAN] "${targetName}" (${resolvedJid}) banido de ${from}`);
    
    // ── Envia mensagem COM MENÇÃO
    await sock.sendMessage(from, {
      text: `🔨 @${resolvedJid.split('@')[0]} foi banido e removido do grupo. Tchau! 👋`,
      mentions: [resolvedJid],
    });
  },
};
