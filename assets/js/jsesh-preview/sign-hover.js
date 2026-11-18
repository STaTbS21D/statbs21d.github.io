// sign-hover.js: reads the metadata and highlights signs in an SVG generated with svgmeta-patch.js.
// Used both by the app (index.html) and by the website preview (jsesh-preview.js).
//
// Hovering (or tapping) a sign highlights its box and shows a floating label with ONLY the code of
// that sign. The full MdC text is never shown as a tooltip: prepareSvg() removes the <title> of the
// on-screen SVG (browsers would show it as a native tooltip).

const STYLE_ID = "mdc-hover-style";
const SVG_NS = "http://www.w3.org/2000/svg";
const CSS = `
.mdc-tip{position:fixed;z-index:2147483000;pointer-events:none;padding:4px 9px;border-radius:6px;
  background:#23201b;color:#fff;font:600 14px/1.25 ui-monospace,Consolas,monospace;
  box-shadow:0 2px 8px rgba(0,0,0,.3);white-space:nowrap}
.mdc-tip small{display:block;font:400 11px/1.3 system-ui,sans-serif;opacity:.8}
`;

function ensureStyle() {
  if (typeof document === "undefined" || document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = CSS;
  document.head.append(style);
}

/**
 * Prepares an <svg> already inserted in the page: removes its <title> (it holds the full MdC text and
 * the browser would show it as a tooltip) and sets a generic accessibility label.
 */
export function prepareSvg(svg, label = "Hieroglyphic text") {
  for (const child of [...svg.children]) if (child.localName === "title") child.remove();
  svg.setAttribute("aria-label", label);
}

/** Reads the sign list from the <metadata> of an <svg> (already inserted in the DOM). */
export function readSigns(svg) {
  const meta = svg?.querySelector("metadata");
  if (!meta) return { source: "", signs: [] };
  const data = JSON.parse(meta.textContent);
  return { source: data.source ?? "", signs: data.signs };
}

/** Human-readable type of a sign: "Glyph", "Philological mark (begin erasure)", "Point"... */
export function kindLabel(sign) {
  if (sign.kind === "philological-mark") return sign.mark ? `Philological mark (${sign.mark})` : "Philological mark";
  if (sign.kind === "point") return "Point";
  return sign.known === false ? "Glyph (unknown code)" : "Glyph";
}

/**
 * Enables highlighting and the label on `container` (which holds the <svg>).
 *   getSigns(): current list of signs (the one from readSigns)
 *   onChange(sign | null): called when the pointed sign changes
 * Returns { highlight(index | null), destroy() }.
 */
export function attachSignHover(container, { getSigns, onChange } = {}) {
  ensureStyle();
  let current = null; // index of the pointed sign
  let tip = null;
  let touchTimer = 0;

  const svgOf = () => container.querySelector("svg");

  function removeHighlight() {
    svgOf()?.querySelector("#mdc-highlight")?.remove();
  }

  function highlight(index) {
    removeHighlight();
    const svg = svgOf();
    const sign = index == null ? null : getSigns().find((s) => s.index === index);
    if (!svg || !sign) return;
    const rect = document.createElementNS(SVG_NS, "rect");
    rect.id = "mdc-highlight";
    rect.setAttribute("x", sign.x);
    rect.setAttribute("y", sign.y);
    rect.setAttribute("width", sign.width);
    rect.setAttribute("height", sign.height);
    rect.setAttribute("fill", "rgba(197,120,14,0.28)");
    rect.setAttribute("stroke", "#c5780e");
    rect.setAttribute("stroke-width", "0.8");
    rect.setAttribute("pointer-events", "none");
    svg.append(rect);
  }

  // The sign is located with the boxes from the metadata (not with the painted pixels), so thin
  // signs or signs with holes also respond.
  function signAt(event) {
    const svg = svgOf();
    const matrix = svg?.getScreenCTM();
    if (!matrix) return null;
    const point = new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix.inverse());
    let best = null;
    for (const s of getSigns()) {
      const inside = point.x >= s.x && point.x <= s.x + s.width && point.y >= s.y && point.y <= s.y + s.height;
      if (inside && (best === null || s.width * s.height < best.width * best.height)) best = s;
    }
    return best;
  }

  function showTip(sign, event) {
    if (!tip) {
      tip = document.createElement("div");
      tip.className = "mdc-tip";
      tip.setAttribute("role", "tooltip");
    }
    tip.replaceChildren(document.createTextNode(sign.code));
    const detail = [`#${sign.index + 1}`, kindLabel(sign)];
    if (sign.input !== sign.code) detail.push(`typed «${sign.input}»`);
    const small = document.createElement("small");
    small.textContent = detail.join(" · ");
    tip.append(small);
    if (!tip.isConnected) document.body.append(tip);
    const margin = 8;
    const x = Math.min(event.clientX + 14, window.innerWidth - tip.offsetWidth - margin);
    const y = event.clientY + 18 + tip.offsetHeight > window.innerHeight ? event.clientY - tip.offsetHeight - 12 : event.clientY + 18;
    tip.style.left = `${Math.max(margin, x)}px`;
    tip.style.top = `${Math.max(margin, y)}px`;
  }

  function clear() {
    clearTimeout(touchTimer);
    tip?.remove();
    removeHighlight();
    if (current !== null) {
      current = null;
      onChange?.(null);
    }
  }

  function update(event) {
    const sign = signAt(event);
    if (!sign) {
      clear();
      return;
    }
    if (sign.index !== current) {
      current = sign.index;
      highlight(sign.index);
      onChange?.(sign);
    }
    showTip(sign, event);
  }

  const onMove = (event) => update(event);
  const onClick = (event) => {
    update(event);
    // Touch screens have no "mouse leave": hide the label after a few seconds.
    if (event.pointerType && event.pointerType !== "mouse") {
      clearTimeout(touchTimer);
      touchTimer = setTimeout(clear, 2500);
    }
  };
  container.addEventListener("mousemove", onMove);
  container.addEventListener("click", onClick);
  container.addEventListener("mouseleave", clear);

  return {
    highlight,
    destroy() {
      container.removeEventListener("mousemove", onMove);
      container.removeEventListener("click", onClick);
      container.removeEventListener("mouseleave", clear);
      clear();
    },
  };
}
