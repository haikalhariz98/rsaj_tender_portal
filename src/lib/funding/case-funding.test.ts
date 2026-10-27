import { describe, expect, it } from "vitest";

import { caseFunding, splitLocked } from "./case-funding";

describe("caseFunding (FS-5)", () => {
  it("the contract's own rows first", () => {
    expect(caseFunding([{ fundingSourceId: "a", sharePct: "60" }, { fundingSourceId: "b", sharePct: "40" }], "c")).toEqual({ state: "SPLIT", shares: [{ sourceId: "a", bp: 6000 }, { sourceId: "b", bp: 4000 }] });
  });
  it("otherwise the requisition's source at 100%", () => {
    expect(caseFunding([], "c")).toEqual({ state: "FROM_REQUISITION", shares: [{ sourceId: "c", bp: 10000 }] });
  });
  it("otherwise not set", () => {
    expect(caseFunding([], null)).toEqual({ state: "NOT_SET" });
  });
  it("reads a stored Decimal's text", () => {
    expect(caseFunding([{ fundingSourceId: "a", sharePct: { toString: () => "33.33" } }, { fundingSourceId: "b", sharePct: { toString: () => "66.67" } }], null)).toMatchObject({ shares: [{ bp: 3333 }, { bp: 6667 }] });
  });
});

describe("splitLocked (FS-7)", () => {
  it("is fixed once money is certified: an issued payable certificate or a supply payment", () => {
    expect(splitLocked({ issuedPayableCertificates: 0, supplyPayments: 0 })).toBe(false);
    expect(splitLocked({ issuedPayableCertificates: 1, supplyPayments: 0 })).toBe(true);
    expect(splitLocked({ issuedPayableCertificates: 0, supplyPayments: 1 })).toBe(true);
  });
});
