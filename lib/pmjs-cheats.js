'use strict';
// F8 cheat menu for PMJS, which has no HTML: drawn on the game screen with the game's own
// Bitmap and Sprite, using lib/editor.js's model. TuxTavern bundles both into a PMJS adapter.

const SPEEDS = [0.5, 1, 2, 3, 4];
const ROW = 26;
const KINDS = { Items: 'items', Weapons: 'weapons', Armor: 'armors' };
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
const DESIRES = ['Cock', 'Mouth', 'Boobs', 'Pussy', 'Butt'];
const KARRYN_PAGES = ['Karryn', 'Prison', 'Side jobs'];

// A game constant, from window or, for a top-level const, from the global scope.
function constant(w, name) {
  if (w[name] !== undefined) return w[name];
  try { return typeof w.eval === 'function' ? w.eval(`typeof ${name} === 'undefined' ? undefined : ${name}`) : undefined; } catch (_) { return undefined; }
}

// Karryn's Prison: its own stats, through the methods its scripts have (as CCMod's typings of the
// game and RJCheatMenu use them), only once a game is loaded: on the title screen Karryn exists but
// her stats throw. A row that cannot be read, or whose method is missing, is left out.
function karryn(w) {
  const id = constant(w, 'ACTOR_KARRYN_ID');
  try {
    if (typeof id !== 'number' || !w.$gameActors || !w.$gameMap || !(w.$gameMap.mapId() > 0)) return null;
    return w.$gameActors.actor(id) || null;
  } catch (_) { return null; }
}

function karrynRows(w, name, { number, toggle }) {
  const a = karryn(w), party = w.$gameParty;
  if (!a) return [];
  const fn = (o, m) => o && typeof o[m] === 'function';
  const num = v => typeof v === 'number' && Number.isFinite(v);
  // A number row from 0 (or lo) up to max, set through the game.
  const stat = (label, get, max, step, set, lo = 0) => () => {
    const v = get(), top = max === null ? Infinity : max();
    if (!num(v) || !(num(top) || top === Infinity)) return null;
    return number(max === null ? label : `${label} (max ${top})`, v, step, n => set(clamp(n, lo, top)));
  };
  const flag = (label, on, off, wearing) => () => (fn(a, wearing) && fn(a, on) && fn(a, off) ?
    toggle(label, a[wearing](), v => (v ? a[on]() : a[off]())) : null);
  let build = [];
  if (name === 'Karryn') {
    build = [
      fn(a, 'setHp') && stat('Stamina', () => a._hp, () => a.mhp, 10, n => a.setHp(n)),
      fn(a, 'setMp') && stat('Energy', () => a._mp, () => a.mmp, 10, n => a.setMp(n)),
      fn(a, 'setWill') && stat('Willpower', () => a._will, () => a.maxWill(), 10, n => a.setWill(n)),
      fn(a, 'setTp') && stat('Pleasure', () => a._tp, () => a.orgasmPoint(), 10, n => a.setTp(n)),
      fn(a, 'setFatigue') && stat('Fatigue %', () => a._fatigue, () => 100, 1, n => a.setFatigue(n)),
      stat('Sleep quality %', () => a._sleepQuality, () => 100, 1, n => { a._sleepQuality = n; }),
      fn(a, 'addCockiness') && stat('Cockiness %', () => a.cockiness, () => 100, 1, n => a.addCockiness(n - a.cockiness)),
      ...DESIRES.map(d => fn(a, `set${d}Desire`) &&
        stat(`${d} desire`, () => a[`${d.toLowerCase()}Desire`], () => a[`max${d}Desire`], 10, n => a[`set${d}Desire`](n, false))),
      // The stage follows the durability: the first stage whose minimum it is above.
      fn(a, 'getClothingMaxDurability') && fn(a, 'minimumClothingDurabilityForStage') &&
        stat('Clothing durability', () => a._clothingDurability, () => a.getClothingMaxDurability(true), 10, n => {
          for (let stage = 1; stage <= a._clothingMaxStage; stage++) {
            if (n > a.minimumClothingDurabilityForStage(stage)) { a._clothingStage = stage; a._clothingDurability = n; break; }
          }
        }),
      fn(a, 'changeClothingToStage') && stat('Clothing stage', () => a._clothingStage, () => a._clothingMaxStage, 1, n => a.changeClothingToStage(n)),
      flag('Panties', 'putOnPanties', 'takeOffPanties', 'isWearingPanties'),
      flag('Gloves and hat', 'putOnGlovesAndHat', 'takeOffGlovesAndHat', 'isWearingGlovesAndHat'),
      fn(a, 'getWardenLevelLimit') && stat('Warden level', () => a._level, () => a.getWardenLevelLimit(), 1, n => { a._level = n; }, 1),
      ...(Array.isArray(a._paramLvl) ? a._paramLvl.map((_, i) =>
        stat(`${fn(w.TextManager, 'param') ? w.TextManager.param(i) : 'Param ' + i} level`, () => a._paramLvl[i], null, 1, n => { a._paramLvl[i] = n; }, 1)) : []),
      // Spendable points are the edict SP when Karryn has some, otherwise the stored ones.
      stat('Edict points', () => (fn(a, 'stsSp') && a.stsSp() > 0 ? a.stsSp() : fn(a, 'getStoredEdictPoints') ? a.getStoredEdictPoints() : a._storedEdictPoints),
        null, 1, n => { a._storedEdictPoints = n; if (fn(a, 'setAsp')) a.setAsp(n); }),
    ];
  } else if (name === 'Prison') {
    const max = constant(w, 'PRISON_ORDER_MAX');
    build = [
      fn(party, 'setOrder') && stat('Order', () => party.order, () => (num(max) ? max : 100), 1, n => party.setOrder(n)),
      fn(party, 'setCorruption') && stat('Corruption', () => party._corruption, null, 1, n => party.setCorruption(n)),
      fn(party, 'setGuardAggression') && stat('Guard aggression', () => party.guardAggression, null, 1, n => party.setGuardAggression(n)),
      ...['One', 'Two', 'Three', 'Four', 'Five'].map((l, i) => {
        const key = `_prisonLevel${l}RiotBuildup`;
        return stat(`Level ${i + 1} riot build-up`, () => party[key], () => 100, 1, n => { party[key] = n; });
      }),
    ];
  } else {
    build = [['Bar reputation', 'BarReputation'], ['Receptionist fame', 'ReceptionistFame'],
      ['Receptionist notoriety', 'ReceptionistNotoriety'], ['Glory hole reputation', 'GloryReputation'],
      ['Strip club reputation', 'StripClubReputation'], ['Gym reputation', 'GymReputation'],
      ['Trainer notoriety', 'TrainerNotoriety']].map(([label, key]) =>
      fn(party, `set${key}`) && stat(label, () => party[`_${key[0].toLowerCase()}${key.slice(1)}`], null, 1, n => party[`set${key}`](n)));
  }
  const list = [];
  for (const row of build) {
    try { const r = row && row(); if (r) list.push(r); } catch (_) { /* Not readable now. */ }
  }
  return list;
}

