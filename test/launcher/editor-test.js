'use strict';
const { model, value, hooks } = require('../../lib/editor.js');

let failed = 0;
function is(desc, got, want) {
  got = JSON.stringify(got);
  want = JSON.stringify(want);
  if (got === want) { console.log('ok ' + desc); return; }
  failed++;
  console.log('FAIL ' + desc + ' (got ' + got + ', wanted ' + want + ')');
}

class Actor {
  constructor(id, name) { Object.assign(this, { id, _name: name, level: 1, hp: 50, mp: 10, plus: [0, 0, 0, 0, 0, 0, 0, 0] }); }
  name() { return this._name; }
  actorId() { return this.id; }
  param(i) { return 100 + this.plus[i]; }
  addParam(i, d) { this.plus[i] += d; }
  changeLevel(n) { this.level = n; }
  setHp(n) { this.hp = Math.min(n, this.param(0)); }
  setMp(n) { this.mp = n; }
}
class Store {
  constructor() { this.data = []; }
  value(id) { return this.data[id] ?? 0; }
  setValue(id, v) { this.data[id] = v; }
}
const counts = new Map();
const actors = [null, new Actor(1, 'Harold'), new Actor(2, 'Therese'), new Actor(3, 'Marsha')];
const w = {
  $dataItems: [null, { id: 1, name: 'Potion' }, { id: 2, name: '' }, { id: 3, name: 'Ether' }],
  $dataWeapons: [null, { id: 1, name: 'Sword' }],
  $dataArmors: [null],
  $dataActors: [null, { id: 1, name: 'Harold' }, { id: 2, name: 'Therese' }, { id: 3, name: 'Marsha' }],
  $dataSystem: { switches: ['', 'Door open', 'Boss beaten'], variables: ['', 'Coins', 'Name'], terms: { params: ['Max HP', 'Max MP', 'Attack'] } },
};
const m = model(w);
is('not ready before a game is started', m.ready(), false);

Object.assign(w, {
  $gameParty: {
    _gold: 100,
    gold() { return this._gold; },
    gainGold(n) { this._gold = Math.max(0, this._gold + n); },
    numItems: item => counts.get(item) || 0,
    gainItem: (item, n) => counts.set(item, Math.max(0, (counts.get(item) || 0) + n)),
    members: () => [actors[2]],
  },
  $gameActors: { actor: id => actors[id] },
  $gameSwitches: new Store(),
  $gameVariables: new Store(),
});
is('ready once a game is running', m.ready(), true);

m.setGold(5000);
is('gold is set to the value asked for', m.gold(), 5000);

is('the catalog lists named entries only', m.catalog('items').map(e => e.name), ['Potion', 'Ether']);
is('nothing is owned at first', m.owned('items'), []);
m.setCount('items', 1, 7);
is('an item count is set through gainItem', m.owned('items'), [{ id: 1, name: 'Potion', count: 7 }]);
m.setCount('items', 1, 2);
is('and lowered the same way', m.owned('items')[0].count, 2);
m.setCount('items', 1, 0);
is('an item at 0 leaves the list', m.owned('items'), []);
m.setCount('weapons', 1, 1);
is('weapons are their own list', m.owned('weapons').map(e => e.name), ['Sword']);

is('party members come first', m.roster().map(a => a.name), ['Therese', 'Harold', 'Marsha']);
is('and are marked', m.roster()[0].inParty, true);
is('the party alone is listed for god mode', m.party(), [{ id: 2, name: 'Therese' }]);
m.setActor(1, 'level', 30);
m.setActor(1, 'hp', 80);
m.setActor(1, 2, 150);
const harold = m.actorInfo(1);
is('level is changed', harold.level, 30);
is('HP is changed', harold.hp, 80);
is('a parameter is set to the value asked for', harold.params[2], 150);
is('through addParam, as a permanent bonus', actors[1].plus[2], 50);
is('parameter names come from the game', m.paramNames(), ['Max HP', 'Max MP', 'Attack']);

