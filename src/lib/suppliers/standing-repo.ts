/**
 * The register's standing and eligibility, read from the database (plan 6.15 §3, increment a2). Reads only;
 * the rules are `standing`, `eligibility` and `windowValidity`, run on what is read here. A write passes its
 * own locked transaction (`client`), so what it judges is what it locked.
 */

import type { Tx } from "@/lib/audit/record";
import { dayIn, storedDay, dayOrNull as day } from "@/lib/dates";
import { db } from "@/lib/db";

import { awardStanding, type AwardStanding } from "./award-standing";
import { documentStates } from "./documents";
import { eligibility, structuredOf, type Eligibility, type EligibilitySnapshot, type HeldValue, type RequirementFacts } from "./eligibility";
import { lockSupplierRow } from "./lock";
import { documentFacts, typeFacts } from "./repo";
import { standing, type StandingEventFacts, type StandingEventKind, type StandingReading } from "./standing";
import type { RegistrationValueKind } from "./types";
import { inOrder } from "@/lib/series";

/// A stored standing event as the rules read it. BD-613-105(e) / S-3: a registration cancelled carries its body and reference
/// (its reason line is composed from them at read, never stored as words).
export function standingEventFacts(e: { id: string; kind: string; effectiveOn: Date; endsOn: Date | null; offenceNo: number | null; reasonSnapshot: string; reinstatesEventId: string | null; liftsEventId: string | null; flaggedDocumentIds: string[]; withdrawnAt: Date | null; bodyLabelSnapshot: string; externalReference: string }): StandingEventFacts {
  const cancelled = e.kind === "REGISTRATION_CANCELLED";
  return { id: e.id, kind: e.kind as StandingEventKind, effectiveOn: storedDay(e.effectiveOn), endsOn: day(e.endsOn), offenceNo: e.offenceNo, reasonLabel: cancelled ? "" : e.reasonSnapshot, reinstatesEventId: e.reinstatesEventId, liftsEventId: e.liftsEventId, flaggedDocumentIds: e.flaggedDocumentIds, withdrawn: e.withdrawnAt != null, cancelledBy: cancelled ? { body: e.bodyLabelSnapshot, reference: e.externalReference } : null };
}

/// The policy's switches as the rules read them.
export async function supplierPolicyOf(organisationId: string, client: Tx = db) {
  const p = await client.supplierPolicy.findUnique({ where: { organisationId }, include: { lapseReason: { select: { nameEn: true } }, restrictionEvidenceType: { select: { nameEn: true } } } });
  return {
    row: p,
    bands: { criticalDays: p?.criticalDays ?? null, warningDays: p?.warningDays ?? null, upcomingDays: p?.upcomingDays ?? null },
    autoSuspendOnLapse: p?.autoSuspendOnLapse ?? null,
    expiryOnClosingDayCounts: p?.expiryOnClosingDayCounts ?? null,
    blacklistFirstOffenceMonths: p?.blacklistFirstOffenceMonths ?? null,
    registerRequiredForSale: p?.registerRequiredForSale ?? null,
    restrictionEvidenceTypeId: p?.restrictionEvidenceTypeId ?? null,
    ineligibleBidConsequence: p?.ineligibleBidConsequence ?? null,
  };
}
export type SupplierPolicyFacts = Awaited<ReturnType<typeof supplierPolicyOf>>;

/// Where one supplier stands on `today`, from its events and its mandatory documents.
export async function standingOf(supplierId: string, organisationId: string, today: string, client: Tx = db, policy?: SupplierPolicyFacts): Promise<{ reading: StandingReading; status: string } | null> {
  const [s, types, pol] = await inOrder(
    () => client.supplier.findFirst({ where: { id: supplierId, organisationId }, select: { status: true, registeredOn: true, documents: true, standingEvents: true } }),
    () => client.supplierDocumentType.findMany({ where: { organisationId } }),
    () => policy ? Promise.resolve(policy) : supplierPolicyOf(organisationId, client));
  if (!s) return null;
  const mandatory = documentStates(types.map(typeFacts), s.documents.map(documentFacts), today)
    .filter((x) => x.mandatory)
    .map((x) => ({ typeLabel: x.type.label, state: x.state }));
  // M-1: the registration day ends a cancellation it is later than.
  return { reading: standing({ status: s.status, registeredOn: day(s.registeredOn) }, s.standingEvents.map(standingEventFacts), mandatory, { autoSuspendOnLapse: pol.autoSuspendOnLapse }, today), status: s.status };
}

/**
 * One supplier's eligibility for one exercise on `today` (FR-VND-011): its standing, the exercise's
 * registration requirements over its window (advertisement day to the closing's organisation day), its
 * restriction, and any special permission granted to a party of the exercise linked to it.
 */
