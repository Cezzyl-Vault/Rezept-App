// Wochenplan: Rezepte auf Tage verteilen, mit Personenanzahl.
import { h, fuelle } from '../dom.js';
import * as speicher from '../speicher.js';
import { setzeKopf, zeigeTabs, zeigeFab, zeigeMeldung, zeigeFehler, blatt } from '../ui.js';
import { gehe } from '../navigation.js';
import { aufDieListe } from './einkauf.js';

const TAGE = ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag'];
const pad = (n) => String(n).padStart(2, '0');
export const isoDatum = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const ausIso = (s) => { const [j, m, t] = s.split('-').map(Number); return new Date(j, m - 1, t, 12); };
const kurz = (d) => `${d.getDate()}.${d.getMonth() + 1}.`;

function montagVon(datum) {
  const d = new Date(datum);
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d;
}

function plusTage(d, n) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

function kalenderwoche(d) {
  const x = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  x.setUTCDate(x.getUTCDate() + 4 - (x.getUTCDay() || 7));
  const jahresanfang = new Date(Date.UTC(x.getUTCFullYear(), 0, 1));
  return Math.ceil(((x - jahresanfang) / 86400000 + 1) / 7);
}

function tagName(d) {
  const heute = isoDatum(new Date());
  const morgen = isoDatum(plusTage(new Date(), 1));
  const name = TAGE[(d.getDay() + 6) % 7];
  if (isoDatum(d) === heute) return 'Heute · ' + name;
  if (isoDatum(d) === morgen) return 'Morgen · ' + name;
  return name;
}

export async function zeige(bereich, wochenstart) {
  setzeKopf({ titel: 'Wochenplan', konto: true });
  zeigeTabs('plan');
  zeigeFab(false);

  const montag = montagVon(wochenstart ? ausIso(wochenstart) : new Date());
  const tage = [0, 1, 2, 3, 4, 5, 6].map((i) => plusTage(montag, i));
  const istDieseWoche = isoDatum(montag) === isoDatum(montagVon(new Date()));

  async function zeichne() {
    const [plan, rezepte] = await Promise.all([speicher.alle('plan'), speicher.alle('rezepte')]);
    const nachId = new Map(rezepte.map((r) => [r.id, r]));
    const vonBis = [isoDatum(tage[0]), isoDatum(tage[6])];
    const dieseWoche = plan.filter((p) => p.datum >= vonBis[0] && p.datum <= vonBis[1] && nachId.has(p.rezept_id));

    fuelle(bereich, 
      h('div', { class: 'wochen-kopf' },
        h('button', { class: 'rund', type: 'button', 'aria-label': 'Vorige Woche', onclick: () => gehe('#/plan/' + isoDatum(plusTage(montag, -7)), true) }, '‹'),
        h('div', { class: 'wochen-titel' },
          h('strong', {}, 'KW ' + kalenderwoche(montag)),
          h('span', {}, ` ${kurz(tage[0])} – ${kurz(tage[6])}`),
          istDieseWoche ? null : h('button', { class: 'link', type: 'button', onclick: () => gehe('#/plan', true) }, 'Heute')),
        h('button', { class: 'rund', type: 'button', 'aria-label': 'Nächste Woche', onclick: () => gehe('#/plan/' + isoDatum(plusTage(montag, 7)), true) }, '›')),

      ...tage.map((tag) => {
        const datum = isoDatum(tag);
        const eintraege = dieseWoche.filter((p) => p.datum === datum).sort((a, b) => a.erstellt_am.localeCompare(b.erstellt_am));
        return h('section', { class: 'tag' + (datum === isoDatum(new Date()) ? ' heute' : '') + (datum < isoDatum(new Date()) ? ' vorbei' : '') },
          h('div', { class: 'tag-kopf' }, h('span', {}, tagName(tag)), h('span', { class: 'meta' }, kurz(tag))),
          ...eintraege.map((p) => eintragZeile(p, nachId.get(p.rezept_id))),
          h('button', { class: 'btn text links klein', type: 'button', onclick: () => rezeptEinplanen(datum, rezepte) }, '+ Rezept'));
      }),

      dieseWoche.length ? h('button', {
        class: 'btn', type: 'button',
        onclick: () => aufDieListe(dieseWoche.map((p) => ({ rezept: nachId.get(p.rezept_id), portionen: p.portionen, planEintrag: p }))),
      }, '🛒 Zutaten dieser Woche auf die Einkaufsliste') : h('p', { class: 'leer' }, 'Für diese Woche ist noch nichts geplant.'),
    );
  }

  function eintragZeile(p, rezept) {
    const aendere = async (schritt) => {
      try {
        await speicher.speichere('plan', { ...p, portionen: Math.max(1, (p.portionen || rezept.portionen || 2) + schritt) });
      } catch (f) { zeigeFehler(f); }
    };
    return h('div', { class: 'plan-eintrag' },
      h('button', { class: 'plan-titel', type: 'button', onclick: () => gehe('#/rezept/' + rezept.id) },
        rezept.titel, p.auf_liste ? h('span', { class: 'marke-klein', title: 'Schon auf der Einkaufsliste' }, '🛒') : null),
      h('div', { class: 'portionen klein' },
        h('button', { class: 'rund klein', type: 'button', 'aria-label': 'Weniger Personen', onclick: () => aendere(-1) }, '−'),
        h('span', {}, (p.portionen || rezept.portionen || '?') + ' P.'),
        h('button', { class: 'rund klein', type: 'button', 'aria-label': 'Mehr Personen', onclick: () => aendere(1) }, '+')),
      h('button', {
        class: 'mini', type: 'button', 'aria-label': 'Aus dem Plan entfernen',
        onclick: () => speicher.loesche('plan', p.id).catch(zeigeFehler),
      }, '✕'));
  }

  await zeichne();
  const beiDaten = (e) => { if (e.detail.tabelle === 'plan' || e.detail.tabelle === 'rezepte') zeichne(); };
  window.addEventListener('daten', beiDaten);
  return () => window.removeEventListener('daten', beiDaten);
}

