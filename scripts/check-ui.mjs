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

const problems = [];
for (const file of MIGRATED.flatMap(files).filter((f) => /\.tsx?$/.test(f))) {
  const lines = readFileSync(file, "utf8").split("\n");
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
  console.error(`\n${problems.length} use(s) of retired prototype classes.`);
  process.exit(1);
}
console.log("UI scaffolding check passed.");
