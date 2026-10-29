// Lokaler Speicher (IndexedDB). Alle Ansichten lesen und schreiben nur hier.
// Jede Änderung landet zusätzlich in der "outbox"; sync.js überträgt sie zu Supabase.

const DB_NAME = 'rezept-app';
const DB_VERSION = 2;
export const TABELLEN = ['rezepte', 'plan', 'einkauf'];

let dbVersprechen;

export function neueId() {
  if (crypto.randomUUID) return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const x = [...b].map((n) => n.toString(16).padStart(2, '0')).join('');
  return `${x.slice(0, 8)}-${x.slice(8, 12)}-${x.slice(12, 16)}-${x.slice(16, 20)}-${x.slice(20)}`;
}

const istUuid = (s) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);

export function normalisiereRezept(r) {
  return {
    id: r.id,
    haushalt_id: r.haushalt_id || null,
    titel: r.titel || 'Ohne Titel',
    portionen: r.portionen || null,
    zutaten: r.zutaten || [],
    schritte: r.schritte || [],
    schlagwoerter: r.schlagwoerter || [],
    notiz: r.notiz || '',
    quelle_url: r.quelle_url || null,
    fotos: r.fotos || [],
    vorschau: r.vorschau || null,
    rohtext: r.rohtext || null,
    erstellt_am: r.erstellt_am || new Date().toISOString(),
    geaendert_am: r.geaendert_am || new Date().toISOString(),
  };
}

// Pfad des Vorschaubilds zu einem Foto: "<rezept>/<foto>.jpg" → "<rezept>/<foto>-v.jpg"
export const vorschauPfad = (fotoPfad) => fotoPfad.replace(/\.jpg$/, '-v.jpg');

function oeffneDb() {
  if (!dbVersprechen) {
    dbVersprechen = new Promise((resolve, reject) => {
      const anfrage = indexedDB.open(DB_NAME, DB_VERSION);
      anfrage.onupgradeneeded = (e) => aktualisiereDb(anfrage.result, anfrage.transaction, e.oldVersion);
      anfrage.onsuccess = () => {
        const db = anfrage.result;
        // Eine neuere App-Version in einem anderen Tab will aktualisieren → Platz machen
        db.onversionchange = () => { db.close(); location.reload(); };
        resolve(db);
      };
      anfrage.onerror = () => reject(anfrage.error);
      anfrage.onblocked = () => {
        window.dispatchEvent(new CustomEvent('db-blockiert'));
      };
    });
  }
  return dbVersprechen;
}

function aktualisiereDb(db, t, alteVersion) {
  if (alteVersion < 1) db.createObjectStore('rezepte', { keyPath: 'id' });
  if (alteVersion < 2) {
    db.createObjectStore('plan', { keyPath: 'id' });
    db.createObjectStore('einkauf', { keyPath: 'id' });
    db.createObjectStore('fotos');
    db.createObjectStore('outbox', { autoIncrement: true });
    db.createObjectStore('meta');
    if (alteVersion === 1) uebernimmVersion1(t);
  }
}

// Version 1 speicherte die Fotos direkt im Rezept. Jetzt liegen sie getrennt unter einem Pfad.
function uebernimmVersion1(t) {
  const rezepte = t.objectStore('rezepte');
  const fotos = t.objectStore('fotos');
  const outbox = t.objectStore('outbox');
  rezepte.openCursor().onsuccess = (e) => {
    const zeiger = e.target.result;
    if (!zeiger) return;
    const alt = zeiger.value;
    if (Array.isArray(alt.fotos) && alt.fotos[0] instanceof Blob) {
      const id = istUuid(alt.id) ? alt.id : neueId();
      const pfade = alt.fotos.map((blob) => {
        const pfad = `${id}/${neueId()}.jpg`;
        fotos.put(blob, pfad);
        outbox.add({ art: 'foto', pfad });
        return pfad;
      });
      if (alt.vorschau instanceof Blob) {
        fotos.put(alt.vorschau, vorschauPfad(pfade[0]));
        outbox.add({ art: 'foto', pfad: vorschauPfad(pfade[0]) });
      }
      const zeit = new Date(alt.erstellt || Date.now()).toISOString();
      const neu = normalisiereRezept({
        id, titel: alt.titel, notiz: alt.notiz, fotos: pfade,
        vorschau: alt.vorschau instanceof Blob ? vorschauPfad(pfade[0]) : null,
        erstellt_am: zeit, geaendert_am: zeit,
      });
      if (id === alt.id) zeiger.update(neu);
      else { zeiger.delete(); rezepte.put(neu); }
      outbox.add({ art: 'upsert', tabelle: 'rezepte', id });
    }
    zeiger.continue();
  };
}

