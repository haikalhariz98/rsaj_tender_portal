import { describe, expect, it } from "vitest";

import { recordCancellationFaults, withdrawCancellationFaults } from "./cancellation";
import { reinstatementFaults, suspendFaults } from "./reinstate";
import { standing, type StandingEventFacts } from "./standing";

/**
 * 6.13 Part B Run 0 fix round S-1 (BD-613-105(c)): a suspension and a registration cancelled are facts from different
 * sources (the organisation's, a registration body's), so each is recorded whichever came first, and withdrawing the
 * cancellation (recorded in error) never touches the suspension. standing() ranks CANCELLED over SUSPENDED.
 *
 * Worked example, both orders: Syarikat Contoh (registered 15 Jan 2025) is suspended from 1 Oct 2026 for documents not
 * in order, and its registration is cancelled by a works board's notice WB/2026/118 from 2 Oct 2026, recorded on 3 Oct.
 * Whichever is recorded first, the other is recorded too; it reads "Registration cancelled", still showing the
 * suspension. The cancellation turns out to be another company's notice and is withdrawn: it reads "Suspended" again,
 * the suspension untouched. Reinstated meanwhile (its documents verified), it would stay cancelled.
 */

const today = "2026-10-03";
const base = { endsOn: null, offenceNo: null, reinstatesEventId: null, liftsEventId: null, withdrawn: false, cancelledBy: null } as const;
const suspension: StandingEventFacts = { ...base, id: "s", kind: "SUSPEND", effectiveOn: "2026-10-01", reasonLabel: "Documents not in order", flaggedDocumentIds: ["d1"] };
const cancellation: StandingEventFacts = { ...base, id: "c", kind: "REGISTRATION_CANCELLED", effectiveOn: "2026-10-02", reasonLabel: "", flaggedDocumentIds: [], cancelledBy: { body: "the works board", reference: "WB/2026/118" } };
const read = (events: StandingEventFacts[]) => standing({ status: "REGISTERED" }, events, [], { autoSuspendOnLapse: null }, today);

const suspendAsk = { reasonId: "r", effectiveOn: "2026-10-01", personActive: true, flaggedDocumentIds: ["d1"] };
const suspendCtx = (events: StandingEventFacts[]) => ({ today, status: "REGISTERED", registeredOn: "2025-01-15", reading: read(events), reason: { appliesTo: "SUSPEND" as const, retiredOn: null }, documentIds: ["d1"] });
const cancelAsk = { bodyId: "wb", reference: "WB/2026/118", effectiveOn: "2026-10-02", personActive: true };
const cancelCtx = (events: StandingEventFacts[]) => ({ today, status: "REGISTERED", registeredOn: "2025-01-15", reading: read(events), bodyConfigured: true });

describe("a suspension and a cancellation, recorded in either order (S-1)", () => {
  it("cancelled first, then suspended: the suspension is recorded (it was refused before S-1)", () => {
    expect(suspendFaults(suspendAsk, suspendCtx([cancellation]))).toEqual([]);
    const r = read([cancellation, suspension]);
    expect(r.standing).toBe("CANCELLED");
    expect(r.suspension?.id).toBe("s");
  });
  it("suspended first, then cancelled: the cancellation is recorded beside it", () => {
    expect(recordCancellationFaults(cancelAsk, cancelCtx([suspension]))).toEqual([]);
    const r = read([suspension, cancellation]);
    expect(r.standing).toBe("CANCELLED");
    expect(r.cancellation?.id).toBe("c");
    expect(r.suspension?.id).toBe("s");
  });
  it("the same two events read the same whichever was recorded first", () => {
    expect(read([cancellation, suspension])).toEqual(read([suspension, cancellation]));
  });
});

describe("withdrawing the cancellation never touches the suspension (both orders)", () => {
  for (const [name, events] of [["cancelled first", [cancellation, suspension]], ["suspended first", [suspension, cancellation]]] as const) {
    it(name, () => {
      expect(withdrawCancellationFaults({ reason: "Another company's notice", personActive: true }, { today, event: { kind: "REGISTRATION_CANCELLED", withdrawn: false } })).toEqual([]);
      const after = read(events.map((e) => (e.id === "c" ? { ...e, withdrawn: true } : e)));
      expect(after.standing).toBe("SUSPENDED");
      expect(after.cancellation).toBeNull();
      expect(after.suspension?.id).toBe("s");
      // The suspension is still reinstated by its own act, as before.
      expect(reinstatementFaults({ checkedDocumentIds: ["d1"], note: "Verified", effectiveOn: today, personActive: true }, { today, reading: after, checklist: [{ documentId: "d1", typeLabel: "Tax clearance", state: "VALID" }] })).toEqual([]);
    });
  }
  it("reinstated while cancelled: the suspension ends, the cancellation stands", () => {
    const reinstate: StandingEventFacts = { ...base, id: "r", kind: "REINSTATE", effectiveOn: today, reasonLabel: "", flaggedDocumentIds: [], reinstatesEventId: "s" };
    expect(reinstatementFaults({ checkedDocumentIds: ["d1"], note: "Verified", effectiveOn: today, personActive: true }, { today, reading: read([suspension, cancellation]), checklist: [{ documentId: "d1", typeLabel: "Tax clearance", state: "VALID" }] })).toEqual([]);
    const r = read([suspension, cancellation, reinstate]);
    expect(r.standing).toBe("CANCELLED");
    expect(r.suspension).toBeNull();
  });
});

describe("only a blacklisting still refuses a suspension", () => {
  it("blacklisted (with or without a cancellation): refused, naming the blacklisting", () => {
    const blacklist: StandingEventFacts = { ...base, id: "b", kind: "BLACKLIST", effectiveOn: "2026-09-24", reasonLabel: "False declaration", flaggedDocumentIds: [], offenceNo: 2 };
    for (const events of [[blacklist], [blacklist, cancellation]]) expect(suspendFaults(suspendAsk, suspendCtx(events))).toEqual([{ code: "ALREADY_BARRED", level: "block", data: { standing: "BLACKLISTED", since: "2026-09-24" } }]);
  });
});
