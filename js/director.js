// Reżyser: łączy audio, zegar i autopilota; co klatkę produkuje "frame" dla renderera.
import { AudioIn, Analysis, Clock, Demo } from './audio.js';
import { SCENES, DEPTH, BACK } from './scenes.js';
import { PALETTES } from './palettes.js';

export const RANDOM = '__random'; // wartość "losowa" w programie dropu
export const TRANSITIONS = { cut: 0, beat: 1, bar: 4, bar2: 8, phrase: 16 }; // w beatach
// Tryby nakładania głębi na tło (kolejność = numer trybu w shaderze kompozycji).
export const BLENDS = [
  ['normal', 'Normalny'],
  ['screen', 'Światło'],
  ['mask', 'Maska'],
  ['diff', 'Różnica'],
];
const STORE = 'drift.settings.v1';

// Sceny, których shader faktycznie używa parametrów wariacji (uVar).
export const VARIES = new Set(SCENES.filter((s) => s.sim || /uVar\.[xyzw]/.test((s.map || '') + s.frag)).map((s) => s.id));

// Czy wariacja w warstwie ma sens: scena ją obsługuje i warstwa jest widoczna. Zwraca powód albo null.
export function varyBlocked(d, layer) {
  const id = (layer === 'back' ? d.bk : d.dp).cur.id;
  if (!VARIES.has(id)) return 'ta scena nie ma wariacji';
  if (layer === 'depth' && d.bal < 0.01) return 'głębia jest niewidoczna (balans / L)';
  if (layer === 'back' && ((d.bal > 0.99 && d.s.blend !== 'mask') || d.s.backLevel < 0.01))
    return 'tło jest niewidoczne (balans / jasność)';
  return null;
}

const rand4 = () => [Math.random(), Math.random(), Math.random(), Math.random()];
const lerp = (a, b, t) => a + (b - a) * t;
const ease = (x) => x * x * (3 - 2 * x);

function load() {
  try {
    return JSON.parse(localStorage.getItem(STORE)) || {};
  } catch {
    return {};
  }
}

export class Director {
  constructor() {
    this.audio = new AudioIn();
    this.an = new Analysis();
    this.clock = new Clock();
    this.demo = new Demo();
    this.source = 'demo';

    this.s = Object.assign(
      {
        // głębia
        intensity: 0.75,
        react: 0.8,
        speed: 1,
        trails: 0.5,
        // tło
        backReact: 0.5,
        backSpeed: 0.6,
        // jakość obrazu: wygładzanie krawędzi głębi (FXAA), render w 1,5× rozdzielczości
        fxaa: true,
        hiRes: false,
        // ręczny drop: co narasta w trakcie odliczania i co się dzieje w momencie dropu
        dropBars: 4,
        dropBuild: { blur: true, accel: true, dark: false, strobe: true, glitch: false, shatter: false },
        dropHit: { vary: true, flash: true },
        transition: 'bar', // przejście scen głębi
        backTransition: 'bar2', // przejście teł
        phrase: 16,
        autopilot: true,
        autoPalette: true,
        bpmAuto: true,
        palette: 0, // paleta głębi
        backPalette: 2, // paleta tła
        linkPalettes: false, // tło w kolorach głębi
        blend: 'normal',
        autoBlend: true,
        balance: 0.5,
        backLevel: 0.6,
        autoBack: true,
        pool: {},
        deviceId: null,
      },
      load(),
    );
    for (const sc of SCENES) if (!(sc.id in this.s.pool)) this.s.pool[sc.id] = true;
    if (!PALETTES[this.s.palette]) this.s.palette = 0;
    if (!PALETTES[this.s.backPalette]) this.s.backPalette = 0;
    if (!BLENDS.some(([m]) => m === this.s.blend)) this.s.blend = 'normal';
    this.drop = null; // uzbrojony drop: { bars, from, at } (w beatach)
    // Program dropu: co ma wejść w momencie dropu. null = bez zmian (zostaje to, co gra teraz).
    this.dropProg = { scene: null, back: null, pal: null, palBack: null };

    // Każda warstwa: bieżąca scena + poprzednia (w trakcie przejścia, p = postęp 0..1).
    this.dp = { cur: this.slot(DEPTH[0].id), prev: null, p: 1, beats: 4 };
    this.bk = { cur: this.slot(BACK[0].id), prev: null, p: 1, beats: 16 };
    // Balans warstw: 0 = samo tło, 0.5 = oba plany, 1 = sama głębia. depthOn=false (L) sprowadza do 0.
    this.depthOn = true;
    this.bal = this.s.balance;

    // Bieżące (płynnie dociągane) kolory każdej warstwy.
    const copy = (p) => ({ bg: [...p.bg], c1: [...p.c1], c2: [...p.c2] });
    this.col = copy(PALETTES[this.s.palette]);
    this.colBack = copy(PALETTES[this.backPaletteIndex]);

    this.kick = 0;
    this.bass = 0;
    this.mid = 0;
    this.high = 0;
    this.energy = 0.6;
    this.level = -120;
    this.flow = 0; // czas przepływu głębi
    this.flowBack = 0; // czas przepływu tła
    this.flash = 0;
    this.black = false;
    this.blackAmt = 0;
    this.strobe = false;
    this.glitch = false; // trzymany przycisk/klawisz glitcha
    this.glitchAmt = 0;
    this.shatterOn = false; // rozpad (przełącznik)
    this.shatterAmt = 0; // postęp rozpadu 0..1
    this.shatterSeed = 0; // wzór pęknięć

    this.state = 'groove';
    this.lastKickT = performance.now() / 1000;
    this.pendingDrop = 0;
    this.lastBar = 0;
    this.barsSince = 0;
    this.events = []; // ostatnie zdarzenia do podglądu w panelu

    this.last = 0;
    this.frame = null;
  }

