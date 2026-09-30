"use server";

import { revalidatePath } from "next/cache";

import type { FormState } from "@/components/record-editor";
import { auditedCreate, auditedUpdate } from "@/lib/audit/record";
import { rulesTiedWith } from "@/lib/authority/resolve";
import type { Rule } from "@/lib/authority/types";
import { db } from "@/lib/db";
import { periodsOverlap } from "@/lib/effective";
import { ORGANISATION_CODE } from "@/lib/org";
import { checkPeriod, FormReader } from "@/lib/validate";

const ACTS = ["P", "JP", "R", "JR", "MR", "MJR", "A", "MA"] as const;
const PATH = "/configuration/approval-matrix";

async function organisationId(): Promise<string | null> {
  const org = await db.organisation.findUnique({
    where: { code: ORGANISATION_CODE },
    select: { id: true },
  });
  return org?.id ?? null;
}

const NO_ORG: FormState = {
  ok: false,
  message: "No organisation is configured. Run npm run setup before adding records.",
};

/**
 * One issue of the authority limits.
 *
 * The thresholds are the most consequential numbers in the product: every routing
 * decision is measured against them. Two issues in force on one day would make the
 * route for a matter depend on which row happened to be read first, so an overlap is
 * refused outright.
 */
export async function saveMatrix(_prev: FormState, data: FormData): Promise<FormState> {
  const orgId = await organisationId();
  if (!orgId) return NO_ORG;

  const id = String(data.get("id") ?? "");
  const r = new FormReader(data);

  const label = r.text("label", "Label", { required: true, max: 120 });
  const effectiveFrom = r.date("effectiveFrom", "In force from", { required: true });
  const effectiveTo = r.date("effectiveTo", "In force to");
  checkPeriod(r, effectiveFrom, effectiveTo);

  const quotationFloor = r.money("quotationFloor", "Quotation floor", { required: true });
  const tenderFloor = r.money("tenderFloor", "Tender floor", { required: true });
  const boundaryValue = r.money("boundaryValue", "Where the bands meet", { required: true });
  const requisitionBoundary = r.money("requisitionBoundary", "Requisition boundary", {
    required: true,
  });

  if (quotationFloor && tenderFloor && Number(tenderFloor) <= Number(quotationFloor)) {
    r.reject("tenderFloor", "The tender floor must be above the quotation floor.");
  }
  // The boundary is where the two bands meet, so it has to be the tender floor. A
  // boundary elsewhere would leave a band of values belonging to neither regime.
  if (boundaryValue && tenderFloor && Number(boundaryValue) !== Number(tenderFloor)) {
    r.reject(
      "boundaryValue",
      "The bands meet at the tender floor. Set this to the same figure, or move the floor.",
    );
  }

  const existing = await db.authorityMatrix.findMany({
    where: { organisationId: orgId, ...(id ? { NOT: { id } } : {}) },
    select: { id: true, label: true, effectiveFrom: true, effectiveTo: true },
  });
  if (existing.some((e) => e.label === label)) {
    r.reject("label", "An issue with that label already exists.");
  }
  if (effectiveFrom && !r.failed) {
    const clash = existing.find((e) => periodsOverlap(e, { effectiveFrom, effectiveTo }));
    if (clash) {
      r.reject(
        "effectiveFrom",
        `"${clash.label}" is already in force over part of that period. End it first — two issues in force at once make a route depend on which is read.`,
      );
    }
  }

  const v = {
    label,
    effectiveFrom: effectiveFrom ?? new Date(),
    effectiveTo,
    boundaryValue: boundaryValue ?? "0",
    boundaryInclusive: r.bool("boundaryInclusive"),
    quotationFloor: quotationFloor ?? "0",
    tenderFloor: tenderFloor ?? "0",
    requisitionBoundary: requisitionBoundary ?? "0",
    splittingWindowDays: r.int("splittingWindowDays", "Anti-splitting window", { min: 0 }) ?? 0,
    currency: r.text("currency", "Currency", { required: true, max: 8 }),
    noRuleClause: r.optionalText("noRuleClause"),
    selfApprovalClause: r.optionalText("selfApprovalClause"),
    absenceClause: r.optionalText("absenceClause"),
    funderOverrideClause: r.optionalText("funderOverrideClause"),
  };

  const parsed = r.finish(v);
  if (!parsed.ok) return { ok: false, errors: parsed.errors };

  const ctx = {
    organisationId: orgId,
    entity: "AuthorityMatrix",
    entityLabel: v.label,
    reason: String(data.get("reason") ?? ""),
  };

  if (!id) {
    await auditedCreate(ctx, v, (tx) =>
      tx.authorityMatrix.create({ data: { organisationId: orgId, ...v } }),
    );
  } else {
    const before = await db.authorityMatrix.findUnique({ where: { id } });
    if (!before) return { ok: false, message: "That issue no longer exists." };
    await auditedUpdate(
      { ...ctx, entityId: id },
      {
        ...before,
        boundaryValue: before.boundaryValue.toString(),
        quotationFloor: before.quotationFloor.toString(),
        tenderFloor: before.tenderFloor.toString(),
        requisitionBoundary: before.requisitionBoundary.toString(),
      },
      v,
      (tx) => tx.authorityMatrix.update({ where: { id }, data: v }),
    );
  }

  revalidatePath(PATH);
  return { ok: true };
}

