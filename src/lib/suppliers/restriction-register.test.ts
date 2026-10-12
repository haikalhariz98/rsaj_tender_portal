import { describe, expect, it } from "vitest";

import { CLOSING_FAULT_WORDS, readRestrictionForClosing, readRestrictionForPurchase, restrictionReadingWords, type EvidenceDocument } from "./restriction-register";

/** Ruling 17a: a restricted tender sold online is evidenced from the supplier register. Every branch of the two readings. */

let n = 0;
const doc = (o: Partial<EvidenceDocument> = {}): EvidenceDocument => ({
  id: `d${++n}`,
  typeId: "t1",
  typeLabel: "Status certificate",
  lodgedOn: "2026-01-01",
  issuedOn: "2026-01-01",
  validFrom: "2026-01-01",
  expiresOn: "2027-12-31",
  notApplicable: false,
  verification: "VERIFIED",
  verifiedOn: "2026-01-02",
  supersedesId: null,
  reference: "STA-1",
  ...o,
});

const buy = (docs: EvidenceDocument[], o: Partial<Parameters<typeof readRestrictionForPurchase>[0]> = {}) =>
  readRestrictionForPurchase({ evidenceTypeSet: true, docs, today: "2026-10-12", closingDay: "2026-11-30", expiryOnClosingDayCounts: true, ...o });

describe("17a at the purchase: only the verified evidence document in force today counts", () => {
  it("is refused while the evidence type is not set, naming nothing else", () => {
    expect(buy([doc()], { evidenceTypeSet: false })).toEqual({ outcome: "REFUSE", reason: "EVIDENCE_TYPE_NOT_SET" });
  });
  it("is refused when none is lodged", () => {
    expect(buy([])).toEqual({ outcome: "REFUSE", reason: "NONE_LODGED" });
  });
  it("is refused when it is lodged and nobody has verified it", () => {
    expect(buy([doc({ verification: "NOT_CHECKED", verifiedOn: null })])).toEqual({ outcome: "REFUSE", reason: "NOT_VERIFIED" });
  });
  it("is refused when it was found not in order", () => {
    expect(buy([doc({ verification: "NOT_IN_ORDER" })])).toEqual({ outcome: "REFUSE", reason: "NOT_IN_ORDER" });
  });
  it("is refused when the document is recorded as not applicable, not yet valid or expired", () => {
    expect(buy([doc({ notApplicable: true })])).toEqual({ outcome: "REFUSE", reason: "NOT_APPLICABLE" });
    expect(buy([doc({ validFrom: "2026-10-13" })])).toEqual({ outcome: "REFUSE", reason: "NOT_YET_VALID" });
    expect(buy([doc({ expiresOn: "2026-10-11" })])).toEqual({ outcome: "REFUSE", reason: "EXPIRED" });
  });
  it("a renewal waiting for its check does not rescue an expired document", () => {
    const old = doc({ expiresOn: "2026-09-01" });
    const renewal = doc({ verification: "NOT_CHECKED", verifiedOn: null, supersedesId: old.id, lodgedOn: "2026-10-01" });
    expect(buy([old, renewal])).toEqual({ outcome: "REFUSE", reason: "EXPIRED" });
  });
  it("is allowed when in force through the closing day", () => {
    const d = doc();
    expect(buy([d])).toEqual({ outcome: "ALLOW", document: { id: d.id, reference: "STA-1", validFrom: "2026-01-01", expiresOn: "2027-12-31" }, lapses: null });
  });
  it("is allowed with no expiry, and when it expires today", () => {
    expect(buy([doc({ expiresOn: null })])).toMatchObject({ outcome: "ALLOW", lapses: null });
    expect(buy([doc({ expiresOn: "2026-10-12" })])).toMatchObject({ outcome: "ALLOW", lapses: { kind: "BEFORE_CLOSING", on: "2026-10-12" } });
  });
  it("is allowed with a warning when it lapses before the closing day, as the counter does", () => {
    expect(buy([doc({ expiresOn: "2026-11-15" })])).toMatchObject({ outcome: "ALLOW", lapses: { kind: "BEFORE_CLOSING", on: "2026-11-15" } });
  });
  it("on the closing day itself it follows the organisation's rule: counted, not counted, not set", () => {
    const d = doc({ expiresOn: "2026-11-30" });
    expect(buy([d], { expiryOnClosingDayCounts: true })).toMatchObject({ outcome: "ALLOW", lapses: null });
    expect(buy([d], { expiryOnClosingDayCounts: false })).toMatchObject({ outcome: "ALLOW", lapses: { kind: "ON_CLOSING_DAY_NOT_COUNTED" } });
    expect(buy([d], { expiryOnClosingDayCounts: null })).toMatchObject({ outcome: "ALLOW", lapses: { kind: "ON_CLOSING_DAY_NOT_SET" } });
  });
  it("says nothing of lapsing when the closing day is not known", () => {
    expect(buy([doc({ expiresOn: "2026-11-15" })], { closingDay: null })).toMatchObject({ outcome: "ALLOW", lapses: null });
  });
});