  save() {
    try {
      localStorage.setItem(STORE, JSON.stringify(this.s));
    } catch {}
  }

  set(key, value) {
    this.s[key] = value;
    this.save();
  }

  log(msg) {
    this.events.unshift({ t: performance.now(), msg });
    this.events.length = Math.min(this.events.length, 6);
  }

  // ---------- źródła dźwięku ----------
  async useInput(deviceId) {
    await this.audio.useDevice(deviceId);
    this.source = 'input';
    this.an.reset();
    this.set('deviceId', deviceId || null);
    this.log(`Wejście: ${this.audio.label}`);
  }

  useFile(file) {
    this.audio.useFile(file);
    this.source = 'file';
    this.an.reset();
    this.log(`Plik: ${file.name}`);
  }

  useDemo() {
    this.audio.stop();
    this.source = 'demo';
    this.log('Tryb demo (syntetyczny beat)');
  }

  // ---------- sceny ----------
  slot(id) {
    const v = rand4();
    return { id, v, vt: [...v] };
  }

  get current() {
    return this.dp.cur.id;
  }

  // Płynne przejście sceny w warstwie (głębia lub tło).
  static fadeLayer(L, slot, beats) {
    L.prev = L.cur;
    L.cur = slot;
    L.p = beats ? 0 : 1;
    L.beats = beats;
  }

  setScene(id, trans = null, auto = false) {
    if (!id) return;
    if (id === this.current) {
      this.vary();
      return;
    }
    Director.fadeLayer(this.dp, this.slot(id), TRANSITIONS[trans ?? this.s.transition]);
    if (!auto) this.barsSince = 0;
  }

  // ---------- balans i nakładanie warstw ----------
  setBalance(v) {
    this.set('balance', Math.min(1, Math.max(0, v)));
    this.depthOn = true;
    this.bal = this.s.balance;
  }

  nudgeBalance(dv) {
    this.setBalance(this.s.balance + dv);
  }

  setBlend(mode) {
    if (BLENDS.some(([m]) => m === mode)) this.set('blend', mode);
  }

  nextBlend() {
    const i = BLENDS.findIndex(([m]) => m === this.s.blend);
    this.setBlend(BLENDS[(i + 1) % BLENDS.length][0]);
  }