/**
 * One authority row.
 *
 * Every rule carries the clause it came from, so a routing decision can always be
 * traced to the document that set it. A rule with no approver routes nowhere, so it
 * is refused rather than saved as a gap by accident — `isGap` is how a deliberate
 * gap is recorded.
 */
export async function saveRule(_prev: FormState, data: FormData): Promise<FormState> {
  const orgId = await organisationId();
  if (!orgId) return NO_ORG;

  const id = String(data.get("id") ?? "");
  const authorityMatrixId = String(data.get("authorityMatrixId") ?? "");

  const matrix = await db.authorityMatrix.findFirst({
    where: { id: authorityMatrixId, organisationId: orgId },
    select: { id: true, label: true },
  });
  if (!matrix) return { ok: false, message: "That issue of the limits no longer exists." };

  const before = id ? await db.authorityRule.findUnique({ where: { id } }) : null;
  if (id && !before) return { ok: false, message: "That rule no longer exists." };

  const r = new FormReader(data);
  const ruleKey = r.text("ruleKey", "Rule key", { required: true, max: 120 });

  const clash = await db.authorityRule.findFirst({
    where: { authorityMatrixId, ruleKey, ...(id ? { NOT: { id } } : {}) },
    select: { id: true },
  });
  if (clash) r.reject("ruleKey", "A rule with that key already exists in this issue.");

  const minValue = r.money("minValue", "From value");
  const maxValue = r.money("maxValue", "To value");
  if (minValue && maxValue && Number(maxValue) <= Number(minValue)) {
    r.reject("maxValue", "The upper bound must be above the lower.");
  }

  const isGap = r.bool("isGap");
  const approverCode = r.optionalText("approverCode");
  const committeeCode = r.optionalText("committeeCode");

  // A row that routes to nobody would resolve to nothing. Recording it as a gap is a
  // decision; leaving it empty by accident is a defect, and the two must not look
  // alike.
  if (!isGap && !approverCode && !committeeCode) {
    r.reject(
      "approverCode",
      "A rule needs an approver or a committee. Tick “this is a known gap” to record that the source is silent.",
    );
  }
  if (isGap && !r.optionalText("gapNote")) {
    r.reject("gapNote", "Say what the gap is, so the warning on a matter can explain itself.");
  }

  const known = new Set(
    (
      await db.authorityRole.findMany({
        where: { organisationId: orgId },
        select: { code: true },
      })
    ).map((o) => o.code),
  );
  for (const [field, code] of [
    ["approverCode", approverCode],
    ["proposerCode", r.optionalText("proposerCode")],
    ["committeeCode", committeeCode],
  ] as const) {
    if (code && !known.has(code)) {
      r.reject(field, `${code} is not an office. Add it under Users & roles first.`);
    }
  }

  const v = {
    authorityMatrixId,
    ruleKey,
    domain: r.text("domain", "Matter", { required: true, max: 60 }),
    method: r.optionalText("method"),
    // The rule drawer does not carry the variation bands or the condition. A field the
    // form never sent is kept as stored rather than written as empty — otherwise every
    // save of a variation rule would quietly strip the band it routes on.
    cond: data.has("cond") ? r.optionalText("cond") : (before?.cond ?? null),
    minValue,
    maxValue,
    pctMin: before?.pctMin?.toString() ?? null,
    pctMax: before?.pctMax?.toString() ?? null,
    contractValueMin: before?.contractValueMin?.toString() ?? null,
    contractValueMax: before?.contractValueMax?.toString() ?? null,
    labelEn: r.text("labelEn", "Label", { required: true, max: 240 }),
    labelMs: r.optionalText("labelMs"),
    proposerCode: r.optionalText("proposerCode"),
    approverCode,
    committeeCode,
    committeeAct: r.optionalText("committeeAct") as "A" | null,
    nonDelegable: r.bool("nonDelegable"),
    approverMandatory: r.bool("approverMandatory"),
    isGap,
    gapNote: r.optionalText("gapNote"),
    note: r.text("note", "Note", { max: 2000 }),
    clause: r.text("clause", "Clause", { required: true, max: 120 }),
    sortOrder: r.int("sortOrder", "Order", { min: 0 }) ?? 0,
  };

  // Two rules that tie for some matter leave its route to row order. Refused here, as
  // the resolver flags it on a matter; gap rows are exempt, overlapping is their job.
  const siblings = await db.authorityRule.findMany({
    where: { authorityMatrixId, ...(before ? { NOT: { id: before.id } } : {}) },
  });
  const asBands = (x: typeof v | (typeof siblings)[number]) =>
    ({
      ruleKey: x.ruleKey,
      labelEn: x.labelEn,
      domain: x.domain,
      method: x.method ?? null,
      cond: x.cond ?? null,
      isGap: x.isGap,
      minValue: x.minValue == null ? null : Number(x.minValue.toString()),
      maxValue: x.maxValue == null ? null : Number(x.maxValue.toString()),
      pctMin: x.pctMin == null ? null : Number(x.pctMin.toString()),
      pctMax: x.pctMax == null ? null : Number(x.pctMax.toString()),
      contractValueMin: x.contractValueMin == null ? null : Number(x.contractValueMin.toString()),
      contractValueMax: x.contractValueMax == null ? null : Number(x.contractValueMax.toString()),
    }) as Rule;
  if (!r.failed) {
    const tied = rulesTiedWith(asBands(v), siblings.map(asBands));
    if (tied.length > 0) {
      r.reject(
        "minValue",
        `This band overlaps “${tied[0].labelEn}” for the same matter. A value in both would route by row order — narrow one of the bands, or record this one as a known gap.`,
      );
    }
  }

  const parsed = r.finish(v);
  if (!parsed.ok) return { ok: false, errors: parsed.errors };

  const ctx = {
    organisationId: orgId,
    entity: "AuthorityRule",
    entityLabel: `${matrix.label} — ${v.labelEn}`,
    reason: String(data.get("reason") ?? ""),
  };

  if (!before) {
    await auditedCreate(ctx, v, (tx) => tx.authorityRule.create({ data: v }));
  } else {
    await auditedUpdate(
      { ...ctx, entityId: id },
      {
        ...before,
        minValue: before.minValue?.toString() ?? null,
        maxValue: before.maxValue?.toString() ?? null,
        pctMin: before.pctMin?.toString() ?? null,
        pctMax: before.pctMax?.toString() ?? null,
        contractValueMin: before.contractValueMin?.toString() ?? null,
        contractValueMax: before.contractValueMax?.toString() ?? null,
      },
      v,
      (tx) => tx.authorityRule.update({ where: { id }, data: v }),
    );
  }

  revalidatePath(PATH);
  return { ok: true };
}

