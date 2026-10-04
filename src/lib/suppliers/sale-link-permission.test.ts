import { describe, expect, it } from "vitest";

import { awardLinkDisagrees, linkAwardFaults, linkPartyFaults, sameNumber } from "./link";
import { grantFaults, specialPermissionFaults, type PermissionInput } from "./permission";
import { saleStandingCheck, saleSupplierFacts } from "./sale";
import { standing, type StandingEventFacts } from "./standing";

const codes = (fs: { code: string }[]) => fs.map((f) => f.code);

describe("the register's checks at a sale (FR-ADV-010, OD-5)", () => {
  // Run 0 fix round (faithful, flagged 6.15a): the cancellation is now read from its own fact (`cancelled`), set to agree.
  // Run 1a (Should 1, faithful, flagged 6.15a): each fixture also states barredOtherwise as its standing implies (a blacklisting,
  // a suspension or a suspension on lapse in effect), as saleSupplierFacts reads it; every assertion unchanged.
  const active = { status: "REGISTERED", standing: "ACTIVE" as const, lapseRuleNotSet: false, cancelled: false, barredOtherwise: false };

  it("linked and in good standing: both checks clear", () => {
    expect(saleStandingCheck(active, { registerRequiredForSale: null })).toEqual({ registrationCheck: "CLEAR", suspensionCheck: "CLEAR", findings: [] });
  });

  it("linked and its registration cancelled: refused, the registration check failed", () => {
    const c = saleStandingCheck({ ...active, standing: "CANCELLED", cancelled: true }, { registerRequiredForSale: null });
    expect(c).toEqual({ registrationCheck: "FAILED", suspensionCheck: "NOT_CHECKED", findings: [{ code: "BARRED", level: "block", data: { standing: "CANCELLED" } }] });
  });

  it.each(["SUSPENDED", "SUSPENDED_ON_LAPSE", "BLACKLISTED"] as const)("linked and %s: the sale is refused, the suspension check failed", (s) => {
    const c = saleStandingCheck({ ...active, standing: s, barredOtherwise: true }, { registerRequiredForSale: null });
    expect(c).toMatchObject({ registrationCheck: "CLEAR", suspensionCheck: "FAILED" });
    expect(c.findings).toEqual([{ code: "BARRED", level: "block", data: { standing: s } }]);
  });

  it("Run 0 fix round (consider): cancelled and also blacklisted: the registration check fails too, read from the cancellation", () => {
    const c = saleStandingCheck({ ...active, standing: "BLACKLISTED", cancelled: true, barredOtherwise: true }, { registerRequiredForSale: null });
    expect(c).toEqual({ registrationCheck: "FAILED", suspensionCheck: "FAILED", findings: [{ code: "BARRED", level: "block", data: { standing: "BLACKLISTED" } }] });
    // Blacklisted alone: as before.
    expect(saleStandingCheck({ ...active, standing: "BLACKLISTED", barredOtherwise: true }, { registerRequiredForSale: null })).toMatchObject({ registrationCheck: "CLEAR", suspensionCheck: "FAILED" });
    // A cancellation alone (Run 1a, Should 1: this line once said "with a suspension beneath it", which its input never
    // carried; a suspension beneath is now its own case below, and fails the suspension check).
    expect(saleStandingCheck({ ...active, standing: "CANCELLED", cancelled: true }, { registerRequiredForSale: null })).toMatchObject({ registrationCheck: "FAILED", suspensionCheck: "NOT_CHECKED" });
  });

  it("Run 1a (Should 1, flagged 6.15a): cancelled with a suspension in effect beneath it: both checks fail, the suspension check is not left unmade", () => {
    // The reading as standing() gives it: CANCELLED ranks above SUSPENDED, the suspension still in effect.
    const ev = (id: string, kind: StandingEventFacts["kind"], effectiveOn: string): StandingEventFacts =>
      ({ id, kind, effectiveOn, endsOn: null, offenceNo: null, reasonLabel: "", reinstatesEventId: null, liftsEventId: null, flaggedDocumentIds: [], withdrawn: false, cancelledBy: kind === "REGISTRATION_CANCELLED" ? { body: "Body", reference: "R/1" } : null });
    const reading = standing({ status: "REGISTERED", registeredOn: "2026-01-05" }, [ev("s1", "SUSPEND", "2026-09-01"), ev("c1", "REGISTRATION_CANCELLED", "2026-09-10")], [], { autoSuspendOnLapse: null }, "2026-10-01");
    expect(reading.standing).toBe("CANCELLED");
    expect(reading.suspension?.id).toBe("s1");
    const c = saleStandingCheck(saleSupplierFacts("REGISTERED", reading, false), { registerRequiredForSale: null });
    expect(c).toEqual({ registrationCheck: "FAILED", suspensionCheck: "FAILED", findings: [{ code: "BARRED", level: "block", data: { standing: "CANCELLED" } }] });
    // The cancellation alone, read the same way: the suspension check stays not made.
    const alone = standing({ status: "REGISTERED", registeredOn: "2026-01-05" }, [ev("c1", "REGISTRATION_CANCELLED", "2026-09-10")], [], { autoSuspendOnLapse: null }, "2026-10-01");
    expect(saleStandingCheck(saleSupplierFacts("REGISTERED", alone, false), { registerRequiredForSale: null })).toMatchObject({ registrationCheck: "FAILED", suspensionCheck: "NOT_CHECKED" });
    // Cancelled and suspended on lapse beneath it is not reachable (CANCELLED returns before the lapse is read); a blacklisting
    // beneath a cancellation cannot be (BLACKLISTED ranks above): so the reading's blacklist and suspension are the cases.
  });

  it("linked to a supplier not registered: refused, the registration check failed", () => {
    expect(saleStandingCheck({ status: "APPLICANT", standing: "NOT_REGISTERED", lapseRuleNotSet: false, cancelled: false, barredOtherwise: false }, { registerRequiredForSale: false })).toEqual({ registrationCheck: "FAILED", suspensionCheck: "NOT_CHECKED", findings: [{ code: "SALE_NOT_REGISTERED", level: "block" }] });
  });

  it("linked, active with its lapse rule unset: clear, with the rule named", () => {
    expect(saleStandingCheck({ ...active, lapseRuleNotSet: true }, { registerRequiredForSale: null }).findings).toEqual([{ code: "LAPSE_RULE_NOT_SET", level: "warn" }]);
  });

  it("not linked: the policy decides (true refuses; not set and false keep 6.5's not checked)", () => {
    expect(saleStandingCheck(null, { registerRequiredForSale: true }).findings).toEqual([{ code: "NOT_LINKED_REGISTER_REQUIRED", level: "block" }]);
    expect(saleStandingCheck(null, { registerRequiredForSale: null })).toEqual({ registrationCheck: "NOT_CHECKED", suspensionCheck: "NOT_CHECKED", findings: [{ code: "REGISTER_RULE_NOT_SET", level: "warn" }] });
    expect(saleStandingCheck(null, { registerRequiredForSale: false }).findings).toEqual([{ code: "NOT_LINKED", level: "warn" }]);
  });
});

