'use strict';

const { getUser }                    = require('../utils/economy.js');
const { FRAMES, FONT_MAPS, BATTLE_ITEMS } = require('../utils/shop.js');

module.exports = {
  name: 'inventario',
  execute: async ({ sock, from, sender }) => {

    const user = getUser(sender);

    if (!user.inventory)           user.inventory          = {};
    if (!user.inventory.frames)    user.inventory.frames   = ['default'];
    if (!user.inventory.fonts)     user.inventory.fonts    = ['default'];
    if (!user.inventory.relics)    user.inventory.relics   = [];
    if (!user.inventory.equipped)  user.inventory.equipped = { frame: 'default', font: 'default', relic: null };
    if (!('relic' in user.inventory.equipped)) user.inventory.equipped.relic = null;

    const frames        = user.inventory.frames;
    const fonts         = user.inventory.fonts;
    const relics        = user.inventory.relics;
    const equippedFrame = user.inventory.equipped.frame || 'default';
    const equippedFont  = user.inventory.equipped.font  || 'default';
    const equippedRelic = user.inventory.equipped.relic || null;

    const frameLines = frames.map(id => {
      const frame    = FRAMES[id];
      const equipped = id === equippedFrame ? ' ✅' : '';
      return `  • ${frame?.name || id}${equipped}`;
    });

    const fontLines = fonts.map(id => {
      const font     = FONT_MAPS[id];
      const equipped = id === equippedFont ? ' ✅' : '';
      return `  • ${font?.name || id}${equipped}`;
    });

    const relicLines = relics.length > 0
      ? relics.map(id => {
          const item     = BATTLE_ITEMS[id];
          const equipped = id === equippedRelic ? ' ✅' : '';
          return `  ${item?.icon || '🔮'} ${item?.name || id}${equipped}\n     📌 ${item?.desc || ''}`;
        })
      : [`  _Nenhuma relíquia adquirida ainda._`];

    const msg = [
      `━━━━━━━━━━━━━━━━━━`,
      `🎒 *SEU INVENTÁRIO*`,
      `━━━━━━━━━━━━━━━━━━`,
      ``,
      `🖼️ *Molduras (${frames.length}):*`,
      ...frameLines,
      ``,
      `🔤 *Fontes (${fonts.length}):*`,
      ...fontLines,
      ``,
      `⚔️ *Relíquias (${relics.length}):*`,
      ...relicLines,
      ``,
      `━━━━━━━━━━━━━━━━━━`,
      `✅ = Equipado`,
      ``,
      `💡 *!equipar frame <id>*`,
      `💡 *!equipar font <id>*`,
      `💡 *!equipar relic <id>*`,
    ].join('\n');

    await sock.sendMessage(from, { text: msg });
  },
};
