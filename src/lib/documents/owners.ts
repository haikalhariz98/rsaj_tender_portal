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
import { indentReturnLate } from "@/lib/award/indent";
import { loadAwardPolicy, withLockedAwardFor, type LoadedAward } from "@/lib/award/repo";
import { contractLabel, withLockedContract } from "@/lib/contract/repo";
import { acceptOnCompleteReturn } from "@/lib/award/return-acceptance";
import { withLockedSitting } from "@/lib/committee/sittings";
import { dayOrNull } from "@/lib/dates";
import { db } from "@/lib/db";
import { requisitionOfExercise, withLockedRequisitionForSourcing } from "@/lib/method/repo";
import { lockDelegation } from "@/lib/people/lock";
import { exerciseOfBqVersion, exerciseOfPanel, lockBqRows, lockPanelRow, withLockedExerciseScope } from "@/lib/scope/lock";
import { exerciseOfPackPart, lockPackRows, PACK_PART_FACTS_SELECT, packPartLabel } from "@/lib/tender-docs/owner";
import { ADDENDUM_FACTS_SELECT, addendumLabel, exerciseOfAddendum, lockAddendumRows, lockWindowRow } from "@/lib/window/lock";
import { exerciseOfOpening, lockOpeningRows, OPENING_FACTS_SELECT, openingLabel } from "@/lib/opening/lock";
import { EVALUATION_BIDDER_FACTS_SELECT, EVALUATION_FACTS_SELECT, EVALUATION_MEETING_FACTS_SELECT, evaluationBidderLabel, evaluationLabel, evaluationMeetingLabel, exerciseOfEvaluation, exerciseOfEvaluationBidder, exerciseOfEvaluationMeeting, lockEvaluationRows } from "@/lib/evaluation/lock";
import { lockSupplierRow, SUPPLIER_APPLICATION_FACTS_SELECT, SUPPLIER_DOCUMENT_FACTS_SELECT, supplierApplicationLabel, supplierDocumentLabel, supplierOfApplication, supplierOfDocument } from "@/lib/suppliers/lock";
import { EXTENSION_FACTS_SELECT, exerciseOfExtension, exerciseOfWithdrawal, extensionLabel, lockEnvelopeRows, lockExtensionRows, lockWithdrawalRows, WITHDRAWAL_FACTS_SELECT, withdrawalLabel } from "@/lib/bids/lock";

import { reliedOn, type OwnerFacts, type Reliance } from "./attach";
import { addendumFacts, awardFacts, CANCELLATION_OWNER_SELECT, cancellationOwnerFacts, cancellationOwnerLabel, bqVersionFacts, contractFacts, delegationFacts, evaluationBidderFacts, evaluationFacts, evaluationMeetingFacts, exerciseFacts, publicationFactsOf, exerciseMethodFlags, extensionFacts, meetingFacts, openingFacts, PANEL_FACTS_SELECT, panelFacts, supplierApplicationFacts, supplierDocumentFacts, tenderPackPartFacts, VARIATION_INSTRUCTION_FACTS_SELECT, variationInstructionFacts, variationInstructionLabel, withdrawalFacts, DELAY_NOTICE_FACTS_SELECT, delayNoticeFacts, delayNoticeLabel, EOT_CLAIM_FACTS_SELECT, eotClaimFacts, eotClaimLabel } from "./owner-facts";
import type { OwnerRef } from "./repo";
import { documentOrg } from "./service";
import type { AttachmentPurpose } from "./types";
import type { AuditActor } from "@/lib/auth/types";
import type { Reader } from "@/lib/auth/sulit-store";

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

/**
 * An award as a locked owner, from the award its caller has locked and loaded. The staff attach reaches it through `withLockedOwner`; the verify act of an online return
 * (ADR 0045 D1) builds it under its own lock, with `onlineReturnWaiting` false once it has marked the return verified, so both judge an attach on the same facts.
 */
