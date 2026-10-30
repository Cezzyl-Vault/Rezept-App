// Vorschläge aus dem Verlauf des Wochenplans: was oft gekocht wird und was lange nicht dran war.

const TAG = 86400000;
const tageZwischen = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / TAG);

export const heuteIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

// rezept_id → { anzahl (letzte 12 Monate), zuletzt (Datum) } – nur Einträge bis heute
export function verlauf(plan, heute = heuteIso()) {
  const statistik = new Map();
  for (const p of plan) {
    if (!p.rezept_id || p.datum > heute) continue;
    const s = statistik.get(p.rezept_id) || { anzahl: 0, zuletzt: null };
    if (tageZwischen(p.datum, heute) <= 365) s.anzahl++;
    if (!s.zuletzt || p.datum > s.zuletzt) s.zuletzt = p.datum;
    statistik.set(p.rezept_id, s);
  }
  return statistik;
}

// Mindestens zweimal gekocht, häufigste zuerst
export function oftUndGern(rezepte, statistik) {
  return rezepte
    .filter((r) => (statistik.get(r.id) || {}).anzahl >= 2)
    .sort((a, b) => {
      const x = statistik.get(a.id);
      const y = statistik.get(b.id);
      return y.anzahl - x.anzahl || y.zuletzt.localeCompare(x.zuletzt);
    });
}

// Zuletzt vor mehr als 3 Wochen gekocht (älteste zuerst), danach noch nie eingeplante
export function langeNicht(rezepte, statistik, heute = heuteIso()) {
  const lange = rezepte
    .filter((r) => statistik.has(r.id) && tageZwischen(statistik.get(r.id).zuletzt, heute) > 21)
    .sort((a, b) => statistik.get(a.id).zuletzt.localeCompare(statistik.get(b.id).zuletzt));
  const nie = rezepte.filter((r) => !statistik.has(r.id)).sort((a, b) => a.titel.localeCompare(b.titel, 'de'));
  return [...lange, ...nie];
}

function vorWann(datum, heute) {
  const tage = tageZwischen(datum, heute);
  if (tage <= 0) return 'heute';
  if (tage === 1) return 'gestern';
  if (tage < 14) return `vor ${tage} Tagen`;
  if (tage < 60) return `vor ${Math.round(tage / 7)} Wochen`;
  const monate = Math.round(tage / 30);
  return monate < 12 ? `vor ${monate} Monaten` : 'vor über einem Jahr';
}

// "5× gekocht · zuletzt vor 3 Wochen"
export function beschreibung(statistik, rezeptId, heute = heuteIso()) {
  const s = statistik.get(rezeptId);
  if (!s) return 'noch nie eingeplant';
  return `${s.anzahl > 0 ? s.anzahl + '× gekocht · ' : ''}zuletzt ${vorWann(s.zuletzt, heute)}`;
}

// Zuletzt benutzte freie Einträge ("Kalt", "Reste" …) für die Schnellwahl
export function freieTitel(plan, anzahl = 8) {
  const zuletzt = new Map();
  for (const p of plan) {
    if (p.rezept_id || !p.titel) continue;
    const t = p.titel.trim();
    if (!zuletzt.has(t) || p.datum > zuletzt.get(t)) zuletzt.set(t, p.datum);
  }
  return [...zuletzt.entries()].sort((a, b) => b[1].localeCompare(a[1])).slice(0, anzahl).map(([t]) => t);
}
