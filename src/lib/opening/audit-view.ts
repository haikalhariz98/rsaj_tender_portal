/**
 * What the opening's audit rows say, in words (AGENTS.md rules 4 and 5): instants on the
 * organisation's clock to the second, days as the screens write them, money through `formatMoney`,
 * every enum by its label, never a code or an id. A price as read is written under the registered
 * SULIT key `openingPrice` and the disclosed estimate under `companyEstimate`, so the History chips
 * both (C-4). Every row's label starts with the exercise's reference, so its History finds it. Pure.
 */

import { receiptTime } from "@/lib/bids/labels";
import { formatDate } from "@/lib/format";
import { formatMoney, type Sen } from "@/lib/money";

import { ALTERNATIVE_LABEL, CHECKLIST_ANSWER_LABEL, COPY_CHECK_LABEL, GROUND_LABEL, OPENING_KIND_LABEL, periodText, REPORTED_LABEL, RESTRICTION_FINDING_LABEL, SALE_FINDING_LABEL, VERDICT_LABEL } from "./labels";
import type { Ground, Reported } from "./verdict";
import type { AlternativeConsideration, ChecklistAnswer, CopyCheck, OpeningKind, OpeningVerdict, PeriodUnit, RestrictionFinding, SaleFinding } from "./types";

/// The entity names the opening's rows are audited under.
export const OPENING_ENTITY = {
  opening: "Opening",
  sitting: "OpeningSitting",
  panel: "OpeningPanelMember",
  authorisation: "OpeningAuthorisation",
  bid: "OpenedBid",
  initial: "OpenedBidInitial",
  answer: "OpeningChecklistAnswer",
  signature: "OpeningSignature",
  explanation: "EstimateCopyExplanation",
  policy: "OpeningPolicy",
} as const;

export const OPENING_ENTITIES: readonly string[] = Object.values(OPENING_ENTITY);

/// How the History names each entity.
export const OPENING_ENTITY_LABEL: Readonly<Record<string, string>> = {
  Opening: "Opening",
  OpeningSitting: "Opening sitting",
  OpeningPanelMember: "Opening panel",
  OpeningAuthorisation: "Authorisation to open",
  OpenedBid: "Offer as read",
  OpenedBidInitial: "Initial",
  OpeningChecklistAnswer: "Checklist answer",
  OpeningSignature: "Signature on the schedule",
  EstimateCopyExplanation: "Estimate copy explanation",
  OpeningPolicy: "Opening rules",
};

const stamp = (d: Date | null | undefined, tz: string | null) => (d ? receiptTime(d, tz) : null);

export function openingStartFields(o: { kind: OpeningKind; committee: string; panel: readonly { name: string; present: boolean }[]; startedAt: Date; startedBy: string; panelOverride: { authority: string; reason: string; by: string } | null; independence: string; estimateLead: string; boxLockedAt: Date | null; lockGap: string | null }, tz: string | null) {
  return {
    opening: OPENING_KIND_LABEL[o.kind],
    committee: o.committee,
    panel: o.panel.map((p) => `${p.name}${p.present ? "" : " (absent)"}`).join(", "),
    started: stamp(o.startedAt, tz),
    startedBy: o.startedBy,
    panelOfAnotherSize: o.panelOverride ? `${o.panelOverride.authority}: ${o.panelOverride.reason} (${o.panelOverride.by})` : null,
    independence: o.independence,
    estimateLeadTime: o.estimateLead,
    boxLocked: stamp(o.boxLockedAt, tz),
    closingToLock: o.lockGap,
  };
}

export const authorisationFields = (a: { person: string; at: Date; sittingNo: number; opensTheBox: boolean; seat?: string | null }, tz: string | null) => ({
  authorisedBy: a.person,
  // NFR-SIG-001: the capacity it was made in. Absent where the caller does not say (the box's own rows repeat the authorisation's words).
  ...(a.seat !== undefined ? { inTheSeatOf: a.seat } : {}),
  at: stamp(a.at, tz),
  sitting: `Sitting ${a.sittingNo}`,
  result: a.opensTheBox ? "Second authorisation: the box opened" : "Recorded",
});

export const sittingFields = (s: { sittingNo: number; at: Date; by: string; adjourned: boolean; reason: string }, tz: string | null) => ({
  sitting: `Sitting ${s.sittingNo}`,
  [s.adjourned ? "adjourned" : "resumed"]: stamp(s.at, tz),
  recordedBy: s.by,
  reason: s.reason || null,
});

