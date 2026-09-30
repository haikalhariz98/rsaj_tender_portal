// Fail when migrated areas use the legacy page scaffolding.
//
// Consistency is what the shared components buy, and it is lost one screen at a time:
// somebody copies an old header "just for now". This catches the scaffolding that
// makes two screens look different — page heads and tab strips — in the areas that
// have moved to src/components/ui. Add an area to MIGRATED when it moves.
//
//   node scripts/check-ui.mjs
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const MIGRATED = ["src/app/configuration", "src/app/page.tsx", "src/components/not-built.tsx", "src/components/tabs.tsx", "src/components/shell"];

/// Legacy classes that decide how a screen is framed. A screen using any of these is
/// not using PageHeader / Tabs.
const FORBIDDEN = ["pagehead", "tabbar", "cfg-wrap", "cfg-rail", "subnav"];

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
        problems.push(`${file}:${i + 1}  legacy "${cls}" — use the shared component`);
      }
    }
  });
}

if (problems.length) {
  console.error(problems.join("\n"));
  console.error(`\n${problems.length} legacy scaffolding use(s) in migrated areas.`);
  process.exit(1);
}
console.log("UI scaffolding check passed.");
