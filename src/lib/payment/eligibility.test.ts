import { describe, expect, it } from "vitest";

import { readFileSync } from "node:fs";

import { creditorFaults, preExecutionFaults, type CreditorFacts, type PreExecutionFacts } from "./eligibility";
import { paymentFaultWords } from "./labels";

/**
 * FR-PAY-014 (checked at issue on the allocated sequence, warned of at open). FIXTURE: the limit 3 is the spec's
 * "1 to 3", a customer figure, never shipped (an unset limit refuses).
 */

const READY: PreExecutionFacts = {
  executed: false,
  limit: 3,
  gate: [
    { key: "RETURNED", state: "MET" },
    { key: "BOND", state: "MET" },
    { key: "INSURANCE", state: "MET" },
  ],
  withoutReceipt: [],
  perkesoRecorded: true,
};
const codes = (seq: number, f: PreExecutionFacts) => preExecutionFaults(seq, f).map((x) => x.code);

describe("certificates before the contract is signed", () => {
  it("certificate 4 is refused before execution; 3 is allowed with the letter returned, the bond and every policy verified", () => {
    expect(codes(4, READY)).toEqual(["CONTRACT_NOT_SIGNED"]);
    expect(codes(3, READY)).toEqual([]);
    expect(codes(1, READY)).toEqual([]);
  });
  it("a policy relied on without its premium receipt (a cover note) is refused", () => {
    expect(preExecutionFaults(2, { ...READY, withoutReceipt: ["Contractor's all risks"] })).toEqual([{ code: "COVER_NOTE_NO_RECEIPT", level: "block", data: { policies: "Contractor's all risks" } }]);
  });
  it("the letter not returned, the bond or a policy not verified, no social security number: each named", () => {
    expect(codes(1, { ...READY, gate: [{ key: "RETURNED", state: "NOT_MET" }, { key: "BOND", state: "NOT_SET" }, { key: "INSURANCE", state: "MET" }], perkesoRecorded: false })).toEqual(["PRE_EXECUTION_GATE", "PRE_EXECUTION_GATE", "PERKESO_NOT_RECORDED"]);
  });
  it("the limit unset refuses every certificate before execution, naming the setting", () => {
    expect(codes(1, { ...READY, limit: null })).toEqual(["PRE_EXECUTION_LIMIT_NOT_SET"]);
  });
  it("once executed, any sequence issues", () => {
    expect(codes(12, { ...READY, executed: true, limit: null, gate: [] })).toEqual([]);
  });
  it("at open the same rule warns rather than refuses", () => {
    expect(preExecutionFaults(4, READY, "warn")).toEqual([{ code: "CONTRACT_NOT_SIGNED", level: "warn", data: { sequence: 4, limit: 3 } }]);
  });
});

/**
 * BD-613-44 (Phase 4b, spec B4): a payment issues only to a contractor whose creditor profile an officer has checked. The latest CHECKED version is the one in force; a newer sent version that
 * is not checked changes nothing; with none checked the payment is refused, in words that say which of the three it is.
 */
describe("the contractor's bank details at issue (BD-613-44)", () => {
  const v = (version: number, verification: "NOT_CHECKED" | "VERIFIED" | "NOT_IN_ORDER", sent = true) => ({ version, sent, verification });
  const facts = (...versions: ReturnType<typeof v>[]): CreditorFacts => ({ onRegister: true, versions });
  const reasons = (f: CreditorFacts) => creditorFaults(f).map((x) => [x.code, x.data?.reason ?? null]);

  it("a checked profile makes the contractor payable", () => {
    expect(creditorFaults(facts(v(1, "VERIFIED")))).toEqual([]);
  });
  it("a newer version that is sent and not yet checked leaves the earlier checked one in force", () => {
    expect(creditorFaults(facts(v(1, "VERIFIED"), v(2, "NOT_CHECKED")))).toEqual([]);
    expect(creditorFaults(facts(v(1, "VERIFIED"), v(2, "NOT_IN_ORDER")))).toEqual([]);
    // and a newer one that was checked takes over (to this rule it does not matter which: some checked version is in force)
    expect(creditorFaults(facts(v(1, "VERIFIED"), v(2, "VERIFIED")))).toEqual([]);
  });
  it("with none checked the payment is refused, and the refusal says why", () => {
    expect(reasons(facts())).toEqual([["CREDITOR_NOT_VERIFIED", "NOT_ENTERED"]]);
    expect(reasons(facts(v(1, "NOT_CHECKED")))).toEqual([["CREDITOR_NOT_VERIFIED", "AWAITING_CHECK"]]);
    expect(reasons(facts(v(1, "NOT_IN_ORDER")))).toEqual([["CREDITOR_NOT_VERIFIED", "NOT_IN_ORDER"]]);
    // a draft the supplier has not sent is not a version a payment could go to
    expect(reasons(facts(v(1, "NOT_CHECKED", false)))).toEqual([["CREDITOR_NOT_VERIFIED", "NOT_ENTERED"]]);
  });
  it("a contractor the award does not link to the register has no profile to read, and is refused as that, never as an empty account", () => {
    expect(creditorFaults({ onRegister: false, versions: [] })).toEqual([{ code: "CONTRACTOR_NOT_ON_REGISTER", level: "block", data: {} }]);
  });
  it("is said, not refused, where the level is warn", () => {
    expect(creditorFaults(facts(), "warn")[0]!.level).toBe("warn");
  });
  it("every refusal has words in both languages, none of them a code", () => {
    for (const f of [...creditorFaults(facts()), ...creditorFaults(facts(v(1, "NOT_CHECKED"))), ...creditorFaults(facts(v(1, "NOT_IN_ORDER"))), ...creditorFaults({ onRegister: false, versions: [] })]) {
      const words = paymentFaultWords(f);
      expect(words.en).not.toBe("Refused.");
      expect(words.ms.length).toBeGreaterThan(20);
      expect(words.en).not.toMatch(/CREDITOR_NOT_VERIFIED|CONTRACTOR_NOT_ON_REGISTER|AWAITING_CHECK|NOT_ENTERED|NOT_IN_ORDER/);
    }
  });
  it("is wired where a payment issues: the interim certificate, and an advance payable to the main contractor, each on the award's own supplier", () => {
    const at = readFileSync("src/lib/payment/at-issue.ts", "utf8");
    expect(at.match(/creditorFaults\(await creditorFactsOf\(tx, l\.org\.id, l\.award\.vendorId\)\)/g)).toHaveLength(2);
    expect(at).toMatch(/if \(adv\.party === "MAIN"\) fs\.push\(\.\.\.creditorFaults/);
    // the supplier is the award's, never a name or an id the certificate carries
    expect(readFileSync("src/lib/payment/creditor-store.ts", "utf8")).toMatch(/supplierId: vendorId/);
  });
});
