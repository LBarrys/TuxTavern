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
is('other games have no Karryn\'s Prison pages', texts().includes('Karryn >'), false);

// Karryn's Prison, with the methods its scripts have. Its constants are top-level consts, so only
// the global scope (eval) sees them.
class Karryn extends Actor {
  constructor() {
    super(1, 'Karryn');
    Object.assign(this, {
      _hp: 50, mhp: 900, _mp: 5, mmp: 80, _will: 30, _tp: 0, _fatigue: 70, _sleepQuality: 40, cockiness: 10,
      _clothingDurability: 30, _clothingStage: 3, _clothingMaxStage: 5, panties: false,
      _level: 4, _paramLvl: [1, 2, 3, 4, 5, 6, 7, 8], _storedEdictPoints: 2,
    });
    for (const d of ['cock', 'mouth', 'boobs', 'pussy', 'butt']) {
      this[d + 'Desire'] = 5;
      const D = d[0].toUpperCase() + d.slice(1);
      this['max' + D + 'Desire'] = 100;
      this['set' + D + 'Desire'] = (v, fromWillpowerSkill) => { this[d + 'Desire'] = v; this.fromWill = fromWillpowerSkill; };
    }
  }
  setHp(n) { this._hp = n; }
  setMp(n) { this._mp = n; }
  setWill(n) { this._will = n; }
  maxWill() { return 120; }
  setTp(n) { this._tp = n; }
  orgasmPoint() { return 100; }
  setFatigue(n) { this._fatigue = n; }
  addCockiness(n) { this.cockiness += n; }
  getClothingMaxDurability() { return 200; }
  minimumClothingDurabilityForStage(stage) { return [0, 150, 100, 50, 20, 0][stage]; }
  changeClothingToStage(n) { this._clothingStage = n; }
  isWearingPanties() { return this.panties; }
  putOnPanties() { this.panties = true; }
  takeOffPanties() { this.panties = false; }
  getWardenLevelLimit() { return 30; }
  stsSp() { return 0; }
  setAsp(n) { this.asp = n; }
}
const karryn = new Karryn();
const scope = { ACTOR_KARRYN_ID: 1, PRISON_ORDER_MAX: 100 };
w.eval = code => new Function(...Object.keys(scope), 'return ' + code)(...Object.values(scope));
w.$gameActors = { actor: id => (id === 1 ? karryn : null) };
w.TextManager = { param: i => ['Max stamina', 'Max energy', 'Strength', 'Endurance', 'Dexterity', 'Mind', 'Agility', 'Charm'][i] };
Object.assign(w.$gameParty, {
  order: 50, setOrder(n) { this.order = n; }, _corruption: 3, setCorruption(n) { this._corruption = n; },
  guardAggression: 7, setGuardAggression(n) { this.guardAggression = n; }, _prisonLevelTwoRiotBuildup: 40,
  _barReputation: 12, setBarReputation(n) { this._barReputation = n; },
});
// Tall enough to show every row of a page at once.
w.Graphics.height = 1300;
const rowsOf = () => texts().filter(t => t && !/^> |^Search/.test(t)).slice(1);
const open = name => { to(name + ' >'); frame('ok'); };
const shifted = (key, times) => { held = new Set(['shift']); for (let i = 0; i < times; i++) frame(key); held = new Set(); };
f8();
is('Karryn\'s Prison gets Karryn, Prison and Side jobs pages', ['Karryn >', 'Prison >', 'Side jobs >'].every(p => texts().includes(p)), true);
open('Karryn');
is('Karryn\'s page has her vitals, condition, desires, clothing, levels and edict points', rowsOf(), [
  'Stamina (max 900)', 'Energy (max 80)', 'Willpower (max 120)', 'Pleasure (max 100)', 'Fatigue % (max 100)',
  'Sleep quality % (max 100)', 'Cockiness % (max 100)', 'Cock desire (max 100)', 'Mouth desire (max 100)',
  'Boobs desire (max 100)', 'Pussy desire (max 100)', 'Butt desire (max 100)', 'Clothing durability (max 200)',
  'Clothing stage (max 5)', 'Panties', 'Warden level (max 30)', 'Max stamina level', 'Max energy level',
  'Strength level', 'Endurance level', 'Dexterity level', 'Mind level', 'Agility level', 'Charm level', 'Edict points']);
