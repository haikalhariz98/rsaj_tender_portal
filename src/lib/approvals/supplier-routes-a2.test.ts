import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

// 6.15a (flagged against accepted 6.9, new test only): a blacklisting's route and a special permission's
// route reach the office worklist and escalate, held organisation-wide as a registration's are.
describe("the register's a2 routes on the worklist and in escalation", () => {
  const load = readFileSync("src/lib/approvals/load.ts", "utf8");
  const act = readFileSync("src/app/approvals/actions.ts", "utf8");

  it("the worklist reads both and judges their offices organisation-wide", () => {
    expect(load).toMatch(/standingRequest: \{ select:/);
    expect(load).toMatch(/specialPermission: \{ select:/);
    expect(load).toMatch(/routes\.filter\(\(r\) => r\.supplierApplication \|\| r\.standingRequest \|\| r\.specialPermission\)/);
  });

  it("escalation locks the request or the permission it changes, and reads holders organisation-wide", () => {
    expect(act).toMatch(/SELECT id FROM "StandingRequest" WHERE id = \$\{route\.standingRequestId\} FOR UPDATE/);
    expect(act).toMatch(/SELECT id FROM "SpecialPermission" WHERE id = \$\{permissionId\} FOR UPDATE/);
    expect(act).toMatch(/supplierId \|\| permissionId \? supplierHolders\(office, roster, delegations, today\)/);
  });
});
