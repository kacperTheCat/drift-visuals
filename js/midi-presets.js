// Gotowe układy MIDI dla konkretnych kontrolerów (klucz MIDI -> data-midi elementu panelu).
// Klucz: 'cc:<kanał>:<numer>' albo 'note:<kanał>:<numer>', kanały 1–16; '*' = dowolny kanał.
import { DEPTH } from './scenes.js';

export const PRESETS = {
  // Arturia MiniLab 3 — numery CC odczytane z logu podłączonego egzemplarza:
  // gałki 1–4: CC 86 87 89 90, gałki 5–8: CC 110 111 116 117, fadery: CC 14 15 30 31
  // (port "Minilab3 MIDI"; port MCU/HUI dubluje fadery jako pitch bend — jest ignorowany),
  // pady nuty 36–43 (bank A) i 44–51 (bank B) na kanale 10, klawisze na kanale 1.
  minilab3: {
    name: 'Arturia MiniLab 3',
    match: /minilab\s*3/i,
    // Gałki MiniLab 3 wysyłają pozycję (0–127); na końcu skali powtarzają 0/127.
    modes: (maps) => Object.fromEntries(Object.keys(maps).filter((k) => k.startsWith('cc:')).map((k) => [k, 'abs'])),
    maps: () => {
      const m = {
        // gałki 1–4: głębia
        'cc:*:86': 'intensity',
        'cc:*:87': 'react',
        'cc:*:89': 'speed',
        'cc:*:90': 'trails',
        // gałki 5–8: warstwy + tło
        'cc:*:110': 'balance',
        'cc:*:111': 'backLevel',
        'cc:*:116': 'backReact',
        'cc:*:117': 'backSpeed',
        // fadery: przewijanie scen głębi i teł (fader 3 i 4 wolne)
        'cc:*:14': 'mSceneKnob',
        'cc:*:15': 'mBackKnob',
        // pady, bank A
        'note:10:36': 'aFlash',
        'note:10:37': 'aStrobe',
        'note:10:38': 'aGlitch',
        'note:10:39': 'aVary',
        'note:10:40': 'mPrevBack',
        'note:10:41': 'mNextBack',
        'note:10:42': 'aVaryBack',
        'note:10:43': 'sync',
        // pady, bank B
        'note:10:44': 'aFlash',
        'note:10:45': 'aStrobe',
        'note:10:46': 'aGlitch',
        'note:10:47': 'aVary',
        'note:10:48': 'mNextPal',
        'note:10:49': 'mPrevBack',
        'note:10:50': 'mNextBack',
        'note:10:51': 'sync',
        // przyciski wysyłające CC
        'cc:1:109': 'tap',
        'cc:1:28': 'mNextPalBack',
        'cc:1:105': 'aVaryBack',
        'cc:1:107': 'mNextPalBack',
      };
      // klawisze od C3 (nuta 48): kolejne sceny głębi (dalsze sceny — po przełączeniu oktawy w górę)
      DEPTH.forEach((sc, i) => (m[`note:1:${48 + i}`] = `scene:${sc.id}`));
      return m;
    },
  },
};