export function awardLockedOwner(l: LoadedAward, actor: AuditActor, overrides: { onlineReturnWaiting?: boolean; indentLate?: { expiredOn: string; receivedOn: string } | null } = {}): LockedOwner {
  const a = l.award;
  // OD-5: an award accepted before scans were required has no scan snapshot.
  const facts: OwnerFacts = { ...awardFacts(a), ...overrides };
  return {
    ref: { kind: "award", id: a.id },
    organisationId: l.org.id,
    today: l.org.today,
    label: `${a.reference}`,
    facts,
    paths: [`/projects/${a.id}`, "/projects"],
    reliance: (purpose, live, versionId) => reliedOn(purpose, facts, live, versionId),
    // OD-5, BD-12: the scan that completes the return accepts the award in the same act.
    afterChange: (tx) => acceptOnCompleteReturn(tx, actor, l),
  };
}

/**
 * FR-AWD-006 (ruling B, 2026-10-24): an issued work indent whose stored received day is past its expiry, judged on that day, never today, with the validity as it stands now
 * (it may have been set after the day was saved, or the day saved before the rule). Issued awards only: a correction to an accepted award attaches as before.
 * The award's Return tab reads the same fact to close the acceptance page's upload (Phase 0.3 item 10).
 */
export async function indentLateOf(tx: Tx, l: LoadedAward): Promise<{ expiredOn: string; receivedOn: string } | null> {
  const a = l.award;
  const receivedOn = dayOrNull(a.awardReturn?.signedLetterReceivedOn);
  if (a.status !== "ISSUED" || a.instrumentKind !== "WORK_INDENT" || !receivedOn) return null;
  const expiredOn = indentReturnLate(dayOrNull(a.indentReceivedOn), (await loadAwardPolicy(l.org.id, tx)).indentValidityDays, receivedOn);
  return expiredOn ? { expiredOn, receivedOn } : null;
}

