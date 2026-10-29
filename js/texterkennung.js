// Texterkennung direkt auf dem Gerät mit Tesseract.js (ohne Server, ohne Kosten).
// Beim ersten Mal werden Programm und deutsche Sprachdaten (ca. 15 MB) geladen,
// danach liegen sie im Zwischenspeicher und es geht auch offline.
import { ladeBild } from './bilder.js';
import { zerlegeZutat } from './zutaten.js';

const SKRIPT = 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js';

let skriptVersprechen;

function ladeSkript() {
  if (!skriptVersprechen) {
    skriptVersprechen = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = SKRIPT;
      s.onload = () => resolve(window.Tesseract);
      s.onerror = () => { skriptVersprechen = null; reject(new Error('Texterkennung konnte nicht geladen werden. Beim ersten Mal ist Internet nötig.')); };
      document.head.append(s);
    });
  }
  return skriptVersprechen;
}

// Graustufen und mehr Kontrast helfen der Erkennung bei Handyfotos.
async function bereiteVor(blob) {
  const bild = await ladeBild(blob);
  const canvas = document.createElement('canvas');
  canvas.width = bild.naturalWidth;
  canvas.height = bild.naturalHeight;
  const g = canvas.getContext('2d', { willReadFrequently: true });
  g.drawImage(bild, 0, 0);
  const daten = g.getImageData(0, 0, canvas.width, canvas.height);
  const p = daten.data;
  let min = 255;
  let max = 0;
  for (let i = 0; i < p.length; i += 4) {
    const grau = 0.299 * p[i] + 0.587 * p[i + 1] + 0.114 * p[i + 2];
    p[i] = grau;
    if (grau < min) min = grau;
    if (grau > max) max = grau;
  }
  const spanne = Math.max(1, max - min);
  for (let i = 0; i < p.length; i += 4) {
    const wert = ((p[i] - min) / spanne) * 255;
    p[i] = p[i + 1] = p[i + 2] = wert;
  }
  g.putImageData(daten, 0, 0);
  return canvas;
}

// blobs: Fotos; fortschritt(anteil 0..1, text)
export async function erkenneText(blobs, fortschritt = () => {}) {
  fortschritt(0, 'Texterkennung wird geladen …');
  const Tesseract = await ladeSkript();
  let aktuell = 0;
  const worker = await Tesseract.createWorker('deu', 1, {
    logger: (m) => {
      if (m.status === 'recognizing text') {
        fortschritt((aktuell + m.progress) / blobs.length, `Text wird erkannt … ${blobs.length > 1 ? `(Foto ${aktuell + 1} von ${blobs.length})` : ''}`);
      } else if (/loading|initializ/.test(m.status)) {
        fortschritt(0, 'Sprachdaten werden geladen …');
      }
    },
  });
  try {
    const texte = [];
    for (aktuell = 0; aktuell < blobs.length; aktuell++) {
      const { data } = await worker.recognize(await bereiteVor(blobs[aktuell]));
      texte.push(data.text);
    }
    fortschritt(1, 'Fertig');
    return texte.join('\n\n');
  } finally {
    await worker.terminate();
  }
}

// ---------- Zeilen einsortieren ----------

const UEBERSCHRIFT_ZUTATEN = /^(zutaten|du brauchst|einkaufsliste|das brauchst du)\b/i;
const UEBERSCHRIFT_SCHRITTE = /^(zubereitung|anleitung|so geht'?s|so wird'?s gemacht|arbeitsschritte|zubereitungsschritte)\b/i;
const PORTIONEN = /(?:für\s*)?(\d+)\s*(personen|portionen|pers\.|stück|stücke)\b/i;

// Typischer Lesefehler: "1 l Milch" wird als "11 Milch" oder "1I Milch" erkannt
const LITER_FEHLER = /^(\d+)(?:1|\s?[Il|])\s+(?=\S*(brühe|fond|milch|wasser|sahne|saft|wein|bier|kokosmilch|buttermilch)\b)/i;

// Text → [{ text, art: 'titel' | 'zutat' | 'schritt' | 'weg', absatz }], dazu erkannte Portionen
export function sortiereZeilen(text) {
  const zeilen = [];
  let portionen = null;
  let bereich = null; // 'zutaten' | 'schritte' nach einer passenden Überschrift
  let absatz = 0;
  let titelGefunden = false;
  for (const roh of text.split(/\r?\n/)) {
    const zeile = roh.replace(/\s+/g, ' ').trim().replace(LITER_FEHLER, '$1 l ').replace(/[|_~]+/g, ' ').trim();
    if (!zeile) { absatz++; continue; }
    if (zeile.length < 2 || !/[a-zäöüß0-9]/i.test(zeile)) continue;

    const p = zeile.match(PORTIONEN);
    if (p && zeile.length < 40) {
      portionen = portionen || parseInt(p[1], 10);
      zeilen.push({ text: zeile, art: 'weg', absatz });
      continue;
    }
    if (UEBERSCHRIFT_ZUTATEN.test(zeile) && zeile.length < 30) { bereich = 'zutaten'; zeilen.push({ text: zeile, art: 'weg', absatz }); continue; }
    if (UEBERSCHRIFT_SCHRITTE.test(zeile) && zeile.length < 30) { bereich = 'schritte'; zeilen.push({ text: zeile, art: 'weg', absatz }); continue; }

    let art;
    const z = zerlegeZutat(zeile);
    const siehtAusWieZutat = z && !z.ueberschrift && (z.menge != null || z.einheit) && zeile.length <= 60;
    if (!titelGefunden && !siehtAusWieZutat && zeile.length <= 60 && bereich === null) {
      art = 'titel';
      titelGefunden = true;
    } else if (bereich === 'schritte') {
      art = 'schritt';
    } else if (siehtAusWieZutat || (bereich === 'zutaten' && zeile.length <= 45)) {
      art = 'zutat';
    } else {
      art = 'schritt';
    }
    zeilen.push({ text: zeile, art, absatz });
  }
  return { zeilen, portionen };
}

// Einsortierte Zeilen → Felder für den Editor
export function zeilenZuRezept(zeilen) {
  const titel = zeilen.filter((z) => z.art === 'titel').map((z) => z.text).join(' ');
  const zutaten = zeilen.filter((z) => z.art === 'zutat').map((z) => zerlegeZutat(z.text)).filter(Boolean);

  // Schrittzeilen zu Absätzen zusammenfügen: neuer Schritt bei neuem Absatz, Nummerierung oder nach Satzende
  const schritte = [];
  let vorher = null;
  for (const z of zeilen) {
    if (z.art !== 'schritt') continue;
    const nummer = /^\d+[.)]\s*/.test(z.text);
    const text = z.text.replace(/^\d+[.)]\s*/, '');
    const neu = !vorher || nummer || z.absatz !== vorher.absatz || /[.!]$/.test(schritte[schritte.length - 1]);
    if (neu) schritte.push(text);
    else {
      const letzter = schritte[schritte.length - 1];
      schritte[schritte.length - 1] = letzter.endsWith('-') ? letzter.slice(0, -1) + text : letzter + ' ' + text;
    }
    vorher = z;
  }
  return { titel, zutaten, schritte };
}