  // ---------- tło ----------
  setBack(id, beats = TRANSITIONS[this.s.backTransition] ?? 8) {
    if (!id || id === this.bk.cur.id) return;
    Director.fadeLayer(this.bk, this.slot(id), beats);
  }

  nextBack(dir = 1) {
    const i = BACK.findIndex((s) => s.id === this.bk.cur.id);
    this.setBack(BACK[(i + dir + BACK.length) % BACK.length].id);
  }

  toggleDepth() {
    this.depthOn = !this.depthOn;
    this.log(this.depthOn ? 'Głębia włączona' : 'Tylko tło');
  }

  pick(mood, layer = 'depth') {
    mood = mood || (this.state === 'breakdown' ? 'calm' : 'drive');
    const busy = [(layer === 'depth' ? this.dp : this.bk).cur.id];
    const on = (layer === 'depth' ? DEPTH : BACK).filter((sc) => this.s.pool[sc.id] && !busy.includes(sc.id));
    const fit = on.filter((sc) => sc.mood === mood || sc.mood === 'both');
    const list = fit.length ? fit : on;
    return list.length ? list[Math.floor(Math.random() * list.length)].id : null;
  }

  // Wariacja = nowe cele dla 4 parametrów sceny (dociągane płynnie przez ~5 s).
  vary(amount = 1, layer = 'depth') {
    const sl = (layer === 'back' ? this.bk : this.dp).cur;
    if (!VARIES.has(sl.id)) return; // scena nie ma parametrów wariacji
    sl.vt = sl.vt.map((x) => lerp(x, Math.random(), amount));
  }

  togglePool(id) {
    this.s.pool[id] = !this.s.pool[id];
    this.save();
  }

  // layer: 'depth' albo 'back'
  setPalette(i, layer = 'depth') {
    const n = PALETTES.length;
    this.set(layer === 'back' ? 'backPalette' : 'palette', ((i % n) + n) % n);
  }

  nextPalette(dir = 1, layer = 'depth') {
    this.setPalette((layer === 'back' ? this.s.backPalette : this.s.palette) + dir, layer);
  }

  get backPaletteIndex() {
    return this.s.linkPalettes ? this.s.palette : this.s.backPalette;
  }

  // Losowa inna paleta niż bieżąca.
  randomPalette(layer) {
    const cur = layer === 'back' ? this.s.backPalette : this.s.palette;
    this.setPalette(cur + 1 + Math.floor(Math.random() * (PALETTES.length - 1)), layer);
  }

  // ---------- akcje na żywo ----------
  toggleAutopilot() {
    this.set('autopilot', !this.s.autopilot);
    this.barsSince = 0;
  }

  // Rozpad: obraz pęka i przez 4 takty rozpada się na opadające odłamki; ponownie = złożenie.
  toggleShatter() {
    this.shatterOn = !this.shatterOn;
    if (this.shatterOn && this.shatterAmt < 0.02) this.shatterSeed = Math.floor(Math.random() * 1000);
  }

  toggleBlack() {
    this.black = !this.black;
  }

  hit() {
    this.flash = 1;
  }

  // Ręczne BPM (np. z wyświetlacza RX3): ustawia tempo i wyłącza AUTO,
  // faza nadal dociąga się do wykrytej stopy.
  setBpm(v) {
    const bpm = Math.min(200, Math.max(60, v));
    this.clock.bpm = bpm;
    this.demo.bpm = bpm;
    this.set('bpmAuto', false);
    this.log(`BPM ${bpm.toFixed(1)} (ręcznie, AUTO wył.)`);
  }

  tap() {
    this.clock.tap(performance.now() / 1000);
    if (this.source === 'demo') this.demo.bpm = this.clock.bpm;
  }

  syncPhrase() {
    this.clock.alignPhrase(0);
    this.lastBar = Math.floor(this.clock.beats / 4);
    this.barsSince = 0;
  }

  // Następna/poprzednia scena w warstwie (dla MIDI i przycisków).
  stepScene(dir, layer = 'depth') {
    const list = layer === 'back' ? BACK : DEPTH;
    const cur = (layer === 'back' ? this.bk : this.dp).cur.id;
    const i = list.findIndex((s) => s.id === cur);
    const id = list[(i + dir + list.length) % list.length].id;
    if (layer === 'back') this.setBack(id);
    else this.setScene(id);
  }