is('switches are listed from id 1 with names', m.switches(), [{ id: 1, name: 'Door open', value: 0 }, { id: 2, name: 'Boss beaten', value: 0 }]);
m.setSwitch(2, 1);
is('a switch is turned on', w.$gameSwitches.value(2), true);
m.setVariable(1, '42');
m.setVariable(2, 'Ann');
is('a numeric variable stays a number', w.$gameVariables.value(1), 42);
is('text stays text', w.$gameVariables.value(2), 'Ann');
is('JSON values are parsed', value('[1,2]'), [1, 2]);

class BattlerBase {
  constructor(id) { Object.assign(this, { id, _hp: 10, _mp: 5, _tp: 0, mhp: 100, mmp: 50, states: [] }); }
  setHp(n) { this._hp = n; }
  setMp(n) { this._mp = n; }
  setTp(n) { this._tp = n; }
  maxTp() { return 100; }
  gainHp(n) { this.setHp(this._hp + n); }
  paySkillCost(skill) { this._mp -= skill.mp; }
  deathStateId() { return 1; }
  recoverAll() { this._hp = this.mhp; this._mp = this.mmp; }
}
class Battler extends BattlerBase { addState(id) { this.states.push(id); } }
class GameActor extends Battler { actorId() { return this.id; } }
class Player {
  constructor() { Object.assign(this, { _through: false, x: 3, y: 4, dashing: false, moved: null }); }
  isThrough() { return this._through; }
  canEncounter() { return true; }
  realMoveSpeed() { return 4 + (this.dashing ? 1 : 0); }
  isDashing() { return this.dashing; }
  direction() { return 2; }
  reserveTransfer(...args) { this.moved = args; }
}
class SceneBattle {}
class SceneMap {}
const frames = [];
const store = new Map();
const hero = new GameActor(7);
const g = {
  Game_BattlerBase: BattlerBase, Game_Battler: Battler, Game_Actor: GameActor, Game_Player: Player,
  Scene_Battle: SceneBattle, Scene_Map: SceneMap, Scene_Save: 'save', Scene_Load: 'load',
  SceneManager: {
    _scene: new SceneMap(), pushed: null,
    updateScene() { frames.push('scene'); }, updateInputData() { frames.push('input'); }, changeScene() {},
    push(s) { this.pushed = s; },
  },
  BattleManager: { _phase: 'turn', result: null, processVictory() { this.result = 'won'; }, processAbort() { this.result = 'aborted'; } },
  SoundManager: { playEscape() {} },
  $gameParty: { members: () => [hero], performEscape() {} },
  $gameActors: { actor: () => hero },
  $gameTroop: { members: () => [Object.assign(new Battler(9), { addNewState(id) { this.states.push(id); }, performCollapse() { this.collapsed = true; } })] },
  $gameMap: { mapId: () => 5 },
  $gamePlayer: new Player(),
  $dataMapInfos: [null, { id: 1, name: 'Town' }, null, { id: 3, name: '' }, null, { id: 5, name: 'Cave' }],
  localStorage: { getItem: k => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) },
};
const c = model(g);
c.cheats();
c.cheats();
c.setGod(7, true);
hero.gainHp(-500);
is('god mode: damage leaves HP full', hero._hp, 100);
hero.paySkillCost({ mp: 20 });
is('god mode: skills cost nothing', hero._mp, 50);
hero.addState(1);
hero.addState(4);
is('god mode: death is refused, other states are not', hero.states, [4]);
c.setGod(7, false);
hero.gainHp(-30);
is('god mode off: damage counts again', hero._hp, 70);
const enemy = new Battler(3);
enemy.gainHp(-5);
is('enemies are never protected', enemy._hp, 5);
const pl = g.$gamePlayer;
c.setCheat('noclip', true);
is('no clip lets the player through walls', pl.isThrough(), true);
c.setCheat('noclip', false);
is('and can be turned off', pl.isThrough(), false);
c.setCheat('noEncounters', true);
is('random battles can be turned off', pl.canEncounter(), false);
c.setCheat('move', 6);
pl.dashing = true;
is('move speed is set, dashing still adds one', pl.realMoveSpeed(), 7);
const saved = JSON.parse(JSON.stringify(pl));
g.$gamePlayer = Object.assign(new Player(), { dashing: true });
is('a new game starts at normal speed', [c.cheats().move, g.$gamePlayer.realMoveSpeed()], [0, 5]);
g.$gamePlayer = Object.assign(new Player(), saved);
is('move speed is saved with the game', [c.cheats().move, g.$gamePlayer.realMoveSpeed()], [6, 7]);
c.setCheat('move', 0);
is('move speed 0 keeps the game speed', g.$gamePlayer.realMoveSpeed(), 5);
is('and leaves nothing in the save', 'move' in g.$gamePlayer._rpgmCheats, false);
g.$gamePlayer = pl;
c.setCheat('speed', 2);
g.SceneManager.updateScene();
is('game speed 2 runs two frames, reading input between them', frames, ['scene', 'input', 'scene']);
frames.length = 0;
c.setCheat('speed', 0.5);
g.SceneManager.updateScene();
g.SceneManager.updateScene();
is('game speed 0.5 runs every other frame', frames, ['scene']);
c.setCheat('speed', 1);
is('hooks are installed once', (frames.length = 0, g.SceneManager.updateScene(), frames), ['scene']);
c.setGod(7, true);
c.setCheat('noclip', true);
c.setCheat('move', 6);
c.setCheat('speed', 2);
const save = JSON.stringify(pl);
const on = () => [c.cheats().god, c.cheats().noclip, c.cheats().noEncounters, c.cheats().move, c.cheats().speed];
g.$gamePlayer = new Player();
is('a new game starts with every cheat off', on(), [[], false, false, 0, 1]);
hero.gainHp(-30);
is('so damage counts', hero._hp, 70);
g.$gamePlayer = Object.assign(new Player(), JSON.parse(save));
is('a save brings its cheats back', on(), [[7], true, true, 6, 2]);
is('and they work', [g.$gamePlayer.isThrough(), g.$gamePlayer.canEncounter(), (hero.gainHp(-30), hero._hp)], [true, false, 100]);
c.setGod(7, false);
for (const [k, v] of [['noclip', false], ['noEncounters', false], ['move', 0], ['speed', 1]]) c.setCheat(k, v);
is('with every cheat off, nothing is left in the save', '_rpgmCheats' in g.$gamePlayer, false);
g.$gamePlayer = pl;
is('battle actions need a battle', [c.win(), c.escape()], [false, false]);
g.SceneManager._scene = new SceneBattle();
is('win kills and collapses every enemy', [c.win(), g.$gameTroop.members().length > 0], [true, true]);
is('then ends the battle as a victory', g.BattleManager.result, 'won');
is('escape ends it as an escape', [c.escape(), g.BattleManager.result, g.BattleManager._escaped], [true, 'aborted', true]);
is('saving is refused outside the map', c.open('save'), false);
g.SceneManager._scene = new SceneMap();
is('saving opens the save screen on the map', [c.open('save'), g.SceneManager.pushed], [true, 'save']);
is('maps are listed by name', c.maps().map(e => e.name), ['Town', 'Cave']);
is('teleport refuses a missing map', c.teleport(2, 0, 0), false);
is('teleport reserves a transfer facing the same way', [c.teleport(1, 8, 9), pl.moved], [true, [1, 8, 9, 2, 0]]);
c.remember('Inn');
is('a spot is remembered with its map and position', c.spots(), [{ name: 'Inn', mapId: 5, x: 3, y: 4 }]);
is('and kept in local storage', JSON.parse(store.get('rpgm-editor-spots')).length, 1);
c.forget(0);
is('and forgotten', c.spots(), []);

delete pl._rpgmCheats;
const page = { ...g, $gamePlayer: Object.assign(new Player(), { _rpgmCheats: { noclip: true } }) };
delete page.rpgmCheats;
hooks(page);
is('cheats kept in a save work once hooked, before F8 is pressed', page.$gamePlayer.isThrough(), true);

process.exit(failed ? 1 : 0);
