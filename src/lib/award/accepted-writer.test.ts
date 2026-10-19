import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { awardTransition } from "./status";
import { posixRelative } from "@/lib/scan/files";

/**
 * BD-DS-2 (ruled 2026-10-01): an award reaches ACCEPTED only through
 * `acceptOnCompleteReturn` (src/lib/award/return-acceptance.ts), which judges the return
 * and its scans under the award's lock and snapshots the scan pins it was accepted on
 * (`returnScanSnapshot`). Null on an ACCEPTED award reads "accepted before scans were
 * required"; a second writer of ACCEPTED would make that null lie. Proved by a scan of
 * the application source (`src/`), in the readers.test.ts style: it fails if any other
 * file writes the status ACCEPTED, by literal, by raw SQL, or through a write whose
 * status comes from a variable that is not itself proved.
 *
 * Out of scope, deliberately: `prisma/demo-award.ts` inserts an invented, already
 * accepted demo award as it stands (with its own trail); it is demo data, not an act
 * the application performs. Tests (`*.test.ts`) and the generated client are skipped.
 */

const ROOT = process.cwd();
const OWNER = "src/lib/award/return-acceptance.ts";
/// Where the award's `mustMove` lives (moved from src/app/awards/actions.ts, founder, 2026-10-05).
const MUST_MOVE_FILE = "src/lib/award/route-write.ts";

function sources(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) {
      if (posixRelative(ROOT, p) === "src/generated") continue;
      out.push(...sources(p));
    } else if (/\.(ts|tsx)$/.test(name) && !/\.test\.ts$/.test(name)) {
      out.push(posixRelative(ROOT, p));
    }
  }
  return out;
}

const FILES = sources(join(ROOT, "src"));
const text = (f: string) => readFileSync(join(ROOT, f), "utf8");

/// Every `<client>.award.<write>(...)` call in a file, with its whole argument text.
function awardWrites(src: string): string[] {
  const out: string[] = [];
  const re = /\.award\.(update|updateMany|upsert|create|createMany)\(/g;
  for (let m = re.exec(src); m; m = re.exec(src)) {
    let depth = 1;
    let i = m.index + m[0].length;
    for (; i < src.length && depth > 0; i++) {
      if (src[i] === "(") depth++;
      else if (src[i] === ")") depth--;
    }
    out.push(src.slice(m.index, i));
  }
  return out;
}

const WRITES_ACCEPTED_LITERALLY = /\bstatus\s*:\s*["'`]ACCEPTED["'`]/;
const WRITES_ACCEPTED_BY_ENUM = /\bAwardStatus\.ACCEPTED\b/;
const WRITES_ACCEPTED_IN_SQL = /"status"\s*=\s*'ACCEPTED'/i;

describe("acceptOnCompleteReturn is the only writer of ACCEPTED (BD-DS-2)", () => {
  it("the scan reads the application source", () => {
    expect(FILES).toContain(OWNER);
    expect(FILES).toContain("src/app/awards/actions.ts");
    expect(FILES.some((f) => f.startsWith("src/generated/"))).toBe(false);
  });

  it("return-acceptance.ts writes ACCEPTED once, inside acceptOnCompleteReturn, with the scan snapshot", () => {
    const src = text(OWNER);
    const writes = awardWrites(src);
    expect(writes).toHaveLength(1);
    expect(writes[0]).toMatch(WRITES_ACCEPTED_LITERALLY);
    expect(writes[0]).toMatch(/returnScanSnapshot/);
    // Guarded on the status read under the lock: only an ISSUED award moves.
    expect(writes[0]).toMatch(/where:\s*\{[^}]*status:\s*"ISSUED"/);
    const fn = src.indexOf("export async function acceptOnCompleteReturn(");
    expect(fn).toBeGreaterThan(-1);
    expect(src.indexOf(writes[0])).toBeGreaterThan(fn);
  });

  it.each(FILES.filter((f) => f !== OWNER))("%s does not write ACCEPTED", (file) => {
    const src = text(file);
    expect(src, `${file} writes status ACCEPTED`).not.toMatch(WRITES_ACCEPTED_LITERALLY);
    expect(src, `${file} names AwardStatus.ACCEPTED`).not.toMatch(WRITES_ACCEPTED_BY_ENUM);
    expect(src, `${file} sets ACCEPTED in SQL`).not.toMatch(WRITES_ACCEPTED_IN_SQL);
  });

  it("every other award write takes its status from a literal, or from mustMove whose every call is a literal other than ACCEPTED", () => {
    const seen: string[] = [];
    for (const file of FILES.filter((f) => f !== OWNER)) {
      for (const w of awardWrites(text(file))) {
        // What is written, not what is matched on: the `where` may name the status read under the lock.
        const data = w.slice(Math.max(0, w.search(/\bdata\s*:/)));
        expect(data, `${file}: an award write with no data`).toMatch(/^data\s*:/);
        const status = data.match(/\bstatus\s*:\s*([^,}\s]+)/);
        if (!status) continue;
        seen.push(`${file}: ${status[1]}`);
        if (/^["'`]/.test(status[1])) {
          expect(status[1], `${file}`).not.toMatch(/ACCEPTED/);
          continue;
        }
        // The one variable-status writer: `mustMove(tx, l, to)`, moved unchanged from the awards actions to the award's
        // route writer (founder, 2026-10-05), so a sitting's outcome can cite the appointment through it.
        expect(file, `${file} writes an award status from ${status[1]}`).toBe(MUST_MOVE_FILE);
        expect(w).toMatch(/data:\s*\{\s*status:\s*to\b/);
      }
    }
    // The scan saw mustMove's write; if it is renamed, this test must be looked at again.
    expect(seen).toContain(`${MUST_MOVE_FILE}: to`);

    // Its callers: the awards actions (which import it) and the route writer (which defines it). Stricter: both files.
    for (const f of ["src/app/awards/actions.ts", MUST_MOVE_FILE]) {
      const src = text(f);
      const calls = [...src.matchAll(/\bmustMove\(\s*tx\s*,\s*l\s*,\s*([^,)]+)/g)].map((m) => m[1].trim());
      expect(calls.length, f).toBeGreaterThan(0);
      for (const to of calls) {
        expect(to, `${f}: mustMove called with a non-literal status`).toMatch(/^"[A-Z_]+"$/);
        expect(to, f).not.toBe('"ACCEPTED"');
      }
      // And mustMove itself is only reached through those calls, never passed on as a value (its import, or its definition).
      expect([...src.matchAll(/\bmustMove\b/g)].length, f).toBe(calls.length + 1);
    }
  });

  it("the transition itself still refuses ACCEPTED without a complete return", () => {
    expect(awardTransition("ISSUED", "ACCEPTED", { today: "2026-10-01", returnComplete: false })).toBe("RETURN_INCOMPLETE");
    expect(awardTransition("ISSUED", "ACCEPTED", { today: "2026-10-01", returnComplete: true })).toBeNull();
  });
});
