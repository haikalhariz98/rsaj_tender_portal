import { describe, expect, it } from "vitest";

import { acknowledgeFaults, despatchFaults, issueFaults, missingMandatory, nextCopyNo, recallFaults, recipientsFor, reissueFaults, type CopyFacts } from "./copies";
import { custodyState, movementFaults, registerFaults } from "./custody";
import { formationSnapshot, readFormationSnapshot, startFaults, type StartInputs } from "./preparation";
import { confirmFaults, correctionFaults, draftFaults } from "./versions";

const codes = (fs: { code: string }[]) => fs.map((f) => f.code);

// A fixture list (the shape of FR-CON-012's, invented names): never seeded.
const R = [
  { id: "r1", name: "Contracts office", mandatory: true, onlyWithConsultingEngineer: false },
  { id: "r2", name: "The contractor", mandatory: true, onlyWithConsultingEngineer: false },
  { id: "r3", name: "Consulting engineer", mandatory: true, onlyWithConsultingEngineer: true },
  { id: "r4", name: "Library", mandatory: false, onlyWithConsultingEngineer: false },
];
const copy = (x: Partial<CopyFacts>): CopyFacts => ({ id: "c", copyNo: 1, recipientId: "r1", despatchedOn: "2026-10-01", acknowledgedOn: null, recalledOn: null, reissuedAs: null, ...x });

describe("controlled copies (FR-CON-012)", () => {
  it("the consulting engineer unanswered blocks distribution; answered, the conditional recipient follows it", () => {
    expect(recipientsFor(R, null)).toBe("CONSULTANT_NOT_ANSWERED");
    expect((recipientsFor(R, false) as typeof R).map((r) => r.id)).toEqual(["r1", "r2", "r4"]);
    expect((recipientsFor(R, true) as typeof R).map((r) => r.id)).toEqual(["r1", "r2", "r3", "r4"]);
  });
  it("a mandatory recipient without a live copy keeps distribution open; a recalled copy does not count", () => {
    const list = recipientsFor(R, false) as typeof R;
    expect(missingMandatory(list, [copy({ recipientId: "r1" })]).map((r) => r.id)).toEqual(["r2"]);
    expect(missingMandatory(list, [copy({ recipientId: "r1" }), copy({ recipientId: "r2", recalledOn: "2026-10-02" })]).map((r) => r.id)).toEqual(["r2"]);
    expect(missingMandatory(list, [copy({ recipientId: "r1" }), copy({ recipientId: "r2" })])).toEqual([]);
  });
  it("issue: executed, stamped words frozen, one live copy per recipient", () => {
    const base = { status: "EXECUTED" as const, stampText: "Controlled copy", consultingEngineer: false, recipientId: "r2", recipients: R, copies: [], despatchedOn: "2026-10-01", contractDate: "2026-09-30", today: "2026-10-01" };
    expect(issueFaults(base)).toEqual([]);
    expect(codes(issueFaults({ ...base, status: "LEGALLY_ENDORSED" }))).toEqual(["NOT_EXECUTED"]);
    expect(codes(issueFaults({ ...base, consultingEngineer: null }))).toEqual(["CONSULTANT_NOT_ANSWERED"]);
    expect(codes(issueFaults({ ...base, recipientId: "r3" }))).toEqual(["NOT_A_RECIPIENT"]);
    expect(codes(issueFaults({ ...base, copies: [copy({ recipientId: "r2" })] }))).toEqual(["ALREADY_HOLDS_ONE"]);
    expect(codes(issueFaults({ ...base, stampText: null }))).toEqual(["STAMP_NOT_FROZEN"]);
    expect(codes(issueFaults({ ...base, despatchedOn: "2026-09-29" }))).toEqual(["BEFORE_CONTRACT_DATE"]);
  });
  it("recall then reissue: a new number, linked to the old, once", () => {
    const c = copy({ copyNo: 3 });
    expect(codes(reissueFaults(c))).toEqual(["NOT_RECALLED"]);
    expect(codes(recallFaults(c, "2026-10-02", "2026-10-02", ""))).toEqual(["REASON_REQUIRED"]);
    expect(recallFaults(c, "2026-10-02", "2026-10-02", "Pages 12 to 14 misprinted.")).toEqual([]);
    const recalled = { ...c, recalledOn: "2026-10-02" };
    expect(reissueFaults(recalled)).toEqual([]);
    expect(nextCopyNo([{ copyNo: 1 }, { copyNo: 3 }, { copyNo: 2 }])).toBe(4);
    expect(codes(reissueFaults({ ...recalled, reissuedAs: "c9" }))).toEqual(["ALREADY_REISSUED"]);
    expect(codes(recallFaults(recalled, "2026-10-02", "2026-10-02", "again"))).toEqual(["RECALLED"]);
  });
  it("acknowledged only after despatch, once", () => {
    expect(codes(acknowledgeFaults(copy({ despatchedOn: null }), "2026-10-02", "2026-10-02"))).toEqual(["NOT_DESPATCHED"]);
    expect(codes(acknowledgeFaults(copy({}), "2026-09-30", "2026-10-02"))).toEqual(["BEFORE_DESPATCH"]);
    expect(acknowledgeFaults(copy({}), "2026-10-01", "2026-10-02")).toEqual([]);
    expect(codes(acknowledgeFaults(copy({ acknowledgedOn: "2026-10-01" }), "2026-10-02", "2026-10-02"))).toEqual(["ALREADY_ACKNOWLEDGED"]);
    expect(codes(despatchFaults(copy({}), "2026-10-02", "2026-10-02", "2026-09-30"))).toEqual(["ALREADY_DESPATCHED"]);
  });
});