function menu(w, editor) {
  const m = editor.model(w);
  const pages = [];
  const query = {};
  let sprite = null, rows = null, note = '', typing = false, skip = false, clampNext = false;

  const toggle = (label, on, set) => ({ label, value: on ? 'ON' : 'OFF', ok: () => set(!on), change: () => set(!on) });
  const step = base => (w.Input.isPressed('shift') ? base * 10 : base);
  const number = (label, v, base, set) => ({ label, value: String(v), change: dir => set(v + dir * step(base)) });
  const action = (label, run) => ({ label, ok: run });
  const page = name => action(`${name} >`, () => { pages.push({ name, at: 0, top: 0 }); });

  function main() {
    const c = m.cheats();
    const list = [];
    for (const a of m.party()) {
      list.push(toggle(`God mode: ${a.name}`, c.god.includes(a.id), on => m.setGod(a.id, on)));
      list.push(number(`Level: ${a.name}`, m.actorInfo(a.id).level, 1, n => m.setActor(a.id, 'level', Math.max(1, n))));
    }
    list.push(number('Gold', m.gold(), 100, n => m.setGold(Math.max(0, n))));
    list.push(toggle('No clip', c.noclip, on => m.setCheat('noclip', on)));
    list.push(toggle('No random battles', c.noEncounters, on => m.setCheat('noEncounters', on)));
    list.push(number('Move speed (0: normal)', c.move, 1, n => m.setCheat('move', clamp(n, 0, 8))));
    list.push({ label: 'Game speed', value: `x${c.speed}`, change: dir => {
      const i = clamp(Math.max(0, SPEEDS.indexOf(c.speed)) + dir, 0, SPEEDS.length - 1);
      m.setCheat('speed', SPEEDS[i]);
    } });
    list.push(action('Heal party', () => { m.heal(); note = 'Party healed.'; }));
    list.push(action('Win battle', () => { note = m.win() ? 'Battle won.' : 'Not in a battle.'; }));
    list.push(action('Escape battle', () => { note = m.escape() ? 'Escaped.' : 'Not in a battle.'; }));
    list.push(action('Save', () => { if (m.open('save')) close(); else note = 'Save from the map.'; }));
    list.push(action('Load', () => { m.open('load'); close(); }));
    for (const name of KARRYN_PAGES) if (karrynRows(w, name, { number, toggle }).length) list.push(page(name));
    for (const name of [...Object.keys(KINDS), 'Switches', 'Variables', 'Teleport']) list.push(page(name));
    return list;
  }

  function teleport() {
    const at = m.here();
    const go = (mapId, x, y) => () => {
      if (!m.teleport(mapId, x, y)) { note = 'No such map.'; return; }
      clampNext = true;
      close();
    };
    return [
      action(`Remember map ${at.mapId} (${at.x}, ${at.y})`, () => { m.remember(`Spot ${m.spots().length + 1}`); note = 'Remembered.'; }),
      ...m.spots().map(s => action(`${s.name}: map ${s.mapId} (${s.x}, ${s.y})`, go(s.mapId, s.x, s.y))),
      ...m.maps().map(e => action(`${String(e.id).padStart(3, '0')} ${e.name}`, go(e.id, at.x, at.y))),
    ];
  }

  function listed(name) {
    if (KINDS[name]) {
      const kind = KINDS[name];
      return m.catalog(kind).map(e => number(e.name, m.count(kind, e.id), 1, n => m.setCount(kind, e.id, clamp(n, 0, 99))));
    }
    if (KARRYN_PAGES.includes(name)) return karrynRows(w, name, { number, toggle });
    if (name === 'Switches') return m.switches().map(s => toggle(`${s.id} ${s.name}`, !!s.value, on => m.setSwitch(s.id, on)));
    if (name === 'Variables') {
      return m.variables().map(v => (Number.isInteger(v.value) ?
        number(`${v.id} ${v.name}`, v.value, 1, n => m.setVariable(v.id, String(n))) :
        { label: `${v.id} ${v.name}`, value: JSON.stringify(v.value) }));
    }
    return teleport();
  }

  // Names match anywhere; values only exactly, so "5" doesn't find 15 and 50.
  function current() {
    if (rows) return rows;
    const { name } = pages[pages.length - 1];
    if (name === 'Cheats') return (rows = main());
    const q = (query[name] || '').toLowerCase();
    rows = listed(name).filter(r => !q || r.label.toLowerCase().includes(q) || String(r.value || '').toLowerCase() === q);
    rows.unshift(action(`Search: ${query[name] || ''}${typing ? '_' : ''}`, () => { typing = true; note = 'Type a name or an exact value. Enter: done, Esc: clear.'; }));
    return rows;
  }

  function onKey(e) {
    if (!typing) return;
    const p = pages[pages.length - 1];
    let q = query[p.name] || '';
    if (e.key === 'Enter') typing = false;
    else if (e.key === 'Escape') { typing = false; q = ''; }
    else if (e.key === 'Backspace') q = q.slice(0, -1);
    else if (e.key && e.key.length === 1) q += e.key;
    // The Enter or Esc that ended typing must not also act on the menu next frame.
    if (!typing) { note = ''; skip = true; }
    if (q !== (query[p.name] || '')) { query[p.name] = q; p.at = 0; p.top = 0; }
    rows = null;
    draw();
  }

  function draw() {
    const b = sprite.bitmap;
    const p = pages[pages.length - 1];
    const list = current();
    const fit = Math.floor(b.height / ROW) - 2;
    b.clear();
    b.fillRect(0, 0, b.width, b.height, 'rgba(10, 10, 20, 0.86)');
    b.fontSize = 20;
    b.textColor = '#ffffff';
    b.drawText(`${p.name}  (arrows, Shift: x10, Enter, Esc: back, F8: close)`, 8, 0, b.width - 16, ROW);
    list.slice(p.top, p.top + fit).forEach((r, i) => {
      const y = ROW * (i + 1);
      if (p.top + i === p.at) b.fillRect(4, y, b.width - 8, ROW, 'rgba(255, 255, 255, 0.19)');
      b.drawText(r.label, 12, y, b.width - 24, ROW);
      if (r.value !== undefined) b.drawText(r.value, 12, y, b.width - 24, ROW, 'right');
    });
    b.drawText(note, 8, b.height - ROW, b.width - 16, ROW);
  }

  function show() {
    const scene = w.SceneManager._scene;
    if (!scene || !m.ready()) return;
    pages.length = 0;
    pages.push({ name: 'Cheats', at: 0, top: 0 });
    rows = null;
    note = '';
    sprite = new w.Sprite(new w.Bitmap(w.Graphics.width, w.Graphics.height));
    // MZ Bitmaps start in sans-serif; its windows use the game's own font.
    if (w.$gameSystem && w.$gameSystem.mainFontFace) sprite.bitmap.fontFace = w.$gameSystem.mainFontFace();
    scene.addChild(sprite);
    draw();
  }

  function close() {
    if (!sprite) return;
    if (sprite.parent) sprite.parent.removeChild(sprite);
    sprite = null;
    typing = false;
  }

  function update() {
    const I = w.Input;
    if (sprite.parent !== w.SceneManager._scene) { close(); return; }
    if (typing) return;
    if (skip) { skip = false; return; }
    const p = pages[pages.length - 1];
    const list = current();
    const fit = Math.floor(sprite.bitmap.height / ROW) - 2;
    if (I.isTriggered('cancel')) {
      pages.pop();
      rows = null;
      note = '';
      if (!pages.length) { close(); return; }
      draw();
      return;
    }
    let moved = false;
    if (list.length && I.isRepeated('down')) { p.at = (p.at + 1) % list.length; moved = true; }
    if (list.length && I.isRepeated('up')) { p.at = (p.at - 1 + list.length) % list.length; moved = true; }
    if (list.length && I.isRepeated('pagedown')) { p.at = Math.min(list.length - 1, p.at + fit); moved = true; }
    if (list.length && I.isRepeated('pageup')) { p.at = Math.max(0, p.at - fit); moved = true; }
    if (p.at < p.top) p.top = p.at;
    if (p.at >= p.top + fit) p.top = p.at - fit + 1;
    const r = list[p.at];
    let act = null;
    if (r && I.isTriggered('ok') && r.ok) act = () => r.ok();
    else if (r && I.isRepeated('right') && r.change) act = () => r.change(1);
    else if (r && I.isRepeated('left') && r.change) act = () => r.change(-1);
    if (act) {
      act();
      rows = null;
      if (w.$gameMap && w.$gameMap.requestRefresh) w.$gameMap.requestRefresh();
    }
    if (sprite && (act || moved)) draw();
  }

  return {
    get open() { return !!sprite; },
    toggle() { if (sprite) close(); else show(); },
    update, onKey,
    // A teleport keeps the current x, y; on a smaller map, pull the player inside it.
    afterTransfer(player) {
      if (!clampNext || !w.$gameMap || !w.$gameMap.width) return;
      clampNext = false;
      player.locate(clamp(player.x, 0, w.$gameMap.width() - 1), clamp(player.y, 0, w.$gameMap.height() - 1));
    },
  };
}