  // ---------- MIDI clock (24 impulsy na beat) ----------
  // Tempo liczone z odstępów impulsów. Po komunikacie Start znamy też początek frazy,
  // więc fazę bierzemy z zegara, a nie z wykrywania stopy.
  midiTick(t) {
    const mc = (this.mc ??= { ticks: [], count: 0, started: false, last: 0 });
    mc.last = t;
    mc.count++;
    mc.ticks.push(t);
    if (mc.ticks.length > 97) mc.ticks.shift();
    if (mc.ticks.length >= 25) {
      const span = mc.ticks[mc.ticks.length - 1] - mc.ticks[0];
      const bpm = (60 * (mc.ticks.length - 1)) / 24 / span;
      if (bpm > 40 && bpm < 250) this.clock.bpm += (bpm - this.clock.bpm) * 0.2;
    }
    if (mc.started && mc.count % 24 === 0) {
      const e = this.clock.beats - Math.round(this.clock.beats);
      if (Math.abs(e) < 0.45) this.clock.beats -= e * 0.5;
    }
  }

  midiStart(t) {
    this.mc = { ticks: [], count: 0, started: true, last: t };
    this.clock.beats = Math.ceil(this.clock.beats / 64) * 64;
    this.lastBar = Math.floor(this.clock.beats / 4);
    this.barsSince = 0;
    this.log('MIDI start — początek frazy');
  }

  midiContinue(t) {
    if (this.mc) this.mc.last = t;
  }

  midiStop() {
    if (this.mc) this.mc.started = false;
  }

  get midiClockActive() {
    return !!this.mc && performance.now() / 1000 - this.mc.last < 0.5;
  }

  // ---------- automatyka ----------
  onOnset(t) {
    // Przy MIDI clock tempo (a po Start także faza) pochodzi z zegara, nie ze stopy.
    const mc = this.midiClockActive;
    if (!(mc && this.mc.started)) this.clock.onset(t, this.s.bpmAuto && !mc);
    this.lastKickT = t;
    if (this.state !== 'breakdown') return;
    // Drop = dwie stopy w odstępie ~1 beatu po ciszy w basie.
    const beatLen = 60 / this.clock.bpm;
    if (this.pendingDrop && Math.abs(t - this.pendingDrop - beatLen) < beatLen * 0.3) {
      this.pendingDrop = 0;
      this.onDrop();
    } else this.pendingDrop = t;
  }

  updateGroove(t) {
    if (this.state === 'groove' && ((t - this.lastKickT) * this.clock.bpm) / 60 > 8) {
      this.state = 'breakdown';
      this.onBreakdown();
    }
  }

  onBreakdown() {
    this.log('Breakdown');
    if (!this.s.autopilot) return;
    if (this.s.autoBack) this.setBack(this.pick('calm', 'back'), 16);
    // Połowa breakdownów: zostaw samo tło; reszta: spokojna scena głębi.
    if (Math.random() < 0.5) {
      this.depthOn = false;
      this.log('Autopilot → tylko tło');
    } else this.setScene(this.pick('calm'), 'phrase', true);
  }

  onDrop() {
    this.state = 'groove';
    this.log('Drop!');
    // Drop zwykle zaczyna frazę — wyrównujemy licznik (druga stopa = beat 2).
    this.clock.alignPhrase(1);
    this.lastBar = Math.floor(this.clock.beats / 4);
    this.barsSince = 0;
    if (this.s.autopilot) {
      this.depthOn = true;
      this.bal = this.s.balance;
      this.setScene(this.pick('drive'), 'cut', true);
      this.flash = 0.9;
    }
  }

