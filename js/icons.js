// Schlichte Linien-Icons (24×24, Strichstärke folgt der Schriftfarbe).
// Formen: Pfad-String, [cx, cy, r] für Kreise, { r: [x, y, b, h, rx] } für Rechtecke.

const FORMEN = {
  buch: ['M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15.5H6.5A2.5 2.5 0 0 0 4 21z', 'M4 5.5V21', 'M20 18.5V21H6.5', 'M9 7.5h7'],
  kalender: [{ r: [3.5, 5, 17, 15.5, 2.5] }, 'M3.5 10h17', 'M8 3v4', 'M16 3v4', 'M8 14h2', 'M14 14h2'],
  wagen: ['M3 4h2.2l2.3 10.6a2 2 0 0 0 2 1.6h7.6a2 2 0 0 0 1.9-1.4L21 8H6.3', [10, 20, 1.2], [17.5, 20, 1.2]],
  personen: [[9, 8, 3.2], 'M3.5 19.5a5.5 5.5 0 0 1 11 0', [17, 9.5, 2.4], 'M15.6 14.4A4.4 4.4 0 0 1 20.8 18.6'],
  plus: ['M12 5v14', 'M5 12h14'],
  minus: ['M5 12h14'],
  kamera: ['M4.5 8h2.8l1.9-2.8h5.6L16.7 8h2.8A1.5 1.5 0 0 1 21 9.5v8a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 17.5v-8A1.5 1.5 0 0 1 4.5 8z', [12, 13.2, 3.4]],
  bild: [{ r: [3, 4.5, 18, 15, 2.5] }, [8.5, 9.5, 1.6], 'M21 15.5l-5-5L5.5 19.5'],
  stift: ['M4 20h4L19.2 8.8a2 2 0 0 0 0-2.8l-1.2-1.2a2 2 0 0 0-2.8 0L4 16z', 'M13.5 6.5l4 4'],
  papierkorb: ['M4 7h16', 'M9.5 7V4.5h5V7', 'M6 7l1 13h10l1-13', 'M10 11v5.5', 'M14 11v5.5'],
  zurueck: ['M15 5l-7 7 7 7'],
  weiter: ['M9 5l7 7-7 7'],
  hoch: ['M12 19V5', 'M6.5 10.5L12 5l5.5 5.5'],
  haken: ['M5 12.5l4.5 4.5L19 7'],
  kreuz: ['M6.5 6.5l11 11', 'M17.5 6.5l-11 11'],
  suche: [[11, 11, 6.5], 'M20 20l-4.3-4.3'],
  uhr: [[12, 12, 8.5], 'M12 7.5V12l3 2'],
  herz: ['M12 20s-7.5-4.6-7.5-10.2A4.2 4.2 0 0 1 12 7.2a4.2 4.2 0 0 1 7.5 2.6C19.5 15.4 12 20 12 20z'],
  funkeln: ['M11 3.5l1.7 4.8 4.8 1.7-4.8 1.7L11 16.5l-1.7-4.8-4.8-1.7 4.8-1.7z', 'M18.5 14.5l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8z'],
  korb: ['M3.5 10h17l-1.6 8.6a2 2 0 0 1-2 1.6H7.1a2 2 0 0 1-2-1.6z', 'M8 10l3.2-6', 'M16 10l-3.2-6', 'M9.5 14v2.5', 'M14.5 14v2.5'],
  teller: [[12, 12, 8.5], [12, 12, 4.5]],
  ueberschrift: ['M6 5v14', 'M18 5v14', 'M6 12h12'],
  text: ['M5 6h14', 'M5 11h14', 'M5 16h9'],
  link: ['M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1', 'M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1'],
  teilen: [[18, 5.5, 2.5], [6, 12, 2.5], [18, 18.5, 2.5], 'M8.2 10.8l7.6-4', 'M8.2 13.2l7.6 4'],
  wolke: ['M7 18.5h10a4 4 0 0 0 .6-8 5.5 5.5 0 0 0-10.7-1A4.5 4.5 0 0 0 7 18.5z'],
};

const SVG = 'http://www.w3.org/2000/svg';

export function icon(name, { groesse = 22, klasse = '' } = {}) {
  const svg = document.createElementNS(SVG, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', groesse);
  svg.setAttribute('height', groesse);
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '1.7');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('class', ('icon ' + klasse).trim());
  for (const form of FORMEN[name] || []) {
    let el;
    if (typeof form === 'string') {
      el = document.createElementNS(SVG, 'path');
      el.setAttribute('d', form);
    } else if (Array.isArray(form)) {
      el = document.createElementNS(SVG, 'circle');
      el.setAttribute('cx', form[0]);
      el.setAttribute('cy', form[1]);
      el.setAttribute('r', form[2]);
    } else {
      el = document.createElementNS(SVG, 'rect');
      const [x, y, b, hoehe, rx] = form.r;
      el.setAttribute('x', x);
      el.setAttribute('y', y);
      el.setAttribute('width', b);
      el.setAttribute('height', hoehe);
      el.setAttribute('rx', rx);
    }
    svg.append(el);
  }
  return svg;
}
