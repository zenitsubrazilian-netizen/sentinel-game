'use strict';

// ============================================================
// SHOP.JS — v3.1.0  (+caixas como item comprável)
// ============================================================

const { getUser, updateUser, removeCoins, CONFIG, getRank } = require('./economy.js');
const { BOXES, addBoxToInventory } = require('./boxes.js');

// ─────────────────────────────────────────────────────────────
// MOLDURAS
// ─────────────────────────────────────────────────────────────

const FRAMES = {
  default: {
    id: 'default', name: 'Moldura Padrão', price: 0, rarity: 'Comum',
    template: (name) => [`╔════════════════╗`, `   👤 *PERFIL*`, `   ${name}`, `╚════════════════╝`],
  },
  shadow: {
    id: 'shadow', name: 'Shadow User', price: 500, rarity: 'Raro',
    template: (name) => [`▓▓▒▒ *SHADOW USER* ▒▒▓▓`, `█ ${name}`],
  },
  void: {
    id: 'void', name: 'Void Entity', price: 800, rarity: 'Épico',
    template: (name) => [`◤ *VOID ENTITY* ◢`, `✦ ${name}`],
  },
  classic: {
    id: 'classic', name: 'Classic Frame', price: 300, rarity: 'Raro',
    template: (name) => [`╔════════════╗`, `   ${name}`, `╚════════════╝`],
  },
  thunder: {
    id: 'thunder', name: 'Thunder Frame', price: 1200, rarity: 'Épico',
    template: (name) => [`╔⚡══════⚡╗`, `   ${name}`, `╚⚡══════⚡╝`],
  },
  root: {
    id: 'root', name: 'Root Access', price: 1500, rarity: 'Lendário',
    template: (name) => [`[root@sentinel ~]#`, `> ${name}`],
  },
  galaxy: {
    id: 'galaxy', name: 'Galaxy Core', price: 2000, rarity: 'Lendário',
    template: (name) => [`✦･ﾟ *GALAXY CORE* ･ﾟ✦`, `☄ ${name}`],
  },
  ice: {
    id: 'ice', name: 'Ice Core', price: 1800, rarity: 'Épico',
    template: (name) => [`╔══ *ICE CORE* ══╗`, `❄ ${name}`, `╚══════════════╝`],
  },
  crimson: {
    id: 'crimson', name: 'Crimson Core', price: 1600, rarity: 'Épico',
    template: (name) => [`██ *CRIMSON* ██`, `█ ${name}`],
  },
  android: {
    id: 'android', name: 'Android Profile', price: 2500, rarity: 'Lendário',
    template: (name) => [`:: *ANDROID PROFILE* ::`, `ID: ${name}`],
  },
  eclipse: {
    id: 'eclipse', name: 'Eclipse', price: 3000, rarity: 'Mítico',
    template: (name) => [`◢ *ECLIPSE* ◣`, `┃ ${name}`, `◤━━━━━━━━◥`],
  },
};

// ─────────────────────────────────────────────────────────────
// FONTES
// ─────────────────────────────────────────────────────────────

