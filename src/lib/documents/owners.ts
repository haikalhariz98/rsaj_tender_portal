/**
 * The owners a document is attached to, each locked the way its own module locks it
 * for a write (LESSONS: re-validate on locked rows): a sitting by its Meeting row
 * (`withLockedSitting`); an exercise by its requisition, then itself
 * (`withLockedRequisitionForSourcing`); an award by requisition, exercise, award
 * (`withLockedAward`); a delegation by its own row. The owner is locked before any
 * document row, always, so two acts never take the same locks in opposite orders.
 *
 * Under the lock each adapter reads the facts `attachFault` / `detachFault` judge, and
 * the label the audit rows carry (prefixed with the owner's reference so each module's
 * History finds them).
 */

import type { Tx } from "@/lib/audit/record";
import { withLockedAward } from "@/lib/award/repo";
import { withLockedSitting } from "@/lib/committee/sittings";
import { dayToDate, storedDay } from "@/lib/dates";
import { db } from "@/lib/db";
import { requisitionOfExercise, withLockedRequisitionForSourcing } from "@/lib/method/repo";

import { awardReliance, type OwnerFacts, type Reliance } from "./attach";
import type { OwnerRef } from "./repo";
import { documentOrg } from "./service";
import type { AttachmentPurpose } from "./types";

export interface LockedOwner {
  ref: OwnerRef;
  organisationId: string;
  today: string | null;
  /// The owner as the trail and the screens name it: its reference, never an id.
  label: string;
  facts: OwnerFacts;
  /// Paths whose screens show this owner's attachments.
  paths: string[];
  /// Whether a judged record relies on an attachment of this purpose (detachFault), given
  /// how many live attachments of the purpose the owner holds, this one included.
  reliance: (purpose: AttachmentPurpose, liveOfPurpose: number) => Reliance | null;
  /// What the owner's own module does when its attachments change, in the same act
  /// (an award whose last return scan arrives is accepted). Returns a line for the officer.
  afterChange?: (tx: Tx) => Promise<string | null>;
}

/// Run `fn` with the owner locked, inside one transaction. Null when the owner does not exist.
export async function withLockedOwner<T>(ref: OwnerRef, fn: (tx: Tx, o: LockedOwner) => Promise<T>): Promise<T | null> {
  switch (ref.kind) {
    case "meeting":
      return withLockedSitting(ref.id, (tx, s) =>
        fn(tx, {
          ref,
          organisationId: s.organisationId,
          today: s.today,
          label: `${s.meeting.reference}`,
          facts: { kind: "meeting", status: s.meeting.status },
          paths: [`/committees/${ref.id}`, "/requisitions"],
          reliance: () => null,
        }),
      );
    case "exercise": {
      const requisitionId = await requisitionOfExercise(ref.id);
      if (!requisitionId) return null;
      return withLockedRequisitionForSourcing(requisitionId, ref.id, async (tx, l) => {
        if (!l.ex) return null;
        const awards = await tx.award.findMany({
          where: { exerciseId: l.ex.id },
          select: { id: true, status: true, approvalInstances: { where: { domain: "appointment", status: "PENDING" }, select: { id: true } } },
        });
        return fn(tx, {
          ref,
          organisationId: l.org.id,
          today: l.org.today,
          label: `${l.ex.reference}`,
          facts: {
            kind: "exercise",
            status: l.ex.status,
            appointmentRouteOpen: awards.some((a) => a.approvalInstances.length > 0),
            awardApproved: awards.some((a) => a.status === "APPROVED" || a.status === "ISSUED" || a.status === "ACCEPTED"),
          },
          paths: [`/sourcing/${ref.id}`, ...awards.map((a) => `/awards/${a.id}`)],
          reliance: () => null,
        });
      });
    }
    case "award":
      return withLockedAward(ref.id, (tx, l) => {
        const a = l.award;
        // OD-5: an award accepted before scans were required has no scan snapshot.
        const scansRequired = !(a.status === "ACCEPTED" && a.returnScanSnapshot == null);
        const facts: OwnerFacts = { kind: "award", status: a.status, instrumentKind: a.instrumentKind, scansRequired };
        return fn(tx, {
          ref,
          organisationId: l.org.id,
          today: l.org.today,
          label: `${a.reference}`,
          facts,
          paths: [`/awards/${a.id}`, "/awards"],
          // Only the last live scan of an item is relied on; a duplicate may come off.
          reliance: (purpose, live) => (live <= 1 ? awardReliance(purpose, facts) : null),
        });
      });
    case "delegation":
      return db.$transaction(async (tx) => {
        const org = await documentOrg(tx);
        if (!org) return null;
        await tx.$queryRaw`SELECT id FROM "Delegation" WHERE id = ${ref.id} FOR UPDATE`;
        const d = await tx.delegation.findFirst({
          where: { id: ref.id, organisationId: org.id },
          select: { id: true, effectiveTo: true, fromPerson: { select: { name: true } }, toPerson: { select: { name: true } } },
        });
        if (!d) return null;
        const today = org.today ?? storedDay(new Date());
        const ended = d.effectiveTo != null && d.effectiveTo < dayToDate(today);
        return fn(tx, {
          ref,
          organisationId: org.id,
          today: org.today,
          label: `Delegation · ${d.fromPerson.name} to ${d.toPerson.name}`,
          facts: { kind: "delegation", ended },
          paths: ["/configuration/users"],
          // OD-6: a delegation stands on its attached recommendation; the last live one is
          // replaced by a new version, never simply taken off.
          reliance: (purpose, live) => (purpose === "HOLDER_RECOMMENDATION" && live <= 1 ? "GRANTED_ON_IT" : null),
        });
      });
  }
}

/// Which owner an attachment belongs to.
export function ownerOf(a: { meetingId: string | null; exerciseId: string | null; awardId: string | null; delegationId: string | null }): OwnerRef | null {
  if (a.meetingId) return { kind: "meeting", id: a.meetingId };
  if (a.exerciseId) return { kind: "exercise", id: a.exerciseId };
  if (a.awardId) return { kind: "award", id: a.awardId };
  if (a.delegationId) return { kind: "delegation", id: a.delegationId };
  return null;
}
