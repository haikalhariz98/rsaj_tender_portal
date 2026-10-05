import { describe, expect, it } from "vitest";

import { EXERCISE_STATUSES } from "@/lib/method/types";

import { windowEditFault } from "./edit";
import { invitationStage } from "./stage";

describe("the Invitation tab's stage", () => {
  it("a draft has nothing to prepare yet", () => expect(invitationStage("DRAFT")).toBe("not_yet"));

  it("documents in preparation and awaiting approval show the preparation view", () => {
    expect(invitationStage("DOCUMENTS_IN_PREPARATION")).toBe("preparing");
    expect(invitationStage("PENDING_APPROVAL_FOR_TENDERING")).toBe("preparing");
  });

  it("approval for tendering and everything after, cancelled included, show the sections", () => {
    for (const s of EXERCISE_STATUSES) if (!["DRAFT", "DOCUMENTS_IN_PREPARATION", "PENDING_APPROVAL_FOR_TENDERING"].includes(s)) expect(invitationStage(s), s).toBe("live");
  });

  it("the preparation view is offered only where the server lets the window be written, and a draft only where it does not", () => {
    for (const s of EXERCISE_STATUSES) {
      const stage = invitationStage(s);
      const writable = windowEditFault(s, "TENDER") === null;
      if (stage === "preparing") expect(writable, s).toBe(true);
      if (stage === "not_yet") expect(windowEditFault(s, "TENDER")?.code, s).toBe("NOT_IN_PREPARATION");
    }
  });
});
