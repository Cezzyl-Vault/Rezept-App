// Konto und gemeinsamer Haushalt: anmelden, Haushalt anlegen oder beitreten, Einladecode weitergeben.
import { h, fuelle } from '../dom.js';
import * as speicher from '../speicher.js';
import { setzeKopf, zeigeTabs, zeigeFab, zeigeMeldung, zeigeFehler } from '../ui.js';
import * as supabase from '../supabase.js';
import * as sync from '../sync.js';

const STATUS_TEXT = {
  lokal: 'Nur auf diesem Gerät',
  start: 'Verbinde …',
  abgemeldet: 'Nicht angemeldet',
  'kein-haushalt': 'Noch kein Haushalt',
  offline: 'Offline – Änderungen werden später übertragen',
  pausiert: 'Datenbank pausiert – Änderungen werden später übertragen',
  laeuft: 'Wird abgeglichen …',
  ok: 'Alles abgeglichen ✓',
  fehler: 'Abgleich fehlgeschlagen',
};

export async function zeige(bereich) {
  setzeKopf({ titel: 'Teilen & Konto', zurueck: true });
  zeigeTabs(null);
  zeigeFab(false);

  let modus = 'anmelden';

  async function zeichne() {
    if (!supabase.istKonfiguriert()) {
      fuelle(bereich, h('div', { class: 'karte-flach' },
        h('h2', {}, 'Nur auf diesem Gerät'),
        h('p', {}, 'Rezepte, Wochenplan und Einkaufsliste werden im Moment nur auf diesem Handy gespeichert.'),
        h('p', {}, 'Zum Teilen mit anderen Handys muss einmal eine kostenlose Supabase-Datenbank eingerichtet werden. Die Anleitung steht in der README des Projekts.')));
      return;
    }

    let sitzung = null;
    try { sitzung = await supabase.sitzung(); } catch (e) { /* Bibliothek nicht ladbar (offline) */ }

    if (!sitzung) { zeichneAnmeldung(); return; }

    const haushalt = await speicher.holeMeta('haushalt');
    const ausstehend = await speicher.outboxAnzahl();
    const kopf = h('div', { class: 'karte-flach' },
      h('p', { class: 'meta' }, 'Angemeldet als'),
      h('p', {}, h('strong', {}, sitzung.user.email)),
      h('p', { class: 'sync-zeile status-' + sync.status }, STATUS_TEXT[sync.status] || sync.status,
        ausstehend ? ` · ${ausstehend} Änderung${ausstehend === 1 ? '' : 'en'} warten` : ''),
      sync.status === 'pausiert' ? h('a', { class: 'btn zweit', href: supabase.dashboardUrl(), target: '_blank', rel: 'noopener' }, 'Supabase-Dashboard öffnen („Restore“)') : null,
      h('button', { class: 'btn zweit', type: 'button', onclick: () => sync.synchronisiere() }, 'Jetzt abgleichen'));

    if (!haushalt) {
      fuelle(bereich, kopf, zeichneHaushaltWahl(), abmeldeKnopf());
      return;
    }

    const anzahl = navigator.onLine ? await supabase.mitgliederAnzahl().catch(() => null) : null;
    fuelle(bereich, 
      kopf,
      h('div', { class: 'karte-flach' },
        h('p', { class: 'meta' }, 'Haushalt'),
        h('h2', {}, haushalt.name),
        anzahl ? h('p', { class: 'meta' }, anzahl === 1 ? 'Bisher nur du' : `${anzahl} Mitglieder`) : null,
        h('p', {}, 'Wer mitmachen soll, meldet sich in der App an und gibt diesen Einladecode ein:'),
        h('p', { class: 'einladecode' }, haushalt.einladecode),
        h('button', {
          class: 'btn zweit', type: 'button',
          onclick: async () => {
            const text = `Komm in unsere Rezept-App! Einladecode: ${haushalt.einladecode}\n${location.origin + location.pathname}`;
            try {
              if (navigator.share) await navigator.share({ text });
              else { await navigator.clipboard.writeText(text); zeigeMeldung('Einladung kopiert'); }
            } catch (e) { /* abgebrochen */ }
          },
        }, 'Einladung teilen')),
      abmeldeKnopf(),
    );
  }

  function zeichneAnmeldung() {
    const email = h('input', { type: 'email', autocomplete: 'email', placeholder: 'name@beispiel.de', required: true });
    const passwort = h('input', { type: 'password', autocomplete: modus === 'anmelden' ? 'current-password' : 'new-password', placeholder: 'mindestens 6 Zeichen', required: true, minLength: 6 });
    const knopf = h('button', { class: 'btn', type: 'submit' }, modus === 'anmelden' ? 'Anmelden' : 'Konto anlegen');
    fuelle(bereich, 
      h('div', { class: 'karte-flach' },
        h('h2', {}, 'Gemeinsam nutzen'),
        h('p', {}, 'Mit einem Konto teilst du Rezepte, Wochenplan und Einkaufsliste mit anderen Handys in deinem Haushalt.')),
      h('form', {
        class: 'karte-flach',
        onsubmit: async (e) => {
          e.preventDefault();
          knopf.disabled = true;
          try {
            if (modus === 'anmelden') {
              await supabase.anmelden(email.value.trim(), passwort.value);
              await nachAnmeldung();
            } else {
              const s = await supabase.registrieren(email.value.trim(), passwort.value);
              if (s) await nachAnmeldung();
              else {
                zeigeMeldung('Fast geschafft: Bitte bestätige den Link in der E-Mail und melde dich dann an.', 7000);
                modus = 'anmelden';
                zeichne();
              }
            }
          } catch (f) {
            zeigeMeldung(f.netz ? 'Keine Verbindung zur Datenbank.' : f.message, 5000);
          } finally {
            knopf.disabled = false;
          }
        },
      },
      h('label', { class: 'feld' }, 'E-Mail', email),
      h('label', { class: 'feld' }, 'Passwort', passwort),
      knopf,
      h('button', {
        class: 'btn text', type: 'button',
        onclick: () => { modus = modus === 'anmelden' ? 'registrieren' : 'anmelden'; zeichne(); },
      }, modus === 'anmelden' ? 'Noch kein Konto? Registrieren' : 'Schon ein Konto? Anmelden')));
  }

  async function nachAnmeldung() {
    try {
      const haushalt = await supabase.ladeHaushalt();
      if (haushalt) {
        await speicher.setzeMeta('haushalt', haushalt);
        await speicher.allesVormerken();
      }
    } catch (f) {
      zeigeFehler(f);
    }
    await sync.synchronisiere();
    zeichne();
  }

  function zeichneHaushaltWahl() {
    const name = h('input', { type: 'text', value: 'Unser Haushalt', placeholder: 'z. B. Familie Müller' });
    const code = h('input', { type: 'text', placeholder: 'z. B. A1B2C3', autocapitalize: 'characters', autocomplete: 'off', maxLength: 12 });
    const verbinden = async (aktion) => {
      try {
        const haushalt = await aktion();
        if (!haushalt) throw new Error('Kein Haushalt erhalten.');
        await speicher.setzeMeta('haushalt', haushalt);
        await speicher.allesVormerken(); // bisherige Rezepte dieses Geräts mitnehmen
        zeigeMeldung('Verbunden mit „' + haushalt.name + '“');
        await sync.synchronisiere();
        zeichne();
      } catch (f) {
        zeigeMeldung(f.netz ? 'Keine Verbindung zur Datenbank.' : f.message, 5000);
      }
    };
    return h('div', {},
      h('form', { class: 'karte-flach', onsubmit: (e) => { e.preventDefault(); verbinden(() => supabase.haushaltBeitreten(code.value.trim())); } },
        h('h2', {}, 'Einem Haushalt beitreten'),
        h('p', {}, 'Du hast einen Einladecode bekommen?'),
        h('label', { class: 'feld' }, 'Einladecode', code),
        h('button', { class: 'btn', type: 'submit' }, 'Beitreten')),
      h('form', { class: 'karte-flach', onsubmit: (e) => { e.preventDefault(); verbinden(() => supabase.haushaltAnlegen(name.value.trim() || 'Unser Haushalt')); } },
        h('h2', {}, 'Neuen Haushalt anlegen'),
        h('p', {}, 'Deine bisherigen Rezepte werden übernommen. Danach bekommst du einen Code zum Einladen.'),
        h('label', { class: 'feld' }, 'Name', name),
        h('button', { class: 'btn zweit', type: 'submit' }, 'Haushalt anlegen')));
  }

  function abmeldeKnopf() {
    return h('button', {
      class: 'btn gefahr', type: 'button',
      onclick: async () => {
        const ausstehend = await speicher.outboxAnzahl();
        const warnung = ausstehend
          ? `Es gibt noch ${ausstehend} nicht übertragene Änderungen. Beim Abmelden gehen sie verloren. Trotzdem abmelden?`
          : 'Abmelden? Die Rezepte werden von diesem Gerät entfernt und sind nach dem nächsten Anmelden wieder da.';
        if (!confirm(warnung)) return;
        sync.beendeEchtzeit();
        await supabase.abmelden().catch(() => {});
        await speicher.allesLeeren();
        await sync.synchronisiere();
        zeichne();
      },
    }, 'Abmelden');
  }

  await zeichne();
  const beiStatus = () => { if (!bereich.contains(document.activeElement) || document.activeElement.tagName === 'BUTTON') zeichne(); };
  window.addEventListener('syncstatus', beiStatus);
  return () => window.removeEventListener('syncstatus', beiStatus);
}
