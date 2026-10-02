import { readFileSync } from "node:fs";

import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({ db: {} }));
vi.mock("@/lib/method/repo", () => ({ exerciseOrg: async () => null }));

import { barredSupplierWhere, inForceDocumentWhere, lapsedMandatoryWhere } from "./repo";

/**
 * Residual 1 (re-review of R-10): the Expiring and Standing lists took the first 100 suppliers by name of
 * a filter that a renewed or long-expired document kept true for ever, so a critical expiry or a barred
 * supplier beyond 100 names vanished, and the header's "suspended or blacklisted" was counted from that
 * page. Now a renewed document no longer counts, Expiring is ordered by soonest expiry, and the barred
 * count is a database count over the whole register.
 */

const T = new Date("2026-10-03T00:00:00.000Z");

describe("the document in force, as a query (residual 1)", () => {
  it("verified, applicable, and not renewed by a verified renewal already started", () => {
    expect(inForceDocumentWhere("2026-10-03")).toEqual({ verification: "VERIFIED", notApplicable: false, NOT: { renewedBy: { is: { verification: "VERIFIED", OR: [{ validFrom: null }, { validFrom: { lte: T } }] } } } });
  });
  it("a lapsed mandatory document is one in force, of a mandatory type, past its expiry day", () => {
    expect(lapsedMandatoryWhere("2026-10-03")).toMatchObject({ type: { mandatoryAtRegistration: true }, expiresOn: { lt: T }, verification: "VERIFIED" });
  });
});

describe("the barred suppliers, as the standing rule derives them (residual 1)", () => {
  it("registered, and a blacklisting, suspension or cancellation in effect on the day", () => {
    const w = barredSupplierWhere("org", "2026-10-03", null);
    expect(w).toMatchObject({ organisationId: "org", status: "REGISTERED" });
    expect(w.OR).toEqual([
      { standingEvents: { some: { kind: "BLACKLIST", effectiveOn: { lte: T }, OR: [{ endsOn: null }, { endsOn: { gt: T } }], NOT: { liftedBy: { is: { effectiveOn: { lte: T } } } } } } },
      { standingEvents: { some: { kind: "SUSPEND", effectiveOn: { lte: T }, NOT: { reinstatedBy: { is: { effectiveOn: { lte: T } } } } } } },
      { standingEvents: { some: { kind: "REGISTRATION_CANCELLED", effectiveOn: { lte: T } } } },
    ]);
  });
  it("the exclusive end: on its endsOn a first offence no longer bars (endsOn > the day)", () => {
    expect(JSON.stringify(barredSupplierWhere("org", "2026-10-03", null))).toContain(`"endsOn":{"gt":"2026-10-03T00:00:00.000Z"}`);
  });
  it("suspended on lapse counts only where the lapse rule is set to suspend", () => {
    expect(barredSupplierWhere("org", "2026-10-03", true).OR).toHaveLength(4);
    expect(barredSupplierWhere("org", "2026-10-03", false).OR).toHaveLength(3);
    expect(barredSupplierWhere("org", "2026-10-03", null).OR).toHaveLength(3);
  });
});

describe("the lists and the header (source)", () => {
  const repo = readFileSync("src/lib/suppliers/repo.ts", "utf8");
  const page = readFileSync("src/app/suppliers/page.tsx", "utf8");
  it("Expiring is ordered by each supplier's soonest expiry in force", () => {
    expect(repo).toMatch(/groupBy\(\{ by: \["supplierId"\], where: expiringDoc, _min: \{ expiresOn: true \}, orderBy: \[\{ _min: \{ expiresOn: "asc" \} \}/);
  });
  it("the header's barred count is the database count, never the page's", () => {
    expect(repo).toMatch(/barredWhere \? client\.supplier\.count\(\{ where: barredWhere \}\)/);
    expect(page).toMatch(/const barredCount = data\.barredCount;/);
    expect(page).not.toMatch(/barred\(st\.standing\)/);
  });
});
