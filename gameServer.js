'use strict';
const express   = require('express');
const http      = require('http');
const { Server }= require('socket.io');
const path      = require('path');
const app       = express();
const server    = http.createServer(app);
const io        = new Server(server);
const rooms     = new Map();

// ── Lógica de combate (igual ao original) ──────────────────
const rand   = (a,b) => Math.floor(Math.random()*(b-a+1))+a;
const clamp  = (v,a,b) => Math.max(a,Math.min(b,v));
const chance = p => Math.random()*100 < p;
const hasEff = (p,t) => (p.effects||[]).some(e=>e.type===t&&e.rounds>0);
const getEnr = p => { const e=(p.effects||[]).find(e=>e.type==='enraged');  return e?e.bonus:0; };
const getWkn = p => { const e=(p.effects||[]).find(e=>e.type==='weakened'); return e?e.penalty:0; };

const SP={
  bola_de_fogo:{name:'Bola de Fogo',  icon:'🔥',cost:25,cd:2,type:'damage', pw:{n:20,x:30},eff:{type:'burning', rounds:2,dot:5}, desc:'20-30 dano + queimadura'},
  raio:        {name:'Raio',          icon:'⚡',cost:30,cd:3,type:'damage', pw:{n:25,x:40},eff:{type:'stun',    rounds:1},        desc:'25-40 dano + stun'},
  gelo:        {name:'Tempestade Gelo',icon:'🧊',cost:20,cd:2,type:'damage', pw:{n:15,x:22},eff:{type:'frozen',  rounds:2},        desc:'15-22 dano + congela'},
  veneno:      {name:'Veneno',        icon:'☠️',cost:15,cd:2,type:'damage', pw:{n:8, x:12},eff:{type:'poisoned',rounds:3,dot:6},  desc:'8-12 dano + veneno'},
  cura:        {name:'Cura Divina',   icon:'💚',cost:20,cd:3,type:'heal',   pw:{n:30,x:45},eff:null,                              desc:'Cura 30-45 HP'},
  escudo_magico:{name:'Escudo Mágico',icon:'🛡️',cost:18,cd:3,type:'buff',   pw:{n:0, x:0}, eff:{type:'shielded',rounds:2,reduction:.7},desc:'-70% dano 2r'},
  furia:       {name:'Fúria',         icon:'😤',cost:20,cd:4,type:'buff',   pw:{n:0, x:0}, eff:{type:'enraged', rounds:2,bonus:10},desc:'+10 dano 2r'},
  fraqueza:    {name:'Fraqueza',      icon:'💫',cost:15,cd:3,type:'debuff', pw:{n:0, x:0}, eff:{type:'weakened',rounds:2,penalty:8},desc:'Inimigo -8 dano'},
  silencio:    {name:'Silêncio',      icon:'🔇',cost:20,cd:3,type:'debuff', pw:{n:0, x:0}, eff:{type:'silenced',rounds:2},        desc:'Bloqueia magias 2r'},
  correntes:   {name:'Correntes',     icon:'⛓️',cost:25,cd:3,type:'control',pw:{n:5, x:10},eff:{type:'chained', rounds:2},        desc:'5-10 dano + bloqueia esquiva'},
};

function makePlayer(jid,isBot=false,diff=null,bonus={}){
  return {
    jid, isBot, difficulty:diff,
    hp:120+(bonus.maxHpBonus||0), maxHp:120+(bonus.maxHpBonus||0),
    mana:60+(bonus.maxManaBonus||0), maxMana:60+(bonus.maxManaBonus||0),
    energy:50, maxEnergy:50,
    potions:2+(bonus.extraPotions||0),
    effects:[], ultimate:bonus.startUltimate||0,
    spellCooldowns:{}, action:null, defending:false,
    dmgBonus:bonus.dmgBonus||0, dodgeBonus:bonus.dodgeBonus||0,
    damageReduction:bonus.damageReduction||0,
    spellPowerBonus:bonus.spellPowerBonus||0,
    manaCostReduction:bonus.manaCostReduction||0,
    regenPerRound:bonus.regenPerRound||0,
    ultimatePowerBonus:bonus.ultimatePowerBonus||0,
  };
}

function addEff(t,eff){ t.effects=(t.effects||[]).filter(e=>e.type!==eff.type); t.effects.push({...eff}); }

