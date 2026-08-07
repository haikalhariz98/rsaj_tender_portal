// Print a readable outline of a rendered DOM: class names, nesting and the text
// each node carries. Used to copy the prototype's screens accurately.
import { readFileSync } from "node:fs";
import { JSDOM } from "jsdom";

const file = process.argv[2];
const selector = process.argv[3] ?? ".content";
const maxDepth = Number(process.argv[4] ?? 6);

const dom = new JSDOM(readFileSync(file, "utf8"));
const root = dom.window.document.querySelector(selector);
if (!root) throw new Error(`no ${selector} in ${file}`);

const SKIP = new Set(["SVG", "PATH", "CIRCLE", "RECT", "LINE", "POLYLINE", "G", "DEFS"]);

function ownText(el) {
  return [...el.childNodes]
    .filter((n) => n.nodeType === 3)
    .map((n) => n.textContent.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join(" ");
}

function walk(el, depth) {
  if (depth > maxDepth || SKIP.has(el.tagName)) return;
  const cls = el.getAttribute("class");
  const tag = el.tagName.toLowerCase();
  const text = ownText(el);
  // Only show nodes that carry a class or text — the rest is plumbing.
  if (cls || text) {
    const label = cls ? `${tag}.${cls.split(/\s+/).join(".")}` : tag;
    console.log("  ".repeat(depth) + label + (text ? `   « ${text.slice(0, 90)} »` : ""));
  }
  for (const child of el.children) walk(child, depth + (cls || text ? 1 : 0));
}

walk(root, 0);
