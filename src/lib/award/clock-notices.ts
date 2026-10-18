/**
 * The staff notices of an award's two clocks (FR-AWD-006 indent expiry, FR-AWD-009 late commencement; design note 0004 C13, F-4). Written when the case is read, once per recipient and
 * expiry or due day: the notice's key (recipient, kind, award, day) makes a second reading write nothing. The drafts and the recipients are pure (`inbox/notices.ts`); this is the reading.
 *
 * Recipients (F-4, a default the founder may change): the requisition's requester; the person who heads the requesting org unit; the person who heads the unit that owns the case now
 * (the latest `CaseOwnershipEvent`, standing for C&P). A unit with no head named, or a case with no handover recorded, tells no one in that role: nothing is guessed.
 */

import { db } from "@/lib/db";
import { activeOn } from "@/lib/effective";
import { caseClockNotices, caseClockRecipients } from "@/lib/inbox/notices";
import { writeNotices } from "@/lib/inbox/store";

export interface CaseClockInput {
  organisationId: string;
  awardId: string;
  awardLabel: string;
  exerciseId: string;
  requesterId: string;
  requestingUnitCode: string;
  /// The organisation's day, for the units in force on it (a unit is versioned).
  on: Date;
  /// Null until a Contract row exists, and then no handover to read.
  contractId: string | null;
  href: string;
  /// The clocks that are running late today, each with its day.
  clocks: readonly { kind: "INDENT_EXPIRED" | "COMMENCEMENT_LATE"; day: string; dayWords: string }[];
}

/// Returns how many notices were newly written.
export async function raiseCaseClockNotices(i: CaseClockInput): Promise<number> {
  if (i.clocks.length === 0) return 0;
  return db.$transaction(async (tx) => {
    const owner = i.contractId ? await tx.caseOwnershipEvent.findFirst({ where: { contractId: i.contractId }, orderBy: [{ on: "desc" }, { id: "desc" }], select: { toUnitCode: true } }) : null;
    const codes = [i.requestingUnitCode, ...(owner?.toUnitCode ? [owner.toUnitCode] : [])];
    const units = activeOn(await tx.orgUnit.findMany({ where: { organisationId: i.organisationId, code: { in: codes } }, select: { code: true, headPersonId: true, effectiveFrom: true, effectiveTo: true, sortOrder: true } }), i.on);
    const head = (code: string | null | undefined) => (code ? (units.find((u) => u.code === code)?.headPersonId ?? null) : null);
    const recipients = caseClockRecipients({ requesterId: i.requesterId, requestingUnitHeadId: head(i.requestingUnitCode), caseOwnerUnitHeadId: head(owner?.toUnitCode) });
    let written = 0;
    for (const c of i.clocks) {
      written += await writeNotices(tx, i.organisationId, null, caseClockNotices({ kind: c.kind, awardId: i.awardId, awardLabel: i.awardLabel, day: c.day, dayWords: c.dayWords, exerciseId: i.exerciseId, href: i.href, recipients }));
    }
    return written;
  });
}
