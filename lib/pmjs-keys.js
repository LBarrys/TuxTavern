'use strict';
// TUXTAVERN_KEYS: extra key mappings for MV/MZ, e.g. "wasd" or "w=up,a=left,e=ok,q=cancel". They are
// added to Input.keyMapper once the game's plugins have loaded, and again whenever the game applies its
// own key settings (YEP_KeyboardConfig keeps them in the config and replaces the mapper on load).

const NAMES = {
  backspace: 8, tab: 9, enter: 13, shift: 16, ctrl: 17, control: 17, alt: 18, escape: 27, esc: 27,
  space: 32, pageup: 33, pagedown: 34, end: 35, home: 36, left: 37, up: 38, right: 39, down: 40,
  insert: 45, delete: 46,
};
for (let i = 0; i < 26; i++) NAMES[String.fromCharCode(97 + i)] = 65 + i;
for (let i = 0; i < 10; i++) { NAMES[String(i)] = 48 + i; NAMES['numpad' + i] = 96 + i; }
for (let i = 1; i <= 12; i++) NAMES['f' + i] = 111 + i;
const ACTIONS = { cancel: 'escape', confirm: 'ok' };
const WASD = 'w=up,a=left,s=down,d=right';

// [[keyCode, action or null to unmap]], and the parts that could not be read.
function parse(spec) {
  const map = [], bad = [];
  for (const part of String(spec || '').split(',').map(p => p.trim()).filter(Boolean)) {
    if (part.toLowerCase() === 'wasd') { map.push(...parse(WASD).map); continue; }
    const [key, action] = part.split('=').map(p => (p || '').trim());
    const code = NAMES[key.toLowerCase()];
    if (code === undefined || !action) { bad.push(part); continue; }
    map.push([code, action === 'none' ? null : ACTIONS[action] || action]);
  }
  return { map, bad };
}

function install(w, spec) {
  const { map, bad } = parse(spec);
  if (bad.length) console.log('tt: TUXTAVERN_KEYS: cannot read ' + bad.join(', ') + ' (use key=action, e.g. w=up)');
  if (!map.length || !w.Input) return;
  // On a copy: the game's mapper may be its saved key config (YEP_KeyboardConfig), which must not
  // keep these once TUXTAVERN_KEYS is gone.
  const apply = () => {
    const mapper = Object.assign({}, w.Input.keyMapper);
    for (const [code, action] of map) { if (action === null) delete mapper[code]; else mapper[code] = action; }
    w.Input.keyMapper = mapper;
  };
  apply();
  const C = w.ConfigManager;
  for (const name of ['applyData', 'applyKeyConfig']) {
    if (!C || typeof C[name] !== 'function') continue;
    const original = C[name];
    C[name] = function () { const r = original.apply(this, arguments); apply(); return r; };
  }
}

module.exports = { install, parse };
