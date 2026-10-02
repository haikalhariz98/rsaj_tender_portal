import { describe, expect, it } from "vitest";

import { reinstatementChecklist, reinstatementFaults, suspendFaults, type ChecklistLine } from "./reinstate";
import { standing, type StandingEventFacts } from "./standing";

const codes = (fs: { code: string }[]) => fs.map((f) => f.code);
const today = "2026-10-01";
const reading = (events: StandingEventFacts[] = [], lapsed = false) => standing({ status: "REGISTERED" }, events, lapsed ? [{ typeLabel: "Tax clearance", state: "EXPIRED" }] : [], { autoSuspendOnLapse: null }, today);
const suspension: StandingEventFacts = { id: "s", kind: "SUSPEND", effectiveOn: "2026-09-01", endsOn: null, offenceNo: null, reasonLabel: "Documents not in order", reinstatesEventId: null, liftsEventId: null, flaggedDocumentIds: ["d1", "d2"] };

describe("suspending a registered supplier (FR-VND-010)", () => {
  const ctx = { today, status: "REGISTERED", registeredOn: "2026-01-10", reading: reading(), reason: { appliesTo: "SUSPEND" as const, retiredOn: null }, documentIds: ["d1", "d2"] };
  const ok = { reasonId: "r", effectiveOn: today, personActive: true, flaggedDocumentIds: ["d1"] };

  it("a reason from the list, a day not after today and not before registration, a person: suspended", () => {
    expect(suspendFaults(ok, ctx)).toEqual([]);
    expect(suspendFaults({ ...ok, effectiveOn: "2026-01-10" }, ctx)).toEqual([]);
  });

  it("refused, each naming its rule", () => {
    expect(codes(suspendFaults(ok, { ...ctx, status: "APPLICANT" }))).toEqual(["STANDING_NEEDS_REGISTRATION"]);
    expect(codes(suspendFaults(ok, { ...ctx, reading: reading([suspension]) }))).toEqual(["ALREADY_SUSPENDED"]);
    expect(codes(suspendFaults(ok, { ...ctx, reading: reading([{ ...suspension, id: "b", kind: "BLACKLIST", offenceNo: 2 }]) }))).toEqual(["ALREADY_BARRED"]);
    expect(codes(suspendFaults({ ...ok, reasonId: null }, ctx))).toEqual(["REASON_REQUIRED"]);
    expect(codes(suspendFaults(ok, { ...ctx, reason: { appliesTo: "BLACKLIST", retiredOn: null } }))).toEqual(["REASON_NOT_FOR_SUSPENSION"]);
    expect(codes(suspendFaults(ok, { ...ctx, reason: { appliesTo: "SUSPEND", retiredOn: "2026-09-30" } }))).toEqual(["REASON_RETIRED"]);
    expect(codes(suspendFaults({ ...ok, effectiveOn: "2026-10-02" }, ctx))).toEqual(["EFFECTIVE_IN_FUTURE"]);
    expect(codes(suspendFaults({ ...ok, effectiveOn: "2026-01-09" }, ctx))).toEqual(["EFFECTIVE_BEFORE_REGISTRATION"]);
    expect(codes(suspendFaults({ ...ok, effectiveOn: null, personActive: false, flaggedDocumentIds: ["x"] }, ctx))).toEqual(["EFFECTIVE_REQUIRED", "PERSON_REQUIRED", "DOCUMENT_NOT_ON_FILE"]);
    expect(codes(suspendFaults(ok, { ...ctx, today: null }))).toEqual(["TIME_ZONE_UNSET"]);
  });
});

describe("reinstating (FR-VND-010)", () => {
  const susp = reading([suspension]);
  const states: Record<string, { typeLabel: string; state: "VALID" | "EXPIRED" | "NOT_CHECKED" }> = { d1: { typeLabel: "Works board certificate", state: "VALID" }, d2: { typeLabel: "Tax clearance", state: "VALID" } };
  const checklist = reinstatementChecklist(suspension, (id) => states[id] ?? null);
  const ok = { checkedDocumentIds: ["d1", "d2"], note: "Both documents renewed and seen.", effectiveOn: today, personActive: true };

  it("one checklist line per flagged document", () => {
    expect(checklist.map((c) => c.documentId)).toEqual(["d1", "d2"]);
  });

  it("every flagged document's type standing, the checklist answered and a note: reinstated", () => {
    expect(reinstatementFaults(ok, { today, reading: susp, checklist })).toEqual([]);
  });

  it("a flagged document's type not standing is refused, listing each", () => {
    const lines: ChecklistLine[] = [{ documentId: "d1", typeLabel: "Works board certificate", state: "NOT_CHECKED" }, { documentId: "d2", typeLabel: "Tax clearance", state: "EXPIRED" }];
    expect(reinstatementFaults(ok, { today, reading: susp, checklist: lines })[0]).toEqual({ code: "FLAGGED_NOT_STANDING", level: "block", data: { types: "Works board certificate, Tax clearance" } });
  });

  it("a mandatory document expired since is refused", () => {
    expect(codes(reinstatementFaults(ok, { today, reading: reading([suspension], true), checklist }))).toEqual(["LAPSED_SINCE"]);
  });

  it("an incomplete checklist, or no note, is refused", () => {
    expect(codes(reinstatementFaults({ ...ok, checkedDocumentIds: ["d1"] }, { today, reading: susp, checklist }))).toEqual(["CHECKLIST_INCOMPLETE"]);
    expect(codes(reinstatementFaults({ ...ok, note: "  " }, { today, reading: susp, checklist }))).toEqual(["STANDING_NOTE_REQUIRED"]);
  });

  it("not suspended, or blacklisted (a blacklisting is lifted on its own route), is refused", () => {
    expect(codes(reinstatementFaults(ok, { today, reading: reading(), checklist: [] }))).toEqual(["NOT_SUSPENDED"]);
    const blacklisted = reading([{ ...suspension, id: "b", kind: "BLACKLIST", offenceNo: 1, endsOn: "2031-10-01" }]);
    expect(codes(reinstatementFaults(ok, { today, reading: blacklisted, checklist: [] }))).toEqual(["BLACKLISTED", "NOT_SUSPENDED"]);
  });

  it("the day: not after today, not before the suspension", () => {
    expect(codes(reinstatementFaults({ ...ok, effectiveOn: "2026-10-02" }, { today, reading: susp, checklist }))).toEqual(["EFFECTIVE_IN_FUTURE"]);
    expect(codes(reinstatementFaults({ ...ok, effectiveOn: "2026-08-31" }, { today, reading: susp, checklist }))).toEqual(["EFFECTIVE_BEFORE_SUSPENSION"]);
    expect(reinstatementFaults({ ...ok, effectiveOn: "2026-09-01" }, { today, reading: susp, checklist })).toEqual([]);
  });
});
