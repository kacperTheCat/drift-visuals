// Palety: bg = tło (prawie czarne), c1 = kolor główny (światło), c2 = kolor drugi (cień/akcent).
// Dodanie palety = dopisanie jednej linijki.
const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);

export const PALETTES = [
  { name: 'Mono',      bg: '#000000', c1: '#ececec', c2: '#5c5c5c' },
  { name: 'Ember',     bg: '#050000', c1: '#ff3b24', c2: '#4d0a05' },
  { name: 'Abyss',     bg: '#000308', c1: '#40d9ff', c2: '#0a2f66' },
  { name: 'UV',        bg: '#030008', c1: '#a070ff', c2: '#32106e' },
  { name: 'Acid',      bg: '#010400', c1: '#c4ff3a', c2: '#1e4d12' },
  { name: 'Amber',     bg: '#060300', c1: '#ffb24a', c2: '#5a2a06' },
  { name: 'Blood/Ice', bg: '#000000', c1: '#f2f4f8', c2: '#c0101a' },
].map((p) => ({ name: p.name, hex: p, bg: hex(p.bg), c1: hex(p.c1), c2: hex(p.c2) }));
