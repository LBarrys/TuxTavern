'use strict';

const KINDS = { items: '$dataItems', weapons: '$dataWeapons', armors: '$dataArmors' };

function value(text) {
  try { return JSON.parse(text); } catch { return text; }
}

function hooks(w) {
  if (w.rpgmCheats) return w.rpgmCheats;
  // Kept on the player, so the cheats are saved with the game.
  const saved = () => (w.$gamePlayer && w.$gamePlayer._rpgmCheats) || {};
  const c = {};
  for (const [key, none] of [['god', []], ['noclip', false], ['noEncounters', false], ['move', 0], ['speed', 1]]) {
    Object.defineProperty(c, key, {
      enumerable: true,
      get: () => saved()[key] ?? none,
      set: v => {
        const p = w.$gamePlayer;
        if (!p) return;
        const s = { ...saved(), [key]: v };
        if (v === none || (Array.isArray(v) && !v.length)) delete s[key];
        if (Object.keys(s).length) p._rpgmCheats = s; else delete p._rpgmCheats;
      },
    });
  }
  w.rpgmCheats = c;
  const wrap = (proto, name, make) => {
    if (proto && typeof proto[name] === 'function') proto[name] = make(proto[name]);
  };
  const god = b => w.Game_Actor && b instanceof w.Game_Actor && c.god.includes(b.actorId());
  const base = w.Game_BattlerBase && w.Game_BattlerBase.prototype;
  wrap(base, 'setHp', f => function (n) { f.call(this, god(this) ? Math.max(n, this.mhp) : n); });
  wrap(base, 'setMp', f => function (n) { f.call(this, god(this) ? Math.max(n, this.mmp) : n); });
  wrap(base, 'setTp', f => function (n) { f.call(this, god(this) ? Math.max(n, this.maxTp()) : n); });
  wrap(base, 'paySkillCost', f => function (skill) { if (!god(this)) f.call(this, skill); });
  wrap(w.Game_Battler && w.Game_Battler.prototype, 'addState', f => function (id) {
    if (!(god(this) && id === this.deathStateId())) f.call(this, id);
  });
  const player = w.Game_Player && w.Game_Player.prototype;
  wrap(player, 'isThrough', f => function () { return c.noclip || f.call(this); });
  wrap(player, 'canEncounter', f => function () { return !c.noEncounters && f.call(this); });
  wrap(player, 'realMoveSpeed', f => function () {
    return c.move ? c.move + (this.isDashing() ? 1 : 0) : f.call(this);
  });
  let carry = 0;
  wrap(w.SceneManager, 'updateScene', f => function () {
    if (c.speed === 1) { f.call(this); return; }
    carry += c.speed;
    const steps = Math.floor(carry);
    carry -= steps;
    for (let k = 0; k < steps; k++) {
      if (k) { this.updateInputData(); this.changeScene(); }
      f.call(this);
    }
  });
  return c;
}

function model(w) {
  const party = () => w.$gameParty;
  const scene = () => w.SceneManager && w.SceneManager._scene;
  const inBattle = () => !!(w.Scene_Battle && scene() instanceof w.Scene_Battle && w.BattleManager._phase !== 'battleEnd');
  const here = () => ({ mapId: w.$gameMap.mapId(), x: w.$gamePlayer.x, y: w.$gamePlayer.y });
  let kept = [];
  const spots = {
    get: () => { try { return JSON.parse(w.localStorage.getItem('rpgm-editor-spots')) || kept; } catch { return kept; } },
    set: list => { kept = list; try { w.localStorage.setItem('rpgm-editor-spots', JSON.stringify(list)); } catch {} },
  };
  const named = list => (list || []).filter(x => x && x.name).map(x => ({ id: x.id, name: x.name }));
  const actor = id => w.$gameActors.actor(id);
  const listed = (names, store) => (names || []).map((name, id) => ({ id, name, value: store.value(id) })).slice(1);
  return {
    ready: () => !!(w.$gameParty && w.$gameActors && w.$gameSwitches && w.$gameVariables && w.$dataSystem),
    gold: () => party().gold(),
    setGold: n => party().gainGold(n - party().gold()),
    catalog: kind => named(w[KINDS[kind]]),
    count: (kind, id) => party().numItems(w[KINDS[kind]][id]),
    owned: kind => named(w[KINDS[kind]])
      .map(e => ({ ...e, count: party().numItems(w[KINDS[kind]][e.id]) }))
      .filter(e => e.count > 0),
    setCount: (kind, id, n) => {
      const item = w[KINDS[kind]][id];
      party().gainItem(item, n - party().numItems(item), false);
    },
    paramNames: () => (w.$dataSystem.terms.params || []).slice(0, 8),
    roster: () => {
      const members = party().members();
      return named(w.$dataActors).map(e => {
        const a = actor(e.id);
        return { id: e.id, name: a.name() || e.name, inParty: members.includes(a) };
      }).sort((x, y) => y.inParty - x.inParty);
    },
    party: () => party().members().map(a => ({ id: a.actorId(), name: a.name() })),
    actorInfo: id => {
      const a = actor(id);
      return { level: a.level, hp: a.hp, mp: a.mp, params: [0, 1, 2, 3, 4, 5, 6, 7].map(i => a.param(i)) };
    },
    setActor: (id, key, n) => {
      const a = actor(id);
      if (key === 'level') a.changeLevel(n, false);
      else if (key === 'hp') a.setHp(n);
      else if (key === 'mp') a.setMp(n);
      else a.addParam(key, n - a.param(key));
    },
    switches: () => listed(w.$dataSystem.switches, w.$gameSwitches),
    setSwitch: (id, on) => w.$gameSwitches.setValue(id, !!on),
    variables: () => listed(w.$dataSystem.variables, w.$gameVariables),
    setVariable: (id, text) => w.$gameVariables.setValue(id, value(text)),
    cheats: () => hooks(w),
    setGod: (id, on) => {
      const c = hooks(w);
      c.god = on ? [...new Set([...c.god, id])] : c.god.filter(x => x !== id);
      if (on) actor(id).recoverAll();
    },
    setCheat: (key, v) => { hooks(w)[key] = v; },
    heal: () => party().members().forEach(a => a.recoverAll()),
    win: () => {
      if (!inBattle()) return false;
      w.$gameTroop.members().forEach(e => { e.addNewState(e.deathStateId()); e.performCollapse(); });
      w.BattleManager.processVictory();
      return true;
    },
    escape: () => {
      if (!inBattle()) return false;
      party().performEscape();
      w.SoundManager.playEscape();
      w.BattleManager._escaped = true;
      w.BattleManager.processAbort();
      return true;
    },
    open: kind => {
      if (kind === 'save' && !(scene() instanceof w.Scene_Map)) return false;
      w.SceneManager.push(kind === 'save' ? w.Scene_Save : w.Scene_Load);
      return true;
    },
    maps: () => named(w.$dataMapInfos),
    here,
    teleport: (mapId, x, y) => {
      if (!(w.$dataMapInfos || [])[mapId]) return false;
      w.$gamePlayer.reserveTransfer(mapId, x, y, w.$gamePlayer.direction(), 0);
      return true;
    },
    spots: () => spots.get(),
    remember: name => spots.set([...spots.get(), { name, ...here() }]),
    forget: k => spots.set(spots.get().filter((_, i) => i !== k)),
  };
}

module.exports = { model, value, hooks };
