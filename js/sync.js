// Abgleich zwischen dem lokalen Speicher und Supabase.
// Ablauf: zuerst eigene Änderungen senden (outbox), dann den Stand des Haushalts holen.
// Ohne Netz sammelt sich alles in der outbox und wird später nachgesendet.
import * as speicher from './speicher.js';
import { istKonfiguriert, client, sitzung, ladeHaushalt, erreichbar, pruefe } from './supabase.js';

// Spalten, die zum Server gehen (lokale Zusatzfelder bleiben auf dem Gerät).
const SPALTEN = {
  rezepte: ['id', 'haushalt_id', 'titel', 'portionen', 'zutaten', 'schritte', 'schlagwoerter', 'notiz', 'quelle_url',
    'fotos', 'vorschau', 'rohtext', 'erstellt_am', 'geaendert_am'],
  plan: ['id', 'haushalt_id', 'datum', 'rezept_id', 'titel', 'mahlzeit', 'portionen', 'auf_liste', 'erstellt_am', 'geaendert_am'],
  einkauf: ['id', 'haushalt_id', 'name', 'menge', 'einheit', 'erledigt', 'rezept_id', 'sortierung', 'erstellt_am', 'geaendert_am'],
};

// lokal | abgemeldet | kein-haushalt | offline | pausiert | laeuft | ok | fehler
export let status = istKonfiguriert() ? 'start' : 'lokal';
export let haushalt = null;

let laeuft = false;
let nochmal = false;
let ausloeser = null;
let pausiertTimer = null;
let kanal = null;
let kanalHaushalt = null;

function setzeStatus(neu) {
  if (neu !== 'pausiert') clearTimeout(pausiertTimer);
  if (status === neu) return;
  status = neu;
  window.dispatchEvent(new CustomEvent('syncstatus', { detail: { status } }));
}

export function anstossen(verzoegerung = 400) {
  clearTimeout(ausloeser);
  ausloeser = setTimeout(synchronisiere, verzoegerung);
}

export async function synchronisiere() {
  if (laeuft) { nochmal = true; return; }
  laeuft = true;
  try {
    do {
      nochmal = false;
      await einmal();
    } while (nochmal);
  } catch (fehler) {
    if (fehler.netz || navigator.onLine === false) {
      if (navigator.onLine === false || !(await erreichbar())) {
        setzeStatus(navigator.onLine === false ? 'offline' : 'pausiert');
        if (status === 'pausiert') {
          clearTimeout(pausiertTimer);
          pausiertTimer = setTimeout(synchronisiere, 15000);
        }
      } else {
        setzeStatus('fehler');
      }
    } else {
      console.error('Synchronisierung fehlgeschlagen', fehler);
      setzeStatus('fehler');
    }
  } finally {
    laeuft = false;
  }
}

async function einmal() {
  if (!istKonfiguriert()) return setzeStatus('lokal');
  const sb = await client();
  if (!(await sitzung())) {
    beendeEchtzeit();
    haushalt = null;
    return setzeStatus('abgemeldet');
  }
  haushalt = (await speicher.holeMeta('haushalt')) || null;
  if (navigator.onLine === false) return setzeStatus(haushalt ? 'offline' : 'kein-haushalt');

  setzeStatus('laeuft');
  // Mitgliedschaft prüfen (kann sich auf einem anderen Gerät geändert haben)
  const aktuell = await ladeHaushalt();
  if (!aktuell) {
    await speicher.setzeMeta('haushalt', undefined);
    haushalt = null;
    beendeEchtzeit();
    return setzeStatus('kein-haushalt');
  }
  if (!haushalt || haushalt.id !== aktuell.id) await speicher.allesVormerken();
  haushalt = aktuell;
  await speicher.setzeMeta('haushalt', aktuell);

  await sendeAenderungen(sb);
  await holeStand(sb);
  starteEchtzeit(sb);
  setzeStatus('ok');
  ladeFotosVor(sb);
}

