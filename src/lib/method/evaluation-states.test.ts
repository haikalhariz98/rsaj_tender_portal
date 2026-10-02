import { describe, expect, it } from "vitest";

import { exerciseAllowsBq } from "@/lib/scope/bq";
import { exerciseAllowsEstimate } from "@/lib/scope/estimate";
import { exerciseAllowsPanel } from "@/lib/scope/panel";
import { isPublishedStatus } from "@/lib/bids/types";
import { exerciseFrozen } from "@/lib/documents/attach";
import { nameRequestFault } from "@/lib/method/approval";
import { windowEditFault } from "@/lib/window/edit";
import { inviteeEditFault } from "@/lib/window/invitees";
import { isPublished, windowPhase } from "@/lib/window/phase";
import { cancelFaults } from "@/lib/window/change";

import { EXERCISE_TRANSITIONS, transitionFault } from "./exercise";
import { EXERCISE_STATUS_LABEL, EXERCISE_STATUS_ORDER, findingText } from "./labels";

/**
 * 6.8 (X-8, OD-3 A): the evaluation's two stored states, decided everywhere. Opened → under
 * evaluation only by starting it on the pinned model; under evaluation → evaluated only by issuing
 * the report; evaluated → under evaluation only by a new version (a loop or a supplementary
 * opening). Cancelling from either is the window-change route's (E-10). Clarification, negotiation
 * and the committee stages are derived, never stored.
 */

const today = "2026-10-02";
const codes = (fs: { code: string }[]) => fs.map((f) => f.code);

describe("only their acts make them (§7.3.2)", () => {
  it("opened → under evaluation only by starting the evaluation, with nothing blocking", () => {
    expect(transitionFault("OPENED", "UNDER_EVALUATION", { today, via: "EVALUATION_STARTED", startFaults: 0 })).toEqual([]);
    expect(codes(transitionFault("OPENED", "UNDER_EVALUATION", { today, via: "EVALUATION_STARTED", startFaults: 1 }))).toEqual(["EVALUATION_NOT_READY"]);
    expect(codes(transitionFault("OPENED", "UNDER_EVALUATION", { today, via: "EVALUATION_STARTED" }))).toEqual(["EVALUATION_NOT_READY"]);
    expect(codes(transitionFault("OPENED", "UNDER_EVALUATION", { today, startFaults: 0 }))).toEqual(["NOT_BY_THIS_ACT"]);
    expect(codes(transitionFault("OPENING_IN_PROGRESS", "UNDER_EVALUATION", { today, via: "EVALUATION_STARTED", startFaults: 0 }))).toEqual(["NOT_ALLOWED"]);
    expect(findingText({ code: "NOT_BY_THIS_ACT", level: "block", data: { act: "EVALUATION_STARTED" } })).toMatch(/Evaluation tab/);
  });

  it("under evaluation → evaluated only by issuing the report", () => {
    expect(transitionFault("UNDER_EVALUATION", "EVALUATED", { today, via: "REPORT_ISSUED", reportFaults: 0 })).toEqual([]);
    expect(codes(transitionFault("UNDER_EVALUATION", "EVALUATED", { today, via: "REPORT_ISSUED", reportFaults: 3 }))).toEqual(["REPORT_NOT_READY"]);
    expect(codes(transitionFault("OPENED", "EVALUATED", { today, via: "REPORT_ISSUED", reportFaults: 0 }))).toEqual(["NOT_ALLOWED"]);
  });

  it("evaluated → under evaluation only by a new version", () => {
    expect(transitionFault("EVALUATED", "UNDER_EVALUATION", { today, via: "EVALUATION_REOPENED" })).toEqual([]);
    expect(codes(transitionFault("EVALUATED", "UNDER_EVALUATION", { today, via: "EVALUATION_STARTED", startFaults: 0 }))).toEqual(["NOT_BY_THIS_ACT"]);
  });

  it("cancelling either is the window-change route's (E-10)", () => {
    expect(EXERCISE_TRANSITIONS.UNDER_EVALUATION).toEqual(["EVALUATED", "CANCELLED"]);
    expect(EXERCISE_TRANSITIONS.EVALUATED).toEqual(["UNDER_EVALUATION", "CANCELLED"]);
    for (const from of ["UNDER_EVALUATION", "EVALUATED"] as const) {
      expect(transitionFault(from, "CANCELLED", { today, via: "WINDOW_CANCELLATION", reason: "No bid can be recommended" })).toEqual([]);
      expect(codes(transitionFault(from, "CANCELLED", { today, reason: "No bid can be recommended" }))).toEqual(["NOT_BY_THIS_ACT"]);
      expect(cancelFaults({ status: from, reason: "No bid can be recommended", feeRefund: false, changePending: false, awardStands: null, today })).toEqual([]);
    }
  });

  it("they read as words, in order, after the opening's", () => {
    expect(EXERCISE_STATUS_LABEL.UNDER_EVALUATION).toBe("Under evaluation");
    expect(EXERCISE_STATUS_LABEL.EVALUATED).toBe("Evaluated");
    expect(EXERCISE_STATUS_ORDER.indexOf("UNDER_EVALUATION")).toBe(EXERCISE_STATUS_ORDER.indexOf("OPENED") + 1);
  });
});

describe("under evaluation and evaluated, the exercise still reads as published (X-8)", () => {
  const W = { purchaseFromDay: new Date("2026-10-21T00:00:00Z"), purchaseCloseDay: new Date("2026-11-10T00:00:00Z"), closingAt: new Date("2026-11-17T06:30:00Z") };
  it.each(["UNDER_EVALUATION", "EVALUATED"] as const)("%s: the window is CLOSED, the pack, bill and lists frozen", (status) => {
    expect(isPublished(status)).toBe(true);
    expect(isPublishedStatus(status)).toBe(true);
    expect(windowPhase({ status, ...W }, new Date("2026-11-18T01:00:00Z"), "Asia/Kuala_Lumpur").phase).toBe("CLOSED");
    expect(exerciseAllowsBq(status)).toBe("PACK_FROZEN");
    expect(exerciseAllowsPanel(status)).toBe("PACK_FROZEN");
    expect(exerciseAllowsEstimate(status)).toBe("OPEN");
    expect(windowEditFault(status, "TENDER")?.code).toBe("WINDOW_PUBLISHED");
    expect(inviteeEditFault(status)?.code).toBe("LIST_FROZEN");
    expect(exerciseFrozen(status)).toBe(false);
    expect(nameRequestFault(status, null, [], today)?.code).toBe("NAME_LIST_FROZEN");
  });
});
