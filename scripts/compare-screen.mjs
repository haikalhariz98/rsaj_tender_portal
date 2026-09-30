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
const [section, ourPath, tab] = args.filter((a) => !a.startsWith("--"));

if (!section || !ourPath) {
  console.error(
    'usage: node scripts/compare-screen.mjs "<Section>" <our-path> ["<Tab>"] [--json]',
  );
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
const slugify = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const slug = slugify(section) + (tab ? `-${slugify(tab)}` : "");

// Only the selected tab — or the selected record — is in the markup, on either side.
// Without this a screen with four tabs is compared on its first one and reported
// identical, and a screen whose form changes with the record selected is only ever
// compared on whichever one it opens with.
if (tab && !/[?&](tab|unit)=/.test(OUR_PATH)) {
  console.error(
    `Comparing "${tab}" needs our path to select it too — add ?tab=<id> or ?unit=<code> to ${OUR_PATH}.`,
  );
  process.exit(2);
}

// ---------------------------------------------------------------- the two sources

mkdirSync(OUT, { recursive: true });

function renderPrototype() {
  // The renderer logs a missed click and then writes a dump of whatever screen it
  // happened to be on. Diffing against the wrong screen is worse than not diffing,
  // so its output is captured and a miss is fatal here.
  const log = execFileSync(
    process.execPath,
    [
      "scripts/render-prototype.mjs",
      OUT,
      `cmp-${slug}`,
      "Configuration",
      section,
      ...(tab ? [tab] : []),
    ],
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

/**
 * A count line with the data taken out of it.
 *
 * One company against two changes the word as well as the number, so each word is
 * reduced to a singular stem. Done word by word rather than with one regex over the
 * whole line, which would also eat the middle of a word that ends in s.
 */
function normaliseCount(line) {
  return line
    .replace(/[0-9]+/g, "N")
    .split(" ")
    .map((word) => {
      if (word.endsWith("ies")) return word.slice(0, -3) + "y";
      if (word.length > 1 && word.endsWith("s")) return word.slice(0, -1);
      return word;
    })
    .join(" ");
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

  // The prototype puts the page head OUTSIDE .cfg-main and we put it inside, so the
  // head is always read from the document. Scoping it to the main column reported a
  // matching meta line as missing on every screen.
  const head = doc.querySelector(".pagehead") ?? root;

  // A sortable header carries a sort glyph inside the same th. Comparing raw text
  // made "Name" and "Name▴" look like different columns.
  const headerText = (th) => text(th.querySelector(".th__t") ?? th).replace(/[▴▾]/g, "").trim();

  const tables = all("table").map((t) => {
    const columns = [...t.querySelectorAll("thead th")].map(headerText).filter(Boolean);
    // A permissions matrix has one column per record, so its headings are data: the
    // prototype's roles against ours would differ on every screen and say nothing.
    // The fixed first column and the fact that the rest are roles is the structure.
    const grid = t.classList.contains("cfg-grid");
    return {
      columns: grid ? [columns[0] ?? "", "(a column per role — data)"] : columns,
      rows: t.querySelectorAll("tbody tr").length,
    };
  });

  // A control is a button or link that acts on the screen. Row-level buttons are
  // excluded: they repeat per record and say nothing about structure.
  const controls = all(
    ".pagehead__actions button, .pagehead__actions a, .card__head button, .card__head a, .section__head button, .section__head a, .dl__bar button, .dl__tools button",
  )
    .filter((n) => !n.closest("tbody"))
    .map(text)
    .filter(Boolean);

  return {
    heading: text(head.querySelector(".pagehead__title")),
    sub: text(head.querySelector(".pagehead__sub")),
    meta: [...head.querySelectorAll(".pagehead__meta > *")]
      .map(text)
      .filter((t) => t && t !== "·")
      // Counts are data. "12 people" here and "7 people" there is the demo set
      // being a different size, not a different screen.
      .map(normaliseCount),
    // Fields sitting in the screen itself rather than in a drawer. The unit form
    // on Organisation is one, and it is a different form for a company than for a
    // department — without this, half that screen is unverified and reads green.
    fields: all(".field").map((f) => {
      const control = f.querySelector("input, select, textarea");
      const label = text(f.querySelector(".field__lbl")).replace(/\*$/, "").trim();
      return `${label} [${control ? control.tagName.toLowerCase() : "none"}]`;
    }),
    tabs: all(".tab, [role=tab]").map(text).filter(Boolean),
    stats: all(".stat__label").map(text),
    // A card headed by a record's own name carries that record's code beside it.
    // The heading is then data — the sample's company against ours — so what is
    // compared is that the slot is there, not the name sitting in it.
    cards: all(".card__head")
      .map((h) =>
        h.querySelector(".badge--brand")
          ? "(a record, named by its own row)"
          : text(h.querySelector(".h3") ?? h.querySelector(".h2")),
      )
      .filter(Boolean)
      .concat(all(".section__head .h3").map(text).filter(Boolean)),
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

/**
 * Differences we have decided to keep.
 *
 * The prototype is a click-through with no write path; this product has CRUD, so its
 * add and edit controls have no counterpart there. Listed rather than silently
 * ignored, so the decision stays visible.
 */
const ALLOWED_EXTRA = [
  /^Add /,
  /^New /,
  /^Edit$/,
  /^Assign /,
  /^Record /,
  /^Retire$/,
  /^Close$/,
  /^End$/,
  /^Release$/,
  /^Vacate$/,
  /^Set format$/,
  // A departure from the prototype, decided (6.10, ruling 5.1): sittings are run from
  // their own screen under Work, because the prototype's only view of a committee's
  // votes is on each matter's record, and those modules do not exist yet. Setup stays
  // in Configuration; running a sitting does not.
  /^Committee sittings$/,
  /^Schedule sitting$/,
  // Ruling 5.2: an ex-officio seat is ended as "Remove office from committee".
  /^Remove office from committee$/,
  // A departure from the prototype, decided (6.1 plan §5): requisitions are run from
  // their own screen under Work. The prototype's requisition screen is reachable from
  // no route, and a supervision-only matter never becomes sourcing, so it is not
  // under Sourcing.
  /^Requisitions$/,
  /^Receive from finance system$/,
  // 6.1 plan §5: the requisition policy (endorsement tiers, splitting, re-check,
  // registration) has its own screen under Money and authority. The prototype held
  // only a guessed splitting window, on the approval matrix, which is removed (OD-9).
  /^Requisition controls$/,
];

const isAllowed = (label) => ALLOWED_EXTRA.some((re) => re.test(label));

/**
 * What the sample has and we have removed, by decision, with the reason. The
 * counterpart of ALLOWED_EXTRA: a field missing from ours for a reason is reported as
 * kept rather than silently tolerated, and any other missing field still fails.
 */
const DECIDED_ABSENT = [
  {
    // The approval matrix's "Order-splitting window" (6.1 ruling OD-9), on that screen only.
    screen: /approval-matrix/,
    match: /splitting window/i,
    why: "the window was a guessed 30 on the approval matrix; it is no longer read, edited or shown there, and lives only in Requisition controls, unset until the customer sets it (B7)",
  },
];

/**
 * Controls we render differently from the sample, and why.
 *
 * A substitution rather than an extra: the sample has one control where we have
 * another. Listed so an unexplained difference still fails.
 */
const DECIDED_CONTROLS = [
  {
    ours: "Clear these settings",
    theirs: "Restore defaults",
    why: "this product ships no defaults — a threshold or a rate baked in would be one customer's policy arriving as software — so the button says what it actually does",
  },
];

function diffLists(label, mine, theirs, out, allowExtra = false) {
  if (allowExtra) {
    for (const d of DECIDED_CONTROLS) {
      if (!mine.includes(d.ours) || !theirs.includes(d.theirs)) continue;
      mine = mine.filter((m) => m !== d.ours);
      theirs = theirs.filter((t) => t !== d.theirs);
      out.push(`  kept     ${label} — "${d.ours}" for their "${d.theirs}": ${d.why}`);
    }
  }
  const absentAll = theirs.filter((t) => !mine.includes(t));
  const applies = DECIDED_ABSENT.filter((d) => !d.screen || d.screen.test(OUR_PATH));
  const decidedAbsent = absentAll.filter((t) => applies.some((d) => d.match.test(t)));
  for (const t of decidedAbsent) {
    out.push(`  kept     ${label} — "${t}" removed by decision: ${applies.find((d) => d.match.test(t)).why}`);
  }
  const missing = absentAll.filter((t) => !decidedAbsent.includes(t));
  const extraAll = mine.filter((m) => !theirs.includes(m));
  const allowed = allowExtra ? extraAll.filter(isAllowed) : [];
  const extra = extraAll.filter((e) => !allowed.includes(e));

  if (allowed.length) {
    out.push(`  kept     ${label} — ours only, by decision: ${allowed.join(" | ")}`);
  }
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
  problems += diffLists("fields in the screen", mine.fields, theirs.fields, out);
  problems += diffLists("controls", mine.controls, theirs.controls, out, true);
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

    // The prototype is a click-through. Where it lists records it cannot edit, it has
    // no actions column and we do. Reported rather than ignored.
    const kept =
      a.at(-1) === "Actions" && b.at(-1) !== "Actions" && a.slice(0, -1).join("|") === b.join("|");
    if (kept) {
      out.push(`  kept     table ${i + 1} columns — ours has an Actions column, by decision`);
      continue;
    }

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
