/**
 * Reading what 6.12's acts and screens judge on (reads only). The pure rules are beside this file;
 * here the rows are turned into their inputs: the customer's contract configuration, the readiness gate
 * as the award and the contract share it, the baseline's inputs from the frozen records, the baseline
 * rows as values, and the contracts list.
 */

import { EXECUTED_STATES } from "./status";
import { decimalText } from "@/lib/format";
import type { Prisma } from "@/generated/prisma/client";
import type { Tx } from "@/lib/audit/record";
import { awardReadiness, type ReadinessAward } from "@/lib/award/gate-read";
import { baselineOf, type FrozenTender } from "@/lib/award/appendix-baseline";
import { frozenTenderOf, frozenTendersOf, loadAwardConfig, type LoadedAward } from "@/lib/award/repo";
import { dayOf, dayToDate, storedDay } from "@/lib/dates";
import { db } from "@/lib/db";
import { isLive } from "@/lib/documents/evidence";
import { isBandSnapshot, isClassificationSnapshot } from "@/lib/method/snapshot";
import { exerciseOrg } from "@/lib/method/repo";
import { parseSen, senFromDecimal, senToDecimalString, type Sen } from "@/lib/money";
import { applicableRequirements } from "@/lib/securities/insurance";
import { requiredBond, type BondBasis } from "@/lib/securities/bond";

import { baselineFor, buildBaseline, PER_DAY, type BaselineInputs, type BaselineValues, type SectionValue } from "./baseline";
import { preparationSettings, unitInForce } from "./in-force";
import { readFormationSnapshot } from "./preparation";
import { phaseOf } from "./status";
import type { LoadedContract } from "./repo";
import type { BaselineReason, BaselineSource, LadKind, PeriodUnit, Provenance } from "./types";

const dec = (v: { toString(): string } | null | undefined) => (v == null ? null : v.toString());
const senOrNull = (v: { toString(): string } | null | undefined) => (v == null ? null : parseSen(v.toString()));
const day = (d: Date | null | undefined) => (d ? storedDay(d) : null);
/// A Decimal percentage as the exact string the pure code reads ("10.0000" → "10", "0.025000" → "0.025").
export const pctString = (v: { toString(): string } | null | undefined) => decimalText(v);

// ------------------------------------------------------------------ configuration

export async function loadContractConfig(organisationId: string, client: Tx = db) {
  const [policy, parts, recipients, units, bases] = await Promise.all([
    client.contractPolicy.findUnique({ where: { organisationId } }),
    client.contractDocumentPart.findMany({ where: { organisationId }, orderBy: [{ contractBasisCode: "asc" }, { sortOrder: "asc" }, { code: "asc" }] }),
    client.controlledCopyRecipient.findMany({ where: { organisationId }, orderBy: [{ sortOrder: "asc" }, { code: "asc" }] }),
    client.orgUnit.findMany({ where: { organisationId }, select: { code: true, nameEn: true, effectiveFrom: true, effectiveTo: true }, orderBy: [{ code: "asc" }, { effectiveFrom: "desc" }] }),
    client.contractBasis.findMany({ where: { organisationId }, orderBy: [{ sortOrder: "asc" }, { code: "asc" }] }),
  ]);
  /// A unit's name on a day: the row in force then (M-2), never merely the first row with the code.
  const unitName = (code: string | null, today: string) => unitInForce(code, units, today)?.nameEn ?? null;
  return { policy, parts, recipients, units, bases, unitName };
}
export type ContractConfig = Awaited<ReturnType<typeof loadContractConfig>>;

export { preparationSettings };

// ------------------------------------------------------------------ the gate

type GateAward = ReadinessAward & { bondBasis: string | null; bondPercent: { toString(): string } | null; bondBasisAmount: { toString(): string } | null; awardedValue: Parameters<typeof senFromDecimal>[0] };

