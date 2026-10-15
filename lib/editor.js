'use strict';

const KINDS = { items: '$dataItems', weapons: '$dataWeapons', armors: '$dataArmors' };
const LIMIT = 200;

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

const CSS = `
#rpgm-editor { position: fixed; top: 0; right: 0; width: 460px; max-width: 100%; height: 100%; overflow: auto;
  box-sizing: border-box; padding: 8px; background: rgba(18, 18, 22, 0.96); color: #eee;
  font: 15px/1.4 sans-serif; z-index: 2147483647; user-select: text; }
#rpgm-editor summary { cursor: pointer; padding: 4px 0; font-weight: bold; }
#rpgm-editor .row { display: flex; gap: 6px; align-items: center; justify-content: space-between; padding: 1px 0; }
#rpgm-editor .row span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
#rpgm-editor input { font: inherit; background: #2a2a30; color: #eee; border: 1px solid #555; padding: 1px 4px; }
#rpgm-editor input[type=number], #rpgm-editor input.value { width: 100px; }
#rpgm-editor input[type=checkbox] { width: 17px; height: 17px; }
#rpgm-editor input.filter { width: 100%; box-sizing: border-box; margin: 2px 0 4px; }
#rpgm-editor button { font: inherit; background: #3a3a44; color: #eee; border: 1px solid #555; padding: 1px 6px; cursor: pointer; }
#rpgm-editor details details { margin-left: 10px; }
#rpgm-editor p { margin: 4px 0; color: #aaa; }`;

const EVENTS = ['keydown', 'keyup', 'keypress', 'mousedown', 'mouseup', 'mousemove', 'click', 'dblclick', 'wheel',
  'contextmenu', 'touchstart', 'touchmove', 'touchend', 'pointerdown', 'pointerup', 'pointermove'];

