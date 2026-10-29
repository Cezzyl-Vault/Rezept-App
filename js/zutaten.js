// Zutaten zerlegen ("250 g Mehl"), skalieren, schön anzeigen und für die Einkaufsliste zusammenfassen.

const EINHEITEN = [
  { anzeige: 'g', varianten: ['g', 'gr', 'gramm'] },
  { anzeige: 'kg', varianten: ['kg', 'kilo', 'kilogramm'] },
  { anzeige: 'mg', varianten: ['mg'] },
  { anzeige: 'ml', varianten: ['ml', 'milliliter'] },
  { anzeige: 'cl', varianten: ['cl'] },
  { anzeige: 'dl', varianten: ['dl'] },
  { anzeige: 'l', varianten: ['l', 'liter', 'ltr'] },
  { anzeige: 'EL', varianten: ['el', 'essl', 'esslöffel', 'eßl', 'eßlöffel'] },
  { anzeige: 'TL', varianten: ['tl', 'teel', 'teelöffel'] },
  { anzeige: 'Msp.', varianten: ['msp', 'messerspitze', 'messerspitzen'] },
  { anzeige: 'Prise', mehrzahl: 'Prisen', varianten: ['prise', 'prisen'] },
  { anzeige: 'Pck.', varianten: ['pck', 'pkt', 'päckchen', 'packung', 'packungen', 'pack'] },
  { anzeige: 'Dose', mehrzahl: 'Dosen', varianten: ['dose', 'dosen'] },
  { anzeige: 'Becher', varianten: ['becher'] },
  { anzeige: 'Bund', varianten: ['bund', 'bd'] },
  { anzeige: 'Stück', varianten: ['stück', 'stk', 'st'] },
  { anzeige: 'Zehe', mehrzahl: 'Zehen', varianten: ['zehe', 'zehen'] },
  { anzeige: 'Scheibe', mehrzahl: 'Scheiben', varianten: ['scheibe', 'scheiben'] },
  { anzeige: 'Tasse', mehrzahl: 'Tassen', varianten: ['tasse', 'tassen'] },
  { anzeige: 'Glas', mehrzahl: 'Gläser', varianten: ['glas', 'gläser'] },
  { anzeige: 'Handvoll', varianten: ['handvoll'] },
  { anzeige: 'Zweig', mehrzahl: 'Zweige', varianten: ['zweig', 'zweige'] },
  { anzeige: 'Blatt', mehrzahl: 'Blätter', varianten: ['blatt', 'blätter'] },
  { anzeige: 'Würfel', varianten: ['würfel'] },
  { anzeige: 'Tropfen', varianten: ['tropfen'] },
  { anzeige: 'Schuss', varianten: ['schuss'] },
  { anzeige: 'Spritzer', varianten: ['spritzer'] },
  { anzeige: 'Stange', mehrzahl: 'Stangen', varianten: ['stange', 'stangen'] },
  { anzeige: 'Kopf', mehrzahl: 'Köpfe', varianten: ['kopf', 'köpfe'] },
  { anzeige: 'Knolle', mehrzahl: 'Knollen', varianten: ['knolle', 'knollen'] },
  { anzeige: 'Flasche', mehrzahl: 'Flaschen', varianten: ['flasche', 'flaschen'] },
  { anzeige: 'Beutel', varianten: ['beutel', 'tüte', 'tüten'] },
  { anzeige: 'etwas', varianten: ['etwas'] },
];

const NACH_VARIANTE = new Map();
for (const e of EINHEITEN) for (const v of e.varianten) NACH_VARIANTE.set(v, e);

const einheitMuster = new RegExp(
  '^(' + [...NACH_VARIANTE.keys()].sort((a, b) => b.length - a.length).map((v) => v.replace('.', '\\.')).join('|') + ')\\.?(?=\\s|$)',
  'iu');

const BRUECHE = { '½': 1 / 2, '⅓': 1 / 3, '⅔': 2 / 3, '¼': 1 / 4, '¾': 3 / 4, '⅕': 1 / 5, '⅛': 1 / 8 };
const BRUCH_ZEICHEN = Object.keys(BRUECHE).join('');

const zahlMuster = new RegExp(
  `^(?:(\\d+(?:[.,]\\d+)?)(?![\\d/])(?:\\s*(?:(\\d+)\\/(\\d+)|([${BRUCH_ZEICHEN}])))?|(\\d+)\\/(\\d+)|([${BRUCH_ZEICHEN}]))`, 'u');

