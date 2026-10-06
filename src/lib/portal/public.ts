/**
 * What the public may see of a sourcing exercise: the rule that says whether an exercise is an
 * opportunity at all, and the projection that turns what was read into plain strings.
 *
 * Pure. The rule fails closed: an exercise is public only on evidence that it was advertised, and
 * every status is decided here by name (a state added to the enum fails to compile until it is).
 *
 * What a public page must never carry is enforced twice. `OPPORTUNITY_SELECT` (repo.ts) is the one
 * read, and names no estimate, price, evaluation, invitee, purchaser or officer; and this
 * projection emits only strings and flags, never a row, so nothing else can ride along into a
 * page's payload. `public.test.ts` scans both.
 */

import { dayIn, storedDay } from "@/lib/dates";
import { formatOrgDateTime } from "@/lib/format";
import { formatDay } from "@/lib/award/fields";
import { formatMoney, senFromDecimal } from "@/lib/money";
import type { ExerciseStatus } from "@/lib/method/types";
import { asHeading } from "@/lib/suppliers/labels";
import { groupsOf } from "@/lib/tender-docs/eligibility";
import { mandatoryPermittedFor, isMandatory } from "@/lib/window/events";
import { windowPhase } from "@/lib/window/phase";

/// How the exercise stands for a reader. Derived, never stored.
export type OpportunityState = "OPEN" | "CLOSED" | "AWARDED" | "CANCELLED";

/// Whether the documents are on sale now: derived from the window's days and the clock.
export type SaleState = "NOT_YET" | "OPEN" | "ENDED" | "UNKNOWN";

export type SiteEventKindFact = "BRIEFING" | "SITE_VISIT";

/// What the rule needs to know about an exercise. Nothing about value, bids or people.
export interface PublicFacts {
  status: ExerciseStatus;
  /// The method's confidential flag as it stood (FR-MTD-007): always hides the exercise.
  restricted: boolean;
  closingAt: Date | null;
  window: { path: "ADVERTISED" | "INVITED"; publishedAt: Date | null } | null;
}

const never = (x: never): never => {
  throw new Error(`Unhandled exercise status: ${String(x)}`);
};

/**
 * Whether an exercise is an opportunity the public may read. Only an exercise that was advertised:
 * its window's own path says ADVERTISED and records a publication. The method's flags are not
 * consulted, because they say what the method would do, not what happened. An invited exercise is
 * never public, and a cancelled one is public only if it had been published.
 *
 * `restrictedTender` (a bidder restriction the notice states) does not hide anything: it is an
 * eligibility condition, shown as such. `restricted` (the confidential flag) always hides.
 */
export function isPublicOpportunity(f: PublicFacts): boolean {
  if (f.restricted) return false;
  if (!f.window || f.window.path !== "ADVERTISED" || f.window.publishedAt == null) return false;
  const s = f.status;
  switch (s) {
    case "DRAFT":
    case "DOCUMENTS_IN_PREPARATION":
    case "PENDING_APPROVAL_FOR_TENDERING":
    case "APPROVED_FOR_TENDERING":
    case "INVITED":
      return false;
    case "ADVERTISED":
    case "OPENING_IN_PROGRESS":
    case "OPENED":
    case "UNDER_EVALUATION":
    case "EVALUATED":
      // A published exercise with no closing cannot be listed honestly.
      return f.closingAt != null;
    case "CANCELLED":
      return true;
    default:
      return never(s);
  }
}

/// The state a reader sees. A closed exercise is "Closed", whatever its stage after the closing:
/// the opening and the evaluation are not public.
export function opportunityState(f: { status: ExerciseStatus; closingAt: Date | null }, awarded: boolean, now: Date): OpportunityState {
  if (f.status === "CANCELLED") return "CANCELLED";
  if (awarded) return "AWARDED";
  if (f.closingAt && now.getTime() >= f.closingAt.getTime()) return "CLOSED";
  return "OPEN";
}

