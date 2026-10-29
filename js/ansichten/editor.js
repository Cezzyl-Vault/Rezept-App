// Rezept selbst eingeben oder bearbeiten: Titel, Portionen, Zutaten, Schritte, Schlagwörter, Fotos.
import { h, mitwachsen, fuelle } from '../dom.js';
import * as speicher from '../speicher.js';
import { setzeKopf, zeigeTabs, zeigeFab, zeigeMeldung, zeigeFehler, waehleFotos, waehle, versteckeMeldung } from '../ui.js';
import { gehe, geheZurueck } from '../navigation.js';
import { bildUrl } from '../bilder.js';
import { zerlegeZutat, zutatText } from '../zutaten.js';
import { alleSchlagwoerter } from '../suche.js';
import { holeEntwurf, bearbeite, starteEntwurf, fuegeFotosHinzu, entferneFoto, entwurfFoto, speichereEntwurf, verwerfeEntwurf } from '../entwurf.js';

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

  // Zutaten werden im Editor als Textzeilen bearbeitet ("250 g Mehl") und beim Speichern zerlegt
  const zutatenZeilen = r.zutaten.map((z) => (z.ueberschrift ? z.name + ':' : zutatText(z)));
  const schritte = [...r.schritte];
  const alleRezepte = await speicher.alle('rezepte');

  const titel = h('input', { type: 'text', value: r.titel === 'Ohne Titel' ? '' : r.titel, placeholder: 'z. B. Omas Apfelkuchen', enterkeyhint: 'next' });
  titel.addEventListener('input', () => { r.titel = titel.value; });

  const portionen = h('input', { type: 'number', min: '1', max: '99', inputmode: 'numeric', value: r.portionen || '', placeholder: '4' });
  portionen.addEventListener('input', () => { r.portionen = parseInt(portionen.value, 10) || null; });

  const notiz = mitwachsen(h('textarea', { rows: 2, value: r.notiz, placeholder: 'Eigene Anmerkungen …' }));
  notiz.addEventListener('input', () => { r.notiz = notiz.value; });

  const quelle = h('input', { type: 'url', value: r.quelle_url || '', placeholder: 'https://…', inputmode: 'url' });
  quelle.addEventListener('input', () => { r.quelle_url = quelle.value.trim() || null; });

  const fotos = h('div', { class: 'foto-streifen' });
  const schlagwoerter = h('div', { class: 'chips' });
  const zutatenListe = h('div', { class: 'zeilen' });
  const schritteListe = h('div', { class: 'zeilen' });

  function uebernimmZutaten() {
    r.zutaten = zutatenZeilen.map(zerlegeZutat).filter(Boolean);
  }

  async function zeichneFotos() {
    const elemente = [];
    for (const pfad of r.fotos) {
      const blob = await entwurfFoto(pfad);
      elemente.push(h('figure', {},
        blob ? h('img', { src: bildUrl(blob), alt: '' }) : h('div', { class: 'platzhalter klein' }, '📷'),
        h('button', {
          class: 'foto-entfernen', type: 'button', 'aria-label': 'Foto entfernen',
          onclick: () => { entferneFoto(pfad); zeichneFotos(); },
        }, '✕')));
    }
    elemente.push(h('button', { class: 'foto-neu', type: 'button', onclick: fotoHinzufuegen }, '+ Foto'));
    fuelle(fotos, ...elemente);
  }

  function fotoHinzufuegen() {
    waehle('Foto hinzufügen', [
      { wert: 'kamera', text: '📷 Foto aufnehmen', klasse: '', sofort: () => waehleFotos('kamera', fotosGewaehlt) },
      { wert: 'galerie', text: '🖼️ Aus Galerie wählen', sofort: () => waehleFotos('galerie', fotosGewaehlt) },
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
      }, '+ Eigenes'));
  }

  // Liste mit einzelnen Zeilen; Enter legt eine neue Zeile an, Einfügen von mehreren Zeilen teilt sie auf
  function zeichneZeilen(container, werte, { mehrzeilig, platzhalter, nummeriert, nachAenderung }) {
    const elemente = werte.map((wert, i) => {
      const feld = mehrzeilig
        ? mitwachsen(h('textarea', { rows: 1, value: wert, placeholder: platzhalter }))
        : h('input', { type: 'text', value: wert, placeholder: platzhalter, enterkeyhint: 'next' });
      feld.addEventListener('input', () => { werte[i] = feld.value; nachAenderung(); });
      feld.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !(mehrzeilig && e.shiftKey)) {
          e.preventDefault();
          werte.splice(i + 1, 0, '');
          nachAenderung();
          neuZeichnen(i + 1);
        } else if (e.key === 'Backspace' && !feld.value && werte.length > 1) {
          e.preventDefault();
          werte.splice(i, 1);
          nachAenderung();
          neuZeichnen(Math.max(0, i - 1));
        }
      });
      feld.addEventListener('paste', (e) => {
        const text = e.clipboardData && e.clipboardData.getData('text');
        if (!text || !text.includes('\n')) return;
        e.preventDefault();
        const teile = text.split(/\r?\n/).map((s) => s.replace(/^\s*\d+[.)]\s+/, '').trim()).filter(Boolean);
        if (!teile.length) return;
        if (feld.value.trim()) werte.splice(i + 1, 0, ...teile); // hinter die aktuelle Zeile
        else werte.splice(i, 1, ...teile); // leere Zeile ersetzen
        nachAenderung();
        neuZeichnen(feld.value.trim() ? i + teile.length : i + teile.length - 1);
      });
      return h('div', { class: 'zeile' },
        nummeriert ? h('span', { class: 'schritt-nr' }, i + 1) : null,
        feld,
        h('div', { class: 'zeile-knoepfe' },
          i > 0 ? h('button', { type: 'button', class: 'mini', 'aria-label': 'Nach oben', onclick: () => tausche(i, i - 1) }, '↑') : null,
          h('button', { type: 'button', class: 'mini', 'aria-label': 'Zeile löschen', onclick: () => { werte.splice(i, 1); nachAenderung(); neuZeichnen(); } }, '✕')));
    });
    function tausche(a, b) {
      [werte[a], werte[b]] = [werte[b], werte[a]];
      nachAenderung();
      neuZeichnen(b);
    }
    function neuZeichnen(fokus) {
      zeichneZeilen(container, werte, { mehrzeilig, platzhalter, nummeriert, nachAenderung });
      if (fokus != null) {
        const felder = container.querySelectorAll('input, textarea');
        if (felder[fokus]) felder[fokus].focus();
      }
    }
    fuelle(container, ...elemente,
      h('button', { type: 'button', class: 'btn text links', onclick: () => { werte.push(''); nachAenderung(); neuZeichnen(werte.length - 1); } },
        mehrzeilig ? '+ Schritt' : '+ Zutat'));
  }

  bereich.append(
    h('label', { class: 'feld' }, 'Titel', titel),
    h('div', { class: 'feld' }, 'Fotos', h('span', { class: 'hinweis' }, ' (optional)'), fotos),
    h('label', { class: 'feld kurz' }, 'Portionen / Personen', portionen),
    h('div', { class: 'feld' }, 'Zutaten',
      h('p', { class: 'hinweis' }, 'Eine Zutat pro Zeile, z. B. „250 g Mehl“. Zwischenüberschrift mit Doppelpunkt: „Für den Teig:“'),
      zutatenListe),
    h('div', { class: 'feld' }, 'Zubereitung', schritteListe),
    h('div', { class: 'feld' }, 'Kategorien & Schlagwörter', schlagwoerter),
    h('label', { class: 'feld' }, 'Notiz', h('span', { class: 'hinweis' }, ' (optional)'), notiz),
    h('label', { class: 'feld' }, 'Quelle', h('span', { class: 'hinweis' }, ' (optional)'), quelle),
    h('button', { class: 'btn', type: 'button', onclick: speichern }, 'Speichern'),
    entwurf.neu ? h('button', {
      class: 'btn text', type: 'button',
      onclick: () => { if (confirm('Dieses Rezept verwerfen?')) { verwerfeEntwurf(); geheZurueck(); } },
    }, 'Verwerfen') : null,
  );

  if (!zutatenZeilen.length) zutatenZeilen.push('');
  if (!schritte.length) schritte.push('');
  zeichneZeilen(zutatenListe, zutatenZeilen, { platzhalter: 'z. B. 250 g Mehl', nachAenderung: uebernimmZutaten });
  zeichneZeilen(schritteListe, schritte, { mehrzeilig: true, nummeriert: true, platzhalter: 'Was ist zu tun?', nachAenderung: () => { r.schritte = [...schritte]; } });
  zeichneSchlagwoerter();
  zeichneFotos();
  if (entwurf.neu && !r.titel.trim()) titel.focus();

  async function speichern() {
    uebernimmZutaten();
    r.schritte = [...schritte];
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
