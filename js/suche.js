// Kategorien, Suche und "Was hab ich da?"
import { normalisiereName, zutatPasst } from './zutaten.js';

export const KATEGORIEN = ['Vorspeise', 'Hauptspeise', 'Beilage', 'Nachtisch', 'Backen', 'Frühstück', 'Vegetarisch', 'Vegan'];

// Diese Zutaten hat man fast immer im Haus.
export const GRUNDZUTATEN = ['salz', 'pfeffer', 'wasser', 'ol', 'zucker', 'olivenol', 'sonnenblumenol', 'rapsol'];

// Feste Kategorien zuerst, danach eigene Schlagwörter alphabetisch.
export function alleSchlagwoerter(rezepte) {
  const eigene = new Set();
  for (const r of rezepte) for (const s of r.schlagwoerter || []) if (!KATEGORIEN.includes(s)) eigene.add(s);
  return [...KATEGORIEN, ...[...eigene].sort((a, b) => a.localeCompare(b, 'de'))];
}

export function passtZurSuche(rezept, begriff) {
  if (!begriff) return true;
  const text = [
    rezept.titel, rezept.notiz, rezept.rohtext,
    ...(rezept.schlagwoerter || []),
    ...(rezept.zutaten || []).map((z) => z.name),
    ...(rezept.schritte || []),
  ].join(' ').toLowerCase();
  return begriff.toLowerCase().split(/\s+/).filter(Boolean).every((w) => text.includes(w));
}

export function passtZuFiltern(rezept, filter) {
  for (const f of filter) if (!(rezept.schlagwoerter || []).includes(f)) return false;
  return true;
}

// Wie viele der Rezeptzutaten sind vorhanden? → { da, gesamt, fehlt: [Namen] }
export function zutatenAbgleich(rezept, vorhanden, grundIgnorieren) {
  const vorhandenNorm = vorhanden.map(normalisiereName).filter(Boolean);
  let da = 0;
  let gesamt = 0;
  const fehlt = [];
  for (const z of rezept.zutaten || []) {
    if (z.ueberschrift || !z.name) continue;
    const norm = normalisiereName(z.name);
    if (grundIgnorieren && GRUNDZUTATEN.some((g) => norm === g || norm.endsWith(' ' + g))) continue;
    gesamt++;
    if (vorhandenNorm.some((v) => zutatPasst(z.name, v))) da++;
    else fehlt.push(z.name);
  }
  return { da, gesamt, fehlt };
}