describe("linking a party or an award to the register (OD-9)", () => {
  const supplier = { id: "s1", registrationNo: "201001000101 (000101-A)", status: "REGISTERED" };

  it("the same number, unlinked: linked with nothing to say", () => {
    expect(linkPartyFaults({ registrationNo: "201001000101  (000101-a)", vendorId: null }, supplier, "", [])).toEqual([]);
  });

  it("a number that differs needs a reason, and stays shown as differing", () => {
    expect(codes(linkPartyFaults({ registrationNo: "999", vendorId: null }, supplier, "", []))).toEqual(["NUMBER_DIFFERS_REASON_REQUIRED"]);
    expect(linkPartyFaults({ registrationNo: "999", vendorId: null }, supplier, "The party wrote its old number.", [])).toEqual([{ code: "NUMBER_DIFFERS", level: "warn", data: { recorded: "999", register: supplier.registrationNo } }]);
  });

  it("an empty number never matches (C-7)", () => {
    expect(sameNumber("", "")).toBe(false);
    expect(codes(linkPartyFaults({ registrationNo: "", vendorId: null }, { ...supplier, registrationNo: "" }, "", []))).toEqual(["NUMBER_DIFFERS_REASON_REQUIRED"]);
  });

  it("already linked to it, or to another, is refused; no supplier chosen is refused", () => {
    expect(codes(linkPartyFaults({ registrationNo: supplier.registrationNo, vendorId: "s1" }, supplier, "", []))).toEqual(["ALREADY_LINKED"]);
    expect(codes(linkPartyFaults({ registrationNo: supplier.registrationNo, vendorId: "s2" }, supplier, "", []))).toEqual(["LINKED_ELSEWHERE"]);
    expect(codes(linkPartyFaults({ registrationNo: "x", vendorId: null }, null, "", []))).toEqual(["SUPPLIER_REQUIRED"]);
  });

  it("a supplier not registered is linked with a warning", () => {
    expect(linkPartyFaults({ registrationNo: supplier.registrationNo, vendorId: null }, { ...supplier, status: "APPLICANT" }, "", [])).toEqual([{ code: "SUPPLIER_NOT_REGISTERED", level: "warn" }]);
  });

  it("an award with a party follows the party's link; only one with no party is linked on its own", () => {
    expect(codes(linkAwardFaults({ awardeePartyId: "p1", awardeeRegistrationNo: supplier.registrationNo, vendorId: null }, supplier, ""))).toEqual(["AWARD_HAS_PARTY"]);
    expect(linkAwardFaults({ awardeePartyId: null, awardeeRegistrationNo: supplier.registrationNo, vendorId: null }, supplier, "")).toEqual([]);
    expect(awardLinkDisagrees({ awardeePartyId: "p1", vendorId: null }, "s1")).toBe(true);
    expect(awardLinkDisagrees({ awardeePartyId: "p1", vendorId: "s1" }, "s1")).toBe(false);
    expect(awardLinkDisagrees({ awardeePartyId: null, vendorId: "s9" }, "s1")).toBe(false);
  });
});

