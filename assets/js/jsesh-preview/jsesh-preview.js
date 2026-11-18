// jsesh-preview.js
//
// "JSesh Preview" button for pages that show hieroglyphic texts: opens a modal with the SVG
// rendering of a JSesh .gly file, with the MdC code of every sign.
//
//   - Reads the parameters in the .gly header (++JSesh_page_direction, ++JSesh_page_orientation,
//     ++JSesh_small_sign_centered, ++JSesh_line_skip, ...) and applies them when drawing.
//   - Skips the Latin header and footer lines (those starting with +b or +i or +l).
//   - Downloads the JSesh-js library ONLY when the preview is opened, from `jseshBase`.
//
// Usage in the page (after loading this module):
//   <button onclick="JSeshPreview.open('https://raw.githubusercontent.com/.../archivo.gly')">JSesh Preview</button>
//
// Files needed next to this one: svgmeta-patch.js, sign-hover.js and svg-export.js.

import { patchJsesh } from "./svgmeta-patch.js";
import { attachSignHover, kindLabel, prepareSvg, readSigns } from "./sign-hover.js";
import { svgFileText, svgToPng } from "./svg-export.js";

const config = {
  // Carpeta jsesh/ de JSesh-js 0.2.0 (jsesh.js + data/). Debe terminar en "/".
  jseshBase: "https://files.qenherkhopeshef.org/jsesh-web/0.2.0/jsesh/",
  // Height of the cadrat in px (size of the downloaded SVG).
  cadratHeight: 50,
  // PNG enlargement factor relative to the SVG size.
  pngScale: 2,
  // "Powered by" note shown at the bottom of the modal.
  creditText: "JSesh-web 0.2.0",
  creditUrl: "https://files.qenherkhopeshef.org/jsesh-web/0.2.0/",
  // .gly lines starting with these prefixes (Latin header/footer text) are not drawn.
  skipPrefixes: ["+b", "+i", "+l"],
};

export function configure(options = {}) {
  Object.assign(config, options);
  // Relative paths are resolved against the page (not against this module).
  const base = globalThis.location ? new URL(config.jseshBase, globalThis.location.href).href : config.jseshBase;
  config.jseshBase = base.replace(/\/?$/, "/");
}

// ---------------------------------------------------------------------------------------
// Reading the .gly
// ---------------------------------------------------------------------------------------

/**
 * Splits a .gly file into:
 *   properties : header parameters (++JSesh_xxx value +s)
 *   lines/mdc  : hieroglyphic text lines (without header or +b/+i/+l lines)
 *   skipped    : omitted lines (+b/+i/+l)
 *   settings   : { direction: "rtl"|"ltr", orientation: "horizontal"|"vertical", centered: bool }
 */
export function parseGly(text, skipPrefixes = config.skipPrefixes) {
  const properties = {};
  const lines = [];
  const skipped = [];
  let inHeader = true;
  for (const raw of String(text).replace(/^﻿/, "").split(/\r\n|\n|\r/)) {
    const line = raw.trim();
    if (inHeader && line.startsWith("++JSesh_")) {
      const parts = line.split(" ");
      properties[parts[0].slice(2)] = parts.length > 1 ? parts[1] : "";
      continue;
    }
    inHeader = false;
    if (line === "") continue;
    if (skipPrefixes.some((prefix) => line.startsWith(prefix))) skipped.push(line);
    else lines.push(line);
  }
  return {
    properties,
    lines,
    mdc: lines.join("\n"),
    skipped,
    settings: {
      direction: properties.JSesh_page_direction === "RIGHT_TO_LEFT" ? "rtl" : "ltr",
      orientation: properties.JSesh_page_orientation === "VERTICAL" ? "vertical" : "horizontal",
      centered: properties.JSesh_small_sign_centered === "true",
    },
  };
}

// ---------------------------------------------------------------------------------------
// JSesh-js (downloaded once, on demand)
// ---------------------------------------------------------------------------------------
const libraries = new Map();

function loadLibrary(base) {
  if (!libraries.has(base)) {
    const promise = (async () => {
      let response;
      try {
        response = await fetch(`${base}jsesh.js`);
      } catch (error) {
        throw new Error(`Could not reach ${base}jsesh.js (${error.message}).`);
      }
      if (!response.ok) throw new Error(`Could not load ${base}jsesh.js (HTTP ${response.status}).`);
      const patched = patchJsesh(await response.text());
      const url = URL.createObjectURL(new Blob([patched], { type: "text/javascript" }));
      const lib = await import(url);
      lib.configureJSesh({ glyphsUrl: `${base}data/` });
      return lib;
    })();
    promise.catch(() => libraries.delete(base)); // allow retrying
    libraries.set(base, promise);
  }
  return libraries.get(base);
}

