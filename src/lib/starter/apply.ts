/**
 * Loads starter packs into an organisation (ADR 0043 D1): one transaction, under the organisation's lock, the snapshot read and the plan made
 * after the lock, so the writes meet what the plan saw. A dry run (`apply: false`) plans and writes nothing. A plan with any fault writes
 * nothing. Every write is one audit row with a SYSTEM actor ("Starter pack: Generic v1"), saying where the value comes from and its source.
 *
 * A draft approval matrix or evaluation model is written as a draft only (ADR 0043 D2): no issue date, no issuer, no maker row, so a person
 * adopts it and puts it in force through the normal issue path, and the issue triggers still guard it.
 *
 * The security settings are written here in the open (`securityPolicy.create`/`update`), never through the generic delegate: this file is a
 * named writer of that two-person table (two-person-scan.test.ts), and only while the switch is off or a run creates the row (SP-3, SP-23).
 */

import type { Prisma } from "@/generated/prisma/client";
import { diffFields } from "@/lib/audit/diff";
import { writeAudit, type Tx } from "@/lib/audit/record";
import type { AuditActor } from "@/lib/auth/types";
import type { db as Db } from "@/lib/db";
import { ACT_LABEL } from "@/lib/labels";

import { columnsOf, planPacks, type PackWrite, type PlannedPacks } from "./plan";
import { delegateOf, readSnapshot } from "./snapshot";
import type { PackMatrixDraft, PackModelDraft, StarterPack } from "./types";

const WORDS = { STATED: "Stated", OBSERVED: "Observed", ASSUMED: "Assumed" } as const;
/// Columns kept out of the audit row: keys, kinds, a regime and the list a row is on (codes never reach a screen; the entity label names the list), and the
/// provenance and source, which it records in words.
const UNSHOWN = ["code", "key", "list", "domain", "kind", "regime", "provenance", "governingSource"];
/// Also kept out: a column holding another row's code (`approverCode`, `authorityMethodKey`). A value that is one of the schema's own codes
/// (`BILL_OF_QUANTITIES`, `ONLINE`) is written in words ("Bill of quantities"), except in a name, which is words whatever its case.
const codeColumn = (c: string) => /(Code|Key)$/.test(c);
const inWords = (c: string, v: unknown) => (typeof v === "string" && /^[A-Z][A-Z0-9_]+$/.test(v) && !/^(name|label)/.test(c) ? v.charAt(0) + v.slice(1).toLowerCase().replace(/_/g, " ") : v);

type Writer = { create(a: unknown): Promise<{ id: string }>; update(a: unknown): Promise<{ id: string }> };

export interface LoadOptions {
  apply: boolean;
  now?: Date;
  /// Whether the database holds the demonstration (`demoIsLoaded` in prisma/demo-sign-in.ts). Absent: it does not, so the development fill refuses.
  demoIsLoaded?: (tx: Tx, organisationId: string) => Promise<boolean>;
}
export type LoadResult = PlannedPacks & { applied: boolean };

export async function loadPacks(client: typeof Db, organisationId: string, packs: readonly StarterPack[], opts: LoadOptions): Promise<LoadResult> {
  return client.$transaction(
    async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Organisation" WHERE id = ${organisationId} FOR UPDATE`;
      const demo = opts.demoIsLoaded ? await opts.demoIsLoaded(tx, organisationId) : false;
      const plan = planPacks(packs, await readSnapshot(tx, organisationId, packs, { now: opts.now ?? new Date(), demoIsLoaded: demo }));
      if (!opts.apply || plan.faults.length > 0) return { ...plan, applied: false };
      await runWrites(tx, organisationId, plan.writes);
      return { ...plan, applied: plan.writes.length > 0 };
    },
    { timeout: 300_000, maxWait: 10_000 },
  );
}