describe("special permission (FR-ADV-017)", () => {
  const ok: PermissionInput = { requirementId: "rq1", relaxes: "GRADE", grantingBodyIds: ["b1"], internalApproval: false, existingClassConfirmed: true, goodRecordConfirmed: true, personActive: true };
  const ctx = { today: "2026-10-01", offered: true, requirementIds: ["rq1"], bodyIds: ["b1"], existing: [] };

  it("offered, a requirement and what it relaxes, an authority, both confirmations: recorded", () => {
    expect(specialPermissionFaults(ok, ctx)).toEqual([]);
    expect(specialPermissionFaults({ ...ok, grantingBodyIds: [], internalApproval: true }, ctx)).toEqual([]);
  });

  it("refused where the exercise does not offer it, or its offer is not set", () => {
    expect(codes(specialPermissionFaults(ok, { ...ctx, offered: false }))).toEqual(["NOT_OFFERED"]);
    expect(codes(specialPermissionFaults(ok, { ...ctx, offered: null }))).toEqual(["OFFER_NOT_SET"]);
  });

  it("refused: either confirmation false, no authority, a body not configured, another exercise's requirement, a duplicate", () => {
    expect(codes(specialPermissionFaults({ ...ok, existingClassConfirmed: false }, ctx))).toEqual(["CLASS_NOT_CONFIRMED"]);
    expect(codes(specialPermissionFaults({ ...ok, goodRecordConfirmed: false }, ctx))).toEqual(["RECORD_NOT_CONFIRMED"]);
    expect(codes(specialPermissionFaults({ ...ok, grantingBodyIds: [] }, ctx))).toEqual(["PERMISSION_AUTHORITY_REQUIRED"]);
    expect(codes(specialPermissionFaults({ ...ok, grantingBodyIds: ["bx"] }, ctx))).toEqual(["BODY_NOT_CONFIGURED"]);
    expect(codes(specialPermissionFaults({ ...ok, requirementId: "rq9" }, ctx))).toEqual(["REQUIREMENT_NOT_ON_EXERCISE"]);
    expect(codes(specialPermissionFaults(ok, { ...ctx, existing: [{ requirementId: "rq1", relaxes: "GRADE", granted: true, route: "NONE" as const }] }))).toEqual(["PERMISSION_DUPLICATE"]);
    expect(codes(specialPermissionFaults({ ...ok, requirementId: null, relaxes: null, personActive: false }, ctx))).toEqual(["REQUIREMENT_REQUIRED", "RELAXES_REQUIRED", "PERSON_REQUIRED"]);
  });

  it("granting one that waits on its internal route: only once the route approves, on or after that day", () => {
    const g = { today: "2026-10-01", offered: true, granted: false, internalApproval: true, route: "APPROVED" as const, approvedOn: "2026-09-28" };
    expect(grantFaults({ grantedOn: "2026-09-28", personActive: true }, g)).toEqual([]);
    expect(codes(grantFaults({ grantedOn: "2026-10-01", personActive: true }, { ...g, route: "PENDING", approvedOn: null }))).toEqual(["INTERNAL_ROUTE_NOT_APPROVED"]);
    expect(codes(grantFaults({ grantedOn: "2026-09-27", personActive: true }, g))).toEqual(["GRANTED_BEFORE_APPROVAL"]);
    expect(codes(grantFaults({ grantedOn: "2026-10-02", personActive: true }, g))).toEqual(["GRANTED_IN_FUTURE"]);
    expect(codes(grantFaults({ grantedOn: "2026-10-01", personActive: true }, { ...g, granted: true }))).toEqual(["ALREADY_GRANTED"]);
    expect(codes(grantFaults({ grantedOn: "2026-10-01", personActive: true }, { ...g, offered: false }))).toEqual(["NOT_OFFERED"]);
  });
});
