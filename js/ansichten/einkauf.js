// Einkaufsliste: aus Rezepten befüllen, selbst ergänzen, abhaken.
import { h, fuelle } from '../dom.js';
import { icon } from '../icons.js';
import * as speicher from '../speicher.js';
import { setzeKopf, zeigeTabs, zeigeFab, zeigeMeldung, zeigeFehler, blatt } from '../ui.js';
import { zerlegeZutat, zutatText, fasseZusammen, schluessel, normalisiereName } from '../zutaten.js';
import { GRUNDZUTATEN } from '../suche.js';

const offeneSortiert = (liste) => liste.filter((e) => !e.erledigt).sort((a, b) => (a.sortierung || 0) - (b.sortierung || 0));

export async function zeige(bereich) {
  setzeKopf({ titel: 'Einkaufsliste', konto: true });
  zeigeTabs('einkauf');
  zeigeFab(false);

  let bearbeitet = false; // während ein Eintrag bearbeitet wird, nicht neu zeichnen
  let neuZeichnenAusstehend = false;

  const eingabe = h('input', { type: 'text', placeholder: 'Hinzufügen, z. B. 2 l Milch', enterkeyhint: 'done', autocomplete: 'off' });
  const formular = h('form', { class: 'einkauf-neu', onsubmit: (e) => { e.preventDefault(); hinzufuegen(); } },
    eingabe, h('button', { class: 'btn klein', type: 'submit', 'aria-label': 'Hinzufügen' }, icon('plus', { groesse: 22 })));
  const liste = h('div');
  bereich.append(formular, liste);

  async function hinzufuegen() {
    const z = zerlegeZutat(eingabe.value);
    eingabe.value = '';
    eingabe.focus();
    if (!z || z.ueberschrift || !z.name) return;
    try {
      await legeAufListe([{ name: z.name, menge: z.menge_bis ?? z.menge, einheit: z.einheit, rezept_id: null }]);
    } catch (f) {
      zeigeFehler(f);
    }
  }

  async function zeichne() {
    if (bearbeitet) { neuZeichnenAusstehend = true; return; }
    const [eintraege, rezepte] = await Promise.all([speicher.alle('einkauf'), speicher.alle('rezepte')]);
    const titel = new Map(rezepte.map((r) => [r.id, r.titel]));
    const offen = offeneSortiert(eintraege);
    const erledigt = eintraege.filter((e) => e.erledigt).sort((a, b) => b.geaendert_am.localeCompare(a.geaendert_am));

    fuelle(liste, 
      !eintraege.length ? h('div', { class: 'leer' },
        h('div', { class: 'leer-symbol' }, icon('wagen', { groesse: 44 })),
        h('p', {}, 'Die Einkaufsliste ist leer.'),
        h('p', {}, 'Füge Zutaten aus dem Wochenplan oder einem Rezept hinzu – oder tippe oben etwas ein.')) : null,
      h('ul', { class: 'einkauf' }, offen.map((e) => zeile(e, titel))),
      erledigt.length ? h('div', { class: 'erledigt-kopf' },
        h('span', {}, `Erledigt (${erledigt.length})`),
        h('button', {
          class: 'btn text klein', type: 'button',
          onclick: () => speicher.loesche('einkauf', erledigt.map((e) => e.id)).catch(zeigeFehler),
        }, 'Erledigte löschen')) : null,
      erledigt.length ? h('ul', { class: 'einkauf erledigt' }, erledigt.map((e) => zeile(e, titel))) : null,
    );
  }

  function zeile(eintrag, titel) {
    const text = h('button', { type: 'button', class: 'einkauf-text', onclick: () => bearbeite() },
      zutatText(eintrag),
      eintrag.rezept_id && titel.get(eintrag.rezept_id) ? h('span', { class: 'meta' }, titel.get(eintrag.rezept_id)) : null);
    const li = h('li', { class: 'einkauf-zeile' },
      h('input', {
        type: 'checkbox', checked: eintrag.erledigt, 'aria-label': 'Abhaken',
        onchange: (e) => speicher.speichere('einkauf', { ...eintrag, erledigt: e.target.checked }).catch(zeigeFehler),
      }),
      text,
      h('button', { class: 'mini', type: 'button', 'aria-label': 'Löschen', onclick: () => speicher.loesche('einkauf', eintrag.id).catch(zeigeFehler) }, icon('kreuz', { groesse: 18 })));

    function bearbeite() {
      bearbeitet = true;
      const feld = h('input', { type: 'text', value: zutatText(eintrag), enterkeyhint: 'done', class: 'einkauf-feld' });
      let fertig = false;
      const abschliessen = async () => {
        if (fertig) return;
        fertig = true;
        bearbeitet = false;
        const z = zerlegeZutat(feld.value);
        try {
          if (!z || !z.name) await speicher.loesche('einkauf', eintrag.id);
          else if (feld.value.trim() !== zutatText(eintrag)) {
            await speicher.speichere('einkauf', { ...eintrag, name: z.name, menge: z.menge_bis ?? z.menge, einheit: z.einheit });
          } else zeichne();
        } catch (f) {
          zeigeFehler(f);
        }
        if (neuZeichnenAusstehend) { neuZeichnenAusstehend = false; zeichne(); }
      };
      feld.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); feld.blur(); } });
      feld.addEventListener('blur', abschliessen);
      text.replaceWith(feld);
      feld.focus();
      feld.select();
    }
    return li;
  }

  await zeichne();
  const beiDaten = (e) => { if (e.detail.tabelle === 'einkauf') zeichne(); };
  window.addEventListener('daten', beiDaten);
  return () => window.removeEventListener('daten', beiDaten);
}

