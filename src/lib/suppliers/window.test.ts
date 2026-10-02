import { describe, expect, it } from "vitest";

import { doc } from "./fixture";
import type { DocumentFacts } from "./types";
import { bestReading, windowValidity } from "./window";

/// The spec's window: advertised 3 November, closing 17 November 2026.
const W = { advertisementDay: "2026-11-03", closingDay: "2026-11-17" };
const counts = { expiryOnClosingDayCounts: true };
const cert = (o: Partial<DocumentFacts> = {}) => doc({ id: "c1", typeId: "t_works", issuedOn: "2025-11-20", ...o });

describe("validity across the window, never at a point in time (FR-VND-009)", () => {
  it("worked example: a certificate expiring 15 November fails, though it is valid on 1 October", () => {
    const c = cert({ expiresOn: "2026-11-15" });
    expect(windowValidity([c], W, counts)).toEqual({ result: "FAIL", reason: "LAPSES_BEFORE_CLOSING", data: { expiresOn: "2026-11-15", closingDay: "2026-11-17" } });
  });

  it("valid from 5 November, after the advertisement, fails", () => {
    expect(windowValidity([cert({ validFrom: "2026-11-05", expiresOn: "2027-11-04" })], W, counts)).toMatchObject({ result: "FAIL", reason: "STARTS_AFTER_ADVERTISEMENT", data: { from: "2026-11-05" } });
  });

  it("valid from the advertisement day itself, and past the closing, passes", () => {
    expect(windowValidity([cert({ validFrom: "2026-11-03", expiresOn: "2026-11-18" })], W, counts)).toEqual({ result: "PASS", reason: "COVERS_WINDOW" });
  });

  it("no expiry passes; expired before the advertisement fails", () => {
    expect(windowValidity([cert({ expiresOn: null })], W, counts).result).toBe("PASS");
    expect(windowValidity([cert({ expiresOn: "2026-11-02" })], W, counts)).toMatchObject({ result: "FAIL", reason: "EXPIRED_BEFORE_ADVERTISEMENT" });
  });

  describe("expiring on the closing day itself (OD-4, expiryOnClosingDayCounts)", () => {
    const c = cert({ expiresOn: "2026-11-17" });
    it("true: passes", () => expect(windowValidity([c], W, { expiryOnClosingDayCounts: true })).toMatchObject({ result: "PASS", reason: "COVERS_TO_CLOSING_DAY" }));
    it("false: fails", () => expect(windowValidity([c], W, { expiryOnClosingDayCounts: false })).toMatchObject({ result: "FAIL", reason: "LAPSES_ON_CLOSING_DAY" }));
    it("not set: not assessed, never a pass", () => expect(windowValidity([c], W, { expiryOnClosingDayCounts: null })).toMatchObject({ result: "NOT_ASSESSED", reason: "CLOSING_DAY_RULE_NOT_SET" }));
  });

  it("an unverified document is not assessed; nothing held, or only not in order, fails", () => {
    expect(windowValidity([cert({ expiresOn: "2027-01-01", verification: "NOT_CHECKED", verifiedOn: null })], W, counts)).toEqual({ result: "NOT_ASSESSED", reason: "UNVERIFIED" });
    expect(windowValidity([], W, counts)).toEqual({ result: "FAIL", reason: "NOT_HELD" });
    expect(windowValidity([cert({ expiresOn: "2027-01-01", verification: "NOT_IN_ORDER" })], W, counts)).toEqual({ result: "FAIL", reason: "NOT_HELD" });
  });

  it("a verified renewal carries the cover on from the day after its predecessor ends", () => {
    const old = cert({ id: "o", expiresOn: "2026-11-10" });
    const renewal = cert({ id: "r", supersedesId: "o", lodgedOn: "2026-10-20", issuedOn: "2026-11-11", expiresOn: "2027-11-10" });
    expect(windowValidity([old, renewal], W, counts).result).toBe("PASS");
    // A gap of a day breaks the cover.
    const late = { ...renewal, issuedOn: "2026-11-12" };
    expect(windowValidity([old, late], W, counts)).toMatchObject({ result: "FAIL", reason: "LAPSES_BEFORE_CLOSING" });
  });

  it("a renewal lodged and not verified may yet carry it: not assessed, not failed", () => {
    const old = cert({ id: "o", expiresOn: "2026-11-10" });
    const renewal = cert({ id: "r", supersedesId: "o", lodgedOn: "2026-10-20", issuedOn: "2026-11-11", expiresOn: "2027-11-10", verification: "NOT_CHECKED", verifiedOn: null });
    expect(windowValidity([old, renewal], W, counts)).toMatchObject({ result: "NOT_ASSESSED", reason: "RENEWAL_UNVERIFIED" });
  });

  it("recorded as not applicable fails a window that asks for it", () => {
    expect(windowValidity([cert({ notApplicable: true, expiresOn: null })], W, counts)).toEqual({ result: "FAIL", reason: "RECORDED_NOT_APPLICABLE" });
  });

  it("a window not published, or with no closing, is not assessed", () => {
    expect(windowValidity([cert({ expiresOn: "2027-01-01" })], { ...W, advertisementDay: null }, counts)).toEqual({ result: "NOT_ASSESSED", reason: "NOT_PUBLISHED" });
    expect(windowValidity([cert({ expiresOn: "2027-01-01" })], { ...W, closingDay: null }, counts)).toEqual({ result: "NOT_ASSESSED", reason: "CLOSING_NOT_SET" });
  });

  it("the best reading of several types: a pass over not assessed over a fail", () => {
    expect(bestReading([{ result: "FAIL", reason: "NOT_HELD" }, { result: "NOT_ASSESSED", reason: "UNVERIFIED" }])?.result).toBe("NOT_ASSESSED");
    expect(bestReading([{ result: "FAIL", reason: "NOT_HELD" }, { result: "PASS", reason: "COVERS_WINDOW" }])?.result).toBe("PASS");
    expect(bestReading([])).toBeNull();
  });
});
