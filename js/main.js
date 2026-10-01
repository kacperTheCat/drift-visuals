import { Director, BLENDS, RANDOM, varyBlocked } from './director.js';
import { Engine } from './engine.js';
import { SCENES, DEPTH, BACK } from './scenes.js';
import { PALETTES } from './palettes.js';
import { bindKeys, SHORTCUTS, DEPTH_KEYS } from './keys.js';
import { Midi, fmtKey, KNOB_MODES } from './midi.js';

const $ = (id) => document.getElementById(id);
const canvas = $('view');
const isOutput = new URLSearchParams(location.search).has('output');

function fatal(msg) {
  const h = $('hint');
  h.hidden = false;
  h.classList.add('error');
  h.textContent = msg;
}

// Licznik klatek: wygładzony czas między klatkami (ms) -> FPS.
class FpsMeter {
  constructor() {
    this.dt = 1000 / 60;
    this.last = 0;
  }
  tick(now) {
    if (this.last) this.dt += (Math.min(now - this.last, 250) - this.dt) * 0.05;
    this.last = now;
  }
  get fps() {
    return 1000 / this.dt;
  }
}

function toggleFullscreen() {
  if (document.fullscreenElement) document.exitFullscreen();
  else document.documentElement.requestFullscreen?.().catch(() => {});
}

if (isOutput) runOutput();
else runControl();

// ---------------------------------------------------------------------------
// Okno wyjścia (projektor): tylko renderuje. Stan i audio żyją w panelu (window.opener),
// ale to TO okno napędza pętlę — więc zasłonięty panel nie spowalnia wizualizacji.
function runOutput() {
  document.body.classList.add('bare', 'output');
  document.title = 'DRIFT — wyjście';
  let engine;
  try {
    engine = new Engine(canvas, { maxDpr: 2 });
  } catch (e) {
    fatal(e.message);
    return;
  }
  const getDir = () => {
    try {
      return window.opener?.DRIFT?.director || null;
    } catch {
      return null;
    }
  };
  bindKeys(window, getDir, { fullscreen: toggleFullscreen });
  const hint = $('hint');
  document.addEventListener('click', () => {
    toggleFullscreen();
    getDir()?.audio.resume();
  });
  let shown = performance.now();
  document.addEventListener('mousemove', () => (shown = performance.now()));

  const meter = new FpsMeter();
  function loop() {
    const d = getDir();
    meter.tick(performance.now());
    if (d) {
      engine.render(d.tick());
      d.outFps = { fps: meter.fps, ms: meter.dt, at: Date.now() };
      const idle = performance.now() - shown > 2500;
      hint.hidden = !!document.fullscreenElement || idle;
      hint.textContent = 'Przeciągnij to okno na projektor i kliknij — pełny ekran';
      document.body.classList.toggle('nocursor', idle);
    } else {
      hint.hidden = false;
      hint.textContent = 'Brak połączenia z panelem — otwórz okno wyjścia z panelu (O)';
    }
    requestAnimationFrame(loop);
  }
  loop();
}

