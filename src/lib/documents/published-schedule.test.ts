import { describe, expect, it } from "vitest";

import { attachFault, detachFault, ownerState, repinFault, type OwnerFacts } from "./attach";
import { documentFaultText, EXIT_TEXT, PURPOSE_LABEL } from "./labels";
import { exerciseFacts, publicationFactsOf } from "./owner-facts";
import { slotAct } from "./views";
import { PURPOSE_CLASSIFICATION, PURPOSE_OWNER } from "./types";

/**
 * Go-live R4 (product owner, 2026-10-20): the schedule of tenders the procurement office publishes on the public Results page, kept on the exercise as
 * PUBLISHED_SCHEDULE. It is attached, replaced and taken off through the store's own acts, which judge the facts below under the exercise's lock; so each
 * refusal is held here on the pure rule, in words, and the generic path is held to refuse them too (attachFault is what attachDocument runs).
 */

const P = "PUBLISHED_SCHEDULE" as const;
type Status = Parameters<typeof exerciseFacts>[0]["status"];
type Over = { status?: Status; path?: "ADVERTISED" | "INVITED" | null; award?: string | null; restricted?: boolean; finalised?: boolean; noFacts?: boolean };
const exercise = (o: Over = {}): OwnerFacts =>
  exerciseFacts(
    { status: o.status ?? "EVALUATED" },
    o.award === null ? [] : [{ status: o.award ?? "ISSUED", openAppointmentRoutes: 0 }],
    { requiresDossier: false, requiresCoordinationRecord: false },
    o.path === null ? null : { path: o.path ?? "ADVERTISED" },
    o.noFacts ? undefined : publicationFactsOf({ restricted: o.restricted ?? false, openings: [{ finalisedAt: o.finalised === false ? null : new Date("2026-10-02T00:00:00Z") }] }),
  );
const publicDoc = { version: { withdrawnAt: null }, documentClass: { classification: "PUBLIC" as const }, documentClassification: "PUBLIC" as const };
const blocks = (o: OwnerFacts, over: Partial<Parameters<typeof attachFault>[0]> = {}) => attachFault({ purpose: P, owner: o, ...publicDoc, ...over }).filter((f) => f.level === "block");
const words = (o: OwnerFacts, over: Partial<Parameters<typeof attachFault>[0]> = {}) => blocks(o, over).map(documentFaultText);

describe("what the schedule is", () => {
  it("belongs to the exercise, is read by the public, and is a purpose with words", () => {
    expect(PURPOSE_OWNER[P]).toBe("exercise");
    expect(PURPOSE_CLASSIFICATION[P]).toBe("PUBLIC");
    expect(PURPOSE_LABEL[P]).toBe("Schedule of tenders for Results");
  });
  it("is replaced by a new version, not added to", () => {
    expect(slotAct(P, 0)).toBe("UPLOAD");
    expect(slotAct(P, 1)).toBe("NEW_VERSION");
  });
});

describe("published once all of it holds", () => {
  it("an advertised exercise, not confidential, opening finalised, award issued, a Public document", () => {
    expect(ownerState(P, exercise())).toEqual({ state: "OPEN" });
    expect(blocks(exercise())).toEqual([]);
  });
  it("an accepted award counts as issued", () => {
    expect(blocks(exercise({ award: "ACCEPTED" }))).toEqual([]);
  });
});

describe("each refusal, in words", () => {
  it("the exercise is not advertised: invited, or no window", () => {
    for (const path of ["INVITED", null] as const) {
      expect(ownerState(P, exercise({ path }))).toEqual({ state: "NOT_READY", exit: "SCHEDULE_NOT_ADVERTISED" });
      expect(words(exercise({ path }))).toEqual([EXIT_TEXT.SCHEDULE_NOT_ADVERTISED]);
    }
    expect(EXIT_TEXT.SCHEDULE_NOT_ADVERTISED).toBe("The schedule of tenders is published only for an advertised exercise.");
  });
  it("the exercise is confidential", () => {
    expect(ownerState(P, exercise({ restricted: true }))).toEqual({ state: "NOT_READY", exit: "SCHEDULE_CONFIDENTIAL" });
    expect(words(exercise({ restricted: true }))).toEqual(["This exercise is confidential, so no schedule is published for it."]);
  });
  it("the exercise is cancelled", () => {
    expect(ownerState(P, exercise({ status: "CANCELLED" }))).toEqual({ state: "FROZEN", exit: "EXERCISE_CANCELLED" });
    expect(words(exercise({ status: "CANCELLED" }))).toEqual([EXIT_TEXT.EXERCISE_CANCELLED]);
  });
  it("the opening is not finalised", () => {
    expect(ownerState(P, exercise({ finalised: false }))).toEqual({ state: "NOT_READY", exit: "SCHEDULE_OPENING_NOT_FINALISED" });
    expect(words(exercise({ finalised: false }))).toEqual(["Publish the schedule once the opening is finalised."]);
  });
  it("no award has been issued: none, a draft, one awaiting approval, approved or cancelled", () => {
    for (const award of [null, "DRAFT", "PENDING_APPROVAL", "APPROVED", "CANCELLED"]) {
      expect(ownerState(P, exercise({ award })), String(award)).toEqual({ state: "NOT_READY", exit: "SCHEDULE_AWARD_NOT_ISSUED" });
      expect(words(exercise({ award })), String(award)).toEqual(["Publish the schedule once the award is issued."]);
    }
  });
  it("facts that were not read refuse, whichever they are (the rule fails closed)", () => {
    expect(ownerState(P, exercise({ noFacts: true }))).toEqual({ state: "NOT_READY", exit: "SCHEDULE_CONFIDENTIAL" });
    expect(ownerState(P, { kind: "exercise", status: "EVALUATED", appointmentRouteOpen: false, awardApproved: true, method: null, window: { path: "ADVERTISED" } }).state).toBe("NOT_READY");
  });
  it("only the first unmet fact is said, in a fixed order: advertised, confidential, opening, award", () => {
    expect(ownerState(P, exercise({ path: "INVITED", restricted: true, finalised: false, award: null }))).toMatchObject({ exit: "SCHEDULE_NOT_ADVERTISED" });
    expect(ownerState(P, exercise({ restricted: true, finalised: false, award: null }))).toMatchObject({ exit: "SCHEDULE_CONFIDENTIAL" });
    expect(ownerState(P, exercise({ finalised: false, award: null }))).toMatchObject({ exit: "SCHEDULE_OPENING_NOT_FINALISED" });
  });
});

