import { describe, expect, it } from "vitest";

import { ownerState } from "./attach";
import { awardFacts, delegationFacts, exerciseFacts, exerciseMethodFlags, meetingFacts } from "./owner-facts";

describe("an owner's rows, as the rules read them", () => {
  it("an exercise is frozen for dossier evidence while an award's route is open or once one is approved", () => {
    expect(ownerState("DOSSIER_EVIDENCE", exerciseFacts({ status: "DOCUMENTS_IN_PREPARATION" }, [{ status: "PENDING_APPROVAL", openAppointmentRoutes: 1 }], null))).toEqual({ state: "FROZEN", exit: "ROUTE_OPEN" });
    expect(ownerState("DOSSIER_EVIDENCE", exerciseFacts({ status: "DOCUMENTS_IN_PREPARATION" }, [{ status: "ISSUED", openAppointmentRoutes: 0 }], null))).toEqual({ state: "FROZEN", exit: "AWARD_APPROVED" });
    expect(ownerState("DOSSIER_EVIDENCE", exerciseFacts({ status: "DOCUMENTS_IN_PREPARATION" }, [{ status: "CANCELLED", openAppointmentRoutes: 0 }], null))).toEqual({ state: "OPEN" });
  });
  it("an exercise keeps what its method asked when decided, else what its configured method asks, else nothing known", () => {
    const configured = { requiresDossier: false, requiresCoordinationRecord: true };
    const decided = { v: 1, contractType: {}, method: { code: "selective_direct", nameEn: "Selective direct appointment", committee: null, flags: { requiresJustification: true, requiresProposal: false, requiresNameApproval: false, restrictedAccess: false, requiresDossier: true, requiresCoordinationRecord: false, requiresFreshSourcing: true } } };
    expect(exerciseMethodFlags(decided, configured)).toEqual({ requiresDossier: true, requiresCoordinationRecord: false });
    expect(exerciseMethodFlags(null, configured)).toEqual(configured);
    expect(exerciseMethodFlags(null, null)).toBeNull();
    expect(exerciseFacts({ status: "DRAFT" }, [], configured)).toMatchObject({ kind: "exercise", method: configured });
  });
  it("an award accepted with no scan snapshot was accepted before scans were required", () => {
    expect(awardFacts({ status: "ACCEPTED", instrumentKind: "WORK_INDENT", returnScanSnapshot: null })).toMatchObject({ scansRequired: false });
    expect(awardFacts({ status: "ACCEPTED", instrumentKind: "WORK_INDENT", returnScanSnapshot: { v: 1 } })).toMatchObject({ scansRequired: true });
    expect(awardFacts({ status: "ISSUED", instrumentKind: "WORK_INDENT", returnScanSnapshot: null })).toMatchObject({ scansRequired: true });
  });
  it("a delegation has ended once its last day has passed, not on it", () => {
    expect(delegationFacts({ effectiveTo: new Date("2026-10-16T00:00:00Z") }, "2026-10-16")).toEqual({ kind: "delegation", ended: false });
    expect(delegationFacts({ effectiveTo: new Date("2026-10-16T00:00:00Z") }, "2026-10-17")).toEqual({ kind: "delegation", ended: true });
    expect(delegationFacts({ effectiveTo: null }, "2099-01-01")).toEqual({ kind: "delegation", ended: false });
  });
  it("a sitting is open for its signed minutes only once minuted", () => {
    expect(ownerState("SIGNED_MINUTES", meetingFacts({ status: "MINUTED" }))).toEqual({ state: "OPEN" });
  });
});
