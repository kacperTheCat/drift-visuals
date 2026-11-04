import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Analysis, Clock, Demo } from '../js/audio.js';

// Deterministic "random" jitter so the test is repeatable.
function rng(seed = 1) {
  return () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
}

function runClock(bpm, start, secs = 24) {
  const c = new Clock();
  c.bpm = start;
  const r = rng(7);
  const per = 60 / bpm;
  const dt = 1 / 60;
  let next = 0.3;
  for (let t = 0; t < secs; t += dt) {
    c.advance(dt);
    if (t >= next) {
      c.onset(t, true);
      next += per + (r() - 0.5) * 0.01; // ±5 ms
    }
  }
  return c.bpm;
}

test('clock converges on the kick tempo (128 BPM, start 120)', () => {
  assert.ok(Math.abs(runClock(128, 120) - 128) < 0.5);
});

test('clock holds a faster tempo (140 BPM, start 132)', () => {
  assert.ok(Math.abs(runClock(140, 132) - 140) < 0.5);
});

test('tap tempo: taps every 0.5 s = 120 BPM', () => {
  const c = new Clock();
  for (let i = 0; i < 5; i++) c.tap(i * 0.5);
  assert.ok(Math.abs(c.bpm - 120) < 0.01);
});

test('a gap of more than 2 s restarts tapping', () => {
  const c = new Clock();
  for (let i = 0; i < 4; i++) c.tap(i * 0.5);
  for (let i = 0; i < 4; i++) c.tap(10 + i * 0.4);
  assert.ok(Math.abs(c.bpm - 150) < 0.01);
});

test('analysis detects kicks in the sub band', () => {
  const an = new Analysis();
  const binHz = 48000 / 2048;
  const freq = new Float32Array(1024);
  const dt = 1 / 60;
  const per = 60 / 128;
  let kicks = 0;
  let onsets = 0;
  let lastKick = -1;
  for (let t = 0; t < 20; t += dt) {
    if (t - lastKick >= per) {
      lastKick = t;
      if (t > 2) kicks++; // first 2 s: the analysis "warms up"
    }
    const since = t - lastKick;
    freq.fill(-100);
    const sub = -30 - since * 120; // kick: fast decay
    for (let i = 1; i <= 5; i++) freq[i] = Math.max(-100, sub);
    for (let i = 300; i < 400; i++) freq[i] = -70; // constant noise up high
    const o = an.update(freq, binHz, dt, t);
    if (o.onset && t > 2) onsets++;
  }
  assert.ok(Math.abs(onsets - kicks) <= 1, `kicks ${kicks}, detected ${onsets}`);
});

test('analysis finds no kicks in quiet noise', () => {
  const an = new Analysis();
  const freq = new Float32Array(1024);
  let onsets = 0;
  for (let t = 0; t < 10; t += 1 / 60) {
    for (let i = 0; i < freq.length; i++) freq[i] = -95 + Math.sin(i * 7 + t * 3) * 2;
    if (an.update(freq, 48000 / 2048, 1 / 60, t).onset) onsets++;
  }
  assert.equal(onsets, 0);
});

test('demo: a kick on every beat, breakdown from bar 48', () => {
  const d = new Demo();
  let onsets = 0;
  for (let i = 0; i < 60 * 30; i++) if (d.update(1 / 60).onset) onsets++;
  assert.ok(Math.abs(onsets - 64) <= 1); // 30 s at 128 BPM
  d.b = 48 * 4 + 0.5;
  assert.equal(d.update(0).onset, false);
  assert.ok(d.out.energy < 0.5);
});
