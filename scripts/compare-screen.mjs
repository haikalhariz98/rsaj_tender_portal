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

import { signedInFetch } from "./signed-in-fetch.mjs";

const args = process.argv.slice(2);
const asJson = args.includes("--json");
const [section, ourPath, tab] = args.filter((a) => !a.startsWith("--"));

if (!section || !ourPath) {
  console.error(
    'usage: node scripts/compare-screen.mjs "<Section>" <our-path> ["<Tab>"] [--json]',
  );
  process.exit(2);
}

// Screens the sample does not have (Sourcing Requirements v2). There is nothing to diff them against, so the comparison says so and stops rather than failing on a
// section it cannot click. What each must hold is pinned instead by the source-level content guards named here, which fail when a label or a "not set" state is dropped.
const NO_PROTOTYPE_COUNTERPART = [
  { screen: /\/configuration\/bid-sealing/, guard: "src/app/configuration/bid-sealing/screen-content.test.ts", why: "SR-13: online sealed bids have no screen in the sample" },
  { screen: /\/configuration\/security/, guard: "src/app/configuration/bid-sealing/screen-content.test.ts", why: "SR-13: the unseal passphrase minimum is a v2 setting; the sample's security screen predates it" },
  { screen: /\/configuration\/tender-documents/, guard: "src/app/configuration/bid-sealing/screen-content.test.ts", why: "SR-13: per-part online upload rules are v2; the tender-documents screen has no sample counterpart" },
];
const noCounterpart = NO_PROTOTYPE_COUNTERPART.find((n) => n.screen.test(ourPath));
if (noCounterpart) {
  console.log(`No prototype counterpart for ${ourPath} (${noCounterpart.why}). Its content is pinned by ${noCounterpart.guard}; text-snapshot.mjs records its text.`);
  process.exit(0);
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
  const res = await signedInFetch(`${BASE}${OUR_PATH}`);
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
  // 6.1 plan §5: the requisition policy (endorsement tiers, splitting, re-check,
  // registration) has its own screen under Money and authority. The prototype held
  // only a guessed splitting window, on the approval matrix, which is removed (OD-9).
  /^Requisition controls$/,
  // 6.3 plan §4: Phase 1 classifies exercises while sourcing still runs outside the
  // portal (§13.3). The prototype's Sourcing screen is the sourcing window (6.5); ours
  // is the exercise list and record, with the acts classification needs.
  /^Sourcing$/,
  /^Open sourcing exercise$/,
  /^Move to preparation$/,
  /^Cancel exercise$/,
  /^Submit proposal$/,
  /^Request name approval$/,
  /^Edit proposal$/,
  /^Use the proposed method$/,
  // 6.3 plan §4, ruling R-7/R-14: the three band families and the terms bands on the
  // approval matrix, which the prototype (one threshold) does not have.
  // Founder, 2026-10-05: the bands now sit behind "Rules used" on the Overview, which replaced Classification.
  /^Three band families$/,
  /^Rules used$/,
  /^Process flow$/,
  /^Details & compliance$/,
  /^Key dates & person in charge$/,
  // Sourcing Requirements v2, wave 2a (SR-05, SR-06, SR-07; rulings 8, 9, 11): the sections of Scope and estimate and the sections that took the Invitation tab apart. None is in the sample.
  /^Opening officers$/,
  /^Notice and fee$/,
  /^Briefing and site visit$/,
  /^Sales and briefing$/,
  /^Publishing$/,
  /^Earlier officers$/,
  /^Contract terms bands$/,
  // 6.3 plan §4: the classification lists on Reference data (FR-MTD-006, 009, 011–014).
  /^Proposal items$/,
  /^Justification reasons$/,
  /^Contract bases$/,
  /^Other classifications$/,
  /^Classification mappings$/,
  /^Mixed scope$/,
  /^Behaviours$/,
  // 6.11 plan §6: cross-exercise work lists; the prototype has the award only as an
  // exercise tab. The exercise's Award tab is the prototype's; the lists are not.
  /^Awards$/,
  /^Securities$/,
  /^Award controls$/,
  /^Start the award$/,
  /^Send for approval$/,
  /^Cite decision$/,
  /^Lodge (security|policy)$/,
  // Deliberately not reproduced (D4): the prototype's award tab states the bond as
  // "{n}% of the accepted value", a hard-coded basis. The basis is decided per contract
  // and never defaulted, so the bond is shown with its basis, or as not set.
  /^The performance bond$/,
  // Phase 1 close-out (ruling CO-7): the office worklist at /approvals, under Work; the
  // prototype has no approvals queue. Step escalation (FR-APR-009/010) and the rejection
  // destination's choice (FR-APR-016) are acts the prototype's routes do not have.
  /^Awaiting decision$/,
  /^Escalate$/,
  /^Choose where it goes$/,
  // Phase 3c (FR-APR-018, 010, 011, 012, 017; FR-CTE-009): the personal queue ("My steps" beside "By office") and its sweep after an absence, the staff inbox (notices
  // shown in the portal, since email is not connected), the reporting lines that decide where a step moves and who may be delegated to, and the originator's recall of
  // a name's or an award's route. The prototype has none of them: it has no sign-in, no queue and no notification.
  /^My steps\d*$/,
  /^By office\d*$/,
  /^Waiting for you$/,
  /^Move steps held by people who are away$/,
  /^Inbox$/,
  /^Notices$/,
  /^Mark all as read$/,
  // "Open my steps" was removed from /inbox (AC-14, GN-05); no entry needed any more.
  /^Reporting lines\d*$/,
  /^Record reporting line$/,
  /^Recall( name approval)?$/,
  // FR-REQ-012: the committee gate between approval and the first exercise.
  /^Check committee gates$/,
  /^Cite the decision$/,
  /^Close without sourcing$/,
  /^Add committee gate$/,
  // FR-APR-015: the audit trail and its export, under Configuration, Records.
  /^Audit trail$/,
  /^Export the trail$/,
  // 6.15a: the staff-side supplier register (ADR 0019) and its configuration screen.
  /^Supplier register$/,
  /^Register\d*$/,
  /^Applications\d*$/,
  /^Lodge (a document|the document)$/,
  /^Send for decision$/,
  /^Request a resubmission$/,
  // Wave 3c step 5 (SR-14, rulings 22, 23, 20c, 20cl, 20cm): the opening checklist is a matrix, one row for each item and one column for each offer read, under which the checklist result, the decision and
  // the officers' confirmations sit, with the file download of an opening-check part in its cell (named officers before finalising, the filed copy after). The sample has no matrix.
  /^(Checked at the opening|Checklist result|Decision|Confirmations|Confirm this column|Pass|Reject|Download|Opened at the opening)$/,
  // Wave 3c step 5 (SR-15 "Where: Received", ruling 20ct): once an opening is finalised, Received shows the schedule of tenders and the Grand Summary with their two downloads, through the
  // same components and the same read as the Schedule section. Before finalising it shows none of it.
  /^(Schedule of tenders.*|Grand Summary|Download .* \(CSV\))$/,
  // Simplification plan step 5 (ADR 0043; decisions log 2026-10-24, steps 5.1, 5.4, 5.7): the Settings frame and its renamed acts. Neither the sample nor its rail has them.
  // "Getting started", the six section pages and their "Advanced" fold (5.1), "Test a route" opening the simulator in a drawer, "Issue" reading "Put in force" and "Retire"
  // reading "Stop using" (5.4), and the Settings changes tab of My approvals (5.7).
  /^(Getting started|Advanced|Test a route|Put in force|Stop using|Settings changes( \(\d+\))?)$/,
];

