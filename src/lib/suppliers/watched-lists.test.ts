import { readFileSync } from "node:fs";

import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({ db: {} }));
vi.mock("@/lib/method/repo", () => ({ exerciseOrg: async () => null }));

import { barredSupplierWhere, cancelledSupplierIds, inForceDocumentWhere, lapsedMandatoryWhere } from "./repo";

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
    const w = barredSupplierWhere("org", "2026-10-03", null, ["sup_c"]);
    expect(w).toMatchObject({ organisationId: "org", status: "REGISTERED" });
    expect(w.OR).toEqual([
      { standingEvents: { some: { kind: "BLACKLIST", effectiveOn: { lte: T }, OR: [{ endsOn: null }, { endsOn: { gt: T } }], NOT: { liftedBy: { is: { effectiveOn: { lte: T } } } } } } },
      { standingEvents: { some: { kind: "SUSPEND", effectiveOn: { lte: T }, NOT: { reinstatedBy: { is: { effectiveOn: { lte: T } } } } } } },
      // 615-C2 (stricter, flagged 6.15): a cancellation withdrawn as recorded in error does not bar. Run 0 fix round M-1
      // (faithful, flagged 6.15a): nor one ended by a later registration; the suppliers barred by a cancellation are named
      // by cancelledSupplierIds (below), which applies the standing rule itself, so the branch is their ids.
      { id: { in: ["sup_c"] } },
    ]);
  });
  it("the exclusive end: on its endsOn a first offence no longer bars (endsOn > the day)", () => {
    expect(JSON.stringify(barredSupplierWhere("org", "2026-10-03", null, []))).toContain(`"endsOn":{"gt":"2026-10-03T00:00:00.000Z"}`);
  });
  it("suspended on lapse counts only where the lapse rule is set to suspend", () => {
    expect(barredSupplierWhere("org", "2026-10-03", true, []).OR).toHaveLength(4);
    expect(barredSupplierWhere("org", "2026-10-03", false, []).OR).toHaveLength(3);
    expect(barredSupplierWhere("org", "2026-10-03", null, []).OR).toHaveLength(3);
  });
});

describe("the suppliers a cancellation bars, by the standing rule (M-1)", () => {
  const D = (d: string) => new Date(`${d}T00:00:00.000Z`);
  const rows = [
    // Cancelled from 1 Oct, registered 15 Jan 2025: stands.
    { supplierId: "a", effectiveOn: D("2026-10-01"), supplier: { registeredOn: D("2025-01-15") } },
    // Cancelled from 1 Oct, registered again 2 Oct: ended.
    { supplierId: "b", effectiveOn: D("2026-10-01"), supplier: { registeredOn: D("2026-10-02") } },
    // Cancelled from 1 Oct, registered the same day: a registration on that day is not after it, so it stands.
    { supplierId: "c", effectiveOn: D("2026-10-01"), supplier: { registeredOn: D("2026-10-01") } },
    // Registered again, then cancelled again after it: the later one stands.
    { supplierId: "b", effectiveOn: D("2026-10-03"), supplier: { registeredOn: D("2026-10-02") } },
    // No registration day recorded: never ended.
    { supplierId: "d", effectiveOn: D("2026-09-01"), supplier: { registeredOn: null } },
  ];
  it("reads live cancellations taken effect on registered suppliers, and keeps only those not ended", async () => {
    let where: unknown = null;
    const client = { standingEvent: { findMany: async (a: { where: unknown }) => ((where = a.where), rows) } };
    expect(await cancelledSupplierIds("org", "2026-10-03", client as never)).toEqual(["a", "b", "c", "d"]);
    expect(where).toEqual({ organisationId: "org", kind: "REGISTRATION_CANCELLED", withdrawnAt: null, effectiveOn: { lte: T }, supplier: { status: "REGISTERED" } });
    const ended = { standingEvent: { findMany: async () => rows.slice(1, 2) } };
    expect(await cancelledSupplierIds("org", "2026-10-03", ended as never)).toEqual([]);
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
