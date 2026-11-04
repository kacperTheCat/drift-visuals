import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Midi } from '../js/midi.js';
import { PRESETS } from '../js/midi-presets.js';
import { DEPTH } from '../js/scenes.js';

// relative() i mapKeyFor() używają tylko pól obiektu — bez przeglądarki.
const rel = (mode, values) => {
  const self = { enc: {} };
  return values.map((v) => Midi.prototype.relative.call(self, 'cc:1:1', v, mode));
};

test('gałka absolutna zwraca null (pozycja, nie ruch)', () => {
  assert.deepEqual(rel('abs', [10, 64, 127]), [null, null, null]);
});

test('tryby względne: offset 64± i dopełnienie do 128', () => {
  assert.deepEqual(rel('offset', [65, 63, 70]), [1, -1, 6]);
  assert.deepEqual(rel('twos', [1, 127, 3, 125]), [1, -1, 3, -3]);
});

test('auto: zwykła gałka zostaje absolutna, także przy powtórzeniach 0/127', () => {
  assert.deepEqual(rel('auto', [40, 41, 42, 127, 127, 127]), [null, null, null, null, null, null]);
});

test('auto: powtarzane 65 = enkoder w trybie offset', () => {
  const r = rel('auto', [65, 65, 65, 63]);
  assert.deepEqual(r.slice(1), [1, 1, -1]);
});

test('kanał * pasuje do każdego kanału', () => {
  const self = { maps: { 'cc:*:86': 'intensity', 'note:10:36': 'aFlash' } };
  const f = (k) => Midi.prototype.mapKeyFor.call(self, k);
  assert.equal(f('cc:3:86'), 'cc:*:86');
  assert.equal(f('note:10:36'), 'note:10:36');
  assert.equal(f('note:1:36'), null);
});

test('preset MiniLab 3: wszystkie sceny głębi na klawiszach od C3, gałki absolutne', () => {
  const p = PRESETS.minilab3;
  const m = p.maps();
  DEPTH.forEach((sc, i) => assert.equal(m[`note:1:${48 + i}`], `scene:${sc.id}`));
  const modes = p.modes(m);
  for (const k of Object.keys(m).filter((k) => k.startsWith('cc:'))) assert.equal(modes[k], 'abs');
  assert.ok(p.match.test('Minilab3 MIDI'));
});
