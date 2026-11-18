// svg-export.js: prepares the SVG produced by JSesh-js for use in other programs.
//
//  - flattenSvg(): JSesh-js draws each glyph ONCE in <defs> and places it with <use href="#...">.
//    Corel Draw and Inkscape (and other editors) do not resolve those links well and show an empty
//    drawing. Here every <use> is replaced by a real copy of the <path>, and the nested
//    <g transform="..."> wrappers are merged into a single transform on the element itself, so a sign
//    ends up as ONE element:
//        <path id="mdc-3-A1" name="A1" data-mdc="A1" ... transform="matrix(...)" d="..." fill="#000000"/>
//    The outline ("d") is never modified: the position stays in the transform.
//  - svgToPng(): rasterizes that self-contained SVG to a PNG using a canvas.

const XLINK_NS = "http://www.w3.org/1999/xlink";

const hrefOf = (el) => el.getAttribute("href") ?? el.getAttributeNS(XLINK_NS, "href") ?? el.getAttribute("xlink:href");

// ---- 2D affine matrices [a b c d e f] --------------------------------------------------------
const IDENTITY = [1, 0, 0, 1, 0, 0];
const multiply = (m, n) => [
  m[0] * n[0] + m[2] * n[1],
  m[1] * n[0] + m[3] * n[1],
  m[0] * n[2] + m[2] * n[3],
  m[1] * n[2] + m[3] * n[3],
  m[0] * n[4] + m[2] * n[5] + m[4],
  m[1] * n[4] + m[3] * n[5] + m[5],
];
const isIdentity = (m) => m.every((v, i) => Math.abs(v - IDENTITY[i]) < 1e-9);

/** Parses an SVG transform list (matrix, translate, scale, rotate, skewX, skewY). null if unreadable. */
function parseTransform(text) {
  let m = IDENTITY;
  const re = /([a-zA-Z]+)\s*\(([^)]*)\)/g;
  let rest = String(text ?? "").trim();
  if (rest === "") return m;
  let found = false;
  for (const match of rest.matchAll(re)) {
    found = true;
    const a = match[2].split(/[\s,]+/).filter(Boolean).map(Number);
    if (a.some(Number.isNaN)) return null;
    let n;
    switch (match[1]) {
      case "matrix": if (a.length !== 6) return null; n = a; break;
      case "translate": n = [1, 0, 0, 1, a[0] ?? 0, a[1] ?? 0]; break;
      case "scale": n = [a[0] ?? 1, 0, 0, a[1] ?? a[0] ?? 1, 0, 0]; break;
      case "rotate": {
        const t = ((a[0] ?? 0) * Math.PI) / 180, c = Math.cos(t), s = Math.sin(t);
        const [cx, cy] = [a[1] ?? 0, a[2] ?? 0];
        n = multiply(multiply([1, 0, 0, 1, cx, cy], [c, s, -s, c, 0, 0]), [1, 0, 0, 1, -cx, -cy]);
        break;
      }
      case "skewX": n = [1, 0, Math.tan(((a[0] ?? 0) * Math.PI) / 180), 1, 0, 0]; break;
      case "skewY": n = [1, Math.tan(((a[0] ?? 0) * Math.PI) / 180), 0, 1, 0, 0]; break;
      default: return null;
    }
    m = multiply(m, n);
  }
  return found ? m : null;
}

const num = (v) => String(Math.round(v * 1e5) / 1e5).replace(/^-0$/, "0");
const formatMatrix = (m) => {
  if (m[0] === 1 && m[1] === 0 && m[2] === 0 && m[3] === 1) return `translate(${num(m[4])} ${num(m[5])})`;
  if (m[1] === 0 && m[2] === 0 && m[4] === 0 && m[5] === 0 && m[0] === m[3]) return `scale(${num(m[0])})`;
  return `matrix(${m.map(num).join(" ")})`;
};

const onlyTransform = (el) => el.localName === "g" && [...el.attributes].every((a) => a.name === "transform");
const children = (el) => [...el.children];

