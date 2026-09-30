// Skróty klawiszowe — działają w panelu i w oknie wyjścia.
import { DEPTH } from './scenes.js';

// Klawisze scen głębi: 1–0, potem wolne litery (T, O, P, S, G, L... są zajęte przez inne skróty).
export const DEPTH_KEYS = [
  ...'1234567890'.split('').map((c) => ['Digit' + c, c]),
  ...'QWERYUIAJKN'.split('').map((c) => ['Key' + c, c]),
];

export const SHORTCUTS = [
  ['1–0, Q–N', 'scena głębi (Shift = cięcie)'],
  ['G / ⇧G', 'tło'],
  ['L', 'głębia on/off'],
  ['Spacja', 'autopilot'],
  ['T', 'tap tempo'],
  ['Enter', 'początek frazy'],
  ['D', 'uzbrój / anuluj drop'],
  ['P / ⇧P', 'paleta głębi / tła'],
  ['V / ⇧V', 'wariacja głębi / tła'],
  ['← →', 'balans tło/głębia (⇧ = do końca)'],
  ['↓', 'balans na środek'],
  ['M', 'nakładanie warstw'],
  ['X', 'flash'],
  ['S', 'strobo (trzymaj)'],
  ['Z', 'glitch (trzymaj)'],
  ['C', 'rozpad (wł. / wył.)'],
  ['B', 'blackout'],
  ['[ ]', 'intensywność głębi'],
  ['F', 'pełny ekran'],
  ['H', 'ukryj panel'],
  ['O', 'okno wyjścia'],
];

export function bindKeys(win, getDir, extra = {}) {
  win.addEventListener('keydown', (e) => {
    const tag = e.target && e.target.tagName;
    if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (document.querySelector('.modal:not([hidden])')) return; // otwarte okno (np. mapowanie MIDI)
    const d = getDir();
    if (!d) return;
    const k = e.code;
    const repeatable = ['BracketLeft', 'BracketRight', 'ArrowLeft', 'ArrowRight'];
    if (e.repeat && !repeatable.includes(k)) {
      if (k === 'KeyS' || k === 'KeyZ' || k === 'Space') e.preventDefault();
      return;
    }
    const slot = DEPTH_KEYS.findIndex(([code]) => code === k);
    if (slot >= 0 && DEPTH[slot]) {
      d.setScene(DEPTH[slot].id, e.shiftKey ? 'cut' : null);
    } else {
      switch (k) {
        case 'Space': d.toggleAutopilot(); break;
        case 'KeyT': d.tap(); break;
        case 'KeyD': d.armDrop(); break;
        case 'Enter': d.syncPhrase(); break;
        case 'KeyP': d.nextPalette(1, e.shiftKey ? 'back' : 'depth'); break;
        case 'KeyV': d.vary(1, e.shiftKey ? 'back' : 'depth'); break;
        case 'ArrowLeft': e.shiftKey ? d.setBalance(0) : d.nudgeBalance(-0.05); break;
        case 'ArrowRight': e.shiftKey ? d.setBalance(1) : d.nudgeBalance(0.05); break;
        case 'ArrowDown': d.setBalance(0.5); break;
        case 'KeyM': d.nextBlend(); break;
        case 'KeyG': d.nextBack(e.shiftKey ? -1 : 1); break;
        case 'KeyL': d.toggleDepth(); break;
        case 'KeyX': d.hit(); break;
        case 'KeyS': d.strobe = true; break;
        case 'KeyZ': d.glitch = true; break;
        case 'KeyC': d.toggleShatter(); break;
        case 'KeyB': d.toggleBlack(); break;
        case 'BracketLeft': d.set('intensity', Math.max(0, d.s.intensity - 0.05)); break;
        case 'BracketRight': d.set('intensity', Math.min(1, d.s.intensity + 0.05)); break;
        case 'KeyF': extra.fullscreen?.(); break;
        case 'KeyH': extra.hide?.(); break;
        case 'KeyO': extra.output?.(); break;
        default: return;
      }
    }
    e.preventDefault();
  });
  win.addEventListener('keyup', (e) => {
    const d = getDir();
    if (!d) return;
    if (e.code === 'KeyS') d.strobe = false;
    if (e.code === 'KeyZ') d.glitch = false;
  });
  win.addEventListener('blur', () => {
    const d = getDir();
    if (d) d.strobe = d.glitch = false;
  });
}
