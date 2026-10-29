// Ein Rezept, das gerade angelegt oder bearbeitet wird.
// Bleibt im Speicher, wenn man die Ansicht kurz verlässt.
import * as speicher from './speicher.js';
import { bereiteFotoVor, verkleinere, ladeBild } from './bilder.js';

let entwurf = null;

// teil: vorbefüllte Felder (z. B. aus Texterkennung oder Import)
export function starteEntwurf(teil = {}) {
  const id = speicher.neueId();
  entwurf = { neu: true, rezept: speicher.normalisiereRezept({ ...teil, id }), neueFotos: [], entfernt: [] };
  return entwurf;
}

export function bearbeite(rezept) {
  if (entwurf && entwurf.rezept.id === rezept.id) return entwurf;
  entwurf = { neu: false, rezept: structuredClone(rezept), neueFotos: [], entfernt: [] };
  return entwurf;
}

export const holeEntwurf = () => entwurf;
export const verwerfeEntwurf = () => { entwurf = null; };

// Fotos verkleinern und dem Entwurf hinzufügen. Liefert die Anzahl erfolgreich gelesener Fotos.
export async function fuegeFotosHinzu(dateien) {
  let anzahl = 0;
  for (const datei of dateien) {
    const { foto, vorschau } = await bereiteFotoVor(datei);
    const pfad = `${entwurf.rezept.id}/${speicher.neueId()}.jpg`;
    entwurf.neueFotos.push({ pfad, foto, vorschau });
    entwurf.rezept.fotos.push(pfad);
    anzahl++;
  }
  return anzahl;
}

export function entferneFoto(pfad) {
  entwurf.rezept.fotos = entwurf.rezept.fotos.filter((p) => p !== pfad);
  const neu = entwurf.neueFotos.findIndex((f) => f.pfad === pfad);
  if (neu >= 0) entwurf.neueFotos.splice(neu, 1);
  else entwurf.entfernt.push(pfad);
}

// Foto-Blob eines Entwurfs (neu oder schon gespeichert)
export async function entwurfFoto(pfad) {
  const neu = entwurf && entwurf.neueFotos.find((f) => f.pfad === pfad);
  return neu ? neu.foto : speicher.holeFoto(pfad);
}

export async function speichereEntwurf() {
  const { rezept, neueFotos, entfernt } = entwurf;
  for (const f of neueFotos) {
    await speicher.legeFotoAb(f.pfad, f.foto);
    await speicher.legeFotoAb(speicher.vorschauPfad(f.pfad), f.vorschau);
  }
  if (entfernt.length) await speicher.loescheFotos(entfernt.flatMap((p) => [p, speicher.vorschauPfad(p)]));

  // Vorschau gehört immer zum ersten Foto
  const erstes = rezept.fotos[0];
  rezept.vorschau = erstes ? speicher.vorschauPfad(erstes) : null;
  if (erstes && !(await speicher.hatFoto(rezept.vorschau))) {
    const blob = await speicher.holeFoto(erstes);
    if (blob) await speicher.legeFotoAb(rezept.vorschau, await verkleinere(await ladeBild(blob), 480, 0.7));
  }

  rezept.titel = rezept.titel.trim() || 'Rezept vom ' + new Date().toLocaleDateString('de-DE');
  rezept.zutaten = rezept.zutaten.filter((z) => z.name && z.name.trim());
  rezept.schritte = rezept.schritte.map((s) => s.trim()).filter(Boolean);
  const gespeichert = await speicher.speichere('rezepte', rezept);
  entwurf = null;
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist();
  return gespeichert;
}
