// Snapshot the visible text of every route (and every tab) from the running dev
// server, one file per screen. Run before and after a UI change and diff the two
// directories: a restyle must not drop a field, a warning or a provenance tag.
//
//   node scripts/text-snapshot.mjs [--visible] <out-dir> [base-url] [extra-route …]
//
// --visible skips text a reader cannot see (under .sr-only or [hidden], and a popover's closed copy), so two runs
// count the words on the screen. Without it the snapshot is the full text, which proves nothing was lost.
//
// Extra routes (a record's tab or section, say "/sourcing/demo_sx16?tab=bids&section=opening")
// are snapshotted after the standard ones.
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { JSDOM } from "jsdom";

import { signedInFetch } from "./signed-in-fetch.mjs";

const visible = process.argv.includes("--visible");
const argv = process.argv.filter((a) => a !== "--visible");
const out = argv[2];
const base = argv[3] ?? "http://localhost:3000";
if (!out) throw new Error("usage: node scripts/text-snapshot.mjs [--visible] <out-dir> [base-url]");

const ROUTES = [
  "/",
  "/sourcing",
  "/projects",
  "/suppliers",
  // "/documents" is a permanent redirect to /projects (MN-02, AC-16): no screen of its own.
  "/configuration",
  // Plan 5.1: the six section pages.
  ...["people", "approvals", "purchasing", "contracts-payments", "suppliers-portal", "system"].map((s) => `/configuration/${s}`),
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
  // AC-23 (C9): /awards redirects to /projects, which is already crawled.
  "/projects/new",
  "/approvals",
  "/inbox",
  "/projects?view=securities",
  "/projects?view=submissions",
  "/committees",
  "/configuration/requisitions",
  "/configuration/awards",
  "/configuration/scope",
  "/configuration/audit",
  // SR-13 (online sealed bids): no counterpart in the prototype; their text is recorded here.
  "/configuration/bid-sealing",
  "/configuration/security",
  "/configuration/tender-documents",
  "/configuration/accounts",
  ...["people", "roles", "permissions", "delegation", "lines"].map((t) => `/configuration/users?tab=${t}`),
  ...["codes", "periods", "allocations", "availability", "controls", "finance"].map(
    (t) => `/configuration/budget?tab=${t}`,
  ),
];

// The supplier portal is another session: a staff cookie is refused there and the crawl would throw. Its screens are read only with a supplier session
// (PEROLEHAN_SUPPLIER_COOKIE, see signed-in-fetch.mjs), and left out, with a line saying so, without one.
const PORTAL_ROUTES = ["/supplier", "/supplier/opportunities", "/supplier/bids", "/supplier/projects", "/supplier/announcements", "/supplier/company"];
const isPortal = (route) => route === "/supplier" || route.startsWith("/supplier/");

// Text only, one line per block of text, whitespace collapsed. Class names and
// structure are deliberately ignored: they are what a redesign changes.
function lines(html) {
  const { document } = new JSDOM(html).window;
  const root = document.querySelector("main") ?? document.body;
  root.querySelectorAll("script, style, template, svg").forEach((n) => n.remove());
  if (visible) root.querySelectorAll(".sr-only, [hidden]").forEach((n) => n.remove());
  const outLines = [];
  const walker = document.createTreeWalker(root, 4 /* SHOW_TEXT */);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const t = n.textContent.replace(/\s+/g, " ").trim();
    if (t) outLines.push(t);
  }
  // Attributes a user reads too.
  root.querySelectorAll("[placeholder],[aria-label],[title]").forEach((el) => {
    for (const a of visible ? ["placeholder"] : ["placeholder", "aria-label", "title"]) {
      const v = el.getAttribute(a);
      if (v) outLines.push(`@${a}: ${v}`);
    }
  });
  return outLines.join("\n") + "\n";
}

// One record from each list (and its edit screen), found by following the first link that is not the list's export (step 7: the
// export link comes first on every server list, and was snapshotted as if it were a record).
for (const [list, re] of [
  ["/requisitions", /href="(\/requisitions\/(?!new|receive|export)[0-9A-Za-z_-]{4,})"/],
  ["/sourcing", /href="(\/sourcing\/(?!export)[0-9A-Za-z_-]{4,})"/],
  // AC-17, AC-19 (C9): a case from the Contracts list (an award-only case has the award id).
  ["/projects", /href="(\/projects\/(?!new|export)[0-9A-Za-z_-]{4,})"/],
  ["/committees", /href="(\/committees\/(?!export)[0-9A-Za-z_-]{4,})"/],
]) {
  const hit = re.exec(await (await signedInFetch(base + list)).text());
  if (hit) ROUTES.push(hit[1], ...(list === "/projects" || list === "/committees" ? [] : [`${hit[1]}/edit`]));
}

ROUTES.push(...(process.env.PEROLEHAN_SUPPLIER_COOKIE ? PORTAL_ROUTES : []), ...argv.slice(4));
if (!process.env.PEROLEHAN_SUPPLIER_COOKIE) console.log("skipped the supplier portal's screens: set PEROLEHAN_SUPPLIER_COOKIE to read them");

mkdirSync(out, { recursive: true });
for (const route of ROUTES) {
  const res = await signedInFetch(base + route, { portal: isPortal(route) });
  const name = (route === "/" ? "dashboard" : route.slice(1)).replace(/[/?=]/g, "__") + ".txt";
  writeFileSync(join(out, name), `# ${route} (${res.status})\n` + lines(await res.text()));
  console.log(res.status, route);
}
