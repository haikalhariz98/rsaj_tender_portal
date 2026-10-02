import { describe, expect, it } from "vitest";

import { chainOrder, documentInForce, documentState, documentStates, lodgeFaults, stands, verifyFaults, type LodgeInput } from "./documents";
import { doc, TYPES } from "./fixture";

const codes = (fs: { code: string }[]) => fs.map((f) => f.code);

describe("the effective document of a type (FR-VND-002, 008)", () => {
  const old = doc({ id: "a", typeId: "t_works", expiresOn: "2026-09-30", verification: "VERIFIED" });
  const renewal = doc({ id: "b", typeId: "t_works", expiresOn: "2027-09-30", supersedesId: "a", lodgedOn: "2026-09-25", verification: "NOT_CHECKED", verifiedOn: null });

  it("a renewal lodged but not verified leaves the old one in force", () => {
    expect(documentInForce([old, renewal], "2026-09-28")?.id).toBe("a");
    const s = documentState([old, renewal], "2026-09-28");
    expect(s.state).toBe("VALID");
    expect(s.pending?.id).toBe("b");
  });

  it("worked example: old expired and new unverified reads EXPIRED, not valid", () => {
    expect(documentState([old, renewal], "2026-10-01").state).toBe("EXPIRED");
  });

  it("once the renewal is verified it is the one in force", () => {
    const verified = { ...renewal, verification: "VERIFIED" as const, verifiedOn: "2026-10-01" };
    const s = documentState([old, verified], "2026-10-01");
    expect(s).toMatchObject({ state: "VALID", effective: { id: "b" }, pending: null });
  });

  it("a document not in order is never in force", () => {
    const bad = { ...renewal, verification: "NOT_IN_ORDER" as const };
    expect(documentInForce([old, bad], "2026-09-28")?.id).toBe("a");
    expect(documentState([bad], "2026-10-01").state).toBe("NOT_IN_ORDER");
  });

  it("lodged and not checked, with nothing in force, reads 'not checked'", () => {
    expect(documentState([{ ...renewal, supersedesId: null }], "2026-10-01").state).toBe("NOT_CHECKED");
  });

  it("the expiry day itself is valid; the day after is expired", () => {
    expect(documentState([old], "2026-09-30").state).toBe("VALID");
    expect(documentState([old], "2026-10-01").state).toBe("EXPIRED");
  });

  it("valid from a later day reads 'not yet valid' until that day", () => {
    const later = doc({ id: "c", typeId: "t_works", validFrom: "2026-10-05", expiresOn: "2027-10-05" });
    expect(documentState([later], "2026-10-04").state).toBe("NOT_YET_VALID");
    expect(documentState([later], "2026-10-05").state).toBe("VALID");
  });

  it("nothing lodged is MISSING; a verified 'not applicable' stands", () => {
    expect(documentState([], "2026-10-01").state).toBe("MISSING");
    expect(documentState([doc({ id: "n", typeId: "t_supply", notApplicable: true })], "2026-10-01").state).toBe("NOT_APPLICABLE");
    expect(stands("NOT_APPLICABLE")).toBe(true);
    expect(stands("NOT_CHECKED")).toBe(false);
  });

  it("orders a chain newest first by renewal depth, not by lodging day", () => {
    const back = { ...renewal, lodgedOn: "2026-08-01" };
    expect(chainOrder([old, back]).map((d) => d.id)).toEqual(["b", "a"]);
  });

  it("a missing mandatory type is listed as MISSING; an optional type not held is not listed", () => {
    const all = Object.values(TYPES);
    const rows = documentStates(all, [doc({ id: "c1", typeId: "t_companies" })], "2026-10-01");
    expect(rows.map((r) => [r.type.id, r.state])).toEqual([
      ["t_companies", "VALID"],
      ["t_works", "MISSING"],
    ]);
  });
});

