// Wochenplan: Rezepte oder freie Einträge ("Kalt") auf Tage verteilen, mit Personenanzahl.
import { h, fuelle } from '../dom.js';
import * as speicher from '../speicher.js';
import { setzeKopf, zeigeTabs, zeigeFab, zeigeMeldung, zeigeFehler, blatt, waehle } from '../ui.js';
import { gehe } from '../navigation.js';
import { icon } from '../icons.js';
import { aufDieListe } from './einkauf.js';
import { verlauf, oftUndGern, langeNicht, beschreibung, freieTitel } from '../vorschlaege.js';

const TAGE = ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag'];

export const MAHLZEITEN = [
  { id: 'frueh', text: 'Frühstück', kurz: 'Früh' },
  { id: 'mittag', text: 'Mittag', kurz: 'Mittag' },
  { id: 'abend', text: 'Abend', kurz: 'Abend' },
];
const mahlzeitRang = (id) => { const i = MAHLZEITEN.findIndex((m) => m.id === id); return i < 0 ? -1 : i; };

// Vorschlag für einen Tag: Abend, sonst Mittag, sonst Frühstück – je nachdem, was noch frei ist
function freieMahlzeit(eintraegeDesTages) {
  const belegt = new Set(eintraegeDesTages.map((p) => p.mahlzeit));
  return ['abend', 'mittag', 'frueh'].find((m) => !belegt.has(m)) || 'abend';
}

// Umschalter Frühstück | Mittag | Abend; aenderung(id) meldet die Wahl
function mahlzeitWahl(start, aenderung) {
  let aktiv = start;
  const leiste = h('div', { class: 'reiter mahlzeit-wahl', role: 'radiogroup', 'aria-label': 'Mahlzeit' });
  const zeichne = () => fuelle(leiste, MAHLZEITEN.map((m) => h('button', {
    type: 'button', class: 'reiter-knopf' + (m.id === aktiv ? ' aktiv' : ''), role: 'radio', 'aria-checked': String(m.id === aktiv),
    onclick: () => { aktiv = m.id; aenderung(m.id); zeichne(); },
  }, m.text)));
  zeichne();
  return leiste;
}
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
    const dieseWoche = plan.filter((p) => p.datum >= vonBis[0] && p.datum <= vonBis[1] && (nachId.has(p.rezept_id) || (!p.rezept_id && p.titel)));
    const mitRezept = dieseWoche.filter((p) => nachId.has(p.rezept_id));

    fuelle(bereich,
      h('div', { class: 'wochen-kopf' },
        h('button', { class: 'rund', type: 'button', 'aria-label': 'Vorige Woche', onclick: () => gehe('#/plan/' + isoDatum(plusTage(montag, -7)), true) }, icon('zurueck', { groesse: 20 })),
        h('div', { class: 'wochen-titel' },
          h('strong', {}, 'KW ' + kalenderwoche(montag)),
          h('span', {}, `${kurz(tage[0])} – ${kurz(tage[6])}`),
          istDieseWoche ? null : h('button', { class: 'link', type: 'button', onclick: () => gehe('#/plan', true) }, 'Zur aktuellen Woche')),
        h('button', { class: 'rund', type: 'button', 'aria-label': 'Nächste Woche', onclick: () => gehe('#/plan/' + isoDatum(plusTage(montag, 7)), true) }, icon('weiter', { groesse: 20 }))),

      ...tage.map((tag) => {
        const datum = isoDatum(tag);
        const eintraege = dieseWoche.filter((p) => p.datum === datum)
          .sort((a, b) => mahlzeitRang(a.mahlzeit) - mahlzeitRang(b.mahlzeit) || a.erstellt_am.localeCompare(b.erstellt_am));
        return h('section', { class: 'tag' + (datum === isoDatum(new Date()) ? ' heute' : '') + (datum < isoDatum(new Date()) ? ' vorbei' : '') },
          h('div', { class: 'tag-kopf' }, h('span', {}, tagName(tag)), h('span', { class: 'meta' }, kurz(tag))),
          ...eintraege.map((p) => eintragZeile(p, nachId.get(p.rezept_id))),
          h('button', { class: 'btn text links klein', type: 'button', onclick: () => einplanen(datum, rezepte, plan, freieMahlzeit(eintraege)) }, icon('plus', { groesse: 16 }), 'Hinzufügen'));
      }),

      mitRezept.length ? h('button', {
        class: 'btn', type: 'button',
        onclick: () => aufDieListe(mitRezept.map((p) => ({ rezept: nachId.get(p.rezept_id), portionen: p.portionen, planEintrag: p }))),
      }, icon('wagen', { groesse: 20 }), 'Zutaten dieser Woche auf die Einkaufsliste')
        : !dieseWoche.length ? h('p', { class: 'leer' }, 'Für diese Woche ist noch nichts geplant.') : null,
    );
  }

  function eintragZeile(p, rezept) {
    const entfernen = h('button', {
      class: 'mini', type: 'button', 'aria-label': 'Aus dem Plan entfernen',
      onclick: () => speicher.loesche('plan', p.id).catch(zeigeFehler),
    }, icon('kreuz', { groesse: 18 }));

    // Etikett Früh / Mittag / Abend – Antippen ändert die Mahlzeit
    const m = MAHLZEITEN.find((x) => x.id === p.mahlzeit);
    const etikett = h('button', {
      type: 'button', class: 'mahlzeit-etikett' + (m ? ' ' + m.id : ' leer'), 'aria-label': 'Mahlzeit ändern',
      onclick: async () => {
        const wahl = await waehle('Welche Mahlzeit?', [
          ...MAHLZEITEN.map((x) => ({ wert: x.id, text: x.text, klasse: x.id === p.mahlzeit ? '' : 'zweit' })),
          { wert: 'keine', text: 'Ohne Angabe', klasse: 'text' },
        ]);
        if (!wahl) return;
        const neu = wahl === 'keine' ? null : wahl;
        if (neu !== (p.mahlzeit || null)) speicher.speichere('plan', { ...p, mahlzeit: neu }).catch(zeigeFehler);
      },
    }, m ? m.kurz : '–');

    // Essen ohne Rezept
    if (!rezept) {
      return h('div', { class: 'plan-eintrag frei' },
        etikett,
        h('span', { class: 'plan-titel', title: p.titel }, icon('teller', { groesse: 16 }), h('span', { class: 'plan-name' }, p.titel)),
        entfernen);
    }

    const aendere = async (schritt) => {
      try {
        await speicher.speichere('plan', { ...p, portionen: Math.max(1, (p.portionen || rezept.portionen || 2) + schritt) });
      } catch (f) { zeigeFehler(f); }
    };
    return h('div', { class: 'plan-eintrag' },
      etikett,
      h('button', { class: 'plan-titel', type: 'button', title: rezept.titel, onclick: () => gehe('#/rezept/' + rezept.id) },
        h('span', { class: 'plan-name' }, rezept.titel), p.auf_liste ? h('span', { class: 'marke-klein', title: 'Schon auf der Einkaufsliste' }, icon('wagen', { groesse: 14 })) : null),
      h('div', { class: 'portionen klein' },
        h('button', { class: 'rund klein', type: 'button', 'aria-label': 'Weniger Personen', onclick: () => aendere(-1) }, icon('minus', { groesse: 14 })),
        h('span', {}, (p.portionen || rezept.portionen || '?') + ' P.'),
        h('button', { class: 'rund klein', type: 'button', 'aria-label': 'Mehr Personen', onclick: () => aendere(1) }, icon('plus', { groesse: 14 }))),
      entfernen);
  }

  await zeichne();
  const beiDaten = (e) => { if (e.detail.tabelle === 'plan' || e.detail.tabelle === 'rezepte') zeichne(); };
  window.addEventListener('daten', beiDaten);
  return () => window.removeEventListener('daten', beiDaten);
}

