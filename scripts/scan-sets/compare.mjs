// Usage: node scripts/scan-sets/compare.mjs <dirA> <dirB> [--subset] [--ignore <prefix>]...
// Compares, per test file, the dirs and files two recorder runs saw. Exit 1 on any difference.
// --subset compares only the test files present in <dirB>.
import fs from "node:fs";
import path from "node:path";

const args = process.argv.slice(2);
const dirs = [];
const ignore = [];
let subset = false;
for (let i = 0; i < args.length; i++) {
  if (args[i] === "--subset") subset = true;
  else if (args[i] === "--ignore") ignore.push(args[++i]);
  else dirs.push(args[i]);
}
if (dirs.length !== 2) {
  console.error("usage: compare.mjs <dirA> <dirB> [--subset] [--ignore <prefix>]...");
  process.exit(2);
}
const [a, b] = dirs;
const load = (d) =>
  new Map(fs.readdirSync(d).filter((f) => f.endsWith(".json")).map((f) => [f, JSON.parse(fs.readFileSync(path.join(d, f), "utf8"))]));
const A = load(a);
const B = load(b);
const ignored = (p) => ignore.some((x) => p === x || p.startsWith(x));
const keep = (xs) => xs.filter((p) => !ignored(p));

let differing = 0;
let paths = 0;
const names = new Set([...(subset ? [] : A.keys()), ...B.keys()]);
for (const name of [...names].sort()) {
  const x = A.get(name);
  const y = B.get(name);
  if (!x || !y) {
    console.log(`${x ? "only in " + a : "only in " + b}: ${name.replace(/__/g, "/").replace(/\.json$/, "")}`);
    differing++;
    continue;
  }
  const lines = [];
  for (const kind of ["dirs", "files"]) {
    const sx = new Set(keep(x[kind]));
    const sy = new Set(keep(y[kind]));
    for (const p of sx) if (!sy.has(p)) lines.push(`  - ${kind.slice(0, -1)} ${p}`);
    for (const p of sy) if (!sx.has(p)) lines.push(`  + ${kind.slice(0, -1)} ${p}`);
  }
  if (lines.length) {
    differing++;
    paths += lines.length;
    console.log(`${x.test}  (- only in ${a}, + only in ${b})`);
    console.log(lines.join("\n"));
  }
}
console.log(`${differing} test file(s) differ, ${paths} path difference(s); compared ${subset ? B.size : names.size} test file(s)${ignore.length ? "; ignored: " + ignore.join(", ") : ""}`);
process.exit(differing ? 1 : 0);