async function renderGly(parsed) {
  const lib = await loadLibrary(config.jseshBase);
  // The .gly parameters are applied with JSesh-js's own reader.
  const preferences = lib.documentPreferencesFromMap(parsed.properties);
  const style = lib.applyDocumentPreferences(preferences, lib.DEFAULT_STYLE);
  return lib.renderMdc(parsed.mdc, { style, cadratHeight: config.cadratHeight });
}

// ---------------------------------------------------------------------------------------
// Modal
// ---------------------------------------------------------------------------------------
const CSS = `
.jsp-backdrop{position:fixed;inset:0;z-index:2147482000;display:flex;align-items:center;justify-content:center;
  padding:16px;background:rgba(20,18,14,.55)}
.jsp-dialog{display:flex;flex-direction:column;width:min(1100px,100%);max-height:calc(100vh - 32px);
  background:var(--bs-body-bg,#fff);color:var(--bs-body-color,#212529);border-radius:12px;
  box-shadow:0 12px 40px rgba(0,0,0,.35);font:15px/1.5 var(--bs-body-font-family,system-ui,sans-serif);overflow:hidden}
.jsp-dialog:focus{outline:none}
.jsp-head{display:flex;align-items:flex-start;gap:12px;padding:14px 18px;border-bottom:1px solid rgba(128,128,128,.25)}
.jsp-head h2{margin:0;font-size:1.15rem;font-weight:700}
.jsp-sub{margin:2px 0 0;font-size:.85rem;opacity:.7;overflow-wrap:anywhere}
.jsp-x{margin-left:auto;border:0;background:none;color:inherit;font-size:1.6rem;line-height:1;cursor:pointer;opacity:.6;padding:0 4px}
.jsp-x:hover{opacity:1}
.jsp-body{flex:1;min-height:120px;overflow:auto;padding:16px 18px;background:#fffdf8}
.jsp-view svg{display:block;max-width:100%;height:auto;margin:0 auto;color:#000}
.jsp-msg{padding:28px 8px;text-align:center;color:#4a4339;white-space:pre-wrap}
.jsp-msg.err{color:#a3261c}
.jsp-info{padding:8px 18px;font-size:.82rem;opacity:.75;border-top:1px solid rgba(128,128,128,.25);min-height:2.4em}
.jsp-foot{display:flex;flex-wrap:wrap;gap:8px;padding:12px 18px;border-top:1px solid rgba(128,128,128,.25)}
.jsp-foot .jsp-spacer{flex:1}
.jsp-credit{margin:0;padding:6px 18px 10px;font-size:.75rem;text-align:right;opacity:.65}
.jsp-credit a{color:inherit;text-decoration:underline}
.jsp-btn{font:inherit;cursor:pointer;padding:6px 14px;border-radius:6px;border:1px solid var(--bs-primary,#0d6efd);
  background:transparent;color:var(--bs-primary,#0d6efd)}
.jsp-btn:hover:not(:disabled){background:var(--bs-primary,#0d6efd);color:#fff}
.jsp-btn:disabled{opacity:.45;cursor:default}
.jsp-btn.secondary{border-color:rgba(128,128,128,.6);color:inherit}
.jsp-btn.secondary:hover:not(:disabled){background:rgba(128,128,128,.2);color:inherit}
html.jsp-open{overflow:hidden}.jsp-loader-gif{vertical-align:middle;margin-bottom:4px;}
`;

const view = { root: null, token: 0, hover: null, opener: null, data: null };

function ensureStyle() {
  if (document.getElementById("jsp-style")) return;
  const style = document.createElement("style");
  style.id = "jsp-style";
  style.textContent = CSS;
  document.head.append(style);
}

function el(tag, props = {}, ...children) {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...children);
  return node;
}

