import { describe, expect, it } from "vitest";

import { documentWipePlan, onDemoSide, removedWithDemo, type PlanAttachment, type PlanDocument, type WipeSide } from "./demo-wipe-plan";

/**
 * Review must-fix 3: the demo wipe judges documents after it knows which records
 * --remove-dependents removes with the demo, so a screen-made award (not demo data, on a
 * demo exercise) with return scans attached is wiped instead of refused for ever.
 */

const isDemo = (id: string) => id.startsWith("demo_");
const side = (x: Partial<WipeSide> = {}): WipeSide => ({ isDemo, removedExerciseIds: new Set(), removedAwardIds: new Set(), ...x });
const on = (owner: Partial<PlanAttachment>, id = "att", purpose: PlanAttachment["purpose"] = "ACCEPTANCE_PAGE"): PlanAttachment => ({ id, purpose, meetingId: null, exerciseId: null, awardId: null, delegationId: null, ...owner });
const doc = (id: string, attachments: PlanAttachment[], namesDemoPerson = false): PlanDocument => ({ id, title: `Title of ${id}`, namesDemoPerson, versions: [{ id: `${id}v1`, sha256: "a".repeat(64), attachments }], holds: [] });

// The case the review found: an award raised through the screens on a demo exercise
// (cm_award1, not demo data, so --remove-dependents removes it), its acceptance page and
// declaration scanned and attached, recorded on behalf of a demo person.
const screenAward = "cm_award1";
const scans = doc("cm_doc1", [on({ awardId: screenAward }, "cm_att1", "ACCEPTANCE_PAGE"), on({ awardId: screenAward }, "cm_att2", "DECLARATION")], true);
const hangingAward = side({ removedAwardIds: new Set([screenAward]) });

describe("which side of the wipe a record is on", () => {
  it("demo data, or a record --remove-dependents removes with it, is the demo's; anything else is real", () => {
    expect(onDemoSide(on({ awardId: "demo_aw5" }), side())).toBe(true);
    expect(onDemoSide(on({ awardId: screenAward }), hangingAward)).toBe(true);
    expect(onDemoSide(on({ exerciseId: "cm_ex1" }), side({ removedExerciseIds: new Set(["cm_ex1"]) }))).toBe(true);
    expect(onDemoSide(on({ awardId: screenAward }), side())).toBe(false);
    expect(onDemoSide(on({ meetingId: "cm_mt1" }), hangingAward)).toBe(false);
    // An id in the other kind's set does not count: a removed award id is not a removed exercise.
    expect(onDemoSide(on({ exerciseId: screenAward }), hangingAward)).toBe(false);
    expect(onDemoSide(on({}), side())).toBe(false);
  });
});

describe("the worked case: a screen-made award with its return scans", () => {
  it("with --remove-dependents, the scans' document is removed whole and nothing is refused", () => {
    const p = documentWipePlan([scans], hangingAward, true);
    expect(p.refused).toBe(false);
    expect(p.hard).toEqual([]);
    expect(p.demoPersonDocuments.map((d) => d.id)).toEqual(["cm_doc1"]);
    expect(p.takeOff).toEqual([]);
  });
  it("without it, refused and listed — as the award itself is — and nothing removed", () => {
    const p = documentWipePlan([scans], hangingAward, false);
    expect(p.refused).toBe(true);
    expect(p.hard).toEqual([]);
    expect(p.soft).toEqual([{ kind: "DEMO_PERSON_DOCUMENT", title: "Title of cm_doc1" }]);
  });
  it("judged before the hanging award was known (the old order), it was refused for good", () => {
    const p = documentWipePlan([scans], side(), true);
    expect(p.refused).toBe(true);
    expect(p.hard).toEqual([{ kind: "DEMO_PERSON_DOCUMENT_ON_REAL_RECORD", title: "Title of cm_doc1" }]);
  });
  it("scans naming no demo person come off the award; the document is kept", () => {
    const p = documentWipePlan([{ ...scans, namesDemoPerson: false }], hangingAward, true);
    expect(p.refused).toBe(false);
    expect(p.demoPersonDocuments).toEqual([]);
    expect(p.takeOff.map((a) => a.id)).toEqual(["cm_att1", "cm_att2"]);
    expect(documentWipePlan([{ ...scans, namesDemoPerson: false }], hangingAward, false).soft.map((l) => l.kind)).toEqual(["OTHER_DOCUMENT_ON_DEMO_RECORD", "OTHER_DOCUMENT_ON_DEMO_RECORD"]);
  });
  it("a demo document pinned to the hanging award goes with the demo, not refused", () => {
    const p = documentWipePlan([doc("demo_doc9", [on({ awardId: screenAward })])], hangingAward, false);
    expect(p.refused).toBe(false);
    expect(p.demoDocuments.map((d) => d.id)).toEqual(["demo_doc9"]);
  });
  it("the same on a hanging exercise (dossier evidence on an exercise opened on a demo requisition)", () => {
    const ex = side({ removedExerciseIds: new Set(["cm_ex1"]) });
    const p = documentWipePlan([doc("cm_doc2", [on({ exerciseId: "cm_ex1" }, "cm_att3", "DOSSIER_EVIDENCE")], true)], ex, true);
    expect(p.refused).toBe(false);
    expect(p.demoPersonDocuments.map((d) => d.id)).toEqual(["cm_doc2"]);
  });
});