to('Fatigue % (max 100)');
shifted('left', 10);
is('fatigue is set through the game, not below 0', karryn._fatigue, 0);
to('Willpower (max 120)');
shifted('right', 10);
is('willpower rises up to its maximum', karryn._will, 120);
to('Pussy desire (max 100)');
frame('left');
is('a desire is set through the game, as not from a willpower skill', [karryn.pussyDesire, karryn.fromWill], [0, false]);
to('Clothing durability (max 200)');
shifted('right', 20);
is('mended clothing is whole again: durability at its maximum, stage 1', [karryn._clothingDurability, karryn._clothingStage], [200, 1]);
to('Panties');
frame('ok');
is('panties are put on', karryn.panties, true);
to('Strength level');
frame('right');
is('a stat level is raised', karryn._paramLvl[2], 4);
to('Edict points');
frame('right');
is('edict points are stored and set as the game does', [karryn._storedEdictPoints, karryn.asp], [3, 3]);
frame('cancel');
open('Prison');
is('the prison page has order, corruption, guard aggression and riot build-up where the game has it',
  rowsOf(), ['Order (max 100)', 'Corruption', 'Guard aggression', 'Level 2 riot build-up (max 100)']);
to('Order (max 100)');
shifted('right', 6);
is('order stops at the prison\'s maximum', w.$gameParty.order, 100);
to('Level 2 riot build-up (max 100)');
shifted('left', 5);
is('riot build-up goes down to 0', w.$gameParty._prisonLevelTwoRiotBuildup, 0);
frame('cancel');
open('Side jobs');
is('side jobs show the reputations the game has', rowsOf(), ['Bar reputation']);
to('Bar reputation');
frame('right');
is('and set them through it', w.$gameParty._barReputation, 13);
frame('cancel');

// Liquids, titles, passives, edicts and battle, with the methods the game has for them.
Object.assign(karryn, {
  _liquidSwallow: 5, increaseLiquidSwallow(n) { this._liquidSwallow += n; }, setCacheChanged() { this.redrawn = true; },
  titles: new Set([2]), hasThisTitle(id) { return this.titles.has(id); },
  gainTitle(id) { this.titles.add(id); }, removeTitle(id) { this.titles.delete(id); },
  passives: new Set(), hasPassive(id) { return this.passives.has(id); },
  learnNewPassive(id) { this.passives.add(id); }, forgetPassive(id) { this.passives.delete(id); },
  learned: new Set([600]), points: 0,
  getTreeTypes() { return [61]; },
  getTreeDatas() { return [{ id: 600 }, { id: 601 }, { id: 602 }]; },
  getPreskillId(id) { return id === 602 ? [601] : []; },
  isStsLearnedSkill(id) { return this.learned.has(id); },
  isPayCostOk() { return this.points > 0; },
  stsLearnSkill(id) { this.learned.add(id); this.points--; },
  setWillToMax() { this._will = this.maxWill(); },
});
Object.assign(scope, { TITLE_LIST_START_ID: 30, TITLE_LIST_END_ID: 31, PASSIVES_LIST_ONE_START_ID: 400, PASSIVES_LIST_ONE_END_ID: 401 });
w.$dataArmors = [];
Object.assign(w.$dataArmors, { 2: { name: 'Warden' }, 30: { name: 'Iron Will' }, 31: { name: 'Equipped One' } });
w.$dataSkills = [];
Object.assign(w.$dataSkills, { 400: { name: 'Kissing Lover' }, 401: { name: '' }, 600: { name: 'Office' }, 601: { name: 'Guards' }, 602: { name: 'Riot Gear' } });
w.$dataWeapons = [];
w.$dataWeapons[61] = { name: 'Prison' };
w.$gameParty.isAnyMemberEquipped = armor => armor === w.$dataArmors[31];
karryn.titles.add(31);
f8();
f8();
open('Liquids');
to('Swallow');
frame('right');
is('a liquid is raised through the game, and Karryn is redrawn', [karryn._liquidSwallow, karryn.redrawn], [15, true]);
is('only the liquids the game can change are listed, named as in the game', rowsOf(), ['Swallow']);
frame('cancel');
open('Titles');
is('titles list the game\'s title armors that have names', rowsOf(), ['Warden', 'Iron Will', 'Equipped One']);
to('Iron Will');
frame('ok');
is('a title is gained', karryn.titles.has(30), true);
to('Equipped One');
frame('ok');
is('an equipped title is not removed', karryn.titles.has(31), true);
is('and that is said', texts().includes('Unequip that title first.'), true);
frame('cancel');
open('Passives');
is('passives list the earnable ones that have names', rowsOf(), ['Kissing Lover']);
to('Kissing Lover');
frame('ok');
is('a passive is learned through the game', karryn.passives.has(400), true);
frame('ok');
is('and forgotten', karryn.passives.has(400), false);
frame('cancel');
open('Edicts');
is('edicts show which are learned, can be bought or are locked',
  texts().filter(t => /^> (learned|buy|locked)$/.test(t)), ['> learned', '> buy', '> locked']);
