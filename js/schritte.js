// Zubereitungsschritte und die Zutaten, die zu einem Schritt gehören.
// Ein Schritt ist entweder ein Text (Zutaten werden automatisch erkannt)
// oder { text, zutaten: [Zutat-IDs] } (von Hand festgelegt).
import { normalisiereName } from './zutaten.js';

export const schrittText = (s) => (typeof s === 'string' ? s : (s && s.text) || '');
export const istManuell = (s) => Boolean(s && typeof s === 'object' && Array.isArray(s.zutaten));

// Kurze ID für Zutaten, damit Zuordnungen beim Umsortieren erhalten bleiben
export const zutatId = () => Math.random().toString(36).slice(2, 8);

// Schrittwörter einmal normalisieren (gleiche Regeln wie bei den Zutatennamen)
function woerterVon(text) {
  return new Set(normalisiereName(text.replace(/[,;]/g, ' ')).split(' ').filter((w) => w.length >= 2));
}

// Kommt die Zutat im Schritt vor? "Mehl" ↔ "das Mehl unterrühren", "Zwiebeln" ↔ "die Zwiebel würfeln",
// aber "Tomaten" nicht ↔ "Tomatenmark".
function zutatImText(zutat, woerter) {
  const namensWoerter = normalisiereName(zutat.name).split(' ').filter((w) => w.length >= 2);
  if (!namensWoerter.length) return false;
  // Das letzte Wort ist im Deutschen meist das Hauptwort ("rote Linsen" → "linse")
  const haupt = namensWoerter[namensWoerter.length - 1];
  for (const w of woerter) {
    if (w === haupt) return true;
    if (haupt.length >= 4 && w.length >= 4 && (w.endsWith(haupt) || haupt.endsWith(w))) return true;
  }
  return false;
}

// Zutaten (Objekte aus rezept.zutaten) für Schritt i
export function zutatenFuerSchritt(rezept, i) {
  const schritt = rezept.schritte[i];
  const zutaten = (rezept.zutaten || []).filter((z) => !z.ueberschrift && z.name);
  if (istManuell(schritt)) {
    const ids = new Set(schritt.zutaten);
    return zutaten.filter((z) => z.id && ids.has(z.id));
  }
  const woerter = woerterVon(schrittText(schritt));
  return zutaten.filter((z) => zutatImText(z, woerter));
}
