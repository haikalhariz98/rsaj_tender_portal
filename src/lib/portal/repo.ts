/**
 * The one read behind the public opportunity pages, through `OPPORTUNITY_SELECT` (select.ts). The page-facing shape comes from `toPublicOpportunity`, which
 * is also where "is this exercise public?" is decided (the query filters for efficiency; the rule
 * is the authority and is applied again on every row).
 */

import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { exerciseOrg } from "@/lib/method/repo";

import { OPPORTUNITY_SELECT } from "./select";
import { PUBLISHED_OR_CANCELLED, toPublicOpportunity, type OpportunityRow, type PublicOpportunity } from "./public";

/// What the query lets through, before the rule runs again on each row.
const PUBLIC_WHERE = {
  restricted: false,
  status: { in: [...PUBLISHED_OR_CANCELLED] },
  window: { is: { path: "ADVERTISED" as const, publishedAt: { not: null } } },
} satisfies Prisma.SourcingExerciseWhereInput;

async function context(organisationId: string, timeZone: string | null) {
  const [methods, policy] = await Promise.all([
    db.sourcingMethod.findMany({ where: { organisationId }, select: { code: true, nameEn: true } }),
    db.tenderDocumentPolicy.findUnique({ where: { organisationId }, select: { restrictionLabelEn: true } }),
  ]);
  return { now: new Date(), timeZone, methodNames: new Map(methods.map((m) => [m.code, m.nameEn])), restrictionLabel: policy?.restrictionLabelEn?.trim() || null };
}

/// The public opportunities, newest closing first; `organisation` null where none is set up.
export async function loadOpportunities(): Promise<{ ready: boolean; opportunities: PublicOpportunity[] }> {
  const org = await exerciseOrg();
  if (!org) return { ready: false, opportunities: [] };
  const [rows, ctx] = await Promise.all([
    db.sourcingExercise.findMany({ where: { organisationId: org.id, ...PUBLIC_WHERE }, select: OPPORTUNITY_SELECT }),
    context(org.id, org.timeZone),
  ]);
  const opportunities = (rows as unknown as OpportunityRow[]).map((r) => toPublicOpportunity(r, ctx)).filter((o): o is PublicOpportunity => o !== null);
  return { ready: true, opportunities };
}

/// One opportunity, or null where it does not exist or is not public: the page answers both the same way.
export async function loadOpportunity(id: string): Promise<PublicOpportunity | null> {
  const org = await exerciseOrg();
  if (!org) return null;
  const [row, ctx] = await Promise.all([
    db.sourcingExercise.findFirst({ where: { id, organisationId: org.id }, select: OPPORTUNITY_SELECT }),
    context(org.id, org.timeZone),
  ]);
  return row ? toPublicOpportunity(row as unknown as OpportunityRow, ctx) : null;
}
