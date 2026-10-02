import { describe, expect, it } from "vitest";

import { liveSaleOf, restrictionFinding, saleFinding, type SaleFacts } from "./findings";

/** X-11 (each bidder holds a live sale), FR-DOC-009 on paper (the certificate valid on the closing day). */

const sale = (over: Partial<SaleFacts> = {}): SaleFacts => ({ partyId: "p1", voided: false, certSighted: "ORIGINAL", certValidUntil: "2026-12-31", ...over });

describe("the sale (X-11)", () => {
  it("no sale, or only a voided one → NO_LIVE_SALE", () => {
    expect(saleFinding("p1", [], "ADVERTISED", new Set())).toBe("NO_LIVE_SALE");
    expect(saleFinding("p1", [sale({ voided: true })], "ADVERTISED", new Set())).toBe("NO_LIVE_SALE");
    expect(saleFinding("p1", [sale({ voided: true }), sale()], "ADVERTISED", new Set())).toBe("LIVE_SALE");
  });
  it("invited path: a party not on the frozen list → NOT_ON_INVITEE_LIST, before its sale is asked", () => {
    expect(saleFinding("p1", [sale()], "INVITED", new Set(["p2"]))).toBe("NOT_ON_INVITEE_LIST");
    expect(saleFinding("p1", [sale()], "INVITED", new Set(["p1"]))).toBe("LIVE_SALE");
  });
  it("the live sale is the one not voided", () => expect(liveSaleOf("p1", [sale({ voided: true, certValidUntil: "2026-01-01" }), sale()])?.certValidUntil).toBe("2026-12-31"));
});

describe("the restriction (FR-DOC-009, the reading ASSUMED and shown)", () => {
  it("restricted, valid until 2026-11-16 with closing 11-17 → NOT_EVIDENCED; until 11-17 → EVIDENCED", () => {
    expect(restrictionFinding(true, sale({ certValidUntil: "2026-11-16" }), "2026-11-17")).toEqual({ finding: "NOT_EVIDENCED" });
    expect(restrictionFinding(true, sale({ certValidUntil: "2026-11-17" }), "2026-11-17")).toEqual({ finding: "EVIDENCED" });
  });
  it("NOT_SHOWN, no date or no sale → NOT_EVIDENCED", () => {
    expect(restrictionFinding(true, sale({ certSighted: "NOT_SHOWN" }), "2026-11-17")).toEqual({ finding: "NOT_EVIDENCED" });
    expect(restrictionFinding(true, sale({ certValidUntil: null }), "2026-11-17")).toEqual({ finding: "NOT_EVIDENCED" });
    expect(restrictionFinding(true, null, "2026-11-17")).toEqual({ finding: "NOT_EVIDENCED" });
  });
  it("not restricted → NOT_RESTRICTED; not answered blocks (defensive: 6.4 refused it earlier)", () => {
    expect(restrictionFinding(false, null, "2026-11-17")).toEqual({ finding: "NOT_RESTRICTED" });
    expect(restrictionFinding(null, null, "2026-11-17")).toEqual({ fault: { code: "RESTRICTION_NOT_ANSWERED", level: "block" } });
  });
});
