// Wejście audio, analiza pasm (z automatycznym wzmocnieniem), detekcja stopy, zegar BPM.

export class AudioIn {
  constructor() {
    this.ctx = null;
    this.analyser = null;
    this.src = null;
    this.stream = null;
    this.el = null;
    this.kind = 'none';
    this.label = '';
  }

  ensureCtx() {
    if (!this.ctx) {
      this.ctx = new AudioContext({ latencyHint: 'interactive' });
      const a = this.ctx.createAnalyser();
      a.fftSize = 2048;
      a.smoothingTimeConstant = 0;
      a.minDecibels = -110;
      a.maxDecibels = -10;
      this.analyser = a;
      this.freq = new Float32Array(a.frequencyBinCount);
    }
    this.resume();
    return this.ctx;
  }

  resume() {
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
  }

  async devices() {
    const list = await navigator.mediaDevices.enumerateDevices();
    return list.filter((d) => d.kind === 'audioinput');
  }

  stop() {
    if (this.src) this.src.disconnect();
    if (this.stream) this.stream.getTracks().forEach((t) => t.stop());
    if (this.el) {
      this.el.pause();
      URL.revokeObjectURL(this.el.src);
    }
    this.src = this.stream = this.el = null;
    this.kind = 'none';
    this.label = '';
  }

  async useDevice(deviceId) {
    this.ensureCtx();
    // Wyłączone przetwarzanie "rozmowowe" — inaczej przeglądarka tłumi bas i pompuje głośność.
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        deviceId: deviceId ? { exact: deviceId } : undefined,
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
      },
    });
    this.stop();
    this.stream = stream;
    this.src = this.ctx.createMediaStreamSource(stream);
    this.src.connect(this.analyser);
    this.kind = 'input';
    this.label = stream.getAudioTracks()[0]?.label || 'wejście audio';
  }

  useFile(file) {
    this.ensureCtx();
    this.stop();
    const el = new Audio();
    el.src = URL.createObjectURL(file);
    el.loop = true;
    this.el = el;
    this.src = this.ctx.createMediaElementSource(el);
    this.src.connect(this.analyser);
    this.src.connect(this.ctx.destination);
    el.play();
    this.kind = 'file';
    this.label = file.name;
  }

  read() {
    if (!this.analyser || this.kind === 'none') return null;
    this.analyser.getFloatFrequencyData(this.freq);
    return this.freq;
  }

  get binHz() {
    return this.ctx.sampleRate / this.analyser.fftSize;
  }
}

const BANDS = [
  ['sub', 35, 110],
  ['low', 110, 350],
  ['mid', 350, 2500],
  ['high', 5000, 14000],
];
const FLOOR = Math.pow(10, -75 / 20);

// Każde pasmo jest normalizowane do własnego, wolno opadającego szczytu (AGC),
// więc poziom wejścia (mikrofon / line-in / plik) nie ma dużego znaczenia.
export class Analysis {
  constructor() {
    this.reset();
  }

  reset() {
    this.peak = {};
    this.v = {};
    for (const [k] of BANDS) {
      this.peak[k] = FLOOR;
      this.v[k] = 0;
    }
    this.subHist = [0, 0, 0];
    this.flux = [];
    this.lastOnset = -1;
    this.loud = 0;
    this.loudMax = 1e-4;
    this.out = { sub: 0, low: 0, mid: 0, high: 0, energy: 0, onset: false, level: -120 };
  }

  update(freq, binHz, dt, t) {
    const o = this.out;
    let loudRaw = 0;
    let subN = 0;
    for (const [k, lo, hi] of BANDS) {
      const a = Math.max(1, Math.floor(lo / binHz));
      const b = Math.min(freq.length - 1, Math.ceil(hi / binHz));
      let s = 0;
      for (let i = a; i <= b; i++) {
        const db = freq[i];
        if (db > -160) s += Math.pow(10, db / 20);
      }
      const raw = s / (b - a + 1);
      loudRaw += raw;
      this.peak[k] = Math.max(raw, this.peak[k] * Math.pow(0.5, dt / 6), FLOOR);
      const n = Math.min(1, raw / this.peak[k]);
      if (k === 'sub') subN = n;
      const x = n * n;
      const cur = this.v[k];
      const tc = x > cur ? 0.015 : 0.15;
      this.v[k] = cur + (x - cur) * (1 - Math.exp(-dt / tc));
      o[k] = this.v[k];
    }

    // Stopa = nagły wzrost w paśmie sub względem ostatnich klatek, powyżej adaptacyjnego progu.
    const flux = Math.max(0, subN - Math.min(...this.subHist));
    this.subHist.shift();
    this.subHist.push(subN);
    this.flux.push(flux);
    if (this.flux.length > 90) this.flux.shift();
    let mean = 0;
    for (const v of this.flux) mean += v;
    mean /= this.flux.length;
    let vr = 0;
    for (const v of this.flux) vr += (v - mean) ** 2;
    const std = Math.sqrt(vr / this.flux.length);
    o.onset = flux > mean + 1.5 * std + 0.08 && subN > 0.5 && t - this.lastOnset > 0.27;
    if (o.onset) this.lastOnset = t;

    this.loud += (loudRaw - this.loud) * (1 - Math.exp(-dt / 1.0));
    this.loudMax = Math.max(this.loud, this.loudMax * Math.pow(0.5, dt / 40), 1e-4);
    o.energy = Math.min(1, this.loud / this.loudMax);
    o.level = 20 * Math.log10(loudRaw / BANDS.length + 1e-9);
    return o;
  }
}