async function sendeAenderungen(sb) {
  for (const eintrag of await speicher.outboxEintraege()) {
    try {
      if (eintrag.art === 'upsert') {
        const d = await speicher.hole(eintrag.tabelle, eintrag.id);
        if (d) {
          const zeile = { haushalt_id: haushalt.id };
          for (const s of SPALTEN[eintrag.tabelle]) if (s !== 'haushalt_id' && s in d) zeile[s] = d[s];
          pruefe(await sb.from(eintrag.tabelle).upsert(zeile));
        }
      } else if (eintrag.art === 'loeschen') {
        pruefe(await sb.from(eintrag.tabelle).delete().eq('id', eintrag.id));
      } else if (eintrag.art === 'foto') {
        const blob = await speicher.holeFoto(eintrag.pfad);
        if (blob) {
          pruefe(await sb.storage.from('fotos').upload(`${haushalt.id}/${eintrag.pfad}`, blob,
            { upsert: true, contentType: 'image/jpeg' }));
        }
      } else if (eintrag.art === 'foto-loeschen') {
        pruefe(await sb.storage.from('fotos').remove([`${haushalt.id}/${eintrag.pfad}`]));
      }
    } catch (fehler) {
      if (fehler.netz) throw fehler;
      // Vom Server abgelehnt (z. B. Rezept inzwischen gelöscht): verwerfen, damit die Warteschlange nicht hängt
      console.warn('Änderung vom Server abgelehnt und verworfen', eintrag, fehler);
    }
    await speicher.entferneOutbox(eintrag.schluessel);
  }
}

async function holeStand(sb) {
  const offen = await speicher.outboxEintraege();
  for (const tabelle of speicher.TABELLEN) {
    const zeilen = [];
    for (let ab = 0; ; ab += 1000) {
      const seite = pruefe(await sb.from(tabelle).select('*').range(ab, ab + 999));
      zeilen.push(...seite);
      if (seite.length < 1000) break;
    }
    const behalten = new Set(offen.filter((e) => e.tabelle === tabelle).map((e) => e.id));
    await speicher.uebernimmVomServer(tabelle, zeilen, behalten);
  }
}

// Änderungen von anderen Geräten sofort holen.
function starteEchtzeit(sb) {
  if (kanal && kanalHaushalt === haushalt.id) return;
  beendeEchtzeit();
  kanalHaushalt = haushalt.id;
  kanal = sb.channel('haushalt-' + haushalt.id);
  for (const tabelle of speicher.TABELLEN) {
    kanal.on('postgres_changes', { event: '*', schema: 'public', table: tabelle }, () => anstossen(600));
  }
  kanal.subscribe();
}

export function beendeEchtzeit() {
  if (kanal) {
    client().then((sb) => sb.removeChannel(kanal)).catch(() => {});
    kanal = null;
    kanalHaushalt = null;
  }
}

// Fotos im Hintergrund aufs Gerät holen, damit Rezepte auch offline lesbar sind.
let vorladenLaeuft = false;

async function ladeFotosVor(sb) {
  if (vorladenLaeuft) return;
  vorladenLaeuft = true;
  try {
    for (const r of await speicher.alle('rezepte')) {
      for (const pfad of [r.vorschau, ...r.fotos].filter(Boolean)) {
        if (!(await speicher.hatFoto(pfad))) await ladeFotoHerunter(sb, pfad);
      }
    }
  } catch (e) {
    /* nächster Versuch beim nächsten Abgleich */
  } finally {
    vorladenLaeuft = false;
  }
}

async function ladeFotoHerunter(sb, pfad) {
  const { data, error } = await sb.storage.from('fotos').download(`${haushalt.id}/${pfad}`);
  if (error || !data) return null;
  await speicher.legeFotoAb(pfad, data, { hochladen: false });
  return data;
}

// Foto lokal oder vom Server.
export async function ladeFoto(pfad) {
  const lokal = await speicher.holeFoto(pfad);
  if (lokal || !haushalt || navigator.onLine === false) return lokal || null;
  try {
    return await ladeFotoHerunter(await client(), pfad);
  } catch (e) {
    return null;
  }
}

window.addEventListener('outbox', () => anstossen());
window.addEventListener('online', () => anstossen(0));
window.addEventListener('offline', () => { if (haushalt) setzeStatus('offline'); });
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') anstossen(0);
});
