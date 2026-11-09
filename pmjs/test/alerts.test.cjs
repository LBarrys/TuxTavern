'use strict';
// Karryn's Prison's mod manager and FastCutIns show sweetalert2 dialogs through window.Alert;
// nothing draws HTML here, so the dialogs print and resolve as dismissed.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');

function realm() {
  const printed = [];
  const context = vm.createContext({ Promise, console: { warn: message => printed.push(message) } });
  context.globalThis = context;
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../js/pmjs-web/alerts.js'), 'utf8'), context);
  return { context, printed };
}
function sweetAlert() {
  return { DismissReason: { cancel: 'cancel' }, fire() { throw new Error('DOMParser is not defined'); },
    isVisible() { return true; }, getConfirmButton() { return {}; }, clickConfirm() { throw new Error('no DOM'); } };
}

test('a sweetalert assigned as the UMD global prints its dialogs and resolves dismissed', async () => {
  const { context, printed } = realm();
  vm.runInContext('root = globalThis; root["Alert"] = { default: made };', Object.assign(context, { made: sweetAlert() }));
  const dialogs = context.Alert.default;
  const answer = await dialogs.fire({ icon: 'success', title: 'Fast Cut-Ins', html: '<b>Poses</b> are <i>ready</i>' });
  assert.equal(answer.isDismissed, true);
  assert.equal(answer.isConfirmed, false);
  assert.equal(answer.dismiss, 'cancel');
  assert.deepEqual(printed, ['[pmjs] dialog (success): Fast Cut-Ins - Poses are ready']);
  await dialogs.fire('Missing mod', 'CC_Mod needs <b>EEL</b>', 'error');
  assert.equal(printed[1], '[pmjs] dialog (error): Missing mod - CC_Mod needs EEL');
  assert.equal(dialogs.isVisible(), false);
  assert.equal(dialogs.getConfirmButton(), null);
  dialogs.clickConfirm();
});

test('other values under those names are left alone', () => {
  const { context } = realm();
  context.Swal = 42;
  assert.equal(context.Swal, 42);
  const own = { fire() { return 'own'; } };
  context.Alert = own;
  assert.equal(context.Alert.fire(), 'own');
});
