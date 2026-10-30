import { describe, expect, it } from "vitest";

import { portalMoveFaultText } from "./labels";
import { portalWhere } from "./portal";
import type { MoveFault } from "./types";

describe("a contractor's refusals (3b step 4)", () => {
  const faults: MoveFault[] = [
    { code: "CONTRACT_READ_ONLY" },
    { code: "NOT_A_MOVE", from: "IN_REVIEW", to: "TO_DO" },
    { code: "MOVED_ALREADY", by: "Aisyah binti Omar", at: "2026-11-01T00:00:00Z" },
    { code: "ONLY_ASSIGNEE" },
    { code: "ONLY_RAISER_OR_LEAD" },
    { code: "ONLY_ASSIGNEE_RAISER_OR_LEAD" },
    { code: "ANSWER_NEEDED" },
    { code: "RESULT_NOT_PASSED" },
    { code: "REASON_NEEDED" },
    { code: "COMMENT_NEEDED" },
    { code: "TOO_LONG", field: "comment", max: 10000 },
    { code: "NOT_FOR_CONTRACTOR" },
  ];
  it("name nobody (not who moved it, not the lead) and no status", () => {
    for (const f of faults) {
      const words = portalMoveFaultText(f);
      expect(words, f.code).not.toContain("Aisyah");
      expect(words, f.code).not.toMatch(/\b(?:To do|In progress|In review|Done|Cancelled)\b/);
      expect(words, f.code).not.toMatch(/\bS\.O\.|lead\b/i);
    }
  });
});

describe("the portal's groups in the database's words", () => {
  it("Waiting for you is the staff view 'Waiting on the contractor'; With the organisation is open and not that; Closed is the closed statuses", () => {
    const waiting = portalWhere("WAITING_FOR_YOU");
    expect(JSON.stringify(waiting)).toContain("assignedToContractor");
    expect(JSON.stringify(portalWhere("WITH_ORG"))).toContain(JSON.stringify({ NOT: waiting }));
    expect(portalWhere("CLOSED")).toEqual({ status: { in: ["DONE", "CANCELLED"] } });
  });
});
