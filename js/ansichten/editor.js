// Rezept selbst eingeben oder bearbeiten: Titel, Portionen, Zutaten (mit Überschriften),
// Schritte (mit zugeordneten Zutaten), Schlagwörter, Fotos.
import { h, mitwachsen, fuelle } from '../dom.js';
import * as speicher from '../speicher.js';
import { setzeKopf, zeigeTabs, zeigeFab, zeigeMeldung, zeigeFehler, waehleFotos, waehle, versteckeMeldung, blatt } from '../ui.js';
import { gehe, geheZurueck } from '../navigation.js';
import { bildUrl } from '../bilder.js';
import { icon } from '../icons.js';
import { zerlegeZutat, zutatText } from '../zutaten.js';
import { alleSchlagwoerter } from '../suche.js';
import { schrittText, istManuell, zutatId, zutatenFuerSchritt } from '../schritte.js';
import { holeEntwurf, bearbeite, starteEntwurf, fuegeFotosHinzu, entferneFoto, entwurfFoto, speichereEntwurf, verwerfeEntwurf } from '../entwurf.js';

// "Für den Teig:" → Überschrift
const istUeberschriftText = (text) => /:\s*$/.test(text) && !/^\s*\d/.test(text);

export async function zeige(bereich, id) {
  zeigeTabs(null);
  zeigeFab(false);

  let entwurf = holeEntwurf();
  if (id) {
    if (!entwurf || entwurf.rezept.id !== id) {
      const rezept = await speicher.hole('rezepte', id);
      if (!rezept) { gehe('#/', true); return; }
      entwurf = bearbeite(rezept);
    }
  } else if (!entwurf || !entwurf.neu) {
    entwurf = starteEntwurf();
  }
  const r = entwurf.rezept;
  setzeKopf({ titel: entwurf.neu ? 'Neues Rezept' : 'Bearbeiten', zurueck: true });

  // Zutaten werden als Textzeilen bearbeitet ("250 g Mehl") und beim Speichern zerlegt.
  // Jede Zeile behält ihre id, damit Zuordnungen zu Schritten erhalten bleiben.
  const zutatenZeilen = r.zutaten.map((z) => ({
    id: z.id || zutatId(),
    ueberschrift: Boolean(z.ueberschrift),
    text: z.ueberschrift ? z.name : zutatText(z),
  }));
  const schritte = r.schritte.map((s) => (istManuell(s) ? { text: s.text, zutaten: [...s.zutaten] } : { text: schrittText(s) }));
  const alleRezepte = await speicher.alle('rezepte');

  const titel = h('input', { type: 'text', value: r.titel === 'Ohne Titel' ? '' : r.titel, placeholder: 'z. B. Omas Apfelkuchen', enterkeyhint: 'next', class: 'titel-feld' });
  titel.addEventListener('input', () => { r.titel = titel.value; });

  const portionen = h('input', { type: 'number', min: '1', max: '99', inputmode: 'numeric', value: r.portionen || '', placeholder: '4' });
  portionen.addEventListener('input', () => { r.portionen = parseInt(portionen.value, 10) || null; });

  const notiz = mitwachsen(h('textarea', { rows: 2, value: r.notiz, placeholder: 'Eigene Anmerkungen …' }));
  notiz.addEventListener('input', () => { r.notiz = notiz.value; });

  const quelle = h('input', { type: 'url', value: r.quelle_url || '', placeholder: 'https://…', inputmode: 'url' });
  quelle.addEventListener('input', () => { r.quelle_url = quelle.value.trim() || null; });

  const fotos = h('div', { class: 'foto-streifen' });
  const schlagwoerter = h('div', { class: 'chips umbruch' });
  const zutatenListe = h('div', { class: 'zeilen' });
  const schritteListe = h('div', { class: 'zeilen' });

  function uebernimmZutaten() {
    r.zutaten = zutatenZeilen
      .filter((z) => z.text.trim())
      .map((z) => {
        if (z.ueberschrift) return { id: z.id, ueberschrift: true, name: z.text.replace(/:\s*$/, '').trim() };
        const teile = zerlegeZutat(z.text);
        return teile.ueberschrift ? { id: z.id, ueberschrift: true, name: teile.name } : { ...teile, id: z.id };
      });
  }

  function uebernimmSchritte() {
    r.schritte = schritte.map((s) => (s.zutaten ? { text: s.text, zutaten: s.zutaten } : s.text));
  }

  // ---------- Fotos ----------

  async function zeichneFotos() {
    const elemente = [];
    for (const pfad of r.fotos) {
      const blob = await entwurfFoto(pfad);
      elemente.push(h('figure', {},
        blob ? h('img', { src: bildUrl(blob), alt: '' }) : h('div', { class: 'platzhalter klein' }, icon('bild')),
        h('button', {
          class: 'foto-entfernen', type: 'button', 'aria-label': 'Foto entfernen',
          onclick: () => { entferneFoto(pfad); zeichneFotos(); },
        }, icon('kreuz', { groesse: 16 }))));
    }
    elemente.push(h('button', { class: 'foto-neu', type: 'button', onclick: fotoHinzufuegen }, icon('kamera'), h('span', {}, 'Foto')));
    fuelle(fotos, ...elemente);
  }

  function fotoHinzufuegen() {
    waehle('Foto hinzufügen', [
      { wert: 'kamera', text: 'Foto aufnehmen', icon: 'kamera', klasse: '', sofort: () => waehleFotos('kamera', fotosGewaehlt) },
      { wert: 'galerie', text: 'Aus der Galerie', icon: 'bild', sofort: () => waehleFotos('galerie', fotosGewaehlt) },
    ]);
  }

  async function fotosGewaehlt(dateien) {
    zeigeMeldung('Foto wird vorbereitet …', 0);
    try {
      await fuegeFotosHinzu(dateien);
      versteckeMeldung();
    } catch (fehler) {
      zeigeFehler(fehler);
    }
    zeichneFotos();
  }

  // ---------- Schlagwörter ----------

  function zeichneSchlagwoerter() {
    const alle = alleSchlagwoerter([...alleRezepte, r]);
    fuelle(schlagwoerter,
      ...alle.map((s) => h('button', {
        type: 'button', class: 'chip' + (r.schlagwoerter.includes(s) ? ' aktiv' : ''),
        onclick: () => {
          r.schlagwoerter = r.schlagwoerter.includes(s) ? r.schlagwoerter.filter((x) => x !== s) : [...r.schlagwoerter, s];
          zeichneSchlagwoerter();
        },
      }, s)),
      h('button', {
        type: 'button', class: 'chip neu',
        onclick: () => {
          const neu = (prompt('Neues Schlagwort, z. B. „Mag Melli“ oder „Schnell“:') || '').trim();
          if (neu && !r.schlagwoerter.includes(neu)) r.schlagwoerter = [...r.schlagwoerter, neu];
          zeichneSchlagwoerter();
        },
      }, icon('plus', { groesse: 16 }), 'Eigenes'));
  }

  // ---------- Zeilenlisten (Zutaten und Schritte) ----------
  // Enter legt eine neue Zeile an, Rücktaste in leerer Zeile löscht sie,
  // Einfügen von mehreren Zeilen teilt sie auf.

  function zeichneZeilen(container, eintraege, art) {
    const mehrzeilig = art === 'schritte';
    const neuerEintrag = () => (mehrzeilig ? { text: '' } : { id: zutatId(), text: '', ueberschrift: false });
    let nummer = 0;

    const elemente = eintraege.map((eintrag, i) => {
      const platzhalter = mehrzeilig ? 'Was ist zu tun?' : eintrag.ueberschrift ? 'z. B. Für den Teig' : 'z. B. 250 g Mehl';
      const feld = mehrzeilig
        ? mitwachsen(h('textarea', { rows: 1, value: eintrag.text, placeholder: platzhalter }))
        : h('input', { type: 'text', value: eintrag.text, placeholder: platzhalter, enterkeyhint: 'next' });
      const zeile = h('div', { class: 'zeile' + (eintrag.ueberschrift ? ' ueberschrift' : '') });

      feld.addEventListener('input', () => {
        eintrag.text = feld.value;
        if (!mehrzeilig && !eintrag.ueberschrift && istUeberschriftText(feld.value)) {
          eintrag.ueberschrift = true;
          zeile.classList.add('ueberschrift');
        }
        geaendert();
      });
      feld.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !(mehrzeilig && e.shiftKey)) {
          e.preventDefault();
          eintraege.splice(i + 1, 0, neuerEintrag());
          geaendert();
          neuZeichnen(i + 1);
        } else if (e.key === 'Backspace' && !feld.value && eintraege.length > 1) {
          e.preventDefault();
          eintraege.splice(i, 1);
          geaendert();
          neuZeichnen(Math.max(0, i - 1));
        }
      });
      feld.addEventListener('paste', (e) => {
        const text = e.clipboardData && e.clipboardData.getData('text');
        if (!text || !text.includes('\n')) return;
        e.preventDefault();
        const teile = text.split(/\r?\n/).map((s) => s.replace(/^\s*\d+[.)]\s+/, '').trim()).filter(Boolean)
          .map((t) => (mehrzeilig ? { text: t } : { id: zutatId(), text: t, ueberschrift: istUeberschriftText(t) }));
        if (!teile.length) return;
        if (feld.value.trim()) eintraege.splice(i + 1, 0, ...teile); // hinter die aktuelle Zeile
        else eintraege.splice(i, 1, ...teile); // leere Zeile ersetzen
        geaendert();
        neuZeichnen(feld.value.trim() ? i + teile.length : i + teile.length - 1);
      });

      if (mehrzeilig || !eintrag.ueberschrift) nummer++;
      const knoepfe = h('div', { class: 'zeile-knoepfe' },
        i > 0 ? h('button', { type: 'button', class: 'mini', 'aria-label': 'Nach oben', onclick: () => tausche(i, i - 1) }, icon('hoch', { groesse: 18 })) : null,
        h('button', {
          type: 'button', class: 'mini', 'aria-label': 'Zeile löschen',
          onclick: () => { eintraege.splice(i, 1); if (!eintraege.length) eintraege.push(neuerEintrag()); geaendert(); neuZeichnen(); },
        }, icon('kreuz', { groesse: 18 })));

      fuelle(zeile,
        mehrzeilig ? h('span', { class: 'schritt-nr' }, nummer) : eintrag.ueberschrift ? h('span', { class: 'zeile-marke' }, icon('ueberschrift', { groesse: 16 })) : null,
        h('div', { class: 'zeile-inhalt' }, feld, mehrzeilig ? schrittZutatenZeile(eintrag, i) : null),
        knoepfe);
      return zeile;
    });

    function tausche(a, b) {
      [eintraege[a], eintraege[b]] = [eintraege[b], eintraege[a]];
      geaendert();
      neuZeichnen(b);
    }
    function geaendert() {
      if (mehrzeilig) uebernimmSchritte();
      else uebernimmZutaten();
      aktualisiereSchrittZutaten();
    }
    function neuZeichnen(fokus) {
      zeichneZeilen(container, eintraege, art);
      if (fokus != null) {
        const felder = container.querySelectorAll('.zeile-inhalt > input, .zeile-inhalt > textarea');
        if (felder[fokus]) felder[fokus].focus();
      }
    }

    fuelle(container, ...elemente,
      h('div', { class: 'zeilen-aktionen' },
        h('button', {
          type: 'button', class: 'btn text links',
          onclick: () => { eintraege.push(neuerEintrag()); geaendert(); neuZeichnen(eintraege.length - 1); },
        }, icon('plus', { groesse: 18 }), mehrzeilig ? 'Schritt' : 'Zutat'),
        mehrzeilig ? null : h('button', {
          type: 'button', class: 'btn text links',
          onclick: () => { eintraege.push({ id: zutatId(), text: '', ueberschrift: true }); geaendert(); neuZeichnen(eintraege.length - 1); },
        }, icon('ueberschrift', { groesse: 18 }), 'Überschrift')));
  }

  // ---------- Zutaten pro Schritt ----------

  const schrittInfos = [];

  function schrittZutatenZeile(eintrag, i) {
    const info = h('button', { type: 'button', class: 'schritt-zutaten-wahl', onclick: () => zutatenWaehlen(eintrag, i) });
    schrittInfos[i] = info;
    fuelleSchrittInfo(info, i);
    return info;
  }

  function fuelleSchrittInfo(info, i) {
    const eintrag = schritte[i];
    if (!eintrag) return;
    const zugeordnet = zutatenFuerSchritt(r, i);
    fuelle(info,
      icon(eintrag.zutaten ? 'stift' : 'funkeln', { groesse: 14 }),
      h('span', {}, zugeordnet.length ? zugeordnet.map((z) => z.name).join(', ') : 'Keine Zutaten zugeordnet',
        h('span', { class: 'leise' }, eintrag.zutaten ? ' · von Hand' : ' · automatisch')));
  }

  function aktualisiereSchrittZutaten() {
    schritte.forEach((_, i) => { if (schrittInfos[i]) fuelleSchrittInfo(schrittInfos[i], i); });
  }

  async function zutatenWaehlen(eintrag, i) {
    uebernimmZutaten();
    const zutaten = r.zutaten;
    if (!zutaten.some((z) => !z.ueberschrift)) { zeigeMeldung('Bitte zuerst Zutaten eintragen.'); return; }
    const gewaehlt = new Set(zutatenFuerSchritt(r, i).map((z) => z.id));
    const ergebnis = await blatt((fertig) => [
      h('h2', { class: 'blatt-titel' }, `Zutaten für Schritt ${i + 1}`),
      eintrag.text ? h('p', { class: 'hinweis' }, eintrag.text.length > 120 ? eintrag.text.slice(0, 120) + ' …' : eintrag.text) : null,
      h('div', { class: 'auswahl-liste' }, zutaten.map((z) => (z.ueberschrift
        ? h('div', { class: 'auswahl-gruppe' }, z.name)
        : h('label', { class: 'haken-zeile' },
          h('input', { type: 'checkbox', checked: gewaehlt.has(z.id), onchange: (e) => { if (e.target.checked) gewaehlt.add(z.id); else gewaehlt.delete(z.id); } }),
          h('span', {}, zutatText(z)))))),
      h('button', { class: 'btn', type: 'button', onclick: () => fertig('manuell') }, 'Übernehmen'),
      h('button', { class: 'btn zweit', type: 'button', onclick: () => fertig('automatisch') }, icon('funkeln', { groesse: 18 }), 'Automatisch erkennen'),
      h('button', { class: 'btn text', type: 'button', onclick: () => fertig(null) }, 'Abbrechen'),
    ], { voll: true });
    if (ergebnis === 'manuell') eintrag.zutaten = zutaten.filter((z) => gewaehlt.has(z.id)).map((z) => z.id);
    else if (ergebnis === 'automatisch') delete eintrag.zutaten;
    else return;
    uebernimmSchritte();
    aktualisiereSchrittZutaten();
  }

  // ---------- Aufbau ----------

  fuelle(bereich,
    h('label', { class: 'feld' }, 'Titel', titel),
    h('div', { class: 'feld' }, 'Fotos', h('span', { class: 'hinweis' }, ' (optional)'), fotos),
    h('label', { class: 'feld kurz' }, 'Portionen / Personen', portionen),
    h('div', { class: 'feld' }, 'Zutaten',
      h('p', { class: 'hinweis' }, 'Eine Zutat pro Zeile, z. B. „250 g Mehl“. Mit „Überschrift“ gliederst du die Liste, z. B. „Für den Teig“.'),
      zutatenListe),
    h('div', { class: 'feld' }, 'Zubereitung',
      h('p', { class: 'hinweis' }, 'Die Zutaten zu jedem Schritt erkennt die App selbst. Tippe auf die Zeile darunter, um sie zu ändern.'),
      schritteListe),
    h('div', { class: 'feld' }, 'Kategorien & Schlagwörter', schlagwoerter),
    h('label', { class: 'feld' }, 'Notiz', h('span', { class: 'hinweis' }, ' (optional)'), notiz),
    h('label', { class: 'feld' }, 'Quelle', h('span', { class: 'hinweis' }, ' (optional)'), quelle),
    h('button', { class: 'btn', type: 'button', onclick: speichern }, icon('haken', { groesse: 20 }), 'Speichern'),
    entwurf.neu ? h('button', {
      class: 'btn text', type: 'button',
      onclick: () => { if (confirm('Dieses Rezept verwerfen?')) { verwerfeEntwurf(); geheZurueck(); } },
    }, 'Verwerfen') : null,
  );

  if (!zutatenZeilen.length) zutatenZeilen.push({ id: zutatId(), text: '', ueberschrift: false });
  if (!schritte.length) schritte.push({ text: '' });
  uebernimmZutaten();
  uebernimmSchritte();
  zeichneZeilen(zutatenListe, zutatenZeilen, 'zutaten');
  zeichneZeilen(schritteListe, schritte, 'schritte');
  zeichneSchlagwoerter();
  zeichneFotos();

  async function speichern() {
    uebernimmZutaten();
    uebernimmSchritte();
    const neu = entwurf.neu;
    try {
      const gespeichert = await speichereEntwurf();
      zeigeMeldung('Rezept gespeichert');
      if (neu) gehe('#/rezept/' + gespeichert.id, true);
      else geheZurueck('#/rezept/' + gespeichert.id);
    } catch (fehler) {
      zeigeFehler(fehler);
    }
  }
}
