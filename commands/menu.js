'use strict';    
const fs   = require('fs');                       
const path = require('path');    
const { VERSION, BOT_NAME } = require('../config/system.js');                                                                                         
const MIN_BET = 50;                                                                                 

function readConfig() {                             
  try {                                               
    return require(path.join(__dirname, '..', 'config', 'config.js'));                                
  } catch {                                           
    return {};                                      
  }                                               
}                                                                                                   

function resolveLogoPath(config) {                  
  if (config.logoPath) return config.logoPath;      
  return path.join(__dirname, '..', 'data', 'logo.jpg');                                            
}    

const MENU = `                                    
╭━━━━━━━━━━━━━━━━━━╮    
　　ＳＥＮＴＩＮＥＬ ＢＯＴ                        
　　📡 Sistema de IA & Controle                   
╰━━━━━━━━━━━━━━━━━━╯    
╭─📡 𝘽𝙊𝙏 𝙄𝙉𝙁𝙊 ─╮                                  
🤖 Nome: ${BOT_NAME}    
⚙️ Versão: ${VERSION}                              
📅 Criação: 09/05/2026                                                                              
📌 Sistema avançado de gamificação e economia    
╰────────────────╯                                                                                  
╭─🎨 𝘾𝙍𝙀𝘿𝙄𝙏𝙎 ─╮    
👑 Criador: ⚔️ Mυɾιʅσ Dιαʂ ⚔️                       
🎨 Logo: ❀☕︎ᛕꪗꪖ᥅ꪖ☕︎❀                              
╰────────────────╯                                                                                  
╭─🛡️ 𝙈𝙊𝘿𝙀𝙍𝘼𝘾̧𝘼̃𝙊 ─╮                                  
⚔️ !ban @usuário                                   
🔓 !unban @usuário                                
👢 !kick @usuário                                 
🔇 !mute @usuário <tempo>                         
🔊 !unmute @usuário                               
⬆️ !promote @usuário                               
⬇️ !demote @usuário    
╰────────────────╯                                                                                  
╭─⚠️ 𝘼𝘿𝙑𝙀𝙍𝙏𝙀̂𝙉𝘾𝙄𝘼𝙎 ─╮                               
➕ !addwarn @usuário <motivo>                     
➖ !removewarn @usuário                           
♻️ !resetwarns @usuário                            
📊 !warns @usuário                                
╰────────────────╯                                                                                  
╭─📈 𝙀𝘾𝙊𝙉𝙊𝙈𝙄𝘼 & 𝙇𝙀𝙑𝙀𝙇 ─╮                          
👤 !perfil [@usuário]                             
🏆 !rank                                          
💰 !saldo                                         
💸 !pix @usuário <valor>                          
🔥 !streak                                        
🎁 !daily                                         
🏆 !weekly    
🏅 !conquistas pendentes                          
🏅 !conquistas concluidas                         
╰────────────────╯                                                                                  
╭─💵 𝙂𝘼𝙉𝙃𝘼𝙍 𝘿𝙄𝙉𝙃𝙀𝙄𝙍𝙊 ─╮                           
💼 !trabalhar                                     
🦹 !crime                                         
🎣 !pescar                                        
⛏️ !minerar    
🎰 !apostar <valor>                                  
➜ mín ${MIN_BET} Z¢ | máx 5.000 Z¢             
╰────────────────╯    
╭─🛒 𝙇𝙊𝙅𝘼 & 𝙄𝙏𝙀𝙈𝙎 ─╮                              
🛒 !loja [categoria]    
💳 !comprar <tipo> <id> [qtd]                     
🎒 !inventario                                    
⚙️ !equipar <tipo> <id>                            
📦 !caixa    
🎁 !abrir <tipo>                                  
╰────────────────╯                                    
╭─🧠 𝙄𝘼 ─╮                                        
💬 !sentinel <pergunta>                           
🌍 !traduzir <texto> / <idioma>    
🧾 !resumir <texto>                               
🧠 !resumirchat                                   
✍️ !corrigir <texto>                               
🧮 !calcular <expressão>                          
╰────────────────╯                                                                                  
╭─🖼️ 𝙁𝙄𝙂𝙐𝙍𝙄𝙉𝙃𝘼𝙎 ─╮                                 
🃏 !fig                                           
✏️ !ttp <texto>                                    
╰────────────────╯                                                                                  
╭─🎮 𝘿𝙄𝙑𝙀𝙍𝙎𝘼̃𝙊 ─╮                                  
🎰 !roleta                                        
🎯 !forca                                         
⚔️ !duel @usuário                                  
⚔️ !duel @Sentinel <easy|medium|hard>             
👥 !duo                                           
🧠 !quiz                                          
╰────────────────╯                                                                                  
╭─🧰 𝙐𝙏𝙄𝙇𝙄𝘿𝘼𝘿𝙀𝙎 ─╮                                
👻 !hidetag <mensagem>                            
📜 !regras    
📶 !ping                                          
📋 !menu                                          
🔕 !afk [motivo]  — ativa modo ausente            
🔔 !unafk         — desativa modo ausente         
╰────────────────╯    
╭─👑 𝘼𝘿𝙈𝙄𝙉 (só dono) ─╮                           
🧠 !trainai add <ensinamento> <nome>    
📋 !trainai view                                  
🗑️ !trainai remove <nome>                          
╰────────────────╯                                                                                  
╭─🤖 𝘼𝙐𝙏𝙊𝙈𝘼𝘾̧𝘼̃𝙊 ─╮                                 
🔒 Fecha às 23:00 | 🔓 Abre às 05:00              
⏰ Avisos automáticos + catch-up de atraso        
👾 Boas-vindas | 🚨 Anti-spam | 🔞 Anti-link      
📈 XP passivo | 💰 Economia completa    
🎁 Daily & Weekly | 📣 Lembretes de convite       
╰────────────────╯                                                                                  
━━━━━━━━━━━━━━━━━━                                
💡 Use com responsabilidade                       
🛰️ ${BOT_NAME} v${VERSION}                         
━━━━━━━━━━━━━━━━━━                                
`.trim();                                                                                          

module.exports = {    
  name: 'menu',                                     
  execute: async ({ sock, from }) => {                
    const config   = readConfig();    
    const logoPath = resolveLogoPath(config);                                                           

    if (fs.existsSync(logoPath)) {    
      try {                                               
        const imageBuffer = fs.readFileSync(logoPath);                                                                                                        
        await sock.sendMessage(from, {                      
          image: imageBuffer,                               
          caption: MENU                                   
        });                                                                                                 

        console.log('[MENU] Enviado com logo.');          
        return;                                         
      } catch (err) {                                     
        console.error('[MENU] Erro ao enviar logo:', err.message);                                        
      }                                               
    }                                                                                                   

    await sock.sendMessage(from, { text: MENU });                                                       
    console.log('[MENU] Enviado sem logo.');    
  },                                              
};    