function liesZahl(text) {
  // "1.000 g" → Tausenderpunkt entfernen
  const tausend = text.match(/^\d{1,3}(?:\.\d{3})+(?!\d)/);
  if (tausend) text = tausend[0].replace(/\./g, '') + text.slice(tausend[0].length);
  const m = text.match(zahlMuster);
  if (!m || !m[0]) return null;
  let wert;
  if (m[1] !== undefined) {
    wert = parseFloat(m[1].replace(',', '.'));
    if (m[2]) wert += Number(m[2]) / Number(m[3]);
    if (m[4]) wert += BRUECHE[m[4]];
  } else if (m[5]) {
    wert = Number(m[5]) / Number(m[6]);
  } else {
    wert = BRUECHE[m[7]];
  }
  return { wert, rest: text.slice(m[0].length) };
}

// "1 ½ EL Olivenöl" → { menge: 1.5, menge_bis: null, einheit: 'EL', name: 'Olivenöl' }
// "Für den Teig:"   → { ueberschrift: true, name: 'Für den Teig' }
export function zerlegeZutat(zeile) {
  let text = String(zeile).trim().replace(/^[-–•*·▪◦]\s*/, '').replace(/\s+/g, ' ');
  if (!text) return null;
  if (/:$/.test(text) && !/^\d/.test(text)) return { ueberschrift: true, name: text.replace(/:$/, '').trim() };

  let menge = null;
  let mengeBis = null;
  const zahl = liesZahl(text);
  if (zahl) {
    menge = zahl.wert;
    text = zahl.rest.trim();
    const bis = text.match(/^(?:-|–|—|bis)\s*/);
    if (bis) {
      const zweite = liesZahl(text.slice(bis[0].length));
      if (zweite) {
        mengeBis = zweite.wert;
        text = zweite.rest.trim();
      }
    }
  }

  let einheit = '';
  const e = text.match(einheitMuster);
  if (e && text.length > e[0].length) {
    einheit = NACH_VARIANTE.get(e[1].toLowerCase()).anzeige;
    text = text.slice(e[0].length).trim();
  }
  return { menge, menge_bis: mengeBis, einheit, name: text };
}

// ---------- Anzeige ----------

function einheitText(einheit, menge) {
  const e = NACH_VARIANTE.get(String(einheit).toLowerCase().replace(/\.$/, '')) || EINHEITEN.find((x) => x.anzeige === einheit);
  if (!e) return einheit;
  return menge != null && menge > 1 && e.mehrzahl ? e.mehrzahl : e.anzeige;
}

const BRUCH_ANZEIGE = [[0, ''], [1 / 4, '¼'], [1 / 3, '⅓'], [1 / 2, '½'], [2 / 3, '⅔'], [3 / 4, '¾'], [1, '']];

export function formatiereMenge(n) {
  if (n >= 100) return String(Math.round(n / 5) * 5);
  if (n >= 10) return String(Math.round(n));
  const ganz = Math.floor(n);
  const rest = n - ganz;
  for (const [wert, zeichen] of BRUCH_ANZEIGE) {
    if (Math.abs(rest - wert) < 0.04) {
      const g = wert === 1 ? ganz + 1 : ganz;
      if (!zeichen) return String(g);
      return (g ? String(g) : '') + zeichen;
    }
  }
  const gerundet = n < 1 ? Math.round(n * 100) / 100 : Math.round(n * 10) / 10;
  return gerundet.toLocaleString('de-DE');
}

// g ↔ kg und ml ↔ l passend umstellen
function passeEinheitAn(menge, einheit, mengeBis) {
  const groesser = Math.max(menge, mengeBis || 0);
  const umstellen = (faktor, neu) => [menge * faktor, neu, mengeBis != null ? mengeBis * faktor : null];
  if (einheit === 'g' && groesser >= 1000) return umstellen(1 / 1000, 'kg');
  if (einheit === 'kg' && groesser < 1) return umstellen(1000, 'g');
  if (einheit === 'ml' && groesser >= 1000) return umstellen(1 / 1000, 'l');
  if (einheit === 'l' && groesser < 1) return umstellen(1000, 'ml');
  return [menge, einheit, mengeBis];
}

