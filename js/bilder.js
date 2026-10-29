// Fotos verkleinern und anzeigen.
import { h } from './dom.js';
import { ladeFoto } from './sync.js';

export function ladeBild(datei) {
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
export function verkleinere(bild, maxKante, qualitaet) {
  const faktor = Math.min(1, maxKante / Math.max(bild.naturalWidth || bild.width, bild.naturalHeight || bild.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round((bild.naturalWidth || bild.width) * faktor);
  canvas.height = Math.round((bild.naturalHeight || bild.height) * faktor);
  canvas.getContext('2d').drawImage(bild, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Bild konnte nicht verkleinert werden'))), 'image/jpeg', qualitaet);
  });
}

export async function bereiteFotoVor(datei) {
  const bild = await ladeBild(datei);
  return {
    foto: await verkleinere(bild, 2000, 0.85),
    vorschau: await verkleinere(bild, 480, 0.7),
  };
}

// Blob-URLs der aktuell sichtbaren Bilder, damit sie beim Ansichtswechsel freigegeben werden.
let aktiveUrls = [];
let generation = 0;

export function bildUrl(blob) {
  const url = URL.createObjectURL(blob);
  aktiveUrls.push(url);
  return url;
}

export function gibUrlsFrei() {
  aktiveUrls.forEach((url) => URL.revokeObjectURL(url));
  aktiveUrls = [];
  generation++;
}

// <img>, das sein Foto aus dem Speicher (oder vom Server) nachlädt.
// ersatz: anderes Foto, falls das gewünschte fehlt (z. B. Original statt Vorschau).
export function fotoBild(pfad, { ersatz, ...eigenschaften } = {}) {
  const bild = h('img', { alt: '', ...eigenschaften });
  const meineGeneration = generation;
  (async () => {
    let blob = await ladeFoto(pfad);
    if (!blob && ersatz) blob = await ladeFoto(ersatz);
    if (blob && meineGeneration === generation) bild.src = bildUrl(blob);
    else if (!blob) bild.classList.add('fehlt');
  })();
  return bild;
}