function applyEffects(p){
  const log=[],keep=[];
  for(const e of(p.effects||[])){
    if(e.type==='burning')  { p.hp-=e.dot||5; log.push(`🔥 queimando! -${e.dot||5} HP`); }
    if(e.type==='poisoned') { p.hp-=e.dot||6; log.push(`☠️ envenenado! -${e.dot||6} HP`); }
    if(e.type==='bleeding') { p.hp-=e.dot||4; log.push(`🩸 sangrando! -${e.dot||4} HP`); }
    if(e.type==='frozen')   log.push(`🧊 congelado (${e.rounds-1}r)`);
    if(e.type==='stun')     log.push(`⚡ atordoado (${e.rounds-1}r)`);
    if(e.type==='shielded') log.push(`🛡️ Escudo ativo (${e.rounds-1}r)`);
    if(e.type==='enraged')  log.push(`😤 Fúria +${e.bonus} (${e.rounds-1}r)`);
    if(e.type==='weakened') log.push(`💫 Fraco -${e.penalty} (${e.rounds-1}r)`);
    const rem={...e,rounds:e.rounds-1};
    if(rem.rounds>0) keep.push(rem);
  }
  p.effects=keep;
  for(const id of Object.keys(p.spellCooldowns||{})){
    p.spellCooldowns[id]--;
    if(p.spellCooldowns[id]<=0) delete p.spellCooldowns[id];
  }
  if((p.regenPerRound||0)>0&&p.hp>0){
    const r=p.regenPerRound; p.hp=clamp(p.hp+r,0,p.maxHp);
    log.push(`💚 regenera +${r} HP`);
  }
  return log;
}

function resolveSpell(caster,target,sid,res,log){
  const spell=SP[sid];
  if(!spell||hasEff(caster,'silenced')||(caster.spellCooldowns?.[sid]||0)>0){
    res.damage=rand(8,15); log.push(`→ Ataque Leve (fallback)`); return;
  }
  const cost=Math.max(0,spell.cost-(caster.manaCostReduction||0));
  if(caster.mana<cost){ res.damage=rand(8,15); log.push(`sem mana → Ataque Leve`); return; }
  caster.mana-=cost;
  caster.spellCooldowns[sid]=spell.cd;
  caster.ultimate=clamp((caster.ultimate||0)+15,0,100);
  const sp=caster.spellPowerBonus||0;
  switch(spell.type){
    case 'damage':
      res.damage=Math.max(0,rand(spell.pw.n,spell.pw.x)+sp+getEnr(caster)-getWkn(caster));
      log.push(`${spell.icon} ${spell.name}: ${res.damage} dano`);
      if(spell.eff){ addEff(target,{...spell.eff}); log.push(`  ↳ ${spell.eff.type}`); }
      break;
    case 'heal':{ const h=rand(spell.pw.n,spell.pw.x)+Math.floor(sp*.5); caster.hp=clamp(caster.hp+h,0,caster.maxHp); res.heal=h; log.push(`${spell.icon} Cura +${h} HP`); break; }
    case 'buff':   addEff(caster,{...spell.eff}); log.push(`${spell.icon} ${spell.name} ativo!`); break;
    case 'debuff': addEff(target,{...spell.eff}); log.push(`${spell.icon} ${spell.name} no inimigo!`); break;
    case 'control': res.damage=Math.max(0,rand(spell.pw.n,spell.pw.x)+sp); addEff(target,{...spell.eff}); log.push(`${spell.icon} ${spell.name}: ${res.damage} dano + controle`); break;
  }
}