/// Run `fn` with the owner locked, inside one transaction. Null when the owner does not exist.
export async function withLockedOwner<T>(scope: Reader, actor: AuditActor, ref: OwnerRef, fn: (tx: Tx, o: LockedOwner) => Promise<T>): Promise<T | null> {
  switch (ref.kind) {
    case "meeting":
      return withLockedSitting(scope, ref.id, (tx, s) =>
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
      const requisitionId = await requisitionOfExercise(scope.organisationId, ref.id);
      if (!requisitionId) return null;
      return withLockedRequisitionForSourcing(scope, requisitionId, ref.id, async (tx, l) => {
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
        // Go-live R4: the published schedule is judged on whether the exercise is confidential and its main opening finalised, read under the same lock.
        const openings = await tx.opening.findMany({ where: { exerciseId: l.ex.id, kind: "MAIN" }, select: { finalisedAt: true } });
        return fn(tx, {
          ref,
          organisationId: l.org.id,
          today: l.org.today,
          label: `${l.ex.reference}`,
          facts: exerciseFacts(l.ex, awards.map((a) => ({ status: a.status, openAppointmentRoutes: a.approvalInstances.length })), exerciseMethodFlags(l.ex.classificationSnapshot, configured), window, publicationFactsOf({ restricted: l.ex.restricted, openings })),
          paths: [`/sourcing/${ref.id}`, ...awards.map((a) => `/projects/${a.id}`)],
          reliance: () => null,
        });
      });
    }
    case "award":
      return withLockedAwardFor(scope, ref.id, async (tx, l) => fn(tx, awardLockedOwner(l, actor, { indentLate: await indentLateOf(tx, l) })));
    case "specificationPanel": {
      // 6.2: requisition, exercise, then the panel, as the scope actions lock it.
      const exerciseId = await exerciseOfPanel(scope.organisationId, ref.id);
      if (!exerciseId) return null;
      return withLockedExerciseScope(scope, exerciseId, async (tx, l) => {
        await lockPanelRow(tx, ref.id);
        // BD-62-26: the snapshot and the live scans, read under the panel's lock.
        const p = await tx.specificationPanel.findFirst({ where: { id: ref.id, exerciseId, organisationId: l.org.id }, select: PANEL_FACTS_SELECT });
        if (!p) return null;
        const facts = panelFacts({ ...p, exercise: { status: l.ex.status, specPanelUsed: l.ex.specPanelUsed } });
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
      const exerciseId = await exerciseOfBqVersion(scope.organisationId, ref.id);
      if (!exerciseId) return null;
      return withLockedExerciseScope(scope, exerciseId, async (tx, l) => {
        await lockBqRows(tx, exerciseId);
        const v = await tx.bqVersion.findFirst({ where: { id: ref.id, exerciseId, organisationId: l.org.id }, select: { status: true, versionNo: true } });
        if (!v) return null;
        const facts = bqVersionFacts({ status: v.status, exercise: { status: l.ex.status, onScreenBillUsed: l.ex.onScreenBillUsed } });
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
      return withLockedExerciseScope(scope, exerciseId, async (tx, l) => {
        await lockPackRows(tx, exerciseId);
        const p = await tx.tenderPackPart.findFirst({ where: { id: ref.id, organisationId: l.org.id, pack: { exerciseId } }, select: PACK_PART_FACTS_SELECT });
        if (!p) return null;
        const facts = tenderPackPartFacts({ source: p.source, pack: { status: p.pack.status, exercise: { status: l.ex.status, onScreenBillUsed: l.ex.onScreenBillUsed } }, _count: p._count });
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
      return withLockedExerciseScope(scope, exerciseId, async (tx, l) => {
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
      return withLockedExerciseScope(scope, exerciseId, async (tx, l) => {
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
      return withLockedExerciseScope(scope, exerciseId, async (tx, l) => {
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
          paths: [`/sourcing/${exerciseId}`, "/projects"],
          reliance: (purpose, live, versionId) => reliedOn(purpose, facts, live, versionId),
        });
      });
    }
    case "opening": {
      // 6.7: requisition, exercise, the window, then the openings, as the opening actions lock them.
      const exerciseId = await exerciseOfOpening(ref.id);
      if (!exerciseId) return null;
      return withLockedExerciseScope(scope, exerciseId, async (tx, l) => {
        await lockWindowRow(tx, exerciseId);
        await lockOpeningRows(tx, exerciseId);
        const o = await tx.opening.findFirst({ where: { id: ref.id, organisationId: l.org.id, exerciseId }, select: OPENING_FACTS_SELECT });
        if (!o) return null;
        const facts = openingFacts(o);
        return fn(tx, {
          ref,
          organisationId: l.org.id,
          today: l.org.today,
          label: openingLabel(o),
          facts,
          paths: [`/sourcing/${exerciseId}`, "/projects"],
          reliance: (purpose, live, versionId) => reliedOn(purpose, facts, live, versionId),
        });
      });
    }
    case "evaluation":
    case "evaluationMeeting":
    case "evaluationBidder": {
      // 6.8: requisition, exercise, the window, the openings, then the evaluations, as the evaluation actions lock them.
      const exerciseId = ref.kind === "evaluation" ? await exerciseOfEvaluation(ref.id) : ref.kind === "evaluationMeeting" ? await exerciseOfEvaluationMeeting(ref.id) : await exerciseOfEvaluationBidder(ref.id);
      if (!exerciseId) return null;
      return withLockedExerciseScope(scope, exerciseId, async (tx, l) => {
        await lockWindowRow(tx, exerciseId);
        await lockOpeningRows(tx, exerciseId);
        await lockEvaluationRows(tx, exerciseId);
        const read = async (): Promise<{ facts: OwnerFacts; label: string } | null> => {
          if (ref.kind === "evaluation") {
            const e = await tx.evaluation.findFirst({ where: { id: ref.id, organisationId: l.org.id, exerciseId }, select: EVALUATION_FACTS_SELECT });
            return e ? { facts: evaluationFacts(e), label: evaluationLabel(e) } : null;
          }
          if (ref.kind === "evaluationMeeting") {
            const m = await tx.evaluationMeeting.findFirst({ where: { id: ref.id, organisationId: l.org.id, evaluation: { exerciseId } }, select: EVALUATION_MEETING_FACTS_SELECT });
            return m ? { facts: evaluationMeetingFacts(m), label: evaluationMeetingLabel(m) } : null;
          }
          const b = await tx.evaluationBidder.findFirst({ where: { id: ref.id, organisationId: l.org.id, evaluation: { exerciseId } }, select: EVALUATION_BIDDER_FACTS_SELECT });
          return b ? { facts: evaluationBidderFacts(b), label: evaluationBidderLabel(b) } : null;
        };
        const o = await read();
        if (!o) return null;
        const facts = o.facts;
        return fn(tx, {
          ref,
          organisationId: l.org.id,
          today: l.org.today,
          label: o.label,
          facts,
          paths: [`/sourcing/${exerciseId}`],
          reliance: (purpose, live, versionId) => reliedOn(purpose, facts, live, versionId),
        });
      });
    }
    case "contract":
      // 6.12: requisition → exercise → award → contract (`withLockedContract`, the canonical order).
      return withLockedContract(scope.organisationId, ref.id, (tx, l) => {
        const c = l.contract;
        const facts = contractFacts({ status: c.status, signatures: c.signatures, legalReviews: c.legalReviews, attachments: c.attachments });
        return fn(tx, {
          ref,
          organisationId: l.org.id,
          today: l.org.today,
          label: contractLabel({ number: c.number, award: { awardeeName: l.award.awardeeName } }),
          facts,
          paths: [`/projects/${c.id}`, "/projects"],
          reliance: (purpose, live, versionId) => reliedOn(purpose, facts, live, versionId),
        });
      });
    case "variationInstruction": {
      // 6.13 (FR-VAR-015): the contract first (`withLockedContract`, the canonical order), then its variation, as the
      // variation's own acts lock them, then the instruction read under them.
      const pre = await db.variationInstruction.findFirst({ where: { id: ref.id, organisationId: scope.organisationId }, select: { variation: { select: { id: true, contractId: true } } } });
      if (!pre) return null;
      return withLockedContract(scope.organisationId, pre.variation.contractId, async (tx, l) => {
        await tx.$queryRaw`SELECT id FROM "Variation" WHERE id = ${pre.variation.id} FOR UPDATE`;
        const i = await tx.variationInstruction.findFirst({ where: { id: ref.id, organisationId: l.org.id }, select: VARIATION_INSTRUCTION_FACTS_SELECT });
        if (!i) return null;
        const facts = variationInstructionFacts(i);
        return fn(tx, {
          ref,
          organisationId: l.org.id,
          today: l.org.today,
          label: variationInstructionLabel(i),
          facts,
          paths: [`/projects/${i.variation.contractId}/variations/${i.variation.id}`, `/projects/${i.variation.contractId}`],
          // Not required at issue, so nothing stands on a plan or sketch.
          reliance: () => null,
        });
      });
    }
    case "delayNotice": {
      // 6.13 Part B run 1b: the contract first (`withLockedContract`, the canonical order), then the notice.
      const pre = await db.delayNotice.findFirst({ where: { id: ref.id, organisationId: scope.organisationId }, select: { contractId: true } });
      if (!pre) return null;
      return withLockedContract(scope.organisationId, pre.contractId, async (tx, l) => {
        await tx.$queryRaw`SELECT id FROM "DelayNotice" WHERE id = ${ref.id} FOR UPDATE`;
        const n = await tx.delayNotice.findFirst({ where: { id: ref.id, organisationId: l.org.id, contractId: pre.contractId }, select: DELAY_NOTICE_FACTS_SELECT });
        if (!n) return null;
        return fn(tx, {
          ref,
          organisationId: l.org.id,
          today: l.org.today,
          label: delayNoticeLabel(n),
          facts: delayNoticeFacts(n),
          paths: [`/projects/${n.contractId}`],
          // The notice is the record's evidence; no act stands on its scan.
          reliance: () => null,
        });
      });
    }
    case "eotClaim": {
      // 6.13 Part B run 1b: the contract first, then the claim's matter (the first domain row), then the claim.
      const pre = await db.eotClaim.findFirst({ where: { id: ref.id, organisationId: scope.organisationId }, select: { contractId: true, matterId: true } });
      if (!pre) return null;
      return withLockedContract(scope.organisationId, pre.contractId, async (tx, l) => {
        await tx.$queryRaw`SELECT id FROM "ContractMatter" WHERE id = ${pre.matterId} FOR UPDATE`;
        await tx.$queryRaw`SELECT id FROM "EotClaim" WHERE id = ${ref.id} FOR UPDATE`;
        const c = await tx.eotClaim.findFirst({ where: { id: ref.id, organisationId: l.org.id, contractId: pre.contractId }, select: EOT_CLAIM_FACTS_SELECT });
        if (!c) return null;
        return fn(tx, {
          ref,
          organisationId: l.org.id,
          today: l.org.today,
          label: eotClaimLabel(c),
          facts: eotClaimFacts(c),
          paths: [`/projects/${c.contractId}`],
          // Determination reads the live meteorological record (FR-EOT-005); once determined the claim is frozen, so no
          // detach can reach a record a determination stood on.
          reliance: () => null,
        });
      });
    }
    case "supplierDocument":
    case "supplierApplication": {
      // 6.15: the supplier row first, then the document or application (src/lib/suppliers/lock.ts).
      const supplierId = ref.kind === "supplierDocument" ? await supplierOfDocument(ref.id) : await supplierOfApplication(ref.id);
      if (!supplierId) return null;
      return db.$transaction(async (tx) => {
        const org = await documentOrg(scope.organisationId, tx);
        if (!org || !(await lockSupplierRow(tx, supplierId))) return null;
        const read = async (): Promise<{ facts: OwnerFacts; label: string } | null> => {
          if (ref.kind === "supplierDocument") {
            await tx.$queryRaw`SELECT id FROM "SupplierDocument" WHERE id = ${ref.id} FOR UPDATE`;
            const d = await tx.supplierDocument.findFirst({ where: { id: ref.id, organisationId: org.id, supplierId }, select: SUPPLIER_DOCUMENT_FACTS_SELECT });
            return d ? { facts: supplierDocumentFacts(d), label: supplierDocumentLabel(d) } : null;
          }
          await tx.$queryRaw`SELECT id FROM "SupplierApplication" WHERE id = ${ref.id} FOR UPDATE`;
          const a = await tx.supplierApplication.findFirst({ where: { id: ref.id, organisationId: org.id, supplierId }, select: SUPPLIER_APPLICATION_FACTS_SELECT });
          return a ? { facts: supplierApplicationFacts(a), label: supplierApplicationLabel(a) } : null;
        };
        const o = await read();
        if (!o) return null;
        const facts = o.facts;
        return fn(tx, {
          ref,
          organisationId: org.id,
          today: org.today,
          label: o.label,
          facts,
          paths: [`/suppliers/${supplierId}`, "/suppliers"],
          reliance: (purpose, live, versionId) => reliedOn(purpose, facts, live, versionId),
        });
      });
    }
    case "standingEvent": {
      // 6.15 (615-C2): the supplier row first (the supplier-only path, src/lib/suppliers/lock.ts), then the event.
      const supplierId = (await db.standingEvent.findFirst({ where: { id: ref.id, organisationId: scope.organisationId }, select: { supplierId: true } }))?.supplierId ?? null;
      if (!supplierId) return null;
      return db.$transaction(async (tx) => {
        const org = await documentOrg(scope.organisationId, tx);
        if (!org || !(await lockSupplierRow(tx, supplierId))) return null;
        await tx.$queryRaw`SELECT id FROM "StandingEvent" WHERE id = ${ref.id} FOR UPDATE`;
        const e = await tx.standingEvent.findFirst({ where: { id: ref.id, organisationId: org.id, supplierId }, select: CANCELLATION_OWNER_SELECT });
        if (!e) return null;
        const facts = cancellationOwnerFacts(e);
        return fn(tx, {
          ref,
          organisationId: org.id,
          today: org.today,
          label: cancellationOwnerLabel(e),
          facts,
          paths: [`/suppliers/${supplierId}`, "/suppliers"],
          // The body's notice is attached for the record; nothing stands on it.
          reliance: () => null,
        });
      });
    }
    case "delegation":
      return db.$transaction(async (tx) => {
        const org = await documentOrg(scope.organisationId, tx);
        if (!org) return null;
        // The Delegation row lock and the read under it, shared with saveDelegation.
        const d = await lockDelegation(tx, ref.id, org.id);
        if (!d) return null;
        // 66-C2: the organisation's today, or null (not judged); never the UTC day.
        const today = org.today;
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
    // Phase 4b: what a signed-in supplier uploads to its own registration is attached by the supplier's upload route, in the same transaction as the file. Staff never attach to
    // these owners from the shared choice (`OWNER_ACT_PURPOSES`), so there is no staff lock to take.
    case "registrationDraftDocument":
    case "creditorProfile":
    // Wave 3b step 15: the mover files a bid file and its link in one transaction of its own, so staff never attach to this owner.
    case "onlineBidFile":
    // ADR 0041 D2: what an online application holds is attached by the receiving act, in the same transaction as its files. Staff never attach to it from the shared choice.
    case "portalApplicationDocument":
    case "portalApplicationCreditor":
    // ADR 0042 D8: a project document's files are pinned by the workspace act that makes its version, under the contract's lock and then the document's. Staff never attach to it
    // from the shared choice.
    case "projectDocumentVersion":
    // ADR 0045 D1: an online return's scans are pinned by the contractor's submit act only. No staff attach or detach is offered.
    case "awardOnlineReturn":
      return null;
  }
}

/// Which owner an attachment belongs to.
export function ownerOf(a: { meetingId: string | null; exerciseId: string | null; awardId: string | null; delegationId: string | null; specificationPanelId?: string | null; bqVersionId?: string | null; tenderPackPartId?: string | null; addendumId?: string | null; bidWithdrawalId?: string | null; validityExtensionId?: string | null; openingId?: string | null; evaluationId?: string | null; evaluationMeetingId?: string | null; evaluationBidderId?: string | null; supplierDocumentId?: string | null; supplierApplicationId?: string | null; contractId?: string | null; variationInstructionId?: string | null; standingEventId?: string | null; delayNoticeId?: string | null; eotClaimId?: string | null; registrationDraftDocumentId?: string | null; creditorProfileId?: string | null; onlineBidFileId?: string | null; portalApplicationDocumentId?: string | null; portalApplicationCreditorId?: string | null; projectDocumentVersionId?: string | null; awardOnlineReturnId?: string | null }): OwnerRef | null {
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
  if (a.openingId) return { kind: "opening", id: a.openingId };
  if (a.evaluationId) return { kind: "evaluation", id: a.evaluationId };
  if (a.evaluationMeetingId) return { kind: "evaluationMeeting", id: a.evaluationMeetingId };
  if (a.evaluationBidderId) return { kind: "evaluationBidder", id: a.evaluationBidderId };
  if (a.supplierDocumentId) return { kind: "supplierDocument", id: a.supplierDocumentId };
  if (a.supplierApplicationId) return { kind: "supplierApplication", id: a.supplierApplicationId };
  if (a.contractId) return { kind: "contract", id: a.contractId };
  if (a.variationInstructionId) return { kind: "variationInstruction", id: a.variationInstructionId };
  if (a.standingEventId) return { kind: "standingEvent", id: a.standingEventId };
  if (a.delayNoticeId) return { kind: "delayNotice", id: a.delayNoticeId };
  if (a.eotClaimId) return { kind: "eotClaim", id: a.eotClaimId };
  if (a.registrationDraftDocumentId) return { kind: "registrationDraftDocument", id: a.registrationDraftDocumentId };
  if (a.creditorProfileId) return { kind: "creditorProfile", id: a.creditorProfileId };
  if (a.onlineBidFileId) return { kind: "onlineBidFile", id: a.onlineBidFileId };
  if (a.portalApplicationDocumentId) return { kind: "portalApplicationDocument", id: a.portalApplicationDocumentId };
  if (a.portalApplicationCreditorId) return { kind: "portalApplicationCreditor", id: a.portalApplicationCreditorId };
  if (a.projectDocumentVersionId) return { kind: "projectDocumentVersion", id: a.projectDocumentVersionId };
  if (a.awardOnlineReturnId) return { kind: "awardOnlineReturn", id: a.awardOnlineReturnId };
  return null;
}
