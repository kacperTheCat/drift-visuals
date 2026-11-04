import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Midi } from '../js/midi.js';
import { PRESETS } from '../js/midi-presets.js';
import { DEPTH } from '../js/scenes.js';

// relative() and mapKeyFor() only use object fields — no browser needed.
const rel = (mode, values) => {
  const self = { enc: {} };
  return values.map((v) => Midi.prototype.relative.call(self, 'cc:1:1', v, mode));
};

test('absolute knob returns null (a position, not motion)', () => {
  assert.deepEqual(rel('abs', [10, 64, 127]), [null, null, null]);
});

test('relative modes: offset 64± and two\'s complement', () => {
  assert.deepEqual(rel('offset', [65, 63, 70]), [1, -1, 6]);
  assert.deepEqual(rel('twos', [1, 127, 3, 125]), [1, -1, 3, -3]);
});

test('auto: a regular knob stays absolute, even when repeating 0/127', () => {
  assert.deepEqual(rel('auto', [40, 41, 42, 127, 127, 127]), [null, null, null, null, null, null]);
});

test('auto: repeated 65 = an encoder in offset mode', () => {
  const r = rel('auto', [65, 65, 65, 63]);
  assert.deepEqual(r.slice(1), [1, 1, -1]);
});

test('channel * matches any channel', () => {
  const self = { maps: { 'cc:*:86': 'intensity', 'note:10:36': 'aFlash' } };
  const f = (k) => Midi.prototype.mapKeyFor.call(self, k);
  assert.equal(f('cc:3:86'), 'cc:*:86');
  assert.equal(f('note:10:36'), 'note:10:36');
  assert.equal(f('note:1:36'), null);
});

test('MiniLab 3 preset: all depth scenes on keys from C3, absolute knobs', () => {
  const p = PRESETS.minilab3;
  const m = p.maps();
  DEPTH.forEach((sc, i) => assert.equal(m[`note:1:${48 + i}`], `scene:${sc.id}`));
  const modes = p.modes(m);
  for (const k of Object.keys(m).filter((k) => k.startsWith('cc:'))) assert.equal(modes[k], 'abs');
  assert.ok(p.match.test('Minilab3 MIDI'));
});