// Merkt sich den zuletzt gewählten Reiter
let letzterReiter = null;

// Auswahl: freier Eintrag oder Rezept (mit Vorschlägen). Ergebnis: { rezept | titel, mahlzeit } | null
export function waehleEintrag(rezepte, plan, vorschlag = 'abend') {
  let mahlzeit = vorschlag;
  let vonHand = false; // Hat der Nutzer die Mahlzeit selbst gewählt?
  const mitMahlzeit = (wahl) => {
    // Frühstücksrezepte landen beim Frühstück, solange nichts anderes gewählt wurde
    if (!vonHand && wahl.rezept && (wahl.rezept.schlagwoerter || []).includes('Frühstück')) return { ...wahl, mahlzeit: 'frueh' };
    return { ...wahl, mahlzeit };
  };
  const statistik = verlauf(plan);
  const reiter = [
    { id: 'oft', text: 'Oft & gern', icon: 'herz', liste: () => oftUndGern(rezepte, statistik), leer: 'Hier erscheinen Rezepte, die ihr mindestens zweimal gekocht habt.' },
    { id: 'lange', text: 'Lange nicht mehr', icon: 'uhr', liste: () => langeNicht(rezepte, statistik), leer: 'Alles, was ihr schon länger nicht gekocht habt.' },
    { id: 'alle', text: 'Alle', icon: 'buch', liste: () => [...rezepte].sort((a, b) => a.titel.localeCompare(b.titel, 'de')), leer: 'Noch keine Rezepte vorhanden.' },
  ];
  let aktiv = letzterReiter || (oftUndGern(rezepte, statistik).length ? 'oft' : 'alle');

  return blatt((fertigRoh) => {
    const fertig = (wahl) => fertigRoh(wahl ? mitMahlzeit(wahl) : null);
    const frei = h('input', { type: 'text', placeholder: 'Ohne Rezept, z. B. Kalt, Reste, Pizza', enterkeyhint: 'done', autocomplete: 'off' });
    const freiFormular = h('form', { class: 'frei-eintrag', onsubmit: (e) => { e.preventDefault(); if (frei.value.trim()) fertig({ titel: frei.value.trim() }); } },
      frei, h('button', { class: 'btn klein', type: 'submit' }, 'Eintragen'));
    const bekannte = freieTitel(plan);
    const reiterLeiste = h('div', { class: 'reiter' });
    const suche = h('input', { type: 'search', class: 'suche', placeholder: 'Rezept suchen …', autocomplete: 'off' });
    const liste = h('div', { class: 'auswahl-liste' });

    const zeichne = () => {
      fuelle(reiterLeiste, reiter.map((r) => h('button', {
        type: 'button', class: 'reiter-knopf' + (r.id === aktiv ? ' aktiv' : ''),
        onclick: () => { aktiv = r.id; letzterReiter = r.id; zeichne(); },
      }, icon(r.icon, { groesse: 16 }), r.text)));
      const b = suche.value.trim().toLowerCase();
      const r = reiter.find((x) => x.id === aktiv);
      const treffer = r.liste().filter((x) => !b || x.titel.toLowerCase().includes(b));
      fuelle(liste, ...treffer.map((x) => h('button', { type: 'button', class: 'auswahl-eintrag', onclick: () => fertig({ rezept: x }) },
        h('span', { class: 'auswahl-titel' }, x.titel),
        h('span', { class: 'meta' }, beschreibung(statistik, x.id)))),
      treffer.length ? null : h('p', { class: 'meta leer-klein' }, b ? 'Kein Rezept gefunden.' : r.leer));
    };
    suche.addEventListener('input', zeichne);
    zeichne();
    return [
      h('h2', { class: 'blatt-titel' }, 'Was gibt es?'),
      mahlzeitWahl(mahlzeit, (id) => { mahlzeit = id; vonHand = true; }),
      freiFormular,
      bekannte.length ? h('div', { class: 'chips' }, bekannte.map((t) => h('button', { type: 'button', class: 'chip', onclick: () => fertig({ titel: t }) }, t))) : null,
      reiterLeiste, suche, liste,
      h('button', { class: 'btn text', type: 'button', onclick: () => fertig(null) }, 'Abbrechen'),
    ];
  }, { voll: true });
}

