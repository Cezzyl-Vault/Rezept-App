// Ein Rezept ansehen und damit kochen: Portionen umrechnen, Schritte abhaken.
import { h, fuelle } from '../dom.js';
import * as speicher from '../speicher.js';
import { setzeKopf, zeigeTabs, zeigeFab, zeigeVollbild, zeigeMeldung, zeigeFehler } from '../ui.js';
import { gehe, geheZurueck } from '../navigation.js';
import { fotoBild } from '../bilder.js';
import { mengeText } from '../zutaten.js';
import { bearbeite } from '../entwurf.js';
import { inDenWochenplan } from './plan.js';
import { aufDieListe } from './einkauf.js';
import { erkenneVorhandeneFotos } from './erkennen.js';

// Pro Rezept: gewählte Portionen und abgehakte Schritte (bleiben beim Hin- und Herwechseln erhalten)
const kochzustand = new Map();

export async function zeige(bereich, id) {
  zeigeTabs(null);
  zeigeFab(false);
  let rezept = await speicher.hole('rezepte', id);
  if (!rezept) {
    setzeKopf({ titel: 'Rezept', zurueck: true });
    bereich.append(h('div', { class: 'leer' }, h('p', {}, 'Dieses Rezept gibt es nicht mehr.')));
    return;
  }

  if (!kochzustand.has(id)) kochzustand.set(id, { portionen: rezept.portionen, erledigt: new Set(), zutatenErledigt: new Set() });
  const zustand = kochzustand.get(id);

  function zeichne() {
    setzeKopf({
      titel: rezept.titel, zurueck: true,
      aktionen: [{ text: '✏️', label: 'Bearbeiten', onclick: () => { bearbeite(rezept); gehe('#/bearbeiten/' + rezept.id); } }],
    });
    const faktor = rezept.portionen && zustand.portionen ? zustand.portionen / rezept.portionen : 1;
    const hatText = rezept.zutaten.length || rezept.schritte.length;

    fuelle(bereich, 
      rezept.fotos.length ? h('div', { class: hatText ? 'foto-streifen klein' : 'rezept-fotos' },
        rezept.fotos.map((pfad) => {
          const bild = fotoBild(pfad, { onclick: () => bild.src && zeigeVollbild(bild.src) });
          return bild;
        })) : null,

      (rezept.schlagwoerter || []).length ? h('div', { class: 'chips' }, rezept.schlagwoerter.map((s) => h('span', { class: 'chip still' }, s))) : null,

      !hatText && rezept.fotos.length ? h('div', { class: 'karte-flach' },
        h('p', {}, 'Dieses Rezept besteht nur aus Fotos. Mit der Texterkennung wird daraus Text mit Zutaten und Schritten.'),
        h('button', { class: 'btn zweit', type: 'button', onclick: () => erkenneVorhandeneFotos(rezept) }, '🔍 Text aus den Fotos erkennen'),
      ) : null,

      rezept.zutaten.length ? h('section', { class: 'abschnitt' },
        h('div', { class: 'abschnitt-kopf' },
          h('h2', {}, 'Zutaten'),
          rezept.portionen ? h('div', { class: 'portionen' },
            h('button', { class: 'rund', type: 'button', 'aria-label': 'Weniger Portionen', onclick: () => aendere(-1) }, '−'),
            h('span', {}, zustand.portionen + (zustand.portionen === 1 ? ' Portion' : ' Portionen')),
            h('button', { class: 'rund', type: 'button', 'aria-label': 'Mehr Portionen', onclick: () => aendere(1) }, '+'),
          ) : null),
        h('ul', { class: 'zutaten' }, rezept.zutaten.map((z, i) => z.ueberschrift
          ? h('li', { class: 'zutat-ueberschrift' }, z.name)
          : h('li', {
            class: 'zutat' + (zustand.zutatenErledigt.has(i) ? ' erledigt' : ''),
            onclick: () => { umschalten(zustand.zutatenErledigt, i); zeichne(); },
          }, h('span', { class: 'zutat-menge' }, mengeText(z, faktor)), h('span', { class: 'zutat-name' }, z.name)))),
      ) : null,

      h('div', { class: 'knopf-reihe' },
        h('button', { class: 'btn zweit', type: 'button', onclick: () => inDenWochenplan(rezept, zustand.portionen) }, '📅 In den Wochenplan'),
        rezept.zutaten.length ? h('button', {
          class: 'btn zweit', type: 'button',
          onclick: () => aufDieListe([{ rezept, portionen: zustand.portionen }]),
        }, '🛒 Auf die Einkaufsliste') : null,
      ),

      rezept.schritte.length ? h('section', { class: 'abschnitt' },
        h('h2', {}, 'Zubereitung'),
        h('ol', { class: 'schritte' }, rezept.schritte.map((s, i) => h('li', {
          class: zustand.erledigt.has(i) ? 'erledigt' : '',
          onclick: () => { umschalten(zustand.erledigt, i); zeichne(); },
        }, h('span', { class: 'schritt-nr' }, i + 1), h('span', {}, s)))),
      ) : null,

      rezept.notiz ? h('section', { class: 'abschnitt' }, h('h2', {}, 'Notiz'), h('p', { class: 'notiz' }, rezept.notiz)) : null,

      rezept.quelle_url ? h('p', { class: 'meta' }, 'Quelle: ',
        h('a', { href: rezept.quelle_url, target: '_blank', rel: 'noopener' }, new URL(rezept.quelle_url).hostname.replace(/^www\./, ''))) : null,

      rezept.rohtext && hatText ? h('details', { class: 'meta' }, h('summary', {}, 'Erkannter Originaltext'), h('pre', { class: 'rohtext' }, rezept.rohtext)) : null,

      h('button', { class: 'btn gefahr', type: 'button', onclick: loeschen }, 'Rezept löschen'),
    );
  }

  function aendere(schritt) {
    zustand.portionen = Math.max(1, zustand.portionen + schritt);
    zeichne();
  }

  function umschalten(menge, i) {
    if (menge.has(i)) menge.delete(i); else menge.add(i);
  }

  async function loeschen() {
    if (!confirm('„' + rezept.titel + '" wirklich löschen?')) return;
    try {
      await speicher.loescheRezept(rezept);
      kochzustand.delete(id);
      geheZurueck();
      zeigeMeldung('Rezept gelöscht');
    } catch (fehler) {
      zeigeFehler(fehler);
    }
  }

  if (rezept.portionen && !zustand.portionen) zustand.portionen = rezept.portionen;
  zeichne();

  // Beim Kochen soll der Bildschirm nicht ausgehen
  let wachhalter = null;
  const wachHalten = async () => {
    if (!rezept.schritte.length || !('wakeLock' in navigator) || document.visibilityState !== 'visible') return;
    try { wachhalter = await navigator.wakeLock.request('screen'); } catch (e) { /* nicht erlaubt */ }
  };
  wachHalten();
  document.addEventListener('visibilitychange', wachHalten);

  // Änderungen von einem anderen Gerät übernehmen
  const beiDaten = async (e) => {
    if (e.detail.tabelle !== 'rezepte') return;
    const neu = await speicher.hole('rezepte', id);
    if (!neu) return;
    if (neu.geaendert_am !== rezept.geaendert_am) {
      if (neu.portionen !== rezept.portionen) zustand.portionen = neu.portionen;
      rezept = neu;
      zeichne();
    }
  };
  window.addEventListener('daten', beiDaten);

  return () => {
    document.removeEventListener('visibilitychange', wachHalten);
    window.removeEventListener('daten', beiDaten);
    if (wachhalter) wachhalter.release().catch(() => {});
  };
}
