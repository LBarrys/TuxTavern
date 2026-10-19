'use strict';
const editor = require('../../lib/editor.js');
const { install } = require('../../lib/pmjs-cheats.js');

let failed = 0;
function is(desc, got, want) {
  got = JSON.stringify(got);
  want = JSON.stringify(want);
  if (got === want) { console.log('ok PMJS cheats: ' + desc); return; }
  failed++;
  console.log('FAIL PMJS cheats: ' + desc + ' (got ' + got + ', wanted ' + want + ')');
}

class Bitmap {
  constructor(width, height) { Object.assign(this, { width, height, texts: [], rows: [] }); }
  clear() { this.texts = []; this.rows = []; }
  fillRect(x, y) { if (x === 4) this.at = y; }
  drawText(text, x, y, width, height, align) {
    this.texts.push(align === 'right' ? '> ' + text : text);
    if (align !== 'right') this.rows.push([y, text]);
  }
}
class Sprite { constructor(bitmap) { this.bitmap = bitmap; this.parent = null; } }
class Scene {
  constructor() { this.children = []; this.updates = 0; }
  addChild(c) { this.children.push(c); c.parent = this; }
  removeChild(c) { this.children = this.children.filter(x => x !== c); c.parent = null; }
}
class SceneMap extends Scene {}
class Actor {
  constructor(id, name) { Object.assign(this, { id, _name: name, level: 1, hp: 100, mp: 10 }); }
  name() { return this._name; }
  actorId() { return this.id; }
  param() { return 10; }
  changeLevel(n) { this.level = n; }
  recoverAll() {}
}
class Player {
  constructor() { Object.assign(this, { x: 30, y: 40, transferring: false }); }
  isTransferring() { return this.transferring; }
  performTransfer() { this.transferring = false; }
  locate(x, y) { this.x = x; this.y = y; }
  reserveTransfer(mapId, x, y) { this.transferring = true; this.to = [mapId, x, y]; }
  direction() { return 2; }
}

let held = new Set();
let pressed = new Set();
const keys = [];
const hero = new Actor(1, 'Hero');
const items = new Map();
const vars = [0, 15, 'text'];
const switches = [false, false];
const w = {
  Bitmap, Sprite, Graphics: { width: 816, height: 624 },
  Scene_Map: SceneMap, Scene_Save: 'save', Scene_Load: 'load',
  Input: {
    keyMapper: {},
    isTriggered: k => pressed.has(k), isRepeated: k => pressed.has(k), isPressed: k => held.has(k),
  },
  SceneManager: { _scene: new SceneMap(), updateScene() { this._scene.updates++; }, push(s) { this.pushed = s; } },
  Game_Player: Player,
  document: { addEventListener: (type, f) => keys.push(f) },
  $gameParty: {
    gold: () => 0, members: () => [hero], numItems: item => items.get(item.id) || 0,
    gainItem: (item, n) => items.set(item.id, (items.get(item.id) || 0) + n), gainGold() {},
  },
  $gameActors: { actor: () => hero },
  $gameSwitches: { value: id => switches[id], setValue: (id, v) => { switches[id] = v; } },
  $gameVariables: { value: id => vars[id], setValue: (id, v) => { vars[id] = v; } },
  $gameMap: { mapId: () => 1, width: () => 20, height: () => 15 },
  $gameSystem: { mainFontFace: () => 'rmmz-mainfont, sans-serif' },
  $gamePlayer: new Player(),
  $dataActors: [null, { id: 1, name: 'Hero' }],
  $dataItems: [null, { id: 1, name: 'Potion' }, { id: 2, name: 'Ether' }],
  $dataWeapons: [null], $dataArmors: [null],
  $dataMapInfos: [null, { id: 1, name: 'Town' }, { id: 2, name: 'Cave' }],
  $dataSystem: { switches: ['', 'Door'], variables: ['', 'Coins', 'Name'], terms: { params: [] } },
};
const menu = install(w, editor);
const frame = (...k) => { pressed = new Set(k); w.SceneManager.updateScene(); pressed = new Set(); };
const sprite = () => w.SceneManager._scene.children[0];
const texts = () => (sprite() ? sprite().bitmap.texts : []);
const current = () => (sprite().bitmap.rows.find(([y]) => y === sprite().bitmap.at) || [])[1];
const to = label => { for (let i = 0; i < 50 && current() !== label; i++) frame('down'); };
const type = text => { for (const key of text) keys.forEach(f => f({ key })); };
const f8 = (repeat = false) => { keys.forEach(f => f({ key: 'F8', keyCode: 119, repeat })); frame(); };

// Karryn's Prison's YEP_KeyboardConfig swaps in the saved key map after plugins load.
w.Input.keyMapper = { 13: 'ok' };
frame();
is('the game runs while the menu is shut', w.SceneManager._scene.updates, 1);
f8(true);
is('a held F8 repeating does not open it', menu.open, false);
f8();
is('F8 opens the menu over the scene', [menu.open, texts().includes('God mode: Hero')], [true, true]);
is('in the game font on MZ', sprite().bitmap.fontFace, 'rmmz-mainfont, sans-serif');
frame();
is('the game is paused while it is open', w.SceneManager._scene.updates, 2);
frame('ok');
is('Enter switches god mode on', editor.model(w).cheats().god, [1]);
is('and the row shows it', texts()[texts().indexOf('God mode: Hero') + 1], '> ON');
frame('down');
held = new Set(['shift']);
frame('right');
held = new Set();
is('Shift+Right raises the level by 10', hero.level, 11);

to('Items >');
frame('ok');
is('a list opens with a search row', texts().slice(1, 3), ['Search: ', 'Potion']);
frame('down');
frame('right');
is('an item count is raised', items.get(1), 1);
frame('up');
frame('ok');
type('eth');
is('typing narrows the list', texts().filter(t => t === 'Potion' || t === 'Ether'), ['Ether']);
keys.forEach(f => f({ key: 'Enter' }));
frame('ok');
is('the Enter that ends typing does not act again', texts()[1], 'Search: eth');
frame('cancel');
to('Variables >');
frame('ok');
frame('ok');
type('15');
keys.forEach(f => f({ key: 'Enter' }));
is('search finds a variable by its exact value', texts().filter(t => /^\d /.test(t)), ['1 Coins']);
frame();
frame('down');
frame('right');
is('and changes it', vars[1], 16);
frame('cancel');

to('Teleport >');
frame('ok');
to('002 Cave');
frame('ok');
is('teleport closes the menu and keeps x, y', [menu.open, w.$gamePlayer.to], [false, [2, 30, 40]]);
w.$gamePlayer.performTransfer();
is('the player is pulled inside a smaller map', [w.$gamePlayer.x, w.$gamePlayer.y], [19, 14]);

f8();
w.SceneManager._scene = new SceneMap();
frame();
is('changing scene closes the menu', menu.open, false);
f8();
f8();
is('F8 closes it again', [menu.open, w.SceneManager._scene.children.length], [false, 0]);

process.exit(failed ? 1 : 0);
