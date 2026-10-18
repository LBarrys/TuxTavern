'use strict';
// Karryn's Prison's ImageReplacer fails a fetch whose response has no body.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');

// requests.js uses filesystem.js's URL decoder; the rest of filesystem.js needs the native host.
const decoder = fs.readFileSync(path.join(__dirname, '../js/pmjs-web/filesystem.js'), 'utf8')
  .match(/function decodeResourceUrlPath[\s\S]*?\n}\n/)[0];

test('fetch responses carry a readable body as well as text and json', async () => {
  const files = { 'img/replacements.json': Buffer.from('{"a":1}') };
  const context = vm.createContext({ performance, TextDecoder, ReadableStream, Blob, Promise, PMJS: {},
    EventTarget: function() {}, gameReadPath: file => file, __pmjsBuiltinRequire: require,
    NativeHost: { fs: { readBytesAsync: async file => files[file] || null } } });
  for (const name of ['scheduler', 'requests']) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, '../js/pmjs-web', name + '.js'), 'utf8'), context);
  }
  vm.runInContext(decoder, context);
  const response = await context.fetch('./img/replacements.json');
  assert.ok(response.ok);
  const chunks = [];
  for await (const chunk of response.body) chunks.push(Buffer.from(chunk));
  assert.equal(Buffer.concat(chunks).toString(), '{"a":1}');
  assert.equal((await response.json()).a, 1);
  assert.equal(await (await response.blob()).text(), '{"a":1}');
  assert.equal((await context.fetch('img/none.json')).status, 404);
});

test('text responses drop a leading byte order mark, as browsers decode them', async () => {
  const text = '\uFEFF { "testing": 1 }';
  const context = vm.createContext({ performance, TextDecoder, ReadableStream, Blob, Promise, PMJS: {},
    EventTarget: function() {}, gameReadPath: file => file, gamePath: file => file, __pmjsBuiltinRequire: require,
    NativeHost: { fs: { readText: () => text, readBytesAsync: async () => Buffer.from(text) } } });
  for (const name of ['scheduler', 'events', 'requests']) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, '../js/pmjs-web', name + '.js'), 'utf8'), context);
  }
  vm.runInContext(decoder, context);
  const request = new context.XMLHttpRequest();
  request.open('GET', 'data/RemLines.json', false);
  request.send();
  assert.equal(JSON.parse(request.responseText).testing, 1);
  assert.equal(JSON.parse(await (await context.fetch('data/RemLines.json')).text()).testing, 1);
});

test('a blob URL is fetched from its blob even when revoked before the body is read', async () => {
  // Karryn's Prison: pixi-rpgm revokes a decrypted APNG's URL while pixi-apng streams its body.
  const context = vm.createContext({ performance, TextDecoder, ReadableStream, Blob, Promise, PMJS: {},
    URL: class {}, EventTarget: function() {}, gameReadPath: file => file, __pmjsBuiltinRequire: require,
    NativeHost: { fs: { readBytesAsync: async () => null } } });
  for (const name of ['scheduler', 'object-urls', 'requests']) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, '../js/pmjs-web', name + '.js'), 'utf8'), context);
  }
  vm.runInContext(decoder, context);
  const url = context.URL.createObjectURL(new Blob([Buffer.from('\x89PNG frames', 'latin1')]));
  const fetching = context.fetch(url);
  context.URL.revokeObjectURL(url);
  const response = await fetching;
  assert.equal(response.status, 200);
  const chunks = [];
  for await (const chunk of response.body) chunks.push(Buffer.from(chunk));
  assert.equal(Buffer.concat(chunks).toString('latin1'), '\x89PNG frames');
  await assert.rejects(context.fetch(url), { name: 'TypeError' });
});
