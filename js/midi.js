// MIDI control.
// Every panel element with a data-midi attribute (button, slider, scene, palette...) can be assigned
// to a MIDI control — in "Learn" mode or in the "Mapping" window. The controller simply "clicks"
// and "moves" panel elements, so no function needs separate handling.
// MIDI clock is supported too (24 pulses per beat) — an exact BPM from a device / DJ software.

import { PRESETS } from './midi-presets.js';

const STORE = 'drift.midi.v1'; // MIDI key -> data-midi of the element
const MODES = 'drift.midi.modes'; // MIDI key -> knob mode
const ENABLED = 'drift.midi.enabled';
const PRESET = 'drift.midi.preset'; // preset name, until the user changes it by hand
const IGNORED_PORT = /MCU|HUI/i; // DAW-mode ports duplicate controls in a different format

// Knob modes (CC / pitch bend)
export const KNOB_MODES = [
  ['auto', 'auto'],
  ['abs', 'absolute'],
  ['offset', 'relative 64±'],
  ['twos', 'relative 1/127'],
];

function store(key, value) {
  try {
    if (value == null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {}
}
function read(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function readJson(key) {
  try {
    return JSON.parse(localStorage.getItem(key)) || {};
  } catch {
    return {};
  }
}

// 'cc:1:12' -> 'CC12', 'note:1:36' -> 'N36' (the channel is shown only when it is neither 1 nor any)
export function fmtKey(key) {
  const [kind, ch, num] = key.split(':');
  const name = kind === 'cc' ? `CC${num}` : kind === 'pb' ? 'PB' : `N${num}`;
  return `${name}${ch !== '1' && ch !== '*' ? `/${ch}` : ''}`;
}

// Readable name of a panel element.
function labelOf(el) {
  if (el.dataset.midiName) return el.dataset.midiName;
  if (el.type === 'range' || el.type === 'checkbox') {
    const l = el.closest('label');
    if (l) return l.textContent.trim();
  }
  const txt = [...el.childNodes]
    .filter((n) => n.nodeType === 3 || n.classList?.contains('nm'))
    .map((n) => n.textContent)
    .join(' ')
    .trim();
  return txt || el.title || el.dataset.midi;
}

// Group of an element (for the action list in the mapping window).
function groupOf(el) {
  const id = el.dataset.midi;
  if (id.startsWith('scene:')) return el.closest('#backs') ? 'Backdrops' : 'Depth scenes';
  if (id.startsWith('pal:depth')) return 'Depth colours';
  if (id.startsWith('pal:back')) return 'Backdrop colours';
  if (/^(blend|phrase|trans):/.test(id)) return 'Modes';
  const col = el.closest('.col');
  const where = col?.querySelector('#scenes') ? 'Depth' : col?.querySelector('#backs') ? 'Backdrop' : 'Live';
  return `${where}: ${el.type === 'range' ? 'sliders' : 'buttons'}`;
}

export class Midi {
  constructor(director, onStatus) {
    this.d = director;
    this.onStatus = onStatus;
    this.access = null;
    this.maps = readJson(STORE);
    this.modes = readJson(MODES);
    this.learning = false;
    this.selected = null;
    this.btn = {}; // last button state (edge detection)
    this.enc = {}; // state of automatic knob detection
    this.last = '';
    this.applying = false;
    this.debug = true; // log every message to the console (DRIFT.midi.debug = false turns it off)
    this.onActivity = null; // (key, mapKey, value, target, result) — for the mapping window
    this.waitNext = null; // function called with the key of the next control ("Add" button)

    // In learn mode a click on a panel element does not run the action, it only selects the element.
    const intercept = (e) => {
      if (!this.learning || this.applying) return;
      const el = e.target.closest?.('[data-midi]');
      if (!el) return;
      e.preventDefault();
      e.stopPropagation();
      if (e.type === 'pointerdown') this.select(el);
    };
    for (const ev of ['pointerdown', 'mousedown', 'click', 'input', 'change']) document.addEventListener(ev, intercept, true);
    document.addEventListener(
      'contextmenu',
      (e) => {
        const el = this.learning && e.target.closest?.('[data-midi]');
        if (!el) return;
        e.preventDefault();
        this.unassign(el.dataset.midi);
      },
      true,
    );
  }

  get supported() {
    return !!navigator.requestMIDIAccess;
  }

  get wasEnabled() {
    return read(ENABLED) === '1';
  }

  async enable() {
    this.access = await navigator.requestMIDIAccess();
    store(ENABLED, '1');
    this.access.onstatechange = () => this.attach();
    this.attach();
    this.refreshBadges();
  }

  attach() {
    for (const input of this.access.inputs.values())
      input.onmidimessage = IGNORED_PORT.test(input.name) ? null : (e) => this.handle(e);
    if (this.debug) console.log('[MIDI] devices:', this.inputs.map((i) => `${i.name} (${i.manufacturer || '?'})`));
    // Known controller and no custom assignments → ready-made layout right away.
    // An unmodified preset is reloaded so it picks up fixes in the code.
    const saved = read(PRESET);
    // The first MiniLab 3 layout (knob CC 74 -> intensity) was saved without a preset marker.
    const legacy = !saved && (this.maps['cc:1:74'] === 'intensity' || this.maps['cc:*:74'] === 'intensity');
    if (legacy) this.loadPreset('minilab3');
    else if (saved && PRESETS[saved]) this.loadPreset(saved, true);
    else if (!Object.keys(this.maps).length) {
      const names = this.inputs.map((i) => i.name);
      const key = Object.keys(PRESETS).find((k) => names.some((n) => PRESETS[k].match.test(n)));
      if (key) this.loadPreset(key);
    }
    this.status();
  }

  loadPreset(key, quiet = false) {
    const p = PRESETS[key];
    this.maps = p.maps();
    this.modes = p.modes ? p.modes(this.maps) : {};
    this.enc = {};
    this.save();
    store(PRESET, key);
    this.refreshBadges();
    if (!quiet) this.d.log(`MIDI: ${p.name} layout`);
  }

  get inputs() {
    return this.access
      ? [...this.access.inputs.values()].filter((i) => i.state === 'connected' && !IGNORED_PORT.test(i.name))
      : [];
  }

  // Assignment for a key: exact channel first, then "any channel" (*).
  mapKeyFor(key) {
    if (key in this.maps) return key;
    const [kind, , num] = key.split(':');
    const wild = `${kind}:*:${num}`;
    return wild in this.maps ? wild : null;
  }

  handle(e) {
    const [st, a = 0, b = 0] = e.data;
    const t = e.timeStamp / 1000;
    // Clock messages (no channel)
    if (st === 0xf8) return this.d.midiTick(t);
    if (st === 0xfa) return this.d.midiStart(t);
    if (st === 0xfb) return this.d.midiContinue(t);
    if (st === 0xfc) return this.d.midiStop();

    const type = st & 0xf0;
    const ch = (st & 0x0f) + 1;
    const hex = [...e.data].map((x) => x.toString(16).padStart(2, '0')).join(' ');
    let kind, value, pressed;
    if (type === 0xb0) [kind, value, pressed] = ['cc', b, b >= 64];
    else if (type === 0x90 && b > 0) [kind, value, pressed] = ['note', b, true];
    else if (type === 0x80 || type === 0x90) [kind, value, pressed] = ['note', 0, false];
    // Pitch bend (e.g. a touch strip): 14 bits -> 0..127, works like a knob. Key 'pb:<channel>:0'.
    else if (type === 0xe0) [kind, value, pressed] = ['pb', Math.round((((b << 7) | a) / 16383) * 127), false];
    else {
      if (this.debug) {
        const names = { 0xa0: 'note aftertouch', 0xc0: 'program change', 0xd0: 'channel aftertouch', 0xf0: 'system/SysEx' };
        console.log(`[MIDI] ${e.target?.name || ''} | ${names[type] || 'other'} (channel ${ch}) | [${hex}] — not handled`);
      }
      return;
    }

    const num = kind === 'pb' ? 0 : a;
    const key = `${kind}:${ch}:${num}`;
    this.last = key;
    const mapKey = this.mapKeyFor(key);
    const target = mapKey ? this.maps[mapKey] : null;
    const what =
      kind === 'cc' ? `CC ${a} = ${b}` : kind === 'pb' ? `pitch bend = ${value}` : `note ${a} ${pressed ? 'on' : 'off'} (vel ${b})`;

    // "Add" in the mapping window: the next control gets added without running the action.
    if (this.waitNext && (kind !== 'note' || pressed)) {
      const cb = this.waitNext;
      this.waitNext = null;
      cb(key);
      return;
    }
    if (this.learning) {
      if (this.debug) console.log(`[MIDI] ${what} | key ${key} (Learn mode)`);
      if (this.selected && (kind !== 'note' || pressed)) this.assign(key, this.selected);
      else this.status();
      return;
    }
    const result = target ? this.apply(target, kind, value, pressed, key, mapKey) : null;
    if (this.debug) {
      console.log(
        `[MIDI] ${e.target?.name || ''} | channel ${ch} | ${what} | [${hex}] | key ${key} → ${target || 'NOT MAPPED'}${result ? ` | ${result}` : ''}`,
      );
    }
    this.onActivity?.(key, mapKey, value, target, result);
    this.status();
  }

  // Runs the action; returns a short description of the result (for the log and the mapping window).
  apply(target, kind, value, pressed, key, mapKey) {
    const el = document.querySelector(`[data-midi="${CSS.escape(target)}"]`);
    if (!el) return 'no such element in the panel!';
    this.applying = true;
    try {
      if (el.type === 'range') {
        // Slider: knob/fader 0..127 -> slider range. Button (note) -> min/max.
        const min = +el.min || 0;
        const max = +el.max || 100;
        let how = 'abs';
        if (kind !== 'note') {
          const delta = this.relative(key, value, this.modes[mapKey] || 'auto');
          if (delta === null) el.value = min + ((max - min) * value) / 127;
          else {
            el.value = +el.value + (delta * (max - min)) / 100;
            how = `rel. ${delta > 0 ? '+' : ''}${delta}`;
          }
        } else el.value = pressed ? max : min;
        el.dispatchEvent(new Event('input', { bubbles: true }));
        return `slider = ${Math.round(((el.value - min) / (max - min)) * 100)}% (${how})`;
      }
      // Buttons react to the edge (press), and "hold" buttons (strobe) also to the release.
      const was = this.btn[key] || false;
      this.btn[key] = pressed;
      if (was === pressed) return pressed ? 'held' : null;
      if ('hold' in el.dataset) {
        el.dispatchEvent(new PointerEvent(pressed ? 'pointerdown' : 'pointerup'));
        return pressed ? 'pressed (hold)' : 'released';
      }
      if (pressed) {
        el.click();
        return 'clicked';
      }
      return null;
    } finally {
      this.applying = false;
    }
  }

  // Endless knobs (encoders) can send relative motion instead of a position:
  //   'offset' = 64±n (65 right, 63 left), 'twos' = 1..n right, 127..(128-n) left.
  // 'auto' mode detects this from repeats: a regular knob never sends the same value twice
  // in a row — except 0 and 127, which an absolute knob repeats when you keep turning past the end.
  // Returns the offset (in steps) or null for an absolute knob.
  relative(key, v, mode) {
    if (mode === 'abs') return null;
    if (mode === 'offset') return v - 64;
    if (mode === 'twos') return v < 64 ? v : v - 128;
    const e = (this.enc[key] ??= { last: -1, mode: null, onlyRel: true });
    const repeated = v === e.last && v !== 0 && v !== 127;
    e.last = v;
    const offsetLike = v >= 56 && v <= 72 && v !== 64;
    const twosLike = (v >= 1 && v <= 15) || (v >= 113 && v <= 127);
    if (!offsetLike && !twosLike) e.onlyRel = false; // e.g. 40 — definitely an absolute position
    if (!e.mode && e.onlyRel && repeated) e.mode = offsetLike ? 'offset' : 'twos';
    if (e.mode === 'offset') return v - 64;
    if (e.mode === 'twos') return v < 64 ? v : v - 128;
    return null;
  }

  // ---------- editing assignments (Learn and the mapping window) ----------
  setMap(key, target) {
    this.maps[key] = target;
    this.save();
    store(PRESET, null);
    this.refreshBadges();
  }

  setMode(key, mode) {
    if (mode === 'auto') delete this.modes[key];
    else this.modes[key] = mode;
    delete this.enc[key];
    this.save();
    store(PRESET, null);
  }

  removeMap(key) {
    delete this.maps[key];
    delete this.modes[key];
    this.save();
    store(PRESET, null);
    this.refreshBadges();
  }

  // All panel elements that can be assigned: { id, label, group }.
  targets() {
    return [...document.querySelectorAll('[data-midi]')].map((el) => ({ id: el.dataset.midi, label: labelOf(el), group: groupOf(el) }));
  }

  setLearning(on) {
    this.learning = on;
    this.selected = null;
    document.body.classList.toggle('midi-learn', on);
    document.querySelectorAll('.midi-sel').forEach((el) => el.classList.remove('midi-sel'));
    this.status();
  }

  select(el) {
    document.querySelectorAll('.midi-sel').forEach((x) => x.classList.remove('midi-sel'));
    el.classList.add('midi-sel');
    this.selected = el.dataset.midi;
    this.status();
  }

  assign(key, target) {
    this.setMap(key, target);
    const el = document.querySelector(`[data-midi="${CSS.escape(target)}"]`);
    this.d.log(`MIDI ${fmtKey(key)} → ${el ? labelOf(el) : target}`);
    this.setLearning(true); // stay in learn mode, ready for the next assignment
  }

  unassign(target) {
    for (const k of Object.keys(this.maps)) if (this.maps[k] === target) this.removeMap(k);
  }

  clearAll() {
    this.maps = {};
    this.modes = {};
    this.save();
    store(PRESET, null);
    this.refreshBadges();
  }

  save() {
    store(STORE, JSON.stringify(this.maps));
    store(MODES, JSON.stringify(this.modes));
  }

  // Assignment badges (visible in learn mode). For sliders the badge goes on the label.
  refreshBadges() {
    document.querySelectorAll('[data-midi-label]').forEach((el) => delete el.dataset.midiLabel);
    for (const el of document.querySelectorAll('[data-midi]')) {
      const keys = Object.keys(this.maps).filter((k) => this.maps[k] === el.dataset.midi);
      if (!keys.length) continue;
      const host = el.type === 'range' || el.type === 'checkbox' ? el.closest('label') || el : el;
      host.dataset.midiLabel = keys.map(fmtKey).join(' ');
    }
    this.status();
  }

  status() {
    let msg = '';
    if (this.access) {
      const n = this.inputs.length;
      const maps = Object.values(this.maps).filter(Boolean).length;
      if (this.learning) {
        const el = this.selected && document.querySelector(`[data-midi="${CSS.escape(this.selected)}"]`);
        msg = el ? `${labelOf(el)} → move a control` : 'Click an element (right-click = remove)';
      } else {
        msg = n ? `${n} dev · ${maps} maps` : 'no devices';
        if (this.d.midiClockActive) msg += ' · CLOCK';
        if (this.last) msg += ` · ${fmtKey(this.last)}`;
      }
    }
    this.onStatus(msg, this.inputs.map((i) => i.name));
  }
}
