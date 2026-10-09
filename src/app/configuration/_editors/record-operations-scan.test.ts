import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { lex, spans } from "@/lib/scan/source";

import { OPERATIONS } from "./operations";

/**
 * The acts of the record that a second person decides (sign-in programme Phase 5a, ADR 0034 D15): a lowered classification, and the corrections of a contract's
 * baseline, an award's terms, the Contract Date and an accepted award's return. Each is an act of its own module and is its own editor, so a browser can post to it
 * as to any act. What keeps a correction from being one person's:
 *
 * - it asks who is signed in and refuses an administrator account first (`staffForAct("TRANSACTION")`), before anything is read;
 * - it knows whether the machinery runs it (`currentAmbient()`): asked of by a person it proposes the change (`stageRecordEdit` with its own key) and writes nothing;
 * - the registry declares it an act of the record: proposed by whoever the act lets do it, decided by a holder of `corrections.decide`, and never by an administrator account.
 */

const ROOT = process.cwd();
const RECORD_KEYS = Object.keys(OPERATIONS).filter((k) => /^(documents-records|projects|awards-records)\./.test(k));

/// Where each record editor lives: the module its registry entry loads, and the export.
const WHERE: Record<string, { file: string; name: string }> = {
  "documents-records.reclassifyDocument": { file: "src/app/documents/actions.ts", name: "reclassifyDocument" },
  "projects.correctBaseline": { file: "src/app/projects/[id]/actions.ts", name: "correctBaseline" },
  "projects.correctAwardTerm": { file: "src/app/projects/[id]/actions.ts", name: "correctAwardTerm" },
  "projects.correctContractDate": { file: "src/app/projects/[id]/actions.ts", name: "correctContractDate" },
  "awards-records.recordReturn": { file: "src/app/awards/actions.ts", name: "recordReturn" },
};

describe("the acts of the record that a second person decides", () => {
  it("are exactly the ones named here, and each is declared an act of the record", () => {
    expect(RECORD_KEYS.sort()).toEqual(Object.keys(WHERE).sort());
    for (const k of RECORD_KEYS) {
      const op = OPERATIONS[k as keyof typeof OPERATIONS] as { propose?: string; decide?: string; administratorMay?: boolean; kind?: string };
      expect(op.propose, k).toBe("EDITOR");
      expect(op.decide, k).toBe("corrections.decide");
      expect(op.administratorMay, k).toBe(false);
      expect(op.kind, k).toMatch(/^(CLASSIFICATION_DOWNGRADE|BASELINE_CORRECTION|AWARD_TERM_CORRECTION|CONTRACT_DATE_CORRECTION|AWARD_RETURN_CORRECTION)$/);
    }
  });

  it.each(Object.entries(WHERE))("%s: asks who is signed in first, and proposes unless the machinery runs it", (key, where) => {
    const raw = readFileSync(path.join(ROOT, where.file), "utf8");
    const m = lex(raw);
    const span = spans(m).find((s) => s.name === where.name)!;
    expect(span, where.name).toBeTruthy();
    const body = raw.slice(span.from, span.to);
    const lexed = m.slice(span.from, span.to);
    // The first awaited call is the guard that refuses an administrator account.
    expect(body.slice(lexed.search(/\bawait\b/)), key).toMatch(/^await\s+staffForAct\("TRANSACTION"\)/);
    // It decides between proposing and doing by the ambient transaction, and proposes under its own registry key.
    expect(lexed, key).toMatch(/currentAmbient\(\)/);
    expect(body, key).toContain(`await stageRecordEdit("${key}"`);
    // Nothing is written before it has decided which: the proposal comes before any write of the act's own.
    const at = body.indexOf(`stageRecordEdit("${key}"`);
    expect(at, key).toBeGreaterThan(-1);
    expect(lexed.slice(0, at), key).not.toMatch(/\.(?:create|update|updateMany|delete|deleteMany|upsert)\s*\(/);
  });

  it("awards-records.recordReturn: decides to propose on an unlocked read, so it asks the ambient again under the award's lock before it corrects", () => {
    const raw = readFileSync(path.join(ROOT, "src/app/awards/actions.ts"), "utf8");
    const m = lex(raw);
    const span = spans(m).find((s) => s.name === "recordReturn")!;
    const lexed = m.slice(span.from, span.to);
    const lock = lexed.indexOf("inAward(");
    expect(lock).toBeGreaterThan(-1);
    const inside = lexed.slice(lock);
    const refusal = inside.search(/a\.status === "[^"]*" && !currentAmbient\(\)/);
    expect(refusal, "the in-lock refusal of a correction made without the machinery").toBeGreaterThan(-1);
    // Before the first write, the access log and the correcting branch.
    expect(refusal).toBeLessThan(inside.search(/sulitWriteRefusal|\.(?:create|update|updateMany|delete|deleteMany|upsert)\s*\(/));
  });

  it("the registry loads the module and the export where the act is", () => {
    const src = readFileSync(path.join(ROOT, "src", "app", "configuration", "_editors", "record-operations.ts"), "utf8");
    for (const [key, where] of Object.entries(WHERE)) {
      const name = key.slice(key.indexOf(".") + 1);
      const loaded = where.file.replace(/^src\//, "@/").replace(/\.ts$/, "");
      const at = src.indexOf(`  ${name}: {`);
      expect(at, key).toBeGreaterThan(-1);
      // The entry: to the end of its own line when it closes there, else to the line that closes it (`  },` at the margin of the entry).
      const lineEnd = src.indexOf("\n", at);
      const entry = src.slice(at, /\},\s*$/.test(src.slice(at, lineEnd)) ? lineEnd : src.indexOf("\n  },", at) + 5);
      expect(entry, key).toContain(`import("${loaded}")`);
      expect(entry, key).toContain(`m.${where.name}`);
    }
  });
});
