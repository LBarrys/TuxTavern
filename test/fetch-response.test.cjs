'use strict';
// Karryn's Prison's ImageReplacer fails a fetch whose response has no body.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');

test('fetch responses carry a readable body as well as text and json', async () => {
  const files = { 'img/replacements.json': Buffer.from('{"a":1}') };
  const context = vm.createContext({ performance, TextDecoder, ReadableStream, Blob, Promise, PMJS: {},
    EventTarget: function() {}, gameReadPath: file => file,
    NativeHost: { fs: { readBytes: file => files[file] || null } } });
  for (const name of ['scheduler', 'requests']) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, '../js/pmjs-web', name + '.js'), 'utf8'), context);
  }
  const pending = context.fetch('./img/replacements.json');
  context.PMJS.tasks.drain();
  const response = await pending;
  assert.ok(response.ok);
  const chunks = [];
  for await (const chunk of response.body) chunks.push(Buffer.from(chunk));
  assert.equal(Buffer.concat(chunks).toString(), '{"a":1}');
  assert.equal((await response.json()).a, 1);
  assert.equal(await (await response.blob()).text(), '{"a":1}');
  const missing = context.fetch('img/none.json');
  context.PMJS.tasks.drain();
  assert.equal((await missing).status, 404);
});

test('text responses drop a leading byte order mark, as browsers decode them', async () => {
  const text = '\uFEFF { "testing": 1 }';
  const context = vm.createContext({ performance, TextDecoder, ReadableStream, Blob, Promise, PMJS: {},
    EventTarget: function() {}, gameReadPath: file => file, gamePath: file => file,
    NativeHost: { fs: { readText: () => text, readBytes: () => Buffer.from(text) } } });
  for (const name of ['scheduler', 'events', 'requests']) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, '../js/pmjs-web', name + '.js'), 'utf8'), context);
  }
  const request = new context.XMLHttpRequest();
  request.open('GET', 'data/RemLines.json', false);
  request.send();
  assert.equal(JSON.parse(request.responseText).testing, 1);
  const pending = context.fetch('data/RemLines.json');
  context.PMJS.tasks.drain();
  assert.equal(JSON.parse(await (await pending).text()).testing, 1);
});