const isAllowed = (label) => ALLOWED_EXTRA.some((re) => re.test(label));

/**
 * What the sample has and we have removed, by decision, with the reason. The
 * counterpart of ALLOWED_EXTRA: a field missing from ours for a reason is reported as
 * kept rather than silently tolerated, and any other missing field still fails.
 */
const DECIDED_ABSENT = [
  // Simplification plan step 5 (ADR 0043; founder 2026-10-23: simple, minimal words, English only). What the Settings passes moved or removed, on Configuration screens only.
  // Written from the decisions log, not from a run: the comparator needs a signed-in session and reads the retired prototype classes of our markup (see the step 5.9 report).
  {
    screen: /^[/]configuration(?:[/].*)?$/,
    match: /^(Source|Where it comes from)$/,
    why: "5.1 to 5.7 (SP-18): no screen shows a Source column or a provenance chip; a gap reads plain \"Not set\" and History carries the source as \"Source: From a written rule / Usual practice / Assumed\". The drawer field is \"Kind of source\" (5.2) or \"Basis\" (5.5, 5.7)",
  },
  {
    screen: /^[/]configuration[/](?:committees|routing-sheets|accounts|evaluation|changes)$/,
    match: /^(Accounts|Waiting for activation|Locked now|Issued models|Policy settings not set|Contract bases with no route|Types in use|Without a target|Band edge undecided|Waiting for you|Proposed by you|Waiting in all)$/,
    why: "5.3, 5.4, 5.7: stat tiles are removed from Committees, Routing sheets, Evaluation, Sign-in accounts (now People, with Not activated and Locked views) and the changes queue (now a tab of My approvals); the facts they counted are in the list, the section banner or a popover",
  },
  {
    screen: /^[/]configuration[/]approval-matrix$/,
    match: /^(Standard route|Core routing|Boundary ruling|Band famil.*|Three band families)$/,
    why: "5.4: the band-families card is deleted as a duplicate; the standard route, terms bands, rejection destinations and funder rule sets sit under Advanced; \"Exact amount at a limit\", with a popover, replaces \"Boundary ruling\"",
  },
  {
    screen: /^[/]configuration[/](?:awards|contracts|post-award|budget|suppliers)$/,
    match: /\((?:Malay|BM|MS)\)$|^The same words in Malay$/,
    why: "5.5, 5.6 (English only, 2026-10-19): the Malay stamp, part, recipient, budget description and supplier-list fields are deleted from screens, editors and saves; the columns stay and a save leaves stored Malay untouched",
  },
  {
    // The approval matrix's "Order-splitting window" (6.1 ruling OD-9), on that screen only.
    screen: /approval-matrix/,
    match: /splitting window/i,
    why: "the window was a guessed 30 on the approval matrix; it is no longer read, edited or shown there, and lives only in Requisition controls, unset until the customer sets it (B7)",
  },
  // Sourcing Requirements v2, wave 1 (founder, 2026-10-09). Neither is in the sample; listed so the removal stays visible.
  {
    screen: /^\/sourcing\/[^/]+$/,
    match: /^Approval for tendering$/,
    why: "SR-03: the Overview keeps one Process flow; the approval-for-tendering track is shown on the Tender documents tab only",
  },
  {
    screen: /^\/sourcing\/[^/]+\/appendix$/,
    match: /^Still to enter$/,
    why: "SR-12: the Appendix opens without a list of what is left; Save names each required field left empty, and submission still refuses an incomplete Appendix",
  },
  {
    screen: /^\/sourcing\/[^/]+$/,
    match: /^Invitation$/,
    why: "SR-06 (ruling 9): the Invitation tab is gone; its publishing content is the Publishing section of Tender documents, its sale register and briefing attendance are Sales and briefing on Bids and opening, and its notice, fee and briefing are prepared on Scope and estimate; an old ?tab=invitation address is redirected",
  },
  {
    screen: /^\/sourcing\/[^/]+$/,
    match: /^(Tendering starts on|Closing day|Closing time)$/,
    why: "SR-05 (ruling 8): the submit drawer no longer asks for the days; they are entered as proposed dates under Key dates & person in charge on Scope and estimate, before submission, and the drawer shows them",
  },
  {
    screen: /^\/sourcing\/[^/]+$/,
    match: /^The panel$/,
    why: "SR-07 (ruling 11): where the exercise names its opening officers, the start of the opening no longer picks a panel from the committee's seats; the panel is those officers and the form asks only who is present",
  },
  // Sourcing Requirements v2, wave 2b (rulings 12 to 14, ADR 0035). Neither is in the sample; listed so each removal stays visible.
  {
    screen: /^[/]sourcing[/][^/]+$/,
    match: /^(Specification panel|Signed panel form)$/,
    why: "SR-08 (ruling 12): on an exercise pinned not to use a panel the section is hidden and the panel leaves the submit gate; an exercise that uses one keeps it, and an earlier one is read only",
  },
  {
    screen: /^[/]sourcing[/][^/]+$/,
    match: /^Bill of quantities$/,
    why: "SR-09 (ruling 13): on an exercise pinned not to build its bill on screen the section is hidden; the bill is an uploaded Excel part under Tender documents; an earlier bill is read only",
  },
  {
    screen: /^[/]sourcing[/][^/]+$/,
    match: /^(Open|Mark ready|Omit|Reopen|Rework|View as frozen|Put back)$/,
    why: "SR-11 (ruling 14): every tender document line offers Template, Upload, Download and Replace; a part is ready when its content is, and an optional one with nothing to issue is recorded Not issued",
  },
  // Sourcing Requirements v2, wave 3a (SR-10, ruling 16).
  {
    screen: /^[/]sourcing[/][^/]+$/,
    match: /^(Documents inspected at|Documents bought at|Hours|How the fee is paid|Where tenders are submitted)$/,
    why: "SR-10 (ruling 16): on an exercise pinned to an online sale the four physical sale fields and \"How the fee is paid\" are neither asked nor shown (the columns stay); the exercise is bought through the supplier portal. An exercise sold at the counter keeps them",
  },
  {
    screen: /^\/supplier\/opportunities\/[^/]+$/,
    match: /^(Buy at|Ways to pay|Inspect the documents at|Hours|Where to hand in your bid)$/,
    why: "SR-10 (ruling 16): an exercise sold online states no counter, hours, payment counter or place of submission; it says the documents are bought through the supplier portal",
  },
  // Wave 3a review (SR-15 ruling 24, M3; SR-10 ruling 17): decided differences from the sample, recorded so each stays visible.
  {
    screen: /^[/]sourcing[/][^/]+$/,
    match: /^(Class \(register\)|Class as read|Status)$/,
    why: "SR-15 (ruling 24, review M3): the schedule of tenders carries Class (register), the supplier register's reading frozen when the offer was read, beside Class as read (what the officer recorded from the envelope) and Status, as separate columns, so neither is passed off as the other; the screen, the print and the CSV take their headings from one list",
  },
  {
    screen: /^[/]supplier[/]bids[/][^/]+[/]documents$/,
    match: /^(Document|Kind|Download)$/,
    why: "SR-10 (ruling 17): the released documents list the issued parts of the approved pack as files and texts to download; each download is logged against the company. The sample has no download list",
  },
  // 6.15a (plan §5, OD-1..OD-10): the staff-side supplier register, on the supplier screens only.
  {
    screen: /^\/suppliers/,
    match: /performance/i,
    why: "contractor performance reports and the grade they give arrive with 6.16; the register names that in its Callout rather than showing a score it does not hold (condition 3)",
  },
  {
    screen: /^\/suppliers/,
    match: /^(CIDB grade|Categories|MOF field codes|Town)$/,
    why: "one customer's registration bodies; grades, categories and field codes are configured per registration body (Configuration › Supplier register) and shown on the supplier's Documents tab, not as fixed columns (AGENTS.md rule 1)",
  },
  {
    screen: /^\/suppliers/,
    match: /expir|^Standing$|^Directory$|^Registrations$|^Applications to verify$|^Registered suppliers$|registered$/i,
    why: "the register's Register and Applications tabs and its head facts stand for the prototype's Directory, Registrations and tiles; expiry bands and standing are increment a2 (OD-4, OD-7)",
  },
  {
    screen: /^\/suppliers/,
    match: /tender capacity/i,
    why: "a supplier's registration is routed on no value (OD-2 A), by the matrix's supplier_registration rule, never by a tender capacity",
  },
  {
    screen: /^\/suppliers/,
    match: /^Contact supplier$/,
    why: "nothing is sent from the portal in this phase (INT-09); a notice is shown, not sent",
  },
  {
    // The dashboard's "{n} aged over 14 days" head fact and its "Aged over 14 days" view
    // (6.9 review ruling R5), on the dashboard only.
    screen: /^\/$/,
    match: /aged over/i,
    why: "14 days was a hard-coded threshold (AGENTS.md rule 1); waiting days are shown as a count with no judgement until FR-APR-018's configured targets exist (deferred to 6.17)",
  },
  // Wave 3c step 5 (SR-14): the matrix replaced these. Neither is in the sample; listed so the removal stays visible.
  {
    screen: /^[/]sourcing[/][^/]+$/,
    match: /^(Files to check|Answer the checklist|Record the verdict)$/,
    why: "SR-14 (wave 3c step 5): the Files to check list became the matrix's cell downloads, and the Checklist and Verdict drawers became the matrix's answer controls, Pass and Reject. An online initial is the matrix's Confirm this column; a paper initial may still be recorded for a present panel member",
  },
  // Award and Contract Requirements v2, GN-03 (AC-11, AC-12): the dashboard's cards. Listed so each removal stays visible.
  {
    screen: /^[/]$/,
    match: /^Awaiting a decision$/,
    why: "GN-03 (AC-11): the organisation-wide card became the personal 'Awaiting my decision', the My approvals badge's own number, opening My approvals",
  },
  {
    screen: /^[/]$/,
    match: /^(Value approved|Votes outstanding)$/,
    why: "GN-03 (AC-11): the two cards, their SULIT gate and their sums are removed; no Must requires them. The pipeline cards (Requisitions, Sourcing, Contracts) replace them (AC-12)",
  },
  {
    screen: /^[/]$/,
    match: /^Documents awaiting my review$/,
    why: "GN-03 (AC-11): removed from On the way, because Part 2 (document review) is held and nothing should look finished that is not",
  },
  {
    screen: /^[/]inbox$/,
    match: /^(Delivery|Open my steps)$/,
    why: "GN-05 (AC-14): the Delivery box and the Open my steps button are removed from the Inbox; the shell's My approvals item opens the same list",
  },
  // Note 0005, founder 2026-10-19 (minimal words): explanatory sentences cut from the dashboard, the Inbox and the account page. Each was explanation, not a field: the figures, states and warnings stay.
  {
    screen: /^[/]$/,
    match: /^(Matters routed to a committee.*|Open approval routes.*|These will report here.*|Progress, certified value.*|Committees scheduled to sit.*|Requisitions, sittings and awards.*)$/,
    why: "0005, founder 2026-10-19: card subtitles and empty-state bodies on the dashboard were cut; the lists, counts and Not built yet badge stay, and the waiting rule is behind the information button",
  },
  {
    screen: /^[/]inbox$/,
    match: /^(What has been told to you.*|Notices appear here.*|Newest first.*)$/,
    why: "0005, founder 2026-10-19: the Inbox subtitle became the information button and a Not emailed chip",
  },
  {
    screen: /^[/]account$/,
    match: /^(Your sign-in, your password.*|If one of these is not yours.*)$/,
    why: "0005, founder 2026-10-19: the account page subtitles were cut; Password only is a chip beside the name",
  },
  // Note 0005, founder 2026-10-19 (minimal words): the Contracts list, its securities and submissions views.
  {
    screen: /^[/]projects$/,
    match: /^(Every award from the day it is started.*|Still to come here|Possession of site.*|Newest first[.] A case begins.*|Every contract In Delay today.*|Planned progress between.*|Shown here, not sent|Expiry reminders are worked out.*|Contracts after award.*|Live ones first.*|Securities and policies are lodged.*|Submissions contractors sent.*|A contractor's programme, claim.*)$/,
    why: "0005, founder 2026-10-19: the list subtitle, the Still-to-come callout, the view subtitles and the empty-state bodies were cut; the roadmap sentence is behind the information button, Not emailed and Assumed are chips",
  },
  // Note 0005, founder 2026-10-19 (minimal words): the case page header, Overview and Formation panels.
  {
    screen: /^[/]projects[/][^/]+$/,
    match: /^(Every act on a contract records.*|The Stage Three briefing at signing.*|Bonds, guarantees and policies on this contract.*|Before work starts, each with.*|The readiness gate, as the award shows it.*|Each written once[.].*|Start it on the Overview.*|Signature is refused until endorsed.*|Each signature is read from.*)$/,
    why: "0005, founder 2026-10-19: card subtitles, callout bodies and drawer introductions on the case Overview, Formation and baseline were cut to the consequence; Assumed and Not judged are chips, the hidden-acts note is a chip with a popover",
  },
  // Note 0005, founder 2026-10-19 (minimal words): the Award stage tabs of the case page.
  {
    screen: /^[/]projects[/][^/]+$/,
    match: /^(Set by the signatory rules on the approval matrix.*|The committee's part and the approver's.*|Resolved when the award is sent for approval.*|Each document is printed from the text frozen.*|The documents are generated from the configured templates.*|The pre-award routing sheet around.*|Decided for this contract.*|All three, cumulatively.*|The customer's conditions precedent.*|Drawn from the configured recipients.*)$/,
    why: "0005, founder 2026-10-19: card subtitles, drawer introductions, refusal sentences and the info callouts on the Award stage tabs were cut; the rule label and clause stay on the approval panel, the issued and draft state is a chip with a popover",
  },
  // Note 0005, founder 2026-10-19 (minimal words): the Payments tab of the case page.
  {
    screen: /^[/]projects[/][^/]+$/,
    match: /^(Where interim certificates were issued before.*|The rate is the baseline's, never typed.*|Eligibility and the percentage are not checked.*|Held three ways on every interim certificate.*|The letter of intention to impose damages.*|The latest decision governs[.].*|What no rule computes.*|No documented advance payment procedure.*)$/,
    why: "0005, founder 2026-10-19: Payments subtitles, drawer introductions and refusal sentences were cut to what blocks and what to do; the advance gap is a Not checked chip with its detail in a popover, the product codes B1 and B2 no longer show",
  },
  // Note 0005, founder 2026-10-19 (minimal words): the Variations tab and a variation's own page.
  {
    screen: /^[/]projects[/][^/]+(?:[/]variations[/][^/]+)?$/,
    match: /^(The master record of the contract sum's movement.*|The revised contract sum is read only from issued adjustments.*|Each from its application to its Variation Order Certificate.*|Each approval on its own route.*|Certifies the measured variation.*|Work may proceed on the support.*|Never before the variation's approval.*|Supported \(with a cap where given\).*|Nothing configured decides where a refused variation goes.*)$/,
    why: "0005, founder 2026-10-19: Variations subtitles, drawer introductions and refusal sentences were cut to the consequence; the cumulative value and percentage figures are unchanged, voided certificates are a chip with a popover",
  },
  // Note 0005, founder 2026-10-19 (minimal words): the Supervision tab and the certificate page.
  {
    screen: /^[/]projects[/][^/]+(?:[/]certificates[/][^/]+)?$/,
    match: /^(The superior officer's or the S[.]O[.]'s endorsement of the diary.*|An office, not a person.*|One entry a day by the responsible officer.*|The pinned list, resolved on the day of issue.*|Copies are made from the pinned list.*|The sheet starts when the certificate is sent.*|Every act on a certificate records.*|As the module that raised it computed them.*)$/,
    why: "0005, founder 2026-10-19: Supervision and certificate subtitles, drawer introductions, empty-state bodies and refusal sentences were cut; the routing-sheet empty state is Not sent for approval yet, the baseline notes are chips with popovers, and a superior officer recorded as named is a Not checked chip",
  },
  // Note 0005, founder 2026-10-19 (minimal words): the sourcing exercise (header, Scope, Window, Documents, Bids, Appendix) and its list, new and edit pages.
  {
    screen: /^[/]sourcing(?:[/][^/]+(?:[/]appendix|[/]edit)?|[/]new)?$/,
    match: /^(This exercise is hidden from everyone else.*|Restricted to the people named on it|Restricted to its named people|The name is approved for a list, and invitation is held to it|The contract's particulars, stated for the tender.*|These documents are bought online|Some sales were paid on the payment simulator|Registration and suspension are checked only for a linked contractor|The portal records envelopes, not offers|Every named officer is needed|Its panel is picked when the opening starts|Simulated, no money received.*|Online submissions|Earlier record|Priced figures are SULIT|Not filled in yet|Attendance is not mandatory|What is being bought, and how it is approved.*|Online bids are sealed to a key.*|Who will open the bids.*|Each letter received before the closing.*)$/,
    why: "0005, founder 2026-10-19: sourcing card subtitles, drawer introductions, empty-state bodies and the info callouts were cut to what the user needs to act; the restricted, demonstration, not-emailed and SULIT facts are chips with popovers, and the key-custody consequence lines stay",
  },
  // Note 0005, founder 2026-10-19 (minimal words): the opening (paper and online), the matrix, Received's schedule tables, and the evaluation tab, report and proposal paper.
  {
    screen: /^[/]sourcing[/][^/]+(?:[/]evaluation[/](?:report|proposal)|[/]opening[/]print)?$/,
    match: /^(Never read at the opening.*|The opening starts once the window has closed.*|One answer for each item and offer.*|Checked against each bid|Frozen when the opening was finalised.*|Built from the record as it stands.*|The scan of the paper the panel signed.*|Never opened at the main opening.*|Each report names its contractor.*|Appointed on both sides.*|Carried from the opening.*|Scores, prices, the ranking.*|Pinned when the exercise was published.*|A verdict and a narrative for each bid.*|Each held, then closed on its minutes.*|A negotiation is held only once its route is approved|Recorded, never sent from here.*|The percentage is entered from this report.*|The signed report and paper.*|Issued once, frozen.*|Produced from the issued report.*|Kertas Cadangan|Bil[.])$/,
    why: "0005, founder 2026-10-19: opening and evaluation subtitles, drawer introductions, empty-state bodies and info callouts were cut to the consequence; the SULIT, panel-authorises and blind-scoring facts are chips with popovers, and the sample's Malay column and document names (Bil., Kelas, Jadual Tawaran, Kertas Cadangan) are English on every screen (founder 2026-10-19, English only)",
  },
  // Note 0005, founder 2026-10-19 (minimal words): requisitions, committees and My approvals.
  {
    screen: /^[/](?:requisitions(?:[/][^/]+)?(?:[/](?:new|edit))?|committees(?:[/][^/]+)?|approvals)$/,
    match: /^(Requests to spend.*|Sittings, their registers.*|The steps waiting for you.*|Newest first.*|Grouped by the office.*|The steps you can decide.*|Saved as a draft.*|Only a draft can be edited|Who is asking, and which budget pays for it|List each item.*|As raised[.] Fixed once endorsed[.]|The heads of the tiers.*|Resolved and stored when.*|Every check is kept as it was|As configured today[.] A submitted.*|Kept on record[.] A re-submission.*|What the funding route decides|Tabled against this requisition.*|Between approval and the first sourcing exercise.*|Every change to this (?:requisition|sitting).*|Changes made through the portal appear here.*|Written in the portal before minutes.*|Entered by hand from the finance system|The route is resolved once.*|Continues a rejected route|Budget committed on approval|No commitment written)$/,
    why: "0005, founder 2026-10-19: requisition, committee and approval subtitles, drawer introductions, empty-state bodies and info callouts were cut to the consequence; the finance-system origin, the matrix check, the commitment, the assumed gate and the as-minuted snapshot are chips with popovers, and the time-zone, not-set, SULIT and refusal facts stay",
  },
  // Note 0005, founder 2026-10-19 (minimal words): suppliers and every Configuration section.
  {
    screen: /^[/](?:suppliers(?:[/].*)?|configuration(?:[/].*)?)$/,
    match: /^("" is taken.*|A block of.*|A body a.*|A clause a.*|A closing date.*|A closing in.*|A committee an.*|A contract type's.*|A document on.*|A draft copy.*|A draft is.*|A field of.*|A grade, category,.*|A pack started.*|A part of.*|A person at.*|A person has.*|A reason an.*|A reason from.*|A registration body.*|A regular expression.*|A renewal or.*|A signature dated.*|A stage of.*|A statutory document.*|A suggestion only:.*|Above the lower.*|Above the quotation.*|Allocations, commitments and.*|An aspect each.*|An edge left.*|An entry an.*|An exercise moves.*|An explicit act,.*|An issued issue.*|An option the.*|Another classification a.*|Applied to every.*|As the applicant.*|Awards linked to.*|Bands a worked.*|Banks and insurers.*|Below this, a.*|Blocking holds the.*|By basis, in.*|By contract price,.*|By type, mandatory.*|Calendar days from.*|Carried on reports.*|Certificates already pinned.*|Changed by one.*|Check the beneficiary.*|Checked against the.*|Choose a unit.*|Choose the first.*|Chosen by the.*|Classification, retention, upload.*|Clauses a template.*|Clears the wrong.*|Committed and paid.*|Committees an approved.*|Decided on its.*|Derived from what.*|Drawn onto each.*|Each bidder is.*|Each blacklisting, or.*|Each executed contract's.*|Each is read.*|Each may be.*|Each model's stages,.*|Each routing sheet's.*|Each rule may.*|Each setting left.*|Each type's document.*|Endorsements, and where.*|Every change, its.*|Every change, with.*|Every condition is.*|Every entry recorded.*|Every supplier recorded,.*|Every suspension, reinstatement,.*|Every value is.*|Everyone on record,.*|Files uploaded but.*|For a person.*|For example: seen.*|From that day.*|From the day.*|Frozen on each.*|Give the contact.*|Grades, categories, specialisations,.*|Held and scheduled\..*|Held from its.*|How a contract.*|How a variation's.*|How an exercise.*|How an interim.*|How and how.*|How and when.*|How awards are.*|How bids are.*|How bills of.*|How bills, specification.*|How exercise, contract.*|How expiry is.*|How far apart.*|How far past.*|How long a.*|How long each.*|How long the.*|How many days.*|How many members.*|How many pages.*|How much of.*|How the schedule.*|How this organisation.*|In parts, as.*|In print order,.*|In printed order\..*|Instruments by band,.*|Issued issue by.*|It is closed.*|It is decided.*|It is no.*|It returns to.*|It stops being.*|Its route decides.*|Its stages, criteria,.*|Judged now, condition.*|Leave a value.*|Lets the contact.*|Lets them sign.*|Membership, quorum and.*|Misprints in a.*|Newest first\. A.*|No aspect is.*|No bands are.*|No issuers are.*|No longer offered\..*|No requirements are.*|No variants are.*|Nobody is on.*|Nobody is set.*|Nothing in the.*|Nothing is proposed.*|Now: \. A.*|Now: \. Granted.*|Officers, the offices.*|On \. The.*|On the supplier's.*|One kind of.*|One officer acting.*|One row of.*|One wording per.*|Online sealed bids.*|Only a percentage.*|Only an award.*|Only for a.*|Open applications, oldest.*|Optional\. A version.*|Packs started from.*|Parties on exercises.*|Paste one holiday.*|People at the.*|Picked by the.*|Proposed by one.*|Published exercises keep.*|Published to every.*|Read on every.*|Read only\. The.*|Read when a.*|Refused while a.*|Registration bodies' values,.*|Registration values, statutory.*|Relaxing the grade.*|Requisition approval, procurement.*|Resolve the approval.*|Roles that can.*|Sent through the.*|Set by whoever.*|Shown across the.*|Shown to every.*|Signature order, recipients.*|Sourcing methods, contract.*|Supervision, the delegation.*|Suppliers from paper.*|Suppliers suspended, blacklisted.*|Takes this row.*|The applicant's own.*|The applicant's words.*|The bodies a.*|The certificates, letters.*|The chain every.*|The channel and.*|The code the.*|The dates, the.*|The documents are.*|The draft and.*|The draft, its.*|The entity types,.*|The file an.*|The file goes.*|The form each.*|The latest fifty\..*|The left side.*|The legal office,.*|The letter of.*|The maintained list.*|The money returns.*|The number of.*|The parts each.*|The period closes.*|The picture on.*|The portal's own.*|The product mark.*|The product writes.*|The public form.*|The reasons are.*|The registration body's.*|The resubmission was.*|The route a.*|The rules for.*|The share of.*|The sheet's internal.*|The signed declaration.*|The stage comes.*|The statutory documents.*|The structure requisitions.*|The target, in.*|The twelve behaviours.*|The vendor code.*|The window's document.*|The window's fee.*|The wording a.*|The wording and.*|The zone dates.*|The zone the.*|These show on.*|They leave the.*|Tick each document.*|Tick what each.*|Unset is not.*|Unset refuses what.*|Unspent allocation carried.*|Use this for.*|Utilisation at which.*|Versions the supplier.*|What a bidder.*|What a matter.*|What a role.*|What a supplier's.*|What is marked,.*|What must be.*|What people read.*|What spending is.*|What the portal.*|What the report.*|What the supplier.*|What this unit's.*|When the signed.*|When this supplier.*|Where a matter.*|Where a method.*|Where a sourcing.*|Where an advertised.*|Where it does,.*|Where it is,.*|Where the figures.*|Where the matter.*|Where the portal.*|Where the work.*|Whether a contractor.*|Whether a contractor's.*|Whether bids may.*|Which files the.*|Which policies a.*|Which terms set.*|While someone is.*|Who can sign.*|Who decides whether.*|Who each person.*|Who holds each.*|Who proposes, who.*|Who receives the.*|Who sits, how.*|Whose endorsement a.*|Write the remarks.*|You are the.*|You proposed it,.*|\. Judged ;.*|will be signed.*)$/,
    why: "0005, founder 2026-10-19: supplier and Configuration subtitles, section blurbs, drawer introductions, empty-state bodies and info callouts were cut to the consequence or moved into popovers; the sample's explanations are not carried, and every field, gap chip, warning and refusal stays",
  },
  // Note 0005, founder 2026-10-19 (minimal words): the supplier portal, every screen.
  {
    screen: /^[/]supplier(?:[/].*)?$/,
    match: /^(As the procurement office has it on the supplier register.*|Your standing on the supplier register, and what it means.*|Where payments to you go.*|Some kinds of document can be given more than once.*|Judged by the same check the office uses|This lists the opportunities open to everyone.*|Confidential. Only you and the officers who check them.*|These details are confidential.*|Your company, your registration.*|Sign up so the office expects you.*|Changes to the documents, in the order they were issued.*|Bought online, through this portal.*|Bought from the procurement office.*|Made when you press Buy documents.*|The office makes the same checks at the counter.*|Open to every supplier from publication to the closing.*|Released once your payment is made.*|Released only when the organisation has chosen to.*|Only your own bid, and only how far.*|This portal does not take bids and shows no price.*|What you have done on this exercise.*|The office sells them to you.*|Tell the procurement office who your company will send.*|This is not attendance|Nothing is paid or released here|This is the part of the documents the notice puts on the tender table.*|Only the parts of the documents the notice puts on the tender table.*|You have started buying the documents|How to pay|This payment was made on the demonstration payment simulator.*|You are on a simulated page.*|This stands in for a payment provider.*|Each submission has its own number.*|Each part takes one file.*|When you submit one, its receipt is kept here.*|What the contract asks of your company now.*|The latest revision the Principal S.O. Representative approved.*|Every programme sent, newest first.*|Each interim or advance payment certificate issued on this contract.*|Sent to the office for its valuation.*|Variation Order Certificates and Certificates of Adjustment.*|Each is yours because its award names your company.*|Your acts here are signed with your password.*|What happens next|Used for eligibility once verified by the procurement office.*|In the procurement office's own words.|Complete these steps and send them to the procurement office.*|Tenders and quotations advertised by.*|You do not need an account to read opportunities.*|Sign in to see, condition by condition.*|Sign up for a briefing, ask for the documents, inspect them.*|What the procurement office has published for its suppliers.*|To the supplier portal, with the account the procurement office opened.*|The office keeps these at the top.*|Those your company has done something on.*|Use the reset code the procurement office gave you.*|New opportunities appear here as soon as they are advertised.*|An advertised opportunity appears here once it has been awarded.*|An exercise stays here after its closing.*|An advertised exercise that is withdrawn.*|When the procurement office publishes an announcement.*|Open an advertised opportunity, sign up.*|An addendum, a change of the closing.*|Uploads are closed: the portal.*|The portal's forms are closed.*|This is your company as the procurement office accepted it.*)$/,
    why: "0005, founder 2026-10-19: portal subtitles, card blurbs, empty-state bodies, how-it-works steps and info callouts were cut to the consequence; the next step, the not-emailed line, Demo and No money moves, Not scanned, every not-set refusal with who can act, and every sentence a supplier signs stay",
  },
  // Founder comment 2026-10-20: the Contracts list header and view chips.
  {
    screen: /^[/]projects$/,
    match: /^(All cases|Stages|Awards that need work|, \d+ on the straight-line reading)$/,
    why: "founder 2026-10-20: the header fact 'N In Delay, N on the straight-line reading' with its Assumed chip, and the 'All cases' card of about 16 chips, were removed; one grouped dropdown (Stage, Needs attention, Registers) in the list toolbar replaces the chips and the duplicate Stage filter, with the same counts and the same ?view= addresses",
  },
  // Founder comment 2026-10-20: the Contracts list's Status column shows one chip.
  {
    screen: /^[/]projects$/,
    match: /^\+\d+$/,
    why: "founder 2026-10-20: 'too much status ... show only one status'. The Status column shows the one status that matters most (problems first, then what the case is waiting for, then its lifecycle) with a muted +N; hovering or focusing it lists every status. Search, the views, their counts and the CSV still carry all of them",
  },
  // Award and Contract Requirements v2, C-1 / C-6 (AC-17, AC-23): the Awards list is the Contracts list's cases, and /awards redirects.
  {
    screen: /^[/]projects$/,
    match: /^(Opened from the exercise|All awards|Drafts|Awaiting approval|Ready to issue|Issued|Awaiting return|No commitment number|Indents expired|Search by awardee or reference|Not started|Being formed|Ready to sign|Executed|Contracts In Delay|All contracts)$/,
    why: "C-1 (AC-17): the Awards list and its views merged into the case list; the stages (Awarding, Signing, On site, Completed, Closed) and 'Cancelled or terminated' are server-side views, the awards list's chips ride on each case's Status, and the old Drafts and Issued views are the Awarding stage and the later stages; Awaiting approval, Approved not issued (was Ready to issue), Awaiting return, No commitment number and Indents expired (FR-AWD-006) stay organisation-wide server views with their counts, no longer searchable in-page. 'Opened from the exercise' is dropped with the Awards page; an award is started from the exercise's Award tab or New award",
  },
  {
    screen: /^[/]securities$/,
    match: /^(Securities|The register|Search by contract, awardee or issuer|Shown here, not sent)$/,
    why: "MN-01 (AC-15): the Securities menu and its screen are removed and /securities redirects to the Contracts list's 'Securities expiring or not verified' view, which holds the same register",
  },
  {
    screen: /^[/]documents$/,
    match: /^(Documents|Library|Distribution|Routing sheets|Review queue|Search|Clear)$/,
    why: "MN-02 (AC-16): the Documents menu is removed and /documents redirects permanently. The organisation-wide Library search is dropped (AC-4, AC-16; FR-CRT-011 is an S, logged as partly met); copies not sent and routing sheets open are counted on each contract's Documents tab; the Review queue is each contract's Submissions tab and the Contracts list's Submissions waiting view",
  },
  {
    screen: /^[/]configuration[/]budget$/,
    match: /^(Over-commitment tolerance|May override the check|Payment defaults|Advance recoupment rate|Minimum interim certificate|Payment target)$/,
    why: "Founder (audit fix, approved 2026-10-23), batch A #2: five budget settings were saved and shown but read by no rule, so they and their columns are deleted rather than kept as settings that change nothing",
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
  {
    ours: "Record a paper application",
    theirs: "Register supplier",
    why: "6.15a (ADR 0019): suppliers cannot sign in yet, so an officer records each from its paper application; self-registration is 6.15b",
  },
  {
    ours: "New requisition",
    theirs: "New request",
    why: "6.1 UX review M8: the dashboard's button was disabled with no reason while requisitions could be raised; it now opens the requisition form and says so",
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
