import type { Tx } from "@/lib/audit/record";
import type { SupplierActor } from "@/lib/auth/types";
import { db } from "@/lib/db";
import { printView } from "@/lib/tender-docs/read";
import { instantText } from "@/lib/portal/public";
import { sinceApprovedLines, tableDocumentAvailability } from "@/lib/window/phase";

import { loadBidContext, type BidContext } from "./context-store";
import { downloadRequestFault } from "@/lib/documents/request-guard";

import { inspectionReading, isRepeatInspection } from "./documents";
import type { PurchaseState } from "./purchase";
import { releaseState, releaseWords, type ReleaseState } from "./release";

/**
 * A supplier opens the Tender Table Document, or the pack released to it (FR-DOC-010, FR-VND-012, Phase 4d).
 *
 * The inspection log is written FIRST and in its own transaction, and the content is read only after it commits: where the row cannot be written, the error propagates and nothing is shown. Only the approved, frozen
 * version is ever shown (a version still being drafted is the office's working copy). The table document is open to any supplier who may see the exercise while it is available for inspection
 * (`tableDocumentAvailability`). The pack is shown only when the release rules say so (`releaseState`): the organisation has set that documents are released online, and a sale to this supplier stands with its
 * payment receipt recorded by an officer. Each answer says in words why it is closed; none is a blank page. Every read names the session's supplier and organisation.
 */

/// The documents as the print view returns them: the approved, frozen text in print order.
export type PrintedView = Exclude<NonNullable<Awaited<ReturnType<typeof printView>>>, { none: true }>;

export type OpenResult =
  /// `since`: what has changed since the documents were approved (the closing, the addenda), said beside them: the text shown is as approved.
  | { open: true; ctx: BidContext; view: PrintedView; since: string[] }
  /// `crossSite`: the request was started by another site, so nothing was read or logged.
  | { open: false; ctx: BidContext | null; headline: string; detail: string; crossSite?: true };

/// The supplier's sale that stands on this window, and the organisation's release setting, read together.
export async function loadReleaseFacts(tx: Tx, actor: Pick<SupplierActor, "supplierId" | "organisationId">, ctx: BidContext): Promise<{ state: ReleaseState; setting: boolean | null; sale: { id: string; soldOn: Date; financeReceiptNo: string | null; paymentChannel: "COUNTER" | "SIMULATED" } | null; purchase: { id: string; state: PurchaseState } | null }> {
  const window = ctx.ex.window;
  const partyIds = ctx.parties.map((p) => p.id);
  const [policy, sale, purchase] = await Promise.all([
    tx.windowPolicy.findUnique({ where: { organisationId: actor.organisationId }, select: { electronicDocumentRelease: true } }),
    window && partyIds.length ? tx.documentSale.findFirst({ where: { windowId: window.id, organisationId: actor.organisationId, partyId: { in: partyIds }, voidedAt: null }, select: { id: true, soldOn: true, financeReceiptNo: true, voidedAt: true, paymentChannel: true } }) : Promise.resolve(null),
    // SR-10: the supplier's online purchase of the documents, if it made one.
    window ? tx.documentPurchase.findUnique({ where: { windowId_supplierId: { windowId: window.id, supplierId: actor.supplierId } }, select: { id: true, state: true, organisationId: true } }) : Promise.resolve(null),
  ]);
  const setting = policy?.electronicDocumentRelease ?? null;
  const mine = purchase && purchase.organisationId === actor.organisationId ? { id: purchase.id, state: purchase.state } : null;
  return {
    state: releaseState({ setting, sale: sale ? { voidedAt: sale.voidedAt, financeReceiptNo: sale.financeReceiptNo, paymentChannel: sale.paymentChannel } : null, purchase: mine, phase: ctx.phase }),
    setting,
    sale: sale ? { id: sale.id, soldOn: sale.soldOn, financeReceiptNo: sale.financeReceiptNo, paymentChannel: sale.paymentChannel } : null,
    purchase: mine,
  };
}