export function openedBidFields(b: { listingNo: number; envelope: string; bidder: string; registrationClass: string; registrationStatus: string; price: Sen; period: { value: number; unit: PeriodUnit } | null; validityDays: number | null; alternative: AlternativeConsideration | null; parentListingNo: number | null; sale: SaleFinding; restriction: RestrictionFinding; at: Date }, tz: string | null) {
  return {
    listing: `No. ${b.listingNo}`,
    envelope: b.envelope,
    bidder: b.bidder,
    registrationClass: b.registrationClass || null,
    registrationStatus: b.registrationStatus || null,
    /// SULIT (C-4): registered in sulit-fields.ts, chipped in the History.
    openingPrice: formatMoney(b.price),
    completionPeriod: periodText(b.period),
    validityStated: b.validityDays == null ? null : `${b.validityDays} days`,
    alternative: b.alternative ? `${ALTERNATIVE_LABEL[b.alternative]}${b.parentListingNo != null ? ` to No. ${b.parentListingNo}` : ""}` : null,
    purchase: SALE_FINDING_LABEL[b.sale],
    restriction: RESTRICTION_FINDING_LABEL[b.restriction],
    opened: stamp(b.at, tz),
  };
}

/// A correction's before or after: only what a correction touches (OD-10).
export const asReadFields = (b: { bidder: string; registrationClass: string; registrationStatus: string; price: Sen; period: { value: number; unit: PeriodUnit } | null; validityDays: number | null }) => ({
  bidder: b.bidder,
  registrationClass: b.registrationClass || null,
  registrationStatus: b.registrationStatus || null,
  openingPrice: formatMoney(b.price),
  completionPeriod: periodText(b.period),
  validityStated: b.validityDays == null ? null : `${b.validityDays} days`,
});

export const answerFields = (a: { item: string; answer: ChecklistAnswer | null }) => ({ item: a.item, answer: a.answer ? CHECKLIST_ANSWER_LABEL[a.answer] : null });

export const verdictFields = (v: { verdict: OpeningVerdict | null; reason: string; grounds: readonly Ground[]; reported: readonly Reported[]; missing: readonly string[] }) => ({
  verdict: v.verdict ? VERDICT_LABEL[v.verdict] : null,
  reason: v.reason || null,
  grounds: v.grounds.length ? v.grounds.map((g) => GROUND_LABEL[g]).join("; ") : null,
  reported: v.reported.length ? v.reported.map((r) => REPORTED_LABEL[r]).join("; ") : null,
  missing: v.missing.length ? v.missing.join(", ") : null,
});

export const initialFields = (i: { person: string; listingNo: number; at: Date }, tz: string | null) => ({ initialledBy: i.person, offer: `No. ${i.listingNo}`, at: stamp(i.at, tz) });
export const signatureFields = (s: { person: string; signedOn: string; seat?: string | null }) => ({ signedBy: s.person, ...(s.seat !== undefined ? { inTheSeatOf: s.seat } : {}), signedOn: formatDate(s.signedOn) });

export function finaliseFields(f: { at: Date; by: string; pages: number; rows: number; copy: CopyCheck | null; paper: Sen | null; lodged: Sen | null; disclosed: boolean }, tz: string | null) {
  return {
    finalised: stamp(f.at, tz),
    finalisedBy: f.by,
    pages: String(f.pages),
    offers: String(f.rows),
    estimateDisclosed: f.disclosed ? "yes" : null,
    /// SULIT: the disclosed estimate, and the paper's figure, under the registered key.
    companyEstimate: f.lodged != null ? formatMoney(f.lodged) : null,
    /// SULIT: the figure on the paper copy is the estimate's, under its own registered key.
    estimatePaperCopy: f.copy === "NOT_IN_BOX" ? "Not in the box" : f.paper != null ? formatMoney(f.paper) : null,
    copyCheck: f.copy ? COPY_CHECK_LABEL[f.copy] : null,
  };
}

export const withdrawalMatchFields = (m: { envelope: string; finding?: string; by?: string }) => (m.finding ? { finding: m.finding, recordedBy: m.by ? m.by : null } : { matchedTo: m.envelope });
