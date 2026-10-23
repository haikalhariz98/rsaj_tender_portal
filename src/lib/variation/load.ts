/**
 * A contract's variations and its adjustments of the contract sum, loaded (6.13 Part A step 4). Reads only; every rule
 * is in the pure modules beside this. Server-only: called by the contract's Variations tab, the variation's page and
 * the acts inside their own locked transaction (`client` the transaction), so a decision reads the rows it locked.
 */

import type { Tx } from "@/lib/audit/record";
import { issuedAdjustmentsFrom } from "@/lib/adjustment/ppjhk";
import { storedDay, dayOrNull as day } from "@/lib/dates";
import { db } from "@/lib/db";
import { parseSen, senFromDecimal, type Sen } from "@/lib/money";
import { recordOf } from "@/lib/requisition/repo";

import type { RouteFact, VariationFacts } from "./application";
import type { ConsentState } from "./instruction";
import { VARIATION_DOMAINS } from "./domains";
import type { MatterFact } from "./tabling";
import type { SoDecision, VariationEvent, VariationExemption, VariationStatus } from "./types";

const certSelect = { id: true, kind: true, status: true, number: true, sequence: true, certificateDate: true, issuedAt: true, issueSnapshot: true, computedSnapshot: true, openedOn: true, signatures: { select: { blockKind: true, refused: true, refusalNote: true, name: true, signedOn: true } } } as const;
const name = { select: { id: true, name: true } } as const;

/// A committee matter tabled from a variation, as its decision record is built.
export const matterInclude = { meeting: { include: { committee: { select: { id: true, code: true, nameEn: true } } } }, votes: { include: { person: { select: { name: true } } } } } as const;

export const variationInclude = {
  originator: name,
  reviewedBy: name,
  principal: name,
  soDecidedBy: name,
  commencedSupport: name,
  closedBy: name,
  applicationCertificate: { select: certSelect },
  approvals: {
    include: { sentBy: name, approvalInstance: { include: { steps: { orderBy: { sequence: "asc" as const } } } } },
    // Run 3 review SHOULD 3: the day each route opened, then the instant it was sent (a successor is stamped with its
    // own act's instant), then its id: never ambiguous, even for a return to a step on the day it was sent.
    orderBy: [{ approvalInstance: { openedAt: "asc" as const } }, { sentAt: "asc" as const }, { id: "asc" as const }],
  },
  matters: { include: matterInclude, orderBy: { tabledAt: "asc" as const } },
  // Acceptance S-2 (FR-VAR-015): its plans or sketches attached now (the document store's own panel lists them in full).
  instructions: { include: { certificate: { select: certSelect }, person: name, attachments: { where: { purpose: "INSTRUCTION_SKETCH" as const, detachedAt: null }, select: { id: true, version: { select: { versionNo: true, document: { select: { title: true } } } } }, orderBy: { attachedAt: "asc" as const } } }, orderBy: { recordedAt: "asc" as const } },
  measurements: { include: { person: name }, orderBy: [{ recordedAt: "asc" as const }] },
  dayworkRecords: { include: { person: name }, orderBy: [{ workedOn: "asc" as const }, { recordedAt: "asc" as const }] },
  orders: { include: { certificate: { select: certSelect }, person: name, adjustmentLines: { select: { sumAdjustment: { select: { certificate: { select: { status: true, number: true } } } } } } }, orderBy: { recordedAt: "asc" as const } },
};

export type VariationRow = Awaited<ReturnType<typeof readVariations>>[number];

function readVariations(contractId: string, client: Tx) {
  return client.variation.findMany({ where: { contractId }, include: variationInclude, orderBy: [{ recordedAt: "asc" }, { id: "asc" }] });
}

export async function loadVariations(contractId: string, client: Tx = db): Promise<VariationRow[]> {
  return readVariations(contractId, client);
}

/// The order's net as worked out with it (its frozen figures, totals recomputed by the core from the lines).
export function orderNetOf(o: { certificate: { computedSnapshot: unknown } }): Sen {
  const s = o.certificate.computedSnapshot as { lines?: { key: string; value: string | null }[] } | null;
  const v = (k: string) => {
    const x = s?.lines?.find((l) => l.key === k)?.value;
    return x == null ? 0n : parseSen(x);
  };
  return v("additions") - v("omissions");
}