function buildModal() {
  ensureStyle();
  const title = el("h2", { id: "jsp-title", textContent: "JSesh Preview" });
  const sub = el("p", { className: "jsp-sub" });
  const close = el("button", { className: "jsp-x", type: "button", textContent: "×" });
  close.setAttribute("aria-label", "Close");
  const bodyView = el("div", { className: "jsp-view" });
  const body = el("div", { className: "jsp-body" }, bodyView);
  const info = el("div", { className: "jsp-info" });
  info.setAttribute("aria-live", "polite");
  const btn = (text, act, cls = "") => {
    const b = el("button", { className: `jsp-btn ${cls}`.trim(), type: "button", textContent: text });
    b.dataset.act = act;
    return b;
  };
  const foot = el(
    "div",
    { className: "jsp-foot" },
    btn("Download SVG", "svg"),
    btn("Download PNG", "png"),
    btn("Copy SVG", "copy"),
    btn("Download JSON glyph info", "json"),
    el("span", { className: "jsp-spacer" }),
    btn("Close", "close", "secondary"),
  );
  const credit = el("p", { className: "jsp-credit" }, "Powered by ");
  credit.append(el("a", { href: config.creditUrl, target: "_blank", rel: "noopener noreferrer", textContent: config.creditText }));
  const dialog = el("div", { className: "jsp-dialog", tabIndex: -1 }, el("div", { className: "jsp-head" }, el("div", {}, title, sub), close), body, info, foot, credit);
  dialog.setAttribute("role", "dialog");
  dialog.setAttribute("aria-modal", "true");
  dialog.setAttribute("aria-labelledby", "jsp-title");
  const root = el("div", { className: "jsp-backdrop" }, dialog);

  root.addEventListener("mousedown", (event) => {
    if (event.target === root) close_();
  });
  close.addEventListener("click", close_);
  foot.addEventListener("click", (event) => {
    const act = event.target.closest?.("[data-act]")?.dataset.act;
    if (act === "close") close_();
    else if (act === "svg") downloadSvg();
    else if (act === "png") downloadPng();
    else if (act === "copy") copySvg();
    else if (act === "json") downloadJson();
  });
  root.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      event.stopPropagation();
      close_();
    } else if (event.key === "Tab") {
      const items = [...dialog.querySelectorAll("button:not(:disabled)")];
      if (!items.length) return;
      const first = items[0];
      const last = items.at(-1);
      if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
  });
  return { root, dialog, sub, bodyView, info, foot };
}

let ui = null;

function setButtons(enabled) {
  for (const b of ui.foot.querySelectorAll("[data-act]")) if (b.dataset.act !== "close") b.disabled = !enabled;
}

function showMessage(text, isError = false) {
  view.hover?.destroy();
  view.hover = null;
  ui.bodyView.replaceChildren(el("div", { className: `jsp-msg${isError ? " err" : ""}`, textContent: text }));
  setButtons(false);
}

const LOADER_SRC = "assets/img/loading.gif"; // ajusta si tu HTML no está en la raíz

function showLoader() {
  view.hover?.destroy();
  view.hover = null;

  const wrapper = el("div", { className: "jsp-msg" });
  const img = el("img", {
    src: LOADER_SRC,
    alt: "",
    className: "jsp-loader-gif",
  });
  const label = el("span", { textContent: " Loading JSesh…" });

  wrapper.append(img, el("br"), el("span", { textContent: "Loading JSesh…" }));
  wrapper.setAttribute("role", "status");
  wrapper.setAttribute("aria-live", "polite");

  ui.bodyView.replaceChildren(wrapper);
  setButtons(false);
}

function close_() {
  if (!ui?.root.isConnected) return;
  view.token++; // discard any load in progress
  view.hover?.destroy();
  view.hover = null;
  ui.root.remove();
  document.documentElement.classList.remove("jsp-open");
  view.opener?.focus?.();
  view.opener = null;
}

// ---------------------------------------------------------------------------------------
// Opening
// ---------------------------------------------------------------------------------------
function describeSettings(settings) {
  return [
    settings.direction === "rtl" ? "Right to left" : "Left to right",
    settings.orientation === "vertical" ? "vertical" : "horizontal",
    settings.centered ? "small signs centered" : "small signs at the bottom",
  ].join(" · ");
}

function openModal(subtitle) {
  ui ??= buildModal();
  if (!ui.root.isConnected) {
    view.opener = document.activeElement;
    document.body.append(ui.root);
    document.documentElement.classList.add("jsp-open");
  }
  ui.sub.textContent = subtitle || "";
  ui.sub.hidden = !subtitle;
  ui.info.textContent = "";
  ui.dialog.focus();
}