// Zutat als Text, optional skaliert: zutatText({menge:1.5, einheit:'EL', name:'Öl'}, 2) → "3 EL Öl"
export function zutatText(z, faktor = 1) {
  if (z.ueberschrift) return z.name;
  let { menge, menge_bis: mengeBis, einheit } = z;
  if (menge != null) {
    menge *= faktor;
    if (mengeBis != null) mengeBis *= faktor;
    if (faktor !== 1) [menge, einheit, mengeBis] = passeEinheitAn(menge, einheit, mengeBis);
  }
  const teile = [];
  if (menge != null) teile.push(formatiereMenge(menge) + (mengeBis != null ? '–' + formatiereMenge(mengeBis) : ''));
  if (einheit) teile.push(einheitText(einheit, mengeBis ?? menge));
  teile.push(z.name);
  return teile.join(' ');
}

// Nur Menge und Einheit (für die zweispaltige Anzeige)
export function mengeText(z, faktor = 1) {
  const text = zutatText({ ...z, name: '' }, faktor).trim();
  return text;
}

// ---------- Vergleichen ----------

const falte = (s) => s.replace(/ä/g, 'a').replace(/ö/g, 'o').replace(/ü/g, 'u').replace(/ß/g, 'ss');

const FUELLWOERTER = new Set(falte('frisch frische frischer frisches frischen groß große großer großes großen klein kleine kleiner kleines '
  + 'kleinen mittelgroß mittelgroße mittelgroßer mittelgroßen gehackt gehackte gehackter gerieben geriebene geriebener '
  + 'gewürfelt gewürfelte fein feine grob grobe etwas ca evtl nach belieben zum zur für den die das der und oder tk bio '
  + 'reif reife weich weiche kalt kalte kaltes warm warme').split(' '));

const SONDERFAELLE = { eier: 'ei', eiern: 'ei' };

// "2 große Zwiebeln (rot), gewürfelt" → "zwiebel"
export function normalisiereName(name) {
  const woerter = falte(String(name).toLowerCase()
    .replace(/\(.*?\)/g, ' ')
    .split(/[,;]/)[0])
    .replace(/[^a-z\s-]/g, ' ')
    .split(/[\s-]+/)
    .filter((w) => w && !FUELLWOERTER.has(w));
  return woerter.map((w) => SONDERFAELLE[w] || (w.length > 4 ? w.replace(/(en|n|e|s)$/, '') : w)).join(' ');
}

// Passt eine vorhandene Zutat zu einer Rezeptzutat? "mehl" passt zu "Weizenmehl", "tomate" nicht zu "Tomatenmark".
export function zutatPasst(rezeptName, vorhandenNormalisiert) {
  const woerter = normalisiereName(rezeptName).split(' ');
  return woerter.some((w) => w.length >= 2 && (w === vorhandenNormalisiert
    || (vorhandenNormalisiert.length >= 3 && w.endsWith(vorhandenNormalisiert))
    || (w.length >= 3 && vorhandenNormalisiert.endsWith(w))));
}

// ---------- Zusammenfassen für die Einkaufsliste ----------

const FAMILIEN = { g: ['g', 1], kg: ['g', 1000], mg: ['g', 0.001], ml: ['ml', 1], l: ['ml', 1000], cl: ['ml', 10], dl: ['ml', 100] };

export function schluessel(name, einheit) {
  const familie = FAMILIEN[einheit] ? FAMILIEN[einheit][0] : String(einheit || '').toLowerCase();
  return normalisiereName(name) + '|' + familie;
}

// posten: [{ name, menge, einheit, ... }] → zusammengefasst, gleiche Zutaten addiert
export function fasseZusammen(posten) {
  const gruppen = new Map();
  for (const p of posten) {
    if (p.ueberschrift || !p.name) continue;
    const k = schluessel(p.name, p.einheit);
    const fam = FAMILIEN[p.einheit];
    const menge = p.menge_bis ?? p.menge; // bei "2–3 Äpfel" lieber 3 kaufen
    const basis = menge == null ? null : menge * (fam ? fam[1] : 1);
    const g = gruppen.get(k);
    if (!g) {
      gruppen.set(k, { ...p, basis, einheitBasis: fam ? fam[0] : p.einheit, quellen: [p] });
    } else {
      if (basis != null) g.basis = (g.basis || 0) + basis;
      g.quellen.push(p);
    }
  }
  return [...gruppen.values()].map((g) => {
    if (g.basis == null) return { ...g.quellen[0], menge: null, menge_bis: null, quellen: g.quellen };
    const [menge, einheit] = FAMILIEN[g.einheitBasis] ? passeEinheitAn(g.basis, g.einheitBasis, null) : [g.basis, g.einheitBasis];
    return { ...g.quellen[0], menge: rundeEinkauf(menge), menge_bis: null, einheit, quellen: g.quellen };
  });
}

const rundeEinkauf = (n) => Math.round(n * 100) / 100;
