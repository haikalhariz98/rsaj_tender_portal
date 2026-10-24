// Fail when markup uses class names from the retired prototype stylesheet.
//
// That stylesheet is deleted, so its classes style nothing: a screen written with them
// renders unstyled, and copying an old snippet "just for now" is how screens drift.
// Every screen is on src/components/ui; this keeps it that way.
//
//   node scripts/check-ui.mjs
import { readdirSync, readFileSync, statSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";

import { scanSource } from "./ui-text-rules.mjs";

const MIGRATED = ["src/app", "src/components"];

/// Retired prototype classes that framed or styled a screen. None has a rule any more.
const FORBIDDEN = [
  "pagehead", "tabbar", "cfg-wrap", "cfg-rail", "subnav", "card__head", "card__body",
  "cellstack", "callout", "empty__t", "stat__value", "iconbtn", "btn--primary", "btn--sm",
  "badge--warn", "chip--ok", "tablewrap", "ov__head", "drawer--lg",
];

function files(path) {
  if (!statSync(path).isDirectory()) return [path];
  return readdirSync(path).flatMap((f) => files(join(path, f)));
}

/// The subtitle limit is the one PageHeader enforces at run time.
const LIMIT = Number(/SUBTITLE_LIMIT\s*=\s*(\d+)/.exec(readFileSync("src/lib/ui/cut-text.ts", "utf8"))?.[1]);
if (!LIMIT) {
  console.error("src/lib/ui/cut-text.ts no longer defines SUBTITLE_LIMIT");
  process.exit(1);
}

/// A literal PageHeader subtitle over the limit: PageHeader would cut it behind an
/// information button, which is a safety net for dynamic text, not how a screen should
/// read. Write it to fit.
function longSubtitles(file, source) {
  const found = [];
  for (const m of source.matchAll(/<PageHeader\b/g)) {
    const rest = source.slice(m.index);
    const end = rest.search(/\n\s*\/>|[^=]\/>\s*\n|<\/PageHeader>/);
    const tag = end > 0 ? rest.slice(0, end) : rest.slice(0, 4000);
    const lit = /subtitle=(?:"([^"]*)"|\{\s*"([^"]*)"\s*\}|\{\s*`([^`$]*)`\s*\})/.exec(tag);
    const text = lit && (lit[1] ?? lit[2] ?? lit[3]);
    if (text && text.trim().length > LIMIT) {
      const line = source.slice(0, m.index + tag.indexOf(lit[0])).split("\n").length;
      found.push(`${file}:${line}  PageHeader subtitle is ${text.trim().length} characters (limit ${LIMIT}) — shorten it`);
    }
  }
  return found;
}

/// Literal-text rules (scripts/ui-text-rules.mjs, note 0005 section 4). Text written before the rules existed is
/// recorded in scripts/ui-text-baseline.json as a count per file and rule: a file may hold fewer, never more, so
/// new text meets the budget and the old text shrinks as it is touched. A rule with no entry (a retired callout
/// tone, a missing tone, a product code, a long page subtitle) allows none. `--write-baseline` rewrites the file
/// and may only be run after a count has gone down.
const BASELINE_FILE = "scripts/ui-text-baseline.json";
const baseline = existsSync(BASELINE_FILE) ? JSON.parse(readFileSync(BASELINE_FILE, "utf8")) : {};
const counts = {};
const slash = (f) => f.split("\\").join("/");

const problems = [];
for (const file of MIGRATED.flatMap(files).filter((f) => /\.tsx?$/.test(f))) {
  const source = readFileSync(file, "utf8");
  problems.push(...longSubtitles(file, source));
  for (const v of scanSource(slash(file), source)) {
    const key = `${v.file}|${v.rule}`;
    (counts[key] ??= []).push(v);
  }
  const lines = source.split("\n");
  // Note 0005 R12: a fold is the shared Disclosure or CardHeader collapsible, never a raw details element.
  if (slash(file).startsWith("src/app/")) {
    lines.forEach((line, i) => {
      if (/<details\b/.test(line)) problems.push(`${file}:${i + 1}  raw <details> — use Disclosure or CardHeader collapsible (src/components/ui)`);
    });
  }
  // The shared Select reads its options from its children on the client. A server component's <Option> reaches it as a client
  // reference it cannot read, so the dropdown opens empty ("Nothing to choose yet"): a server component writes <option>.
  if (/\.tsx$/.test(file) && !/^\s*["']use client["']/.test(source)) {
    lines.forEach((line, i) => {
      if (/<Option\b/.test(line)) problems.push(`${file}:${i + 1}  <Option> in a server component reaches Select empty — write <option>`);
    });
  }
  lines.forEach((line, i) => {
    for (const cls of FORBIDDEN) {
      if (new RegExp(`className=[{"'\`][^>]*\\b${cls}(__|--|\\b)`).test(line)) {
        problems.push(`${file}:${i + 1}  retired class "${cls}" — use the shared component`);
      }
    }
  });
}

if (process.argv.includes("--write-baseline")) {
  const next = Object.fromEntries(Object.entries(counts).filter(([k]) => !/\|(product-code|callout-tone|page-subtitle)$/.test(k)).map(([k, v]) => [k, v.length]).sort(([a], [b]) => a.localeCompare(b)));
  writeFileSync(BASELINE_FILE, JSON.stringify(next, null, 1) + String.fromCharCode(10));
  console.log(`Wrote ${Object.keys(next).length} entries to ${BASELINE_FILE}.`);
  process.exit(0);
}
for (const [key, found] of Object.entries(counts)) {
  if (found.length > (baseline[key] ?? 0)) {
    for (const v of found) problems.push(`${v.file}:${v.line}  ${v.msg}`);
  }
}

if (problems.length) {
  console.error(problems.join("\n"));
  console.error(`\n${problems.length} problem(s).`);
  process.exit(1);
}
console.log("UI scaffolding check passed.");