  // ---------- ręczny drop ----------
  // Uzbrojenie: drop wypada na początku taktu za `bars` taktów (licząc od bieżącego taktu).
  // Ponowne uzbrojenie tą samą długością (albo bez podania) anuluje.
  armDrop(bars = null) {
    if (this.drop && (bars === null || bars === this.drop.bars)) {
      this.drop = null;
      this.log('Drop anulowany');
      return;
    }
    bars = bars ?? this.s.dropBars;
    this.set('dropBars', bars);
    const b = this.clock.beats;
    this.drop = { bars, from: b, at: (Math.floor(b / 4) + bars) * 4, seed: Math.floor(Math.random() * 1000) };
    this.log(`Drop za ${bars} ${bars === 1 ? 'takt' : bars < 5 ? 'takty' : 'taktów'}`);
  }

  // Postęp odliczania 0..1 (albo null, gdy drop nie jest uzbrojony).
  get dropProgress() {
    const dr = this.drop;
    if (!dr) return null;
    return Math.min(1, Math.max(0, (this.clock.beats - dr.from) / Math.max(dr.at - dr.from, 1e-3)));
  }

  toggleDropOpt(group, key) {
    const g = group === 'build' ? 'dropBuild' : 'dropHit';
    this.set(g, { ...this.s[g], [key]: !this.s[g][key] });
  }

  // Ustawienie pola programu dropu; wybranie tego, co gra teraz = brak zmiany (null).
  setDropProg(key, value) {
    const current = { scene: this.dp.cur.id, back: this.bk.cur.id, pal: this.s.palette, palBack: this.backPaletteIndex }[key];
    if (value !== RANDOM && (key === 'pal' || key === 'palBack')) value = +value;
    this.dropProg[key] = value === current ? null : value;
  }

  fireDrop() {
    const h = this.s.dropHit;
    const pg = this.dropProg;
    this.drop = null;
    this.state = 'groove';
    this.depthOn = true;
    this.bal = this.s.balance;
    // zaprogramowane zmiany (cięcie)
    if (pg.scene) this.setScene(pg.scene === RANDOM ? this.pick('drive') : pg.scene, 'cut', true);
    if (pg.back) this.setBack(pg.back === RANDOM ? this.pick(null, 'back') : pg.back, 0);
    if (pg.pal !== null) pg.pal === RANDOM ? this.randomPalette('depth') : this.setPalette(pg.pal, 'depth');
    if (pg.palBack !== null) pg.palBack === RANDOM ? this.randomPalette('back') : this.setPalette(pg.palBack, 'back');
    this.dropProg = { scene: null, back: null, pal: null, palBack: null };
    if (h.vary) {
      this.vary(1);
      this.vary(1, 'back');
    }
    if (h.flash) this.flash = 1;
    this.kick = 1;
    // rozpad (ręczny i z narastania) — obraz składa się natychmiast
    this.shatterOn = false;
    this.shatterAmt = 0;
    this.glitchAmt = 0;
    // Drop = początek frazy dla autopilota.
    this.lastBar = Math.floor(this.clock.beats / 4);
    this.barsSince = 0;
    this.log('DROP!');
  }

  onBar(bar) {
    this.barsSince++;
    if (!this.s.autopilot || this.drop) return; // w trakcie odliczania autopilot nie miesza
    const ph = this.s.phrase;
    if (bar % ph === 0 && this.barsSince >= ph / 2) {
      this.barsSince = 0;
      const r = Math.random();
      if (r < 0.6) {
        const id = this.pick();
        this.setScene(id, null, true);
        this.log(`Autopilot → ${SCENES.find((s) => s.id === id)?.name}`);
      } else {
        this.vary();
        this.log('Autopilot → wariacja');
      }
      if (!this.depthOn && this.state === 'groove') this.depthOn = true;
      if (this.s.autoBack) {
        const r2 = Math.random();
        if (r2 < 0.35) {
          const id = this.pick(null, 'back');
          this.setBack(id, 16);
          this.log(`Autopilot → tło ${SCENES.find((s) => s.id === id)?.name}`);
        } else if (r2 < 0.7) this.vary(1, 'back');
      }
      // Nakładanie: zwykle Normalny, czasem na frazę inny tryb.
      if (this.s.autoBlend && this.state === 'groove' && Math.random() < 0.3) {
        const m = Math.random() < 0.4 ? 'normal' : BLENDS[1 + Math.floor(Math.random() * 3)][0];
        if (m !== this.s.blend) {
          this.setBlend(m);
          this.log(`Autopilot → nakładanie: ${BLENDS.find(([x]) => x === m)[1]}`);
        }
      }
      if (this.s.autoPalette) {
        if (Math.random() < 0.25) this.randomPalette('depth');
        if (!this.s.linkPalettes && Math.random() < 0.2) this.randomPalette('back');
      }
    } else if (bar % 4 === 0) {
      if (Math.random() < 0.3) this.vary(0.35);
      if (this.s.autoBack && Math.random() < 0.2) this.vary(0.35, 'back');
    }
  }

