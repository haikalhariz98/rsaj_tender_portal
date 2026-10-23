/**
 * The starter packs by name, and how a run reads on the console: shared by `prisma/seed.ts` and `scripts/load-pack.ts`. Each pack file
 * default-exports its `StarterPack`; a pack whose file is not written yet is refused by name.
 */

import { existsSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import type { LoadResult } from "../../src/lib/starter/apply";
import type { PackName, PackSkip, StarterPack } from "../../src/lib/starter/types";

const FILES: Record<PackName, string> = {
  generic: "packs/generic.ts",
  rsaj: "rsaj/starter-pack/index.ts",
  "dev-fill": "dev-fill.ts",
};

export async function packsNamed(names: readonly string[]): Promise<StarterPack[]> {
  const packs: StarterPack[] = [];
  for (const name of names) {
    if (!(name in FILES)) throw new Error(`There is no pack called "${name}". The packs are: ${Object.keys(FILES).join(", ")}.`);
    const file = path.join(__dirname, "..", FILES[name as PackName]);
    if (!existsSync(file)) throw new Error(`The ${name} pack is not written yet (${FILES[name as PackName]}).`);
    const mod = (await import(pathToFileURL(file).href)) as { default?: StarterPack | { default?: StarterPack } };
    // tsx may hand a CommonJS module back with its exports under default.
    const pack = mod.default && "default" in mod.default ? mod.default.default : (mod.default as StarterPack | undefined);
    if (!pack || pack.name !== name) throw new Error(`${FILES[name as PackName]} does not default-export the ${name} pack.`);
    packs.push(pack);
  }
  return packs;
}

const SKIPPED: Record<PackSkip["reason"], string> = {
  GROUP_SET: "already set",
  GROUP_PARTLY_SET: "partly set, so left as it is",
  LIST_NOT_EMPTY: "the list already has entries",
  REFERENCE_SKIPPED: "it refers to something this run did not write",
  DRAFT_EXISTS: "a draft already exists",
};

/// The run in lines: what it writes (a list as one line with its count), what it skips and why, a warning for each stated value skipped, and the faults.
export function describeRun(r: LoadResult, apply: boolean): string[] {
  const out: string[] = [];
  const counts = new Map<string, number>();
  for (const w of r.writes) {
    const line = w.kind === "SWITCH_OFF" ? "Security settings · approval by another admin off" : w.kind === "ROW" ? w.listLabel : w.kind === "GROUP" ? w.label : `${w.label} (draft, not in force)`;
    counts.set(`${w.pack}: ${line}`, (counts.get(`${w.pack}: ${line}`) ?? 0) + 1);
  }
  if (r.faults.length > 0) {
    out.push("Nothing was written. Put these right first:", ...r.faults.map((f) => `  ! ${f}`));
  } else {
    out.push(`${apply ? "Written" : "Would write"}:${counts.size === 0 ? " nothing" : ""}`, ...[...counts].map(([line, n]) => `  + ${line}${n > 1 ? ` (${n})` : ""}`));
  }
  if (r.skips.length > 0) out.push("Skipped:", ...r.skips.map((s) => `  - ${s.pack}: ${s.target}: ${SKIPPED[s.reason]}`));
  for (const s of r.skips.filter((x) => x.provenance === "STATED")) out.push(`Warning: the ${s.pack} pack states "${s.target}", but it was skipped (${SKIPPED[s.reason]}). Check that what is set there is what you want.`);
  if (!apply && r.faults.length === 0 && r.writes.length > 0) out.push("Nothing was written. Run again with --apply to load it.");
  return out;
}