/// The gate on an award's rows, the configuration's insurance requirements given (read once by the caller), and
/// the exercise's frozen tender (64-C4-b: its Appendix's insurance minimums govern where the award states none).
function gateOn(a: GateAward, contractTypeCode: string | null, requirements: Awaited<ReturnType<typeof loadAwardConfig>>["requirements"], tender: FrozenTender | null) {
  const value = senFromDecimal(a.awardedValue);
  const bond = requiredBond({ basis: a.bondBasis as BondBasis | null, percent: dec(a.bondPercent), basisAmount: senOrNull(a.bondBasisAmount), contractPrice: value });
  return awardReadiness(a, bond, applicableRequirements(requirements, contractTypeCode), tender ? baselineOf(tender, value) : null);
}

/// The readiness gate as the award's Conditions tab shows it (FR-CON-008), on the rows given.
export async function contractGate(l: LoadedAward, client: Tx = db) {
  const [config, tender] = await Promise.all([loadAwardConfig(l.org.id, client), frozenTenderOf(l.ex.id, l.org.timeZone, client)]);
  return gateOn(l.award, l.ex.contractTypeCode, config.requirements, tender);
}

/**
 * The derived phase of many legally endorsed contracts at once (/projects, BD-612-16): the configuration
 * read once, the awards' gate rows and the contracts' company resolutions in one query, each judged by the
 * same gate function the contract's own record uses.
 */
export async function endorsedPhases(organisationId: string, take: number, client: Tx = db): Promise<Map<string, "AWAITING_CONDITIONS" | "READY_TO_SIGN" | "LEGALLY_ENDORSED">> {
  const [config, rows] = await Promise.all([
    loadAwardConfig(organisationId, client),
    client.contract.findMany({
      where: { organisationId, status: "LEGALLY_ENDORSED" },
      orderBy: [{ numberedOn: "desc" }, { number: "desc" }],
      take,
      select: {
        id: true,
        attachments: { where: { purpose: "COMPANY_RESOLUTION" }, select: { detachedAt: true, version: { select: { withdrawnAt: true } } } },
        securities: { select: { kind: true, status: true, value: true } },
        policies: { select: { kind: true, substitutesFor: true, status: true, wcCheckedOn: true, sumInsured: true } },
        award: {
          select: {
            instrumentKind: true, status: true, bondRequired: true, bondNotRequiredReason: true, wcBasis: true, bondBasis: true, bondPercent: true, bondBasisAmount: true, awardedValue: true,
            worksSumInsured: true, liabilitySumInsured: true, wcSumInsured: true, exerciseId: true,
            awardReturn: { include: { receivedBy: { select: { id: true, name: true } } } },
            attachments: { select: { purpose: true, detachedAt: true, version: { select: { withdrawnAt: true } } } },
            exercise: { select: { contractTypeCode: true } },
          },
        },
      },
    }),
  ]);
  const out = new Map<string, "AWAITING_CONDITIONS" | "READY_TO_SIGN" | "LEGALLY_ENDORSED">();
  const org = await client.organisation.findUnique({ where: { id: organisationId }, select: { timeZone: true } });
  const tenders = await frozenTendersOf(rows.map((r) => r.award.exerciseId), org?.timeZone ?? null, client);
  for (const r of rows) {
    const gate = gateOn({ ...r.award, contract: { securities: r.securities, policies: r.policies } }, r.award.exercise.contractTypeCode, config.requirements, tenders.get(r.award.exerciseId) ?? null);
    out.set(r.id, phaseOf("LEGALLY_ENDORSED", gate, r.attachments.some(isLive)) as "AWAITING_CONDITIONS" | "READY_TO_SIGN" | "LEGALLY_ENDORSED");
  }
  return out;
}

/// Whether a live attachment of the purpose is on the contract.
export const liveOf = (c: LoadedContract["contract"], purpose: string) => c.attachments.filter((x) => x.purpose === purpose && isLive(x));

