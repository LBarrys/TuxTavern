'use strict';
const { install, parse } = require('../../lib/pmjs-keys.js');

let failed = 0;
function is(desc, got, want) {
  got = JSON.stringify(got);
  want = JSON.stringify(want);
  if (got === want) { console.log('ok PMJS keys: ' + desc); return; }
  failed++;
  console.log('FAIL PMJS keys: ' + desc + ' (got ' + got + ', wanted ' + want + ')');
}

is('wasd moves', parse('wasd').map, [[87, 'up'], [65, 'left'], [83, 'down'], [68, 'right']]);
is('keys by name, cancel and confirm as MV calls them, none unmaps',
  parse(' E=confirm, q=cancel ,space=ok,f5=none,numpad2=down').map, [[69, 'ok'], [81, 'escape'], [32, 'ok'], [116, null], [98, 'down']]);
is('a game\'s own action names pass through', parse('m=menu').map, [[77, 'menu']]);
is('what cannot be read is reported', parse('w=up,hyper=ok,z').bad, ['hyper=ok', 'z']);

// YEP_KeyboardConfig: the saved key config becomes Input.keyMapper whenever the config is applied.
const saved = { 13: 'ok', 87: 'pageup' };
const w = {
  Input: { keyMapper: { 13: 'ok', 116: 'debug' } },
  ConfigManager: { keyMapper: saved, applyData() { w.Input.keyMapper = this.keyMapper; } },
};
const logged = [];
const log = console.log;
console.log = text => (String(text).startsWith('tuxtavern:') ? logged.push(text) : log(text));
install(w, 'wasd,f5=none,bogus');
console.log = log;
is('the mappings are added once the plugins have loaded', [w.Input.keyMapper[87], w.Input.keyMapper[116], w.Input.keyMapper[13]], ['up', undefined, 'ok']);
is('and what cannot be read is said', logged, ['tuxtavern: TUXTAVERN_KEYS: cannot read bogus (use key=action, e.g. w=up)']);
w.ConfigManager.applyData({});
is('they stay when the game applies its own key config', [w.Input.keyMapper[87], w.Input.keyMapper[68], w.Input.keyMapper[13]], ['up', 'right', 'ok']);
is('which is not changed, so they are not saved into it', saved, { 13: 'ok', 87: 'pageup' });
process.exitCode = failed ? 1 : 0;
