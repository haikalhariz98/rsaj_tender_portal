import { describe, expect, it } from "vitest";

import { dayToDate } from "@/lib/dates";
import { inForceOn } from "@/lib/effective";

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
  it("a delegation has ended on its end day, which is not included (65-C1, as inForceOn reads it)", () => {
    expect(delegationFacts({ effectiveTo: new Date("2026-10-16T00:00:00Z") }, "2026-10-15")).toEqual({ kind: "delegation", ended: false });
    expect(delegationFacts({ effectiveTo: new Date("2026-10-16T00:00:00Z") }, "2026-10-16")).toEqual({ kind: "delegation", ended: true });
    expect(delegationFacts({ effectiveTo: new Date("2026-10-16T00:00:00Z") }, "2026-10-17")).toEqual({ kind: "delegation", ended: true });
    expect(delegationFacts({ effectiveTo: null }, "2099-01-01")).toEqual({ kind: "delegation", ended: false });
  });
  it("a one-day delegation (From D, Ends on D+1) is in force on D only, and delegationFacts agrees with inForceOn", () => {
    const d = { effectiveFrom: dayToDate("2026-10-05"), effectiveTo: dayToDate("2026-10-06") };
    expect(inForceOn(d, dayToDate("2026-10-05"))).toBe(true);
    expect(delegationFacts(d, "2026-10-05")).toEqual({ kind: "delegation", ended: false });
    expect(inForceOn(d, dayToDate("2026-10-06"))).toBe(false);
    expect(delegationFacts(d, "2026-10-06")).toEqual({ kind: "delegation", ended: true });
    // Every day from its start: ended exactly when no longer in force.
    for (const today of ["2026-10-05", "2026-10-06", "2026-10-07", "2026-11-01"]) {
      expect(delegationFacts(d, today)).toEqual({ kind: "delegation", ended: !inForceOn(d, dayToDate(today)) });
    }
    // Not yet begun is not ended (it is scheduled, not over).
    expect(delegationFacts(d, "2026-10-04")).toEqual({ kind: "delegation", ended: false });
  });
  it("an ended delegation refuses a new holder recommendation; on its last included day it still takes one", () => {
    const d = { effectiveTo: dayToDate("2026-10-06") };
    expect(ownerState("HOLDER_RECOMMENDATION", delegationFacts(d, "2026-10-05")).state).toBe("OPEN");
    expect(ownerState("HOLDER_RECOMMENDATION", delegationFacts(d, "2026-10-06")).state).not.toBe("OPEN");
  });
  it("a sitting is open for its signed minutes only once minuted", () => {
    expect(ownerState("SIGNED_MINUTES", meetingFacts({ status: "MINUTED" }))).toEqual({ state: "OPEN" });
  });
});