// ------------------------------------------------------------------ the baseline's inputs

/**
 * What the baseline is built from (ADR 0021): the award's letter terms, the frozen Appendix of the
 * exercise's approved pack, the prime cost and provisional sums of the bill that pack pinned (as frozen
 * at finalising), the exercise's terms band as frozen at its determination, the contract type's DLP
 * behaviour as frozen at the move into preparation (else as configured, and frozen here), and the
 * tender-documents policy's first-certificate floor and percentage.
 */
export async function baselineInputsOf(l: LoadedAward, client: Tx = db): Promise<BaselineInputs> {
  const { award: a, ex, org } = l;
  const [tender, pack, policy, type] = await Promise.all([
    frozenTenderOf(ex.id, org.timeZone, client),
    client.tenderPack.findFirst({
      where: { exerciseId: ex.id, status: "APPROVED", frozenAt: { not: null } },
      orderBy: { versionNo: "desc" },
      select: { versionNo: true, appendix: { select: { firstInterimMinimum: true, subsequentInterimMinimum: true, honourCertificateDays: true, sections: { orderBy: { sortOrder: "asc" } } } }, bqVersion: { select: { versionNo: true, totalsSnapshot: true, status: true } } },
    }),
    client.tenderDocumentPolicy.findUnique({ where: { organisationId: org.id }, select: { firstCertificateFloor: true, firstCertificatePct: true, firstCertificateProvenance: true } }),
    ex.contractTypeCode ? client.contractType.findFirst({ where: { organisationId: org.id, code: ex.contractTypeCode }, select: { nameEn: true, defectsLiabilityApplies: true } }) : Promise.resolve(null),
  ]);
  const band = isBandSnapshot(ex.bandSnapshot) ? ex.bandSnapshot.terms : null;
  const cls = isClassificationSnapshot(ex.classificationSnapshot) ? ex.classificationSnapshot : null;
  const frozenDlp = cls?.contractType.profile.find((p) => p.key === "defectsLiabilityApplies")?.value;
  const totals = pack?.bqVersion?.totalsSnapshot as { primeCostSums?: string | null; provisionalSums?: string | null } | null | undefined;
  const ap = pack?.appendix;
  return {
    contractSum: senFromDecimal(a.contract?.contractSum ?? a.awardedValue),
    award: {
      completionPeriod: a.completionPeriod,
      completionUnit: a.completionUnit as PeriodUnit,
      ladAmount: senOrNull(a.ladAmount),
      ladUnit: a.ladUnit,
      retentionPercent: pctString(a.retentionPercent),
      retentionCapPercent: pctString(a.retentionCapPercent),
      dlpMonths: a.dlpMonths,
      termsProvenance: a.termsProvenance as Provenance | null,
    },
    appendix: tender
      ? {
          packVersion: tender.packVersion,
          ladKind: tender.appendix.ladKind as LadKind | null,
          ladAmount: tender.appendix.ladAmount,
          ladPct: tender.appendix.ladPct == null ? null : pctString(tender.appendix.ladPct),
          dlpApplies: tender.appendix.dlpApplies,
          dlpMonths: tender.appendix.dlpMonths,
          sectionalCompletion: tender.appendix.sectionalCompletion,
          sections: (ap?.sections ?? []).map((s) => ({ description: s.description, ladKind: s.ladKind as LadKind | null, ladAmount: senOrNull(s.ladAmount), ladPct: pctString(s.ladPct) })),
          firstInterimMinimum: senOrNull(ap?.firstInterimMinimum),
          subsequentInterimMinimum: senOrNull(ap?.subsequentInterimMinimum),
          honourCertificateDays: ap?.honourCertificateDays ?? null,
        }
      : null,
    bq:
      pack?.bqVersion && totals?.primeCostSums != null && totals.provisionalSums != null
        ? { versionNo: pack.bqVersion.versionNo, primeCostSums: parseSen(totals.primeCostSums), provisionalSums: parseSen(totals.provisionalSums), incompleteLines: 0 }
        : null,
    band: band ? { label: band.label, retentionApplies: band.retentionApplies, defectsLiabilityApplies: band.defectsLiabilityApplies, provenance: band.provenance } : null,
    type: { name: cls?.contractType.nameEn ?? type?.nameEn ?? null, defectsLiabilityApplies: typeof frozenDlp === "boolean" ? frozenDlp : frozenDlp === null ? null : (type?.defectsLiabilityApplies ?? null) },
    interimPolicy: { floor: senOrNull(policy?.firstCertificateFloor), pct: pctString(policy?.firstCertificatePct), provenance: (policy?.firstCertificateProvenance as Provenance | null) ?? null },
  };
}