// ---------------------------------------------------------------------------
function runControl() {
  const d = new Director();
  window.DRIFT = { director: d };

  let engine;
  try {
    engine = new Engine(canvas);
  } catch (e) {
    fatal(e.message);
    return;
  }
  const brokenScenes = Object.keys(engine.errors);

  let outWin = null;
  // Układ ekranów (Window Management API w Chrome): okno wyjścia otwiera się od razu
  // na drugim ekranie (projektorze). Za pierwszym razem Chrome pyta o zgodę.
  let screens = null;
  const loadScreens = async () => {
    try {
      screens = await window.getScreenDetails();
    } catch {}
  };
  if ('getScreenDetails' in window) {
    navigator.permissions
      ?.query({ name: 'window-management' })
      .then((p) => p.state === 'granted' && loadScreens())
      .catch(() => {});
  }
  const openOutput = () => {
    if (outWin && !outWin.closed) {
      outWin.focus();
      return;
    }
    const ext = screens?.screens.find((s) => s !== screens.currentScreen);
    const place = ext
      ? `left=${ext.availLeft},top=${ext.availTop},width=${ext.availWidth},height=${ext.availHeight}`
      : 'width=1280,height=720';
    outWin = window.open('?output=1', 'drift-output', `popup,${place}`);
    d.log(ext ? `Okno wyjścia na ekranie: ${ext.label || 'drugi ekran'}` : 'Okno wyjścia otwarte');
    // Zgodę prosimy dopiero po otwarciu okna, żeby przeglądarka nie zablokowała popupu.
    if (!screens && 'getScreenDetails' in window) loadScreens();
  };
  const hide = () => document.body.classList.toggle('bare');
  const full = () => {
    if (!document.fullscreenElement) document.body.classList.add('bare');
    toggleFullscreen();
  };
  document.addEventListener('fullscreenchange', () => {
    if (!document.fullscreenElement) document.body.classList.remove('bare');
  });
  document.addEventListener('keydown', (e) => {
    if (e.code === 'Escape') document.body.classList.remove('bare');
  });
  bindKeys(window, () => d, { fullscreen: full, hide, output: openOutput });
  document.addEventListener('pointerdown', () => d.audio.resume());

  // --- źródło dźwięku ---
  const sel = $('device');
  async function refreshDevices() {
    let list = [];
    try {
      list = await d.audio.devices();
    } catch {}
    sel.innerHTML = '';
    sel.append(new Option('Demo — bez dźwięku (zegar BPM)', 'demo'));
    // Bez zgody na mikrofon przeglądarka nie podaje nazw urządzeń — wybór pozycji poprosi o zgodę.
    list.forEach((dev, i) =>
      sel.append(new Option(dev.label || `Mikrofon / wejście audio ${list.length > 1 ? i + 1 : ''} (poprosi o zgodę)`, dev.deviceId)),
    );
    if (d.source === 'file') sel.append(new Option(`▶ ${d.audio.label}`, '__playing'));
    sel.append(new Option('Plik audio… (do prób w domu)', '__file'));
    if (d.source === 'demo') sel.value = 'demo';
    else if (d.source === 'file') sel.value = '__playing';
    else if (d.source === 'input') sel.value = d.s.deviceId || list[0]?.deviceId || 'demo';
    if (!sel.value) sel.value = 'demo';
  }
  navigator.mediaDevices?.addEventListener?.('devicechange', refreshDevices);
  refreshDevices();

  // Wybór z listy od razu przełącza źródło (to też "akcja użytkownika", więc przeglądarka
  // pozwala uruchomić dźwięk i zapytać o mikrofon).
  sel.addEventListener('change', async () => {
    const v = sel.value;
    sel.blur();
    if (v === '__playing') return;
    if (v === '__file') {
      $('file').click();
      refreshDevices(); // lista wraca do bieżącego źródła, dopóki nie wybierzesz pliku
      return;
    }
    if (v === 'demo') d.useDemo();
    else {
      try {
        await d.useInput(v);
      } catch (e) {
        d.log(`Błąd wejścia: ${e.message}`);
      }
    }
    refreshDevices();
  });
  $('file').addEventListener('change', (e) => {
    const f = e.target.files[0];
    if (f) d.useFile(f);
    e.target.value = '';
    refreshDevices();
  });
  // Ostatnio używane wejście — spróbuj podłączyć od razu (uprawnienie jest zapamiętane dla localhost).
  if (d.s.deviceId) d.useInput(d.s.deviceId).then(refreshDevices).catch(() => {});

  // --- tempo ---
  const bpmIn = $('bpm');
  bpmIn.addEventListener('focus', () => bpmIn.select());
  bpmIn.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      const v = parseFloat(bpmIn.value.replace(',', '.'));
      if (isFinite(v)) d.setBpm(v);
      bpmIn.blur();
    } else if (e.key === 'Escape') bpmIn.blur();
  });
  $('tap').addEventListener('click', () => d.tap());
  $('sync').addEventListener('click', () => d.syncPhrase());
  $('bpmAuto').addEventListener('click', () => d.set('bpmAuto', !d.s.bpmAuto));

  // --- sceny ---
  const sceneBtns = {};
  const MOOD = { drive: 'groove', calm: 'breakdown', both: 'oba' };
  const addSceneBtn = (sc, i, box, onPick) => {
    const b = document.createElement('button');
    b.className = 'scene';
    b.dataset.mood = sc.mood;
    b.title = `${sc.name} — ${MOOD[sc.mood]}`;
    b.innerHTML = `${i !== null && DEPTH_KEYS[i] ? `<kbd>${DEPTH_KEYS[i][1]}</kbd>` : ''}<span class="nm">${sc.name}</span><span class="mood ${sc.mood}">${MOOD[sc.mood]}</span><span class="pool" title="Kliknij: w puli autopilota / poza pulą">●</span>`;
    if (brokenScenes.includes(sc.id)) {
      b.classList.add('broken');
      b.title = engine.errors[sc.id];
    }
    b.addEventListener('click', (e) => {
      if (e.target.classList.contains('pool')) d.togglePool(sc.id);
      else onPick(e);
    });
    $(box).append(b);
    sceneBtns[sc.id] = b;
  };
  DEPTH.forEach((sc, i) => addSceneBtn(sc, i, 'scenes', (e) => d.setScene(sc.id, e.shiftKey ? 'cut' : null)));
  BACK.forEach((sc) => addSceneBtn(sc, null, 'backs', (e) => d.setBack(sc.id, e.shiftKey ? 0 : 8)));
  $('aDepth').addEventListener('click', () => d.toggleDepth());
  $('autoBack').addEventListener('change', (e) => d.set('autoBack', e.target.checked));

  // --- warstwy ---
  const bal = $('balance');
  bal.addEventListener('input', () => d.setBalance(bal.value / 1000));
  bal.addEventListener('dblclick', () => d.setBalance(0.5));
  $('blend').innerHTML = BLENDS.map(([m, label], i) => `<button data-v="${m}" title="M">${label}</button>`).join('');
  $('autoBlend').addEventListener('change', (e) => d.set('autoBlend', e.target.checked));
  $('qFxaa').addEventListener('click', () => d.set('fxaa', !d.s.fxaa));
  $('qHiRes').addEventListener('click', () => d.set('hiRes', !d.s.hiRes));

  // --- palety ---
  const palRow = (box, layer) =>
    PALETTES.map((p, i) => {
      const b = document.createElement('button');
      b.className = 'pal';
      b.title = p.name;
      b.style.background = `linear-gradient(135deg, ${p.hex.c2}, ${p.hex.c1})`;
      b.innerHTML = `<span>${p.name}</span>`;
      b.addEventListener('click', () => d.setPalette(i, layer));
      $(box).append(b);
      return b;
    });
  const palBtns = palRow('pals', 'depth');
  const palBackBtns = palRow('palsBack', 'back');
  $('linkPal').addEventListener('change', (e) => d.set('linkPalettes', e.target.checked));

  // --- segmenty / suwaki / akcje ---
  const segs = [
    ['phrase', (v) => +v],
    ['trans', (v) => v, 'transition'],
    ['blend', (v) => v, 'blend'],
  ];
  for (const [id, conv, key = id] of segs) {
    $(id).addEventListener('click', (e) => {
      const v = e.target.closest('button')?.dataset.v;
      if (v) d.set(key, conv(v));
    });
  }
  const sliders = ['intensity', 'react', 'speed', 'trails', 'backLevel', 'backReact', 'backSpeed'];
  for (const k of sliders) $(k).addEventListener('input', (e) => d.set(k, e.target.value / 100));
  $('auto').addEventListener('click', () => d.toggleAutopilot());
  $('autoPal').addEventListener('change', (e) => d.set('autoPalette', e.target.checked));
  $('aVary').addEventListener('click', () => d.vary());
  $('aVaryBack').addEventListener('click', () => d.vary(1, 'back'));
  $('aFlash').addEventListener('click', () => d.hit());
  // Strobo i Glitch działają, póki trzymasz przycisk.
  const holdBtn = (el, prop) => {
    el.addEventListener('pointerdown', () => (d[prop] = true));
    for (const ev of ['pointerup', 'pointerleave']) el.addEventListener(ev, () => (d[prop] = false));
    el.dataset.hold = '';
  };
  const strobe = $('aStrobe');
  holdBtn(strobe, 'strobe');
  holdBtn($('aGlitch'), 'glitch');
  $('aShatter').addEventListener('click', () => d.toggleShatter());
  $('aBlack').addEventListener('click', () => d.toggleBlack());
  $('aOutput').addEventListener('click', openOutput);
  $('aFull').addEventListener('click', full);

  $('keysBtn').addEventListener('click', () => {
    document.body.classList.toggle('showkeys');
    $('keysBtn').classList.toggle('on', document.body.classList.contains('showkeys'));
  });
  $('shortcuts').innerHTML = SHORTCUTS.map(([k, v]) => `<span><kbd>${k}</kbd> ${v}</span>`).join('');

  // --- ręczny drop ---
  $('dropIn').addEventListener('click', (e) => {
    const v = e.target.closest('button')?.dataset.v;
    if (v) d.armDrop(+v);
  });
  for (const [id, group] of [['dropBuild', 'build'], ['dropHit', 'hit']])
    $(id).addEventListener('click', (e) => {
      const v = e.target.closest('button')?.dataset.v;
      if (v) d.toggleDropOpt(group, v);
    });

  // --- program dropu: co wejdzie w momencie dropu ---
  const opt = (v, t) => `<option value="${v}">${t}</option>`;
  const progSel = {
    scene: [$('dpScene'), opt(RANDOM, '🎲 losowa') + DEPTH.map((s) => opt(s.id, s.name)).join('')],
    back: [$('dpBack'), opt(RANDOM, '🎲 losowe') + BACK.map((s) => opt(s.id, s.name)).join('')],
    pal: [$('dpPal'), opt(RANDOM, '🎲 losowe') + PALETTES.map((p, i) => opt(i, p.name)).join('')],
    palBack: [$('dpPalBack'), opt(RANDOM, '🎲 losowe') + PALETTES.map((p, i) => opt(i, p.name)).join('')],
  };
  for (const [key, [el, html]] of Object.entries(progSel)) {
    el.innerHTML = html;
    el.addEventListener('change', () => {
      d.setDropProg(key, el.value);
      el.blur();
    });
  }
  // Pole bez programu pokazuje to, co gra teraz; zaprogramowane — wybraną wartość (podświetlone).
  function updateDropProg() {
    const current = { scene: d.dp.cur.id, back: d.bk.cur.id, pal: d.s.palette, palBack: d.backPaletteIndex };
    for (const [key, [el]] of Object.entries(progSel)) {
      if (document.activeElement === el) continue;
      const v = d.dropProg[key];
      const show = String(v ?? current[key]);
      if (el.value !== show) el.value = show;
      el.classList.toggle('prog', v !== null);
    }
  }

  // --- dodatkowe akcje MIDI (widoczne w trybie learn) ---
  $('mPrevScene').addEventListener('click', () => d.stepScene(-1));
  $('mNextScene').addEventListener('click', () => d.stepScene(1));
  $('mPrevBack').addEventListener('click', () => d.stepScene(-1, 'back'));
  $('mNextBack').addEventListener('click', () => d.stepScene(1, 'back'));
  $('mNextBlend').addEventListener('click', () => d.nextBlend());
  $('mBalCenter').addEventListener('click', () => d.setBalance(0.5));
  $('mNextPal').addEventListener('click', () => d.nextPalette(1, 'depth'));
  $('mNextPalBack').addEventListener('click', () => d.nextPalette(1, 'back'));
  // Gałka przewija listę scen — zmiana tylko, gdy wskazuje inną scenę.
  const knob = (id, list, apply) =>
    $(id).addEventListener('input', (e) => {
      const sc = list[Math.min(list.length - 1, Math.floor((e.target.value / 128) * list.length))];
      if (sc) apply(sc.id);
    });
  knob('mSceneKnob', DEPTH, (id) => id !== d.current && d.setScene(id));
  knob('mBackKnob', BACK, (id) => id !== d.bk.cur.id && d.setBack(id));

  // --- MIDI: oznacz elementy, które można przypisać ---
  const tag = (el, key) => el && !el.dataset.midi && (el.dataset.midi = key);
  for (const [id, b] of Object.entries(sceneBtns)) tag(b, `scene:${id}`);
  palBtns.forEach((b, i) => tag(b, `pal:depth:${i}`));
  palBackBtns.forEach((b, i) => tag(b, `pal:back:${i}`));
  for (const seg of ['blend', 'phrase', 'trans', 'dropIn', 'dropBuild', 'dropHit'])
    for (const b of $(seg).querySelectorAll('button')) tag(b, `${seg}:${b.dataset.v}`);
  for (const id of ['tap', 'sync', 'bpmAuto', 'auto', 'aVary', 'aVaryBack', 'aFlash', 'aStrobe', 'aGlitch', 'aShatter', 'aBlack', 'aDepth',
    'autoPal', 'autoBlend', 'autoBack', 'linkPal', 'mPrevScene', 'mNextScene', 'mPrevBack', 'mNextBack',
    'mNextBlend', 'mBalCenter', 'mNextPal', 'mNextPalBack'])
    tag($(id), id);
  document.querySelectorAll('main input[type=range]').forEach((el) => tag(el, el.id));

  const midi = new Midi(d, (msg, names) => {
    setText($('midiStatus'), msg);
    $('midiStatus').title = names.join('\n');
  });
  window.DRIFT.midi = midi;
  const midiOn = async () => {
    try {
      await midi.enable();
      $('midiBtn').classList.add('on');
      $('learnBtn').hidden = false;
      $('mapBtn').hidden = false;
    } catch (e) {
      setText($('midiStatus'), `MIDI niedostępne: ${e.message}`);
    }
  };
  if (!midi.supported) $('midiBtn').disabled = true;
  else if (midi.wasEnabled) midiOn();
  $('midiBtn').addEventListener('click', () => !midi.access && midiOn());
  $('learnBtn').addEventListener('click', () => {
    midi.setLearning(!midi.learning);
    $('learnBtn').classList.toggle('on', midi.learning);
  });
  $('mPresetMinilab').addEventListener('click', () => midi.loadPreset('minilab3'));
  $('mClearMidi').addEventListener('click', () => confirm('Usunąć wszystkie przypisania MIDI?') && midi.clearAll());
  document.addEventListener('keydown', (e) => {
    if (e.code !== 'Escape') return;
    if (!mm.hidden) closeMap();
    else if (midi.learning) {
      midi.setLearning(false);
      $('learnBtn').classList.remove('on');
    }
  });

  // --- okno mapowania MIDI: lista przypisań, podgląd na żywo, wybór akcji i trybu gałki ---
  const mm = $('midiMap');
  const mmBody = $('mmBody');
  const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  let rows = {}; // klucz przypisania -> wiersz tabeli
  const targetOptions = () => {
    const groups = {};
    for (const t of midi.targets()) (groups[t.group] ??= []).push(t);
    return (
      '<option value="">— brak akcji —</option>' +
      Object.entries(groups)
        .map(([g, list]) => `<optgroup label="${esc(g)}">${list.map((t) => `<option value="${esc(t.id)}">${esc(t.label)}</option>`).join('')}</optgroup>`)
        .join('')
    );
  };
  const order = (k) => {
    const [kind, , num] = k.split(':');
    return ({ cc: 0, pb: 1, note: 2 })[kind] * 1000 + +num;
  };
  function renderMap() {
    const opts = targetOptions();
    const modeOpts = KNOB_MODES.map(([v, l]) => `<option value="${v}">${l}</option>`).join('');
    rows = {};
    mmBody.innerHTML = '';
    const keys = Object.keys(midi.maps).sort((a, b) => order(a) - order(b));
    if (!keys.length) mmBody.innerHTML = '<tr class="mm-none"><td colspan="6">Brak przypisań. Kliknij „Dodaj” i rusz kontrolką.</td></tr>';
    for (const key of keys) {
      const [kind, ch] = key.split(':');
      const tr = document.createElement('tr');
      tr.innerHTML =
        `<td>${fmtKey(key)} <span class="muted">${ch === '*' ? 'każdy kanał' : `kanał ${ch}`}</span></td>` +
        `<td><span class="mm-val"><b></b></span></td>` +
        `<td><select class="mm-target">${opts}</select></td>` +
        `<td>${kind === 'note' ? '<span class="muted">przycisk</span>' : `<select class="mm-mode">${modeOpts}</select>`}</td>` +
        `<td class="mm-res"></td>` +
        `<td><button class="mm-del" title="Usuń przypisanie">✕</button></td>`;
      const tsel = tr.querySelector('.mm-target');
      tsel.value = midi.maps[key] || '';
      tsel.addEventListener('change', () => midi.setMap(key, tsel.value));
      const msel = tr.querySelector('.mm-mode');
      if (msel) {
        msel.value = midi.modes[key] || 'auto';
        msel.addEventListener('change', () => midi.setMode(key, msel.value));
      }
      tr.querySelector('.mm-del').addEventListener('click', () => {
        midi.removeMap(key);
        renderMap();
      });
      mmBody.append(tr);
      rows[key] = tr;
    }
    setText($('mmInfo'), midi.access ? midi.inputs.map((i) => i.name).join(', ') || 'brak urządzeń MIDI' : 'MIDI wyłączone — kliknij „MIDI” w górnym pasku');
  }
  midi.onActivity = (key, mapKey, value, target, result) => {
    if (mm.hidden) return;
    const tr = mapKey && rows[mapKey];
    if (!tr) {
      setText($('mmInfo'), `${fmtKey(key)} nie jest przypisane — kliknij „Dodaj” i rusz nią jeszcze raz`);
      return;
    }
    tr.querySelector('.mm-val b').style.width = `${(value / 127) * 100}%`;
    tr.querySelector('.mm-res').textContent = result || (target ? '' : 'brak akcji');
    tr.classList.toggle('warn', !target || /brak/.test(result || ''));
    tr.classList.add('hit');
    clearTimeout(tr.hitT);
    tr.hitT = setTimeout(() => tr.classList.remove('hit'), 200);
  };
  const addBtn = $('mmAdd');
  const resetAdd = () => {
    addBtn.textContent = '+ Dodaj: rusz kontrolką';
    addBtn.classList.remove('on');
  };
  addBtn.addEventListener('click', () => {
    if (midi.waitNext) {
      midi.waitNext = null;
      return resetAdd();
    }
    addBtn.textContent = 'Czekam… rusz gałką albo naciśnij pad (klik = anuluj)';
    addBtn.classList.add('on');
    midi.waitNext = (key) => {
      resetAdd();
      const existing = midi.mapKeyFor(key);
      if (!existing) midi.setMap(key, '');
      renderMap();
      const tr = rows[existing || key];
      tr?.scrollIntoView({ block: 'nearest' });
      tr?.querySelector('.mm-target').focus();
      tr?.classList.add('hit');
    };
  });
  const openMap = () => {
    mm.hidden = false;
    renderMap();
  };
  function closeMap() {
    mm.hidden = true;
    midi.waitNext = null;
    resetAdd();
  }
  $('mapBtn').addEventListener('click', openMap);
  $('mmClose').addEventListener('click', closeMap);
  mm.addEventListener('click', (e) => e.target === mm && closeMap());
  $('mmPreset').addEventListener('click', () => {
    midi.loadPreset('minilab3');
    renderMap();
  });
  $('mmClear').addEventListener('click', () => {
    if (confirm('Usunąć wszystkie przypisania MIDI?')) {
      midi.clearAll();
      renderMap();
    }
  });
  let uiFrame = 0;

  // --- odświeżanie panelu ---
  const dots = [...$('dots').children];
  const meters = { mSub: 'sub', mLow: 'low', mMid: 'mid', mHigh: 'high', mEnergy: 'energy' };
  const name = (id) => SCENES.find((s) => s.id === id)?.name || id;
  let lastPal = -1;
  let lastPalBack = -1;
  let lastEvents = null;

  function setText(el, txt) {
    if (el.textContent !== txt) el.textContent = txt;
  }

  const dropBar = $('dropProg').parentElement;
  function updateDrop(f) {
    const p = d.dropProgress;
    const dr = d.drop;
    $('dropProg').style.transform = `scaleX(${(p ?? 0).toFixed(3)})`;
    dropBar.classList.toggle('armed', !!dr);
    let label = 'nieuzbrojony';
    if (dr) {
      const left = Math.max(0, dr.at - f.beats);
      const bars = Math.floor(left / 4);
      const beats = Math.ceil(left % 4);
      label = `DROP za ${bars > 0 ? `${bars} t. ` : ''}${beats} b.`;
    }
    setText($('dropLabel'), label);
    for (const b of $('dropIn').children) b.classList.toggle('on', !!dr && +b.dataset.v === dr.bars);
    for (const b of $('dropBuild').querySelectorAll('button')) b.classList.toggle('on', !!d.s.dropBuild[b.dataset.v]);
    for (const b of $('dropHit').querySelectorAll('button')) b.classList.toggle('on', !!d.s.dropHit[b.dataset.v]);
  }

  function updateUI(f) {
    updateDrop(f);
    updateDropProg();
    if (midi.access && ++uiFrame % 30 === 0) midi.status(); // odświeża m.in. wskaźnik CLOCK
    if (document.activeElement !== bpmIn) bpmIn.value = d.clock.bpm.toFixed(1);
    const beat = Math.floor(f.beats) % 4;
    dots.forEach((el, i) => el.classList.toggle('on', i === beat));
    $('bpmAuto').classList.toggle('on', d.s.bpmAuto);

    const st = $('state');
    setText(st, d.state === 'breakdown' ? 'BREAKDOWN' : 'GROOVE');
    st.classList.toggle('bd', d.state === 'breakdown');

    const vals = { sub: d.an.out.sub, low: d.an.out.low, mid: f.mid, high: f.high, energy: f.energy };
    if (d.source === 'demo') Object.assign(vals, { sub: d.demo.out.sub, low: d.demo.out.low });
    for (const [id, k] of Object.entries(meters)) $(id).style.transform = `scaleY(${Math.min(1, vals[k]).toFixed(3)})`;
    $('kick').style.opacity = (0.15 + 0.85 * f.kick).toFixed(2);

    let status = '';
    if (d.source === 'demo') status = 'demo';
    else {
      status = d.audio.label;
      if (d.audio.ctx?.state === 'suspended') status += ' · kliknij, by uruchomić audio';
      else if (d.level < -90) status += ' · brak sygnału?';
    }
    setText($('srcStatus'), status);
    $('srcStatus').title = status;

    const ph = d.s.phrase;
    $('phraseProg').style.transform = `scaleX(${(((f.beats / 4) % ph) / ph).toFixed(3)})`;
    $('auto').classList.toggle('on', d.s.autopilot);
    $('autoPal').checked = d.s.autoPalette;
    for (const [id, key] of [['phrase', 'phrase'], ['trans', 'transition'], ['blend', 'blend']])
      for (const b of $(id).children) b.classList.toggle('on', b.dataset.v === String(d.s[key]));
    for (const k of sliders) if (document.activeElement !== $(k)) $(k).value = Math.round(d.s[k] * 100);
    $('aBlack').classList.toggle('on', d.black);
    strobe.classList.toggle('on', d.strobe);
    $('aGlitch').classList.toggle('on', d.glitch);
    $('aShatter').classList.toggle('on', d.shatterOn);
    $('qFxaa').classList.toggle('on', d.s.fxaa);
    $('qHiRes').classList.toggle('on', d.s.hiRes);
    // Wariacja wyszarzona, gdy nic by nie zmieniła (scena bez wariacji albo warstwa niewidoczna).
    for (const [id, layer, key] of [['aVary', 'depth', 'V'], ['aVaryBack', 'back', '⇧V']]) {
      const why = varyBlocked(d, layer);
      const el = $(id);
      el.disabled = !!why;
      el.title = why ? `Wariacja niedostępna: ${why}` : `Nowe parametry bieżącej sceny (${key})`;
    }

    for (const sc of BACK) {
      const b = sceneBtns[sc.id];
      b.classList.toggle('active', sc.id === d.bk.cur.id);
      b.classList.toggle('leaving', sc.id === d.bk.prev?.id);
      b.classList.toggle('off', !d.s.pool[sc.id]);
    }
    $('aDepth').classList.toggle('on', d.depthOn);
    $('autoBack').checked = d.s.autoBack;
    for (const sc of DEPTH) {
      const b = sceneBtns[sc.id];
      b.classList.toggle('active', sc.id === d.current);
      b.classList.toggle('leaving', sc.id === d.dp.prev?.id);
      b.classList.toggle('off', !d.s.pool[sc.id]);
    }
    if (document.activeElement !== bal) bal.value = Math.round(d.s.balance * 1000);
    $('autoBlend').checked = d.s.autoBlend;
    if (lastPal !== d.s.palette) {
      lastPal = d.s.palette;
      palBtns.forEach((b, i) => b.classList.toggle('on', i === lastPal));
      const p = PALETTES[lastPal].hex;
      document.documentElement.style.setProperty('--accent', p.c1);
    }
    const pb = d.backPaletteIndex;
    if (lastPalBack !== pb) {
      lastPalBack = pb;
      palBackBtns.forEach((b, i) => b.classList.toggle('on', i === pb));
    }
    $('linkPal').checked = d.s.linkPalettes;
    $('palsBack').classList.toggle('linked', d.s.linkPalettes);

    const blendName = BLENDS.find(([m]) => m === d.s.blend)[1];
    const dname = d.dp.prev ? `${name(d.dp.prev.id)} → ${name(d.dp.cur.id)}` : name(d.dp.cur.id);
    const ov = f.bal < 0.01 ? '— tylko tło' : `${dname} · ${blendName}`;
    setText($('overlay'), `${ov}  ·  tło: ${name(d.bk.cur.id)}`);
    if (lastEvents !== d.events[0]) {
      lastEvents = d.events[0];
      $('events').innerHTML = d.events.map((e) => `<li>${e.msg}</li>`).join('');
    }
  }

  const meter = new FpsMeter();
  const fpsEl = $('fps');
  let fpsShown = 0;
  function updateFps(now) {
    meter.tick(now);
    if (now - fpsShown < 500) return; // odświeżanie 2× na sekundę, żeby dało się przeczytać
    fpsShown = now;
    const out = d.outFps && Date.now() - d.outFps.at < 1500 ? d.outFps : null;
    const m = out || { fps: meter.fps, ms: meter.dt };
    fpsEl.textContent = `${out ? 'WYJŚCIE ' : ''}${Math.round(m.fps)} fps · ${m.ms.toFixed(1)} ms`;
    fpsEl.classList.toggle('mid', m.fps < 55 && m.fps >= 40);
    fpsEl.classList.toggle('low', m.fps < 40);
  }

  function loop() {
    updateFps(performance.now());
    const f = d.tick();
    // Gdy okno wyjścia jest otwarte, podgląd renderujemy w niższej rozdzielczości.
    engine.scale = outWin && !outWin.closed ? 0.5 : 1;
    engine.render(f);
    updateUI(f);
    requestAnimationFrame(loop);
  }
  loop();
}