function resolveAction(atk,def,log){
  const a=(atk.action||'ataque leve').toLowerCase().trim();
  const res={damage:0,heal:0,dodged:false,broken:false};
  if(hasEff(atk,'frozen')||hasEff(atk,'stun')){ log.push(`🚫 impedido de agir!`); return res; }
  const en=getEnr(atk),wk=getWkn(atk),db=atk.dmgBonus||0;
  switch(a){
    case 'ataque leve':   res.damage=Math.max(0,rand(8,15)+en-wk+db); log.push(`⚔️ Ataque Leve: ${res.damage}`); atk.ultimate=clamp((atk.ultimate||0)+8,0,100); break;
    case 'ataque pesado': if((atk.energy||0)<15){ res.damage=rand(8,15); log.push(`sem energia → Leve`); } else { atk.energy-=15; res.damage=Math.max(0,rand(20,32)+en-wk+db); log.push(`💢 Pesado: ${res.damage}`); atk.ultimate=clamp((atk.ultimate||0)+12,0,100); } break;
    case 'defesa':        atk.defending=true; log.push(`🛡️ Defesa!`); atk.ultimate=clamp((atk.ultimate||0)+5,0,100); break;
    case 'esquiva':       if(hasEff(atk,'chained')) log.push(`⛓️ acorrentado!`); else if(chance(40+(atk.dodgeBonus||0))){ atk.defending=true; res.dodged=true; log.push(`💨 Esquivou!`); atk.ultimate=clamp((atk.ultimate||0)+10,0,100); } else log.push(`💨 Falhou!`); break;
    case 'contra-ataque': if((atk.energy||0)<20){ res.damage=rand(8,15); } else { atk.energy-=20; atk.defending=true; res.damage=Math.max(0,rand(12,20)+en+db); log.push(`↩️ Contra: ${res.damage}`); atk.ultimate=clamp((atk.ultimate||0)+15,0,100); } break;
    case 'break guard':   if((atk.energy||0)<25){ res.damage=rand(8,15); } else { atk.energy-=25; res.damage=Math.max(0,rand(10,18)+db); res.broken=true; log.push(`🔨 Break: ${res.damage}`); atk.ultimate=clamp((atk.ultimate||0)+12,0,100); } break;
    case 'focus':{ const mg=rand(15,25),eg=rand(10,18); atk.mana=clamp((atk.mana||0)+mg,0,atk.maxMana); atk.energy=clamp((atk.energy||0)+eg,0,atk.maxEnergy); log.push(`🧘 Focus +${mg}mana +${eg}⚡`); atk.ultimate=clamp((atk.ultimate||0)+8,0,100); break; }
    case 'usar item':     if((atk.potions||0)<=0){ res.damage=rand(8,15); } else { atk.potions--; const h=rand(30,45); atk.hp=clamp(atk.hp+h,0,atk.maxHp); res.heal=h; log.push(`🧪 Poção +${h} HP`); atk.ultimate=clamp((atk.ultimate||0)+5,0,100); } break;
    case 'ultimate':      if((atk.ultimate||0)<100){ res.damage=rand(8,15); log.push(`✨ não carregado`); } else { const ud=Math.max(0,rand(45,65+(atk.ultimatePowerBonus||0))+en+db); atk.ultimate=0; res.damage=ud; res.broken=true; log.push(`✨ ULTIMATE: ${ud}!`); } break;
    default:
      if(a.startsWith('magia:')){ resolveSpell(atk,def,a.replace('magia:','').trim(),res,log); }
      else { res.damage=rand(8,15); }
  }
  res.damage=Math.max(0,res.damage||0);
  return res;
}

function applyDamage(target,ar,log){
  if(!ar) return;
  let total=(ar.damage||0);
  if(total<=0) return;
  if(ar.broken){ target.hp-=total; log.push(`💢 ${total} dano (defesa ignorada)`); return; }
  if(hasEff(target,'shielded')){ const sh=(target.effects||[]).find(e=>e.type==='shielded'); total=Math.floor(total*(1-(sh?.reduction||.5))); log.push(`🛡️ Escudo absorveu! ${total} dano`); target.hp-=total; return; }
  if(target.defending){ total=Math.floor(total*.5); log.push(`🛡️ Defendeu! ${total} dano`); }
  else if((target.damageReduction||0)>0){ const r=Math.floor(total*(1-target.damageReduction)); log.push(`🌑 Relíquia: ${total}→${r}`); total=r; }
  else log.push(`💢 ${total} dano`);
  target.hp-=total;
}

function processRound(room){
  const {p1,p2}=room;
  const log=[];
  log.push(...applyEffects(p1).map(l=>`[Você] ${l}`));
  log.push(...applyEffects(p2).map(l=>`[${p2.isBot?'Sentinel':'Oponente'}] ${l}`));
  const r1=resolveAction(p1,p2,log);
  const r2=resolveAction(p2,p1,log);
  applyDamage(p1,r2,log);
  applyDamage(p2,r1,log);
  p1.action=null; p1.defending=false;
  p2.action=null; p2.defending=false;
  ['hp','mana','energy'].forEach(k=>{ p1[k]=clamp(p1[k],0,p1[`max${k[0].toUpperCase()+k.slice(1)}`]); p2[k]=clamp(p2[k],0,p2[`max${k[0].toUpperCase()+k.slice(1)}`]); });
  return log;
}