/// The inputs as frozen in a baseline's snapshot (bigint as strings), and back.
export const inputsToJson = (i: BaselineInputs) => JSON.parse(JSON.stringify(i, (_, v) => (typeof v === "bigint" ? `sen:${v.toString()}` : v))) as Prisma.InputJsonValue;
export function inputsFromJson(j: unknown): BaselineInputs | null {
  if (!j || typeof j !== "object" || !("award" in (j as object))) return null;
  return JSON.parse(JSON.stringify(j), (_, v) => (typeof v === "string" && v.startsWith("sen:") ? BigInt(v.slice(4)) : v)) as BaselineInputs;
}

// ------------------------------------------------------------------ baseline rows ⇄ values

type BaselineRow = LoadedContract["contract"]["baselines"][number];

export function valuesOf(b: BaselineRow): BaselineValues {
  const src = (s: string | null) => s as BaselineSource | null;
  return {
    contractSum: senFromDecimal(b.contractSum),
    contractDate: day(b.contractDate),
    possessionDate: day(b.possessionDate),
    completionPeriod: b.completionPeriod,
    completionUnit: b.completionUnit as PeriodUnit,
    dateForCompletion: day(b.dateForCompletion),
    dlpApplies: b.dlpApplies,
    dlpMonths: b.dlpMonths,
    dlpSource: src(b.dlpSource),
    ladKind: b.ladKind as LadKind | null,
    ladAmount: senOrNull(b.ladAmount),
    ladPct: pctString(b.ladPct),
    ladUnit: b.ladUnit,
    ladDaily: senOrNull(b.ladDaily),
    ladSource: src(b.ladSource),
    retentionApplies: b.retentionApplies,
    retentionPercent: pctString(b.retentionPercent),
    retentionCapPercent: pctString(b.retentionCapPercent),
    retentionSource: src(b.retentionSource),
    pcSums: senOrNull(b.pcSums),
    provisionalSums: senOrNull(b.provisionalSums),
    sumsSource: src(b.sumsSource),
    buildersWorksValue: senOrNull(b.buildersWorksValue),
    firstInterimMinimum: senOrNull(b.firstInterimMinimum),
    firstInterimSource: src(b.firstInterimSource),
    subsequentInterimMinimum: senOrNull(b.subsequentInterimMinimum),
    subsequentInterimSource: src(b.subsequentInterimSource),
    honourCertificateDays: b.honourCertificateDays,
    honourSource: src(b.honourSource),
    unfixedMaterialsPct: pctString(b.unfixedMaterialsPct),
    onCostPct: pctString(b.onCostPct),
    designWorkValue: senOrNull(b.designWorkValue),
    sectionalCompletion: b.sectionalCompletion,
    sectionalSource: src(b.sectionalSource),
    sections: b.sections.map((s): SectionValue => ({ ref: s.ref, description: s.description, ladKind: s.ladKind as LadKind | null, ladAmount: senOrNull(s.ladAmount), ladPct: pctString(s.ladPct), ladDaily: senOrNull(s.ladDaily), extensionDays: s.extensionDays })),
    // 6.13 Part B run 1b (ADR 0030): the days extensions have added.
    extensionDays: b.extensionDays,
  };
}

