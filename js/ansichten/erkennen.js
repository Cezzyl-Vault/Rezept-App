// Fotos eines neuen Rezepts: Text erkennen und Zeilen einsortieren – oder nur als Foto speichern.
import { h, fuelle } from '../dom.js';
import { icon } from '../icons.js';
import { setzeKopf, zeigeTabs, zeigeFab, zeigeMeldung, zeigeFehler, waehleFotos, waehle, versteckeMeldung } from '../ui.js';
import { gehe } from '../navigation.js';
import { bildUrl } from '../bilder.js';
import { holeEntwurf, starteEntwurf, bearbeite, fuegeFotosHinzu, entferneFoto, entwurfFoto } from '../entwurf.js';
import { erkenneText, sortiereZeilen, zeilenZuRezept } from '../texterkennung.js';
import { ladeFoto } from '../sync.js';

const ARTEN = [
  ['titel', 'Titel'],
  ['zutat', 'Zutat'],
  ['schritt', 'Schritt'],
  ['weg', 'Weglassen'],
];

// Ergebnis der Erkennung, falls man kurz die Ansicht verlässt
let ergebnis = null;

// Neues Rezept aus Fotos beginnen
export async function neuAusFotos(dateien) {
  starteEntwurf();
  ergebnis = null;
  zeigeMeldung(dateien.length > 1 ? 'Fotos werden vorbereitet …' : 'Foto wird vorbereitet …', 0);
  try {
    await fuegeFotosHinzu(dateien);
    versteckeMeldung();
    gehe('#/erkennen');
  } catch (fehler) {
    zeigeFehler(fehler);
  }
}

// Ein bestehendes Foto-Rezept nachträglich in Text umwandeln
export function erkenneVorhandeneFotos(rezept) {
  bearbeite(rezept);
  ergebnis = null;
  gehe('#/erkennen');
}