async function runWrites(tx: Tx, organisationId: string, writes: readonly PackWrite[]) {
  const made = new Map<string, { id: string; label: string }>();
  const refOf = (v: unknown) => (v && typeof v === "object" && "ref" in v ? String((v as { ref: unknown }).ref) : null);
  const resolved = (values: Record<string, unknown>) => Object.fromEntries(Object.entries(values).map(([c, v]) => [c, refOf(v) ? made.get(refOf(v)!)!.id : v]));
  const shown = (values: Record<string, unknown>, also: readonly string[] = []) =>
    Object.fromEntries(Object.entries(values).filter(([c]) => !UNSHOWN.includes(c) && !also.includes(c) && !codeColumn(c)).map(([c, v]) => [c, refOf(v) ? made.get(refOf(v)!)!.label : inWords(c, v)]));

  for (const w of writes) {
    const actor: AuditActor = { kind: "SYSTEM", label: w.actor };
    const reason = w.kind === "SWITCH_OFF" ? w.reason : `Filled by a starter pack where nobody had set it. Source: ${w.source}${w.requirement ? ` (${w.requirement})` : ""}.`;
    const origin = { whereItComesFrom: WORDS[w.provenance], governingSource: w.source };
    if (w.kind === "SWITCH_OFF") {
      const row = w.create
        ? await tx.securityPolicy.create({ data: { organisationId, twoPersonChanges: false }, select: { id: true } })
        : await tx.securityPolicy.update({ where: { organisationId }, data: { twoPersonChanges: false }, select: { id: true } });
      await writeAudit(tx, { organisationId, entity: "SecurityPolicy", entityId: row.id, entityLabel: "Security settings", reason, actor }, w.create ? "CREATE" : "UPDATE", diffFields(w.create ? null : { twoPersonChanges: true }, { twoPersonChanges: false }));
      continue;
    }
    if (w.kind === "DRAFT_MATRIX") {
      await writeMatrixDraft(tx, organisationId, w.draft, w.values.effectiveFrom as Date, { actor, reason, office: (code) => made.get(`AuthorityRole:${code}`)?.label ?? code });
      continue;
    }
    if (w.kind === "DRAFT_MODEL") {
      await writeModelDraft(tx, organisationId, w.draft, { actor, reason });
      continue;
    }
    const data = resolved(w.values);
    if (w.kind === "GROUP") {
      const row =
        w.model === "SecurityPolicy"
          ? await tx.securityPolicy.update({ where: { organisationId }, data: data as Prisma.SecurityPolicyUncheckedUpdateInput, select: { id: true } }) // the row exists: the switch is off, or this run made it
          : w.model === "Organisation"
            ? await tx.organisation.update({ where: { id: organisationId }, data: data as Prisma.OrganisationUncheckedUpdateInput, select: { id: true } })
            : w.create
              ? await delegateOf<Writer>(tx, w.model).create({ data: { organisationId, ...data }, select: { id: true } })
              : await delegateOf<Writer>(tx, w.model).update({ where: { organisationId }, data, select: { id: true } });
      const hide = [w.provenanceColumn, w.sourceColumn].filter((c): c is string => !!c);
      const after = { ...shown(w.values, hide), ...origin };
      await writeAudit(tx, { organisationId, entity: w.model, entityId: row.id, entityLabel: w.label, reason, actor }, w.create ? "CREATE" : "UPDATE", diffFields(w.before && shown(w.before, hide), after));
      continue;
    }
    const row =
      w.model === "NumberingSeries"
        ? await tx.numberingSeries.create({ data: { organisationId, ...data } as never, select: { id: true } }) // seeds a series into an empty list; the issuer alone advances it
        : (columnsOf(w.model) ?? []).includes("organisationId")
          ? await delegateOf<Writer>(tx, w.model).create({ data: { organisationId, ...data }, select: { id: true } })
          : await delegateOf<Writer>(tx, w.model).create({ data, select: { id: true } }); // a row of another row (a method's proposal item): its parent is its organisation's
    made.set(`${w.model}:${w.code}`, { id: row.id, label: w.label });
    await writeAudit(tx, { organisationId, entity: w.model, entityId: row.id, entityLabel: `${w.listLabel} · ${w.label}`, reason, actor }, "CREATE", diffFields(null, { ...shown(w.values), ...origin }));
  }
}

type DraftAudit = { actor: AuditActor; reason: string };
/// A nested draft child is the loader's own to key: whatever `id` or `organisationId` a pack row carries is dropped, and the loader's keys come last (step 4.8 L2).
const own = <T extends object>(x: T): T => Object.fromEntries(Object.entries(x).filter(([k]) => k !== "id" && k !== "organisationId")) as T;
const money = (n: number | null) => (n == null ? null : String(n));
const draftOrigin = (provenance: keyof typeof WORDS, source: string) => ({ whereItComesFrom: WORDS[provenance], governingSource: source });