// Führt fn(transaktion) aus. fn darf eine Anfrage oder eine Funktion zurückgeben,
// deren Ergebnis nach Abschluss der Transaktion geliefert wird.
async function transaktion(stores, modus, fn) {
  const db = await oeffneDb();
  return new Promise((resolve, reject) => {
    const t = db.transaction(stores, modus);
    const rueckgabe = fn(t);
    t.oncomplete = () => resolve(
      rueckgabe instanceof IDBRequest ? rueckgabe.result : typeof rueckgabe === 'function' ? rueckgabe() : rueckgabe);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  });
}

export function meldeAenderung(tabelle) {
  window.dispatchEvent(new CustomEvent('daten', { detail: { tabelle } }));
}

function meldeOutbox() {
  window.dispatchEvent(new Event('outbox'));
}

// ---------- Datensätze ----------

export const alle = (tabelle) => transaktion(tabelle, 'readonly', (t) => t.objectStore(tabelle).getAll());
export const hole = (tabelle, id) => transaktion(tabelle, 'readonly', (t) => t.objectStore(tabelle).get(id));

export async function speichere(tabelle, datensatz) {
  const [d] = await speichereViele(tabelle, [datensatz]);
  return d;
}

export async function speichereViele(tabelle, liste) {
  if (!liste.length) return [];
  const jetzt = new Date().toISOString();
  const neu = liste.map((d) => ({ ...d, erstellt_am: d.erstellt_am || jetzt, geaendert_am: jetzt }));
  await transaktion([tabelle, 'outbox'], 'readwrite', (t) => {
    for (const d of neu) {
      t.objectStore(tabelle).put(d);
      t.objectStore('outbox').add({ art: 'upsert', tabelle, id: d.id });
    }
  });
  meldeAenderung(tabelle);
  meldeOutbox();
  return neu;
}

export async function loesche(tabelle, ids) {
  ids = [].concat(ids);
  if (!ids.length) return;
  await transaktion([tabelle, 'outbox'], 'readwrite', (t) => {
    for (const id of ids) {
      t.objectStore(tabelle).delete(id);
      t.objectStore('outbox').add({ art: 'loeschen', tabelle, id });
    }
  });
  meldeAenderung(tabelle);
  meldeOutbox();
}

// Löscht ein Rezept samt Fotos und Einträgen im Wochenplan.
export async function loescheRezept(rezept) {
  const planEintraege = (await alle('plan')).filter((p) => p.rezept_id === rezept.id);
  const fotoPfade = rezept.fotos.flatMap((p) => [p, vorschauPfad(p)]);
  await transaktion(['rezepte', 'plan', 'fotos', 'outbox'], 'readwrite', (t) => {
    const outbox = t.objectStore('outbox');
    t.objectStore('rezepte').delete(rezept.id);
    outbox.add({ art: 'loeschen', tabelle: 'rezepte', id: rezept.id });
    for (const p of planEintraege) {
      t.objectStore('plan').delete(p.id);
      outbox.add({ art: 'loeschen', tabelle: 'plan', id: p.id });
    }
    for (const pfad of fotoPfade) {
      t.objectStore('fotos').delete(pfad);
      outbox.add({ art: 'foto-loeschen', pfad });
    }
  });
  meldeAenderung('rezepte');
  meldeAenderung('plan');
  meldeOutbox();
}

// ---------- Fotos ----------

export const holeFoto = (pfad) => transaktion('fotos', 'readonly', (t) => t.objectStore('fotos').get(pfad));
export const hatFoto = (pfad) => transaktion('fotos', 'readonly', (t) => t.objectStore('fotos').getKey(pfad)).then(Boolean);

