// Liste aller Rezepte mit Suche, Kategorie-Filtern und "Was hab ich da?"
import { h, fuelle } from '../dom.js';
import * as speicher from '../speicher.js';
import { setzeKopf, zeigeTabs, zeigeFab } from '../ui.js';
import { gehe } from '../navigation.js';
import { fotoBild, gibUrlsFrei } from '../bilder.js';
import { alleSchlagwoerter, passtZurSuche, passtZuFiltern, zutatenAbgleich } from '../suche.js';
import { holeEntwurf, verwerfeEntwurf } from '../entwurf.js';

// Bleibt erhalten, wenn man ein Rezept öffnet und zurückkommt
const zustand = { suche: '', filter: new Set(), wasDa: false, vorhanden: [], grundIgnorieren: true, scroll: 0 };

export async function zeige(bereich) {
  setzeKopf({ titel: 'Rezepte', konto: true });
  zeigeTabs('rezepte');
  zeigeFab(true);

  let rezepte = [];

  const suche = h('input', {
    type: 'search', class: 'suche', placeholder: 'Suchen in Titel, Zutaten, Schritten …', value: zustand.suche,
    autocomplete: 'off', oninput: () => { zustand.suche = suche.value; zeichneListe(); },
  });
  const chips = h('div', { class: 'chips' });
  const wasDa = h('div', { class: 'was-da' });
  const entwurfHinweis = h('div');
  const liste = h('ul', { class: 'raster' });
  const leer = h('div', { class: 'leer' });
  bereich.append(entwurfHinweis, suche, chips, wasDa, leer, liste);

  function zeichneEntwurf() {
    const e = holeEntwurf();
    fuelle(entwurfHinweis, e ? h('div', { class: 'hinweis-karte' },
      h('span', {}, '📝 Nicht gespeichert: ', h('strong', {}, e.rezept.titel || 'Neues Rezept')),
      h('button', { class: 'btn klein', type: 'button', onclick: () => gehe(e.neu ? '#/neu' : '#/bearbeiten/' + e.rezept.id) }, 'Weiter'),
      h('button', { class: 'btn klein text', type: 'button', onclick: () => { verwerfeEntwurf(); zeichneEntwurf(); } }, 'Verwerfen'),
    ) : '');
  }

  function zeichneChips() {
    const schlagwoerter = alleSchlagwoerter(rezepte);
    fuelle(chips, 
      h('button', {
        type: 'button', class: 'chip besonders' + (zustand.wasDa ? ' aktiv' : ''),
        onclick: () => { zustand.wasDa = !zustand.wasDa; zeichneChips(); zeichneWasDa(); zeichneListe(); },
      }, '🧺 Was hab ich da?'),
      ...schlagwoerter.map((s) => h('button', {
        type: 'button', class: 'chip' + (zustand.filter.has(s) ? ' aktiv' : ''),
        onclick: () => {
          if (zustand.filter.has(s)) zustand.filter.delete(s); else zustand.filter.add(s);
          zeichneChips();
          zeichneListe();
        },
      }, s)));
  }

  function zeichneWasDa() {
    if (!zustand.wasDa) { fuelle(wasDa); return; }
    const eingabe = h('input', {
      type: 'text', placeholder: 'Zutat eingeben, z. B. Kartoffeln', enterkeyhint: 'done', autocomplete: 'off',
      onkeydown: (e) => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); hinzufuegen(); } },
      onblur: () => hinzufuegen(),
    });
    function hinzufuegen() {
      const wert = eingabe.value.trim().replace(/,$/, '');
      if (!wert) return;
      for (const teil of wert.split(',').map((s) => s.trim()).filter(Boolean)) {
        if (!zustand.vorhanden.includes(teil)) zustand.vorhanden.push(teil);
      }
      eingabe.value = '';
      zeichneWasDa();
      zeichneListe();
      wasDa.querySelector('input[type=text]').focus();
    }
    fuelle(wasDa, h('div', { class: 'karte-flach' },
      h('p', { class: 'meta' }, 'Was hast du da? Rezepte mit den meisten passenden Zutaten stehen oben.'),
      h('div', { class: 'chips' }, zustand.vorhanden.map((v) => h('button', {
        type: 'button', class: 'chip aktiv', 'aria-label': v + ' entfernen',
        onclick: () => { zustand.vorhanden = zustand.vorhanden.filter((x) => x !== v); zeichneWasDa(); zeichneListe(); },
      }, v + ' ✕'))),
      eingabe,
      h('label', { class: 'schalter' },
        h('input', {
          type: 'checkbox', checked: zustand.grundIgnorieren,
          onchange: (e) => { zustand.grundIgnorieren = e.target.checked; zeichneListe(); },
        }),
        ' Salz, Pfeffer, Öl, Zucker und Wasser habe ich immer'),
    ));
  }

  function zeichneListe() {
    gibUrlsFrei();
    let treffer = rezepte.filter((r) => passtZurSuche(r, zustand.suche) && passtZuFiltern(r, zustand.filter));
    let abgleich = null;
    if (zustand.wasDa && zustand.vorhanden.length) {
      abgleich = new Map(treffer.map((r) => [r.id, zutatenAbgleich(r, zustand.vorhanden, zustand.grundIgnorieren)]));
      treffer = treffer.filter((r) => abgleich.get(r.id).da > 0);
      treffer.sort((a, b) => {
        const x = abgleich.get(a.id);
        const y = abgleich.get(b.id);
        return (x.gesamt - x.da) - (y.gesamt - y.da) || y.da - x.da;
      });
    }
    fuelle(liste, ...treffer.map((r) => karte(r, abgleich && abgleich.get(r.id))));
    suche.hidden = rezepte.length === 0;
    chips.hidden = rezepte.length === 0;
    if (rezepte.length === 0) {
      fuelle(leer, h('div', { class: 'leer-symbol' }, '📖'), h('p', {}, 'Noch keine Rezepte.'),
        h('p', {}, 'Tippe unten auf ', h('strong', {}, '+'), ', um ein Rezept zu fotografieren oder einzutippen.'));
    } else if (!treffer.length) {
      fuelle(leer, h('p', {}, zustand.wasDa && zustand.vorhanden.length ? 'Kein Rezept mit diesen Zutaten gefunden.' : 'Kein Rezept gefunden.'));
    } else {
      fuelle(leer);
    }
  }

  function karte(r, abgleich) {
    const bild = r.vorschau
      ? fotoBild(r.vorschau, { ersatz: r.fotos[0], loading: 'lazy' })
      : h('div', { class: 'platzhalter' }, (r.titel || '?').slice(0, 1).toUpperCase());
    return h('li', {}, h('button', { type: 'button', class: 'karte', onclick: () => gehe('#/rezept/' + r.id) },
      bild,
      h('div', { class: 'karte-text' },
        h('div', { class: 'karte-titel' }, r.titel),
        abgleich
          ? h('div', { class: 'karte-datum' + (abgleich.fehlt.length ? '' : ' alles-da') },
            abgleich.fehlt.length ? `${abgleich.da} von ${abgleich.gesamt} da · fehlt: ${abgleich.fehlt.slice(0, 3).join(', ')}${abgleich.fehlt.length > 3 ? ' …' : ''}` : 'Alles da ✓')
          : h('div', { class: 'karte-datum' }, (r.schlagwoerter || []).slice(0, 2).join(' · ') || (r.zutaten.length ? r.zutaten.length + ' Zutaten' : 'Foto')),
      )));
  }

  async function laden() {
    rezepte = await speicher.alle('rezepte');
    rezepte.sort((a, b) => a.titel.localeCompare(b.titel, 'de'));
    zeichneChips();
    zeichneListe();
  }

  zeichneEntwurf();
  zeichneWasDa();
  await laden();
  window.scrollTo(0, zustand.scroll);

  const beiDaten = (e) => { if (e.detail.tabelle === 'rezepte') laden(); };
  window.addEventListener('daten', beiDaten);
  return () => {
    zustand.scroll = window.scrollY;
    window.removeEventListener('daten', beiDaten);
  };
}