const m = (s: Sen | null) => (s == null ? null : senToDecimalString(s));
const dd = (d: string | null) => (d ? dayToDate(d) : null);

/// The columns a baseline row is written with (sections apart).
export function rowOf(v: BaselineValues) {
  return {
    contractSum: senToDecimalString(v.contractSum),
    contractDate: dd(v.contractDate),
    possessionDate: dd(v.possessionDate),
    completionPeriod: v.completionPeriod,
    completionUnit: v.completionUnit,
    dateForCompletion: dd(v.dateForCompletion),
    dlpApplies: v.dlpApplies,
    dlpMonths: v.dlpMonths,
    dlpSource: v.dlpSource,
    ladKind: v.ladKind,
    ladAmount: m(v.ladAmount),
    ladPct: v.ladPct,
    ladUnit: v.ladUnit,
    ladDaily: m(v.ladDaily),
    ladSource: v.ladSource,
    retentionApplies: v.retentionApplies,
    retentionPercent: v.retentionPercent,
    retentionCapPercent: v.retentionCapPercent,
    retentionSource: v.retentionSource,
    pcSums: m(v.pcSums),
    provisionalSums: m(v.provisionalSums),
    sumsSource: v.sumsSource,
    buildersWorksValue: m(v.buildersWorksValue),
    firstInterimMinimum: m(v.firstInterimMinimum),
    firstInterimSource: v.firstInterimSource,
    subsequentInterimMinimum: m(v.subsequentInterimMinimum),
    subsequentInterimSource: v.subsequentInterimSource,
    honourCertificateDays: v.honourCertificateDays,
    honourSource: v.honourSource,
    unfixedMaterialsPct: v.unfixedMaterialsPct,
    onCostPct: v.onCostPct,
    designWorkValue: m(v.designWorkValue),
    sectionalCompletion: v.sectionalCompletion,
    sectionalSource: v.sectionalSource,
    extensionDays: v.extensionDays ?? 0,
  };
}

export const sectionRows = (v: BaselineValues, organisationId: string) =>
  v.sections.map((s, n) => ({ organisationId, ref: s.ref, description: s.description, ladKind: s.ladKind, ladAmount: m(s.ladAmount), ladPct: s.ladPct, ladDaily: m(s.ladDaily), extensionDays: s.extensionDays ?? 0, sortOrder: n }));

/// The baseline in a version row's terms (for baselineFor), with the organisation's day it was recorded.
export const versionRowOf = (b: BaselineRow) => ({ ...b, version: b.version, reason: b.reason as BaselineReason | null, recordedOn: day(b.recordedOn) });

/// The draft, and the numbered versions oldest first.
export function baselineRows(c: LoadedContract["contract"]) {
  return { draft: c.baselines.find((b) => b.version == null) ?? null, versions: c.baselines.filter((b) => b.version != null).sort((x, y) => x.version! - y.version!) };
}

/// The baseline's inputs as frozen in the draft's snapshot; null where the draft is absent or predates the shape.
export const frozenInputsOf = (c: LoadedContract["contract"]) => {
  const d = baselineRows(c).draft;
  return d ? inputsFromJson((d.snapshot as { inputs?: unknown } | null)?.inputs) : null;
};

/// The values a fresh build of the frozen inputs gives with what was keyed (each keyed group's value, as saved).
export function rebuiltDraft(inputs: BaselineInputs, entered: unknown) {
  return buildBaseline(inputs, enteredValuesOf(entered));
}

/// The keyed values as stored on the draft (`entered` JSON: per group, value + provenance + note).
export function enteredValuesOf(json: unknown) {
  const e = (json && typeof json === "object" ? json : {}) as Record<string, { value?: unknown }>;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(e)) if (v && typeof v === "object" && "value" in v) out[k] = JSON.parse(JSON.stringify(v.value), (_, x) => (typeof x === "string" && x.startsWith("sen:") ? BigInt(x.slice(4)) : x));
  return out as Parameters<typeof buildBaseline>[1];
}

