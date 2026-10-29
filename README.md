# Rezept-App

Eine Handy-App für Android und iPhone: Rezepte sammeln, die Woche planen und eine gemeinsame Einkaufsliste führen.

Die App ist eine **Web-App (PWA)**. Man öffnet sie einmal im Browser und legt sie auf den Startbildschirm. Danach startet sie wie eine normale App, auch ohne Internet.

## Funktionen

- **Rezepte anlegen**: fotografieren, aus der Galerie wählen oder selbst eintippen (Zutaten und Schritte einzeln)
- **Texterkennung auf dem Handy**: aus dem Foto wird Text, die App sortiert Titel, Zutaten und Schritte vor, du korrigierst per Antippen. Das kostet nichts und läuft ohne Server.
- **Portionen umrechnen**: Mengen passen sich an die Personenzahl an (z. B. 1½ EL → 3 EL, 600 g → 1,2 kg)
- **Kochmodus**: Zutaten und Schritte abhaken, der Bildschirm bleibt an
- **Kategorien und eigene Schlagwörter** (Hauptspeise, Nachtisch, Vegan … oder „Mag Melli“) mit Filtern
- **Suche** in Titel, Zutaten und Schritten, dazu **„Was hab ich da?“**: vorhandene Zutaten eingeben, passende Rezepte stehen oben
- **Wochenplan** (Mo–So) mit Personenzahl pro Gericht
- **Einkaufsliste**: Zutaten der Woche oder eines Rezepts übernehmen, gleiche Zutaten werden zusammengezählt, alles bleibt bearbeitbar. Abhaken klappt auch im Supermarkt ohne Netz.
- **Gemeinsam nutzen**: mehrere Handys teilen sich einen „Haushalt“ (Einladecode), Änderungen erscheinen sofort auf den anderen Geräten

Ohne eingerichtete Datenbank funktioniert alles nur auf einem Handy.

## Gemeinsame Datenbank einrichten (einmalig)

1. Auf [supabase.com](https://supabase.com) ein kostenloses Konto und ein **neues Projekt** anlegen (z. B. „rezepte“, Region Frankfurt).
2. Im Projekt links **SQL Editor** öffnen, den kompletten Inhalt von [`supabase/setup.sql`](supabase/setup.sql) einfügen und **Run** klicken.
3. Unter **Project Settings → API** die **Project URL** und den **anon public**-Key kopieren und in [`js/konfig.js`](js/konfig.js) eintragen.
4. Unter **Authentication → URL Configuration** als **Site URL** die Adresse der App eintragen (z. B. `https://cezzyl-vault.github.io/Rezept-App/`). Dorthin führt der Bestätigungslink in der Registrierungs-Mail.
5. Änderungen committen und pushen.

Danach in der App oben rechts auf 👥 tippen, registrieren, **Haushalt anlegen** und den Einladecode an die anderen weitergeben. Bisher nur lokal gespeicherte Rezepte werden dabei übernommen.

Kostenlose Supabase-Projekte pausieren nach 7 Tagen ohne Nutzung. Die GitHub-Action [`supabase-keepalive.yml`](.github/workflows/supabase-keepalive.yml) verhindert das, sobald `js/konfig.js` ausgefüllt ist. Ist die Datenbank doch einmal pausiert, zeigt die App einen Hinweis mit Link zum Dashboard („Restore“). Bis dahin speichert sie alle Änderungen auf dem Handy und überträgt sie später.

## Auf dem Handy installieren

Die App muss über **https** erreichbar sein, zum Beispiel über GitHub Pages (siehe unten).

- **iPhone (Safari):** Adresse öffnen → Teilen-Symbol → „Zum Home-Bildschirm“.
  Wichtig: Nur so bleiben die Daten dauerhaft auf dem Gerät. Safari löscht sonst Daten von Websites, die länger nicht benutzt wurden.
- **Android (Chrome):** Adresse öffnen → Menü ⋮ → „App installieren“ bzw. „Zum Startbildschirm hinzufügen“.

Die Texterkennung lädt beim ersten Mal einmalig etwa 15 MB Programm und deutsche Sprachdaten. Danach geht sie auch offline. Gedruckte Rezepte werden gut erkannt, Handschrift eher schlecht.

## Veröffentlichen mit GitHub Pages

1. Das Repository muss **öffentlich** sein (Settings → General → Danger Zone → Change visibility).
2. **Settings → Pages**: Source **Deploy from a branch**, Branch **main**, Ordner **/ (root)** → Save
3. Nach etwa einer Minute ist die App erreichbar unter `https://cezzyl-vault.github.io/Rezept-App/`

Bei Änderungen an den App-Dateien in `sw.js` die `VERSION` hochzählen, damit installierte Apps die neue Version laden.

## Am PC testen

```powershell
powershell -ExecutionPolicy Bypass -File server.ps1
```

Dann im Browser `http://localhost:8080` öffnen.

## Aufbau

| Datei | Inhalt |
| --- | --- |
| `index.html`, `style.css` | Grundgerüst und Aussehen (hell und dunkel) |
| `js/app.js` | Start, Seiten-Navigation, Plus-Knopf |
| `js/speicher.js` | Lokaler Speicher (IndexedDB) mit Warteschlange für den Abgleich |
| `js/sync.js` | Abgleich mit Supabase, Echtzeit, Fotos |
| `js/supabase.js`, `js/konfig.js` | Verbindung, Login, Haushalt |
| `js/zutaten.js` | Zutaten zerlegen, umrechnen, zusammenzählen |
| `js/texterkennung.js` | Texterkennung (Tesseract.js) und Vorsortierung |
| `js/suche.js` | Kategorien, Suche, „Was hab ich da?“ |
| `js/ansichten/*.js` | Die einzelnen Seiten (Liste, Rezept, Editor, Wochenplan, Einkauf, Konto) |
| `supabase/setup.sql` | Tabellen, Zugriffsregeln und Foto-Speicher für Supabase |
| `sw.js`, `manifest.webmanifest`, `icons/` | Offline-Start und Installation |
| `server.ps1` | Kleiner Testserver für den PC |