function botAction(bot,enemy,diff){
  if(diff==='easy') return ['ataque leve','defesa','esquiva','focus'][rand(0,3)];
  if(diff==='medium'){
    if(bot.hp<40&&bot.potions>0) return 'usar item';
    if(bot.hp<50&&bot.mana>=20&&!(bot.spellCooldowns?.cura>0)) return 'magia: cura';
    if(enemy.hp<30) return 'ataque pesado';
    if(chance(25)) return 'defesa';
    return ['ataque leve','ataque pesado','esquiva'][rand(0,2)];
  }
  if(bot.hp<30&&bot.potions>0) return 'usar item';
  if(bot.hp<40&&bot.mana>=20&&!(bot.spellCooldowns?.cura>0)) return 'magia: cura';
  if((bot.ultimate||0)>=100) return 'ultimate';
  if(!hasEff(enemy,'burning')&&bot.mana>=25&&!(bot.spellCooldowns?.bola_de_fogo>0)) return 'magia: bola_de_fogo';
  if(!hasEff(enemy,'poisoned')&&bot.mana>=15&&!(bot.spellCooldowns?.veneno>0)) return 'magia: veneno';
  if(!hasEff(bot,'enraged')&&bot.mana>=20&&!(bot.spellCooldowns?.furia>0)) return 'magia: furia';
  if(enemy.defending&&(bot.energy||0)>=25) return 'break guard';
  if((bot.energy||0)<15||bot.mana<20) return 'focus';
  return chance(50)?'ataque pesado':'ataque leve';
}

// ── API para o bot criar salas ─────────────
const genId=()=>Math.random().toString(36).substr(2,8).toUpperCase();

app.use(express.json());

app.post('/room', (req,res)=>{
  const {p1Jid,p2Jid,isVsBot,difficulty,p1Bonus,p2Bonus}=req.body;
  const roomId=genId();
  rooms.set(roomId,{
    id:roomId, phase:'fighting', round:1, isVsBot,
    difficulty:difficulty||'medium', log:[],
    p1:makePlayer(p1Jid,false,null,p1Bonus||{}),
    p2:isVsBot ? makePlayer('sentinel',true,difficulty,{}) : makePlayer(p2Jid,false,null,p2Bonus||{}),
    createdAt:Date.now(),
  });
  setTimeout(()=>rooms.delete(roomId), 20*60_000);
  res.json({roomId});
});

// ── Página do jogo ──────────────────────────
app.get('/', (req,res)=>{
  const {room:roomId,player}=req.query;
  if(!roomId||!['p1','p2'].includes(player))
    return res.send('<h2 style="font-family:sans-serif;padding:20px;color:red">⚠️ Link inválido. Use o link enviado pelo bot no PV.</h2>');
  res.sendFile(path.join(__dirname,'game.html'));
});

// ── Socket.io ───────────────────────────────
io.on('connection', socket=>{
  socket.on('join', ({roomId,player})=>{
    const room=rooms.get(roomId);
    if(!room){ socket.emit('error','Sala não encontrada ou expirada.'); return; }
    socket.join(roomId);
    socket.emit('state', sanitize(room, player));
  });

  socket.on('action', ({roomId,player,action})=>{
    const room=rooms.get(roomId);
    if(!room||room.phase!=='fighting') return;
    const p=room[player];
    if(!p||p.action!==null) return;
    p.action=action;
    if(room.isVsBot) room.p2.action=botAction(room.p2,room.p1,room.difficulty);
    const both = room.p1.action!==null && room.p2.action!==null;
    if(both){
      const rlog=processRound(room);
      const prefix=`━━ Round ${room.round} ━━`;
      room.log=[...room.log, prefix, ...rlog].slice(-80);
      const dead1=room.p1.hp<=0, dead2=room.p2.hp<=0;
      if(dead1||dead2){
        room.phase='ended';
        room.winner=(dead1&&dead2)?'draw':(dead2?'p1':'p2');
      } else {
        room.round++;
      }
    }
    io.to(roomId).emit('state', sanitize(room, null));
  });
});

function sanitize(room,_player){
  return {
    phase:room.phase, round:room.round, isVsBot:room.isVsBot,
    difficulty:room.difficulty, winner:room.winner,
    log:room.log.slice(-60),
    p1:{...room.p1, action: room.p1.action!==null?'✅ pronto':null},
    p2:{...room.p2, action: room.p2.action!==null?'✅ pronto':null},
  };
}

server.listen(3000,()=>console.log('🎮 Game server on :3000'));
