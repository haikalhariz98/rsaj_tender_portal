import { describe, expect, it } from "vitest";

import { BID_PART_MAX_MEGABYTES, BID_PART_MEDIA_TYPES, bidPartRuleFaults, bytesFromMegabytes, megabytesFromBytes } from "./bid-part-rules";

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
