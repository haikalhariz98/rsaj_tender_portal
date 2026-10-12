import type { Prisma } from "@/generated/prisma/client";
import type { Tx } from "@/lib/audit/record";
import type { SupplierActor } from "@/lib/auth/types";
import { exerciseOrg } from "@/lib/method/repo";
import type { ExerciseStatus } from "@/lib/method/types";
import { isPublicOpportunity } from "@/lib/portal/public";
import { windowPhase, type WindowPhase } from "@/lib/window/phase";
import type { WindowPath } from "@/lib/window/types";

import { supplierSees, type Seen } from "./visibility";

/**
 * The exercise as the signed-in supplier is allowed to see it (Phase 4d), read once per request and handed to the loader of the tab being shown. Every read names the SESSION's supplier and
 * organisation (`actor`): nothing here takes a supplier from a request. The exercise is returned only where `supplierSees` says so (a public opportunity, or one the office linked a party of this
 * supplier to), and the answer is the same for one that does not exist, one of another organisation, a confidential one and one not published: null.
 */

/// Everything the rules and the tab loaders need of the exercise and its window. Declared once so the select cannot drift from the shape.
export const CONTEXT_SELECT = {
  id: true,
  reference: true,
  title: true,
  status: true,
  restricted: true,
  restrictedTender: true,
  closingAt: true,
  // SR-10: how the documents are sold, as pinned on the exercise.
  saleMode: true,
  window: {
    select: {
      id: true,
      path: true,
      publishedAt: true,
      policySnapshot: true,
      purchaseFromDay: true,
      purchaseCloseDay: true,
      purchasePlace: true,
      inspectionPlace: true,
      inspectionHours: true,
      feeAmount: true,
      feePaymentMethods: true,
      submissionPlace: true,
    },
  },
} satisfies Prisma.SourcingExerciseSelect;

type ExerciseRow = Prisma.SourcingExerciseGetPayload<{ select: typeof CONTEXT_SELECT }>;

export interface BidParty {
  id: string;
  source: string;
  name: string;
  /// An invitation letter was issued to it.
  hasLetter: boolean;
}

export interface BidContext {
  org: { id: string; timeZone: string | null; today: string | null; name: string };
  ex: ExerciseRow;
  seen: Extract<Seen, { seen: true }>;
  /// This supplier's parties on the exercise (those an officer linked to it).
  parties: BidParty[];
  phase: WindowPhase;
  path: WindowPath | null;
  now: Date;
}

/// The window's phase as the rules read it, derived from the stored instants and the organisation's zone, never stored. The context, the list and the notices all read it here, so they cannot disagree about whether a window can still be acted on.
export function exercisePhase(ex: { status: string; closingAt: Date | null; window: { purchaseFromDay: Date | null; purchaseCloseDay: Date | null } | null }, now: Date, timeZone: string | null): WindowPhase {
  if (!ex.window) return "NOT_PUBLISHED";
  return windowPhase({ status: ex.status as ExerciseStatus, purchaseFromDay: ex.window.purchaseFromDay, purchaseCloseDay: ex.window.purchaseCloseDay, closingAt: ex.closingAt }, now, timeZone).phase;
}

export async function loadBidContext(client: Tx, actor: Pick<SupplierActor, "supplierId" | "organisationId">, exerciseId: string, now: Date = new Date()): Promise<BidContext | null> {
  const org = await exerciseOrg(actor.organisationId, client);
  if (!org) return null;
  const ex = await client.sourcingExercise.findFirst({ where: { id: exerciseId, organisationId: actor.organisationId }, select: CONTEXT_SELECT });
  if (!ex) return null;
  const rows = await client.exerciseParty.findMany({
    where: { exerciseId: ex.id, organisationId: actor.organisationId, vendorId: actor.supplierId },
    select: { id: true, source: true, name: true, letters: { select: { id: true } } },
    orderBy: { createdAt: "asc" },
  });
  const status = ex.status as ExerciseStatus;
  const seen = supplierSees({
    publicOpportunity: isPublicOpportunity({ status, restricted: ex.restricted, closingAt: ex.closingAt, window: ex.window ? { path: ex.window.path, publishedAt: ex.window.publishedAt } : null }),
    windowPublished: ex.window?.publishedAt != null,
    linkedParty: rows.length > 0,
  });
  if (!seen.seen) return null;
  const phase = exercisePhase(ex, now, org.timeZone);
  return {
    org: { id: org.id, timeZone: org.timeZone, today: org.today, name: org.name },
    ex,
    seen,
    parties: rows.map((p) => ({ id: p.id, source: p.source, name: p.name, hasLetter: p.letters.length > 0 })),
    phase,
    path: (ex.window?.path as WindowPath | undefined) ?? null,
    now,
  };
}

/// Whether, on the invited path, this supplier is an invitee whose letter was issued (the same test `recordSale` applies).
export const isInvited = (c: Pick<BidContext, "parties">): boolean => c.parties.some((p) => p.hasLetter);
