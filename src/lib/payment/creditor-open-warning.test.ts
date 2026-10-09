import { describe, expect, it } from "vitest";

import { assembleInterim } from "./assemble";
import { INPUT_FOR_TESTS } from "./opening-residual.fixture";
import { PAYEE_BANK_UNCHECKED, paymentFaultText } from "./labels";

// Decisions log, 2026-10-09, ruling on 1897 R4: a valuation, when it is opened, says whether the contractor's bank details are checked. Said, not refused: the refusal is the issue's.

const warned = (creditor?: NonNullable<typeof INPUT_FOR_TESTS.creditor>) => assembleInterim({ ...INPUT_FOR_TESTS, ...(creditor ? { creditor } : {}) }).warnings.filter((w) => w.code === "CREDITOR_NOT_VERIFIED" || w.code === "CONTRACTOR_NOT_ON_REGISTER");

describe("the warning at open about the contractor's bank details", () => {
  it("says nothing where the caller gave no facts", () => {
    expect(warned()).toEqual([]);
  });
  it("says nothing where a checked version is in force", () => {
    expect(warned({ onRegister: true, versions: [{ version: 1, sent: true, verification: "VERIFIED" }] })).toEqual([]);
  });
  it("warns, in words, when none was entered, one waits for a check or the only one was found not in order", () => {
    for (const versions of [[], [{ version: 1, sent: true, verification: "NOT_CHECKED" as const }], [{ version: 1, sent: true, verification: "NOT_IN_ORDER" as const }]]) {
      const w = warned({ onRegister: true, versions });
      expect(w).toHaveLength(1);
      expect(w[0].level).toBe("warn");
      expect(paymentFaultText(w[0])).toMatch(/not checked.*refused at issue/s);
    }
  });
  it("warns that an award with no supplier of the register has nothing to pay to", () => {
    const w = warned({ onRegister: false, versions: [] });
    expect(w[0].code).toBe("CONTRACTOR_NOT_ON_REGISTER");
    expect(w[0].level).toBe("warn");
    expect(paymentFaultText(w[0])).toMatch(/refused at issue/);
  });
  it("blocks nothing: the valuation can still be raised for the issue to refuse", () => {
    const a = assembleInterim({ ...INPUT_FOR_TESTS, creditor: { onRegister: true, versions: [] } });
    expect(a.faults.filter((f) => f.code.startsWith("CREDITOR") || f.code === "CONTRACTOR_NOT_ON_REGISTER")).toEqual([]);
  });
});

describe("whose bank details are not checked", () => {
  it("says so for an advance to a nominated sub-contractor and for direct payments, in both languages", () => {
    for (const k of ["advance", "direct"] as const) {
      expect(PAYEE_BANK_UNCHECKED[k].en).toMatch(/not checked/);
      expect(PAYEE_BANK_UNCHECKED[k].en).toMatch(/not linked to the supplier register/);
      expect(PAYEE_BANK_UNCHECKED[k].ms.length).toBeGreaterThan(20);
    }
  });
});
