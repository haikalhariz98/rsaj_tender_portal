import { describe, expect, it } from "vitest";

import { attachFault, detachFault, ownerState, purposeFits, reliedOn, type OwnerFacts } from "./attach";
import { EXIT_TEXT, documentFaultText } from "./labels";
import { openingFacts } from "./owner-facts";
import { ownerHref } from "./targets";

/**
 * 6.7 (X-6, FR-OPN-006, C-5): an opening keeps its signed schedule's scan, held SULIT, accepted
 * only once the opening is finalised (the paper carries the company estimate's row, 6.2 Q-2), and
 * stands on it: evaluation and the award read it. Frozen with a cancelled exercise.
 */

const sulit = { version: { withdrawnAt: null }, documentClass: { classification: "SULIT" as const } };
const internal = { version: { withdrawnAt: null }, documentClass: { classification: "INTERNAL" as const } };
const opening = (finalised: boolean, status: "OPENING_IN_PROGRESS" | "OPENED" | "CANCELLED" = finalised ? "OPENED" : "OPENING_IN_PROGRESS"): OwnerFacts => openingFacts({ finalisedAt: finalised ? new Date() : null, exercise: { status } });

describe("an opening as an attachment owner", () => {
  it("takes only its signed schedule, and only as SULIT", () => {
    expect(purposeFits("SIGNED_SCHEDULE", opening(true))).toBe(true);
    expect(purposeFits("WITHDRAWAL_LETTER", opening(true))).toBe(false);
    expect(attachFault({ purpose: "SIGNED_SCHEDULE", owner: opening(true), ...sulit })).toEqual([]);
    expect(attachFault({ purpose: "SIGNED_SCHEDULE", owner: opening(true), ...internal }).map((f) => f.code)).toEqual(["CLASSIFICATION_BELOW_PURPOSE"]);
  });

  it("refuses the scan before finalising, naming why (the sealed figure is on the paper)", () => {
    expect(ownerState("SIGNED_SCHEDULE", opening(false))).toEqual({ state: "NOT_READY", exit: "OPENING_NOT_FINALISED" });
    const f = attachFault({ purpose: "SIGNED_SCHEDULE", owner: opening(false), ...sulit });
    expect(f.map((x) => x.code)).toEqual(["OWNER_NOT_READY"]);
    expect(EXIT_TEXT.OPENING_NOT_FINALISED).toMatch(/company estimate/);
  });

  it("stands on its last live scan: replaced by a new version, never simply taken off", () => {
    expect(reliedOn("SIGNED_SCHEDULE", opening(true), 1)).toBe("SCHEDULE_ON_IT");
    expect(reliedOn("SIGNED_SCHEDULE", opening(true), 2)).toBeNull();
    const f = detachFault({ purpose: "SIGNED_SCHEDULE", owner: opening(true), reason: "wrong scan", reliedOn: "SCHEDULE_ON_IT" });
    expect(f.map((x) => x.code)).toEqual(["RELIED_ON"]);
    expect(documentFaultText(f[0])).toMatch(/signed schedule/);
  });

  it("is frozen with a cancelled exercise", () => {
    expect(ownerState("SIGNED_SCHEDULE", opening(true, "CANCELLED"))).toEqual({ state: "FROZEN", exit: "EXERCISE_CANCELLED" });
  });

  it("links to the exercise's schedule", () => {
    expect(ownerHref("opening", "o1", "x1")).toBe("/sourcing/x1?tab=bids&section=schedule");
  });
});

describe("the window's purposes stay open once the exercise is opened (X-8)", () => {
  const exercise = (status: "OPENING_IN_PROGRESS" | "OPENED"): OwnerFacts => ({ kind: "exercise", status, appointmentRouteOpen: false, awardApproved: false, method: null, window: { path: "ADVERTISED" } });
  it.each(["OPENING_IN_PROGRESS", "OPENED"] as const)("%s keeps attendance sheets and publication proofs", (status) => {
    expect(ownerState("ATTENDANCE_SHEET", exercise(status))).toEqual({ state: "OPEN" });
    expect(ownerState("PUBLICATION_PROOF", exercise(status))).toEqual({ state: "OPEN" });
  });
});
