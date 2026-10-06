import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * 6.5 (ADR 0015, OD-12), held on the actions by a source scan (vitest has no database): the name
 * request freezes the proposed list on the route it opens, in the same act; and a name route's
 * committee step is discharged only through `nameCitationFault`, never the award's citation check.
 */

const actions = readFileSync(join(process.cwd(), "src/app/sourcing/actions.ts"), "utf8");
const fn = (name: string) => {
  const i = actions.indexOf(`export async function ${name}(`);
  expect(i, name).toBeGreaterThan(-1);
  const j = actions.indexOf("\nexport async function ", i + 10);
  return actions.slice(i, j < 0 ? undefined : j);
};

describe("requesting the name", () => {
  const body = fn("requestNameApproval");
  it("refuses with no list, and reads the list under the exercise's lock", () => {
    expect(body).toMatch(/tx\.exerciseParty\.findMany\(\{ where: \{ exerciseId: ex\.id, source: "PROPOSED_INVITEE" \}/);
    expect(body).toMatch(/nameListFault\(proposed\)/);
  });
  it("writes the list onto the route it opens, with an audit row each", () => {
    expect(body.indexOf("tx.nameRouteInvitee.create")).toBeGreaterThan(body.indexOf("tx.approvalInstance.create"));
    expect(body).toMatch(/approvalInstanceId: instance\.id/);
    expect(body).toMatch(/"NameRouteInvitee", row\.id/);
  });
});

describe("citing a committee's decision on the name's route", () => {
  // Founder, 2026-10-05: the citation moved, unchanged, to the module's route writer, the one function its act and a sitting's outcome both run.
  const writer = readFileSync(join(process.cwd(), "src/lib/method/name-route-write.ts"), "utf8");
  const body = writer.slice(writer.indexOf("export async function citeNameStep("));
  it("the act runs the route writer's citation", () => {
    expect(fn("citeNameDecision")).toMatch(/return inExercise\(id, \(tx, l\) => citeNameStep\(tx, toAuditActor\(actor\), l, stepId, decisionId\)\);/); // Phase 1b: who acted is the argument after the transaction
    expect(body.length).toBeGreaterThan(0);
  });
  it("judges the matter with nameCitationFault, not the award's exerciseCitationFault", () => {
    expect(body).toMatch(/nameCitationFault\(/);
    expect(body).not.toMatch(/exerciseCitationFault/);
  });
  it("discharges only from what the committee recorded, and a refusal goes where the committee's outcome says", () => {
    expect(body).toMatch(/committeeStepFrom\(record\)/);
    expect(body).toMatch(/rejectionOutcome\(\{ snapshot: snapshotOf\(inst\), committee: record\?\.notApproved \?\? null/);
  });
});
