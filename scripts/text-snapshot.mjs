// Snapshot the visible text of every route (and every tab) from the running dev
// server, one file per screen. Run before and after a UI change and diff the two
// directories: a restyle must not drop a field, a warning or a provenance tag.
//
//   node scripts/text-snapshot.mjs <out-dir> [base-url]
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { JSDOM } from "jsdom";

const out = process.argv[2];
const base = process.argv[3] ?? "http://localhost:3000";
if (!out) throw new Error("usage: node scripts/text-snapshot.mjs <out-dir> [base-url]");

const ROUTES = [
  "/",
  "/sourcing",
  "/projects",
  "/suppliers",
  "/documents",
  "/reports",
  "/supplier",
  "/supplier/opportunities",
  "/supplier/bids",
  "/supplier/projects",
  "/supplier/company",
  "/configuration",
  "/configuration/organisation",
  "/configuration/approval-matrix",
  "/configuration/committees",
  "/configuration/committees/TENDER_BOARD",
  "/configuration/committees/QUOTE_CTTE",
  "/configuration/documents",
  "/configuration/notifications",
  "/configuration/numbering",
  "/configuration/reference-data",
  "/configuration/templates",
  ...["people", "roles", "permissions", "delegation"].map((t) => `/configuration/users?tab=${t}`),
  ...["codes", "periods", "allocations", "availability", "controls", "finance"].map(
    (t) => `/configuration/budget?tab=${t}`,
  ),
];

// Text only, one line per block of text, whitespace collapsed. Class names and
// structure are deliberately ignored: they are what a redesign changes.
function lines(html) {
  const { document } = new JSDOM(html).window;
  const root = document.querySelector("main") ?? document.body;
  root.querySelectorAll("script, style, template, svg").forEach((n) => n.remove());
  const outLines = [];
  const walker = document.createTreeWalker(root, 4 /* SHOW_TEXT */);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const t = n.textContent.replace(/\s+/g, " ").trim();
    if (t) outLines.push(t);
  }
  // Attributes a user reads too.
  root.querySelectorAll("[placeholder],[aria-label],[title]").forEach((el) => {
    for (const a of ["placeholder", "aria-label", "title"]) {
      const v = el.getAttribute(a);
      if (v) outLines.push(`@${a}: ${v}`);
    }
  });
  return outLines.join("\n") + "\n";
}

mkdirSync(out, { recursive: true });
for (const route of ROUTES) {
  const res = await fetch(base + route);
  const name = (route === "/" ? "dashboard" : route.slice(1)).replace(/[/?=]/g, "__") + ".txt";
  writeFileSync(join(out, name), `# ${route} (${res.status})\n` + lines(await res.text()));
  console.log(res.status, route);
}