describe("custody of the originals (FR-CON-013)", () => {
  const out = { direction: "OUT" as const, personId: "p1", personName: "Aisyah", on: "2026-10-01" };
  it("out without in → OUT with the holder; in again → IN", () => {
    expect(custodyState([])).toEqual({ state: "IN" });
    expect(custodyState([out])).toEqual({ state: "OUT", holderId: "p1", holderName: "Aisyah", since: "2026-10-01" });
    expect(custodyState([out, { ...out, direction: "IN", on: "2026-10-02" }])).toEqual({ state: "IN" });
  });
  it("in before out is refused; out twice is refused naming the holder; never before the last movement", () => {
    expect(codes(movementFaults([], "IN", "2026-10-01", "2026-10-01"))).toEqual(["NOT_OUT"]);
    expect(movementFaults([out], "OUT", "2026-10-01", "2026-10-01")[0]).toEqual({ code: "ALREADY_OUT", level: "block", data: { holder: "Aisyah" } });
    expect(codes(movementFaults([out], "IN", "2026-09-30", "2026-10-01"))).toEqual(["BEFORE_LAST_MOVEMENT"]);
    expect(movementFaults([out], "IN", "2026-10-01", "2026-10-01")).toEqual([]);
    expect(codes(movementFaults([], "OUT", "2026-10-03", "2026-10-02"))).toEqual(["FUTURE_DATE"]);
  });
  it("the contract's own original only once executed; a location always", () => {
    expect(codes(registerFaults({ kind: "CONTRACT", executed: false, location: "", onContract: true, registered: false }))).toEqual(["NOT_EXECUTED", "LOCATION_REQUIRED"]);
    expect(registerFaults({ kind: "SECURITY", executed: false, location: "Strongroom A", onContract: true, registered: false })).toEqual([]);
    expect(codes(registerFaults({ kind: "POLICY", executed: true, location: "Strongroom A", onContract: false, registered: true }))).toEqual(["NOT_ON_CONTRACT", "ALREADY_REGISTERED"]);
  });
});