/// An award counts only once issued (and still standing if accepted): the one definition the board and Results share.
export const isIssuedAward = (status: string): boolean => status === "ISSUED" || status === "ACCEPTED";

/// The statuses an advertised exercise is read in, for the query (the rule above is still the authority).
export const PUBLISHED_OR_CANCELLED: readonly ExerciseStatus[] = ["ADVERTISED", "OPENING_IN_PROGRESS", "OPENED", "UNDER_EVALUATION", "EVALUATED", "CANCELLED"];

/// Money in the form the notice states it, from the stored decimal.
const feeText = (fee: { toString(): string } | null) => (fee == null ? null : formatMoney(senFromDecimal(fee)));

/// An instant as the organisation reads it; with no zone set, in UTC and said so plainly.
export function instantText(at: Date, timeZone: string | null): string {
  return timeZone ? formatOrgDateTime(at, timeZone) : `${formatOrgDateTime(at, "UTC")} UTC`;
}

/// What the one read returns (see OPPORTUNITY_SELECT). Declared here so the projection is testable without a database.
export interface OpportunityRow {
  id: string;
  reference: string;
  title: string;
  status: ExerciseStatus;
  restricted: boolean;
  restrictedTender: boolean | null;
  closingAt: Date | null;
  sourcingMethodCode: string;
  awards: { status: string }[];
  registrationRequirements: { bodyLabelSnapshot: string; qualifiers: string; alternativeGroup: number; sortOrder: number }[];
  window: {
    path: "ADVERTISED" | "INVITED";
    publishedAt: Date | null;
    policySnapshot: unknown;
    purchaseFromDay: Date | null;
    purchaseCloseDay: Date | null;
    purchasePlace: string;
    inspectionPlace: string;
    inspectionHours: string;
    feeAmount: { toString(): string } | null;
    feePaymentMethods: string;
    submissionPlace: string;
    noticeText: string | null;
    events: { kind: SiteEventKindFact; startsAt: Date; place: string; mandatory: boolean | null; cancelledAt: Date | null }[];
    addenda: { number: number | null; title: string; whatChanged: string; issuedOn: Date | null; closingChange: { toClosingAt: Date; appliedAt: Date | null } | null }[];
    cancellations: { appliedAt: Date | null }[];
  } | null;
}

export interface ProjectionContext {
  now: Date;
  timeZone: string | null;
  /// The method's configured English name by code; a code with no row reads as a worded fallback upstream.
  methodNames: ReadonlyMap<string, string>;
  /// The organisation's own words for the restriction on bidders (TenderDocumentPolicy), or null where none is set.
  restrictionLabel: string | null;
}

export interface PublicEvent {
  kind: SiteEventKind;
  when: string;
  place: string;
  mandatory: boolean;
  cancelled: boolean;
}
type SiteEventKind = SiteEventKindFact;

export interface PublicAddendum {
  number: number | null;
  title: string;
  whatChanged: string;
  issuedOn: string | null;
  newClosing: string | null;
}

export interface PublicDetail {
  sale: { state: SaleState; from: string | null; until: string | null; place: string; fee: string | null; payment: string; inspectionPlace: string; inspectionHours: string; submissionPlace: string };
  events: PublicEvent[];
  addenda: PublicAddendum[];
  /// Each group's alternatives; a bidder holds one from every group.
  registrations: string[][];
  /// A restriction on bidders the notice states, in the organisation's words (null: none stated).
  restriction: { stated: boolean; label: string | null } | null;
  notice: string | null;
}

export interface PublicOpportunity {
  id: string;
  reference: string;
  title: string;
  method: string;
  state: OpportunityState;
  /// The closing as the organisation reads it; for a cancelled exercise, null.
  closing: string | null;
  /// The organisation's closing day (YYYY-MM-DD), for sorting; null for a cancelled exercise.
  closingDay: string | null;
  cancelledOn: string | null;
  /// Null for a cancelled exercise: it is shown only as cancelled.
  detail: PublicDetail | null;
}