export async function legeFotoAb(pfad, blob, { hochladen = true } = {}) {
  await transaktion(['fotos', 'outbox'], 'readwrite', (t) => {
    t.objectStore('fotos').put(blob, pfad);
    if (hochladen) t.objectStore('outbox').add({ art: 'foto', pfad });
  });
  if (hochladen) meldeOutbox();
}

export async function loescheFotos(pfade) {
  if (!pfade.length) return;
  await transaktion(['fotos', 'outbox'], 'readwrite', (t) => {
    for (const pfad of pfade) {
      t.objectStore('fotos').delete(pfad);
      t.objectStore('outbox').add({ art: 'foto-loeschen', pfad });
    }
  });
  meldeOutbox();
}

// ---------- Meta (Haushalt, Einstellungen) ----------

export const holeMeta = (schluessel) => transaktion('meta', 'readonly', (t) => t.objectStore('meta').get(schluessel));
export const setzeMeta = (schluessel, wert) =>
  transaktion('meta', 'readwrite', (t) => (wert === undefined ? t.objectStore('meta').delete(schluessel) : t.objectStore('meta').put(wert, schluessel)));

// ---------- Für sync.js ----------

export function outboxEintraege() {
  return transaktion('outbox', 'readonly', (t) => {
    const liste = [];
    t.objectStore('outbox').openCursor().onsuccess = (e) => {
      const z = e.target.result;
      if (!z) return;
      liste.push({ ...z.value, schluessel: z.key });
      z.continue();
    };
    return () => liste;
  });
}

export const entferneOutbox = (schluessel) => transaktion('outbox', 'readwrite', (t) => t.objectStore('outbox').delete(schluessel));
export const outboxAnzahl = () => transaktion('outbox', 'readonly', (t) => t.objectStore('outbox').count());

// Alle vorhandenen lokalen Daten zum Hochladen vormerken (z. B. nach dem Beitritt zu einem Haushalt).
export async function allesVormerken() {
  await transaktion([...TABELLEN, 'fotos', 'outbox'], 'readwrite', (t) => {
    const outbox = t.objectStore('outbox');
    for (const tabelle of TABELLEN) {
      t.objectStore(tabelle).getAllKeys().onsuccess = (e) => {
        for (const id of e.target.result) outbox.add({ art: 'upsert', tabelle, id });
      };
    }
    t.objectStore('fotos').getAllKeys().onsuccess = (e) => {
      for (const pfad of e.target.result) outbox.add({ art: 'foto', pfad });
    };
  });
  meldeOutbox();
}

// Übernimmt den Stand vom Server. Datensätze mit noch nicht gesendeten Änderungen bleiben unangetastet.
export async function uebernimmVomServer(tabelle, zeilen, behalten) {
  const geaendert = await transaktion(tabelle, 'readwrite', (t) => {
    const store = t.objectStore(tabelle);
    let anders = false;
    store.getAll().onsuccess = (e) => {
      const lokal = new Map(e.target.result.map((d) => [d.id, d]));
      for (const zeile of zeilen) {
        if (behalten.has(zeile.id)) continue;
        const alt = lokal.get(zeile.id);
        if (!alt || Date.parse(alt.geaendert_am) !== Date.parse(zeile.geaendert_am)) {
          store.put(zeile);
          anders = true;
        }
        lokal.delete(zeile.id);
      }
      for (const id of lokal.keys()) {
        if (behalten.has(id)) continue;
        store.delete(id);
        anders = true;
      }
    };
    return () => anders;
  });
  if (geaendert) meldeAenderung(tabelle);
}

// Beim Abmelden: alle Daten dieses Haushalts vom Gerät entfernen.
export async function allesLeeren() {
  await transaktion([...TABELLEN, 'fotos', 'outbox', 'meta'], 'readwrite', (t) => {
    for (const s of [...TABELLEN, 'fotos', 'outbox']) t.objectStore(s).clear();
    t.objectStore('meta').delete('haushalt');
  });
  for (const tabelle of TABELLEN) meldeAenderung(tabelle);
}