// Auswahl eines Rezepts mit Suche
export function waehleRezept(rezepte) {
  const sortiert = [...rezepte].sort((a, b) => a.titel.localeCompare(b.titel, 'de'));
  return blatt((fertig) => {
    const liste = h('div', { class: 'auswahl-liste' });
    const suche = h('input', { type: 'search', class: 'suche', placeholder: 'Rezept suchen …', autocomplete: 'off' });
    const zeichne = () => {
      const b = suche.value.trim().toLowerCase();
      const treffer = sortiert.filter((r) => !b || r.titel.toLowerCase().includes(b));
      fuelle(liste, ...treffer.map((r) => h('button', { type: 'button', class: 'auswahl-eintrag', onclick: () => fertig(r) }, r.titel)),
        treffer.length ? null : h('p', { class: 'meta' }, rezepte.length ? 'Kein Rezept gefunden.' : 'Noch keine Rezepte vorhanden.'));
    };
    suche.addEventListener('input', zeichne);
    zeichne();
    return [h('h2', { class: 'blatt-titel' }, 'Rezept auswählen'), suche, liste,
      h('button', { class: 'btn text', type: 'button', onclick: () => fertig(null) }, 'Abbrechen')];
  }, { voll: true });
}

async function rezeptEinplanen(datum, rezepte) {
  const rezept = await waehleRezept(rezepte);
  if (!rezept) return;
  try {
    await speicher.speichere('plan', { id: speicher.neueId(), datum, rezept_id: rezept.id, portionen: rezept.portionen || 2, auf_liste: false });
  } catch (f) {
    zeigeFehler(f);
  }
}

// Aus der Rezeptansicht: Tag in den nächsten zwei Wochen wählen
export async function inDenWochenplan(rezept, portionen) {
  const tage = [...Array(14)].map((_, i) => plusTage(new Date(), i));
  const datum = await blatt((fertig) => [
    h('h2', { class: 'blatt-titel' }, 'An welchem Tag?'),
    h('div', { class: 'auswahl-liste' }, tage.map((t) => h('button', {
      type: 'button', class: 'auswahl-eintrag', onclick: () => fertig(isoDatum(t)),
    }, tagName(t), h('span', { class: 'meta' }, ' ' + kurz(t))))),
    h('button', { class: 'btn text', type: 'button', onclick: () => fertig(null) }, 'Abbrechen'),
  ], { voll: true });
  if (!datum) return;
  try {
    await speicher.speichere('plan', { id: speicher.neueId(), datum, rezept_id: rezept.id, portionen: portionen || rezept.portionen || 2, auf_liste: false });
    zeigeMeldung('Eingeplant für ' + tagName(ausIso(datum)).replace('Heute · ', 'heute, ').replace('Morgen · ', 'morgen, ') + ' ' + kurz(ausIso(datum)));
  } catch (f) {
    zeigeFehler(f);
  }
}
