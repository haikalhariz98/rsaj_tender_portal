/**
 * What the demo wipe does with documents (plan §9, BD-DS-27, BD-DS-30, review must-fix 3):
 * pure, so the decision is tested here and `prisma/demo-documents.ts` only reads the rows
 * and carries the plan out. Demo tooling, not product logic: it lives here because this is
 * where the tests run.
 *
 * A record is on the **demo side** when it is demo data, or when it is not demo data but
 * `--remove-dependents` removes it with the demo (a requisition, exercise or award that
 * hangs off demo rows — computed before this plan, so its attachments are judged as the
 * demo's and the wipe never refuses over a record it is about to remove). Every other
 * record is **real**.
 *
 * - A demo document is removed whole. Always refused: one of its attachments on a real
 *   record (nothing attached to a real record is removed for the demo).
 * - A document that is not demo data but names a demo person (recorded on one's behalf,
 *   or held or released by one: what the screens add in a demo environment) is removed
 *   whole with `--remove-dependents`. Always refused: one attached to a real record.
 * - Any other document attached to a demo-side record has those attachments taken off
 *   with `--remove-dependents`; the document and its other attachments are kept.
 *
 * Carry D4 (2026-10-01): a sitting made through the screens on a demo committee, and a
 * delegation made through the screens that names a demo person at either end, cannot
 * outlive the demo either (the committee and the person go). They are on the demo side
 * too, removed with `--remove-dependents` like a screen-made award (`removedWithDemo`
 * decides which they are), so their signed minutes or holder's recommendation no longer
 * turn the wipe into a refusal with no way out.
 *
 * Every attachment row counts, detached ones included: a detached attachment still names
 * its record, and removing it would cut that record's history.
 *
 * Nothing is partial: the plan is refused, with every line, before anything is removed.
 */

import type { AttachmentPurpose } from "./types";

export interface PlanAttachment {
  id: string;
  purpose: AttachmentPurpose;
  meetingId: string | null;
  exerciseId: string | null;
  awardId: string | null;
  delegationId: string | null;
  /// 6.2: a specification panel, on the demo side when it is demo data or its exercise is
  /// (a panel goes with its exercise, `removedPanelIds`).
  specificationPanelId?: string | null;
  /// 6.2 Q-3: a bill of quantities version, on the demo side when it is demo data or its
  /// exercise is (a version goes with its exercise, `removedBqVersionIds`).
  bqVersionId?: string | null;
  /// 6.4: a tender pack's part, on the demo side when it is demo data or its exercise is
  /// (a pack and its parts go with their exercise, `removedPackPartIds`).
  tenderPackPartId?: string | null;
  /// 6.5: an addendum, which is the demo's when it is or its exercise is (an addendum goes with
  /// its exercise's window, `removedAddendumIds`).
  addendumId?: string | null;
  /// 6.6: a withdrawal or a validity extension, which goes with its exercise (`removedBidRecordIds`).
  bidWithdrawalId?: string | null;
  validityExtensionId?: string | null;
}

export interface PlanDocument {
  id: string;
  title: string;
  /// A version recorded on behalf of, or a hold placed or released by, a demo person.
  namesDemoPerson: boolean;
  versions: { id: string; sha256: string; attachments: PlanAttachment[] }[];
  holds: { id: string }[];
}

export interface WipeSide {
  /// Whether an id is demo data.
  isDemo: (id: string) => boolean;
  /// Records that are not demo data but that --remove-dependents removes with the demo.
  removedExerciseIds: ReadonlySet<string>;
  removedAwardIds: ReadonlySet<string>;
  /// Carry D4: sittings made through the screens on a demo committee.
  removedMeetingIds?: ReadonlySet<string>;
  /// Carry D4: delegations made through the screens that name a demo person.
  removedDelegationIds?: ReadonlySet<string>;
  /// 6.2: panels made through the screens on exercises the wipe removes (demo or hanging).
  removedPanelIds?: ReadonlySet<string>;
  /// 6.2 Q-3: bill versions made through the screens on exercises the wipe removes.
  removedBqVersionIds?: ReadonlySet<string>;
  /// 6.4: tender pack parts made through the screens on exercises the wipe removes.
  removedPackPartIds?: ReadonlySet<string>;
  /// 6.5: addenda removed with their exercise's window.
  removedAddendumIds?: ReadonlySet<string>;
  /// 6.6: withdrawals and validity extensions removed with their exercise.
  removedBidRecordIds?: ReadonlySet<string>;
}

/**
 * Carry D4: which records made through the screens go with the demo although their ids
 * are not demo data. A sitting goes with its committee; a delegation with either of its
 * people (neither can stand without the other end). Everything else is judged elsewhere.
 */