describe("starting preparation freezes the settings formation needs (ADR 0021 §5)", () => {
  const ok: StartInputs = { status: "NUMBER_ALLOCATED", awardStatus: "ISSUED", today: "2026-09-24", basis: { code: "bq", name: "Bill of quantities", requiresBq: true }, parts: 4, policy: { legalOfficeCode: "LEGAL", legalOfficeKnown: true, signatoryCond: "CONTRACT_AGREEMENT", controlledCopyStampEn: "Controlled copy" }, recipients: 3 };
  it("all set → starts", () => {
    expect(startFaults(ok)).toEqual([]);
  });
  it("each unset setting refuses, named", () => {
    expect(codes(startFaults({ ...ok, policy: { legalOfficeCode: null, legalOfficeKnown: false, signatoryCond: null, controlledCopyStampEn: " " }, recipients: 0 }))).toEqual(["LEGAL_OFFICE_NOT_SET", "SIGNATORY_COND_NOT_SET", "STAMP_NOT_SET", "NO_COPY_RECIPIENTS"]);
    expect(codes(startFaults({ ...ok, basis: { code: "bq", name: "Bill of quantities", requiresBq: null }, parts: 0 }))).toEqual(["BASIS_BQ_NOT_SET", "NO_DOCUMENT_PARTS"]);
    expect(codes(startFaults({ ...ok, basis: { code: null, name: null, requiresBq: null } }))).toEqual(["BASIS_NOT_SET"]);
    expect(codes(startFaults({ ...ok, policy: { ...ok.policy, legalOfficeKnown: false } }))).toEqual(["LEGAL_OFFICE_UNKNOWN"]);
    expect(codes(startFaults({ ...ok, today: null }))).toEqual(["NO_TIME_ZONE"]);
  });
  it("only from number allocated, on a live award", () => {
    expect(codes(startFaults({ ...ok, status: "IN_PREPARATION" }))).toEqual(["NOT_NUMBER_ALLOCATED"]);
    expect(codes(startFaults({ ...ok, status: "CANCELLED", awardStatus: "CANCELLED" }))).toEqual(["NOT_NUMBER_ALLOCATED", "AWARD_NOT_LIVE"]);
  });
  it("the snapshot round-trips and takes the basis's checks; anything else reads as none", () => {
    const s = formationSnapshot({ startedOn: "2026-09-24", policy: { legalOfficeCode: "LEGAL", legalOfficeLabel: "Legal office", frontLoadingRatio: null, stampEn: "Controlled copy", stampMs: null, signatoryCond: "CA", provenance: "ASSUMED" }, basis: { code: "ds", name: "Drawings", requiresBq: false }, recipients: [] });
    expect(s.checks).toEqual(["ARITHMETIC", "FRONT_LOADING", "SOR_ADJUSTMENT"]);
    expect(readFormationSnapshot(JSON.parse(JSON.stringify(s)))).toEqual(s);
    expect(readFormationSnapshot({ v: 2 })).toBeNull();
    expect(readFormationSnapshot(null)).toBeNull();
  });
});

describe("baseline versions (OD-2 A)", () => {
  it("confirmed before the first valuation once the gate holds and nothing is missing", () => {
    const ok = { status: "IN_PREPARATION" as const, hasDraft: true, versions: 0, gateReady: true, baselineBlocks: 0 };
    expect(confirmFaults(ok)).toEqual([]);
    expect(codes(confirmFaults({ ...ok, gateReady: false }))).toEqual(["GATE_NOT_MET"]);
    expect(codes(confirmFaults({ ...ok, baselineBlocks: 1 }))).toEqual(["BASELINE_INCOMPLETE"]);
    expect(codes(confirmFaults({ ...ok, versions: 1 }))).toEqual(["ALREADY_VERSIONED"]);
    expect(codes(confirmFaults({ ...ok, status: "EXECUTED" }))).toEqual(["NOT_IN_PREPARATION"]);
  });
  it("the draft is keyed only before any version and before execution", () => {
    expect(draftFaults({ status: "IN_PREPARATION", versions: 0 })).toEqual([]);
    expect(codes(draftFaults({ status: "IN_PREPARATION", versions: 1 }))).toEqual(["VERSIONED"]);
    expect(codes(draftFaults({ status: "STAMPED", versions: 0 }))).toEqual(["NOT_IN_PREPARATION"]);
    expect(codes(draftFaults({ status: "CANCELLED", versions: 0 }))).toEqual(["CANCELLED"]);
  });
  it("a correction needs a version, a reason and a change, and leaves the baseline complete", () => {
    const ok = { status: "STAMPED" as const, versions: 2, reason: "Provisional sums restated by the Appendix's erratum.", changed: 1, baselineBlocks: 0 };
    expect(correctionFaults(ok)).toEqual([]);
    expect(codes(correctionFaults({ ...ok, versions: 0, reason: "", changed: 0 }))).toEqual(["NO_VERSION", "REASON_REQUIRED", "NOTHING_CHANGED"]);
    expect(codes(correctionFaults({ ...ok, status: "CANCELLED" }))).toEqual(["CANCELLED"]);
  });
});
