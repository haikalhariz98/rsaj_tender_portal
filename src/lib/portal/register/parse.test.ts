import { describe, expect, it } from "vitest";

import type { PublicApplicationBody } from "./contract";
import { body } from "./fixture";
import { COMPANY_BOUNDS, LIST_BOUNDS, parsePublicApplication } from "./parse";

/// A body the parser reads: the fixture's, with ids of the length a server issues (a cuid is 25 characters).
const valid = (): PublicApplicationBody => {
  const b = body();
  return {
    ...b,
    documents: b.documents.map((d, i) => ({ ...d, typeId: `type0000000${i}`, valueIds: d.valueIds.map((_, j) => `value000000${i}${j}`) })),
  };
};
const parse = (v: unknown) => parsePublicApplication(JSON.parse(JSON.stringify(v)));
const refused = (v: unknown) => {
  const r = parse(v);
  return r.ok ? null : r.message;
};

describe("the public form's body is read strictly (plan 2.2)", () => {
  it("reads a body of the right shape as it is", () => {
    const r = parse(valid());
    expect(r).toEqual({ ok: true, value: valid() });
  });

  it("refuses something that is not a record, a missing key and a key that is not the shape's, at every level", () => {
    expect(refused(null)).toBeTruthy();
    expect(refused([])).toBeTruthy();
    const { noticeSha256: _n, ...missing } = valid();
    void _n;
    expect(refused(missing)).toBeTruthy();
    expect(refused({ ...valid(), supplierId: "x" })).toBeTruthy();
    expect(refused({ ...valid(), company: { ...valid().company, recordedBy: "x" } })).toBeTruthy();
    expect(refused({ ...valid(), company: { ...valid().company, address: { ...valid().company.address, country: "x" } } })).toBeTruthy();
    expect(refused({ ...valid(), creditor: { ...valid().creditor, extra: "x" } })).toBeTruthy();
    expect(refused({ ...valid(), documents: [{ ...valid().documents[0]!, verification: "VERIFIED" }] })).toBeTruthy();
    expect(refused({ ...valid(), agreements: [{ ...valid().agreements[0]!, signedBy: "x" }] })).toBeTruthy();
  });

  it("refuses a field of the wrong type", () => {
    expect(refused({ ...valid(), company: { ...valid().company, registeredName: 5 } })).toBeTruthy();
    expect(refused({ ...valid(), company: { ...valid().company, bumiputeraClaimCode: 5 } })).toBeTruthy();
    expect(refused({ ...valid(), documents: [{ ...valid().documents[0]!, notApplicable: "no" }] })).toBeTruthy();
    expect(refused({ ...valid(), agreements: [{ ...valid().agreements[0]!, confirmed: "yes" }] })).toBeTruthy();
    expect(refused({ ...valid(), documents: "none" })).toBeTruthy();
  });

  it("refuses a bad row key, a row key twice, a code twice, and an agreement twice", () => {
    expect(refused({ ...valid(), documents: [{ ...valid().documents[0]!, clientKey: "doc1" }] })).toBe("A document does not say which it is.");
    expect(refused({ ...valid(), documents: [{ ...valid().documents[0]!, clientKey: "new:../x" }] })).toBe("A document does not say which it is.");
    expect(refused({ ...valid(), documents: [{ ...valid().documents[0]!, clientKey: `new:${"a".repeat(41)}` }] })).toBeTruthy();
    expect(refused({ ...valid(), documents: [valid().documents[0]!, valid().documents[0]!] })).toBe("A document is listed twice.");
    expect(refused({ ...valid(), documents: [{ ...valid().documents[1]!, valueIds: ["value0000001", "value0000001"] }] })).toBe("A code is chosen twice on one document.");
    expect(refused({ ...valid(), agreements: [valid().agreements[0]!, valid().agreements[0]!] })).toBe("An agreement is listed twice.");
    expect(refused({ ...valid(), agreements: [{ ...valid().agreements[0]!, kind: "OTHER" }] })).toBeTruthy();
  });

  it("refuses a list past its bound and a text past its hard bound", () => {
    const rows = Array.from({ length: LIST_BOUNDS.documents + 1 }, (_, i) => ({ ...valid().documents[0]!, clientKey: `new:${i}` }));
    expect(refused({ ...valid(), documents: rows })).toBeTruthy();
    expect(refused({ ...valid(), documents: [{ ...valid().documents[0]!, valueIds: Array.from({ length: LIST_BOUNDS.valuesPerDocument + 1 }, (_, i) => `value${String(i).padStart(8, "0")}`) }] })).toBeTruthy();
    expect(refused({ ...valid(), company: { ...valid().company, registeredName: "x".repeat(COMPANY_BOUNDS.registeredName + 1) } })).toBeTruthy();
    // At its hard bound it is read, and the rules then say it is too long, beside its field.
    expect(parse({ ...valid(), company: { ...valid().company, registeredName: "x".repeat(COMPANY_BOUNDS.registeredName) } }).ok).toBe(true);
  });

  it("refuses a hash that is not a SHA-256, and reads a blank notice hash (the rules call it stale)", () => {
    expect(refused({ ...valid(), agreements: [{ ...valid().agreements[0]!, textSha256: "abc" }] })).toBeTruthy();
    expect(refused({ ...valid(), noticeSha256: "NOT-A-HASH" })).toBeTruthy();
    expect(parse({ ...valid(), noticeSha256: "" }).ok).toBe(true);
  });
});