export function removedWithDemo(
  rows: { meetings: readonly { id: string; committeeId: string }[]; delegations: readonly { id: string; fromPersonId: string; toPersonId: string }[] },
  isDemo: (id: string) => boolean,
): { meetingIds: string[]; delegationIds: string[] } {
  return {
    meetingIds: rows.meetings.filter((m) => !isDemo(m.id) && isDemo(m.committeeId)).map((m) => m.id),
    delegationIds: rows.delegations.filter((d) => !isDemo(d.id) && (isDemo(d.fromPersonId) || isDemo(d.toPersonId))).map((d) => d.id),
  };
}

export type PlanLine =
  | { kind: "DEMO_DOCUMENT_ON_REAL_RECORD"; title: string; purpose: AttachmentPurpose }
  | { kind: "DEMO_PERSON_DOCUMENT_ON_REAL_RECORD"; title: string }
  | { kind: "DEMO_PERSON_DOCUMENT"; title: string }
  | { kind: "OTHER_DOCUMENT_ON_DEMO_RECORD"; title: string; purpose: AttachmentPurpose };

export interface DocumentWipePlan {
  /// Refused whatever the flag.
  hard: PlanLine[];
  /// Refused unless --remove-dependents.
  soft: PlanLine[];
  refused: boolean;
  /// Removed whole: the demo's own documents.
  demoDocuments: PlanDocument[];
  /// Removed whole with --remove-dependents: documents the screens added for demo people.
  demoPersonDocuments: PlanDocument[];
  /// Taken off with --remove-dependents: other documents' attachments on demo-side records.
  takeOff: (PlanAttachment & { title: string })[];
}

/// Whether an attachment's record is demo data or removed with it.
export function onDemoSide(a: PlanAttachment, side: WipeSide): boolean {
  const keys = [a.meetingId, a.exerciseId, a.awardId, a.delegationId, a.specificationPanelId ?? null, a.bqVersionId ?? null, a.tenderPackPartId ?? null, a.addendumId ?? null, a.bidWithdrawalId ?? null, a.validityExtensionId ?? null].filter((k): k is string => k != null);
  // An attachment has exactly one owner (a CHECK); a row with none is never the demo's.
  if (keys.length === 0) return false;
  return keys.every(
    (k) =>
      side.isDemo(k) ||
      (a.exerciseId === k && side.removedExerciseIds.has(k)) ||
      (a.awardId === k && side.removedAwardIds.has(k)) ||
      (a.meetingId === k && (side.removedMeetingIds?.has(k) ?? false)) ||
      (a.delegationId === k && (side.removedDelegationIds?.has(k) ?? false)) ||
      (a.specificationPanelId === k && (side.removedPanelIds?.has(k) ?? false)) ||
      (a.bqVersionId === k && (side.removedBqVersionIds?.has(k) ?? false)) ||
      (a.tenderPackPartId === k && (side.removedPackPartIds?.has(k) ?? false)) ||
      (a.addendumId === k && (side.removedAddendumIds?.has(k) ?? false)) ||
      ((a.bidWithdrawalId === k || a.validityExtensionId === k) && (side.removedBidRecordIds?.has(k) ?? false)),
  );
}

export function documentWipePlan(documents: readonly PlanDocument[], side: WipeSide, removeDependents: boolean): DocumentWipePlan {
  const hard: PlanLine[] = [];
  const soft: PlanLine[] = [];
  const demoDocuments: PlanDocument[] = [];
  const demoPersonDocuments: PlanDocument[] = [];
  const takeOff: (PlanAttachment & { title: string })[] = [];

  for (const d of documents) {
    const all = d.versions.flatMap((v) => v.attachments);
    const real = all.filter((a) => !onDemoSide(a, side));
    if (side.isDemo(d.id)) {
      for (const a of real) hard.push({ kind: "DEMO_DOCUMENT_ON_REAL_RECORD", title: d.title, purpose: a.purpose });
      demoDocuments.push(d);
    } else if (d.namesDemoPerson) {
      if (real.length) hard.push({ kind: "DEMO_PERSON_DOCUMENT_ON_REAL_RECORD", title: d.title });
      else {
        soft.push({ kind: "DEMO_PERSON_DOCUMENT", title: d.title });
        demoPersonDocuments.push(d);
      }
    } else {
      for (const a of all.filter((x) => onDemoSide(x, side))) {
        soft.push({ kind: "OTHER_DOCUMENT_ON_DEMO_RECORD", title: d.title, purpose: a.purpose });
        takeOff.push({ ...a, title: d.title });
      }
    }
  }
  return { hard, soft, refused: hard.length > 0 || (!removeDependents && soft.length > 0), demoDocuments, demoPersonDocuments, takeOff };
}