describe("the file must be Public, and a classification is never lowered", () => {
  const internal = { documentClass: { classification: "INTERNAL" as const }, documentClassification: "INTERNAL" as const };
  it("a file held at Internal or SULIT is refused in its own words, not the 'below' words", () => {
    for (const [classification, said] of [["INTERNAL", "Internal"], ["SULIT", "SULIT"]] as const) {
      const f = blocks(exercise(), { documentClass: { classification }, documentClassification: classification });
      expect(f.map((x) => x.code)).toEqual(["NOT_PUBLIC"]);
      const text = documentFaultText(f[0]);
      expect(text).toContain(`this one is ${said}`);
      expect(text).toContain("A classification is never lowered");
      expect(text).not.toMatch(/Raise its classification/);
    }
  });
  it("a file with no classification is refused the same way, and says so", () => {
    const f = blocks(exercise(), { documentClass: { classification: null }, documentClassification: null });
    expect(f.map((x) => x.code)).toEqual(["NOT_PUBLIC"]);
    expect(documentFaultText(f[0])).toContain("not classified");
  });
  it("a document whose own classification was raised after upload is refused, whatever its class says", () => {
    expect(blocks(exercise(), { documentClass: { classification: "PUBLIC" }, documentClassification: "INTERNAL" }).map((x) => x.code)).toEqual(["NOT_PUBLIC"]);
  });
  it("another purpose's rule keeps its own words", () => {
    const f = attachFault({ purpose: "SIGNED_SCHEDULE", owner: { kind: "opening", exerciseStatus: "EVALUATED", finalised: true }, version: { withdrawnAt: null }, ...internal });
    expect(f.map((x) => x.code)).toContain("CLASSIFICATION_BELOW_PURPOSE");
  });
});

describe("one schedule, replaced and taken off", () => {
  it("a second, different document is refused where one is live; the same document is 'already attached'", () => {
    expect(blocks(exercise(), { liveOfPurpose: 1 }).map((x) => x.code)).toEqual(["SCHEDULE_IS_ONE_FILE"]);
    expect(blocks(exercise(), { liveOfPurpose: 1, alreadyAttached: true }).map((x) => x.code)).toEqual(["ALREADY_ATTACHED"]);
    expect(documentFaultText({ code: "SCHEDULE_IS_ONE_FILE", level: "block" })).toBe("The schedule is one file, already published. Use Replace for a corrected one.");
  });
  it("a new version replaces the pin where the exercise is still ready", () => {
    const to = { id: "v2", documentId: "d", withdrawnAt: null };
    expect(repinFault({ purpose: P, owner: exercise(), reason: "Corrected", attachment: { detachedAt: null, versionId: "v1", documentId: "d" }, to })).toEqual([]);
  });
  it("a replacement is refused where the exercise is no longer ready for it, in words", () => {
    const to = { id: "v2", documentId: "d", withdrawnAt: null };
    const f = repinFault({ purpose: P, owner: exercise({ restricted: true }), reason: "Corrected", attachment: { detachedAt: null, versionId: "v1", documentId: "d" }, to });
    expect(f.map((x) => x.code)).toEqual(["OWNER_NOT_READY"]);
  });
  it("withdrawing needs a reason", () => {
    const f = detachFault({ purpose: P, owner: exercise(), reason: "  ", reliedOn: null });
    expect(f.map((x) => x.code)).toEqual(["REASON_REQUIRED"]);
    expect(detachFault({ purpose: P, owner: exercise(), reason: "Published in error", reliedOn: null })).toEqual([]);
  });
  it("a published schedule can always be withdrawn, even once the exercise has become confidential or left the advertised path", () => {
    for (const o of [exercise({ restricted: true }), exercise({ path: "INVITED" }), exercise({ finalised: false }), exercise({ award: "CANCELLED" })]) {
      expect(detachFault({ purpose: P, owner: o, reason: "Withdrawn", reliedOn: null })).toEqual([]);
    }
  });
});
