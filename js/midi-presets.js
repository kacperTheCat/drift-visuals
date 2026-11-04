// Ready-made MIDI layouts for specific controllers (MIDI key -> data-midi of a panel element).
// Key: 'cc:<channel>:<number>' or 'note:<channel>:<number>', channels 1–16; '*' = any channel.
import { DEPTH } from './scenes.js';

export const PRESETS = {
  // Arturia MiniLab 3 — CC numbers read from the log of a connected unit:
  // knobs 1–4: CC 86 87 89 90, knobs 5–8: CC 110 111 116 117, faders: CC 14 15 30 31
  // (port "Minilab3 MIDI"; the MCU/HUI port duplicates the faders as pitch bend — it is ignored),
  // pads are notes 36–43 (bank A) and 44–51 (bank B) on channel 10, keys on channel 1.
  minilab3: {
    name: 'Arturia MiniLab 3',
    match: /minilab\s*3/i,
    // MiniLab 3 knobs send their position (0–127); at the end of the range they repeat 0/127.
    modes: (maps) => Object.fromEntries(Object.keys(maps).filter((k) => k.startsWith('cc:')).map((k) => [k, 'abs'])),
    maps: () => {
      const m = {
        // knobs 1–4: depth
        'cc:*:86': 'intensity',
        'cc:*:87': 'react',
        'cc:*:89': 'speed',
        'cc:*:90': 'trails',
        // knobs 5–8: layers + backdrop
        'cc:*:110': 'balance',
        'cc:*:111': 'backLevel',
        'cc:*:116': 'backReact',
        'cc:*:117': 'backSpeed',
        // faders: scroll through depth scenes and backdrops (faders 3 and 4 free)
        'cc:*:14': 'mSceneKnob',
        'cc:*:15': 'mBackKnob',
        // pads, bank A
        'note:10:36': 'aFlash',
        'note:10:37': 'aStrobe',
        'note:10:38': 'aGlitch',
        'note:10:39': 'aVary',
        'note:10:40': 'mPrevBack',
        'note:10:41': 'mNextBack',
        'note:10:42': 'aVaryBack',
        'note:10:43': 'sync',
        // pads, bank B
        'note:10:44': 'aFlash',
        'note:10:45': 'aStrobe',
        'note:10:46': 'aGlitch',
        'note:10:47': 'aVary',
        'note:10:48': 'mNextPal',
        'note:10:49': 'mPrevBack',
        'note:10:50': 'mNextBack',
        'note:10:51': 'sync',
        // buttons that send CC
        'cc:1:109': 'tap',
        'cc:1:28': 'mNextPalBack',
        'cc:1:105': 'aVaryBack',
        'cc:1:107': 'mNextPalBack',
      };
      // keys from C3 (note 48): consecutive depth scenes (further scenes after shifting the octave up)
      DEPTH.forEach((sc, i) => (m[`note:1:${48 + i}`] = `scene:${sc.id}`));
      return m;
    },
  },
};
