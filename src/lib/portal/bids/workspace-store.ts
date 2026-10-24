import type { Tx } from "@/lib/audit/record";
import type { SupplierActor } from "@/lib/auth/types";
import { dayIn, storedDay } from "@/lib/dates";
import { formatDate } from "@/lib/format";
import type { ExerciseStatus } from "@/lib/method/types";
import { formatMoney, senFromDecimal } from "@/lib/money";
import { instantText, isIssuedAward, isPublicOpportunity } from "@/lib/portal/public";
import { isMandatory, mandatoryPermittedFor } from "@/lib/window/events";
import { SITE_EVENT_KIND_LABEL } from "@/lib/window/labels";
import { tableDocumentAvailability } from "@/lib/window/phase";
import type { SiteEventKind } from "@/lib/window/types";

import { acknowledgeFaults } from "./acknowledge";
import { requestState, type PreSaleCheck, type RequestState } from "./checks";
import { isInvited, type BidContext } from "./context-store";
import { inspectionReading, type InspectionReading } from "./documents";
import { loadReleaseFacts } from "./inspection-store";
import { loadOnlineView, type OnlineView } from "./purchase-read";
import { loadMyNotices } from "./list-store";
import { awardStands, noticeStands } from "./non-award";
import { sortNotices, type PortalNotice } from "./notices";
import type { ReleaseState } from "./release";
import { loadSaleFacts } from "./sale-facts";
import { signUpFaults, signUpState, windowFault, withdrawFaults, type SignUpState } from "./signup";
import { bidStanding, type BidStanding } from "./standing";
import { bidFaultText } from "./words";
import { inOrder } from "@/lib/series";
import { packHasTableDocument } from "@/lib/tender-docs/repo";

/**
 * What each tab of one exercise's My Bids workspace reads (Phase 4d). One loader per tab, so a tab loads only its own slice and never a sibling's. Reads only, in the caller's client. Each takes the
 * context that `loadBidContext` returned for THIS supplier, so every read is of an exercise it may see and names the session's supplier and organisation.
 */

type Who = Pick<SupplierActor, "supplierId" | "organisationId">;

const feeText = (fee: { toString(): string } | null) => (fee == null ? null : formatMoney(senFromDecimal(fee)));
const dayText = (d: Date | null) => (d ? formatDate(storedDay(d)) : null);

// ------------------------------------------------------------------ briefings and site visits

export interface BriefingRow {
  id: string;
  kind: SiteEventKind;
  kindLabel: string;
  when: string;
  place: string;
  /// The notice made attendance mandatory (what it was published under).
  mandatory: boolean;
  cancelled: boolean;
  held: boolean;
  signUp: SignUpState;
  representative: string | null;
  /// Offered, or the reason it is not (in words). Withdrawal likewise.
  canSignUp: boolean;
  signUpWhy: string | null;
  canWithdraw: boolean;
  /// The officer's register has this supplier as attending (a held event only). A sign-up is not this.
  attended: boolean;
}

