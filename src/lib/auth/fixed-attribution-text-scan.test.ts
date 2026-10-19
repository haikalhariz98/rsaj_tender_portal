import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { lex } from "@/lib/scan/source";
import { posixRelative, toPosix } from "@/lib/scan/files";

/**
 * A screen never says by itself that an act was "recorded on behalf of, not signed" (ADR 0034 D12, Phase 2b, F1): that is true of some acts and false of others,
 * and the attribution knows which. `ActedBy` (a server component) and `loadAttributions` (a batch) read it, and say "Signed by A", "Recorded by B on behalf of A,
 * not signed", "(before sign-in)" or "Attribution missing".
 *
 * This is a ratchet. It counts the places in the source that still write the fixed words, or take them from a constant, and holds each file to its count:
 * a new one fails, and so does a file that no longer has the count it is listed with, so the list can only shrink. Each entry says what the place is and
 * why it has not been moved to the attribution yet. The words kept as the reading of old audit rows (an entry written before sign-in names the field
 * `recordedOnBehalf`) are not counted: they describe those rows.
 */

const ROOT = process.cwd();

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = path.join(dir, name);
    if (statSync(p).isDirectory()) {
      if (name === "generated" || name === "node_modules") continue;
      walk(p, out);
    } else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(toPosix(p));
  }
  return out;
}

/// The fixed words, or a constant that carries them: not the enum value "RECORDED_ON_BEHALF" (a mode, in quotes), not a comment.
const FIXED = /(?:recorded|Recorded)(?: by [a-z ]+)?,? on (?:their|the [a-z]+'s) behalf|(?:recorded|Recorded) on behalf|on their behalf, not signed|nobody signs in yet|\bON_BEHALF\w*|\bNOT_SIGNED_WORDS\b|(?<!["\w])RECORDED_ON_BEHALF\w*(?!["\w])|(?<![\w.])ATTESTED\b/g;

function counts(): Map<string, number> {
  const out = new Map<string, number>();
  for (const p of [...walk(path.join(ROOT, "src", "app")), ...walk(path.join(ROOT, "src", "components")), ...walk(path.join(ROOT, "src", "lib"))]) {
    const file = posixRelative(ROOT, p);
    if (file.startsWith("src/lib/auth/")) continue;
    // Comments are blanked, strings kept: the words in a comment explain, the words in a string are shown.
    const text = lex(readFileSync(p, "utf8"), { only: "comments" });
    const n = [...text.matchAll(FIXED)].length;
    if (n > 0) out.set(file, n);
  }
  return out;
}

/// Where the words still stand, with the count and what the place is. Shrink it; never add to it.
const STILL_FIXED: Readonly<Record<string, { count: number; what: string }>> = {
  "src/components/act-attribution-fields.tsx": { count: 1, what: "The shared form component's own label for the person an act is recorded for from paper: a choice the officer makes, not a claim about the act." },
  "src/lib/suppliers/audit-view.ts": { count: 1, what: "The label of the audit field `recordedOnBehalf`, which entries written before sign-in carry: it describes those rows, and no row written since has it unless the act was recorded from paper." },
  "src/lib/approvals/rejection-store.ts": { count: 2, what: "The audit field `recordedOnBehalf` of an officer's choice of where a refused route goes, written only where the act was recorded from paper (`act.intent.mode`)." },
  "src/lib/certificate/award-sheet.ts": { count: 2, what: "The audit field `recordedOnBehalf` of a routing check, written only where the act was recorded from paper (`act.intent.mode`)." },
  "src/lib/certificate/labels.ts": { count: 3, what: "The phrase's constant for the certificate's audit fields: a routing check, an override, or a block that is not a person's (the contractor's side, named by an officer, who does not sign in), each written only where it is true." },
  "src/lib/certificate/write.ts": { count: 4, what: "The audit field `recordedOnBehalf` of a block, an override and a routing check: written only for a block that is not a person's, or where the act was recorded from paper." },
  "src/lib/window/sale.ts": { count: 1, what: "The frozen annotation of a sold set, which says how the sale was recorded: these words only where the act was recorded for someone else (`recordedForSomeone`)." },
};

describe("no screen says by itself that an act was recorded on behalf of, not signed", () => {
  const found = counts();

  it("every place that writes the fixed words is listed with its count, and no list entry has lost one", () => {
    const wrong: string[] = [];
    for (const [file, n] of found) if ((STILL_FIXED[file]?.count ?? 0) !== n) wrong.push(`${file}: ${n} (listed ${STILL_FIXED[file]?.count ?? 0})`);
    for (const file of Object.keys(STILL_FIXED)) if (!found.has(file)) wrong.push(`${file}: none now (listed ${STILL_FIXED[file].count}): take it off the list`);
    expect(wrong).toEqual([]);
  });

  it("each listed place says what it is", () => {
    for (const [file, e] of Object.entries(STILL_FIXED)) expect(e.what.length, file).toBeGreaterThan(20);
  });
});
