// Jede Ansicht hat eine eigene Adresse (#/, #/rezept/<id>, #/plan …),
// damit die Zurück-Taste auf Android wie erwartet funktioniert.
import { overlayZurueck } from './ui.js';

let zeichne = () => {};

export function beiNavigation(fn) {
  zeichne = fn;
}

export function gehe(hash, ersetzen = false) {
  if (ersetzen) history.replaceState({ app: true }, '', hash);
  else history.pushState({ app: true }, '', hash);
  zeichne();
}

export function geheZurueck(ersatz = '#/') {
  if (history.state && history.state.app) history.back();
  else gehe(ersatz, true);
}

window.addEventListener('popstate', () => {
  if (overlayZurueck()) return;
  zeichne();
});