describe("no partial wipe: what stays real still refuses, whatever the flag", () => {
  it("a demo document attached to a real record", () => {
    const p = documentWipePlan([doc("demo_doc1", [on({ meetingId: "real_mt1" }, "a1", "SIGNED_MINUTES")])], hangingAward, true);
    expect(p.refused).toBe(true);
    expect(p.hard).toEqual([{ kind: "DEMO_DOCUMENT_ON_REAL_RECORD", title: "Title of demo_doc1", purpose: "SIGNED_MINUTES" }]);
  });
  it("a document naming a demo person attached to a real award as well as the hanging one", () => {
    const both = doc("cm_doc3", [on({ awardId: screenAward }, "x1"), on({ awardId: "real_aw1" }, "x2")], true);
    const p = documentWipePlan([both, scans], hangingAward, true);
    expect(p.refused).toBe(true);
    expect(p.hard).toEqual([{ kind: "DEMO_PERSON_DOCUMENT_ON_REAL_RECORD", title: "Title of cm_doc3" }]);
    // Everything else is still planned, so the refusal lists it all, but nothing runs.
    expect(p.demoPersonDocuments.map((d) => d.id)).toEqual(["cm_doc1"]);
  });
  it("a detached attachment on a real record counts: removing it would cut that record's history", () => {
    const p = documentWipePlan([doc("cm_doc4", [on({ awardId: screenAward }), on({ delegationId: "real_dg1" }, "old", "HOLDER_RECOMMENDATION")], true)], hangingAward, true);
    expect(p.hard.map((l) => l.kind)).toEqual(["DEMO_PERSON_DOCUMENT_ON_REAL_RECORD"]);
  });
  it("a real document naming no demo person keeps its real attachments; only the demo-side one comes off", () => {
    const p = documentWipePlan([doc("real_doc1", [on({ awardId: "demo_aw5" }, "d1"), on({ awardId: "real_aw1" }, "r1")])], side(), true);
    expect(p.refused).toBe(false);
    expect(p.takeOff.map((a) => a.id)).toEqual(["d1"]);
  });
  it("a real document with nothing on the demo side is not touched", () => {
    const p = documentWipePlan([doc("real_doc2", [on({ awardId: "real_aw1" })])], hangingAward, false);
    expect(p).toMatchObject({ refused: false, hard: [], soft: [], demoDocuments: [], demoPersonDocuments: [], takeOff: [] });
  });
});