/// The draft matrix, its core routing, its terms bands and its rules, each one audit row. Never `issuedAt`, never a maker: a person adopts it and issues it.
async function writeMatrixDraft(tx: Tx, organisationId: string, m: PackMatrixDraft, effectiveFrom: Date, a: DraftAudit & { office: (code: string) => string }) {
  const p = m.policy;
  const matrix = await tx.authorityMatrix.create({
    data: { organisationId, label: m.label, effectiveFrom, boundaryValue: money(p.boundaryValue)!, boundaryInclusive: p.boundaryInclusive, quotationFloor: money(p.quotationFloor)!, tenderFloor: money(p.tenderFloor)!, requisitionBoundary: money(p.requisitionBoundary)!, currency: p.currency, boundaryProvenance: m.boundaryProvenance, boundarySource: m.boundarySource },
    select: { id: true },
  });
  const audit = (entity: string, entityId: string, entityLabel: string, after: Record<string, unknown>) => writeAudit(tx, { organisationId, entity, entityId, entityLabel, reason: a.reason, actor: a.actor }, "CREATE", diffFields(null, after));
  await audit("AuthorityMatrix", matrix.id, m.label, { label: m.label, state: "Draft, not in force", boundaryValue: money(p.boundaryValue), quotationFloor: money(p.quotationFloor), tenderFloor: money(p.tenderFloor), requisitionBoundary: money(p.requisitionBoundary), rules: m.rules.length, boundaryRuling: m.boundaryProvenance ? `${WORDS[m.boundaryProvenance]}: ${m.boundarySource ?? ""}` : null, ...draftOrigin("STATED", m.source) });
  const chain = (steps: { roleCode: string; act: string }[]) => steps.map((s) => `${a.office(s.roleCode)} (${ACT_LABEL[s.act] ?? s.act})`).join(", ") || "None";
  for (const [i, l] of m.coreRouting.entries()) {
    const level = await tx.coreRoutingLevel.create({
      data: { organisationId, authorityMatrixId: matrix.id, approverCode: l.approverCode, clause: l.clause, provenance: l.provenance, note: l.note ?? "", sortOrder: i + 1, steps: { create: l.steps.map((s, n) => ({ organisationId, roleCode: s.roleCode, act: s.act, sequence: n + 1, provenance: s.provenance, note: s.note ?? "" })) } },
      select: { id: true },
    });
    await audit("CoreRoutingLevel", level.id, `${m.label} · core routing · ${a.office(l.approverCode)}`, { approver: a.office(l.approverCode), beneath: chain(l.steps), ...draftOrigin(l.provenance, l.clause) });
  }
  for (const [i, t] of (m.termsBands ?? []).entries()) {
    const band = await tx.termsBand.create({
      data: { authorityMatrixId: matrix.id, bandKey: t.bandKey, regime: t.regime, minValue: money(t.minValue), maxValue: money(t.maxValue), labelEn: t.labelEn, retentionApplies: t.retentionApplies, defectsLiabilityApplies: t.defectsLiabilityApplies, followsBoundarySwitch: t.followsBoundarySwitch, clause: t.clause, provenance: t.provenance, sortOrder: i + 1 },
      select: { id: true },
    });
    await audit("TermsBand", band.id, `${m.label} · ${t.labelEn}`, { labelEn: t.labelEn, minValue: money(t.minValue), maxValue: money(t.maxValue), retentionApplies: t.retentionApplies, defectsLiabilityApplies: t.defectsLiabilityApplies, clause: t.clause, ...draftOrigin(t.provenance, t.clause) });
  }
  for (const [i, r] of m.rules.entries()) {
    const rule = await tx.authorityRule.create({
      data: {
        authorityMatrixId: matrix.id,
        ruleKey: r.ruleKey,
        domain: r.domain,
        method: r.method,
        contractTypeCode: r.contractTypeCode ?? null,
        cond: r.cond,
        minValue: money(r.minValue),
        maxValue: money(r.maxValue),
        pctMin: r.pctMin,
        pctMax: r.pctMax,
        contractValueMin: money(r.contractValueMin),
        contractValueMax: money(r.contractValueMax),
        followsBoundarySwitch: r.followsBoundarySwitch,
        labelEn: r.labelEn,
        labelMs: r.labelMs,
        proposerCode: r.proposerCode,
        approverCode: r.approverCode,
        committeeCode: r.committeeCode,
        committeeAct: r.committeeAct,
        nonDelegable: r.nonDelegable,
        approverMandatory: r.approverMandatory,
        isGap: r.isGap,
        gapNote: r.gapNote,
        note: r.note,
        clause: r.clause,
        sortOrder: r.sortOrder || i + 1,
        generateCoreChain: r.generateCoreChain ?? null,
        coreChainReason: r.coreChainReason ?? null,
        choiceOptionEn: r.choiceOptionEn ?? null,
        chosen: r.chosen ?? null,
        recommenders: { create: r.recommenders.map((x, n) => ({ roleCode: x.roleCode, act: x.act, sequence: n + 1 })) },
      },
      select: { id: true },
    });
    await audit("AuthorityRule", rule.id, `${m.label} · ${r.labelEn}`, {
      labelEn: r.labelEn,
      minValue: money(r.minValue),
      maxValue: money(r.maxValue),
      pctMin: r.pctMin,
      pctMax: r.pctMax,
      contractValueMin: money(r.contractValueMin),
      contractValueMax: money(r.contractValueMax),
      proposer: r.proposerCode ? a.office(r.proposerCode) : null,
      recommenders: chain(r.recommenders),
      approver: r.approverCode ? a.office(r.approverCode) : null,
      clause: r.clause,
      note: r.note || null,
      routeOption: r.choiceOptionEn ? `${r.choiceOptionEn}, ${r.chosen == null ? "not chosen yet" : r.chosen ? "chosen" : "set aside"}` : null,
      ...draftOrigin(r.provenance, r.source),
    });
  }
}

