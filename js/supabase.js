// Verbindung zu Supabase: Login, Haushalt, Erreichbarkeit.
// Die Bibliothek wird nur geladen, wenn konfig.js ausgefüllt ist.
import { SUPABASE_URL, SUPABASE_KEY } from './konfig.js';

const BIBLIOTHEK = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm';

let clientVersprechen;

export const istKonfiguriert = () => Boolean(SUPABASE_URL && SUPABASE_KEY);

export function client() {
  if (!clientVersprechen) {
    clientVersprechen = import(BIBLIOTHEK).then(({ createClient }) => createClient(SUPABASE_URL, SUPABASE_KEY));
    clientVersprechen.catch(() => { clientVersprechen = null; });
  }
  return clientVersprechen;
}

// Wirft bei Fehlern; markiert Netzwerkfehler mit .netz = true.
export function pruefe({ data, error }) {
  if (error) {
    const f = new Error(error.message || String(error));
    f.netz = istNetzfehler(error);
    f.original = error;
    throw f;
  }
  return data;
}

export function istNetzfehler(fehler) {
  const text = String((fehler && (fehler.message || fehler.details)) || fehler);
  return /failed to fetch|networkerror|network request failed|load failed|fetch failed|timeout/i.test(text)
    || (fehler && fehler.name === 'TypeError');
}

const FEHLERTEXTE = [
  [/invalid login credentials/i, 'E-Mail oder Passwort ist falsch.'],
  [/email not confirmed/i, 'Bitte bestätige zuerst deine E-Mail-Adresse (Link in der Mail).'],
  [/already registered/i, 'Diese E-Mail-Adresse ist schon registriert. Bitte anmelden.'],
  [/password should be at least/i, 'Das Passwort muss mindestens 6 Zeichen lang sein.'],
  [/unable to validate email|invalid email/i, 'Diese E-Mail-Adresse ist ungültig.'],
  [/rate limit/i, 'Zu viele Versuche. Bitte warte kurz.'],
];

function verstaendlich(fehler) {
  const treffer = FEHLERTEXTE.find(([muster]) => muster.test(fehler.message || ''));
  const f = new Error(treffer ? treffer[1] : fehler.message);
  f.netz = istNetzfehler(fehler);
  return f;
}

export async function sitzung() {
  const sb = await client();
  const { data } = await sb.auth.getSession();
  return data.session;
}

export async function anmelden(email, passwort) {
  const sb = await client();
  const { data, error } = await sb.auth.signInWithPassword({ email, password: passwort });
  if (error) throw verstaendlich(error);
  return data.session;
}

export async function registrieren(email, passwort) {
  const sb = await client();
  const { data, error } = await sb.auth.signUp({
    email,
    password: passwort,
    options: { emailRedirectTo: location.origin + location.pathname },
  });
  if (error) throw verstaendlich(error);
  return data.session; // null, solange die E-Mail nicht bestätigt ist
}

export async function abmelden() {
  const sb = await client();
  await sb.auth.signOut();
}

// Haushalt des angemeldeten Nutzers oder null.
export async function ladeHaushalt() {
  const sb = await client();
  const s = await sitzung();
  if (!s) return null;
  const daten = pruefe(await sb.from('mitglieder').select('haushalte(id, name, einladecode)').eq('user_id', s.user.id).maybeSingle());
  return daten ? daten.haushalte : null;
}

export async function haushaltAnlegen(name) {
  const sb = await client();
  return ersteZeile(pruefe(await sb.rpc('haushalt_anlegen', { p_name: name })));
}

const ersteZeile = (d) => (Array.isArray(d) ? d[0] : d) || null;

export async function haushaltBeitreten(code) {
  const sb = await client();
  const ergebnis = await sb.rpc('haushalt_beitreten', { p_code: code });
  if (ergebnis.error && /ungültig/i.test(ergebnis.error.message)) throw new Error('Dieser Einladecode ist ungültig.');
  return ersteZeile(pruefe(ergebnis));
}

export async function mitgliederAnzahl() {
  const sb = await client();
  const { count, error } = await sb.from('mitglieder').select('user_id', { count: 'exact', head: true });
  if (error) return null;
  return count;
}

// Antwortet die Datenbank? (Kostenlose Projekte pausieren nach 7 Tagen ohne Nutzung.)
export async function erreichbar() {
  try {
    const antwort = await fetch(SUPABASE_URL + '/auth/v1/health', {
      headers: { apikey: SUPABASE_KEY },
      signal: AbortSignal.timeout ? AbortSignal.timeout(8000) : undefined,
    });
    return antwort.ok;
  } catch (e) {
    return false;
  }
}

// Dashboard-Link aus der Projekt-URL ableiten (https://<ref>.supabase.co)
export function dashboardUrl() {
  try {
    const host = new URL(SUPABASE_URL).hostname;
    if (host.endsWith('.supabase.co')) return 'https://supabase.com/dashboard/project/' + host.split('.')[0];
  } catch (e) { /* ignorieren */ }
  return 'https://supabase.com/dashboard';
}