/**
 * Writes the opening to the log, unless the supplier's last opening of the same version is so recent that the log already says it (`isRepeatInspection`). The log cannot be corrected or emptied, so its growth is bounded
 * by the sitting, not by how often a page is fetched. Where the row cannot be written, the error propagates.
 */
export async function recordInspection(client: Tx, actor: Pick<SupplierActor, "supplierId" | "organisationId" | "accountId">, w: { windowId: string; kind: "TABLE_DOCUMENT" | "PACK"; documentVersion: number }, now: Date): Promise<{ written: boolean }> {
  const last = await client.tenderInspectionEvent.findFirst({
    where: { organisationId: actor.organisationId, windowId: w.windowId, supplierId: actor.supplierId, kind: w.kind, documentVersion: w.documentVersion },
    orderBy: { viewedAt: "desc" },
    select: { viewedAt: true },
  });
  if (isRepeatInspection(last?.viewedAt ?? null, now)) return { written: false };
  await client.tenderInspectionEvent.create({
    data: { organisationId: actor.organisationId, windowId: w.windowId, supplierId: actor.supplierId, kind: w.kind, documentVersion: w.documentVersion, viewedBySupplierAccountId: actor.accountId, viewedAt: now },
  });
  return { written: true };
}

export async function openForInspection(actor: SupplierActor, i: { exerciseId: string; kind: "TABLE_DOCUMENT" | "PACK"; secFetchSite?: string | null }, now: Date = new Date()): Promise<OpenResult> {
  // A page on another site can send a signed-in supplier's browser here, and each opening is a permanent row against that supplier. A request another site started reads nothing and logs nothing.
  if (downloadRequestFault(i.secFetchSite ?? null)) return { open: false, ctx: null, crossSite: true, headline: "Open this from your own list", detail: "This page was reached from another site, so it was not opened and nothing was logged. Open the exercise from My Bids and choose the documents there." };
  const ctx = await loadBidContext(db, actor, i.exerciseId, now);
  if (!ctx || !ctx.ex.window) return { open: false, ctx: null, headline: "Not found", detail: "That exercise is not one you can open." };

  if (i.kind === "PACK") {
    const release = await loadReleaseFacts(db, actor, ctx);
    if (release.state !== "READY") return { open: false, ctx, headline: releaseWords[release.state].short, detail: releaseWords[release.state].detail };
  } else {
    const early = inspectionReading(tableDocumentAvailability(ctx.phase), { approved: true });
    if (!early.open) return { open: false, ctx, headline: early.headline, detail: early.detail };
  }

  // Read what would be shown, so a version that may not be shown is refused before anything is logged.
  const view = await printView(actor.organisationId, i.exerciseId, i.kind === "PACK" ? "pack" : "table");
  if (!view || "none" in view) return { open: false, ctx, headline: "Not available", detail: "The procurement office has no documents for this exercise to show." };
  if (view.watermark != null) {
    const reading = inspectionReading("AVAILABLE", { approved: false });
    return { open: false, ctx, headline: reading.open ? "Not available" : reading.headline, detail: reading.open ? "" : reading.detail };
  }

  // The log first: where it cannot be written, this throws and nothing below runs.
  await recordInspection(db, actor, { windowId: ctx.ex.window.id, kind: i.kind, documentVersion: view.version }, now);
  const [closingChanges, addendaIssued] = await Promise.all([
    db.closingChange.count({ where: { windowId: ctx.ex.window.id, organisationId: actor.organisationId, appliedAt: { not: null } } }),
    db.addendum.count({ where: { windowId: ctx.ex.window.id, organisationId: actor.organisationId, status: "ISSUED" } }),
  ]);
  return { open: true, ctx, view, since: sinceApprovedLines({ closing: ctx.ex.closingAt ? instantText(ctx.ex.closingAt, ctx.org.timeZone) : null, closingChanges, addendaIssued }) };
}