const open = (docs: EvidenceDocument[], o: Partial<Parameters<typeof readRestrictionForClosing>[0]> = {}) =>
  readRestrictionForClosing({ evidenceTypeSet: true, docs, closingDay: "2026-11-30", readOn: "2026-12-01", expiryOnClosingDayCounts: true, ...o });
const finding = (r: ReturnType<typeof open>) => ("reading" in r ? `${r.reading.finding}/${r.reading.reason}` : `FAULT/${r.fault}`);

describe("17a at the opening: the register's reading for the closing day", () => {
  it("an unset evidence type is a fault, never a finding", () => {
    expect(open([doc()], { evidenceTypeSet: false })).toEqual({ fault: "EVIDENCE_TYPE_NOT_SET" });
  });
  it("a verified document in force on the closing day is EVIDENCED, and the document is cited", () => {
    const d = doc();
    const r = open([d]);
    expect(r).toMatchObject({ reading: { finding: "EVIDENCED", reason: "COVERS_CLOSING_DAY", source: "SUPPLIER_REGISTER", readOn: "2026-12-01", closingDay: "2026-11-30", closingDayCounts: true, document: { id: d.id, reference: "STA-1" } } });
  });
  it("a document with no expiry is in force", () => {
    expect(finding(open([doc({ expiresOn: null })]))).toBe("EVIDENCED/COVERS_CLOSING_DAY");
  });
  it("expiring on the closing day follows expiryOnClosingDayCounts: counted, not counted, and not set is a fault", () => {
    const d = doc({ expiresOn: "2026-11-30" });
    expect(finding(open([d], { expiryOnClosingDayCounts: true }))).toBe("EVIDENCED/EXPIRES_ON_CLOSING_DAY_COUNTED");
    expect(finding(open([d], { expiryOnClosingDayCounts: false }))).toBe("NOT_EVIDENCED/EXPIRES_ON_CLOSING_DAY_NOT_COUNTED");
    expect(finding(open([d], { expiryOnClosingDayCounts: null }))).toBe("FAULT/CLOSING_DAY_RULE_NOT_SET");
  });
  it("an unset closing-day rule is not a fault where it does not decide", () => {
    expect(finding(open([doc()], { expiryOnClosingDayCounts: null }))).toBe("EVIDENCED/COVERS_CLOSING_DAY");
    expect(finding(open([doc({ expiresOn: "2026-11-01" })], { expiryOnClosingDayCounts: null }))).toBe("NOT_EVIDENCED/EXPIRED_BEFORE_CLOSING");
  });
  it("none lodged, found not in order, not applicable, not yet valid or expired: NOT_EVIDENCED", () => {
    expect(finding(open([]))).toBe("NOT_EVIDENCED/NONE_LODGED");
    expect(finding(open([doc({ verification: "NOT_IN_ORDER" })]))).toBe("NOT_EVIDENCED/NOT_IN_ORDER");
    expect(finding(open([doc({ notApplicable: true })]))).toBe("NOT_EVIDENCED/NOT_APPLICABLE");
    expect(finding(open([doc({ validFrom: "2026-12-05" })]))).toBe("NOT_EVIDENCED/NOT_YET_VALID");
    expect(finding(open([doc({ expiresOn: "2026-11-01" })]))).toBe("NOT_EVIDENCED/EXPIRED_BEFORE_CLOSING");
  });
  it("a renewal lodged by the closing day and not yet verified reads NOT_ASSESSED, whether the old document expired or none was ever verified", () => {
    const old = doc({ expiresOn: "2026-11-01" });
    const renewal = doc({ verification: "NOT_CHECKED", verifiedOn: null, supersedesId: old.id, lodgedOn: "2026-11-20", validFrom: "2026-11-02", expiresOn: "2028-01-01" });
    expect(finding(open([old, renewal]))).toBe("NOT_ASSESSED/RENEWAL_NOT_VERIFIED");
    expect(finding(open([doc({ verification: "NOT_CHECKED", verifiedOn: null, lodgedOn: "2026-11-20" })]))).toBe("NOT_ASSESSED/RENEWAL_NOT_VERIFIED");
  });
  it("NOT_ASSESSED ends when the renewal is verified (EVIDENCED) or found not in order (NOT_EVIDENCED), so the opening can finish", () => {
    const old = doc({ expiresOn: "2026-11-01" });
    const renewal = (verification: "VERIFIED" | "NOT_IN_ORDER") => doc({ verification, supersedesId: old.id, lodgedOn: "2026-11-20", validFrom: "2026-11-02", expiresOn: "2028-01-01" });
    expect(finding(open([old, renewal("VERIFIED")]))).toBe("EVIDENCED/COVERS_CLOSING_DAY");
    expect(finding(open([old, renewal("NOT_IN_ORDER")]))).toBe("NOT_EVIDENCED/EXPIRED_BEFORE_CLOSING");
  });
  it("a renewal waiting for its check does not unseat a document already in force on the closing day", () => {
    const old = doc();
    const renewal = doc({ verification: "NOT_CHECKED", verifiedOn: null, supersedesId: old.id, lodgedOn: "2026-11-20" });
    expect(finding(open([old, renewal]))).toBe("EVIDENCED/COVERS_CLOSING_DAY");
  });
  it("a document lodged after the closing day is not read: a late lodging does not rescue a bid, nor does a late renewal hold the verdict", () => {
    expect(finding(open([doc({ lodgedOn: "2026-12-01" })]))).toBe("NOT_EVIDENCED/NONE_LODGED");
    const old = doc({ expiresOn: "2026-11-01" });
    expect(finding(open([old, doc({ verification: "NOT_CHECKED", verifiedOn: null, supersedesId: old.id, lodgedOn: "2026-12-01" })]))).toBe("NOT_EVIDENCED/EXPIRED_BEFORE_CLOSING");
  });
});