export function flattenSvg(svgText) {
  const doc = new DOMParser().parseFromString(svgText, "image/svg+xml");
  const root = doc.documentElement;
  if (root.localName !== "svg" || doc.querySelector("parsererror")) throw new Error("Invalid SVG");

  // 1. <use href="#id"/>  ->  copy of the referenced element (with the attributes of the <use>).
  const byId = new Map();
  for (const el of root.querySelectorAll("[id]")) byId.set(el.getAttribute("id"), el);
  for (const use of [...root.querySelectorAll("use")]) {
    const ref = hrefOf(use);
    const target = ref?.startsWith("#") ? byId.get(ref.slice(1)) : null;
    if (!target) continue;
    const copy = target.cloneNode(true);
    copy.removeAttribute("id");
    let extra = "";
    for (const attr of [...use.attributes]) {
      if (/^(href|xlink:href|id|x|y|width|height)$/.test(attr.name)) continue;
      if (attr.name === "transform") { extra = attr.value; continue; }
      copy.setAttribute(attr.name, attr.value);
    }
    const x = use.getAttribute("x"), y = use.getAttribute("y");
    if (x || y) extra = `${extra} translate(${x ?? 0} ${y ?? 0})`.trim();
    if (extra) copy.setAttribute("transform", `${extra} ${copy.getAttribute("transform") ?? ""}`.trim());
    use.replaceWith(copy);
  }

  // 2. Merge the nested transform-only <g> wrappers.
  const withTransform = (el, matrix) => {
    const own = el.hasAttribute("transform") ? parseTransform(el.getAttribute("transform")) : IDENTITY;
    if (own === null) { // unknown syntax: keep it as text after the accumulated matrix
      el.setAttribute("transform", `${isIdentity(matrix) ? "" : formatMatrix(matrix) + " "}${el.getAttribute("transform")}`.trim());
      return;
    }
    const total = multiply(matrix, own);
    if (isIdentity(total)) el.removeAttribute("transform");
    else el.setAttribute("transform", formatMatrix(total));
  };

  let seq = 0;
  const walk = (parent, matrix) => {
    for (const child of children(parent)) {
      if (child.localName === "defs" || child.localName === "metadata" || child.localName === "title") continue;
      if (onlyTransform(child)) { // wrapper: apply its transform to the content and remove it
        const own = parseTransform(child.getAttribute("transform"));
        if (own === null) { walk(child, IDENTITY); continue; } // cannot merge: keep it
        walk(child, multiply(matrix, own));
        child.replaceWith(...children(child));
        continue;
      }
      if (child.classList?.contains("mdc-sign") || child.getAttribute("class") === "mdc-sign") {
        mergeSign(child, matrix);
        continue;
      }
      if (child.localName === "g") { walk(child, IDENTITY); withTransform(child, matrix); continue; }
      withTransform(child, matrix);
    }
  };

  // A sign group with a single drawn element becomes that element, carrying the group's attributes.
  const mergeSign = (group, matrix) => {
    walk(group, IDENTITY); // collapses inner wrappers; their transforms stay on the leaf elements
    const code = group.getAttribute("data-mdc");
    const leaves = children(group);
    const index = group.getAttribute("data-mdc-index") ?? String(seq);
    seq += 1;
    const id = `mdc-${index}-${(code ?? "").replace(/[^\w-]/g, "") || group.getAttribute("data-mdc-kind") || "sign"}`;
    if (leaves.length === 1 && leaves[0].localName !== "g") {
      const leaf = leaves[0];
      for (const attr of [...group.attributes]) if (!leaf.hasAttribute(attr.name)) leaf.setAttributeNS(attr.namespaceURI, attr.name, attr.value);
      leaf.setAttribute("id", id);
      if (code) leaf.setAttribute("name", code);
      withTransform(leaf, matrix);
      group.replaceWith(leaf);
    } else {
      group.setAttribute("id", id);
      if (code) group.setAttribute("name", code);
      withTransform(group, matrix);
      for (const leaf of leaves) if (code && leaf.localName === "path") leaf.setAttribute("name", code);
    }
  };

  walk(root, IDENTITY);

  // 3. <defs> that are no longer used: remove them (the glyphs are already in place).
  const stillUsed = new Set([...root.querySelectorAll("use")].map(hrefOf));
  for (const defs of [...root.querySelectorAll("defs")]) {
    for (const child of [...defs.children]) if (!stillUsed.has("#" + child.getAttribute("id"))) child.remove();
    if (!defs.children.length) defs.remove();
  }
  return new XMLSerializer().serializeToString(root);
}

/** Full text of a .svg file ready to open in Inkscape / Corel Draw. */
export function svgFileText(svgText) {
  return `<?xml version="1.0" encoding="UTF-8"?>\n${flattenSvg(svgText)}\n`;
}

/**
 * Rasterizes the SVG to PNG. `scale` multiplies the SVG width/height (default 2); it is reduced
 * automatically if the result would exceed the usual canvas limits. The background is transparent
 * unless `background` is given. Returns an image/png Blob.
 */
export async function svgToPng(svgText, { scale = 2, background = null } = {}) {
  const flat = flattenSvg(svgText);
  const root = new DOMParser().parseFromString(flat, "image/svg+xml").documentElement;
  const vb = (root.getAttribute("viewBox") ?? "").split(/[\s,]+/).map(Number);
  const w0 = parseFloat(root.getAttribute("width")) || vb[2];
  const h0 = parseFloat(root.getAttribute("height")) || vb[3];
  if (!(w0 > 0 && h0 > 0)) throw new Error("The SVG has no size");
  const limit = Math.min(16000 / w0, 16000 / h0, Math.sqrt(100e6 / (w0 * h0)));
  const k = Math.max(0.1, Math.min(scale, limit));
  const width = Math.max(1, Math.round(w0 * k)), height = Math.max(1, Math.round(h0 * k));
  root.setAttribute("width", String(width));
  root.setAttribute("height", String(height));
  const url = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(root)], { type: "image/svg+xml;charset=utf-8" }));
  try {
    const img = new Image();
    img.decoding = "async";
    await new Promise((ok, fail) => { img.onload = ok; img.onerror = () => fail(new Error("The browser could not draw the SVG")); img.src = url; });
    const canvas = document.createElement("canvas");
    canvas.width = width; canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (background) { ctx.fillStyle = background; ctx.fillRect(0, 0, width, height); }
    ctx.drawImage(img, 0, 0, width, height);
    const blob = await new Promise((ok) => canvas.toBlob(ok, "image/png"));
    if (!blob) throw new Error("Could not create the PNG");
    return blob;
  } finally {
    URL.revokeObjectURL(url);
  }
}