describe("lodging a document (FR-VND-002)", () => {
  const input: LodgeInput = { typeId: "t_works", reference: "CERT-1", issuingAuthority: "Works board", issuedOn: "2026-01-01", validFrom: "2026-01-01", expiresOn: "2027-01-01", notApplicable: false, values: [{ id: "g5", bodyId: "body_works", kind: "GRADE", retiredOn: null }] };
  const ctx = { today: "2026-10-01", type: TYPES.works, chain: [], renews: null, renewing: false, supplierRejected: false };

  it("a complete lodgement of a configured type is accepted", () => {
    expect(lodgeFaults(input, ctx)).toEqual([]);
  });

  it("a type whose expiry switch is not set blocks, naming the setting", () => {
    expect(codes(lodgeFaults({ ...input, typeId: "t_clearance", values: [] }, { ...ctx, type: TYPES.clearance }))).toEqual(["EXPIRES_NOT_SET"]);
  });

  it("an expiring type needs its expiry; a non-expiring type takes none", () => {
    expect(codes(lodgeFaults({ ...input, expiresOn: null }, ctx))).toEqual(["EXPIRY_REQUIRED"]);
    expect(codes(lodgeFaults({ ...input, typeId: "t_companies", values: [] }, { ...ctx, type: TYPES.companies }))).toEqual(["EXPIRY_NOT_TAKEN"]);
  });

  it("NOT_APPLICABLE needs a type that allows it, and carries nothing else", () => {
    const na = { ...input, notApplicable: true, reference: "", expiresOn: null, validFrom: null, issuedOn: null, values: [] };
    expect(codes(lodgeFaults(na, ctx))).toEqual(["NOT_APPLICABLE_NOT_ALLOWED"]);
    expect(lodgeFaults({ ...na, typeId: "t_supply" }, { ...ctx, type: TYPES.supply })).toEqual([]);
    expect(codes(lodgeFaults({ ...na, typeId: "t_clearance" }, { ...ctx, type: TYPES.clearance }))).toEqual(["NOT_APPLICABLE_NOT_SET"]);
    expect(codes(lodgeFaults({ ...na, typeId: "t_supply", reference: "X" }, { ...ctx, type: TYPES.supply }))).toEqual(["NOT_APPLICABLE_WITH_DETAILS"]);
  });

  it("values must be of the type's body and kinds", () => {
    expect(codes(lodgeFaults({ ...input, values: [{ id: "f1", bodyId: "body_supply", kind: "FIELD_CODE", retiredOn: null }] }, ctx))).toEqual(["VALUE_NOT_OF_TYPE"]);
    expect(codes(lodgeFaults({ ...input, values: [{ id: "g9", bodyId: "body_works", kind: "GRADE", retiredOn: "2026-09-01" }] }, ctx))).toEqual(["VALUE_RETIRED"]);
  });

  it("one chain per type: a second lodgement is refused, a renewal of the head is not", () => {
    const head = doc({ id: "a", typeId: "t_works", expiresOn: "2026-12-31" });
    expect(codes(lodgeFaults(input, { ...ctx, chain: [head] }))).toEqual(["ALREADY_LODGED"]);
    expect(lodgeFaults(input, { ...ctx, chain: [head], renews: head, renewing: true })).toEqual([]);
  });

  it("a renewal of one in force ends later than it; a correction of one not in order need not", () => {
    const head = doc({ id: "a", typeId: "t_works", expiresOn: "2027-01-01" });
    expect(lodgeFaults(input, { ...ctx, chain: [head], renews: head, renewing: true })).toEqual([{ code: "RENEWAL_NOT_LATER", level: "block", data: { expiresOn: "2027-01-01" } }]);
    const bad = { ...head, verification: "NOT_IN_ORDER" as const };
    expect(lodgeFaults(input, { ...ctx, chain: [bad], renews: bad, renewing: true })).toEqual([]);
  });

  it("only the latest of a chain is renewed", () => {
    const a = doc({ id: "a", typeId: "t_works", expiresOn: "2026-06-01" });
    const b = doc({ id: "b", typeId: "t_works", expiresOn: "2026-12-01", supersedesId: "a" });
    expect(codes(lodgeFaults(input, { ...ctx, chain: [a, b], renews: a, renewing: true }))).toEqual(["RENEWS_SUPERSEDED"]);
  });

  it("a retired type takes no new lodgement; issued in the future and valid-from after expiry are refused", () => {
    expect(codes(lodgeFaults(input, { ...ctx, type: { ...TYPES.works, retiredOn: "2026-10-01" } }))).toEqual(["TYPE_RETIRED"]);
    expect(codes(lodgeFaults({ ...input, issuedOn: "2026-10-02" }, ctx))).toEqual(["ISSUED_IN_FUTURE"]);
    expect(codes(lodgeFaults({ ...input, validFrom: "2027-02-01" }, ctx))).toEqual(["VALID_FROM_AFTER_EXPIRY"]);
  });

  it("no day without the organisation's time zone", () => {
    expect(codes(lodgeFaults(input, { ...ctx, today: null }))).toEqual(["TIME_ZONE_UNSET"]);
  });
});

describe("an officer's check of a document (FR-VND-004)", () => {
  const lodged = { verification: "NOT_CHECKED" as const, lodgedOn: "2026-09-20", notApplicable: false, scanned: true };
  const ok = { state: "VERIFIED" as const, personActive: true, verifiedOn: "2026-09-21", note: "" };

  it("verified by a named active person on a day between lodging and today", () => {
    expect(verifyFaults(ok, lodged, "2026-10-01")).toEqual([]);
    expect(codes(verifyFaults({ ...ok, verifiedOn: "2026-09-19" }, lodged, "2026-10-01"))).toEqual(["BEFORE_LODGED"]);
    expect(codes(verifyFaults({ ...ok, verifiedOn: "2026-10-02" }, lodged, "2026-10-01"))).toEqual(["IN_FUTURE"]);
    expect(codes(verifyFaults({ ...ok, personActive: false }, lodged, "2026-10-01"))).toEqual(["PERSON_REQUIRED"]);
  });

  it("verified needs the scan it was verified on; not applicable has nothing to scan", () => {
    expect(codes(verifyFaults(ok, { ...lodged, scanned: false }, "2026-10-01"))).toEqual(["SCAN_REQUIRED"]);
    expect(verifyFaults(ok, { ...lodged, scanned: false, notApplicable: true }, "2026-10-01")).toEqual([]);
    expect(verifyFaults({ ...ok, state: "NOT_IN_ORDER", note: "Copy unreadable" }, { ...lodged, scanned: false }, "2026-10-01")).toEqual([]);
  });

  it("not in order needs the reason", () => {
    expect(codes(verifyFaults({ ...ok, state: "NOT_IN_ORDER" }, lodged, "2026-10-01"))).toEqual(["NOTE_REQUIRED"]);
  });

  it("a checked document is not checked again", () => {
    expect(codes(verifyFaults(ok, { ...lodged, verification: "VERIFIED" }, "2026-10-01"))).toEqual(["ALREADY_CHECKED"]);
  });
});