export async function zeige(bereich) {
  zeigeTabs(null);
  zeigeFab(false);
  const entwurf = holeEntwurf();
  if (!entwurf || !entwurf.rezept.fotos.length) { gehe('#/', true); return; }
  const r = entwurf.rezept;
  setzeKopf({ titel: entwurf.neu ? 'Neues Rezept' : 'Text erkennen', zurueck: true });

  const fotos = h('div', { class: 'foto-streifen' });
  const inhalt = h('div');
  bereich.append(fotos, inhalt);

  async function zeichneFotos() {
    const elemente = [];
    for (const pfad of r.fotos) {
      const blob = await entwurfFoto(pfad) || await ladeFoto(pfad);
      elemente.push(h('figure', {},
        blob ? h('img', { src: bildUrl(blob), alt: '' }) : h('div', { class: 'platzhalter klein' }, icon('bild')),
        entwurf.neu ? h('button', {
          class: 'foto-entfernen', type: 'button', 'aria-label': 'Foto entfernen',
          onclick: () => {
            entferneFoto(pfad);
            if (!r.fotos.length) { gehe('#/', true); return; }
            ergebnis = null;
            zeichneFotos();
            zeichneInhalt();
          },
        }, icon('kreuz', { groesse: 16 })) : null));
    }
    if (entwurf.neu) elemente.push(h('button', { class: 'foto-neu', type: 'button', onclick: weiteresFoto }, '+ Foto\n(z. B. Rückseite)'));
    fuelle(fotos, ...elemente);
  }

  function weiteresFoto() {
    waehle('Weiteres Foto', [
      { wert: 'kamera', text: 'Foto aufnehmen', icon: 'kamera', klasse: '', sofort: () => waehleFotos('kamera', dazu) },
      { wert: 'galerie', text: 'Aus der Galerie', icon: 'bild', sofort: () => waehleFotos('galerie', dazu) },
    ]);
  }

  async function dazu(dateien) {
    zeigeMeldung('Foto wird vorbereitet …', 0);
    try {
      await fuegeFotosHinzu(dateien);
      versteckeMeldung();
    } catch (fehler) {
      zeigeFehler(fehler);
    }
    ergebnis = null;
    zeichneFotos();
    zeichneInhalt();
  }

  function zeichneInhalt() {
    if (!ergebnis) {
      fuelle(inhalt, 
        h('div', { class: 'karte-flach' },
          h('h2', {}, 'Text aus dem Foto holen?'),
          h('p', {}, 'Die App liest den Text direkt auf dem Handy und schlägt vor, was Zutat und was Schritt ist. Gedruckte Rezepte klappen gut, Handschrift eher schlecht.'),
          h('button', { class: 'btn', type: 'button', onclick: starteErkennung }, icon('funkeln', { groesse: 20 }), 'Text erkennen'),
          entwurf.neu ? h('button', { class: 'btn zweit', type: 'button', onclick: () => gehe('#/neu', true) }, 'Ohne Texterkennung weiter') : null,
        ));
      return;
    }
    fuelle(inhalt, 
      h('p', { class: 'hinweis' }, 'Tippe auf die Markierung, um eine Zeile anders einzusortieren. Der Text lässt sich korrigieren.'),
      ergebnis.portionen ? h('p', { class: 'meta' }, `Erkannt: für ${ergebnis.portionen} Portionen`) : null,
      h('div', { class: 'ocr-zeilen' }, ergebnis.zeilen.map((z) => {
        const feld = h('input', { type: 'text', value: z.text, class: z.art === 'weg' ? 'weg' : '' });
        feld.addEventListener('input', () => { z.text = feld.value; });
        return h('div', { class: 'ocr-zeile' },
          h('button', {
            type: 'button', class: 'marke ' + z.art,
            onclick: () => {
              const nr = ARTEN.findIndex(([a]) => a === z.art);
              z.art = ARTEN[(nr + 1) % ARTEN.length][0];
              zeichneInhalt();
            },
          }, ARTEN.find(([a]) => a === z.art)[1]),
          feld);
      })),
      h('button', { class: 'btn', type: 'button', onclick: uebernehmen }, 'Übernehmen und prüfen'),
      h('button', { class: 'btn text', type: 'button', onclick: starteErkennung }, 'Erneut erkennen'),
    );
  }

  async function starteErkennung() {
    const balken = h('div', { class: 'fortschritt-balken' });
    const text = h('p', { class: 'meta' }, 'Texterkennung wird geladen …');
    fuelle(inhalt, h('div', { class: 'karte-flach' }, text, h('div', { class: 'fortschritt' }, balken)));
    try {
      const blobs = [];
      for (const pfad of r.fotos) {
        const blob = await entwurfFoto(pfad) || await ladeFoto(pfad);
        if (blob) blobs.push(blob);
      }
      if (!blobs.length) throw new Error('Die Fotos sind auf diesem Gerät noch nicht verfügbar.');
      const roh = await erkenneText(blobs, (anteil, meldung) => {
        balken.style.width = Math.round(anteil * 100) + '%';
        text.textContent = meldung;
      });
      ergebnis = { roh, ...sortiereZeilen(roh) };
      if (!ergebnis.zeilen.length) {
        ergebnis = null;
        zeigeMeldung('Auf dem Foto wurde kein Text gefunden.', 4000);
      }
    } catch (fehler) {
      ergebnis = null;
      zeigeFehler(fehler);
    }
    zeichneInhalt();
  }

  function uebernehmen() {
    const { titel, zutaten, schritte } = zeilenZuRezept(ergebnis.zeilen);
    if (titel && (!r.titel || r.titel === 'Ohne Titel' || entwurf.neu)) r.titel = titel;
    if (zutaten.length) r.zutaten = zutaten;
    if (schritte.length) r.schritte = schritte;
    if (ergebnis.portionen && !r.portionen) r.portionen = ergebnis.portionen;
    r.rohtext = ergebnis.roh.trim();
    ergebnis = null;
    gehe(entwurf.neu ? '#/neu' : '#/bearbeiten/' + r.id, true);
  }

  await zeichneFotos();
  zeichneInhalt();
}
