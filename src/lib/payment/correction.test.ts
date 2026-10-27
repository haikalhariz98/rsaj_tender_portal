import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { asCorrected, correctionFaults, correctionFaultText } from "./correction";
import { paymentFaultText } from "./labels";
import { supplyFaultText } from "./supply";

// Phase 0.3 item 12: a payment recorded wrongly is corrected by a new row, never an edit; every reader takes the latest.
describe("asCorrected", () => {
  const row = { id: "p1", paidOn: "2026-10-01", batchNo: "B-1", amount: 100n };
  it("is the payment as recorded while nothing corrects it", () => {
    expect(asCorrected({ ...row, corrections: [] })).toEqual({ ...row, corrected: false });
  });
  it("is the latest correction's day, reference and amount over the rest of the row", () => {
    expect(asCorrected({ ...row, corrections: [{ paidOn: "2026-10-02", batchNo: "B-2", amount: 90n }] })).toEqual({ id: "p1", paidOn: "2026-10-02", batchNo: "B-2", amount: 90n, corrected: true });
  });
});

describe("correctionFaults", () => {
  const before = { paidOn: "2026-10-01", batchNo: "B-1", amount: 100n };
  it("needs a payment to correct", () => {
    expect(correctionFaults({ recorded: false, reason: "x", before, after: before }).map((f) => f.code)).toEqual(["NO_PAYMENT_TO_CORRECT"]);
  });
  it("needs a reason and a change", () => {
    expect(correctionFaults({ recorded: true, reason: " ", before, after: { ...before, batchNo: " B-1 " } }).map((f) => f.code)).toEqual(["CORRECTION_REASON_REQUIRED", "NOTHING_CORRECTED"]);
    expect(correctionFaults({ recorded: true, reason: "Typo.", before, after: { ...before, paidOn: "2026-10-02" } })).toEqual([]);
    expect(correctionFaults({ recorded: true, reason: "Typo.", before, after: { ...before, amount: 99n } })).toEqual([]);
  });
  it("says each refusal in words, for both kinds of payment", () => {
    for (const code of ["NO_PAYMENT_TO_CORRECT", "CORRECTION_REASON_REQUIRED", "NOTHING_CORRECTED"]) {
      const words = correctionFaultText({ code, level: "block" });
      expect(words).toMatch(/^[A-Z][^_]+\.$/);
      expect(paymentFaultText({ code, level: "block" })).toBe(words);
      expect(supplyFaultText({ code, level: "block" })).toBe(words);
    }
  });
});

// Every read of a payment's figures takes its corrections: a select or include of a payment that names its day, batch or amount, or the whole row, spreads
// CORRECTIONS on the same line. A read for its id alone (the record act's "already recorded" check) and a filter (`is: null`) need not.
describe("every reader of a payment takes the latest correction", () => {
  const files = (dir: string): string[] =>
    readdirSync(dir).flatMap((n) => {
      const f = path.join(dir, n);
      return statSync(f).isDirectory() ? (n === "generated" ? [] : files(f)) : /\.tsx?$/.test(n) && !/\.test\.tsx?$/.test(n) ? [f] : [];
    });
  it("spreads CORRECTIONS wherever a payment's figures are read", () => {
    const misses: string[] = [];
    for (const f of files(path.join(process.cwd(), "src")))
      readFileSync(f, "utf8")
        .split(/\r?\n/)
        .forEach((line, i) => {
          const read = /(financePayment|supplyPayment): \{ (include|select)|(financePayment|supplyInvoicePayment)\.(findUnique|findFirst|findMany)\(/.test(line);
          const idOnly = /select: \{ id: true \} \}\)/.test(line);
          if (read && !idOnly && !line.includes("CORRECTIONS")) misses.push(`${path.relative(process.cwd(), f)}:${i + 1}`);
        });
    expect(misses).toEqual([]);
  });
});