describe("carry D4: sittings and delegations made through the screens on demo records", () => {
  // A sitting scheduled through the screens on the demo Tender Board (cm_mt1), minuted,
  // its signed minutes recorded on behalf of a demo person; a delegation entered through
  // Users & roles between two demo people (cm_dg1), its holder's recommendation attached.
  const minutes = doc("cm_doc5", [on({ meetingId: "cm_mt1" }, "cm_att5", "SIGNED_MINUTES")], true);
  const recommendation = doc("cm_doc6", [on({ delegationId: "cm_dg1" }, "cm_att6", "HOLDER_RECOMMENDATION")], true);
  const removed = removedWithDemo(
    {
      meetings: [{ id: "cm_mt1", committeeId: "demo_c1" }, { id: "demo_mt1", committeeId: "demo_c1" }, { id: "cm_mt2", committeeId: "real_c1" }],
      delegations: [
        { id: "cm_dg1", fromPersonId: "demo_p2", toPersonId: "demo_p3" },
        { id: "cm_dg2", fromPersonId: "real_p1", toPersonId: "demo_p3" },
        { id: "cm_dg3", fromPersonId: "real_p1", toPersonId: "real_p2" },
        { id: "demo_dg1", fromPersonId: "demo_p2", toPersonId: "demo_p3" },
      ],
    },
    isDemo,
  );
  const withThem = side({ removedMeetingIds: new Set(removed.meetingIds), removedDelegationIds: new Set(removed.delegationIds) });

  it("a sitting goes with its demo committee; a delegation with a demo person at either end; demo rows and real ones are not listed", () => {
    expect(removed).toEqual({ meetingIds: ["cm_mt1"], delegationIds: ["cm_dg1", "cm_dg2"] });
  });
  it("judged without them (the old wipe), the signed minutes and the recommendation refused for good", () => {
    const p = documentWipePlan([minutes, recommendation], side(), true);
    expect(p.refused).toBe(true);
    expect(p.hard.map((l) => l.kind)).toEqual(["DEMO_PERSON_DOCUMENT_ON_REAL_RECORD", "DEMO_PERSON_DOCUMENT_ON_REAL_RECORD"]);
  });
  it("with --remove-dependents, both documents are removed whole and nothing is refused", () => {
    const p = documentWipePlan([minutes, recommendation], withThem, true);
    expect(p.refused).toBe(false);
    expect(p.hard).toEqual([]);
    expect(p.demoPersonDocuments.map((d) => d.id)).toEqual(["cm_doc5", "cm_doc6"]);
  });
  it("without it, refused and listed (the sitting and the delegation are listed by the wipe too), nothing removed", () => {
    const p = documentWipePlan([minutes, recommendation], withThem, false);
    expect(p.refused).toBe(true);
    expect(p.hard).toEqual([]);
    expect(p.soft.map((l) => l.kind)).toEqual(["DEMO_PERSON_DOCUMENT", "DEMO_PERSON_DOCUMENT"]);
  });
  it("an id in the other kind's set does not count, and a real sitting stays real", () => {
    expect(onDemoSide(on({ delegationId: "cm_mt1" }), withThem)).toBe(false);
    expect(onDemoSide(on({ meetingId: "cm_dg1" }), withThem)).toBe(false);
    expect(onDemoSide(on({ meetingId: "cm_mt2" }), withThem)).toBe(false);
    expect(onDemoSide(on({ meetingId: "cm_mt1" }), withThem)).toBe(true);
    expect(onDemoSide(on({ delegationId: "cm_dg2" }), withThem)).toBe(true);
  });
  it("the same minutes also attached to a real sitting still refuse, whatever the flag", () => {
    const both = doc("cm_doc7", [on({ meetingId: "cm_mt1" }, "y1", "SIGNED_MINUTES"), on({ meetingId: "cm_mt2" }, "y2", "SIGNED_MINUTES")], true);
    expect(documentWipePlan([both], withThem, true).hard).toEqual([{ kind: "DEMO_PERSON_DOCUMENT_ON_REAL_RECORD", title: "Title of cm_doc7" }]);
  });
});

describe("6.2: a specification panel's signed form goes with the panel's exercise", () => {
  it("a demo panel, or one the wipe removes with its exercise, is on the demo side; a real one is not", () => {
    expect(onDemoSide(on({ specificationPanelId: "demo_spp1" }), side())).toBe(true);
    expect(onDemoSide(on({ specificationPanelId: "cm_spp1" }), side({ removedPanelIds: new Set(["cm_spp1"]) }))).toBe(true);
    expect(onDemoSide(on({ specificationPanelId: "cm_spp1" }), side())).toBe(false);
  });
  it("the demo's SULIT scan on its own panel is removed with the demo, not refused", () => {
    const p = documentWipePlan([doc("demo_doc20", [on({ specificationPanelId: "demo_spp1" }, "demo_da20", "SPEC_PANEL_FORM")])], side(), false);
    expect(p).toMatchObject({ refused: false, hard: [], soft: [] });
    expect(p.demoDocuments.map((d) => d.id)).toEqual(["demo_doc20"]);
  });
});

describe("6.2 Q-3: a bill's imported file goes with the bill's exercise", () => {
  it("a demo bill version, or one the wipe removes with its exercise, is on the demo side; a real one is not", () => {
    expect(onDemoSide(on({ bqVersionId: "demo_bqv9" }), side())).toBe(true);
    expect(onDemoSide(on({ bqVersionId: "cm_bqv1" }), side({ removedBqVersionIds: new Set(["cm_bqv1"]) }))).toBe(true);
    expect(onDemoSide(on({ bqVersionId: "cm_bqv1" }), side())).toBe(false);
  });
});
