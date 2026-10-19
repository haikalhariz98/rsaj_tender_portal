// Vitest setupFile: records which directories each test file lists and which files it reads,
// so a Windows run can be proved to read the same set as a Linux run.
// Output: coverage/scan-sets/<SCAN_SET_LABEL>/<test path with / as __>.json
import fs from "node:fs";
import path from "node:path";
import { syncBuiltinESMExports } from "node:module";
import { fileURLToPath } from "node:url";
import { afterAll, expect } from "vitest";

const label = process.env.SCAN_SET_LABEL ?? "unlabelled";
const cwd = process.cwd();
const SKIP = ["node_modules", ".next", "coverage", ".claude", ".codex"];

type Sets = { dirs: Set<string>; files: Set<string> };
const KEY = Symbol.for("perolehan.scanSets");
const g = globalThis as unknown as Record<symbol, { sets: Sets; original: { readdirSync: typeof fs.readdirSync; readFileSync: typeof fs.readFileSync } } | undefined>;

function keep(p: unknown): string | null {
  let s: string;
  if (typeof p === "string") s = p;
  else if (p instanceof URL) s = fileURLToPath(p);
  else if (Buffer.isBuffer(p)) s = p.toString();
  else return null;
  const rel = path.relative(cwd, path.resolve(cwd, s));
  if (rel === "" || rel.startsWith("..") || path.isAbsolute(rel)) return null;
  const posix = rel.split(path.sep).join("/");
  if (SKIP.includes(posix.split("/")[0])) return null;
  return posix;
}

if (!g[KEY]) {
  const original = { readdirSync: fs.readdirSync, readFileSync: fs.readFileSync };
  g[KEY] = { sets: { dirs: new Set(), files: new Set() }, original };
  const state = g[KEY]!;
  fs.readdirSync = function (this: unknown, ...args: unknown[]) {
    const k = keep(args[0]);
    if (k) state.sets.dirs.add(k);
    return (original.readdirSync as (...a: unknown[]) => unknown).apply(this, args);
  } as typeof fs.readdirSync;
  fs.readFileSync = function (this: unknown, ...args: unknown[]) {
    const k = keep(args[0]);
    if (k) state.sets.files.add(k);
    return (original.readFileSync as (...a: unknown[]) => unknown).apply(this, args);
  } as typeof fs.readFileSync;
  syncBuiltinESMExports();
}

// A fresh set for this test file (a worker may be reused).
g[KEY]!.sets.dirs.clear();
g[KEY]!.sets.files.clear();

afterAll(() => {
  const testPath = expect.getState().testPath;
  if (!testPath) return;
  const test = path.relative(cwd, testPath).split(path.sep).join("/");
  const { dirs, files } = g[KEY]!.sets;
  const out = path.join(cwd, "coverage", "scan-sets", label);
  fs.mkdirSync(out, { recursive: true });
  const body = JSON.stringify({ test, dirs: [...dirs].sort(), files: [...files].sort() }, null, 2) + "\n";
  fs.writeFileSync(path.join(out, test.split("/").join("__") + ".json"), body);
});
