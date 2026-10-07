import { describe, expect, it } from "vitest";

import { earlierRecordersOf } from "@/lib/requisition/earlier-recorders";

import { loadRecorders, recorderKey, recordersFrom, recordersOf, type RecorderRow } from "./attribution-recorders";

/**
 * Who keyed an earlier act for someone else (review of Phase 2b): the separation of duties reads it beside the slot's own person.
 */

const row = (over: Partial<RecorderRow> = {}): RecorderRow => ({ entity: "Requisition", entityId: "rq1", slot: "requestingPerson", occurrence: 1, mode: "RECORDED_ON_BEHALF", recordedByPersonId: "clerk", ...over });

describe("the recorder of an act", () => {
  it("is the officer who recorded it for someone, and nobody where the person signed it themselves", () => {
    expect(recordersFrom([row()]).get(recorderKey({ entity: "Requisition", slot: "requestingPerson", id: "rq1" }))).toBe("clerk");
    expect(recordersFrom([row({ mode: "SIGNED", recordedByPersonId: "b" })]).size).toBe(0);
  });
  it("is not a system label or a supplier's account (no person recorded it)", () => {
    expect(recordersFrom([row({ recordedByPersonId: null })]).size).toBe(0);
  });
  it("is the one in force: the latest occurrence of the slot, so an act signed again clears the earlier keyer", () => {
    expect(recordersFrom([row({ occurrence: 1 }), row({ occurrence: 2, mode: "SIGNED", recordedByPersonId: "b" })]).size).toBe(0);
    expect(recordersFrom([row({ occurrence: 1, recordedByPersonId: "first" }), row({ occurrence: 2, recordedByPersonId: "second" })]).get(recorderKey({ entity: "Requisition", slot: "requestingPerson", id: "rq1" }))).toBe("second");
  });
  it("lists the people who keyed some of these acts, once each", () => {
    const m = recordersFrom([row({ entityId: "a" }), row({ entityId: "b" }), row({ entityId: "c", recordedByPersonId: "other" })]);
    expect(recordersOf(m, "Requisition", "requestingPerson", ["a", "b", "c", "d"]).sort()).toEqual(["clerk", "other"]);
  });
});

describe("what a matter's decision reads of its earlier acts", () => {
  const fake = (rows: RecorderRow[]) => ({ actAttribution: { findMany: async () => rows }, requisitionEndorsement: { findMany: async () => [{ id: "e1" }] } }) as never;
  it("names who keyed the requisition, an endorsement and another step, each under its own heading", async () => {
    const got = await earlierRecordersOf(
      fake([
        row(),
        row({ entity: "RequisitionEndorsement", entityId: "e1", slot: "person", recordedByPersonId: "endorsementKeyer" }),
        row({ entity: "ApprovalStep", entityId: "s1", slot: "decidedBy", recordedByPersonId: "stepKeyer" }),
      ]),
      "org1",
      { requisitionId: "rq1", otherStepIds: ["s1"] },
    );
    expect(got).toEqual({ requesterRecorderIds: ["clerk"], endorsementRecorderIds: ["endorsementKeyer"], otherDeciderRecorderIds: ["stepKeyer"] });
  });
  it("reads nothing, and asks nothing, of a matter that has none of them", async () => {
    let asked = 0;
    const client = { actAttribution: { findMany: async () => { asked++; return []; } }, requisitionEndorsement: { findMany: async () => [] } } as never;
    expect(await earlierRecordersOf(client, "org1", { otherStepIds: [] })).toEqual({ requesterRecorderIds: [], endorsementRecorderIds: [], otherDeciderRecorderIds: [] });
    expect(asked).toBe(0);
    expect((await loadRecorders(client, "org1", [])).size).toBe(0);
  });
});