const FONT_MAPS = {
  default:     { id: 'default',     name: 'Fonte Padrão',   price: 0,    rarity: 'Comum',    map: null },
  royal:       { id: 'royal',       name: 'Royal Script',   price: 400,  rarity: 'Raro',     map: { upper: '𝓐𝓑𝓒𝓓𝓔𝓕𝓖𝓗𝓘𝓙𝓚𝓛𝓜𝓝𝓞𝓟𝓠𝓡𝓢𝓣𝓤𝓥𝓦𝓧𝓨𝓩', lower: '𝓪𝓫𝓬𝓭𝓮𝓯𝓰𝓱𝓲𝓳𝓴𝓵𝓶𝓷𝓸𝓹𝓺𝓻𝓼𝓽𝓾𝓿𝔀𝔁𝔂𝔃' } },
  fullwidth:   { id: 'fullwidth',   name: 'Full Width',     price: 300,  rarity: 'Comum',    map: { upper: 'ＡＢＣＤＥＦＧＨＩＪＫＬＭＮＯＰＱＲＳＴＵＶＷＸＹＺ', lower: 'ａｂｃｄｅｆｇｈｉｊｋｌｍｎｏｐｑｒｓｔｕｖｗｘｙｚ' } },
  bold:        { id: 'bold',        name: 'Bold Unicode',   price: 500,  rarity: 'Raro',     map: { upper: '𝘼𝘽𝘾𝘿𝙀𝙁𝙂𝙃𝙄𝙅𝙆𝙇𝙈𝙉𝙊𝙋𝙌𝙍𝙎𝙏𝙐𝙑𝙒𝙓𝙔𝙕', lower: '𝙖𝙗𝙘𝙙𝙚𝙛𝙜𝙝𝙞𝙟𝙠𝙡𝙢𝙣𝙤𝙥𝙦𝙧𝙨𝙩𝙪𝙫𝙬𝙭𝙮𝙯' } },
  smallcaps:   { id: 'smallcaps',   name: 'Small Caps',     price: 600,  rarity: 'Épico',    map: { upper: 'ᴀʙᴄᴅᴇꜰɢʜɪᴊᴋʟᴍɴᴏᴘǫʀꜱᴛᴜᴠᴡxʏᴢ', lower: 'ᴀʙᴄᴅᴇꜰɢʜɪᴊᴋʟᴍɴᴏᴘǫʀꜱᴛᴜᴠᴡxʏᴢ' } },
  glitch:      { id: 'glitch',      name: 'Glitch',         price: 1000, rarity: 'Épico',    map: null, charMap: { A:'Ꭺ',B:'Ᏼ',C:'Ꮯ',D:'Ꭰ',E:'Ꭼ',F:'ᖴ',G:'Ꮐ',H:'Ꮋ',I:'Ꭵ',J:'Ꭻ',K:'Ꮶ',L:'Ꮮ',M:'Ꮇ',N:'Ꮑ',O:'Ꮎ',P:'Ꮲ',Q:'ᑫ',R:'Ꮢ',S:'Ꮪ',T:'Ꭲ',U:'Ꮜ',V:'Ꮩ',W:'Ꮃ',X:'Ꮖ',Y:'Ꭹ',Z:'Ꮓ',a:'ᴀ',b:'ʙ',c:'ᴄ',d:'ᴅ',e:'ᴇ',f:'ꜰ',g:'ɢ',h:'ʜ',i:'ɪ',j:'ᴊ',k:'ᴋ',l:'ʟ',m:'ᴍ',n:'ɴ',o:'ᴏ',p:'ᴘ',q:'q',r:'ʀ',s:'s',t:'ᴛ',u:'ᴜ',v:'ᴠ',w:'ᴡ',x:'x',y:'ʏ',z:'ᴢ' } },
  mono:        { id: 'mono',        name: 'Mono Space',     price: 700,  rarity: 'Raro',     map: { upper: '𝙰𝙱𝙲𝙳𝙴𝙵𝙶𝙷𝙸𝙹𝙺𝙻𝙼𝙽𝙾𝙿𝚀𝚁𝚂𝚃𝚄𝚅𝚆𝚇𝚈𝚉', lower: '𝚊𝚋𝚌𝚍𝚎𝚏𝚐𝚑𝚒𝚓𝚔𝚕𝚖𝚗𝚘𝚙𝚚𝚛𝚜𝚝𝚞𝚟𝚠𝚡𝚢𝚣' } },
  doublestruck:{ id: 'doublestruck',name: 'Double Struck',  price: 1200, rarity: 'Lendário', map: { upper: '𝔸𝔹ℂ𝔻𝔼𝔽𝔾ℍ𝕀𝕁𝕂𝕃𝕄ℕ𝕆ℙℚℝ𝕊𝕋𝕌𝕍𝕎𝕏𝕐ℤ', lower: '𝕒𝕓𝕔𝕕𝕖𝕗𝕘𝕙𝕚𝕛𝕜𝕝𝕞𝕟𝕠𝕡𝕢𝕣𝕤𝕥𝕦𝕧𝕨𝕩𝕪𝕫' } },
  fraktur:     { id: 'fraktur',     name: 'Fraktur',        price: 1500, rarity: 'Lendário', map: { upper: '𝕬𝕭𝕮𝕯𝕰𝕱𝕲𝕳𝕴𝕵𝕶𝕷𝕸𝕹𝕺𝕻𝕼𝕽𝕾𝕿𝖀𝖁𝖂𝖃𝖄𝖅', lower: '𝖆𝖇𝖈𝖉𝖊𝖋𝖌𝖍𝖎𝖏𝖐𝖑𝖒𝖓𝖔𝖕𝖖𝖗𝖘𝖙𝖚𝖛𝖜𝖝𝖞𝖟' } },
  bubble:      { id: 'bubble',      name: 'Bubble',         price: 800,  rarity: 'Épico',    map: { upper: 'ⒶⒷⒸⒹⒺⒻⒼⒽⒾⒿⓀⓁⓂⓃⓄⓅⓆⓇⓈⓉⓊⓋⓌⓍⓎⓏ', lower: 'ⓐⓑⓒⓓⓔⓕⓖⓗⓘⓙⓚⓛⓜⓝⓞⓟⓠⓡⓢⓣⓤⓥⓦⓧⓨⓩ' } },
  squared:     { id: 'squared',     name: 'Squared',        price: 900,  rarity: 'Épico',    map: { upper: '🄰🄱🄲🄳🄴🄵🄶🄷🄸🄹🄺🄻🄼🄽🄾🄿🅀🅁🅂🅃🅄🅅🅆🅇🅈🅉', lower: '🄰🄱🄲🄳🄴🄵🄶🄷🄸🄹🄺🄻🄼🄽🄾🄿🅀🅁🅂🅃🅄🅅🅆🅇🅈🅉' } },
};