// Zegar: płynie sam w ustalonym BPM, a detekcja stopy dociąga fazę (PLL) i tempo.
export class Clock {
  constructor() {
    this.bpm = 128;
    this.beats = 0;
    this.on = [];
    this.taps = [];
  }

  advance(dt) {
    this.beats += (dt * this.bpm) / 60;
  }

  onset(t, auto) {
    const e = this.beats - Math.round(this.beats);
    if (Math.abs(e) < 0.3) this.beats -= e * 0.2;
    this.on.push(t);
    while (this.on.length && t - this.on[0] > 10) this.on.shift();
    if (auto && this.on.length >= 6) this.estimate();
  }

  estimate() {
    // Histogram odstępów między stopami, zawinięty do 90–180 BPM.
    const H = new Float32Array(181);
    const o = this.on;
    for (let i = 1; i < o.length; i++) {
      let b = 60 / (o[i] - o[i - 1]);
      if (!isFinite(b) || b <= 0) continue;
      while (b < 90) b *= 2;
      while (b >= 180) b /= 2;
      const x = (b - 90) * 2;
      const xi = Math.round(x);
      for (let k = -3; k <= 3; k++) {
        const n = xi + k;
        if (n >= 0 && n <= 180) H[n] += Math.exp(-((n - x) ** 2) / 2);
      }
    }
    let best = 0;
    for (let n = 1; n <= 180; n++) if (H[n] > H[best]) best = n;
    if (H[best] < 2) return;
    let s = 0;
    let w = 0;
    for (let k = -2; k <= 2; k++) {
      const n = best + k;
      if (n < 0 || n > 180) continue;
      s += H[n] * (90 + n / 2);
      w += H[n];
    }
    const coarse = s / w;
    // Doprecyzowanie: regresja czasów stóp względem numeru beatu — uśrednia kwantyzację do klatek.
    const per = 60 / coarse;
    let n = 0, sk = 0, st = 0, skk = 0, skt = 0;
    for (const t of o) {
      const k = Math.round((t - o[0]) / per);
      if (Math.abs((t - o[0]) / per - k) > 0.25) continue;
      n++; sk += k; st += t; skk += k * k; skt += k * t;
    }
    const den = n * skk - sk * sk;
    const slope = den > 0 ? (n * skt - sk * st) / den : per;
    const est = n >= 6 && Math.abs(slope / per - 1) < 0.03 ? 60 / slope : coarse;
    const diff = est - this.bpm;
    this.bpm += diff * (Math.abs(diff) > 4 ? 0.5 : 0.15);
  }

  tap(t) {
    if (this.taps.length && t - this.taps[this.taps.length - 1] > 2) this.taps = [];
    this.taps.push(t);
    if (this.taps.length > 8) this.taps.shift();
    const n = this.taps.length;
    if (n >= 3) this.bpm = (60 * (n - 1)) / (this.taps[n - 1] - this.taps[0]);
    this.beats = Math.round(this.beats);
  }

  // Ustawia "teraz" jako początek frazy (16 taktów = 64 beaty).
  alignPhrase(offset = 0) {
    this.beats = Math.ceil((this.beats - offset - 2) / 64) * 64 + offset;
  }
}

// Syntetyczny sygnał, gdy nie ma dźwięku: stopa na każdy beat, hi-haty na offbeat,
// breakdown przez 16 taktów co 64 takty — żeby było widać działanie autopilota.
export class Demo {
  constructor() {
    this.b = 0;
    this.bpm = 128;
    this.out = { sub: 0, low: 0, mid: 0, high: 0, energy: 0, onset: false, level: -20 };
  }

  update(dt) {
    const prev = this.b;
    this.b += (dt * this.bpm) / 60;
    const b = this.b;
    const breakdown = Math.floor(b / 4) % 64 >= 48;
    const ph = b % 1;
    const kick = breakdown ? 0 : Math.exp(-ph * 6);
    const o = this.out;
    o.onset = !breakdown && Math.floor(b) !== Math.floor(prev);
    o.sub = breakdown ? 0.25 + 0.1 * Math.sin(b * 0.5) : 0.15 + 0.85 * kick;
    o.low = 0.8 * Math.exp(-((ph + 0.5) % 1) * 5);
    o.mid = 0.3 + 0.2 * Math.sin(b * 0.25);
    o.high = 0.6 * Math.exp(-((b * 2 + 1) % 2) * 6);
    o.energy = breakdown ? 0.45 : 0.85;
    return o;
  }
}
