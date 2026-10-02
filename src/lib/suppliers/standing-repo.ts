/**
 * The register's standing and eligibility, read from the database (plan 6.15 §3, increment a2). Reads only;
 * the rules are `standing`, `eligibility` and `windowValidity`, run on what is read here. A write passes its
 * own locked transaction (`client`), so what it judges is what it locked.
 */

import type { Tx } from "@/lib/audit/record";
import { dayIn, storedDay } from "@/lib/dates";
import { db } from "@/lib/db";

import { documentStates } from "./documents";
import { eligibility, type Eligibility, type EligibilitySnapshot, type HeldValue, type RequirementFacts } from "./eligibility";
import { lockSupplierRow } from "./lock";
import { documentFacts, typeFacts } from "./repo";
import { standing, type StandingEventFacts, type StandingEventKind, type StandingReading } from "./standing";
import type { RegistrationValueKind } from "./types";

const day = (d: Date | null | undefined) => (d ? storedDay(d) : null);

export function standingEventFacts(e: { id: string; kind: string; effectiveOn: Date; endsOn: Date | null; offenceNo: number | null; reasonSnapshot: string; reinstatesEventId: string | null; liftsEventId: string | null; flaggedDocumentIds: string[] }): StandingEventFacts {
  return { id: e.id, kind: e.kind as StandingEventKind, effectiveOn: storedDay(e.effectiveOn), endsOn: day(e.endsOn), offenceNo: e.offenceNo, reasonLabel: e.reasonSnapshot, reinstatesEventId: e.reinstatesEventId, liftsEventId: e.liftsEventId, flaggedDocumentIds: e.flaggedDocumentIds };
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
  const [s, types, pol] = await Promise.all([
    client.supplier.findFirst({ where: { id: supplierId, organisationId }, select: { status: true, documents: true, standingEvents: true } }),
    client.supplierDocumentType.findMany({ where: { organisationId } }),
    policy ? Promise.resolve(policy) : supplierPolicyOf(organisationId, client),
  ]);
  if (!s) return null;
  const mandatory = documentStates(types.map(typeFacts), s.documents.map(documentFacts), today)
    .filter((x) => x.mandatory)
    .map((x) => ({ typeLabel: x.type.label, state: x.state }));
  return { reading: standing({ status: s.status }, s.standingEvents.map(standingEventFacts), mandatory, { autoSuspendOnLapse: pol.autoSuspendOnLapse }, today), status: s.status };
}

/**
 * One supplier's eligibility for one exercise on `today` (FR-VND-011): its standing, the exercise's
 * registration requirements over its window (advertisement day to the closing's organisation day), its
 * restriction, and any special permission granted to a party of the exercise linked to it.
 */
export async function eligibilityOf(supplierId: string, exerciseId: string, org: { id: string; timeZone: string | null; today: string }, client: Tx = db): Promise<{ eligibility: Eligibility; snapshot: EligibilitySnapshot } | null> {
  const policy = await supplierPolicyOf(org.id, client);
  const st = await standingOf(supplierId, org.id, org.today, client, policy);
  if (!st) return null;
  const [supplier, ex, bodies, types, permissions] = await Promise.all([
    client.supplier.findUniqueOrThrow({ where: { id: supplierId }, select: { reference: true, documents: { include: { values: { include: { registrationValue: { select: { rank: true } } } } } } } }),
    client.sourcingExercise.findFirst({ where: { id: exerciseId, organisationId: org.id }, select: { closingAt: true, restrictedTender: true, window: { select: { advertisementDay: true } }, registrationRequirements: { orderBy: [{ alternativeGroup: "asc" }, { sortOrder: "asc" }] } } }),
    client.registrationBody.findMany({ where: { organisationId: org.id }, select: { id: true, code: true } }),
    client.supplierDocumentType.findMany({ where: { organisationId: org.id }, select: { id: true, bodyId: true } }),
    client.specialPermission.findMany({ where: { exerciseId, party: { vendorId: supplierId }, grantedOn: { not: null } }, select: { requirementId: true, relaxes: true } }),
  ]);
  if (!ex) return null;
  const typesOfBody: Record<string, string[]> = {};
  for (const b of bodies) typesOfBody[b.code] = types.filter((t) => t.bodyId === b.id).map((t) => t.id);
  const valuesOf: Record<string, HeldValue[]> = {};
  for (const d of supplier.documents) valuesOf[d.id] = d.values.map((v) => ({ kind: v.kind as RegistrationValueKind, code: v.codeSnapshot, label: v.labelSnapshot, rank: v.registrationValue.rank }));
  const requirements: RequirementFacts[] = ex.registrationRequirements.map((r) => ({ id: r.id, bodyCode: r.bodyCode, bodyLabel: r.bodyLabelSnapshot, qualifiers: r.qualifiers, alternativeGroup: r.alternativeGroup, structured: null }));
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
  });
  return { eligibility: e, snapshot: { judgedOn: org.today, supplierId, supplierReference: supplier.reference, standing: st.reading.standing, verdict: e.verdict, rows: e.rows } };
}

/// Judge a linked bidder's eligibility at its envelope's opening, its supplier row locked last.
export async function eligibilityAtOpening(tx: Tx, org: { id: string; timeZone: string | null; today: string | null }, vendorId: string, exerciseId: string): Promise<EligibilitySnapshot | null> {
  if (!org.today) return null;
  await lockSupplierRow(tx, vendorId);
  const e = await eligibilityOf(vendorId, exerciseId, { id: org.id, timeZone: org.timeZone, today: org.today }, tx);
  return e?.snapshot ?? null;
}