  // ---------- pętla ----------
  tick(now = performance.now()) {
    // Tick może być wołany z panelu i z okna wyjścia — liczymy najwyżej raz na ~6 ms.
    if (this.frame && now - this.last < 6) return this.frame;
    const dt = this.last ? Math.min((now - this.last) / 1000, 0.1) : 1 / 60;
    this.last = now;
    const t = now / 1000;
    const clk = this.clock;
    clk.advance(dt);
    if (this.drop && clk.beats >= this.drop.at) this.fireDrop();

    let f;
    if (this.source === 'demo') f = this.demo.update(dt);
    else {
      const fr = this.audio.read();
      f = fr ? this.an.update(fr, this.audio.binHz, dt, t) : this.an.out;
    }
    this.level = f.level;
    if (f.onset) this.onOnset(t);
    this.updateGroove(t);

    this.kick = f.onset ? 1 : this.kick * Math.exp(-dt / 0.13);
    this.bass = f.sub * 0.7 + f.low * 0.3;
    this.mid = f.mid;
    this.high = f.high;
    this.energy = lerp(this.energy, f.energy, 1 - Math.exp(-dt / 1.5));

    const bar = Math.floor(clk.beats / 4);
    if (bar !== this.lastBar) {
      if (bar > this.lastBar) this.onBar(bar);
      this.lastBar = bar;
    }

    const k = 1 - Math.exp(-dt / 5);
    const beatDt = (dt * clk.bpm) / 60;
    const { dp, bk } = this;
    for (const L of [dp, bk]) {
      if (!L.prev) continue;
      L.p = Math.min(1, L.p + beatDt / L.beats);
      if (L.p >= 1) L.prev = null;
    }
    // Głębia wraca w 1 beat, chowa się (L / breakdown) w 2 takty.
    const bTarget = this.depthOn ? this.s.balance : 0;
    const bRate = beatDt / (bTarget > this.bal ? 1 : 8);
    this.bal += Math.sign(bTarget - this.bal) * Math.min(Math.abs(bTarget - this.bal), bRate);

    for (const sl of [dp.cur, dp.prev, bk.cur, bk.prev]) if (sl) for (let i = 0; i < 4; i++) sl.v[i] = lerp(sl.v[i], sl.vt[i], k);

    const kp = 1 - Math.exp(-dt / 1.2);
    for (const [col, P] of [[this.col, PALETTES[this.s.palette]], [this.colBack, PALETTES[this.backPaletteIndex]]])
      for (const key of ['bg', 'c1', 'c2'])
        for (let i = 0; i < 3; i++) col[key][i] = lerp(col[key][i], P[key][i], kp);

    this.flash *= Math.exp(-dt / 0.18);
    let flash = this.strobe ? ((clk.beats * 4) % 1 < 0.5 ? 1 : 0) : this.flash;

    // Glitch: póki trzymany; stopa na chwilę go wzmacnia.
    let glitchTarget = this.glitch ? 0.55 + 0.45 * this.kick : 0;

    // Narastanie przed ręcznym dropem (p: 0 -> 1, efekty rosną z kwadratem postępu).
    const dp01 = this.dropProgress;
    const build = dp01 === null ? null : this.s.dropBuild;
    const pp = dp01 === null ? 0 : dp01 * dp01;
    if (build?.strobe && this.drop.at - clk.beats <= 4) {
      // ostatni takt: ósemki, ostatnie 2 beaty: szesnastki
      const rate = this.drop.at - clk.beats <= 2 ? 4 : 2;
      if ((clk.beats * rate) % 1 < 0.35) flash = Math.max(flash, 0.55);
    }
    if (build?.glitch && this.drop.at - clk.beats <= 8) {
      const g = 1 - (this.drop.at - clk.beats) / 8; // ostatnie 2 takty: glitch narasta
      glitchTarget = Math.max(glitchTarget, g * g);
    }
    // Rozpad: ręczny narasta przez 16 beatów, składanie trwa 1 beat; w narastaniu dropu = postęp odliczania.
    if (this.shatterOn) this.shatterAmt = Math.min(1, this.shatterAmt + beatDt / 16);
    else this.shatterAmt = Math.max(0, this.shatterAmt - beatDt);
    let shatter = this.shatterAmt;
    if (build?.shatter) {
      if (dp01 < 0.02 && shatter < 0.02 && this.shatterSeed !== this.drop.seed) this.shatterSeed = this.drop.seed;
      shatter = Math.max(shatter, dp01);
    }
    // szybki atak, krótkie wybrzmienie
    this.glitchAmt += (glitchTarget - this.glitchAmt) * (1 - Math.exp(-dt / (glitchTarget > this.glitchAmt ? 0.02 : 0.08)));
    this.blackAmt = lerp(this.blackAmt, this.black ? 1 : 0, 1 - Math.exp(-dt / 0.08));

    const r = this.s.react;
    const rb = this.s.backReact;
    const bd = this.state === 'breakdown';
    const calm = bd ? 0.6 : 1;
    const accel = build?.accel ? 1 + 2.5 * pp : 1;
    const dark = build?.dark ? 1 - 0.85 * pp : 1;
    this.flow += dt * (0.5 + 0.6 * this.bass * r + 1.2 * this.kick * r) * calm * this.s.speed * accel;
    this.flowBack += dt * (0.5 + 0.6 * this.bass * rb + 0.6 * this.kick * rb) * calm * this.s.backSpeed * accel;
    let tr = Math.min(1, this.s.trails * (bd ? 1.15 : 1));
    if (build?.blur) tr = lerp(tr, 1, pp);

    this.frame = {
      t,
      beats: clk.beats,
      kick: this.kick,
      bass: this.bass,
      mid: this.mid,
      high: this.high,
      energy: this.energy,
      depthL: { int: this.s.intensity * (bd ? 0.8 : 1) * dark, react: r, flow: this.flow, col: this.col },
      backL: { int: 0.7, react: rb, flow: this.flowBack, col: this.colBack },
      feedback: tr > 0.01 ? Math.min(0.5 + 0.45 * tr, 0.97) : 0,
      zoom: 0.003 + 0.012 * tr + 0.012 * this.kick * r * tr + (build?.blur ? 0.02 * pp : 0),
      twist: 0.004 * Math.sin(this.flow * 0.05) * tr,
      flow: this.flow,
      flash,
      flashCol: this.col.c1.map((c) => lerp(c, 1, 0.5)),
      black: this.blackAmt,
      grain: 0.035,
      fxaa: this.s.fxaa,
      hiRes: this.s.hiRes,
      glitch: this.glitchAmt > 0.01 ? this.glitchAmt : 0,
      shatter,
      shatterSeed: this.shatterSeed,
      glitchSeed: Math.floor(clk.beats * 2) + (this.kick > 0.9 ? 0.5 : 0), // nowy wzór co ósemkę i na stopę
      a: dp.prev ? { id: dp.prev.id, v: dp.prev.v } : { id: dp.cur.id, v: dp.cur.v },
      b: { id: dp.cur.id, v: dp.cur.v },
      mix: dp.prev ? ease(dp.p) : 1,
      mode: Math.max(0, BLENDS.findIndex(([m]) => m === this.s.blend)),
      bal: this.bal,
      back: { id: bk.cur.id, v: bk.cur.v },
      back2: bk.prev ? { id: bk.prev.id, v: bk.prev.v } : null,
      backMix: ease(bk.p),
      backLevel: this.s.backLevel * dark,
    };
    return this.frame;
  }
}