async function show(source, label, subtitle) {
  const token = ++view.token;
  openModal(subtitle);  showLoader();
  //showMessage("Loading JSesh…");
  try {
    const text = typeof source === "string" ? await fetchText(source) : source.text;
    if (token !== view.token) return;
    const parsed = parseGly(text);
    if (parsed.mdc === "") {
      showMessage("This file has no hieroglyphic text to display.");
      return;
    }
    const svgText = await renderGly(parsed);
    if (token !== view.token) return;
    ui.bodyView.innerHTML = svgText;
    const svg = ui.bodyView.querySelector("svg");
    const { signs } = readSigns(svg);
    prepareSvg(svg); // no <title> on screen: avoids the native tooltip with the whole text
    view.data = { svgText, parsed, signs, label, name: baseName(label) };
    view.hover?.destroy();
    view.hover = attachSignHover(ui.bodyView, {
      getSigns: () => signs,
      onChange: (sign) => {
        ui.info.textContent = sign ? `#${sign.index + 1} · ${sign.code} · ${kindLabel(sign)}${sign.input !== sign.code ? ` (typed «${sign.input}»)` : ""}` : baseInfo();
      },
    });
    ui.info.textContent = baseInfo();
    setButtons(true);
  } catch (error) {
    if (token !== view.token) return;
    showMessage(friendlyError(error), true);
  }
}

function baseInfo() {
  const { parsed, signs } = view.data;
  const count = signs.filter((s) => s.kind === "glyph").length;
  return `${describeSettings(parsed.settings)} — ${count} glyph${count === 1 ? "" : "s"}. Hover over a sign to see its MdC code.`;
}

async function fetchText(url) {
  let response;
  try {
    response = await fetch(url);
  } catch (error) {
    throw new Error(`Could not download the .gly file (${error.message}).`);
  }
  if (!response.ok) throw new Error(`Could not download the .gly file (HTTP ${response.status}).`);
  return response.text();
}

function friendlyError(error) {
  const message = error?.message ?? String(error);
  if (/jsesh\.js|Failed to fetch|NetworkError|Load failed/i.test(message)) {
    return (
      `${message}\n\n` +
      "JSesh-js is loaded from:\n" +
      `${config.jseshBase}\n\n` +
      "If that server does not allow cross-origin requests (CORS), copy the jsesh/ folder to this site and use\n" +
      "JSeshPreview.configure({ jseshBase: 'assets/jsesh/' })."
    );
  }
  return message;
}

function baseName(label) {
  try {
    const last = decodeURIComponent(new URL(label, location.href).pathname.split("/").pop() ?? "");
    const name = last.replace(/\.gly$/i, "").replace(/[^\w.-]+/g, "_").replace(/^_+|_+$/g, "");
    return name || "jsesh";
  } catch {
    return "jsesh";
  }
}

// ---------------------------------------------------------------------------------------
// Downloads
// ---------------------------------------------------------------------------------------
function svgFile() {
  return svgFileText(view.data.svgText); // no <use>: each glyph is a <path name="MdC code">
}

function save(name, content, type) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = el("a", { href: url, download: name });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function downloadSvg() {
  if (view.data) save(`${view.data.name}.svg`, svgFile(), "image/svg+xml");
}

async function downloadPng() {
  if (!view.data) return;
  try {
    ui.info.textContent = "Creating PNG…";
    const blob = await svgToPng(view.data.svgText, { scale: config.pngScale });
    save(`${view.data.name}.png`, blob, "image/png");
    ui.info.textContent = "PNG downloaded (transparent background).";
  } catch (error) {
    ui.info.textContent = `Could not create the PNG: ${error.message}`;
  }
}

function downloadJson() {
  if (!view.data) return;
  const { parsed, signs, label, name } = view.data;
  const json = {
    source: label,
    settings: { ...parsed.settings, properties: parsed.properties },
    lines: parsed.lines,
    omittedLines: parsed.skipped,
    glyphCount: signs.filter((s) => s.kind === "glyph").length,
    signCount: signs.length,
    signs,
  };
  save(`${name}.json`, JSON.stringify(json, null, 2), "application/json");
}

async function copySvg() {
  if (!view.data) return;
  const text = svgFile();
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const area = el("textarea", { value: text });
    document.body.append(area);
    area.select();
    document.execCommand("copy");
    area.remove();
  }
  ui.info.textContent = "SVG copied to the clipboard.";
}

// ---------------------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------------------
/** Opens the preview of a .gly from its URL. */
export function open(glyUrl, options = {}) {
  return show(glyUrl, glyUrl, options.title ?? document.title);
}

/** Opens the preview from the text of a .gly you already have loaded. */
export function openText(text, options = {}) {
  const name = options.name ?? "jsesh.gly";
  return show({ text }, name, options.title ?? document.title);
}

export function close() {
  close_();
}

if (typeof window !== "undefined") {
  window.JSeshPreview = { open, openText, close, configure, parseGly };
}
