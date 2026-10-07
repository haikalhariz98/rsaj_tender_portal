import { Prisma, type AuthorityMatrix } from "@/generated/prisma/client";
import { describe, expect, it } from "vitest";

import { draftFromIssue, REVISION_FRESH_COLUMNS } from "./revision";

const issue: AuthorityMatrix = {
  id: "m1",
  organisationId: "org1",
  label: "Issue 3",
  effectiveFrom: new Date("2026-01-01T00:00:00Z"),
  effectiveTo: new Date("2027-01-01T00:00:00Z"),
  issuedAt: new Date("2025-12-01T00:00:00Z"),
  boundaryValue: new Prisma.Decimal("500000.00"),
  boundaryInclusive: false,
  quotationFloor: new Prisma.Decimal("50000.00"),
  tenderFloor: new Prisma.Decimal("500000.00"),
  requisitionBoundary: new Prisma.Decimal("500000.00"),
  splittingWindowDays: 30,
  currency: "MYR",
  noRuleClause: "cl. 1",
  selfApprovalClause: null,
  absenceClause: null,
  funderOverrideClause: null,
  fundingRouteCode: "ROUTE",
  boundaryProvenance: "STATED",
  boundarySource: "Circular 4",
  issuedByPersonId: "person_who_issued",
  makersUnknownAtLanding: true,
};

describe("a revision starts from an issue", () => {
  it("carries the policy and starts again what records the source's own life: its issue, its issuer, and the flag of a landing draft", () => {
    const draft = draftFromIssue(issue, { label: "Issue 4", effectiveFrom: new Date("2027-01-01T00:00:00Z") });
    // The review of Phase 2c: the issuer was copied onto the draft, and the database refused it (an issuer needs an issue).
    expect(draft.issuedByPersonId).toBeNull();
    expect(draft.issuedAt).toBeNull();
    expect(draft.effectiveTo).toBeNull();
    expect(draft.makersUnknownAtLanding).toBe(false);
    expect(draft).not.toHaveProperty("id");
    expect(draft).toMatchObject({ label: "Issue 4", organisationId: "org1", boundaryInclusive: false, boundaryProvenance: "STATED", boundarySource: "Circular 4", fundingRouteCode: "ROUTE", noRuleClause: "cl. 1" });
    expect(draft.boundaryValue).toBe(issue.boundaryValue);
  });

  it("names its fresh columns, so that adding one to the model is a decision made here", () => {
    expect([...REVISION_FRESH_COLUMNS].sort()).toEqual(["effectiveFrom", "effectiveTo", "id", "issuedAt", "issuedByPersonId", "label", "makersUnknownAtLanding"]);
  });
});
