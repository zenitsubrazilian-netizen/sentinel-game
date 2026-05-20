'use strict';
const axios = require('axios');

// ── EDITE AQUI ──────────────────────────
const SERVER = 'http://localhost:3000';   // ou URL do ngrok
// ────────────────────────────────────────

let getBattleBonus = () => ({});
try { getBattleBonus = require('../utils/shop.js').getBattleBonus; } catch(_) {}

const DIFFS = ['easy','medium','hard'];
const genUrl = (roomId, player) => ${SERVER}?room=${roomId}&player=${player};

module.exports = {
name: 'duel',
execute: async ({ sock, message, from, sender, args, isGroup }) => {
if (!isGroup)
return sock.sendMessage(from, { text: '⚠️ Apenas em grupos.' });

if (!args.length)  
  return sock.sendMessage(from, { text: helpText() });  

const p1Num   = sender.split('@')[0];  
const p1Bonus = getBattleBonus(sender);  
const vsBot   = args.some(a => a.replace(/^@/,'').toLowerCase() === 'sentinel');  

if (vsBot) {  
  const diff = args.find(a => DIFFS.includes(a.toLowerCase()))?.toLowerCase() || 'medium';  
  const { data } = await axios.post(`${SERVER}/room`, {  
    p1Jid: sender, isVsBot: true, difficulty: diff, p1Bonus,  
  });  
  const link = genUrl(data.roomId, 'p1');  
  await sock.sendMessage(sender, { text: `⚔️ *Seu duelo contra o Sentinel está pronto!*\n\n🔗 ${link}\n\n⏳ Válido 20 min.` });  
  return sock.sendMessage(from, {  
    text: `⚔️ @${p1Num} vs 🤖 Sentinel\n📱 Link enviado no PV!`,  
    mentions: [sender],  
  });  
}  

const mentioned = message.message?.extendedTextMessage?.contextInfo?.mentionedJid || [];  
if (!mentioned.length) return sock.sendMessage(from, { text: helpText() });  
const p2Jid = mentioned[0];  
if (p2Jid === sender) return sock.sendMessage(from, { text: '😐 Não pode duelar consigo mesmo.' });  

const p2Num   = p2Jid.split('@')[0];  
const p2Bonus = getBattleBonus(p2Jid);  
const { data } = await axios.post(`${SERVER}/room`, {  
  p1Jid: sender, p2Jid, isVsBot: false, p1Bonus, p2Bonus,  
});  

await sock.sendMessage(sender, { text: `⚔️ *Duelo contra @${p2Num}!*\n\n🔗 ${genUrl(data.roomId,'p1')}\n\n⏳ Válido 20 min.`, mentions:[p2Jid] });  
await sock.sendMessage(p2Jid,  { text: `⚔️ *@${p1Num} te desafiou!*\n\n🔗 ${genUrl(data.roomId,'p2')}\n\n⏳ Válido 20 min.`,  mentions:[sender] });  
return sock.sendMessage(from, {  
  text:     `⚔️ @${p1Num} desafiou @${p2Num}!\n📱 Links enviados no PV.`,  
  mentions: [sender, p2Jid],  
});

},
};
function helpText(){
return [⚔️ *DUELO RPG*,,`!duel @usuário`,`!duel @Sentinel easy|medium|hard`,,Link de jogo enviado no PV!].join('\n');
}