function install(w, key = 'F8') {
  const d = w.document;
  const m = model(w);
  let panel = null;
  const el = (tag, props, ...kids) => {
    const e = Object.assign(d.createElement(tag), props);
    e.append(...kids);
    return e;
  };
  const row = (label, input) => el('div', { className: 'row' }, el('span', { textContent: label, title: label }),
    typeof input === 'function' ? input() : input);
  const number = (v, set, refresh) => el('input', {
    type: 'number', value: v, onchange: e => { set(Number(e.target.value)); refresh(); },
  });
  const section = (title, rows, opts = {}) => {
    const list = el('div');
    let shown = LIMIT;
    const filter = el('input', { className: 'filter', placeholder: 'Filter by name or exact value', oninput: () => { shown = LIMIT; refresh(); } });
    const more = el('p');
    const refresh = () => {
      const q = filter.value.toLowerCase();
      const all = rows(refresh).filter(([label, , value]) =>
        !q || label.toLowerCase().includes(q) || String(value ?? '').toLowerCase() === q);
      list.replaceChildren(...all.slice(0, shown).map(([label, input]) => row(label, input)));
      more.textContent = `${all.length - shown} more`;
      if (all.length > shown) list.append(more);
    };
    // Lists are built when unfolded, so opening the panel stays quick.
    const box = el('details', { open: !!opts.open }, el('summary', { textContent: title }));
    let built = false;
    const build = () => {
      if (built || !box.open) return;
      built = true;
      // Scrolling to the end of the list shows the next rows.
      new w.IntersectionObserver(seen => {
        if (seen.some(e => e.isIntersecting)) { shown += LIMIT; refresh(); }
      }, { rootMargin: '300px' }).observe(more);
      if (opts.filter) box.append(filter);
      box.append(list);
      if (opts.add) box.append(opts.add(refresh));
      refresh();
    };
    box.addEventListener('toggle', build);
    build();
    return box;
  };

  const inventory = (kind, title) => section(title, refresh => m.owned(kind).map(e =>
    [e.name, () => number(e.count, n => m.setCount(kind, e.id, n), refresh), e.count]), {
    filter: true,
    add: refresh => {
      const id = `rpgm-editor-${kind}`;
      const input = el('input', { placeholder: 'Add by name' });
      input.setAttribute('list', id);
      const options = m.catalog(kind).map(e => el('option', { value: `${e.name} #${e.id}` }));
      const add = () => {
        const hit = /#(\d+)$/.exec(input.value);
        if (!hit) return;
        const owned = m.owned(kind).find(e => e.id === +hit[1]);
        m.setCount(kind, +hit[1], (owned ? owned.count : 0) + 1);
        input.value = '';
        refresh();
      };
      return el('div', { className: 'row' }, input, el('datalist', { id }, ...options), el('button', { textContent: 'Add', onclick: add }));
    },
  });

  const button = (text, onclick) => el('button', { textContent: text, onclick });
  const status = el('p');
  const tell = text => { status.textContent = text; };
  const check = (on, set) => el('input', { type: 'checkbox', checked: !!on, onchange: e => set(e.target.checked) });

  const cheats = () => {
    const c = m.cheats();
    const box = el('details', { open: true }, el('summary', { textContent: 'Cheats' }));
    for (const a of m.party()) box.append(row(`God mode: ${a.name}`, check(c.god.includes(a.id), on => m.setGod(a.id, on))));
    const speed = (v, set) => el('input', { type: 'number', min: 0, max: 10, step: 0.5, value: v, onchange: e => set(Number(e.target.value)) });
    box.append(
      row('No clip', check(c.noclip, on => m.setCheat('noclip', on))),
      row('No random battles', check(c.noEncounters, on => m.setCheat('noEncounters', on))),
      row('Move speed (0: normal, 6: fast)', speed(c.move, n => m.setCheat('move', Math.max(0, Math.min(8, n))))),
      row('Game speed (1: normal)', speed(c.speed, n => m.setCheat('speed', Math.max(0.1, Math.min(10, n) || 1)))),
      el('div', { className: 'row' },
        button('Heal party', () => { m.heal(); tell('Party healed.'); }),
        button('Win battle', () => tell(m.win() ? 'Battle won.' : 'Not in a battle.')),
        button('Escape battle', () => tell(m.escape() ? 'Escaped.' : 'Not in a battle.'))),
      el('div', { className: 'row' },
        button('Save', () => tell(m.open('save') ? 'Save screen opened.' : 'Save from the map, not a menu or battle.')),
        button('Load', () => { m.open('load'); tell('Load screen opened.'); })),
      status);
    return box;
  };

  const teleport = () => section('Teleport', refresh => {
    const at = m.here();
    const go = s => () => tell(m.teleport(s.mapId, s.x, s.y) ? `Going to map ${s.mapId} (${s.x}, ${s.y}).` : 'No such map.');
    const map = el('input', { placeholder: 'Map by name' });
    map.setAttribute('list', 'rpgm-editor-maps');
    const x = el('input', { type: 'number', value: at.x }), y = el('input', { type: 'number', value: at.y });
    const target = () => ({ mapId: +((/#(\d+)$/.exec(map.value) || [])[1] || at.mapId), x: +x.value, y: +y.value });
    return [
      [`Here: map ${at.mapId} (${at.x}, ${at.y})`, button('Remember', () => { m.remember(`Spot ${m.spots().length + 1}`); refresh(); })],
      ...m.spots().map((s, k) => [`${s.name}: map ${s.mapId} (${s.x}, ${s.y})`,
        el('span', {}, button('Go', go(s)), button('Forget', () => { m.forget(k); refresh(); }))]),
      ['Map', el('span', {}, map, el('datalist', { id: 'rpgm-editor-maps' }, ...m.maps().map(e => el('option', { value: `${e.name} #${e.id}` }))))],
      ['X, Y', el('span', {}, x, y)],
      ['', button('Teleport', () => go(target())())],
    ];
  });

  const actors = () => {
    const box = el('details', {}, el('summary', { textContent: 'Actors' }));
    box.addEventListener('toggle', () => {
      if (!box.open || box.childElementCount > 1) return;
      const names = m.paramNames();
      for (const a of m.roster()) {
        box.append(section(`${a.name}${a.inParty ? ' (party)' : ''}`, refresh => {
          const now = m.actorInfo(a.id);
          const set = k => n => m.setActor(a.id, k, n);
          return [['Level', number(now.level, set('level'), refresh)], ['HP', number(now.hp, set('hp'), refresh)],
            ['MP', number(now.mp, set('mp'), refresh)],
            ...now.params.map((p, i) => [names[i] || `Param ${i}`, number(p, set(i), refresh)])];
        }));
      }
    });
    return box;
  };

  const render = () => {
    const top = panel.scrollTop;
    panel.replaceChildren(el('style', { textContent: CSS }),
      el('p', { textContent: `${key} or Esc closes. Changes apply at once; save in-game to keep them.` }));
    if (!m.ready()) {
      panel.append(el('p', { textContent: 'Start or load a game first.' }));
      return;
    }
    panel.append(
      cheats(),
      row('Gold', number(m.gold(), m.setGold, () => render())),
      inventory('items', 'Items'), inventory('weapons', 'Weapons'), inventory('armors', 'Armor'),
      actors(),
      section('Switches', refresh => m.switches().map(s => [`${s.id} ${s.name}`,
        () => el('input', { type: 'checkbox', checked: !!s.value, onchange: e => { m.setSwitch(s.id, e.target.checked); refresh(); } }),
        s.value ? 'on' : 'off']),
      { filter: true }),
      section('Variables', refresh => m.variables().map(v => {
        const text = typeof v.value === 'string' ? v.value : JSON.stringify(v.value);
        return [`${v.id} ${v.name}`,
          () => el('input', { className: 'value', value: text, onchange: e => { m.setVariable(v.id, e.target.value); refresh(); } }), text];
      }),
      { filter: true }),
      teleport());
    panel.scrollTop = top;
  };

  // Cheats kept in a save work from the start, not only once the panel is opened.
  w.addEventListener('load', () => hooks(w));
  w.addEventListener('keydown', e => {
    if (e.key !== key && !(e.key === 'Escape' && panel)) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    if (panel) { panel.remove(); panel = null; return; }
    panel = el('div', { id: 'rpgm-editor' });
    for (const type of EVENTS) panel.addEventListener(type, ev => ev.stopPropagation());
    d.body.append(panel);
    render();
  }, true);
}

module.exports = { model, install, value, hooks };