/// A variation as the rules read it.
export function factsOf(v: VariationRow): VariationFacts {
  const routes: RouteFact[] = v.approvals.map((a) => ({
    id: a.approvalInstance.id,
    event: a.event as VariationEvent,
    status: a.approvalInstance.status,
    value: senFromDecimal(a.value),
    applied: a.approvalInstance.rejectionApplied,
    choices: a.approvalInstance.rejectionChoices,
    // Oldest first as loaded; the latest is read by (day opened, instant sent, id) in application.ts, not by this order.
    openedOn: storedDay(a.approvalInstance.openedAt),
    sentAt: a.sentAt.toISOString(),
  }));
  return {
    id: v.id,
    status: v.status as VariationStatus,
    exemption: v.exemption as VariationExemption | null,
    estimate: senFromDecimal(v.estimate),
    soDecision: v.soDecision as SoDecision | null,
    soDecisionCap: v.soDecisionCap == null ? null : senFromDecimal(v.soDecisionCap),
    routes,
    instructions: v.instructions.map((i) => ({ id: i.id, certificateStatus: i.certificate.status })),
    orders: v.orders.map((o) => ({ id: o.id, certificateStatus: o.certificate.status, net: orderNetOf(o) })),
    commencedOn: day(v.commencedOn),
  };
}

/// The funder's consent: the latest matter tabled for it (on the consent domain), as its committee decided it.
export const CONSENT_DOMAIN = VARIATION_DOMAINS[4];
export function consentOf(v: VariationRow): { state: ConsentState; matter: VariationRow["matters"][number] | null } {
  const m = [...v.matters].filter((x) => x.domain === CONSENT_DOMAIN && !x.withdrawnAt).at(-1) ?? null;
  if (!m) return { state: "NONE", matter: null };
  return { state: m.outcome === "CARRIED" ? "CARRIED" : m.outcome === "NOT_CARRIED" ? "NOT_CARRIED" : "PENDING", matter: m };
}

/// A matter's decision record (6.10's builder), or null while pending.
export const matterRecordOf = (m: VariationRow["matters"][number]) => recordOf(m);

/// The live instruction (not void) and the live order.
export const liveInstructionRow = (v: VariationRow) => v.instructions.find((i) => i.certificate.status !== "VOID") ?? null;
export const liveOrderRow = (v: VariationRow) => v.orders.find((o) => o.certificate.status !== "VOID") ?? null;

/// The measured items standing (not removed) under an instruction.
export const standingMeasurements = (v: VariationRow, instructionId: string) => v.measurements.filter((m) => m.instructionId === instructionId && !m.removedAt);

/// The contract refusal: the contractor refused to sign the order (FR-VAR-022), recorded as a dispute.
export function disputeOf(o: { certificate: { signatures: { blockKind: string; refused: boolean; refusalNote: string; name: string; signedOn: Date }[] } }): { note: string; on: string; name: string } | null {
  const s = o.certificate.signatures.find((x) => x.blockKind === "CONTRACTOR" && x.refused);
  return s ? { note: s.refusalNote, on: storedDay(s.signedOn), name: s.name } : null;
}

// ------------------------------------------------------------------ the adjustments of the contract sum

export const adjustmentInclude = {
  certificate: { select: certSelect },
  person: name,
  lines: { include: { variationCertificate: { select: { id: true, variationId: true } } }, orderBy: { sortOrder: "asc" as const } },
};

export type AdjustmentRow = Awaited<ReturnType<typeof readAdjustments>>[number];
function readAdjustments(contractId: string, client: Tx) {
  return client.sumAdjustment.findMany({ where: { contractId }, include: adjustmentInclude, orderBy: [{ recordedAt: "asc" }, { id: "asc" }] });
}

export async function loadAdjustments(contractId: string, client: Tx = db): Promise<AdjustmentRow[]> {
  return readAdjustments(contractId, client);
}

/// The issued adjustments, oldest first, with the net each moved the sum by (FR-PAD-003: the only source of the revised sum).
export const issuedAdjustments = (rows: readonly AdjustmentRow[]) => issuedAdjustmentsFrom(rows);

/// An adjustment in progress (raised, neither issued nor void): one at a time per contract.
export const adjustmentInProgress = (rows: readonly AdjustmentRow[]) => rows.find((a) => a.certificate.status !== "ISSUED" && a.certificate.status !== "VOID") ?? null;

/// The orders already on an adjustment that is not void.
export const ordersAdjusted = (rows: readonly AdjustmentRow[]): string[] => rows.filter((a) => a.certificate.status !== "VOID").flatMap((a) => a.lines.map((l) => l.variationCertificateId).filter((x): x is string => !!x));

/// The matters tabled from a variation, as the tabling rule reads them (tabling.ts).
export const matterFactsOf = (v: Pick<VariationRow, "matters">): MatterFact[] =>
  v.matters.map((m) => ({ withdrawn: !!m.withdrawnAt, domain: m.domain, committeeCode: m.meeting.committee.code, outcome: m.outcome as MatterFact["outcome"] }));

/// The people a variation names today (its originator, its reviewer and the Principal Representative it passed through), before an edit: a person already
/// recorded and left as they were is not recorded again (Phase 2b).
export async function loadVariationPeople(organisationId: string, variationId: string) {
  return db.variation.findFirst({ where: { id: variationId, organisationId }, select: { originatorPersonId: true, reviewedByPersonId: true, principalPersonId: true } });
}
