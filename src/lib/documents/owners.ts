/**
 * The owners a document is attached to, each locked the way its own module locks it
 * for a write (LESSONS: re-validate on locked rows): a sitting by its Meeting row
 * (`withLockedSitting`); an exercise by its requisition, then itself
 * (`withLockedRequisitionForSourcing`); an award by requisition, exercise, award
 * (`withLockedAward`); a delegation by its own row (`lockDelegation`). The owner is locked before any
 * document row, always, so two acts never take the same locks in opposite orders.
 *
 * Under the lock each adapter reads the facts `attachFault` / `detachFault` judge (an
 * exercise's include what its sourcing method asks it to keep), and
 * the label the audit rows carry (prefixed with the owner's reference so each module's
 * History finds them).
 */

import type { Tx } from "@/lib/audit/record";
import { withLockedAward } from "@/lib/award/repo";
import { acceptOnCompleteReturn } from "@/lib/award/return-acceptance";
import { withLockedSitting } from "@/lib/committee/sittings";
import { storedDay } from "@/lib/dates";
import { db } from "@/lib/db";
import { requisitionOfExercise, withLockedRequisitionForSourcing } from "@/lib/method/repo";
import { lockDelegation } from "@/lib/people/lock";
import { exerciseOfBqVersion, exerciseOfPanel, lockBqRows, lockPanelRow, withLockedExerciseScope } from "@/lib/scope/lock";
import { exerciseOfPackPart, lockPackRows, PACK_PART_FACTS_SELECT, packPartLabel } from "@/lib/tender-docs/owner";
import { ADDENDUM_FACTS_SELECT, addendumLabel, exerciseOfAddendum, lockAddendumRows, lockWindowRow } from "@/lib/window/lock";
import { EXTENSION_FACTS_SELECT, exerciseOfExtension, exerciseOfWithdrawal, extensionLabel, lockEnvelopeRows, lockExtensionRows, lockWithdrawalRows, WITHDRAWAL_FACTS_SELECT, withdrawalLabel } from "@/lib/bids/lock";