// ─────────────────────────────────────────────────────────────
// RELÍQUIAS
// ─────────────────────────────────────────────────────────────

const BATTLE_ITEMS = {
  garra_do_lobo:      { id:'garra_do_lobo',      name:'Garra do Lobo',      icon:'🐺', price:800,  rarity:'Raro',    slot:'relic', bonus:{ dmgBonus:8 },                                    desc:'+8 de dano em todos os ataques físicos' },
  escudo_runico:      { id:'escudo_runico',       name:'Escudo Rúnico',      icon:'🛡️', price:700,  rarity:'Raro',    slot:'relic', bonus:{ maxHpBonus:25 },                                 desc:'+25 de HP máximo' },
  colar_vital:        { id:'colar_vital',         name:'Colar Vital',        icon:'📿', price:600,  rarity:'Raro',    slot:'relic', bonus:{ extraPotions:1 },                                desc:'Inicia batalhas com +1 poção extra' },
  orbe_arcano:        { id:'orbe_arcano',         name:'Orbe Arcano',        icon:'🔮', price:900,  rarity:'Épico',   slot:'relic', bonus:{ maxManaBonus:20, manaCostReduction:4 },          desc:'+20 de mana máx | magias custam -4 mana' },
  botas_dos_ventos:   { id:'botas_dos_ventos',    name:'Botas dos Ventos',   icon:'💨', price:1000, rarity:'Épico',   slot:'relic', bonus:{ dodgeBonus:20 },                                 desc:'Chance de esquiva: 40% → 60%' },
  cristal_de_furia:   { id:'cristal_de_furia',    name:'Cristal de Fúria',   icon:'💎', price:1200, rarity:'Épico',   slot:'relic', bonus:{ startUltimate:30 },                              desc:'Começa batalhas com 30 de carga no Ultimate' },
  anel_de_regeneracao:{ id:'anel_de_regeneracao', name:'Anel de Regeneração',icon:'💍', price:1100, rarity:'Épico',   slot:'relic', bonus:{ regenPerRound:6 },                               desc:'Regenera 6 HP automaticamente a cada round' },
  manto_de_sombras:   { id:'manto_de_sombras',    name:'Manto de Sombras',   icon:'🌑', price:1500, rarity:'Lendário',slot:'relic', bonus:{ damageReduction:0.12 },                          desc:'Reduz 12% de todo dano recebido' },
  lamina_lendaria:    { id:'lamina_lendaria',     name:'Lâmina Lendária',    icon:'⚔️', price:2000, rarity:'Lendário',slot:'relic', bonus:{ ultimatePowerBonus:20, dmgBonus:5 },             desc:'Ultimate: 65–85 dano | +5 dano físico' },
  tomo_arcano:        { id:'tomo_arcano',         name:'Tomo Arcano',        icon:'📖', price:1800, rarity:'Lendário',slot:'relic', bonus:{ spellPowerBonus:8, manaCostReduction:6 },        desc:'+8 poder de magia | magias custam -6 mana' },
  coracao_de_tita:    { id:'coracao_de_tita',     name:'Coração de Titã',    icon:'❤️‍🔥',price:2500, rarity:'Mítico',  slot:'relic', bonus:{ maxHpBonus:40, maxEnergyBonus:20 },             desc:'+40 HP máximo | +20 energia máxima' },
  cetro_das_almas:    { id:'cetro_das_almas',     name:'Cetro das Almas',    icon:'🪄', price:3500, rarity:'Mítico',  slot:'relic', bonus:{ dmgBonus:12, maxManaBonus:30, spellPowerBonus:10 },desc:'+12 dano físico | +30 mana máx | +10 poder mágico' },
};

