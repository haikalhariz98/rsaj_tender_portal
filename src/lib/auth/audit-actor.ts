import type { AuditActor, StaffActor } from "./types";

/**
 * The actor an audit row is written with, from the staff actor of a request (or of a loader run). Pure, so a test can stand in for the session without the
 * database: a person signed in is a `STAFF` actor with the session and the offices they held; a loader run (`system` set) is the system, named by its label.
 */
export function auditActorOfStaff(actor: StaffActor): AuditActor {
  if (actor.system) return { kind: "SYSTEM", label: actor.system.label };
  return { kind: "STAFF", personId: actor.personId, sessionId: actor.sessionId, offices: actor.offices, sourceAddress: actor.sourceAddress };
}
