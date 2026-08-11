// Diff one of our screens against the same screen in the prototype, structurally.
//
//   node scripts/compare-screen.mjs "<Section>" <our-path> [--json]
//   node scripts/compare-screen.mjs "Users & roles" /configuration/users
//
// Renders the prototype in jsdom (via render-prototype.mjs), fetches our screen from
// the running dev server, then compares the things that decide whether a screen is
// the same screen: tabs, table columns, stat tiles, card and section headings, the
// controls in each head, and which list chrome is used.
//
// It deliberately does NOT compare row data. The prototype ships one customer's
// records and this product ships none, so every row would differ and drown the
// structural differences that matter.
//
// Requires the app to be running (npm run dev) and PROTOTYPE to name the sample:
//   PROTOTYPE=RSAJ-Tender-Portal.html node scripts/compare-screen.mjs ...
import { execFileSync } from "node:child_process";
import { readFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { JSDOM } from "jsdom";

const args = process.argv.slice(2);
const asJson = args.includes("--json");
const [section, ourPath] = args.filter((a) => !a.startsWith("--"));

if (!section || !ourPath) {
  console.error('usage: node scripts/compare-screen.mjs "<Section>" <our-path> [--json]');
  process.exit(2);
}

const BASE = process.env.APP_URL ?? "http://localhost:3000";

// Git Bash rewrites a leading-slash argument into a Windows path before node sees it.
// Caught here rather than producing a baffling URL parse error.
if (/^[A-Za-z]:[\/]/.test(ourPath)) {
  console.error(
    `The path was rewritten by the shell to "${ourPath}".
` +
      `Run it with MSYS_NO_PATHCONV=1, or pass the path without the leading slash.`,
  );
  process.exit(2);
}
const OUR_PATH = ourPath.startsWith("/") ? ourPath : `/${ourPath}`;
const OUT = "out";
const slug = section.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

// ---------------------------------------------------------------- the two sources

mkdirSync(OUT, { recursive: true });

function renderPrototype() {
  // The renderer logs a missed click and then writes a dump of whatever screen it
  // happened to be on. Diffing against the wrong screen is worse than not diffing,
  // so its output is captured and a miss is fatal here.
  const log = execFileSync(
    process.execPath,
    ["scripts/render-prototype.mjs", OUT, `cmp-${slug}`, "Configuration", section],
    { encoding: "utf8", env: process.env },
  );
  process.stdout.write(log);

  if (/NOT FOUND/.test(log)) {
    throw new Error(
      `A click did not land, so the prototype dump is of the wrong screen. Check the exact section label in the config rail.`,
    );
  }
  return readFileSync(join(OUT, `rendered-cmp-${slug}.html`), "utf8");
}

async function fetchOurs() {
  const res = await fetch(`${BASE}${OUR_PATH}`);
  if (!res.ok) throw new Error(`${BASE}${OUR_PATH} returned ${res.status}. Is npm run dev up?`);
  return res.text();
}

// ------------------------------------------------------------------- fingerprint

const text = (n) => (n?.textContent ?? "").replace(/\s+/g, " ").trim();

/**
 * The structural fingerprint of a screen.
 *
 * Scoped to `.cfg-main` where present, so the configuration rail — which is shared
 * chrome and already verified — does not appear as a difference on every screen.
 */
function fingerprint(html) {
  const doc = new JSDOM(html).window.document;
  const root = doc.querySelector(".cfg-main") ?? doc.body;

  const all = (sel) => [...root.querySelectorAll(sel)];

  const tables = all("table").map((t) => ({
    columns: [...t.querySelectorAll("thead th")].map(text).filter(Boolean),
    rows: t.querySelectorAll("tbody tr").length,
  }));

  // A control is a button or link that acts on the screen. Row-level buttons are
  // excluded: they repeat per record and say nothing about structure.
  const controls = all(
    ".pagehead__actions button, .pagehead__actions a, .card__head button, .card__head a, .section__head button, .section__head a, .dl__bar button, .dl__tools button",
  )
    .filter((n) => !n.closest("tbody"))
    .map(text)
    .filter(Boolean);

  return {
    heading: text(root.querySelector(".pagehead__title")) || text(doc.querySelector(".pagehead__title")),
    sub: text(root.querySelector(".pagehead__sub")),
    meta: all(".pagehead__meta > *").map(text).filter((t) => t && t !== "·"),
    tabs: all(".tab, [role=tab]").map(text).filter(Boolean),
    stats: all(".stat__label").map(text),
    cards: all(".card__head .h3, .card__head .h2, .section__head .h3").map(text).filter(Boolean),
    tables,
    controls,
    chrome: [
      ".tabbar",
      ".dl",
      ".dl__bar",
      ".dl__foot",
      ".filterchip",
      ".pager",
      ".segmented",
      ".searchinput",
      ".kv",
      ".acc",
      ".empty",
    ].filter((c) => root.querySelector(c)),
  };
}

// ------------------------------------------------------------------------- diff

const list = (a) => (a.length ? a : ["(none)"]);

function diffLists(label, mine, theirs, out) {
  const missing = theirs.filter((t) => !mine.includes(t));
  const extra = mine.filter((m) => !theirs.includes(m));
  if (!missing.length && !extra.length) {
    out.push(`  ok       ${label}`);
    return 0;
  }
  out.push(`  DIFFERS  ${label}`);
  if (missing.length) out.push(`      missing from ours : ${missing.join(" | ")}`);
  if (extra.length) out.push(`      only in ours      : ${extra.join(" | ")}`);
  return 1;
}

function compare(mine, theirs) {
  const out = [];
  let problems = 0;

  problems += diffLists("tabs", mine.tabs, theirs.tabs, out);
  problems += diffLists("stat tiles", mine.stats, theirs.stats, out);
  problems += diffLists("card / section headings", mine.cards, theirs.cards, out);
  problems += diffLists("controls", mine.controls, theirs.controls, out);
  problems += diffLists("list chrome", mine.chrome, theirs.chrome, out);
  problems += diffLists("page head meta", mine.meta, theirs.meta, out);

  // Tables are compared positionally: the nth table here against the nth there.
  const count = Math.max(mine.tables.length, theirs.tables.length);
  if (mine.tables.length !== theirs.tables.length) {
    out.push(`  DIFFERS  table count — ours ${mine.tables.length}, prototype ${theirs.tables.length}`);
    problems += 1;
  }
  for (let i = 0; i < count; i++) {
    const a = mine.tables[i]?.columns ?? [];
    const b = theirs.tables[i]?.columns ?? [];
    if (a.join("|") === b.join("|")) {
      out.push(`  ok       table ${i + 1} columns`);
      continue;
    }
    out.push(`  DIFFERS  table ${i + 1} columns`);
    out.push(`      ours      : ${list(a).join(" | ")}`);
    out.push(`      prototype : ${list(b).join(" | ")}`);
    problems += 1;
  }

  return { out, problems };
}

// ------------------------------------------------------------------------- run

const prototypeHtml = renderPrototype();
const ourHtml = await fetchOurs();

const theirs = fingerprint(prototypeHtml);
const mine = fingerprint(ourHtml);

if (asJson) {
  console.log(JSON.stringify({ section, ourPath: OUR_PATH, mine, theirs }, null, 2));
  process.exit(0);
}

const { out, problems } = compare(mine, theirs);

console.log(`\n=== ${section} — ours ${ourPath} vs prototype ===`);
console.log(`  ours      heading: ${mine.heading || "(none)"}`);
console.log(`  prototype heading: ${theirs.heading || "(none)"}`);
console.log(`  rows — ours ${mine.tables.reduce((n, t) => n + t.rows, 0)}, prototype ${theirs.tables.reduce((n, t) => n + t.rows, 0)} (row counts are data, not structure)\n`);
console.log(out.join("\n"));
console.log(
  problems === 0
    ? "\n  structurally identical\n"
    : `\n  ${problems} structural difference${problems === 1 ? "" : "s"}\n`,
);

process.exit(problems === 0 ? 0 : 1);