function install(w, editor) {
  editor.hooks(w);
  const c = menu(w, editor);
  // F8 is read from the key events, not Input.keyMapper: key-config plugins replace the mapper with
  // the saved one (Karryn's Prison's YEP_KeyboardConfig), and that one has no F8.
  let f8 = false;
  const updateScene = w.SceneManager.updateScene;
  // A failure in the menu closes it and is logged; it must not stop the game, as MV stops on an error.
  const safely = run => {
    try { run(); } catch (error) {
      if (c.open) c.toggle();
      console.log('tuxtavern: the F8 menu closed after an error: ' + (error && error.stack || error));
    }
  };
  w.SceneManager.updateScene = function () {
    if (f8) { f8 = false; safely(() => c.toggle()); }
    if (c.open) { safely(() => c.update()); if (c.open) return; }
    updateScene.call(this);
  };
  const performTransfer = w.Game_Player.prototype.performTransfer;
  w.Game_Player.prototype.performTransfer = function () {
    const transferring = this.isTransferring();
    performTransfer.call(this);
    if (transferring) c.afterTransfer(this);
  };
  w.document.addEventListener('keydown', e => {
    if (e.keyCode === 119) { if (!e.repeat) f8 = true; return; }
    safely(() => c.onKey(e));
  });
  return c;
}

module.exports = { menu, install };
