import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SCENES, DEPTH, BACK } from '../js/scenes.js';
import { PALETTES } from '../js/palettes.js';

test('scene ids are unique', () => {
  const ids = SCENES.map((s) => s.id);
  assert.equal(new Set(ids).size, ids.length);
});

test('every scene has a layer, a name and a shader (or a simulation)', () => {
  for (const s of SCENES) {
    assert.ok(['depth', 'back'].includes(s.layer), s.id);
    assert.ok(s.name, s.id);
    if (s.sim) assert.ok(['fluid', 'rd'].includes(s.sim), s.id);
    else assert.match(s.frag, /void main\(\)/, s.id);
  }
  assert.equal(DEPTH.length + BACK.length, SCENES.length);
});

test('raymarched 3D scenes define map()', () => {
  for (const s of SCENES) if (/\bmarch\(/.test(s.frag || '')) assert.match(s.map || '', /float map\(vec3/, s.id);
});

test('palette colours are within 0..1', () => {
  for (const p of PALETTES) for (const k of ['bg', 'c1', 'c2']) for (const v of p[k]) assert.ok(v >= 0 && v <= 1);
});
