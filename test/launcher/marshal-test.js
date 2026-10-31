'use strict';
const { parse, dump } = require('../../lib/marshal.js');

let failed = 0;
function is(desc, got, want) {
  got = JSON.stringify(got);
  want = JSON.stringify(want);
  if (got === want) { console.log('ok Marshal: ' + desc); return; }
  failed++;
  console.log('FAIL Marshal: ' + desc + ' (got ' + got + ', wanted ' + want + ')');
}
function throws(desc, f, pattern) {
  try { f(); } catch (e) { return is(desc, pattern.test(e.message), true); }
  is(desc, 'no error', String(pattern));
}

// Made by Ruby 3.3 with rgss-save.rb make: VX Ace's header and contents, and XP's six dumps with
// untagged strings. Both hold shared actors, a hash with a default, Table/Color, floats, bignums,
// a Struct, an Array subclass, a regexp, a class, a module and Shift-JIS bytes.
const ace = Buffer.from('BAh7BzoPY2hhcmFjdGVyc1sGWwdJIgtBY3RvcjEGOgZFVGkAOg9wbGF5dGltZV9zSSINMDE6MDI6MDMGOwZUBAh7BjoLc3lzdGVtWwtvOg9HYW1lX1BhcnR5CDoKQGdvbGRpA4fWEjoMQGFjdG9yc1sIbzoPR2FtZV9BY3Rvcgg6CEBocGkCwgE6CkBuYW1lSSIO44Op44Or44OVBjoGRVQ6DEBzdGF0ZXNbB2kGaQdvOwkIOwppADsLSSILVWxyaWthBjsMVDsNWwBACToLQGl0ZW1zfQhpBmkKOgtwb3Rpb25pB1sIaQZpB0kiBkEGOwxUVGkAbzoNR2FtZV9NYXAGOg9AZGlzcGxheV94ZgkxMi41bzoTUlBHOjpBdWRpb0ZpbGUHOwtJIgpUb3duMQY7DFQ6DEB2b2x1bWVpaXU6ClRhYmxlCgEAAAD/dToKQ29sb3IlAAAAAADgb0AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAYEB7FzoJbmFtZUkiC3NoYXJlZAY7DFQ6CmFnYWluQBk6CHN5bUk6COODqQY7DFQ6CGJpZ2wrCAAAAAAAAToIbmVnbC0HAAAAgDoJaHVnZWwrCgAAAAAAAAAAQAA6BmZbCWYXMC4zMzMzMzMzMzMzMzMzMzMzZgctMGYIaW5mZghuYW46C3N0cnVjdFM6ClBvaW50BzoGeGkGOgZ5aQc6CXBhdGhDOglQYXRoWwdpBmkHOgdyZUkvCGErYgEGOwxGOghjbHNjDUdhbWVfTWFwOghtb2RtCFJQRzoJc2ppcyIJg4mDQzoSYmluYXJ5X3RhZ2dlZEkiBv8GOg1lbmNvZGluZyIOU2hpZnRfSklTOgplbXB0eUkiAAY7DFQ6CG5pbDA6BnRUOgdmMkY=', 'base64');
const xp = Buffer.from('BAhvOg9HYW1lX1BhcnR5CDoKQGdvbGRpA4fWEjoMQGFjdG9yc1sIbzoPR2FtZV9BY3Rvcgg6CEBocGkCwgE6CkBuYW1lIg7jg6njg6vjg5U6DEBzdGF0ZXNbB2kGaQdvOwgIOwlpADsKIgtVbHJpa2E7C1sAQAc6C0BpdGVtc30IaQZpCjoLcG90aW9uaQdbCGkGaQdJIgZBBjoGRVRUaQAECG86DUdhbWVfTWFwBjoPQGRpc3BsYXlfeGYJMTIuNQQIbzoTUlBHOjpBdWRpb0ZpbGUHOgpAbmFtZSIKVG93bjE6DEB2b2x1bWVpaQQIdToKVGFibGUKAQAAAP8ECHU6CkNvbG9yJQAAAAAA4G9AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAGBABAh7FzoJbmFtZSILc2hhcmVkOgphZ2FpbkAGOghzeW1JOgjjg6kGOgZFVDoIYmlnbCsIAAAAAAABOghuZWdsLQcAAACAOglodWdlbCsKAAAAAAAAAABAADoGZlsJZhcwLjMzMzMzMzMzMzMzMzMzMzNmBy0wZghpbmZmCG5hbjoLc3RydWN0UzoKUG9pbnQHOgZ4aQY6BnlpBzoJcGF0aEM6CVBhdGhbB2kGaQc6B3JlSS8IYStiAQY7CUY6CGNsc2MNR2FtZV9NYXA6CG1vZG0IUlBHOglzamlzIgmDiYNDOhJiaW5hcnlfdGFnZ2VkSSIG/wY6DWVuY29kaW5nIg5TaGlmdF9KSVM6CmVtcHR5IgA6CG5pbDA6BnRUOgdmMkY=', 'base64');
const roundTrip = save => dump(JSON.parse(JSON.stringify(parse(save))));

is('an unedited VX Ace save is written back byte for byte', roundTrip(ace).equals(ace), true);
is('so is an XP save of several dumps', roundTrip(xp).equals(xp), true);
const doc = parse(ace), x = parse(xp);
is('VX Ace strings are UTF-8, XP ones untagged', [doc.strings, x.strings, x.streams.length], ['E', 'raw', 6]);
const party = doc.streams[1].$hash[0][1][0];
is('objects read as their class and instance variables', [party['@class'], party['@gold'], party['@actors'][0]['@name']],
  ['Game_Party', 1234567, 'ラルフ']);
is('an object used twice is written once and referred to', party['@actors'][2], { $ref: party['@actors'][0].$id });
const extra = doc.streams[1].$hash[0][1][5].$hash;
const field = name => extra.find(([k]) => k.$sym === name)[1];
is('Shift-JIS bytes are kept as bytes', field('sjis'), { $bytes: Buffer.from([0x83, 0x89, 0x83, 0x43]).toString('base64') });
is('numbers too large for JSON stay exact', field('huge'), { $bignum: String(2n ** 70n) });
is('2^40 is still a plain number', field('big'), 2 ** 40);

party['@gold'] = 9999999;
party['@actors'][0]['@hp'] = 999;
party['@actors'][0]['@name'] = 'Ralf';
party['@actors'].push(7);
const edited = parse(dump(doc)).streams[1].$hash[0][1][0];
is('an edit is written', [edited['@gold'], edited['@actors'][0]['@hp'], edited['@actors'][0]['@name'], edited['@actors'][3]], [9999999, 999, 'Ralf', 7]);
is('and the shared object stays shared', edited['@actors'][2], { $ref: edited['@actors'][0].$id });
is('a large edited number becomes a Ruby bignum', parse(dump({ strings: 'E', streams: [2 ** 31] })).streams[0], 2 ** 31);
is('a non-integer becomes a float', dump({ strings: 'E', streams: [1.5] }).toString('latin1'), '\x04\x08f\x081.5');
throws('a $ref to nothing is refused', () => dump({ strings: 'E', streams: [[{ $ref: 9 }]] }), /names no "\$id"/);
throws('so is an object without its class', () => dump({ strings: 'E', streams: [{ '@hp': 1 }] }), /needs "@class"/);
throws('and a file that is not Marshal', () => parse(Buffer.from('{}')), /not a Ruby Marshal/);
throws('or one cut short', () => parse(ace.subarray(0, 40)), /ends early/);
process.exitCode = failed ? 1 : 0;