export { PER_DAY };

// ------------------------------------------------------------------ the list

export const CONTRACT_PAGE = 50;

/// Contracts after award, newest number first, paged in the database.
export async function listContracts(organisationId: string, page = 0, only: readonly string[] | null = null) {
  const org = await exerciseOrg(organisationId);
  if (!org) return { org: null, rows: [], total: 0, page: 0, counts: { preparing: 0, returned: 0, legal: 0, endorsed: 0, executed: 0 } };
  const where = { organisationId: org.id };
  // 6.13 Part A review 14: a view over the whole set (the In Delay contracts, say) pages within it, never within a page.
  const listed = only ? { ...where, id: { in: [...only] } } : where;
  const [rows, total, preparing, returned, legal, endorsed, executed] = await Promise.all([
    db.contract.findMany({
      where: listed,
      orderBy: [{ numberedOn: "desc" }, { number: "desc" }],
      skip: page * CONTRACT_PAGE,
      take: CONTRACT_PAGE,
      select: {
        id: true, number: true, status: true, contractSum: true, contractDate: true,
        award: { select: { id: true, reference: true, awardeeName: true, exercise: { select: { title: true } } } },
        // Every version's day, so the version in force is read through baselineFor (ADR 0021), never the highest number.
        baselines: { where: { version: { not: null } }, select: { version: true, reason: true, recordedOn: true, dateForCompletion: true } },
      },
    }),
    db.contract.count({ where: listed }),
    db.contract.count({ where: { ...where, status: "IN_PREPARATION" } }),
    db.contract.count({ where: { ...where, status: "RETURNED_FOR_AMENDMENT" } }),
    db.contract.count({ where: { ...where, status: "PENDING_LEGAL_ENDORSEMENT" } }),
    db.contract.count({ where: { ...where, status: "LEGALLY_ENDORSED" } }),
    db.contract.count({ where: { ...where, status: { in: [...EXECUTED_STATES] } } }),
  ]);
  const today = org.timeZone ? dayOf(new Date(), org.timeZone) : null;
  const out = rows.map((r) => {
    const inForce = today ? baselineFor(r.baselines.map((b) => ({ version: b.version, reason: b.reason as BaselineReason | null, recordedOn: day(b.recordedOn), dateForCompletion: b.dateForCompletion })), today) : null;
    return { ...r, dateForCompletion: inForce?.dateForCompletion ?? null };
  });
  return { org, rows: out, total, page, counts: { preparing, returned, legal, endorsed, executed } };
}

/// The day the contract's preparation started, as frozen.
export const preparationOn = (c: LoadedContract["contract"]) => readFormationSnapshot(c.formationSnapshot)?.startedOn ?? null;

// ------------------------------------------------------------------ history

export const CONTRACT_HISTORY_PAGE = 200;

/// Every change to the contract and what is under it: its own rows, and every row its acts wrote under its label.
export async function contractHistory(l: LoadedContract) {
  const c = l.contract;
  const where = { organisationId: l.org.id, OR: [{ entityId: { in: [c.id, ...c.policies.map((p) => p.id)] } }, { entityLabel: { startsWith: `Contract ${c.number} ·` } }] };
  const [rows, total] = await Promise.all([db.auditEntry.findMany({ where, orderBy: { at: "desc" }, take: CONTRACT_HISTORY_PAGE }), db.auditEntry.count({ where })]);
  return {
    total,
    entries: rows.map((e) => ({ id: e.id, entity: e.entity, entityLabel: e.entityLabel, action: e.action, at: e.at, reason: e.reason, changes: (e.changes ?? []) as unknown as { field: string; before: string | null; after: string | null }[] })),
  };
}