to('Prison: Guards');
frame('ok');
is('one is not bought without the points', [karryn.learned.has(601), texts().includes('Not enough edict points or gold.')], [false, true]);
karryn.points = 1;
frame('ok');
is('with them the game sells it', [karryn.learned.has(601), karryn.points, texts().includes('Bought.')], [true, 0, true]);
frame('cancel');
is('the battle page only shows in a battle', texts().includes('Battle >'), false);
const enemy = { _hp: 300, isDead: () => false, setHp(n) { this._hp = n; }, horny: false, addHornyState() { this.horny = true; } };
const dead = { _hp: 0, isDead: () => true, setHp(n) { this._hp = n; }, addHornyState() { this.horny = true; } };
w.$gameTroop = { members: () => [enemy, dead] };
w.$gameParty.inBattle = () => true;
frame('cancel');
f8();
open('Battle');
to('Enemies: stamina 0');
frame('ok');
to('Enemies: horny');
frame('ok');
is('enemies are knocked down and made horny, but not the ones already down', [enemy._hp, enemy.horny, dead.horny], [0, true, undefined]);
to('Karryn: full willpower');
karryn._will = 1;
frame('ok');
is('Karryn\'s willpower is filled', karryn._will, 120);
w.$gameParty.inBattle = () => false;
frame('cancel');
f8();
f8();

karryn.setFatigue = undefined;
open('Karryn');
is('a stat the game does not have is left out', rowsOf().includes('Fatigue % (max 100)'), false);
f8();

// On the title screen Karryn exists, but the game is not loaded (map 0) and her stats throw.
const logged = [];
const log = console.log;
console.log = text => (String(text).startsWith('tt:') ? logged.push(text) : log(text));
karryn.maxWill = () => { throw new TypeError("Cannot read properties of undefined (reading '5')"); };
w.$gameMap.mapId = () => 0;
f8();
is('before a game is loaded the menu opens, without the Karryn\'s Prison pages',
  [menu.open, texts().includes('Karryn >'), logged.length], [true, false, 0]);
f8();
w.$gameMap.mapId = () => 1;
f8();
open('Karryn');
is('a stat that throws leaves out only its own row', [rowsOf().includes('Stamina (max 900)'), rowsOf().some(t => t.startsWith('Willpower'))], [true, false]);
f8();
// Whatever fails in the menu, MV must not stop the game over it.
const updates = w.SceneManager._scene.updates;
const gold = w.$gameParty.gold;
w.$gameParty.gold = () => { throw new Error('broken'); };
f8();
is('a failing menu closes, and the game goes on', [menu.open, w.SceneManager._scene.updates], [false, updates + 1]);
is('saying why', /^tt: the F8 menu closed after an error: Error: broken/.test(logged[0]), true);
w.$gameParty.gold = gold;
console.log = log;

process.exit(failed ? 1 : 0);
