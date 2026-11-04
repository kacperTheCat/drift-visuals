// Sterowanie MIDI.
// Każdy element panelu z atrybutem data-midi (przycisk, suwak, scena, paleta...) można przypisać
// do kontrolki MIDI — w trybie "Learn" albo w oknie "Mapowanie". Kontroler po prostu "klika"
// i "przesuwa" elementy panelu, więc nie trzeba osobno obsługiwać każdej funkcji.
// Obsługiwany jest też MIDI clock (24 impulsy na beat) — dokładne BPM z urządzenia/programu DJ.

import { PRESETS } from './midi-presets.js';

const STORE = 'drift.midi.v1'; // klucz MIDI -> data-midi elementu
const MODES = 'drift.midi.modes'; // klucz MIDI -> tryb gałki
const ENABLED = 'drift.midi.enabled';
const PRESET = 'drift.midi.preset'; // nazwa presetu, dopóki użytkownik go nie zmieni ręcznie
const IGNORED_PORT = /MCU|HUI/i; // porty trybu DAW dublują kontrolki w innym formacie

// Tryby gałek (CC / pitch bend)
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

// 'cc:1:12' -> 'CC12', 'note:1:36' -> 'N36' (kanał pokazujemy tylko, gdy nie jest 1 ani dowolny)
export function fmtKey(key) {
  const [kind, ch, num] = key.split(':');
  const name = kind === 'cc' ? `CC${num}` : kind === 'pb' ? 'PB' : `N${num}`;
  return `${name}${ch !== '1' && ch !== '*' ? `/${ch}` : ''}`;
}

// Czytelna nazwa elementu panelu.
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

// Grupa elementu (do listy akcji w oknie mapowania).
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
    this.btn = {}; // ostatni stan przycisków (wykrywanie zbocza)
    this.enc = {}; // stan automatycznego rozpoznawania gałek
    this.last = '';
    this.applying = false;
    this.debug = true; // log każdego komunikatu w konsoli (DRIFT.midi.debug = false wyłącza)
    this.onActivity = null; // (klucz, mapKey, wartość, cel, wynik) — dla okna mapowania
    this.waitNext = null; // funkcja wywołana z kluczem następnej kontrolki (przycisk "Dodaj")

    // W trybie learn klik w element panelu nie wykonuje akcji, tylko go zaznacza.
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
    // Znany kontroler i brak własnych przypisań → od razu gotowy układ.
    // Niezmieniony preset wczytujemy od nowa, żeby łapał poprawki w kodzie.
    const saved = read(PRESET);
    // Pierwsza wersja układu MiniLab 3 (gałka CC 74 -> intensywność) zapisywała się bez znacznika presetu.
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

  // Przypisanie dla klucza: najpierw dokładny kanał, potem "dowolny kanał" (*).
  mapKeyFor(key) {
    if (key in this.maps) return key;
    const [kind, , num] = key.split(':');
    const wild = `${kind}:*:${num}`;
    return wild in this.maps ? wild : null;
  }

  handle(e) {
    const [st, a = 0, b = 0] = e.data;
    const t = e.timeStamp / 1000;
    // Komunikaty zegara (bez kanału)
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
    // Pitch bend (np. pasek dotykowy): 14 bitów -> 0..127, działa jak gałka. Klucz 'pb:<kanał>:0'.
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

    // "Dodaj" w oknie mapowania: następna kontrolka zostaje dodana, bez wykonywania akcji.
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

  // Wykonuje akcję; zwraca krótki opis wyniku (do logu i okna mapowania).
  apply(target, kind, value, pressed, key, mapKey) {
    const el = document.querySelector(`[data-midi="${CSS.escape(target)}"]`);
    if (!el) return 'no such element in the panel!';
    this.applying = true;
    try {
      if (el.type === 'range') {
        // Suwak: gałka/fader 0..127 -> zakres suwaka. Przycisk (nuta) -> min/max.
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
      // Przyciski reagują na zbocze (naciśnięcie), a "trzymane" (strobo) też na puszczenie.
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

  // Gałki bez końca (enkodery) mogą wysyłać ruch względny zamiast pozycji:
  //   'offset' = 64±n (65 w prawo, 63 w lewo), 'twos' = 1..n w prawo, 127..(128-n) w lewo.
  // Tryb 'auto' rozpoznaje to po powtórzeniach: zwykła gałka nie wysyła tej samej wartości dwa razy
  // z rzędu — z wyjątkiem 0 i 127, które gałka absolutna powtarza, gdy kręcisz dalej za koniec skali.
  // Zwraca przesunięcie (w krokach) albo null dla gałki absolutnej.
  relative(key, v, mode) {
    if (mode === 'abs') return null;
    if (mode === 'offset') return v - 64;
    if (mode === 'twos') return v < 64 ? v : v - 128;
    const e = (this.enc[key] ??= { last: -1, mode: null, onlyRel: true });
    const repeated = v === e.last && v !== 0 && v !== 127;
    e.last = v;
    const offsetLike = v >= 56 && v <= 72 && v !== 64;
    const twosLike = (v >= 1 && v <= 15) || (v >= 113 && v <= 127);
    if (!offsetLike && !twosLike) e.onlyRel = false; // np. 40 — na pewno pozycja absolutna
    if (!e.mode && e.onlyRel && repeated) e.mode = offsetLike ? 'offset' : 'twos';
    if (e.mode === 'offset') return v - 64;
    if (e.mode === 'twos') return v < 64 ? v : v - 128;
    return null;
  }

  // ---------- edycja przypisań (Learn i okno mapowania) ----------
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

  // Wszystkie elementy panelu, które można przypisać: { id, label, group }.
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
    this.setLearning(true); // zostajemy w trybie learn, gotowi na kolejne przypisanie
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

  // Znaczki z przypisaniem (widoczne w trybie learn). Dla suwaków znaczek trafia na etykietę.
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