export async function briefingsTab(client: Tx, actor: Who, ctx: BidContext): Promise<{ rows: BriefingRow[]; mandatoryPermitted: boolean | null }> {
  const window = ctx.ex.window;
  if (!window) return { rows: [], mandatoryPermitted: null };
  const partyIds = ctx.parties.map((p) => p.id);
  const [events, mine, row, live] = await inOrder(
    () => client.siteEvent.findMany({ where: { windowId: window.id, organisationId: actor.organisationId }, orderBy: { startsAt: "asc" }, select: { id: true, kind: true, startsAt: true, place: true, mandatory: true, heldOn: true, cancelledAt: true, attendance: { select: { partyId: true } } } }),
    () => client.siteEventRegistration.findMany({ where: { organisationId: actor.organisationId, supplierId: actor.supplierId, event: { windowId: window.id } }, select: { eventId: true, representative: true, endedAt: true } }),
    () => client.exerciseWindow.findUniqueOrThrow({ where: { id: window.id, organisationId: actor.organisationId }, select: { publishedAt: true, policySnapshot: true } }),
    () => client.windowPolicy.findUnique({ where: { organisationId: actor.organisationId }, select: { mandatoryAttendancePermitted: true } }));
  const permitted = mandatoryPermittedFor(row, live?.mandatoryAttendancePermitted ?? null).permitted;
  const rows: BriefingRow[] = events.map((e) => {
    const reg = mine.find((m) => m.eventId === e.id) ?? null;
    const ev = { startsAt: e.startsAt, cancelled: e.cancelledAt != null, heldOn: e.heldOn ? storedDay(e.heldOn) : null };
    const state = signUpState(ev, reg ? { endedAt: reg.endedAt } : null, ctx.now);
    // The reason it is not offered is judged with a name in hand, so the missing name is never what is reported.
    const offered = signUpFaults({ event: ev, phase: ctx.phase, path: ctx.path, invited: isInvited(ctx), representative: "-", existing: reg ? { endedAt: reg.endedAt } : null, now: ctx.now }).filter((f) => f.level === "block");
    const why = offered.length > 0 && state !== "SIGNED_UP" ? bidFaultText(offered[0]!).en : null;
    const withdrawable = reg != null && reg.endedAt == null && withdrawFaults({ event: ev, phase: ctx.phase, existing: { endedAt: null }, now: ctx.now }).length === 0;
    return {
      id: e.id,
      kind: e.kind,
      kindLabel: SITE_EVENT_KIND_LABEL[e.kind],
      when: e.startsAt ? instantText(e.startsAt, ctx.org.timeZone) : "No start time yet",
      place: e.place,
      mandatory: isMandatory({ mandatory: e.mandatory, cancelled: e.cancelledAt != null }, permitted),
      cancelled: e.cancelledAt != null,
      held: e.heldOn != null,
      signUp: state,
      representative: reg && reg.endedAt == null ? reg.representative : null,
      canSignUp: offered.length === 0,
      signUpWhy: why,
      canWithdraw: withdrawable,
      attended: e.heldOn != null && e.attendance.some((a) => partyIds.includes(a.partyId)),
    };
  });
  return { rows, mandatoryPermitted: permitted };
}

// ------------------------------------------------------------------ addenda and notices

export interface AddendumRow {
  id: string;
  number: number | null;
  title: string;
  whatChanged: string;
  issuedOn: string | null;
  newClosing: string | null;
  /// One of the supplier's parties holds a copy of it (it bought the documents, or the addendum came with them).
  holdsCopy: boolean;
  withDocuments: boolean;
  acknowledgedOn: string | null;
  canAcknowledge: boolean;
  whyNot: string | null;
}

export async function addendaTab(client: Tx, actor: Who, ctx: BidContext): Promise<{ addenda: AddendumRow[]; notices: PortalNotice[] }> {
  const window = ctx.ex.window;
  if (!window) return { addenda: [], notices: [] };
  const partyIds = ctx.parties.map((p) => p.id);
  const [addenda, acks, all] = await inOrder(
    () => client.addendum.findMany({
      where: { windowId: window.id, organisationId: actor.organisationId, status: "ISSUED" },
      orderBy: { number: "asc" },
      select: { id: true, number: true, title: true, whatChanged: true, status: true, issuedOn: true, closingChange: { select: { toClosingAt: true, appliedAt: true } }, recipients: { where: { partyId: { in: partyIds } }, select: { withDocuments: true } } },
    }),
    () => client.addendumAcknowledgement.findMany({ where: { organisationId: actor.organisationId, supplierId: actor.supplierId, addendum: { windowId: window.id } }, select: { addendumId: true, acknowledgedOn: true } }),
    () => loadMyNotices(client, actor, ctx.now));
  const rows: AddendumRow[] = addenda.map((a) => {
    const ack = acks.find((x) => x.addendumId === a.id) ?? null;
    const faults = acknowledgeFaults({ addendum: a, phase: ctx.phase, holdsCopy: a.recipients.length > 0, alreadyAcknowledged: ack != null }).filter((f) => f.level === "block");
    return {
      id: a.id,
      number: a.number,
      title: a.title,
      whatChanged: a.whatChanged,
      issuedOn: dayText(a.issuedOn),
      newClosing: a.closingChange?.appliedAt ? instantText(a.closingChange.toClosingAt, ctx.org.timeZone) : null,
      holdsCopy: a.recipients.length > 0,
      withDocuments: a.recipients.some((r) => r.withDocuments),
      acknowledgedOn: ack ? formatDate(storedDay(ack.acknowledgedOn)) : null,
      canAcknowledge: faults.length === 0,
      whyNot: faults.length > 0 && !ack ? bidFaultText(faults[0]!).en : null,
    };
  });
  return { addenda: rows, notices: sortNotices(all.filter((n) => n.exerciseId === ctx.ex.id && n.kind !== "ADDENDUM" && n.kind !== "NON_AWARD")) };
}