// Neue Posten auf die Liste; gleiche offene Einträge werden zusammengezählt.
async function legeAufListe(posten) {
  const vorhanden = offeneSortiert(await speicher.alle('einkauf'));
  const nachSchluessel = new Map(vorhanden.map((e) => [schluessel(e.name, e.einheit), e]));
  let sortierung = Math.max(Date.now(), ...vorhanden.map((e) => (e.sortierung || 0) + 1));
  const speichern = [];
  for (const p of posten) {
    const alt = nachSchluessel.get(schluessel(p.name, p.einheit));
    if (alt && (alt.menge != null) === (p.menge != null)) {
      const [summe] = fasseZusammen([alt, p]);
      const neu = { ...alt, menge: summe.menge, einheit: summe.einheit };
      nachSchluessel.set(schluessel(p.name, p.einheit), neu);
      const i = speichern.findIndex((e) => e.id === alt.id);
      if (i >= 0) speichern[i] = neu; else speichern.push(neu);
    } else {
      const neu = { id: speicher.neueId(), name: p.name, menge: p.menge, einheit: p.einheit || '', erledigt: false, rezept_id: p.rezept_id || null, sortierung: sortierung++ };
      nachSchluessel.set(schluessel(p.name, p.einheit), neu);
      speichern.push(neu);
    }
  }
  await speicher.speichereViele('einkauf', speichern);
}

// auswahl: [{ rezept, portionen, planEintrag? }] → Vorschau zum Abwählen, dann auf die Liste
export async function aufDieListe(auswahl) {
  const roh = [];
  for (const { rezept, portionen, planEintrag } of auswahl) {
    const faktor = rezept.portionen && portionen ? portionen / rezept.portionen : 1;
    for (const z of rezept.zutaten) {
      if (z.ueberschrift || !z.name) continue;
      roh.push({
        name: z.name, einheit: z.einheit,
        menge: z.menge == null ? null : z.menge * faktor,
        menge_bis: z.menge_bis == null ? null : z.menge_bis * faktor,
        rezept_id: rezept.id, schonAufListe: Boolean(planEintrag && planEintrag.auf_liste),
      });
    }
  }
  const posten = fasseZusammen(roh).map((p) => ({
    ...p,
    gewaehlt: !p.quellen.every((q) => q.schonAufListe) && !GRUNDZUTATEN.includes(normalisiereName(p.name)),
  }));
  if (!posten.length) { zeigeMeldung('Keine Zutaten gefunden.'); return; }

  const bestaetigt = await blatt((fertig) => {
    const knopf = h('button', { class: 'btn', type: 'button', onclick: () => fertig(true) });
    const aktualisiere = () => {
      const n = posten.filter((p) => p.gewaehlt).length;
      knopf.textContent = n === 1 ? '1 Zutat hinzufügen' : `${n} Zutaten hinzufügen`;
      knopf.disabled = n === 0;
    };
    aktualisiere();
    return [
      h('h2', { class: 'blatt-titel' }, 'Auf die Einkaufsliste'),
      h('p', { class: 'hinweis' }, 'Was du schon da hast, einfach abwählen.'),
      h('div', { class: 'auswahl-liste' }, posten.map((p) => h('label', { class: 'haken-zeile' },
        h('input', { type: 'checkbox', checked: p.gewaehlt, onchange: (e) => { p.gewaehlt = e.target.checked; aktualisiere(); } }),
        h('span', {}, zutatText(p)),
        p.quellen.every((q) => q.schonAufListe) ? h('span', { class: 'meta' }, ' schon übernommen') : null))),
      knopf,
      h('button', { class: 'btn text', type: 'button', onclick: () => fertig(false) }, 'Abbrechen'),
    ];
  }, { voll: true });
  if (!bestaetigt) return;

  try {
    const gewaehlt = posten.filter((p) => p.gewaehlt);
    await legeAufListe(gewaehlt.map((p) => ({ name: p.name, menge: p.menge, einheit: p.einheit, rezept_id: p.quellen.length === 1 || new Set(p.quellen.map((q) => q.rezept_id)).size === 1 ? p.rezept_id : null })));
    const planEintraege = auswahl.map((a) => a.planEintrag).filter((p) => p && !p.auf_liste);
    if (planEintraege.length) await speicher.speichereViele('plan', planEintraege.map((p) => ({ ...p, auf_liste: true })));
    zeigeMeldung(gewaehlt.length === 1 ? '1 Zutat auf der Einkaufsliste' : `${gewaehlt.length} Zutaten auf der Einkaufsliste`);
  } catch (f) {
    zeigeFehler(f);
  }
}
