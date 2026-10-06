// Snapshot the visible text of every route (and every tab) from the running dev
// server, one file per screen. Run before and after a UI change and diff the two
// directories: a restyle must not drop a field, a warning or a provenance tag.
//
//   node scripts/text-snapshot.mjs <out-dir> [base-url] [extra-route …]
//
// Extra routes (a record's tab or section, say "/sourcing/demo_sx16?tab=bids&section=opening")
// are snapshotted after the standard ones.
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { JSDOM } from "jsdom";

import { signedInFetch } from "./signed-in-fetch.mjs";

const out = process.argv[2];
const base = process.argv[3] ?? "http://localhost:3000";
if (!out) throw new Error("usage: node scripts/text-snapshot.mjs <out-dir> [base-url]");

const ROUTES = [
  "/",
  "/sourcing",
  "/projects",
  "/suppliers",
  "/documents",
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
  "/requisitions",
  "/requisitions/new",
  "/sourcing/new",
  "/awards",
  "/awards/new",
  "/approvals",
  "/securities",
  "/committees",
  "/configuration/requisitions",
  "/configuration/awards",
  "/configuration/scope",
  "/configuration/audit",
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

// One record from each list (and its edit screen), found by following the first link.
for (const [list, re] of [
  ["/requisitions", /href="(\/requisitions\/(?!new|receive)[0-9A-Za-z_-]{4,})"/],
  ["/sourcing", /href="(\/sourcing\/[0-9A-Za-z_-]{4,})"/],
  ["/awards", /href="(\/awards\/[0-9A-Za-z_-]{4,})"/],
  ["/committees", /href="(\/committees\/[0-9A-Za-z_-]{4,})"/],
]) {
  const hit = re.exec(await (await signedInFetch(base + list)).text());
  if (hit) ROUTES.push(hit[1], ...(list === "/awards" || list === "/committees" ? [] : [`${hit[1]}/edit`]));
}

ROUTES.push(...process.argv.slice(4));

mkdirSync(out, { recursive: true });
for (const route of ROUTES) {
  const res = await signedInFetch(base + route);
  const name = (route === "/" ? "dashboard" : route.slice(1)).replace(/[/?=]/g, "__") + ".txt";
  writeFileSync(join(out, name), `# ${route} (${res.status})\n` + lines(await res.text()));
  console.log(res.status, route);
}
