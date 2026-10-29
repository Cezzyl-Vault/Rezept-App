'use strict';

const el = (id) => document.getElementById(id);

// ---------- Speicher (IndexedDB, bleibt auf dem Gerät) ----------

const DB_NAME = 'rezept-app';
const STORE = 'rezepte';
let dbVersprechen;

function oeffneDb() {
  if (!dbVersprechen) {
    dbVersprechen = new Promise((resolve, reject) => {
      const anfrage = indexedDB.open(DB_NAME, 1);
      anfrage.onupgradeneeded = () => anfrage.result.createObjectStore(STORE, { keyPath: 'id' });
      anfrage.onsuccess = () => resolve(anfrage.result);
      anfrage.onerror = () => reject(anfrage.error);
    });
  }
  return dbVersprechen;
}

async function imSpeicher(modus, aktion) {
  const db = await oeffneDb();
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE, modus);
    const anfrage = aktion(t.objectStore(STORE));
    t.oncomplete = () => resolve(anfrage.result);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  });
}

const alleRezepte = () => imSpeicher('readonly', (s) => s.getAll());
const holeRezept = (id) => imSpeicher('readonly', (s) => s.get(id));
const speichereRezept = (rezept) => imSpeicher('readwrite', (s) => s.put(rezept));
const loescheRezept = (id) => imSpeicher('readwrite', (s) => s.delete(id));

// Änderungen an Titel/Notiz werden kurz gesammelt und dann gespeichert.
let ausstehend = null;
let speicherTimer;

function spaeterSpeichern(rezept) {
  ausstehend = rezept;
  clearTimeout(speicherTimer);
  speicherTimer = setTimeout(speichereAusstehend, 500);
}

async function speichereAusstehend() {
  clearTimeout(speicherTimer);
  if (!ausstehend) return;
  const rezept = ausstehend;
  ausstehend = null;
  await speichereRezept(rezept).catch(zeigeFehler);
}

// ---------- Fotos ----------

function ladeBild(datei) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(datei);
    const bild = new Image();
    bild.onload = () => { URL.revokeObjectURL(url); resolve(bild); };
    bild.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Bild konnte nicht gelesen werden')); };
    bild.src = url;
  });
}

// Verkleinert das Foto, damit der Speicher nicht so schnell voll wird.
// 2000 px an der langen Kante reichen, um Rezepttext gut lesen zu können.
function verkleinere(bild, maxKante, qualitaet) {
  const faktor = Math.min(1, maxKante / Math.max(bild.naturalWidth, bild.naturalHeight));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bild.naturalWidth * faktor);
  canvas.height = Math.round(bild.naturalHeight * faktor);
  canvas.getContext('2d').drawImage(bild, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Bild konnte nicht verkleinert werden'))), 'image/jpeg', qualitaet);
  });
}

async function bereiteFotoVor(datei) {
  const bild = await ladeBild(datei);
  return {
    foto: await verkleinere(bild, 2000, 0.85),
    vorschau: await verkleinere(bild, 480, 0.7),
  };
}

// Blob-URLs der aktuell sichtbaren Bilder, damit sie beim Ansichtswechsel freigegeben werden.
let aktiveUrls = [];

function bildUrl(blob) {
  const url = URL.createObjectURL(blob);
  aktiveUrls.push(url);
  return url;
}

function gibUrlsFrei() {
  aktiveUrls.forEach((url) => URL.revokeObjectURL(url));
  aktiveUrls = [];
}

// ---------- Hilfsfunktionen ----------

function neueId() {
  return crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2);
}

const formatiereDatum = (ms) => new Date(ms).toLocaleDateString('de-DE', { day: 'numeric', month: 'long', year: 'numeric' });

let meldungTimer;

function zeigeMeldung(text, dauer = 2200) {
  const meldung = el('meldung');
  meldung.textContent = text;
  meldung.hidden = false;
  clearTimeout(meldungTimer);
  if (dauer) meldungTimer = setTimeout(() => { meldung.hidden = true; }, dauer);
}

function zeigeFehler(fehler) {
  console.error(fehler);
  if (fehler && fehler.name === 'QuotaExceededError') {
    zeigeMeldung('Der Speicher ist voll. Bitte lösche alte Rezepte.', 5000);
  } else {
    zeigeMeldung('Etwas ist schiefgelaufen: ' + (fehler && fehler.message ? fehler.message : fehler), 5000);
  }
}

// ---------- Navigation ----------
// Jede Ansicht hat eine eigene Adresse (#/, #/neu, #/rezept/<id>),
// damit die Zurück-Taste auf Android wie erwartet funktioniert.

let entwurf = [];           // Fotos des Rezepts, das gerade angelegt wird
let rezepte = [];           // alle Rezepte für die Liste
let aktuellesRezept = null; // Rezept in der Detailansicht
let listeScroll = 0;

function gehe(hash, ersetzen = false) {
  if (ersetzen) history.replaceState({ app: true }, '', hash);
  else history.pushState({ app: true }, '', hash);
  zeigeAnsicht().catch(zeigeFehler);
}

