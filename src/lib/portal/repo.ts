/**
 * The one read behind the public opportunity pages, through `OPPORTUNITY_SELECT` (select.ts). The page-facing shape comes from `toPublicOpportunity`, which
 * is also where "is this exercise public?" is decided (the query filters for efficiency; the rule
 * is the authority and is applied again on every row).
 */

import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { exerciseOrg } from "@/lib/method/repo";

import { deploymentOrganisation } from "./deployment";
import { ISSUED_AWARD_STATUSES, OPPORTUNITY_SELECT, resultSelect } from "./select";
import { toPublicResult, type PublicResult, type ResultRow } from "./results";
import { PUBLISHED_OR_CANCELLED, toPublicOpportunity, type OpportunityRow, type PublicOpportunity } from "./public";

/// The public pages serve the deployment's one organisation (ADR 0034 D10): nobody is signed in to name one.
async function publicOrg() {
  const deployment = await deploymentOrganisation();
  return deployment ? exerciseOrg(deployment.id) : null;
}

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
  const org = await publicOrg();
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
  const org = await publicOrg();
  if (!org) return null;
  const [row, ctx] = await Promise.all([
    db.sourcingExercise.findFirst({ where: { id, organisationId: org.id }, select: OPPORTUNITY_SELECT }),
    context(org.id, org.timeZone),
  ]);
  return row ? toPublicOpportunity(row as unknown as OpportunityRow, ctx) : null;
}

/**
 * The public results: advertised exercises with an issued award, newest award first. The value is
 * read only where `AwardPolicy.publishAwardedValue` is Yes; `showsValue` tells the page whether to
 * draw the column at all, so "not published" and "no results" are never confused.
 */
export async function loadResults(): Promise<{ ready: boolean; showsValue: boolean; results: PublicResult[] }> {
  const org = await publicOrg();
  if (!org) return { ready: false, showsValue: false, results: [] };
  const [methods, policy] = await Promise.all([
    db.sourcingMethod.findMany({ where: { organisationId: org.id }, select: { code: true, nameEn: true } }),
    db.awardPolicy.findUnique({ where: { organisationId: org.id }, select: { publishAwardedValue: true } }),
  ]);
  const publish = policy?.publishAwardedValue === true;
  const rows = await db.sourcingExercise.findMany({
    where: { organisationId: org.id, ...PUBLIC_WHERE, awards: { some: { status: { in: [...ISSUED_AWARD_STATUSES] } } } },
    select: resultSelect(publish),
  });
  const ctx = { now: new Date(), timeZone: org.timeZone, methodNames: new Map(methods.map((m) => [m.code, m.nameEn])), publishAwardedValue: publish };
  const results = (rows as unknown as ResultRow[])
    .map((r) => toPublicResult(r, ctx))
    .filter((r): r is PublicResult => r !== null)
    .sort((a, b) => (b.awardedDay ?? "").localeCompare(a.awardedDay ?? "") || a.reference.localeCompare(b.reference));
  return { ready: true, showsValue: publish, results };
}
