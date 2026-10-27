import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { EXECUTED_STATUSES } from "@/lib/payment/eligibility";

import { ACT_STATUS } from "./act-status";
import { AFTER_PIN_FAMILIES, bodyOf, exported, TODAY_ACTS, TODAY_STATUSES, todayAnswer } from "./act-status-pin.fixture";
import { isExecuted } from "./status";

/**
 * 6.13 Part B run 1a (ADR 0031 §4, BD-613-99): before one act × status table governs the contract's acts, every act
 * Part A, 6.12 and 6.14 built has its answer today pinned here, for every status that exists today. The table that
 * follows must give exactly these answers for these statuses; only the five new statuses get new answers.
 *
 * Today's answer, for every act below and every status: refused where the contract is CANCELLED (each act's wrapper,
 * under the contract's lock, before anything else), and otherwise let through to the act's own rule (which judges
 * execution, formation and the rest by its own words). /approvals refuses a cancelled contract's certificate and variation
 * routes likewise. "Executed" (isExecuted, EXECUTED_STATUSES) is EXECUTED, STAMPED and ACTIVE.
 */

describe("today's acts on a contract, every one listed", () => {
  for (const [file, acts] of Object.entries(TODAY_ACTS)) {
    it(`${file}: the exported acts are exactly these`, () => {
      expect(exported(readFileSync(file, "utf8"))).toEqual([...acts]);
    });
  }
});

describe("today's answers, pinned (before the act × status table)", () => {
  it("every act's answer for every status today: refused when cancelled, otherwise to its own rule", () => {
    const answers = TODAY_STATUSES.map(todayAnswer);
    expect(answers).toEqual(["ALLOWED", "CANCELLED", "ALLOWED", "ALLOWED", "ALLOWED", "ALLOWED", "ALLOWED", "ALLOWED", "ALLOWED"]);
  });

  it("executed today means EXECUTED, STAMPED and ACTIVE, by both readers", () => {
    for (const s of TODAY_STATUSES) expect(isExecuted(s), s).toBe(["EXECUTED", "STAMPED", "ACTIVE"].includes(s));
    for (const s of TODAY_STATUSES) expect(EXECUTED_STATUSES.includes(s), s).toBe(["EXECUTED", "STAMPED", "ACTIVE"].includes(s));
  });
});

// ADR 0042 D11 (PW-22): a family that arrived after the pin has no pinned answer. The Project workspace's row, for the statuses that existed then, reads as
// Part B's do: refused before execution and when cancelled, allowed once executed. Its own acts (from step 4) are never added to TODAY_ACTS.
describe("a family after the pin: the Project workspace", () => {
  it("is not recorded before execution or when cancelled, and is recorded once executed, for every status that existed at the pin", () => {
    expect([...AFTER_PIN_FAMILIES]).toEqual(["PROJECT_WORKSPACE", "FUNDING"]);
    for (const s of TODAY_STATUSES) expect(ACT_STATUS.PROJECT_WORKSPACE[s], `PROJECT_WORKSPACE ${s}`).toBe(isExecuted(s) ? "ALLOWED" : "REFUSED");
    expect(Object.keys(TODAY_ACTS)).toHaveLength(5);
  });
  // ADR 0046 (Sukuk core review): the funding row, for the statuses that existed at the pin, reads as the pinned answer: refused only when cancelled.
  it("the funding row gives the pinned answer: refused when cancelled, otherwise to its own rule", () => {
    for (const s of TODAY_STATUSES) expect(ACT_STATUS.FUNDING[s] === "ALLOWED" ? "ALLOWED" : "CANCELLED", `FUNDING ${s}`).toBe(todayAnswer(s));
  });
});

// Run 1a (faithful, ADR 0031 §4): the table now gives these answers (act-status.test.ts checks every act against the
// pinned ones). What stays pinned here of the mechanism: every act still goes through its wrapper, the wrapper refuses a
// cancelled contract first with the same words as before, and /approvals keeps its two cancelled refusals' words.
describe("how today's answer is given (source)", () => {
  const cancelledWords: Record<string, string> = {
    "src/app/projects/[id]/actions.ts": "The contract is cancelled: it is kept as it was.",
    "src/app/projects/[id]/supervision-actions.ts": "The contract is cancelled: it is kept as it was.",
    "src/app/projects/[id]/payment-actions.ts": "The contract is cancelled: it is kept as it was.",
    "src/app/projects/[id]/variation-actions.ts": "The contract is cancelled: it is kept as it was.",
    "src/app/projects/[id]/certificates/[certId]/actions.ts": "The contract is cancelled: its certificates are kept as they were.",
  };
  for (const [file, acts] of Object.entries(TODAY_ACTS)) {
    it(`${file}: the wrapper refuses a cancelled contract first, with its words as before, and every act goes through it`, () => {
      const src = readFileSync(file, "utf8");
      expect(src).toMatch(/if \(refused\) return refused\.code === "CONTRACT_CANCELLED" \? CANCELLED : \{ ok: false, message: actStatusText\(refused\) \};/);
      expect(src).toContain(`const CANCELLED: FormState = { ok: false, message: "${cancelledWords[file]}" };`);
      expect(src).not.toMatch(/allowCancelled: true/);
      for (const a of acts) expect(bodyOf(src, a), a).toMatch(/\b(inContract|inCertificate|inCert)\(/);
    });
  }
  it("/approvals refuses a cancelled contract's certificate and variation routes, under the contract's lock, with its words as before", () => {
    const src = readFileSync("src/app/approvals/actions.ts", "utf8");
    expect(src).toContain('certRefused.code === "CONTRACT_CANCELLED" ? "The contract is cancelled: its certificates are kept as they were, and their routes are not escalated."');
    expect(src).toContain('variationRefused.code === "CONTRACT_CANCELLED" ? "The contract is cancelled: its variations are kept as they were, and their routes are not escalated."');
  });
});
