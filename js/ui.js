// Gemeinsame Bedienelemente: Kopfzeile, Tabs, Meldungen, Auswahl-Blätter, Vollbild, Foto-Auswahl.
import { $, h } from './dom.js';

// ---------- Kopfzeile und Tabs ----------

export function setzeKopf({ titel, zurueck = false, aktionen = [], konto = false }) {
  $('titel').textContent = titel;
  document.title = titel === 'Rezepte' ? 'Rezepte' : titel + ' · Rezepte';
  $('zurueck').hidden = !zurueck;
  $('konto-btn').hidden = !konto;
  $('kopf-aktionen').replaceChildren(...aktionen.map((a) =>
    h('button', { class: 'kopf-btn aktion', type: 'button', 'aria-label': a.label, title: a.label, onclick: a.onclick }, a.text)));
}

export function zeigeTabs(aktiv) {
  $('tabs').hidden = !aktiv;
  document.body.classList.toggle('mit-tabs', Boolean(aktiv));
  for (const link of $('tabs').querySelectorAll('a')) link.classList.toggle('aktiv', link.dataset.tab === aktiv);
}

export function zeigeFab(sichtbar) {
  $('neu-btn').hidden = !sichtbar;
}

// ---------- Meldungen ----------

let meldungTimer;

export function zeigeMeldung(text, dauer = 2200) {
  const meldung = $('meldung');
  meldung.textContent = text;
  meldung.hidden = false;
  clearTimeout(meldungTimer);
  if (dauer) meldungTimer = setTimeout(() => { meldung.hidden = true; }, dauer);
}

export function versteckeMeldung() {
  clearTimeout(meldungTimer);
  $('meldung').hidden = true;
}

export function zeigeFehler(fehler) {
  console.error(fehler);
  if (fehler && fehler.name === 'QuotaExceededError') {
    zeigeMeldung('Der Speicher ist voll. Bitte lösche alte Rezepte.', 5000);
  } else {
    zeigeMeldung('Etwas ist schiefgelaufen: ' + (fehler && fehler.message ? fehler.message : fehler), 5000);
  }
}

// ---------- Overlays (Blätter, Vollbild) ----------
// Jedes Overlay bekommt einen eigenen Verlaufseintrag, damit die Zurück-Taste es schließt.

const stapel = [];

export function oeffneOverlay(element, beimSchliessen) {
  $('overlays').append(element);
  stapel.push({ element, beimSchliessen, fertig: null });
  history.pushState({ overlay: true }, '');
}

// Schließt das oberste Overlay; das Versprechen erfüllt sich, wenn der Verlauf zurückgesprungen ist.
export function schliesseOverlay() {
  const oben = stapel[stapel.length - 1];
  if (!oben) return Promise.resolve();
  return new Promise((resolve) => {
    oben.fertig = resolve;
    history.back();
  });
}

// Wird bei popstate aufgerufen. true = ein Overlay wurde geschlossen.
export function overlayZurueck() {
  const oben = stapel.pop();
  if (!oben) return false;
  oben.element.remove();
  if (oben.beimSchliessen) oben.beimSchliessen();
  if (oben.fertig) oben.fertig();
  return true;
}

export function entferneAlleOverlays() {
  while (stapel.length) {
    const e = stapel.pop();
    e.element.remove();
    if (e.beimSchliessen) e.beimSchliessen();
  }
}

// Blatt von unten. baue(fertig) liefert den Inhalt; fertig(wert) schließt mit Ergebnis.
export function blatt(baue, { voll = false } = {}) {
  return new Promise((resolve) => {
    let ergebnis = null;
    const fertig = (wert) => { ergebnis = wert; schliesseOverlay(); };
    const karte = h('div', { class: 'blatt-karte' + (voll ? ' voll' : ''), role: 'dialog' });
    const huelle = h('div', { class: 'blatt', onclick: (e) => { if (e.target === huelle) schliesseOverlay(); } }, karte);
    karte.append(...[baue(fertig)].flat().filter(Boolean));
    oeffneOverlay(huelle, () => resolve(ergebnis));
  });
}

// Auswahl aus Knöpfen. option.sofort() läuft noch im Klick (nötig für Kamera/Galerie auf dem iPhone).
export function waehle(titel, optionen) {
  return blatt((fertig) => [
    titel && h('h2', { class: 'blatt-titel' }, titel),
    ...optionen.map((o) => h('button', {
      class: 'btn ' + (o.klasse ?? 'zweit'),
      type: 'button',
      onclick: () => { if (o.sofort) o.sofort(); fertig(o.wert); },
    }, o.text)),
    h('button', { class: 'btn text', type: 'button', onclick: () => fertig(null) }, 'Abbrechen'),
  ]);
}

// Foto im Vollbild. Antippen vergrößert an der angetippten Stelle.
export function zeigeVollbild(src) {
  const bild = h('img', { src, alt: '' });
  const rahmen = h('div', { class: 'vollbild' },
    h('button', { class: 'kopf-btn vollbild-zu', type: 'button', 'aria-label': 'Schließen', onclick: () => schliesseOverlay() }, '✕'),
    bild);
  bild.addEventListener('click', (e) => {
    const anteilX = e.offsetX / bild.clientWidth;
    const anteilY = e.offsetY / bild.clientHeight;
    rahmen.classList.toggle('gross');
    rahmen.scrollLeft = anteilX * bild.clientWidth - rahmen.clientWidth / 2;
    rahmen.scrollTop = anteilY * bild.clientHeight - rahmen.clientHeight / 2;
  });
  oeffneOverlay(rahmen);
}

// ---------- Fotos wählen ----------
// Das Klicken auf das versteckte Datei-Feld muss direkt im Klick des Nutzers passieren.

let fotoRueckruf = null;

export function waehleFotos(quelle, rueckruf) {
  fotoRueckruf = rueckruf;
  $(quelle === 'kamera' ? 'kamera' : 'galerie').click();
}

for (const id of ['kamera', 'galerie']) {
  const eingabe = $(id);
  eingabe.addEventListener('change', () => {
    const dateien = [...eingabe.files];
    eingabe.value = '';
    if (dateien.length && fotoRueckruf) fotoRueckruf(dateien);
  });
}