/// A recommender on a rule, in sequence. Mandatory acts cannot be skipped later.
export async function saveRecommender(_prev: FormState, data: FormData): Promise<FormState> {
  const orgId = await organisationId();
  if (!orgId) return NO_ORG;

  const authorityRuleId = String(data.get("authorityRuleId") ?? "");
  const rule = await db.authorityRule.findFirst({
    where: { id: authorityRuleId, authorityMatrix: { organisationId: orgId } },
    select: { id: true, labelEn: true },
  });
  if (!rule) return { ok: false, message: "That rule no longer exists." };

  const r = new FormReader(data);
  const roleCode = r.text("roleCode", "Office", { required: true });
  const act = r.choice("act", "Acts as", ACTS, { required: true });
  const sequence = r.int("sequence", "Order", { min: 0 }) ?? 0;

  const office = await db.authorityRole.findFirst({
    where: { organisationId: orgId, code: roleCode },
    select: { code: true },
  });
  if (!office) r.reject("roleCode", "That is not an office.");

  const parsed = r.finish({ authorityRuleId, roleCode, act: act ?? "R", sequence });
  if (!parsed.ok) return { ok: false, errors: parsed.errors };

  await auditedCreate(
    {
      organisationId: orgId,
      entity: "AuthorityRuleStep",
      entityLabel: `${rule.labelEn} — ${roleCode}`,
      reason: String(data.get("reason") ?? ""),
    },
    parsed.value,
    (tx) => tx.authorityRuleStep.create({ data: parsed.value }),
  );

  revalidatePath(PATH);
  return { ok: true };
}
