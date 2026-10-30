// Start der App: Ansichten, Navigation, Plus-Knopf, Abgleich.
import { $, h } from './dom.js';
import { waehle, waehleFotos, entferneAlleOverlays, zeigeFehler, zeigeMeldung } from './ui.js';
import { beiNavigation, gehe, geheZurueck } from './navigation.js';
import { gibUrlsFrei } from './bilder.js';
import { icon } from './icons.js';
import * as sync from './sync.js';
import { dashboardUrl } from './supabase.js';
import { starteEntwurf } from './entwurf.js';
import * as liste from './ansichten/liste.js';
import * as rezept from './ansichten/rezept.js';
import * as editor from './ansichten/editor.js';
import * as erkennen from './ansichten/erkennen.js';
import * as plan from './ansichten/plan.js';
import * as einkauf from './ansichten/einkauf.js';
import * as konto from './ansichten/konto.js';

const ROUTEN = [
  [/^$/, liste],
  [/^rezept\/([\w-]+)$/, rezept],
  [/^neu$/, editor],
  [/^bearbeiten\/([\w-]+)$/, editor],
  [/^erkennen$/, erkennen],
  [/^plan(?:\/(\d{4}-\d{2}-\d{2}))?$/, plan],
  [/^einkauf$/, einkauf],
  [/^konto$/, konto],
];

let aufraeumen = null;
let ansichtNr = 0;

async function zeigeAnsicht() {
  entferneAlleOverlays();
  if (aufraeumen) {
    try { aufraeumen(); } catch (e) { console.error(e); }
    aufraeumen = null;
  }
  gibUrlsFrei();
  const nr = ++ansichtNr;

  const pfad = location.hash.replace(/^#\/?/, '');
  let modul = liste;
  let param;
  for (const [muster, m] of ROUTEN) {
    const treffer = pfad.match(muster);
    if (treffer) { modul = m; param = treffer[1]; break; }
  }

  const bereich = h('div', { class: 'ansicht' });
  $('inhalt').replaceChildren(bereich);
  window.scrollTo(0, 0);
  try {
    const ergebnis = await modul.zeige(bereich, param);
    if (nr === ansichtNr) aufraeumen = ergebnis || null;
    else if (ergebnis) ergebnis();
  } catch (fehler) {
    zeigeFehler(fehler);
  }
}

beiNavigation(() => zeigeAnsicht());

// ---------- Kopfzeile, Tabs, Plus-Knopf ----------

// Icons in das feste Grundgerüst einsetzen (Tabs, Kopfzeile, Plus-Knopf)
for (const platz of document.querySelectorAll('[data-icon]')) {
  platz.replaceChildren(icon(platz.dataset.icon, { groesse: platz.id === 'neu-btn' ? 28 : 22 }));
}

$('zurueck').addEventListener('click', () => geheZurueck());
$('konto-btn').addEventListener('click', () => gehe('#/konto'));

for (const link of $('tabs').querySelectorAll('a')) {
  link.addEventListener('click', (e) => {
    e.preventDefault();
    if (!link.classList.contains('aktiv')) gehe(link.getAttribute('href'));
  });
}

$('neu-btn').addEventListener('click', () => {
  waehle('Neues Rezept', [
    { wert: 'kamera', text: 'Foto aufnehmen', icon: 'kamera', klasse: '', sofort: () => waehleFotos('kamera', erkennen.neuAusFotos) },
    { wert: 'galerie', text: 'Foto aus der Galerie', icon: 'bild', sofort: () => waehleFotos('galerie', erkennen.neuAusFotos) },
    { wert: 'selbst', text: 'Selbst eingeben', icon: 'stift' },
  ]).then((wahl) => {
    if (wahl === 'selbst') { starteEntwurf(); gehe('#/neu'); }
  });
});

// ---------- Abgleich-Status ----------

function zeigeStatus() {
  const s = sync.status;
  $('sync-punkt').className = 'sync-punkt ' + s;
  const leiste = $('hinweis-leiste');
  if (s === 'pausiert') {
    leiste.replaceChildren(
      h('span', {}, 'Die Datenbank ist pausiert. Änderungen werden gespeichert und später übertragen.'),
      h('a', { href: dashboardUrl(), target: '_blank', rel: 'noopener' }, 'Aktivieren'));
    leiste.hidden = false;
  } else if (s === 'abgemeldet' || s === 'kein-haushalt') {
    leiste.replaceChildren(
      h('span', {}, s === 'abgemeldet' ? 'Du bist abgemeldet – Änderungen werden nicht geteilt.' : 'Noch keinem Haushalt beigetreten.'),
      h('a', { href: '#/konto', onclick: (e) => { e.preventDefault(); gehe('#/konto'); } }, 'Ändern'));
    leiste.hidden = false;
  } else {
    leiste.hidden = true;
  }
}

window.addEventListener('syncstatus', zeigeStatus);
window.addEventListener('db-blockiert', () =>
  zeigeMeldung('Die App ist noch in einem anderen Fenster geöffnet. Bitte dort schließen, dann geht es hier weiter.', 0));

// ---------- Start ----------

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch((fehler) => console.warn('Service Worker nicht registriert', fehler));
}

zeigeStatus();
zeigeAnsicht();
sync.synchronisiere();
