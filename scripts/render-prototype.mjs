// Run the prototype in jsdom so React renders for real, optionally click through to
// a screen, then dump the DOM. Reading the bundle's source produces screens that
// only approximate it; the rendered markup is the thing to copy.
//
//   node scripts/render-prototype.mjs <outDir> [name] ["Click Text" ...]
//
// Each click argument is matched against the visible text of buttons, links and
// nav items, in order, with a settle pause between them.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { JSDOM, VirtualConsole } from "jsdom";

const [outDir, name = "screen", ...clicks] = process.argv.slice(2);
const FILE = join(
  process.env.USERPROFILE,
  "projects",
  "perolehan",
  "docs",
  "prototype",
  "RSAJ-Tender-Portal.html",
);

const virtualConsole = new VirtualConsole();
const errors = [];
virtualConsole.on("jsdomError", (e) => errors.push(e.message));

const dom = new JSDOM(readFileSync(FILE, "utf8"), {
  runScripts: "dangerously",
  pretendToBeVisual: true,
  url: "http://localhost/",
  virtualConsole,
});

const { window } = dom;
window.matchMedia ||= () => ({
  matches: false,
  addListener() {},
  removeListener() {},
  addEventListener() {},
  removeEventListener() {},
});
window.scrollTo ||= () => {};
window.HTMLElement.prototype.scrollIntoView ||= () => {};
window.ResizeObserver ||= class {
  observe() {}
  unobserve() {}
  disconnect() {}
};
window.IntersectionObserver ||= class {
  observe() {}
  unobserve() {}
  disconnect() {}
};

const settle = (ms = 1200) => new Promise((r) => setTimeout(r, ms));
await settle(4000);

const CLICKABLE = "button, a, [role=button], .navitem, .subnav__i, .tab, .hoverrow, .stat--clickable";

function clickByText(text) {
  const wanted = text.toLowerCase();
  const nodes = [...window.document.querySelectorAll(CLICKABLE)];
  // Prefer the shortest match, so "Value bands" does not land on a card that merely
  // mentions it in a paragraph.
  const hits = nodes
    .filter((n) => (n.textContent || "").toLowerCase().replace(/\s+/g, " ").includes(wanted))
    .sort((a, b) => a.textContent.length - b.textContent.length);
  if (!hits.length) return false;
  hits[0].dispatchEvent(new window.MouseEvent("click", { bubbles: true, cancelable: true }));
  return true;
}

for (const text of clicks) {
  const ok = clickByText(text);
  console.log(`click "${text}" : ${ok ? "hit" : "NOT FOUND"}`);
  await settle();
}

const root = window.document.querySelector(".app") ?? window.document.body;
mkdirSync(outDir, { recursive: true });
const out = join(outDir, `rendered-${name}.html`);
writeFileSync(out, root.outerHTML, "utf8");

const heading = window.document.querySelector(".pagehead__title")?.textContent?.trim();
console.log("wrote      :", out, `(${root.outerHTML.length} bytes)`);
console.log("page title :", heading || "(none)");
console.log("errors     :", errors.slice(0, 3).join(" | ") || "none");

dom.window.close();
