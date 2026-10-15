import { describe, expect, it } from "vitest";

import { BID_PART_MAX_MEGABYTES, BID_PART_MEDIA_TYPES, bidPartRuleFaults, bidRulesFrom, bytesFromMegabytes, megabytesFromBytes } from "./bid-part-rules";

const ok = { types: ["application/pdf"], megabytes: 10, openingCheck: true, openingCheckProvenance: "STATED" };

describe("a returned part's online upload rules", () => {
  it("offers only the supplier-recognised types, never markup or an archive", () => {
    expect(BID_PART_MEDIA_TYPES).toContain("application/pdf");
    for (const never of ["text/html", "image/svg+xml", "application/zip"]) expect(BID_PART_MEDIA_TYPES).not.toContain(never);
  });
  it("refuses a type the portal does not recognise, a size outside the range, and an opening check with no source", () => {
    expect(bidPartRuleFaults(ok)).toEqual([]);
    expect(bidPartRuleFaults({ ...ok, types: ["text/html"] })).toEqual(["TYPE_UNKNOWN"]);
    expect(bidPartRuleFaults({ ...ok, megabytes: 0 })).toEqual(["SIZE_NOT_VALID"]);
    expect(bidPartRuleFaults({ ...ok, megabytes: BID_PART_MAX_MEGABYTES + 1 })).toEqual(["SIZE_NOT_VALID"]);
    expect(bidPartRuleFaults({ ...ok, openingCheckProvenance: null })).toEqual(["OPENING_CHECK_PROVENANCE_REQUIRED"]);
  });
  it("leaves everything unset as it is: not set is not refused here", () => {
    expect(bidPartRuleFaults({ types: [], megabytes: null, openingCheck: null, openingCheckProvenance: null })).toEqual([]);
  });
  it("keeps the size as whole megabytes in bytes and back", () => {
    expect(bytesFromMegabytes(10)).toBe(BigInt(10485760));
    expect(megabytesFromBytes(BigInt(10485760))).toBe(10);
    expect(megabytesFromBytes(BigInt(10485761))).toBeNull();
    expect(bytesFromMegabytes(null)).toBeNull();
  });
});

describe("the rules frozen at publication (D7)", () => {
  const part = (o: Partial<Parameters<typeof bidRulesFrom>[0][number]>) => ({ id: "p1", partCode: "a", label: "Form A", sortOrder: 1, mandatory: true, returnedByBidder: true, ...o });
  const cfg = (o: Partial<Parameters<typeof bidRulesFrom>[1][number]>) => ({ code: "a", contractBasisCode: null, bidAcceptedMediaTypes: ["application/pdf"], bidMaxBytes: BigInt(1048576), openingCheck: true, ...o });

  it("builds a rule per part, in the pack's order, with the size as a decimal string", () => {
    const r = bidRulesFrom([part({ id: "p2", partCode: "b", sortOrder: 2 }), part({})], [cfg({}), cfg({ code: "b", openingCheck: false })], null)!;
    expect(r.map((x) => x.packPartId)).toEqual(["p1", "p2"]);
    expect(r[0]).toMatchObject({ maxBytes: "1048576", openingCheck: true, returnedByBidder: true });
    expect(r[1].openingCheck).toBe(false);
  });
  it("prefers the basis-specific row, and reads an unset return as not returned", () => {
    const r = bidRulesFrom([part({}), part({ id: "p3", partCode: "c", returnedByBidder: null })], [cfg({}), cfg({ contractBasisCode: "bq", bidMaxBytes: BigInt(2097152) })], "bq")!;
    expect(r[0].maxBytes).toBe("2097152");
    expect(r[1].returnedByBidder).toBe(false);
  });
  it("is null where a returned part's opening check is not set, and keeps an unset size empty so publication names it", () => {
    expect(bidRulesFrom([part({})], [cfg({ openingCheck: null })], null)).toBeNull();
    expect(bidRulesFrom([part({})], [], null)).toBeNull();
    expect(bidRulesFrom([part({})], [cfg({ bidMaxBytes: null, bidAcceptedMediaTypes: [] })], null)![0]).toMatchObject({ maxBytes: "", acceptedMediaTypes: [] });
  });
});
