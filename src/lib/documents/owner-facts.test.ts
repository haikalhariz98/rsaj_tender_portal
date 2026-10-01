import { describe, expect, it } from "vitest";

import { ownerState } from "./attach";
import { awardFacts, delegationFacts, exerciseFacts, meetingFacts } from "./owner-facts";

describe("an owner's rows, as the rules read them", () => {
  it("an exercise is frozen for dossier evidence while an award's route is open or once one is approved", () => {
    expect(ownerState("DOSSIER_EVIDENCE", exerciseFacts({ status: "DOCUMENTS_IN_PREPARATION" }, [{ status: "PENDING_APPROVAL", openAppointmentRoutes: 1 }]))).toEqual({ state: "FROZEN", exit: "ROUTE_OPEN" });
    expect(ownerState("DOSSIER_EVIDENCE", exerciseFacts({ status: "DOCUMENTS_IN_PREPARATION" }, [{ status: "ISSUED", openAppointmentRoutes: 0 }]))).toEqual({ state: "FROZEN", exit: "AWARD_APPROVED" });
    expect(ownerState("DOSSIER_EVIDENCE", exerciseFacts({ status: "DOCUMENTS_IN_PREPARATION" }, [{ status: "CANCELLED", openAppointmentRoutes: 0 }]))).toEqual({ state: "OPEN" });
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