/// The draft model (status DRAFT, version 1), its stages with their criteria and factors, and its band sets with their bands. Never an issuer or a
/// maker: a person edits it (which makes them its maker) and issues it.
async function writeModelDraft(tx: Tx, organisationId: string, d: PackModelDraft, a: DraftAudit) {
  const c = d.content;
  const model = await tx.evaluationModel.create({ data: { organisationId, code: c.code, version: 1, nameEn: c.nameEn, nameMs: c.nameMs, route: c.route, provenance: c.provenance, governingSource: c.governingSource, notes: d.notes ?? "" }, select: { id: true } });
  const label = `${c.nameEn} · version 1`;
  const audit = (entity: string, entityId: string, entityLabel: string, after: Record<string, unknown>) => writeAudit(tx, { organisationId, entity, entityId, entityLabel, reason: a.reason, actor: a.actor }, "CREATE", diffFields(null, after));
  await audit("EvaluationModel", model.id, label, { nameEn: c.nameEn, version: 1, status: "Draft", stages: c.stages.length, bandSets: c.bandSets.length, notes: d.notes ?? null, ...draftOrigin(c.provenance, c.governingSource) });
  for (const set of c.bandSets) {
    const row = await tx.evaluationBandSet.create({
      data: { organisationId, modelId: model.id, code: set.code, nameEn: set.nameEn, provenance: set.provenance, governingSource: set.governingSource, bands: { create: set.bands.map((b) => ({ ...own(b), organisationId })) } },
      select: { id: true },
    });
    await audit("EvaluationBandSet", row.id, `${label} · ${set.nameEn}`, { nameEn: set.nameEn, bands: set.bands.map((b) => b.labelEn).join(", "), ...draftOrigin(set.provenance, set.governingSource) });
  }
  for (const s of c.stages) {
    const { criteria, factors, ...fields } = s;
    const stage = await tx.evaluationStage.create({ data: { ...own(fields), organisationId, modelId: model.id, factorOptions: { create: factors.map((f) => ({ ...own(f), organisationId, governingSource: s.governingSource })) } }, select: { id: true } });
    const ids = new Map<string, string>();
    for (const { parentCode, ...x } of criteria) {
      const row = await tx.evaluationCriterion.create({ data: { ...own(x), organisationId, stageId: stage.id, parentId: parentCode ? ids.get(parentCode)! : null, governingSource: s.governingSource }, select: { id: true } });
      ids.set(x.code, row.id);
    }
    await audit("EvaluationStage", stage.id, `${label} · ${s.labelEn}`, {
      order: s.order,
      labelEn: s.labelEn,
      maxMarks: s.maxMarks,
      passMark: s.passMark,
      compositeWeight: s.compositeWeight,
      criteria: criteria.map((x) => (x.maxMarks ? `${x.labelEn} (${x.maxMarks})` : x.labelEn)).join(", ") || null,
      factors: factors.map((f) => `${f.labelEn} (${f.factorPct}%)`).join(", ") || null,
      ...draftOrigin(s.provenance, s.governingSource),
    });
  }
}
