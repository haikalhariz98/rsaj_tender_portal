// Fail when markup uses class names from the retired prototype stylesheet.
//
// That stylesheet is deleted, so its classes style nothing: a screen written with them
// renders unstyled, and copying an old snippet "just for now" is how screens drift.
// Every screen is on src/components/ui; this keeps it that way.
//
//   node scripts/check-ui.mjs
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

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

const problems = [];
for (const file of MIGRATED.flatMap(files).filter((f) => /\.tsx?$/.test(f))) {
  const source = readFileSync(file, "utf8");
  problems.push(...longSubtitles(file, source));
  const lines = source.split("\n");
  lines.forEach((line, i) => {
    for (const cls of FORBIDDEN) {
      if (new RegExp(`className=[{"'\`][^>]*\\b${cls}(__|--|\\b)`).test(line)) {
        problems.push(`${file}:${i + 1}  retired class "${cls}" — use the shared component`);
      }
    }
  });
}

if (problems.length) {
  console.error(problems.join("\n"));
  console.error(`\n${problems.length} problem(s).`);
  process.exit(1);
}
console.log("UI scaffolding check passed.");
