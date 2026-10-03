import { describe, expect, it } from "vitest";

import { attestFaults, disputeFaults, endorseFaults, entryFaults, entryState, missingDays } from "./diary";

/**
 * FR-SUP-007, 008. Worked example: possession 1 Oct 2026; today 4 Oct; entries for 1 and 3 Oct. The missing
 * day is 2 Oct (4 Oct is today, not yet missing). An entry for 2 Oct written on 4 Oct is refused without a
 * recorded exception and accepted with one.
 */

const codes = (fs: readonly { code: string }[]) => fs.map((f) => f.code);

describe("missing days", () => {
  it("from possession to yesterday, each day with no entry", () => {
    expect(missingDays("2026-10-01", "2026-10-04", new Set(["2026-10-01", "2026-10-03"]))).toEqual({ days: ["2026-10-02"], count: 1 });
  });
  it("today is not missing; nothing before possession", () => {
    expect(missingDays("2026-10-04", "2026-10-04", new Set())).toEqual({ days: [], count: 0 });
    expect(missingDays(null, "2026-10-04", new Set())).toEqual({ days: [], count: 0 });
  });
  it("capped, with the full count", () => {
    const r = missingDays("2026-01-01", "2026-12-31", new Set(), 5);
    expect(r.days).toHaveLength(5);
    expect(r.count).toBe(364);
  });
});

describe("an entry", () => {
  const ok = { possessionOn: "2026-10-01", day: "2026-10-04", today: "2026-10-04", exists: false, entry: "Excavation for the chamber.", backdatedReason: "" };
  it("today's needs no exception", () => {
    expect(entryFaults(ok)).toEqual([]);
  });
  it("an earlier day's needs a recorded exception", () => {
    expect(codes(entryFaults({ ...ok, day: "2026-10-02" }))).toEqual(["BACKDATED_NO_EXCEPTION"]);
    expect(entryFaults({ ...ok, day: "2026-10-02", backdatedReason: "Officer on medical leave; written from the site notes." })).toEqual([]);
  });
  it("one a day; not before possession, not in the future; not without words; not before possession is recorded", () => {
    expect(codes(entryFaults({ ...ok, exists: true }))).toEqual(["ALREADY_ENTERED"]);
    expect(codes(entryFaults({ ...ok, day: "2026-09-30", backdatedReason: "x" }))).toEqual(["BEFORE_POSSESSION"]);
    expect(codes(entryFaults({ ...ok, day: "2026-10-05" }))).toEqual(["FUTURE_DATE"]);
    expect(codes(entryFaults({ ...ok, entry: " " }))).toEqual(["ENTRY_REQUIRED"]);
    expect(codes(entryFaults({ ...ok, possessionOn: null }))).toEqual(["NOT_POSSESSED"]);
  });
  it("is complete only with both attestations; a disagreement is its own state", () => {
    expect(entryState({ officerAttestedOn: null, agentAttestedOn: null, disagreement: "" })).toBe("AWAITING_BOTH");
    expect(entryState({ officerAttestedOn: "2026-10-04", agentAttestedOn: null, disagreement: "" })).toBe("AWAITING_AGENT");
    expect(entryState({ officerAttestedOn: null, agentAttestedOn: "2026-10-04", disagreement: "" })).toBe("AWAITING_OFFICER");
    expect(entryState({ officerAttestedOn: "2026-10-04", agentAttestedOn: "2026-10-04", disagreement: "" })).toBe("COMPLETE");
    expect(entryState({ officerAttestedOn: "2026-10-04", agentAttestedOn: null, disagreement: "Labour count" })).toBe("DISPUTED");
  });
  it("attestations: once each, the agent named, on or after the day, never in the future", () => {
    const a = { who: "AGENT" as const, already: false, day: "2026-10-04", on: "2026-10-04", today: "2026-10-04", agentName: "Ahmad bin Ali" };
    expect(attestFaults(a)).toEqual([]);
    expect(codes(attestFaults({ ...a, agentName: "" }))).toEqual(["AGENT_NAME_REQUIRED"]);
    expect(codes(attestFaults({ ...a, already: true }))).toEqual(["ALREADY_ATTESTED"]);
    expect(codes(attestFaults({ ...a, on: "2026-10-03" }))).toEqual(["BEFORE_DAY"]);
    expect(codes(attestFaults({ ...a, on: "2026-10-05" }))).toEqual(["FUTURE_DATE"]);
  });
  it("a disagreement is recorded once, with words", () => {
    expect(codes(disputeFaults({ disagreement: "", existing: "" }))).toEqual(["DISAGREEMENT_REQUIRED"]);
    expect(codes(disputeFaults({ disagreement: "x", existing: "y" }))).toEqual(["ALREADY_DISPUTED"]);
    expect(disputeFaults({ disagreement: "x", existing: "" })).toEqual([]);
  });
});

describe("an endorsement at a visit (FR-SUP-008)", () => {
  const e = { possessionOn: "2026-10-01", visitedOn: "2026-10-04", coversFrom: "2026-10-01", coversTo: "2026-10-03", today: "2026-10-04", entriesInCover: 2 };
  it("covers days with entries, ending on or before the visit", () => {
    expect(endorseFaults(e)).toEqual([]);
    expect(codes(endorseFaults({ ...e, entriesInCover: 0 }))).toEqual(["NO_ENTRIES"]);
    expect(codes(endorseFaults({ ...e, visitedOn: "2026-10-02" }))).toEqual(["BEFORE_COVER"]);
    expect(codes(endorseFaults({ ...e, coversFrom: "2026-10-05" }))).toEqual(["COVERS_ORDER"]);
  });
});
