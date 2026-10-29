# Rezept-App

Eine einfache Handy-App, um Rezepte zu fotografieren und zu sammeln. Sie läuft auf Android und iPhone.

Die App ist eine **Web-App (PWA)**. Man öffnet sie einmal im Browser und legt sie auf den Startbildschirm. Danach startet sie wie eine normale App, auch ohne Internet.

## Funktionen

- Rezept mit der Kamera fotografieren oder ein Bild aus der Galerie wählen
- Mehrere Fotos pro Rezept (z. B. Vorder- und Rückseite)
- Titel und Notiz vergeben und später ändern
- Rezepte durchsuchen, im Vollbild ansehen (Antippen zum Vergrößern) und löschen

Alle Rezepte werden **nur auf dem eigenen Handy** gespeichert (im Browser-Speicher, IndexedDB). Es gibt keinen Server und kein Konto. Wer die App löscht oder die Website-Daten im Browser leert, verliert die gespeicherten Rezepte.

## Auf dem Handy installieren

Die App muss über **https** erreichbar sein, zum Beispiel über GitHub Pages (siehe unten).

- **iPhone (Safari):** Adresse öffnen → Teilen-Symbol → „Zum Home-Bildschirm“.
  Wichtig: Nur so bleiben die Rezepte dauerhaft gespeichert. Safari löscht sonst Daten von Websites, die länger nicht benutzt wurden.
- **Android (Chrome):** Adresse öffnen → Menü ⋮ → „App installieren“ bzw. „Zum Startbildschirm hinzufügen“.

## Veröffentlichen mit GitHub Pages

1. Im Repository auf GitHub: **Settings → Pages**
2. Unter „Build and deployment“: Source **Deploy from a branch**, Branch **main**, Ordner **/ (root)** → Save
3. Nach ca. einer Minute ist die App erreichbar unter `https://cezzyl-vault.github.io/Rezept-App/`

Bei Änderungen an den App-Dateien in `sw.js` die `VERSION` hochzählen, damit installierte Apps die neue Version laden.

## Am PC testen

```powershell
powershell -ExecutionPolicy Bypass -File server.ps1
```

Dann im Browser `http://localhost:8080` öffnen.

## Dateien

| Datei | Inhalt |
| --- | --- |
| `index.html` | Aufbau der Seiten |
| `style.css` | Aussehen (hell und dunkel) |
| `app.js` | Logik: Fotos, Speichern, Liste, Suche |
| `sw.js` | Offline-Unterstützung |
| `manifest.webmanifest`, `icons/` | Name und Symbol für den Startbildschirm |
| `server.ps1` | Kleiner Testserver für den PC |