const saleOf = (state: ReturnType<typeof windowPhase>["phase"]): SaleState => {
  switch (state) {
    case "PUBLISHED": return "NOT_YET";
    case "OPEN_FOR_PURCHASE": return "OPEN";
    case "CLOSED_FOR_PURCHASE": return "ENDED";
    case "NOT_PUBLISHED":
    case "CLOSED":
    case "CANCELLED":
    case "UNKNOWN":
      return "UNKNOWN";
  }
};

/**
 * One exercise as the public page shows it, or null where it is not public. Everything returned is
 * a string, a number or a flag: no row, no blob, no relation.
 */
export function toPublicOpportunity(row: OpportunityRow, ctx: ProjectionContext): PublicOpportunity | null {
  if (!isPublicOpportunity({ status: row.status, restricted: row.restricted, closingAt: row.closingAt, window: row.window ? { path: row.window.path, publishedAt: row.window.publishedAt } : null })) return null;
  const w = row.window!;
  const awarded = row.awards.some((a) => isIssuedAward(a.status));
  const state = opportunityState(row, awarded, ctx.now);
  const base = { id: row.id, reference: row.reference, title: row.title, method: ctx.methodNames.get(row.sourcingMethodCode) ?? "", state };

  if (state === "CANCELLED") {
    const applied = w.cancellations.find((c) => c.appliedAt)?.appliedAt ?? null;
    return { ...base, closing: null, closingDay: null, cancelledOn: applied ? formatDay(dayIn(applied, ctx.timeZone), "EN") : null, detail: null };
  }

  const closingAt = row.closingAt!;
  const phase = windowPhase({ status: row.status, purchaseFromDay: w.purchaseFromDay, purchaseCloseDay: w.purchaseCloseDay, closingAt }, ctx.now, ctx.timeZone).phase;
  // Whether an event is mandatory is what the notice stated, never today's configuration.
  const permitted = mandatoryPermittedFor({ publishedAt: w.publishedAt, policySnapshot: w.policySnapshot }, null).permitted;
  const registrations = groupsOf(row.registrationRequirements.map((r) => ({ ...r }))).map((g) => g.map((r) => (r.qualifiers.trim() ? `${asHeading(r.bodyLabelSnapshot)} (${r.qualifiers.trim()})` : asHeading(r.bodyLabelSnapshot))));

  return {
    ...base,
    closing: instantText(closingAt, ctx.timeZone),
    closingDay: dayIn(closingAt, ctx.timeZone),
    cancelledOn: null,
    detail: {
      sale: {
        state: saleOf(phase),
        from: w.purchaseFromDay ? formatDay(storedDay(w.purchaseFromDay), "EN") : null,
        until: w.purchaseCloseDay ? formatDay(storedDay(w.purchaseCloseDay), "EN") : null,
        place: w.purchasePlace,
        fee: feeText(w.feeAmount),
        payment: w.feePaymentMethods,
        inspectionPlace: w.inspectionPlace,
        inspectionHours: w.inspectionHours,
        submissionPlace: w.submissionPlace,
      },
      events: [...w.events]
        .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime())
        .map((e) => ({ kind: e.kind, when: instantText(e.startsAt, ctx.timeZone), place: e.place, mandatory: isMandatory({ mandatory: e.mandatory, cancelled: e.cancelledAt != null }, permitted), cancelled: e.cancelledAt != null })),
      addenda: [...w.addenda]
        .sort((a, b) => (a.number ?? 0) - (b.number ?? 0))
        .map((a) => ({
          number: a.number,
          title: a.title,
          whatChanged: a.whatChanged,
          issuedOn: a.issuedOn ? formatDay(storedDay(a.issuedOn), "EN") : null,
          // A new closing is public only once it was applied; a requested one is not yet the closing.
          newClosing: a.closingChange?.appliedAt ? instantText(a.closingChange.toClosingAt, ctx.timeZone) : null,
        })),
      registrations,
      restriction: row.restrictedTender === true ? { stated: true, label: ctx.restrictionLabel } : null,
      notice: w.noticeText,
    },
  };
}