// ------------------------------------------------------------------ the documents

export interface DocumentsView {
  sale: { from: string | null; until: string | null; place: string; fee: string | null; payment: string; inspectionPlace: string; inspectionHours: string };
  checks: PreSaleCheck[];
  request: { state: RequestState; requestedOn: string | null; collector: string | null } | null;
  /// Why the last attempt was refused, where one was and nothing stands since.
  refused: { on: string; reasons: string[] } | null;
  bought: { on: string; receiptRecorded: boolean } | null;
  /// Whether the request is offered now, and the reasons it is not.
  canRequest: boolean;
  /// Null: the exercise has no Tender Table Document (a quotation whose parts all answer "no", FR-DOC-010), so none is offered.
  table: InspectionReading | null;
  release: { state: ReleaseState; short: string; detail: string };
  /// SR-10: buying the documents online, on an exercise sold that way; null at the counter.
  online: OnlineView | null;
}

export async function documentsTab(client: Tx, actor: Who & Pick<SupplierActor, "accountId" | "displayName">, ctx: BidContext): Promise<DocumentsView> {
  const w = ctx.ex.window;
  const facts = await loadSaleFacts(client, actor, ctx);
  const release = await loadReleaseFacts(client, actor, ctx);
  const blocks = facts.checks.filter((c) => c.state === "BLOCK");
  const bought = facts.sale ? { on: formatDate(facts.sale.soldOn), receiptRecorded: facts.sale.financeReceiptNo != null && facts.sale.financeReceiptNo.trim() !== "" } : null;
  const request = facts.standing ? { state: requestState({ refusedAt: null, endedAt: null }, bought != null), requestedOn: formatDate(dayIn(facts.standing.requestedAt, ctx.org.timeZone)), collector: facts.standing.collectorName } : null;
  return {
    sale: {
      from: dayText(w?.purchaseFromDay ?? null),
      until: dayText(w?.purchaseCloseDay ?? null),
      place: w?.purchasePlace ?? "",
      fee: feeText(w?.feeAmount ?? null),
      payment: w?.feePaymentMethods ?? "",
      inspectionPlace: w?.inspectionPlace ?? "",
      inspectionHours: w?.inspectionHours ?? "",
    },
    checks: facts.checks,
    request,
    refused: facts.refused && !facts.standing && bought == null ? { on: formatDate(dayIn(facts.refused.requestedAt, ctx.org.timeZone)), reasons: facts.refused.checks.filter((c) => c.state === "BLOCK").map((c) => c.detail) } : null,
    bought,
    canRequest: blocks.length === 0 && facts.standing == null && facts.sale == null && facts.checks.length > 0,
    table: (await packHasTableDocument(actor.organisationId, ctx.ex.id, client)) ? inspectionReading(tableDocumentAvailability(ctx.phase), { approved: true }) : null,
    release: { state: release.state, short: release.words.short, detail: release.words.detail },
    online: await loadOnlineView(client, actor, ctx),
  };
}

// ------------------------------------------------------------------ the outcome