async function einplanen(datum, rezepte, plan, vorschlag) {
  const wahl = await waehleEintrag(rezepte, plan, vorschlag);
  if (!wahl) return;
  try {
    if (wahl.rezept) {
      await speicher.speichere('plan', { id: speicher.neueId(), datum, mahlzeit: wahl.mahlzeit, rezept_id: wahl.rezept.id, portionen: wahl.rezept.portionen || 2, auf_liste: false });
    } else {
      await speicher.speichere('plan', { id: speicher.neueId(), datum, mahlzeit: wahl.mahlzeit, rezept_id: null, titel: wahl.titel, portionen: null, auf_liste: false });
    }
  } catch (f) {
    zeigeFehler(f);
  }
}

// Aus der Rezeptansicht: Tag in den nächsten zwei Wochen wählen
export async function inDenWochenplan(rezept, portionen) {
  const tage = [...Array(14)].map((_, i) => plusTage(new Date(), i));
  let mahlzeit = (rezept.schlagwoerter || []).includes('Frühstück') ? 'frueh' : 'abend';
  const datum = await blatt((fertig) => [
    h('h2', { class: 'blatt-titel' }, 'Wann gibt es das?'),
    mahlzeitWahl(mahlzeit, (id) => { mahlzeit = id; }),
    h('div', { class: 'auswahl-liste' }, tage.map((t) => h('button', {
      type: 'button', class: 'auswahl-eintrag zeilig', onclick: () => fertig(isoDatum(t)),
    }, h('span', { class: 'auswahl-titel' }, tagName(t)), h('span', { class: 'meta' }, kurz(t))))),
    h('button', { class: 'btn text', type: 'button', onclick: () => fertig(null) }, 'Abbrechen'),
  ], { voll: true });
  if (!datum) return;
  try {
    await speicher.speichere('plan', { id: speicher.neueId(), datum, mahlzeit, rezept_id: rezept.id, portionen: portionen || rezept.portionen || 2, auf_liste: false });
    const text = MAHLZEITEN.find((m) => m.id === mahlzeit).text;
    zeigeMeldung(`Eingeplant: ${tagName(ausIso(datum)).replace('Heute · ', 'heute, ').replace('Morgen · ', 'morgen, ')} ${kurz(ausIso(datum))}, ${text}`);
  } catch (f) {
    zeigeFehler(f);
  }
}