export async function eligibilityOf(supplierId: string, exerciseId: string, org: { id: string; timeZone: string | null; today: string }, client: Tx = db): Promise<{ eligibility: Eligibility; snapshot: EligibilitySnapshot; reading: StandingReading } | null> {
  const policy = await supplierPolicyOf(org.id, client);
  const st = await standingOf(supplierId, org.id, org.today, client, policy);
  if (!st) return null;
  const [supplier, ex, bodies, types, permissions] = await inOrder(
    () => client.supplier.findUniqueOrThrow({ where: { id: supplierId }, select: { reference: true, documents: { include: { values: { include: { registrationValue: { select: { rank: true } } } } } } } }),
    () => client.sourcingExercise.findFirst({ where: { id: exerciseId, organisationId: org.id }, select: { closingAt: true, restrictedTender: true, window: { select: { advertisementDay: true } }, registrationRequirements: { orderBy: [{ alternativeGroup: "asc" }, { sortOrder: "asc" }], include: { needs: { orderBy: { id: "asc" }, include: { registrationValue: { select: { rank: true } } } } } } } }),
    () => client.registrationBody.findMany({ where: { organisationId: org.id }, select: { id: true, code: true } }),
    () => client.supplierDocumentType.findMany({ where: { organisationId: org.id }, select: { id: true, bodyId: true } }),
    () => client.specialPermission.findMany({ where: { exerciseId, party: { vendorId: supplierId }, grantedOn: { not: null } }, select: { requirementId: true, relaxes: true } }));
  if (!ex) return null;
  const typesOfBody: Record<string, string[]> = {};
  for (const b of bodies) typesOfBody[b.code] = types.filter((t) => t.bodyId === b.id).map((t) => t.id);
  const valuesOf: Record<string, HeldValue[]> = {};
  for (const d of supplier.documents) valuesOf[d.id] = d.values.map((v) => ({ kind: v.kind as RegistrationValueKind, code: v.codeSnapshot, label: v.labelSnapshot, rank: v.registrationValue.rank }));
  const requirements: RequirementFacts[] = ex.registrationRequirements.map((r) => ({ id: r.id, bodyCode: r.bodyCode, bodyLabel: r.bodyLabelSnapshot, qualifiers: r.qualifiers, alternativeGroup: r.alternativeGroup, qualifiersFromNeeds: r.qualifiersFromNeeds, structured: structuredOf(r.needs.map((n) => ({ kind: n.kind, codeSnapshot: n.codeSnapshot, labelSnapshot: n.labelSnapshot, rankNow: n.registrationValue.rank }))) }));
  const e = eligibility({
    supplier: { status: st.status },
    standing: st.reading,
    requirements,
    typesOfBody,
    docs: supplier.documents.map(documentFacts),
    valuesOf,
    window: { advertisementDay: day(ex.window?.advertisementDay), closingDay: ex.closingAt && org.timeZone ? dayIn(ex.closingAt, org.timeZone) : null },
    policy: { expiryOnClosingDayCounts: policy.expiryOnClosingDayCounts, restrictionEvidenceTypeId: policy.restrictionEvidenceTypeId },
    restrictedTender: ex.restrictedTender,
    permissions: permissions.map((p) => ({ requirementId: p.requirementId, relaxes: p.relaxes })),
    on: org.today,
  });
  return { eligibility: e, snapshot: { judgedOn: org.today, supplierId, supplierReference: supplier.reference, standing: st.reading.standing, verdict: e.verdict, rows: e.rows }, reading: st.reading };
}

/// Judge a linked bidder's eligibility at its envelope's opening, its supplier row locked last.
export async function eligibilityAtOpening(tx: Tx, org: { id: string; timeZone: string | null; today: string | null }, vendorId: string, exerciseId: string): Promise<EligibilitySnapshot | null> {
  if (!org.today) return null;
  await lockSupplierRow(tx, vendorId);
  const e = await eligibilityOf(vendorId, exerciseId, { id: org.id, timeZone: org.timeZone, today: org.today }, tx);
  return e?.snapshot ?? null;
}

/// 6.15a fix S-3: each party's linked supplier and its standing on `today`, for an award's form and record. Parties not linked are absent.
export async function partyRegister(partyIds: readonly string[], org: { id: string; today: string | null }, day: (d: string) => string, client: Tx = db): Promise<Map<string, { supplier: string; standing: AwardStanding }>> {
  const out = new Map<string, { supplier: string; standing: AwardStanding }>();
  if (!org.today || partyIds.length === 0) return out;
  const parties = await client.exerciseParty.findMany({ where: { id: { in: [...partyIds] }, organisationId: org.id, vendorId: { not: null } }, select: { id: true, vendor: { select: { id: true, reference: true, registeredName: true } } } });
  const policy = await supplierPolicyOf(org.id, client);
  for (const p of parties) {
    const st = await standingOf(p.vendor!.id, org.id, org.today, client, policy);
    if (st) out.set(p.id, { supplier: `${p.vendor!.reference} · ${p.vendor!.registeredName}`, standing: awardStanding(st.reading, day) });
  }
  return out;
}
