import type { Tx } from "@/lib/audit/record";
import type { SupplierActor } from "@/lib/auth/types";
import { storedDay } from "@/lib/dates";
import { readRegister } from "@/lib/suppliers/sale-hook";
import { mandatoryPermittedFor } from "@/lib/window/events";
import type { EventFacts } from "@/lib/window/types";

import { preSaleChecks, undatedChecks, type PreSaleCheck } from "./checks";
import { isInvited, type BidContext } from "./context-store";
import { inOrder } from "@/lib/series";

/**
 * What the pre-sale checks are judged on, for the signed-in supplier (FR-VND-012, FR-ADV-010, Phase 4d): the register's reading of THIS supplier now (the reading `recordSale` uses, taken without its lock),
 * the window's mandatory events with the officer's attendance register, the supplier's sale that stands, and its requests. Reads only, in the caller's client: the request act reads it again inside its own
 * transaction, on the locked window. Every read names the session's supplier and organisation.
 */

export interface SaleFacts {
  checks: PreSaleCheck[];
  /// The supplier's sale that stands (not voided), on any of its parties.
  sale: { id: string; soldOn: string; financeReceiptNo: string | null; receiptRecordedOn: string | null; voidedAt: Date | null } | null;
  /// The request of the supplier's that stands, if any (not withdrawn, not refused).
  standing: { id: string; requestedAt: Date; collectorName: string } | null;
  /// The latest request, where the checks refused it, with the checks as judged then. Null once a later request was made (and perhaps withdrawn): that refusal no longer applies.
  refused: { id: string; requestedAt: Date; checks: PreSaleCheck[] } | null;
  /// Whether mandatory attendance is permitted for this window, as it was published.
  permitted: boolean | null;
}

export async function loadSaleFacts(tx: Tx, actor: Pick<SupplierActor, "supplierId" | "organisationId">, ctx: BidContext): Promise<SaleFacts> {
  const window = ctx.ex.window;
  if (!window) return { checks: [], sale: null, standing: null, refused: null, permitted: null };
  const partyIds = ctx.parties.map((p) => p.id);
  const today = ctx.org.today;
  // What the supplier has and has asked for does not depend on the organisation's day, so it is read either way: a request that stands is seen as standing even where the checks cannot be made.
  const sold = partyIds.length ? tx.documentSale.findFirst({ where: { windowId: window.id, organisationId: actor.organisationId, partyId: { in: partyIds }, voidedAt: null }, select: { id: true, soldOn: true, financeReceiptNo: true, receiptRecordedOn: true, voidedAt: true } }) : Promise.resolve(null);
  const asked = tx.documentRequest.findMany({ where: { windowId: window.id, organisationId: actor.organisationId, supplierId: actor.supplierId }, orderBy: { requestedAt: "desc" }, select: { id: true, requestedAt: true, collectorName: true, checks: true, refusedAt: true, endedAt: true } });
  if (!today) {
    // The register's reading and the day-bound checks need the organisation's day; with no time zone set none is made, and the one check says why.
    const [sale, requests] = await Promise.all([sold, asked]);
    return shaped(undatedChecks(ctx.phase), sale, requests, null);
  }
  const [events, sale, requests, policy, register, windowRow] = await inOrder(
    () => tx.siteEvent.findMany({ where: { windowId: window.id, organisationId: actor.organisationId }, select: { id: true, kind: true, startsAt: true, place: true, mandatory: true, heldOn: true, cancelledAt: true, attendance: { select: { partyId: true } } } }),
    () => sold,
    () => asked,
    () => tx.tenderDocumentPolicy.findUnique({ where: { organisationId: actor.organisationId }, select: { restrictionLabelEn: true } }),
    () => readRegister(tx, { id: ctx.org.id, timeZone: ctx.org.timeZone, today }, actor.supplierId, ctx.ex.id),
    () => tx.exerciseWindow.findUniqueOrThrow({ where: { id: window.id, organisationId: actor.organisationId }, select: { publishedAt: true, policySnapshot: true } }));
  // The attendance rule is the one the window was published under, never today's configuration (what the notice stated).
  const live = await tx.windowPolicy.findUnique({ where: { organisationId: actor.organisationId }, select: { mandatoryAttendancePermitted: true } });
  const permitted = mandatoryPermittedFor(windowRow, live?.mandatoryAttendancePermitted ?? null).permitted;
  const facts: EventFacts[] = events.map((e) => ({ id: e.id, kind: e.kind, startsAt: e.startsAt, place: e.place, mandatory: e.mandatory, heldOn: e.heldOn ? storedDay(e.heldOn) : null, cancelled: e.cancelledAt != null, attendeePartyIds: e.attendance.map((a) => a.partyId) }));
  // One of the supplier's parties on the officer's register is enough.
  const mandatory = facts.filter((e) => e.mandatory === true && !e.cancelled);
  const attending = partyIds.find((id) => mandatory.every((e) => e.attendeePartyIds.includes(id)));
  const partyId = attending ?? partyIds[0] ?? null;

  const checks = preSaleChecks({
    phase: ctx.phase,
    path: ctx.path,
    invited: isInvited(ctx),
    register: register.check,
    restrictedTender: ctx.ex.restrictedTender,
    restrictionLabel: policy?.restrictionLabelEn?.trim() || null,
    events: facts,
    permitted,
    partyId,
    alreadyBought: sale != null,
  });
  return shaped(checks, sale, requests, permitted);
}

type SaleRow = { id: string; soldOn: Date; financeReceiptNo: string | null; receiptRecordedOn: Date | null; voidedAt: Date | null } | null;
type RequestRow = { id: string; requestedAt: Date; collectorName: string; checks: unknown; refusedAt: Date | null; endedAt: Date | null };

function shaped(checks: PreSaleCheck[], sale: SaleRow, requests: readonly RequestRow[], permitted: boolean | null): SaleFacts {
  const standing = requests.find((r) => r.refusedAt == null && r.endedAt == null) ?? null;
  // A refusal is told only while it is the last thing that happened: a request made and withdrawn since is the newer word, and the old refusal no longer applies.
  const latest = requests[0] ?? null;
  const refused = latest && latest.refusedAt != null ? latest : null;
  return {
    checks,
    sale: sale ? { id: sale.id, soldOn: storedDay(sale.soldOn), financeReceiptNo: sale.financeReceiptNo, receiptRecordedOn: sale.receiptRecordedOn ? storedDay(sale.receiptRecordedOn) : null, voidedAt: sale.voidedAt } : null,
    standing: standing ? { id: standing.id, requestedAt: standing.requestedAt, collectorName: standing.collectorName } : null,
    refused: refused ? { id: refused.id, requestedAt: refused.requestedAt, checks: refused.checks as PreSaleCheck[] } : null,
    permitted,
  };
}