// ─────────────────────────────────────────────────────────────
// APLICAR FONTE
// ─────────────────────────────────────────────────────────────

function applyFont(text, fontId) {
  if (!text) return String(text ?? '');
  const font = FONT_MAPS[fontId];
  if (!font) return text;

  if (font.charMap) return text.split('').map(c => font.charMap[c] ?? c).join('');
  if (!font.map)   return text;

  const uN = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const lN = 'abcdefghijklmnopqrstuvwxyz';
  const uS = Array.from(font.map.upper);
  const lS = Array.from(font.map.lower);
  if (uS.length !== 26 || lS.length !== 26) return text;

  let result = '';
  for (const c of text) {
    const ui = uN.indexOf(c); if (ui !== -1) { result += uS[ui]; continue; }
    const li = lN.indexOf(c); if (li !== -1) { result += lS[li]; continue; }
    result += c;
  }
  return result;
}

// ─────────────────────────────────────────────────────────────
// SHOP API
// ─────────────────────────────────────────────────────────────

function getShopItems(category = 'all') {
  const items = [];
  const cat   = category.toLowerCase();

  if (cat === 'all' || cat === 'frames') {
    Object.values(FRAMES).filter(f => f.price > 0).forEach(f =>
      items.push({ type:'frame', id:f.id, name:f.name, price:f.price, rarity:f.rarity }));
  }

  if (cat === 'all' || cat === 'fonts') {
    Object.values(FONT_MAPS).filter(f => f.price > 0).forEach(f =>
      items.push({ type:'font', id:f.id, name:f.name, price:f.price, rarity:f.rarity }));
  }

  if (cat === 'all' || cat === 'relics' || cat === 'reliquias') {
    Object.values(BATTLE_ITEMS).forEach(item =>
      items.push({ type:'relic', id:item.id, name:item.name, icon:item.icon,
                   price:item.price, rarity:item.rarity, desc:item.desc }));
  }

  if (cat === 'all' || cat === 'caixas') {
    Object.values(BOXES).forEach(b =>
      items.push({ type:'caixa', id:b.id, name:b.name, icon:b.icon,
                   price:b.price, rarity:b.rarity, desc:b.desc }));
  }

  return items.sort((a, b) => a.price - b.price);
}

// ─────────────────────────────────────────────────────────────
// COMPRAR ITEM
// ─────────────────────────────────────────────────────────────