export interface OutcomeView {
  standing: BidStanding;
  /// The notice of the outcome issued to this supplier under an award that stands, if one was.
  notice: { on: string; outcomeText: string; reasonText: string } | null;
  /// A notice was issued under an award that was cancelled since, and none stands: said, not repeated.
  supersededNotice: { on: string } | null;
  /// An award was issued and none went to this supplier, so the supplier is told whether a notice was issued to it.
  awardIssuedElsewhere: boolean;
  /// The award is published under Results, so the screen may point there.
  inResults: boolean;
}

export async function outcomeTab(client: Tx, actor: Who, ctx: BidContext): Promise<OutcomeView> {
  const partyIds = ctx.parties.map((p) => p.id);
  const [opened, awards, notices] = await inOrder(
    () => partyIds.length ? client.openedBid.count({ where: { exerciseId: ctx.ex.id, organisationId: actor.organisationId, partyId: { in: partyIds } } }) : Promise.resolve(0),
    () => client.award.findMany({ where: { exerciseId: ctx.ex.id, organisationId: actor.organisationId }, select: { status: true, awardeePartyId: true } }),
    () => partyIds.length ? client.nonAwardNotice.findMany({ where: { exerciseId: ctx.ex.id, organisationId: actor.organisationId, partyId: { in: partyIds } }, orderBy: [{ issuedAt: "desc" }, { id: "desc" }], select: { issuedOn: true, outcomeText: true, reasonText: true, award: { select: { status: true } } } }) : Promise.resolve([]));
  const issued = awards.find((a) => isIssuedAward(a.status));
  const closed = ctx.ex.closingAt != null && ctx.now.getTime() >= ctx.ex.closingAt.getTime();
  // The same test `toPublicResult` applies, so the screen points to Results only where the award really is there.
  const inResults = isPublicOpportunity({ status: ctx.ex.status as ExerciseStatus, restricted: ctx.ex.restricted, closingAt: ctx.ex.closingAt, window: ctx.ex.window ? { path: ctx.ex.window.path, publishedAt: ctx.ex.window.publishedAt } : null });
  const standing = bidStanding({
    status: ctx.ex.status as ExerciseStatus,
    closed,
    opened: opened > 0,
    award: issued ? { issued: awardStands(issued.status), awardeeIsYou: issued.awardeePartyId != null && partyIds.includes(issued.awardeePartyId) } : null,
    inResults,
  });
  // A notice stands with its award: the latest one under an award that still stands is the notice; one under an award since cancelled is superseded.
  const current = notices.find((n) => noticeStands(n.award.status)) ?? null;
  const old = current ? null : (notices[0] ?? null);
  return {
    standing,
    notice: current ? { on: formatDate(storedDay(current.issuedOn)), outcomeText: current.outcomeText, reasonText: current.reasonText } : null,
    supersededNotice: old ? { on: formatDate(storedDay(old.issuedOn)) } : null,
    awardIssuedElsewhere: issued != null && !(issued.awardeePartyId != null && partyIds.includes(issued.awardeePartyId)),
    inResults,
  };
}

// ------------------------------------------------------------------ the overview

export interface OverviewView {
  /// `submissionPlace` is empty for an exercise sold online (SR-10): there is no counter, so no place is stated.
  facts: { closing: string | null; saleFrom: string | null; saleUntil: string | null; submissionPlace: string; online: boolean; via: "PUBLIC" | "LINKED"; parties: string[] };
  standing: BidStanding;
  /// What the supplier has done and what comes next, in words, most pressing first.
  todo: string[];
}

/**
 * The Overview reads a few counts of its own and nothing of a sibling tab: not the notices across every exercise, not the register's reading of the supplier. It says where the supplier is, and sends it to the
 * tab that holds the rest (the pre-sale checks, for one, are judged on the Documents tab and again when a request is made).
 */
