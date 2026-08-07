// Run the prototype in jsdom so React actually renders, then dump the DOM.
// Reading its source has produced screens that only approximate it; the rendered
// markup is the thing to copy.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { JSDOM, VirtualConsole } from "jsdom";

const OUT = process.argv[2];
const FILE = join(process.env.USERPROFILE, "projects", "perolehan", "docs", "prototype", "RSAJ-Tender-Portal.html");

const html = readFileSync(FILE, "utf8");

const virtualConsole = new VirtualConsole();
const errors = [];
virtualConsole.on("jsdomError", (e) => errors.push(e.message));
virtualConsole.on("error", (...a) => errors.push(String(a[0])));

const dom = new JSDOM(html, {
  runScripts: "dangerously",
  pretendToBeVisual: true,
  url: "http://localhost/",
  virtualConsole,
});

// Things the bundle may reach for that jsdom lacks.
const { window } = dom;
window.matchMedia ||= () => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} });
window.scrollTo ||= () => {};
window.HTMLElement.prototype.scrollIntoView ||= () => {};
window.ResizeObserver ||= class { observe() {} unobserve() {} disconnect() {} };
window.IntersectionObserver ||= class { observe() {} unobserve() {} disconnect() {} };
if (!window.crypto?.randomUUID) {
  window.crypto = { ...window.crypto, randomUUID: () => "00000000-0000-4000-8000-000000000000" };
}

await new Promise((r) => setTimeout(r, 4000));

const root = window.document.querySelector(".app") ?? window.document.body;
mkdirSync(OUT, { recursive: true });
writeFileSync(join(OUT, "rendered-dashboard.html"), root.outerHTML, "utf8");

console.log("rendered bytes :", root.outerHTML.length);
console.log("has .sidebar   :", Boolean(window.document.querySelector(".sidebar")));
console.log("has .topbar    :", Boolean(window.document.querySelector(".topbar")));
console.log("nav items      :", window.document.querySelectorAll(".navitem").length);
console.log("stat cards     :", window.document.querySelectorAll(".stat").length);
console.log("cards          :", window.document.querySelectorAll(".card").length);
console.log("tables         :", window.document.querySelectorAll("table").length);
console.log("errors         :", errors.slice(0, 5).join(" | ") || "none");

const navLabels = [...window.document.querySelectorAll(".navitem")].map((n) => n.textContent.trim());
console.log("nav            :", navLabels.join(" | "));

dom.window.close();