describe("17a: the words", () => {
  it("say 'verified on the supplier register' and never 'sighted', for every reason", () => {
    const reasons = [
      open([doc()]),
      open([doc({ expiresOn: "2026-11-30" })]),
      open([]),
      open([doc({ verification: "NOT_IN_ORDER" })]),
      open([doc({ notApplicable: true })]),
      open([doc({ validFrom: "2026-12-05" })]),
      open([doc({ expiresOn: "2026-11-01" })]),
      open([doc({ expiresOn: "2026-11-30" })], { expiryOnClosingDayCounts: false }),
      open([doc({ verification: "NOT_CHECKED", verifiedOn: null })]),
    ];
    for (const r of reasons) {
      if (!("reading" in r)) throw new Error("expected a reading");
      const words = restrictionReadingWords(r.reading);
      expect(words).not.toMatch(/sighted|original/i);
      expect(words).not.toMatch(/[A-Z]{2,}_[A-Z_]+/);
    }
    const ok = open([doc()]);
    if ("reading" in ok) expect(restrictionReadingWords(ok.reading)).toMatch(/Verified on the supplier register: document STA-1/);
  });
  it("a configuration gap names the setting and carries no code", () => {
    for (const w of Object.values(CLOSING_FAULT_WORDS)) {
      expect(w).toMatch(/Configuration, Suppliers/);
      expect(w).not.toMatch(/[A-Z]{2,}_[A-Z_]+/);
    }
  });
});
