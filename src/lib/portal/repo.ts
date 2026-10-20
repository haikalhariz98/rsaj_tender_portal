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
import { loadSchedules } from "./schedule-store";
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
 * The public results: advertised exercises with an issued award, newest award first. Nothing about who
 * won or for how much is read (`resultSelect`, select.ts; ruling R3).
 */
export async function loadResults(): Promise<{ ready: boolean; results: PublicResult[] }> {
  const org = await publicOrg();
  if (!org) return { ready: false, results: [] };
  const methods = await db.sourcingMethod.findMany({ where: { organisationId: org.id }, select: { code: true, nameEn: true } });
  const rows = await db.sourcingExercise.findMany({
    where: { organisationId: org.id, ...PUBLIC_WHERE, awards: { some: { status: { in: [...ISSUED_AWARD_STATUSES] } } } },
    select: resultSelect(),
  });
  // The schedules are judged again here (public, live, not withdrawn), not trusted from the day they were attached.
  const schedules = await loadSchedules(org.id, rows.map((r) => r.id));
  const ctx = {
    now: new Date(),
    timeZone: org.timeZone,
    methodNames: new Map(methods.map((m) => [m.code, m.nameEn])),
    schedulePublishedAt: new Map([...schedules].map(([id, r]) => [id, r.attachedAt])),
  };
  const results = (rows as unknown as ResultRow[])
    .map((r) => toPublicResult(r, ctx))
    .filter((r): r is PublicResult => r !== null)
    .sort((a, b) => (b.awardedDay ?? "").localeCompare(a.awardedDay ?? "") || a.reference.localeCompare(b.reference));
  return { ready: true, results };
}

/// The schedule of tenders for one result, or null where the exercise is not a result or has none the public may be given. Whether it is a result is `toPublicResult`'s rule.
export async function loadResultSchedule(id: string) {
  const org = await publicOrg();
  if (!org) return null;
  const row = await db.sourcingExercise.findFirst({
    where: { id, organisationId: org.id, ...PUBLIC_WHERE, awards: { some: { status: { in: [...ISSUED_AWARD_STATUSES] } } } },
    select: resultSelect(),
  });
  if (!row || !toPublicResult(row as unknown as ResultRow, { now: new Date(), timeZone: org.timeZone, methodNames: new Map() })) return null;
  const schedule = (await loadSchedules(org.id, [id])).get(id);
  return schedule ? { organisationId: org.id, schedule } : null;
}