export async function overviewTab(client: Tx, actor: Who, ctx: BidContext): Promise<OverviewView> {
  const window = ctx.ex.window;
  const partyIds = ctx.parties.map((p) => p.id);
  const standing = await outcomeTab(client, actor, ctx);
  const [events, registrations, copies, acks, sale, requests] = window
    ? await inOrder(
        () => client.siteEvent.findMany({ where: { windowId: window.id, organisationId: actor.organisationId }, select: { id: true, kind: true, startsAt: true, heldOn: true, cancelledAt: true } }),
        () => client.siteEventRegistration.findMany({ where: { organisationId: actor.organisationId, supplierId: actor.supplierId, event: { windowId: window.id } }, select: { eventId: true, endedAt: true } }),
        () => partyIds.length ? client.addendumRecipient.findMany({ where: { organisationId: actor.organisationId, partyId: { in: partyIds }, addendum: { windowId: window.id, status: "ISSUED" } }, select: { addendumId: true } }) : Promise.resolve([]),
        () => client.addendumAcknowledgement.findMany({ where: { organisationId: actor.organisationId, supplierId: actor.supplierId, addendum: { windowId: window.id } }, select: { addendumId: true } }),
        () => partyIds.length ? client.documentSale.findFirst({ where: { windowId: window.id, organisationId: actor.organisationId, partyId: { in: partyIds }, voidedAt: null }, select: { financeReceiptNo: true } }) : Promise.resolve(null),
        () => client.documentRequest.findMany({ where: { windowId: window.id, organisationId: actor.organisationId, supplierId: actor.supplierId }, orderBy: { requestedAt: "desc" }, take: 1, select: { refusedAt: true, endedAt: true } }),)
    : [[], [], [], [], null, []];

  const todo: string[] = [];
  const open = windowFault(ctx.phase) == null;
  const acked = new Set(acks.map((a) => a.addendumId));
  const toAck = open ? new Set(copies.map((c) => c.addendumId).filter((id) => !acked.has(id))).size : 0;
  if (toAck > 0) todo.push(toAck === 1 ? "Acknowledge the addendum that came with your documents." : `Acknowledge ${toAck} addenda.`);
  if (sale) todo.push(sale.financeReceiptNo && sale.financeReceiptNo.trim() ? "The documents were sold to your company and the payment is recorded." : "The documents were sold to your company; the payment receipt is not recorded yet.");
  else if (requests[0] && requests[0].refusedAt == null && requests[0].endedAt == null) todo.push("Documents requested. Waiting for the procurement office.");
  else if (requests[0]?.refusedAt) todo.push("Request refused. See Documents.");
  else if (ctx.phase === "OPEN_FOR_PURCHASE") todo.push("Documents on sale. Ask under Documents.");
  const upcoming = events.filter((e) => {
    const reg = registrations.find((r) => r.eventId === e.id) ?? null;
    return signUpFaults({ event: { startsAt: e.startsAt, cancelled: e.cancelledAt != null, heldOn: e.heldOn ? storedDay(e.heldOn) : null }, phase: ctx.phase, path: ctx.path, invited: isInvited(ctx), representative: "-", existing: reg ? { endedAt: reg.endedAt } : null, now: ctx.now }).length === 0;
  });
  if (upcoming.length > 0) todo.push(upcoming.length === 1 ? `Sign up for the ${SITE_EVENT_KIND_LABEL[upcoming[0]!.kind].toLowerCase()} on ${upcoming[0]!.startsAt ? instantText(upcoming[0]!.startsAt, ctx.org.timeZone) : "a day to be set"}.` : `Sign up for the ${upcoming.length} briefings and site visits ahead.`);
  if (standing.notice) todo.push("Outcome notice issued. Read it under Outcome.");
  return {
    facts: {
      closing: ctx.ex.closingAt && ctx.ex.status !== "CANCELLED" ? instantText(ctx.ex.closingAt, ctx.org.timeZone) : null,
      saleFrom: dayText(window?.purchaseFromDay ?? null),
      saleUntil: dayText(window?.purchaseCloseDay ?? null),
      submissionPlace: ctx.ex.saleMode === "ONLINE" ? "" : (window?.submissionPlace ?? ""),
      online: ctx.ex.saleMode === "ONLINE",
      via: ctx.seen.via,
      parties: ctx.parties.map((p) => p.name),
    },
    standing: standing.standing,
    todo,
  };
}
