'use strict';
// Karryn's Prison's mod manager and FastCutIns show sweetalert2 dialogs through window.Alert;
// nothing draws HTML here, so the dialogs print and resolve as dismissed, except those that ask for
// a value, which ask through the native prompt.
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

test('a dialog titled through titleText prints its title (ModsSettings error dialogs)', async () => {
  const { context, printed } = realm();
  context.Alert = { default: sweetAlert() };
  await context.Alert.default.fire({ icon: 'error', titleText: "Unable to change setting 'Speed'", text: 'Error: bad' });
  assert.deepEqual(printed, ["[pmjs] dialog (error): Unable to change setting 'Speed' - Error: bad"]);
});

function answering(context, answers) {
  const asked = [];
  context.prompt = (message, value) => { asked.push([message, value]); return answers.shift(); };
  context.confirm = message => { asked.push([message]); return answers.shift(); };
  return asked;
}

test('ModsSettings\' "Enter value" dialog asks through the native prompt and retries invalid input', async () => {
  const { context, printed } = realm();
  context.Alert = { default: sweetAlert() };
  const asked = answering(context, ['abc', '42']);
  const answer = await context.Alert.default.fire({ icon: 'info', titleText: "Enter value for setting 'Speed'",
    input: 'number', inputValue: '10', inputValidator: value => (/^\d+$/.test(value) ? null : 'Input is invalid.') });
  assert.equal(answer.isConfirmed, true);
  assert.equal(answer.value, '42');
  assert.deepEqual(asked, [["Enter value for setting 'Speed'", '10'], ["Input is invalid.\nEnter value for setting 'Speed'", 'abc']]);
  assert.deepEqual(printed, []);
  answering(context, [null]);
  const cancelled = await context.Alert.default.fire({ titleText: 'Enter value', input: 'text' });
  assert.equal(cancelled.isDismissed, true);
  assert.equal(cancelled.dismiss, 'cancel');
});

test('ModsSettings\' "Choose value" dialog lists its options and takes a number or a label', async () => {
  const { context } = realm();
  context.Alert = { default: sweetAlert() };
  const options = { icon: 'info', titleText: "Choose value for setting 'Mode'", input: 'select',
    inputOptions: { low: 'Low RAM', fast: 'Default' }, inputValue: 'fast' };
  const asked = answering(context, ['7', '1']);
  assert.equal((await context.Alert.default.fire(options)).value, 'low');
  assert.deepEqual(asked[0], ["Choose value for setting 'Mode'\n1. Low RAM\n2. Default", '2']);
  assert.match(asked[1][0], /^Choose one of the numbers below\./);
  answering(context, ['Default']);
  assert.equal((await context.Alert.default.fire(options)).value, 'fast');
});

test('dialogs without input still print and dismiss (FastCutIns\' restart and mode questions)', async () => {
  const { context, printed } = realm();
  context.Alert = { default: sweetAlert() };
  const asked = answering(context, []);
  const answer = await context.Alert.default.fire({ icon: 'question', title: 'Choose optimization mode', showCancelButton: true });
  assert.equal(answer.dismiss, 'cancel');
  assert.deepEqual(asked, []);
  assert.equal(printed.length, 1);
});