function buyItem(userId, itemType, itemId, qty = 1) {
  const user = getUser(userId);
  if (!user.inventory)           user.inventory          = {};
  if (!user.inventory.frames)    user.inventory.frames   = ['default'];
  if (!user.inventory.fonts)     user.inventory.fonts    = ['default'];
  if (!user.inventory.relics)    user.inventory.relics   = [];
  if (!user.inventory.equipped)  user.inventory.equipped = { frame:'default', font:'default', relic:null };
  if (!('relic' in user.inventory.equipped)) user.inventory.equipped.relic = null;

  // ── CAIXA ──────────────────────────────────────────────────
  if (itemType === 'caixa') {
    const box = BOXES[itemId];
    if (!box) return { error: 'not_found' };

    const safeQty  = Math.max(1, Math.min(10, parseInt(qty) || 1));
    const total    = box.price * safeQty;
    const balance  = user.coins || 0;

    if (balance < total)
      return { error:'insufficient_funds', price:total, balance, qty:safeQty };

    const success = removeCoins(userId, total);
    if (!success) return { error:'payment_failed' };

    addBoxToInventory(userId, itemId, safeQty);
    console.log(`[SHOP] ${userId.split('@')[0]} comprou caixa:${itemId} x${safeQty} por ${total}`);
    return { ok:true, item:{ ...box, type:'caixa' }, qty:safeQty, total };
  }

  // ── FRAME / FONT / RELIC ───────────────────────────────────
  let item = null;
  if (itemType === 'frame') item = FRAMES[itemId];
  if (itemType === 'font')  item = FONT_MAPS[itemId];
  if (itemType === 'relic') item = BATTLE_ITEMS[itemId];

  if (!item)            return { error:'not_found' };
  if (item.price === 0) return { error:'not_purchasable' };

  const invKey = itemType === 'frame' ? 'frames' : itemType === 'font' ? 'fonts' : 'relics';

  if ((user.inventory[invKey] || []).includes(itemId))
    return { error:'already_owned' };

  if ((user.coins || 0) < item.price)
    return { error:'insufficient_funds', price:item.price, balance:user.coins || 0 };

  if (!removeCoins(userId, item.price)) return { error:'payment_failed' };

  const freshUser = getUser(userId);
  if (!freshUser.inventory[invKey]) freshUser.inventory[invKey] = [];
  freshUser.inventory[invKey].push(itemId);
  updateUser(userId, freshUser);

  console.log(`[SHOP] ${userId.split('@')[0]} comprou ${itemType}:${itemId} por ${item.price}`);
  return { ok:true, item };
}

// ─────────────────────────────────────────────────────────────
// EQUIPAR
// ─────────────────────────────────────────────────────────────

function equipItem(userId, itemType, itemId) {
  const user = getUser(userId);
  if (!user.inventory)           user.inventory          = {};
  if (!user.inventory.frames)    user.inventory.frames   = ['default'];
  if (!user.inventory.fonts)     user.inventory.fonts    = ['default'];
  if (!user.inventory.relics)    user.inventory.relics   = [];
  if (!user.inventory.equipped)  user.inventory.equipped = { frame:'default', font:'default', relic:null };
  if (!('relic' in user.inventory.equipped)) user.inventory.equipped.relic = null;

  const invKey = itemType === 'frame' ? 'frames' : itemType === 'font' ? 'fonts' : 'relics';
  if (!(user.inventory[invKey] || []).includes(itemId)) return { error:'not_owned' };

  user.inventory.equipped[itemType] = itemId;
  updateUser(userId, user);
  console.log(`[SHOP] ${userId.split('@')[0]} equipou ${itemType}:${itemId}`);
  return { ok:true };
}

// ─────────────────────────────────────────────────────────────
// BÔNUS DE BATALHA
// ─────────────────────────────────────────────────────────────

function getBattleBonus(userId) {
  try {
    const user    = getUser(userId);
    const relicId = user.inventory?.equipped?.relic;
    if (!relicId) return {};
    const item = BATTLE_ITEMS[relicId];
    return item ? { ...item.bonus } : {};
  } catch (err) {
    console.error('[SHOP] Erro em getBattleBonus:', err.message);
    return {};
  }
}

// ─────────────────────────────────────────────────────────────
// RENDER PROFILE
// ─────────────────────────────────────────────────────────────

function renderProfile(user, name) {
  if (!user.inventory)          user.inventory          = {};
  if (!user.inventory.equipped) user.inventory.equipped = { frame:'default', font:'default', relic:null };
  const frameId    = user.inventory.equipped?.frame || 'default';
  const fontId     = user.inventory.equipped?.font  || 'default';
  const frame      = FRAMES[frameId] || FRAMES['default'];
  const rank       = getRank ? getRank(user.level || 1) : 'Membro';
  const styledName = applyFont(name, fontId);
  return frame.template(styledName, rank, user.level || 1);
}

module.exports = {
  FRAMES, FONT_MAPS, BATTLE_ITEMS,
  applyFont, getShopItems, buyItem, equipItem, getBattleBonus, renderProfile,
};
