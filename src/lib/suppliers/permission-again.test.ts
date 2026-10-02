import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { permissionLive, specialPermissionFaults, type ExistingPermission, type PermissionInput } from "./permission";

/**
 * 6.15a fix R-8: a special permission its route refused could never be asked for again: every earlier one
 * counted as a duplicate. Now only a granted one, or one still on its route, does.
 */

const ask: PermissionInput = { requirementId: "rq1", relaxes: "GRADE", grantingBodyIds: [], internalApproval: true, existingClassConfirmed: true, goodRecordConfirmed: true, personActive: true };
const ctx = { today: "2026-10-02", offered: true, requirementIds: ["rq1"], bodyIds: [], existing: [] as ExistingPermission[] };
const earlier = (o: Partial<ExistingPermission>): ExistingPermission => ({ requirementId: "rq1", relaxes: "GRADE", granted: false, route: "PENDING", ...o });
const codes = (existing: ExistingPermission[]) => specialPermissionFaults(ask, { ...ctx, existing }).map((f) => f.code);

describe("asking for a special permission again (fix R-8)", () => {
  it("one refused on its route is closed: the same relaxation may be asked for again", () => {
    expect(codes([earlier({ route: "REJECTED" })])).toEqual([]);
    expect(permissionLive(earlier({ route: "REJECTED" }))).toBe(false);
  });

  it("one granted, one pending on its route, or one approved and waiting to be granted is still a duplicate", () => {
    expect(codes([earlier({ granted: true, route: "NONE" })])).toEqual(["PERMISSION_DUPLICATE"]);
    expect(codes([earlier({ route: "PENDING" })])).toEqual(["PERMISSION_DUPLICATE"]);
    expect(codes([earlier({ route: "APPROVED" })])).toEqual(["PERMISSION_DUPLICATE"]);
  });

  it("another requirement or relaxation is never a duplicate", () => {
    expect(codes([earlier({ granted: true, relaxes: "FIELD_CODE" })])).toEqual([]);
    expect(codes([earlier({ granted: true, requirementId: "rq2" })])).toEqual([]);
  });

  it("the act reads each earlier permission's grant and route (source)", () => {
    const text = readFileSync("src/app/suppliers/link-actions.ts", "utf8");
    expect(text).toMatch(/specialPermissions: \{ select: \{ requirementId: true, relaxes: true, grantedOn: true, routes: \{ select: \{ status: true, createdAt: true \} \} \} \}/);
    expect(text).toMatch(/granted: p\.grantedOn != null, route: routeState\(/);
  });
});
