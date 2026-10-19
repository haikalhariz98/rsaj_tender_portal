import { describe, expect, it } from "vitest";

import type { WindowGate } from "@/lib/window/gate";

import { awardStartRefusal, type StartFacts } from "./start-gate";

/** AC-69: Start the award is offered only where the act would not refuse before it reads the form. */
const window = { phase: "CLOSED", changePending: false } as unknown as WindowGate;
const ok: StartFacts = {
  timeZoneSet: true,
  status: "EVALUATED",
  packKindSnapshot: "TENDER",
  window,
  live: null,
  opening: { applies: true, openings: [{ kind: "MAIN", sequenceNo: 1, finalised: true, scheduleScanned: true, unopenedLate: 0, estimateCopyUnexplained: false } as never], admittedEnvelopeIds: [], carriedPartyIds: new Set(["p1"]) },
  evaluation: { applies: true, pinned: true, exerciseStatus: "EVALUATED", issued: { stale: false, recommendedPartyId: "p1", price: 100n as never, period: null } },
  instrumentFault: null,
  issueInForce: true,
};

describe("awardStartRefusal", () => {
  it("offers the act when nothing before the form refuses", () => {
    expect(awardStartRefusal({ ...ok, opening: { ...ok.opening, applies: false } })).toBeNull();
  });

  // Reproduced read-only on the browser check's database (perolehan_verify_g, 2026-10-19): demo_sx21 is UNDER_EVALUATION with the evaluation gate applying, pinned, and no report issued.
  it("refuses an exercise still under evaluation, and asks no awardee", () => {
    const r = awardStartRefusal({ ...ok, status: "UNDER_EVALUATION", evaluation: { ...ok.evaluation, exerciseStatus: "UNDER_EVALUATION", issued: null }, opening: { ...ok.opening, applies: false } });
    expect(r).toMatchObject({ kind: "FINDINGS", source: "EVALUATION" });
    if (r?.kind === "FINDINGS") expect(r.findings.map((f) => f.code)).toEqual(["NOT_EVALUATED"]);
  });

  it("does not ask which tenderer the award names", () => {
    const r = awardStartRefusal({ ...ok, opening: { ...ok.opening, applies: false } });
    expect(r).toBeNull();
  });

  it("gives its refusals in the order the act does", () => {
    expect(awardStartRefusal({ ...ok, timeZoneSet: false, live: "AWD/1" })?.kind).toBe("NO_ZONE");
    expect(awardStartRefusal({ ...ok, status: "DRAFT", live: "AWD/1" })?.kind).toBe("NOT_OPEN");
    expect(awardStartRefusal({ ...ok, live: "AWD/1" })).toMatchObject({ kind: "LIVE_AWARD", message: expect.stringContaining("AWD/1") });
    const noInstrument = awardStartRefusal({ ...ok, opening: { ...ok.opening, applies: false }, instrumentFault: { code: "INSTRUMENT_NOT_SET", level: "block" }, issueInForce: false });
    expect(noInstrument).toMatchObject({ kind: "FINDINGS", source: "INSTRUMENT" });
    expect(awardStartRefusal({ ...ok, opening: { ...ok.opening, applies: false }, issueInForce: false })).toMatchObject({ kind: "FINDINGS", source: "ISSUE" });
  });
});
