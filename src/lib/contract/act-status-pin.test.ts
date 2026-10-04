import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { EXECUTED_STATUSES } from "@/lib/payment/eligibility";

import { bodyOf, exported, TODAY_ACTS, TODAY_STATUSES, todayAnswer } from "./act-status-pin.fixture";
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

describe("how today's answer is given (source, before the table)", () => {
  const wrappers: Record<string, RegExp> = {
    "src/app/projects/[id]/actions.ts": /if \(!opts\.allowCancelled && l\.contract\.status === "CANCELLED"\) return CANCELLED;/,
    "src/app/projects/[id]/supervision-actions.ts": /if \(l\.contract\.status === "CANCELLED"\) return CANCELLED;/,
    "src/app/projects/[id]/payment-actions.ts": /if \(l\.contract\.status === "CANCELLED"\) return CANCELLED;/,
    "src/app/projects/[id]/variation-actions.ts": /if \(l\.contract\.status === "CANCELLED"\) return CANCELLED;/,
    "src/app/projects/[id]/certificates/[certId]/actions.ts": /if \(l\.contract\.status === "CANCELLED"\) return CANCELLED;/,
  };
  for (const [file, acts] of Object.entries(TODAY_ACTS)) {
    it(`${file}: the wrapper refuses a cancelled contract first, and every act goes through it`, () => {
      const src = readFileSync(file, "utf8");
      expect(src).toMatch(wrappers[file]);
      expect(src).not.toMatch(/allowCancelled: true/);
      for (const a of acts) expect(bodyOf(src, a), a).toMatch(/\b(inContract|inCertificate|inCert)\(/);
    });
  }
  it("/approvals refuses a cancelled contract's certificate and variation routes, under the contract's lock", () => {
    const src = readFileSync("src/app/approvals/actions.ts", "utf8");
    expect(src).toMatch(/if \(inst\.certificate\?\.contract\.status === "CANCELLED"\) return/);
    expect(src).toMatch(/if \(inst\.variation\?\.contract\.status === "CANCELLED"\) return/);
  });
});