function geheZurueck() {
  if (history.state && history.state.app) history.back();
  else gehe('#/', true);
}

async function zeigeAnsicht() {
  await speichereAusstehend();
  el('vollbild').hidden = true;
  el('auswahl').hidden = true;
  gibUrlsFrei();

  const teile = location.hash.replace(/^#\/?/, '').split('/');
  if (teile[0] === 'neu') {
    if (entwurf.length) zeigeNeu();
    else gehe('#/', true);
  } else if (teile[0] === 'rezept' && teile[1]) {
    await zeigeRezept(decodeURIComponent(teile[1]));
  } else {
    await zeigeListe();
  }
}

function setzeAnsicht(name, titel) {
  if (!el('ansicht-liste').hidden) listeScroll = window.scrollY;
  for (const n of ['liste', 'neu', 'rezept']) el('ansicht-' + n).hidden = n !== name;
  el('titel').textContent = titel;
  el('zurueck').hidden = name === 'liste';
  el('neu-btn').hidden = name !== 'liste';
  window.scrollTo(0, 0);
}

window.addEventListener('popstate', () => {
  // Zurück-Taste schließt zuerst das Vollbild.
  if (!el('vollbild').hidden) {
    el('vollbild').hidden = true;
    return;
  }
  zeigeAnsicht().catch(zeigeFehler);
});

el('zurueck').addEventListener('click', geheZurueck);

// ---------- Liste ----------

async function zeigeListe() {
  entwurf = [];
  aktuellesRezept = null;
  setzeAnsicht('liste', 'Meine Rezepte');
  rezepte = await alleRezepte();
  rezepte.sort((a, b) => b.erstellt - a.erstellt);
  zeichneListe();
  window.scrollTo(0, listeScroll);
}

function zeichneListe() {
  gibUrlsFrei();
  const begriff = el('suche').value.trim().toLowerCase();
  const treffer = rezepte.filter((r) => !begriff || (r.titel + ' ' + (r.notiz || '')).toLowerCase().includes(begriff));
  el('liste').replaceChildren(...treffer.map(karte));
  el('leer').hidden = rezepte.length > 0;
  el('suche').hidden = rezepte.length === 0;
  el('keine-treffer').hidden = rezepte.length === 0 || treffer.length > 0;
}

function karte(rezept) {
  const li = document.createElement('li');
  const knopf = document.createElement('button');
  knopf.type = 'button';
  knopf.className = 'karte';
  knopf.addEventListener('click', () => gehe('#/rezept/' + encodeURIComponent(rezept.id)));

  const bild = new Image();
  bild.src = bildUrl(rezept.vorschau || rezept.fotos[0]);
  bild.alt = '';
  bild.loading = 'lazy';

  const text = document.createElement('div');
  text.className = 'karte-text';
  const titel = document.createElement('div');
  titel.className = 'karte-titel';
  titel.textContent = rezept.titel;
  const datum = document.createElement('div');
  datum.className = 'karte-datum';
  datum.textContent = formatiereDatum(rezept.erstellt);
  text.append(titel, datum);

  knopf.append(bild, text);
  li.append(knopf);
  return li;
}

el('suche').addEventListener('input', zeichneListe);

// ---------- Foto hinzufügen ----------

el('neu-btn').addEventListener('click', () => { el('auswahl').hidden = false; });
el('weiteres-foto').addEventListener('click', () => { el('auswahl').hidden = false; });
el('auswahl-abbrechen').addEventListener('click', () => { el('auswahl').hidden = true; });
el('auswahl').addEventListener('click', (e) => { if (e.target === el('auswahl')) el('auswahl').hidden = true; });

el('aus-kamera').addEventListener('click', () => { el('auswahl').hidden = true; el('kamera').click(); });
el('aus-galerie').addEventListener('click', () => { el('auswahl').hidden = true; el('galerie').click(); });

for (const eingabe of [el('kamera'), el('galerie')]) {
  eingabe.addEventListener('change', () => {
    const dateien = [...eingabe.files];
    eingabe.value = ''; // damit dasselbe Foto erneut gewählt werden kann
    fotosHinzufuegen(dateien);
  });
}

async function fotosHinzufuegen(dateien) {
  if (!dateien.length) return;
  const neuerEntwurf = entwurf.length === 0;
  zeigeMeldung(dateien.length > 1 ? 'Fotos werden vorbereitet …' : 'Foto wird vorbereitet …', 0);
  // Nicht speichern, bevor alle Fotos fertig sind.
  el('speichern').disabled = true;
  try {
    for (const datei of dateien) entwurf.push(await bereiteFotoVor(datei));
    el('meldung').hidden = true;
  } catch (fehler) {
    zeigeFehler(fehler);
  } finally {
    el('speichern').disabled = false;
  }
  if (!entwurf.length) return;

  if (neuerEntwurf) {
    el('neu-titel').value = '';
    el('neu-notiz').value = '';
    gehe('#/neu');
  } else {
    zeigeNeu();
  }
}

// ---------- Neues Rezept ----------

function zeigeNeu() {
  if (el('ansicht-neu').hidden) setzeAnsicht('neu', 'Neues Rezept');
  gibUrlsFrei();
  el('neu-fotos').replaceChildren(...entwurf.map((f, i) => {
    const figur = document.createElement('figure');
    const bild = new Image();
    bild.src = bildUrl(f.foto);
    bild.alt = 'Foto ' + (i + 1);
    const entfernen = document.createElement('button');
    entfernen.type = 'button';
    entfernen.className = 'foto-entfernen';
    entfernen.setAttribute('aria-label', 'Foto entfernen');
    entfernen.textContent = '✕';
    entfernen.addEventListener('click', () => {
      entwurf.splice(i, 1);
      if (entwurf.length) zeigeNeu();
      else geheZurueck();
    });
    figur.append(bild, entfernen);
    return figur;
  }));
}

el('speichern').addEventListener('click', async () => {
  if (!entwurf.length) return;
  const knopf = el('speichern');
  knopf.disabled = true;
  const jetzt = Date.now();
  const rezept = {
    id: neueId(),
    titel: el('neu-titel').value.trim() || 'Rezept vom ' + new Date(jetzt).toLocaleDateString('de-DE'),
    notiz: el('neu-notiz').value.trim(),
    erstellt: jetzt,
    fotos: entwurf.map((f) => f.foto),
    vorschau: entwurf[0].vorschau,
  };
  try {
    await speichereRezept(rezept);
    entwurf = [];
    // Bittet den Browser, die Daten nicht automatisch zu löschen.
    if (navigator.storage && navigator.storage.persist) navigator.storage.persist();
    geheZurueck();
    zeigeMeldung('Rezept gespeichert');
  } catch (fehler) {
    zeigeFehler(fehler);
  } finally {
    knopf.disabled = false;
  }
});

// ---------- Rezept ansehen ----------

async function zeigeRezept(id) {
  const rezept = await holeRezept(id);
  if (!rezept) {
    gehe('#/', true);
    zeigeMeldung('Rezept nicht gefunden');
    return;
  }
  aktuellesRezept = rezept;
  setzeAnsicht('rezept', rezept.titel);
  el('rezept-fotos').replaceChildren(...rezept.fotos.map((blob, i) => {
    const bild = new Image();
    bild.src = bildUrl(blob);
    bild.alt = rezept.titel + ' – Foto ' + (i + 1);
    bild.addEventListener('click', () => oeffneVollbild(bild.src));
    return bild;
  }));
  el('rezept-titel').value = rezept.titel;
  el('rezept-notiz').value = rezept.notiz || '';
  el('rezept-datum').textContent = 'Gespeichert am ' + formatiereDatum(rezept.erstellt);
}

el('rezept-titel').addEventListener('input', () => {
  const titel = el('rezept-titel').value.trim();
  if (!aktuellesRezept || !titel) return;
  aktuellesRezept.titel = titel;
  el('titel').textContent = titel;
  spaeterSpeichern(aktuellesRezept);
});

el('rezept-titel').addEventListener('blur', () => {
  // Leerer Titel ist nicht erlaubt: alten Titel wieder anzeigen.
  if (aktuellesRezept && !el('rezept-titel').value.trim()) el('rezept-titel').value = aktuellesRezept.titel;
});

el('rezept-notiz').addEventListener('input', () => {
  if (!aktuellesRezept) return;
  aktuellesRezept.notiz = el('rezept-notiz').value;
  spaeterSpeichern(aktuellesRezept);
});

for (const eingabe of [el('neu-titel'), el('rezept-titel')]) {
  eingabe.addEventListener('keydown', (e) => { if (e.key === 'Enter') eingabe.blur(); });
}

el('loeschen').addEventListener('click', async () => {
  if (!aktuellesRezept) return;
  if (!confirm('„' + aktuellesRezept.titel + '" wirklich löschen?')) return;
  ausstehend = null;
  try {
    await loescheRezept(aktuellesRezept.id);
    geheZurueck();
    zeigeMeldung('Rezept gelöscht');
  } catch (fehler) {
    zeigeFehler(fehler);
  }
});

// ---------- Vollbild ----------

function oeffneVollbild(src) {
  el('vollbild-bild').src = src;
  el('vollbild').classList.remove('gross');
  el('vollbild').hidden = false;
  history.pushState({ vollbild: true }, '');
}

el('vollbild-zu').addEventListener('click', () => history.back());

// Antippen vergrößert das Foto an der angetippten Stelle.
el('vollbild-bild').addEventListener('click', (e) => {
  const rahmen = el('vollbild');
  const bild = el('vollbild-bild');
  const anteilX = e.offsetX / bild.clientWidth;
  const anteilY = e.offsetY / bild.clientHeight;
  rahmen.classList.toggle('gross');
  rahmen.scrollLeft = anteilX * bild.clientWidth - rahmen.clientWidth / 2;
  rahmen.scrollTop = anteilY * bild.clientHeight - rahmen.clientHeight / 2;
});

// ---------- Start ----------

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') speichereAusstehend();
});

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch((fehler) => console.warn('Service Worker nicht registriert', fehler));
}

zeigeAnsicht().catch(zeigeFehler);