import { reliedOn, type OwnerFacts, type Reliance } from "./attach";
import { addendumFacts, awardFacts, bqVersionFacts, delegationFacts, exerciseFacts, exerciseMethodFlags, extensionFacts, meetingFacts, PANEL_FACTS_SELECT, panelFacts, tenderPackPartFacts, withdrawalFacts } from "./owner-facts";
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
  /// `versionId`: the version the attachment being judged pins (a panel relies only on the scans its snapshot names).
  reliance: (purpose: AttachmentPurpose, liveOfPurpose: number, versionId: string) => Reliance | null;
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
          facts: meetingFacts(s.meeting),
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
        // What its method asks it to keep, read under the lock: the purpose attached is judged by it.
        const configured = l.ex.sourcingMethodCode
          ? await tx.sourcingMethod.findFirst({ where: { organisationId: l.org.id, code: l.ex.sourcingMethodCode }, select: { requiresDossier: true, requiresCoordinationRecord: true } })
          : null;
        // 6.5: the window's path decides its purposes; read after the exercise's lock, under the window's.
        await lockWindowRow(tx, l.ex.id);
        const window = await tx.exerciseWindow.findUnique({ where: { exerciseId: l.ex.id }, select: { path: true } });
        return fn(tx, {
          ref,
          organisationId: l.org.id,
          today: l.org.today,
          label: `${l.ex.reference}`,
          facts: exerciseFacts(l.ex, awards.map((a) => ({ status: a.status, openAppointmentRoutes: a.approvalInstances.length })), exerciseMethodFlags(l.ex.classificationSnapshot, configured), window),
          paths: [`/sourcing/${ref.id}`, ...awards.map((a) => `/awards/${a.id}`)],
          reliance: () => null,
        });
      });
    }
    case "award":
      return withLockedAward(ref.id, (tx, l) => {
        const a = l.award;
        // OD-5: an award accepted before scans were required has no scan snapshot.
        const facts: OwnerFacts = awardFacts(a);
        return fn(tx, {
          ref,
          organisationId: l.org.id,
          today: l.org.today,
          label: `${a.reference}`,
          facts,
          paths: [`/awards/${a.id}`, "/awards"],
          reliance: (purpose, live, versionId) => reliedOn(purpose, facts, live, versionId),
          // OD-5, BD-12: the scan that completes the return accepts the award in the same act.
          afterChange: (tx) => acceptOnCompleteReturn(tx, l),
        });
      });
    case "specificationPanel": {
      // 6.2: requisition, exercise, then the panel, as the scope actions lock it.
      const exerciseId = await exerciseOfPanel(ref.id);
      if (!exerciseId) return null;
      return withLockedExerciseScope(exerciseId, async (tx, l) => {
        await lockPanelRow(tx, ref.id);
        // BD-62-26: the snapshot and the live scans, read under the panel's lock.
        const p = await tx.specificationPanel.findFirst({ where: { id: ref.id, exerciseId, organisationId: l.org.id }, select: PANEL_FACTS_SELECT });
        if (!p) return null;
        const facts = panelFacts({ ...p, exercise: { status: l.ex.status } });
        return fn(tx, {
          ref,
          organisationId: l.org.id,
          today: l.org.today,
          label: `${l.ex.reference} · Specification panel`,
          facts,
          paths: [`/sourcing/${exerciseId}`],
          reliance: (purpose, live, versionId) => reliedOn(purpose, facts, live, versionId),
        });
      });
    }
    case "bqVersion": {
      // 6.2 Q-3: requisition, exercise, then the bill's versions, as the scope actions lock them.
      const exerciseId = await exerciseOfBqVersion(ref.id);
      if (!exerciseId) return null;
      return withLockedExerciseScope(exerciseId, async (tx, l) => {
        await lockBqRows(tx, exerciseId);
        const v = await tx.bqVersion.findFirst({ where: { id: ref.id, exerciseId, organisationId: l.org.id }, select: { status: true, versionNo: true } });
        if (!v) return null;
        const facts = bqVersionFacts({ status: v.status, exercise: { status: l.ex.status } });
        return fn(tx, {
          ref,
          organisationId: l.org.id,
          today: l.org.today,
          label: `${l.ex.reference} · Bill of quantities, version ${v.versionNo}`,
          facts,
          paths: [`/sourcing/${exerciseId}`],
          reliance: (purpose, live, versionId) => reliedOn(purpose, facts, live, versionId),
        });
      });
    }
    case "tenderPackPart": {
      // 6.4: requisition, exercise, then the exercise's packs, as the pack actions lock them.
      const exerciseId = await exerciseOfPackPart(ref.id);
      if (!exerciseId) return null;
      return withLockedExerciseScope(exerciseId, async (tx, l) => {
        await lockPackRows(tx, exerciseId);
        const p = await tx.tenderPackPart.findFirst({ where: { id: ref.id, organisationId: l.org.id, pack: { exerciseId } }, select: PACK_PART_FACTS_SELECT });
        if (!p) return null;
        const facts = tenderPackPartFacts({ source: p.source, pack: { status: p.pack.status, exercise: { status: l.ex.status } } });
        return fn(tx, {
          ref,
          organisationId: l.org.id,
          today: l.org.today,
          label: packPartLabel(p),
          facts,
          paths: [`/sourcing/${exerciseId}`],
          reliance: (purpose, live, versionId) => reliedOn(purpose, facts, live, versionId),
        });
      });
    }
    case "addendum": {
      // 6.5: requisition, exercise, the window, then its addenda, as the window actions lock them.
      const exerciseId = await exerciseOfAddendum(ref.id);
      if (!exerciseId) return null;
      return withLockedExerciseScope(exerciseId, async (tx, l) => {
        await lockWindowRow(tx, exerciseId);
        const w = await tx.exerciseWindow.findUnique({ where: { exerciseId }, select: { id: true } });
        if (!w) return null;
        await lockAddendumRows(tx, w.id);
        const a = await tx.addendum.findFirst({ where: { id: ref.id, organisationId: l.org.id, windowId: w.id }, select: ADDENDUM_FACTS_SELECT });
        if (!a) return null;
        const facts = addendumFacts(a);
        return fn(tx, {
          ref,
          organisationId: l.org.id,
          today: l.org.today,
          label: addendumLabel(a),
          facts,
          paths: [`/sourcing/${exerciseId}`],
          reliance: (purpose, live, versionId) => reliedOn(purpose, facts, live, versionId),
        });
      });
    }
    case "bidWithdrawal": {
      // 6.6: requisition, exercise, the window, the envelopes, then the withdrawals, as the bid actions lock them.
      const exerciseId = await exerciseOfWithdrawal(ref.id);
      if (!exerciseId) return null;
      return withLockedExerciseScope(exerciseId, async (tx, l) => {
        await lockWindowRow(tx, exerciseId);
        await lockEnvelopeRows(tx, exerciseId);
        await lockWithdrawalRows(tx, exerciseId);
        const w = await tx.bidWithdrawal.findFirst({ where: { id: ref.id, organisationId: l.org.id, exerciseId }, select: WITHDRAWAL_FACTS_SELECT });
        if (!w) return null;
        const facts = withdrawalFacts(w);
        return fn(tx, {
          ref,
          organisationId: l.org.id,
          today: l.org.today,
          label: withdrawalLabel(w),
          facts,
          paths: [`/sourcing/${exerciseId}`],
          reliance: (purpose, live, versionId) => reliedOn(purpose, facts, live, versionId),
        });
      });
    }
    case "validityExtension": {
      // 6.6: requisition, exercise, the window, the envelopes, then the extensions, as the bid actions lock them.
      const exerciseId = await exerciseOfExtension(ref.id);
      if (!exerciseId) return null;
      return withLockedExerciseScope(exerciseId, async (tx, l) => {
        await lockWindowRow(tx, exerciseId);
        await lockEnvelopeRows(tx, exerciseId);
        await lockExtensionRows(tx, exerciseId);
        const x = await tx.validityExtension.findFirst({ where: { id: ref.id, organisationId: l.org.id, exerciseId }, select: EXTENSION_FACTS_SELECT });
        if (!x) return null;
        const facts = extensionFacts(x);
        return fn(tx, {
          ref,
          organisationId: l.org.id,
          today: l.org.today,
          label: extensionLabel(x),
          facts,
          paths: [`/sourcing/${exerciseId}`, "/awards"],
          reliance: (purpose, live, versionId) => reliedOn(purpose, facts, live, versionId),
        });
      });
    }
    case "delegation":
      return db.$transaction(async (tx) => {
        const org = await documentOrg(tx);
        if (!org) return null;
        // The Delegation row lock and the read under it, shared with saveDelegation.
        const d = await lockDelegation(tx, ref.id, org.id);
        if (!d) return null;
        const today = org.today ?? storedDay(new Date());
        const facts = delegationFacts(d, today);
        return fn(tx, {
          ref,
          organisationId: org.id,
          today: org.today,
          label: `Delegation · ${d.fromPerson.name} to ${d.toPerson.name}`,
          facts,
          paths: ["/configuration/users"],
          reliance: (purpose, live, versionId) => reliedOn(purpose, facts, live, versionId),
        });
      });
  }
}

/// Which owner an attachment belongs to.
export function ownerOf(a: { meetingId: string | null; exerciseId: string | null; awardId: string | null; delegationId: string | null; specificationPanelId?: string | null; bqVersionId?: string | null; tenderPackPartId?: string | null; addendumId?: string | null; bidWithdrawalId?: string | null; validityExtensionId?: string | null }): OwnerRef | null {
  if (a.meetingId) return { kind: "meeting", id: a.meetingId };
  if (a.exerciseId) return { kind: "exercise", id: a.exerciseId };
  if (a.awardId) return { kind: "award", id: a.awardId };
  if (a.delegationId) return { kind: "delegation", id: a.delegationId };
  if (a.specificationPanelId) return { kind: "specificationPanel", id: a.specificationPanelId };
  if (a.bqVersionId) return { kind: "bqVersion", id: a.bqVersionId };
  if (a.tenderPackPartId) return { kind: "tenderPackPart", id: a.tenderPackPartId };
  if (a.addendumId) return { kind: "addendum", id: a.addendumId };
  if (a.bidWithdrawalId) return { kind: "bidWithdrawal", id: a.bidWithdrawalId };
  if (a.validityExtensionId) return { kind: "validityExtension", id: a.validityExtensionId };
  return null;
}
