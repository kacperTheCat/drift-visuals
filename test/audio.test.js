import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Analysis, Clock, Demo } from '../js/audio.js';

// Deterministyczny "losowy" jitter, żeby test był powtarzalny.
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

test('zegar dochodzi do tempa stóp (128 BPM, start 120)', () => {
  assert.ok(Math.abs(runClock(128, 120) - 128) < 0.5);
});

test('zegar trzyma szybsze tempo (140 BPM, start 132)', () => {
  assert.ok(Math.abs(runClock(140, 132) - 140) < 0.5);
});

test('tap tempo: stuknięcia co 0,5 s = 120 BPM', () => {
  const c = new Clock();
  for (let i = 0; i < 5; i++) c.tap(i * 0.5);
  assert.ok(Math.abs(c.bpm - 120) < 0.01);
});

test('przerwa >2 s zaczyna tap od nowa', () => {
  const c = new Clock();
  for (let i = 0; i < 4; i++) c.tap(i * 0.5);
  for (let i = 0; i < 4; i++) c.tap(10 + i * 0.4);
  assert.ok(Math.abs(c.bpm - 150) < 0.01);
});

test('analiza wykrywa stopy w paśmie sub', () => {
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
      if (t > 2) kicks++; // pierwsze 2 s: analiza się "rozgrzewa"
    }
    const since = t - lastKick;
    freq.fill(-100);
    const sub = -30 - since * 120; // stopa: szybki zanik
    for (let i = 1; i <= 5; i++) freq[i] = Math.max(-100, sub);
    for (let i = 300; i < 400; i++) freq[i] = -70; // stały szum w górze
    const o = an.update(freq, binHz, dt, t);
    if (o.onset && t > 2) onsets++;
  }
  assert.ok(Math.abs(onsets - kicks) <= 1, `stopy ${kicks}, wykryte ${onsets}`);
});

test('analiza nie widzi stóp w ciszy z szumem', () => {
  const an = new Analysis();
  const freq = new Float32Array(1024);
  let onsets = 0;
  for (let t = 0; t < 10; t += 1 / 60) {
    for (let i = 0; i < freq.length; i++) freq[i] = -95 + Math.sin(i * 7 + t * 3) * 2;
    if (an.update(freq, 48000 / 2048, 1 / 60, t).onset) onsets++;
  }
  assert.equal(onsets, 0);
});

test('demo: stopa na każdy beat, breakdown od 48. taktu', () => {
  const d = new Demo();
  let onsets = 0;
  for (let i = 0; i < 60 * 30; i++) if (d.update(1 / 60).onset) onsets++;
  assert.ok(Math.abs(onsets - 64) <= 1); // 30 s przy 128 BPM
  d.b = 48 * 4 + 0.5;
  assert.equal(d.update(0).onset, false);
  assert.ok(d.out.energy < 0.5);
});
