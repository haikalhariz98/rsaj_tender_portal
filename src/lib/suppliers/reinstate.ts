/**
 * Suspending a registered supplier, and reinstating it (FR-VND-010). A suspension is recorded by an
 * officer with a reason from the maintained list (`StandingReason`, SUSPEND), the day it takes effect and
 * the documents it is imposed for. A reinstatement needs every flagged document's type standing again
 * (its newest verified document in force), no mandatory document expired, the checklist (one line per
 * flagged document, seen verified) answered in full, and a note. A blacklisting is not reinstated: it is
 * lifted on its own route (OD-8 A). Suspension on lapse is derived and ends when the document is renewed
 * and verified; it is never reinstated by hand. Pure.
 */

import type { DocumentState } from "./documents";
import type { StandingEventFacts, StandingReading } from "./standing";
import type { Finding } from "./types";

export type SuspendFault =
  | "TIME_ZONE_UNSET"
  | "STANDING_NEEDS_REGISTRATION"
  | "ALREADY_SUSPENDED"
  | "ALREADY_BARRED"
  | "REASON_REQUIRED"
  | "REASON_NOT_FOR_SUSPENSION"
  | "REASON_RETIRED"
  | "EFFECTIVE_REQUIRED"
  | "EFFECTIVE_IN_FUTURE"
  | "EFFECTIVE_BEFORE_REGISTRATION"
  | "PERSON_REQUIRED"
  | "DOCUMENT_NOT_ON_FILE";

export interface ReasonFacts {
  appliesTo: "SUSPEND" | "BLACKLIST";
  /// The organisation's day it was retired on, or null.
  retiredOn: string | null;
}

export function suspendFaults(
  i: { reasonId: string | null; effectiveOn: string | null; personActive: boolean; flaggedDocumentIds: readonly string[] },
  ctx: { today: string | null; status: string; registeredOn: string | null; reading: StandingReading; reason: ReasonFacts | null; documentIds: readonly string[] },
): Finding<SuspendFault>[] {
  const out: Finding<SuspendFault>[] = [];
  if (!ctx.today) return [{ code: "TIME_ZONE_UNSET", level: "block" }];
  if (ctx.status !== "REGISTERED") out.push({ code: "STANDING_NEEDS_REGISTRATION", level: "block" });
  else if (ctx.reading.suspension) out.push({ code: "ALREADY_SUSPENDED", level: "block", data: { since: ctx.reading.suspension.effectiveOn } });
  // fix S-4: the refusal names the standing in effect, and since when.
  else if (ctx.reading.standing === "BLACKLISTED" || ctx.reading.standing === "CANCELLED") out.push({ code: "ALREADY_BARRED", level: "block", data: { standing: ctx.reading.standing, since: (ctx.reading.blacklist ?? ctx.reading.cancellation)?.effectiveOn ?? null } });
  if (!i.reasonId) out.push({ code: "REASON_REQUIRED", level: "block" });
  else if (!ctx.reason || ctx.reason.appliesTo !== "SUSPEND") out.push({ code: "REASON_NOT_FOR_SUSPENSION", level: "block" });
  else if (ctx.reason.retiredOn && ctx.reason.retiredOn <= ctx.today) out.push({ code: "REASON_RETIRED", level: "block" });
  if (!i.effectiveOn) out.push({ code: "EFFECTIVE_REQUIRED", level: "block" });
  else if (i.effectiveOn > ctx.today) out.push({ code: "EFFECTIVE_IN_FUTURE", level: "block" });
  else if (ctx.registeredOn && i.effectiveOn < ctx.registeredOn) out.push({ code: "EFFECTIVE_BEFORE_REGISTRATION", level: "block", data: { registeredOn: ctx.registeredOn } });
  if (!i.personActive) out.push({ code: "PERSON_REQUIRED", level: "block" });
  if (i.flaggedDocumentIds.some((d) => !ctx.documentIds.includes(d))) out.push({ code: "DOCUMENT_NOT_ON_FILE", level: "block" });
  return out;
}

export type ReinstateFault =
  | "TIME_ZONE_UNSET"
  | "NOT_SUSPENDED"
  | "BLACKLISTED"
  | "FLAGGED_NOT_STANDING"
  | "LAPSED_SINCE"
  | "CHECKLIST_INCOMPLETE"
  | "STANDING_NOTE_REQUIRED"
  | "EFFECTIVE_REQUIRED"
  | "EFFECTIVE_IN_FUTURE"
  | "EFFECTIVE_BEFORE_SUSPENSION"
  | "PERSON_REQUIRED";

/// One line of the reinstatement checklist: a flagged document, and where its type stands now.
export interface ChecklistLine {
  documentId: string;
  typeLabel: string;
  /// The state of the document's type now (its newest verified document's).
  state: DocumentState;
}

/// The checklist a suspension's reinstatement answers: one line per document it was imposed for.
export function reinstatementChecklist(suspension: Pick<StandingEventFacts, "flaggedDocumentIds">, typeOf: (documentId: string) => { typeLabel: string; state: DocumentState } | null): ChecklistLine[] {
  return suspension.flaggedDocumentIds.flatMap((documentId) => {
    const t = typeOf(documentId);
    return t ? [{ documentId, ...t }] : [];
  });
}

export function reinstatementFaults(
  i: { checkedDocumentIds: readonly string[]; note: string; effectiveOn: string | null; personActive: boolean },
  ctx: { today: string | null; reading: StandingReading; checklist: readonly ChecklistLine[] },
): Finding<ReinstateFault>[] {
  if (!ctx.today) return [{ code: "TIME_ZONE_UNSET", level: "block" }];
  const out: Finding<ReinstateFault>[] = [];
  const s = ctx.reading.suspension;
  if (ctx.reading.standing === "BLACKLISTED") out.push({ code: "BLACKLISTED", level: "block" });
  if (!s) out.push({ code: "NOT_SUSPENDED", level: "block" });
  const notStanding = ctx.checklist.filter((c) => c.state !== "VALID" && c.state !== "NOT_APPLICABLE");
  if (notStanding.length) out.push({ code: "FLAGGED_NOT_STANDING", level: "block", data: { types: notStanding.map((c) => c.typeLabel).join(", ") } });
  if (ctx.reading.lapsed.length) out.push({ code: "LAPSED_SINCE", level: "block", data: { types: ctx.reading.lapsed.join(", ") } });
  const unticked = ctx.checklist.filter((c) => !i.checkedDocumentIds.includes(c.documentId));
  if (unticked.length) out.push({ code: "CHECKLIST_INCOMPLETE", level: "block", data: { types: unticked.map((c) => c.typeLabel).join(", ") } });
  if (!i.note.trim()) out.push({ code: "STANDING_NOTE_REQUIRED", level: "block" });
  if (!i.effectiveOn) out.push({ code: "EFFECTIVE_REQUIRED", level: "block" });
  else if (i.effectiveOn > ctx.today) out.push({ code: "EFFECTIVE_IN_FUTURE", level: "block" });
  else if (s && i.effectiveOn < s.effectiveOn) out.push({ code: "EFFECTIVE_BEFORE_SUSPENSION", level: "block", data: { since: s.effectiveOn } });
  if (!i.personActive) out.push({ code: "PERSON_REQUIRED", level: "block" });
  return out;
}
