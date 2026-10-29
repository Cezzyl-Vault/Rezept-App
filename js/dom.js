// Kleine Hilfen zum Bauen von HTML-Elementen.

export const $ = (id) => document.getElementById(id);

// h('button', { class: 'btn', onclick: fn }, 'Text', kindElement, [weitere])
export function h(tag, eigenschaften, ...kinder) {
  const el = document.createElement(tag);
  for (const [name, wert] of Object.entries(eigenschaften || {})) {
    if (wert == null || wert === false) continue;
    if (name.startsWith('on') && typeof wert === 'function') el.addEventListener(name.slice(2).toLowerCase(), wert);
    else if (name === 'class') el.className = wert;
    else if (name === 'style') el.style.cssText = wert;
    else if (name in el && !name.includes('-')) el[name] = wert;
    else el.setAttribute(name, wert === true ? '' : wert);
  }
  for (const kind of kinder.flat(Infinity)) {
    if (kind == null || kind === false) continue;
    el.append(kind instanceof Node ? kind : String(kind));
  }
  return el;
}

// Inhalt eines Elements ersetzen; leere Einträge (null, false) werden übersprungen.
export function fuelle(el, ...kinder) {
  el.replaceChildren(...kinder.flat(Infinity).filter((k) => k != null && k !== false));
  return el;
}

// Textfeld, das mit seinem Inhalt mitwächst.
export function mitwachsen(textarea) {
  const anpassen = () => {
    textarea.style.height = 'auto';
    textarea.style.height = textarea.scrollHeight + 2 + 'px';
  };
  textarea.addEventListener('input', anpassen);
  requestAnimationFrame(anpassen);
  return textarea;
}
