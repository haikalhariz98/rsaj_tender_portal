// Compare the shell this app renders against the prototype's, element by element.
// Reading the prototype's source produced screens that only looked similar; this
// checks the actual DOM so "the same" is a measurement rather than an opinion.
import { readFileSync } from "node:fs";
import { JSDOM } from "jsdom";

import { signedInFetch } from "./signed-in-fetch.mjs";

const [protoFile, appUrl] = process.argv.slice(2);

const proto = new JSDOM(readFileSync(protoFile, "utf8")).window.document;
const app = new JSDOM(await (await signedInFetch(appUrl)).text()).window.document;

const SKIP = /^(svg|path|circle|rect|line|polyline|g|defs|img)$/;

/// The set of classed elements under a selector, as tag.class strings.
function shape(doc, selector) {
  const root = doc.querySelector(selector);
  if (!root) return null;
  const out = [];
  for (const el of root.querySelectorAll("*")) {
    if (SKIP.test(el.tagName.toLowerCase())) continue;
    const cls = el.getAttribute("class");
    if (!cls) continue;
    out.push(el.tagName.toLowerCase() + "." + cls.trim().split(/\s+/).sort().join("."));
  }
  return out;
}

function report(selector) {
  const a = shape(proto, selector);
  const b = shape(app, selector);
  console.log(`\n### ${selector}`);
  if (!a) return console.log("  prototype: missing");
  if (!b) return console.log("  app: MISSING");

  const ca = new Map(), cb = new Map();
  for (const k of a) ca.set(k, (ca.get(k) ?? 0) + 1);
  for (const k of b) cb.set(k, (cb.get(k) ?? 0) + 1);

  const missing = [...ca.keys()].filter((k) => !cb.has(k));
  const extra = [...cb.keys()].filter((k) => !ca.has(k));

  console.log(`  prototype ${a.length} classed nodes, app ${b.length}`);
  if (missing.length) console.log("  MISSING in app :", missing.slice(0, 14).join("  "));
  if (extra.length) console.log("  extra in app   :", extra.slice(0, 14).join("  "));
  if (!missing.length && !extra.length) console.log("  identical class shape");
}

for (const sel of [".sidebar", ".topbar", ".pagehead", ".record"]) report(sel);

// Root element type matters: the prototype uses nav.sidebar, not aside.
for (const sel of [".sidebar", ".topbar", ".rrail"]) {
  const p = proto.querySelector(sel)?.tagName.toLowerCase();
  const q = app.querySelector(sel)?.tagName.toLowerCase();
  console.log(`\n${sel} element: prototype <${p}>  app <${q}>  ${p === q ? "ok" : "DIFFERENT"}`);
}
