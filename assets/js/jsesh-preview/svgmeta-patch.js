// svgmeta-patch.js
//
// Patch for jsesh/jsesh.js (JSesh-js 0.2.0) so that the exported SVG keeps the Manuel de Codage
// code of every sign (A1, M11, N35, Aa11...).
//
// Without the patch, JSesh-js draws each sign as <use href="#jsesh0-s3"/> and the code is lost.
// With the patch:
//   1. Every sign is wrapped in  <g class="mdc-sign" data-mdc="F35" mdc:code="F35"
//                                   data-mdc-kind="glyph" data-mdc-index="0" data-mdc-input="nfr"> ... </g>
//      (data-mdc = canonical code; data-mdc-input = what was typed, only when it differs).
//   2. The root <svg> declares xmlns:mdc and carries a <metadata> element with the JSON list of
//      signs in reading order (code, typed text, kind, position and size).
//
// Sign kinds (field "kind"):
//   "glyph"             a hieroglyph (MdC code such as A1, N35, nfr)
//   "philological-mark" brackets and marks for erasures, additions, doubtful readings...
//                       (field "mark" names the mark when it is known)
//   "point"             red / black point
//
// The patch works on the TEXT of jsesh.js: every anchor must appear exactly once. If a future
// JSesh-js version changes that code, the patch fails with a clear message instead of silently
// producing an SVG without metadata.

export const MDC_NAMESPACE = "urn:manuel-de-codage:svg-metadata:1";
export const METADATA_VERSION = 2;

// ---------------------------------------------------------------------------------------
// Code injected into the class that draws the SVG (self-contained: it does not use the
// minified internal names of the bundle).
// ---------------------------------------------------------------------------------------
const INJECTED_METHODS = `signList = [];
	tagSign(h, svg, page, view) {
		if (svg === "") return svg;
		const input = h.code;
		const special = this.signs.constructor.isSpecial(input);
		const known = this.signs.isKnown(input);
		const code = known && !special ? this.signs.provider.canonicalCode(input) : input;
		const marks = {
			50: "erased signs", 51: "editor addition", 52: "editor superfluous", 53: "previously readable",
			54: "scribe addition", 55: "minor addition", 56: "dubious",
			100: "begin erasure", 101: "end erasure", 102: "begin editor addition", 103: "end editor addition",
			104: "begin editor superfluous", 105: "end editor superfluous", 106: "begin previously readable",
			107: "end previously readable", 108: "begin scribe addition", 109: "end scribe addition",
			110: "begin minor addition", 111: "end minor addition", 112: "begin dubious", 113: "end dubious"
		};
		const kind = special || h.type >= 50 ? "philological-mark" : h.type === 3 || h.type === 4 ? "point" : "glyph";
		const r = (v) => Math.round(v * 1000) / 1000;
		const index = this.signList.length;
		const entry = {
			index,
			code,
			input,
			kind,
			known: known || special,
			x: r(page.tx),
			y: r(page.ty),
			width: r(view.width * page.sx),
			height: r(view.height * page.sy)
		};
		if (kind === "philological-mark" && marks[h.type]) entry.mark = marks[h.type];
		if (special) entry.special = true;
		if (h.angle) entry.angle = h.angle;
		if (h.isReversed) entry.reversed = true;
		if (h.modifiers.getBoolean("red")) entry.red = true;
		this.signList.push(entry);
		const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
		return '<g class="mdc-sign" data-mdc="' + esc(code) + '" mdc:code="' + esc(code) + '" data-mdc-kind="' + kind
			+ '" data-mdc-index="' + index + '"'
			+ (input !== code ? ' data-mdc-input="' + esc(input) + '"' : "")
			+ (entry.mark ? ' data-mdc-mark="' + esc(entry.mark) + '"' : "")
			+ (entry.known ? "" : ' data-mdc-unknown="true"') + ">" + svg + "</g>";
	}
	metadataXml(source) {
		const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
		const json = JSON.stringify({
			version: ${METADATA_VERSION},
			source: source ?? null,
			signCount: this.signList.length,
			glyphCount: this.signList.filter((s) => s.kind === "glyph").length,
			signs: this.signList
		});
		return '<metadata id="mdc-metadata"><mdc:signs format="application/json" count="' + this.signList.length + '">' + esc(json) + "</mdc:signs></metadata>";
	}
	useShape(e, t, n) {`;

// ---------------------------------------------------------------------------------------
// Replacements. "find" must appear exactly once in jsesh.js.
// ---------------------------------------------------------------------------------------
const EDITS = [
  {
    name: "root <svg>: declare the mdc namespace",
    find: '<svg xmlns="http://www.w3.org/2000/svg" viewBox=',
    replace: `<svg xmlns="http://www.w3.org/2000/svg" xmlns:mdc="${MDC_NAMESPACE}" viewBox=`,
  },
  {
    name: "root <svg>: insert <metadata> after <title>",
    find: "+ c + o.defs() + u + s",
    replace: "+ c + o.metadataXml(n.title) + o.defs() + u + s",
  },
  {
    name: "drawing class: tagSign and metadataXml methods",
    find: "useShape(e, t, n) {",
    replace: INJECTED_METHODS,
  },
  {
    name: "visitHieroglyph: wrap each red point in its <g>",
    find: "this.out += this.sign(e.code, 0, !1, this.d.signs.scaleFromFontToStyle(t), t.painting.redColor);",
    replace:
      "this.out += this.d.tagSign(e, this.sign(e.code, 0, !1, this.d.signs.scaleFromFontToStyle(t), t.painting.redColor), this.page, this.view);",
  },
  {
    name: "visitHieroglyph: wrap each sign in its <g>",
    find: "this.out += this.sign(e.code, e.angle, r, i, this.color);",
    replace:
      "this.out += this.d.tagSign(e, this.sign(e.code, e.angle, r, i, this.color), this.page, this.view);",
  },
];

function countOccurrences(text, needle) {
  let count = 0;
  for (let at = text.indexOf(needle); at !== -1; at = text.indexOf(needle, at + needle.length)) count++;
  return count;
}

/**
 * Applies the patch to the text of jsesh.js and returns the patched text.
 * Throws an Error if the JSesh-js code is not the expected one.
 */
export function patchJsesh(source) {
  if (source.includes("tagSign(")) return source; // already patched
  for (const edit of EDITS) {
    const n = countOccurrences(source, edit.find);
    if (n !== 1) {
      throw new Error(
        `jsesh.js does not match the expected version (JSesh-js 0.2.0): the anchor "${edit.name}" ` +
          `appears ${n} times (it should be 1). Use the jsesh.js from jsesh-web-0.2.0.zip or update svgmeta-patch.js.`,
      );
    }
  }
  let out = source;
  for (const edit of EDITS) {
    // split/join prevents "$&" and similar sequences in the replacement from being read as patterns.
    out = out.split(edit.find).join(edit.replace);
  }
  return out;
}
