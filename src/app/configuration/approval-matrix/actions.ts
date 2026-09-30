"use server";

import { revalidatePath } from "next/cache";

import type { FormState } from "@/components/record-editor";
import { auditedCreate, auditedDelete, auditedUpdate, writeAudit } from "@/lib/audit/record";
import { diffFields, snapshotFields } from "@/lib/audit/diff";
import { issueFault, onRoute, predecessorOf, startOfDay } from "@/lib/authority/issue";
import { boundaryFaultsAcross, boundaryRuleFault, rulesTiedWith } from "@/lib/authority/resolve";
import type { Rule } from "@/lib/authority/types";
import { db } from "@/lib/db";
import { compareAmounts } from "@/lib/money";
import { findingText } from "@/lib/method/labels";
import { matrixPolicyFaults, termsBandBoundaryFault } from "@/lib/method/boundary";
import { ORGANISATION_CODE } from "@/lib/org";
import { FormReader } from "@/lib/validate";

/// A recommender proposes or recommends. Approving is the approver's act, set on
/// the rule itself; a recommender step saying "approve" would put two approvers in
/// one chain.
const RECOMMENDER_ACTS = ["P", "JP", "R", "JR", "MR", "MJR"] as const;
const COMMITTEE_ACTS = ["R", "JR", "MR", "MJR", "A", "MA"] as const;
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

/// An issued issue is frozen. Every writer that changes an issue or its rules asks
/// this first — hiding the buttons is not enough, a server action is a public POST.
const FROZEN: FormState = {
  ok: false,
  message:
    "This issue has been issued, so it can no longer be changed. Start a new issue to change the limits.",
};

// Money and percentage columns as strings, for an audit diff that reads as figures.
const decimals = <T extends Record<string, unknown>>(row: T): T =>
  Object.fromEntries(
    Object.entries(row).map(([k, v]) => [
      k,
      v != null && typeof v === "object" && "toFixed" in (v as object) ? String(v) : v,
    ]),
  ) as T;

/// A stored rule as the pure band checks read it.
type RuleRow = {
  ruleKey: string; labelEn: string; domain: string; method: string | null; cond: string | null; isGap: boolean;
  minValue: unknown; maxValue: unknown; pctMin: unknown; pctMax: unknown; contractValueMin: unknown; contractValueMax: unknown;
  followsBoundarySwitch: boolean | null;
};
const n = (x: unknown) => (x == null ? null : Number(String(x)));
function bandsOf(x: RuleRow): Rule {
  return {
    ruleKey: x.ruleKey, labelEn: x.labelEn, domain: x.domain, method: x.method ?? null, cond: x.cond ?? null, isGap: x.isGap,
    minValue: n(x.minValue), maxValue: n(x.maxValue), pctMin: n(x.pctMin), pctMax: n(x.pctMax),
    contractValueMin: n(x.contractValueMin), contractValueMax: n(x.contractValueMax), followsBoundarySwitch: x.followsBoundarySwitch ?? null,
  } as Rule;
}

/// The refusal naming every rule the boundary check fails, or null.
function boundaryRefusal(rules: RuleRow[], boundaryValue: unknown): string | null {
  const faults = boundaryFaultsAcross(rules.map(bandsOf), { boundaryValue: Number(String(boundaryValue)) });
  if (faults.length === 0) return null;
  return `At the boundary value, ${faults
    .map((f) => `“${f.rule.labelEn}” ${f.fault === "BOUNDARY_SWITCH_UNDECIDED" ? "has not decided whether it follows the boundary switch" : "disagrees with its neighbour about the switch"}`)
    .join("; ")}. Decide it on each rule first.`;
}

/// The refusal naming every terms band whose edge sits on the boundary undecided.
async function termsRefusal(authorityMatrixId: string, boundaryValue: unknown): Promise<string | null> {
  const bands = await db.termsBand.findMany({ where: { authorityMatrixId } });
  const undecided = bands.filter((t) => termsBandBoundaryFault({ minValue: n(t.minValue), maxValue: n(t.maxValue), followsBoundarySwitch: t.followsBoundarySwitch }, { boundaryValue: Number(String(boundaryValue)) }));
  if (undecided.length === 0) return null;
  return `At the boundary value, the terms ${undecided.length === 1 ? "band" : "bands"} ${undecided.map((t) => `“${t.labelEn}”`).join(", ")} ${undecided.length === 1 ? "has" : "have"} not decided whether to follow the boundary switch. Decide it on each band first.`;
}

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

  const before = id
    ? await db.authorityMatrix.findFirst({ where: { id, organisationId: orgId } })
    : null;
  if (id && !before) return { ok: false, message: "That issue no longer exists." };
  if (before?.issuedAt) return FROZEN;

  const label = r.text("label", "Label", { required: true, max: 120 });
  // A draft's date is when it is meant to start. Nothing is in force until it is
  // issued, and issuing is where the period is checked and the predecessor ended.
  const effectiveFrom = r.date("effectiveFrom", "Meant to start", { required: true });

  const quotationFloor = r.money("quotationFloor", "Quotation floor", { required: true });
  const tenderFloor = r.money("tenderFloor", "Tender floor", { required: true });
  const boundaryValue = r.money("boundaryValue", "Where the bands meet", { required: true });
  const requisitionBoundary = r.money("requisitionBoundary", "Requisition boundary", {
    required: true,
  });

  // The boundary ruling (spec D3, 6.3 ruling R-8): where it comes from, and the
  // document, which a stated ruling must cite. Frozen with the issue like the rest.
  const boundaryProvenance = r.choice("boundaryProvenance", "Where the boundary ruling comes from", ["STATED", "OBSERVED", "ASSUMED"] as const, { required: true });
  const boundarySource = r.text("boundarySource", "Boundary ruling source", { max: 240 });

  // The tender floor must be above the quotation floor and must be the boundary (a
  // hard reject, 6.3 ruling R-7); a stated ruling cites its source. Checked in lib.
  if (quotationFloor && tenderFloor && boundaryValue && boundaryProvenance) {
    for (const f of matrixPolicyFaults({ quotationFloor, tenderFloor, boundaryValue, boundaryProvenance, boundarySource })) {
      r.reject(f.field, findingText(f));
    }
  }

  const existing = await db.authorityMatrix.findMany({
    where: { organisationId: orgId, ...(id ? { NOT: { id } } : {}) },
    select: { label: true },
  });
  if (existing.some((e) => e.label === label)) {
    r.reject("label", "An issue with that label already exists.");
  }

  // A funder's rule set is an issue for one funding route (FR-REQ-006). Only a route
  // whose funder supersedes the limits is ever routed by one, so any other is refused
  // rather than saved as a rule set nothing would read.
  const fundingRouteCode = r.optionalText("fundingRouteCode");
  if (fundingRouteCode) {
    const route = await db.fundingRoute.findFirst({
      where: { organisationId: orgId, code: fundingRouteCode },
      select: { supersedesAuthority: true, retiredOn: true },
    });
    if (!route) r.reject("fundingRouteCode", "That funding route no longer exists.");
    else if (!route.supersedesAuthority) {
      r.reject(
        "fundingRouteCode",
        "This funding route's funder does not supersede the limits, so its rule set would never route anything. Set that on the route under Reference data first.",
      );
    }
  }

  const v = {
    label,
    effectiveFrom: effectiveFrom ?? new Date(),
    effectiveTo: null,
    boundaryValue: boundaryValue ?? "0",
    boundaryInclusive: r.bool("boundaryInclusive"),
    quotationFloor: quotationFloor ?? "0",
    tenderFloor: tenderFloor ?? "0",
    requisitionBoundary: requisitionBoundary ?? "0",
    // AuthorityMatrix.splittingWindowDays is deprecated (6.1 ruling OD-9): never read,
    // edited or shown. The window lives in RequisitionPolicy.
    fundingRouteCode,
    currency: r.text("currency", "Currency", { required: true, max: 8 }),
    boundaryProvenance: boundaryProvenance ?? "ASSUMED",
    boundarySource,
    noRuleClause: r.optionalText("noRuleClause"),
    selfApprovalClause: r.optionalText("selfApprovalClause"),
    absenceClause: r.optionalText("absenceClause"),
    funderOverrideClause: r.optionalText("funderOverrideClause"),
  };

  // Moving the boundary can put an existing rule's edge on it (code review, item 7), and
  // flipping which side it falls on changes what every rule on it means (round 3, k):
  // either one re-checks the rules against it.
  const moved = before && boundaryValue && compareAmounts(boundaryValue, before.boundaryValue.toString()) !== 0;
  const flipped = before && v.boundaryInclusive !== before.boundaryInclusive;
  if (before && boundaryValue && (moved || flipped)) {
    const rows = await db.authorityRule.findMany({ where: { authorityMatrixId: before.id } });
    const refusal = boundaryRefusal(rows, boundaryValue) ?? (await termsRefusal(before.id, boundaryValue));
    if (refusal) r.reject(moved ? "boundaryValue" : "boundaryInclusive", refusal);
  }

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
  } else if (before) {
    await auditedUpdate(
      { ...ctx, entityId: before.id },
      {
        ...before,
        boundaryValue: before.boundaryValue.toString(),
        quotationFloor: before.quotationFloor.toString(),
        tenderFloor: before.tenderFloor.toString(),
        requisitionBoundary: before.requisitionBoundary.toString(),
      },
      v,
      (tx) => tx.authorityMatrix.update({ where: { id: before.id }, data: v }),
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
    select: { id: true, label: true, issuedAt: true, boundaryValue: true },
  });
  if (!matrix) return { ok: false, message: "That issue of the limits no longer exists." };
  if (matrix.issuedAt) return FROZEN;

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
  if (minValue && maxValue && compareAmounts(maxValue, minValue) <= 0) {
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
    followsBoundarySwitch: (() => {
      const f = r.choice("followsBoundarySwitch", "At the boundary value", ["yes", "no"] as const);
      return f == null ? null : f === "yes";
    })(),
    labelEn: r.text("labelEn", "Label", { required: true, max: 240 }),
    labelMs: r.optionalText("labelMs"),
    proposerCode: r.optionalText("proposerCode"),
    approverCode,
    committeeCode,
    committeeAct: r.choice("committeeAct", "Committee acts as", COMMITTEE_ACTS) ?? null,
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
      followsBoundarySwitch: x.followsBoundarySwitch ?? null,
    }) as Rule;
  if (!r.failed) {
    // An edge on the boundary must say whether it follows the switch, and two rules
    // meeting there must agree (6.1 ruling OD-4).
    const boundary = boundaryRuleFault(asBands(v), { boundaryValue: Number(matrix.boundaryValue.toString()) }, siblings.map(asBands));
    if (boundary === "BOUNDARY_SWITCH_UNDECIDED") {
      r.reject(
        "followsBoundarySwitch",
        "An edge of this band is the value where the bands meet. Decide whether the band follows the boundary switch there.",
      );
    } else if (boundary === "BOUNDARY_SWITCH_DISAGREES") {
      r.reject(
        "followsBoundarySwitch",
        "The neighbouring rule for the same matter meets this one at the boundary and decides the other way. Make them agree, or a value exactly on the boundary would fall in both bands or neither.",
      );
    }
  }
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
    select: { id: true, labelEn: true, authorityMatrix: { select: { issuedAt: true } } },
  });
  if (!rule) return { ok: false, message: "That rule no longer exists." };
  if (rule.authorityMatrix.issuedAt) return FROZEN;

  const r = new FormReader(data);
  const roleCode = r.text("roleCode", "Office", { required: true });
  const act = r.choice("act", "Acts as", RECOMMENDER_ACTS, { required: true });
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

/// Take a recommender off a draft's rule.
export async function removeRecommender(_prev: FormState, data: FormData): Promise<FormState> {
  const orgId = await organisationId();
  if (!orgId) return NO_ORG;

  const id = String(data.get("id") ?? "");
  const step = await db.authorityRuleStep.findFirst({
    where: { id, authorityRule: { authorityMatrix: { organisationId: orgId } } },
    include: { authorityRule: { select: { labelEn: true, authorityMatrix: { select: { issuedAt: true } } } } },
  });
  if (!step) return { ok: false, message: "That step no longer exists." };
  if (step.authorityRule.authorityMatrix.issuedAt) return FROZEN;

  const { authorityRule, ...row } = step;
  await auditedDelete(
    {
      organisationId: orgId,
      entity: "AuthorityRuleStep",
      entityId: step.id,
      entityLabel: `${authorityRule.labelEn} — ${step.roleCode}`,
      reason: String(data.get("reason") ?? ""),
    },
    row,
    (tx) => tx.authorityRuleStep.delete({ where: { id: step.id } }),
  );

  revalidatePath(PATH);
  return { ok: true };
}

/**
 * Start a revision: a draft copy of an issue — thresholds, clauses, every rule and
 * every recommender — to be changed and then issued. The issue it copies is untouched.
 */
export async function startRevision(_prev: FormState, data: FormData): Promise<FormState> {
  const orgId = await organisationId();
  if (!orgId) return NO_ORG;

  const fromId = String(data.get("fromId") ?? "");
  const source = await db.authorityMatrix.findFirst({
    where: { id: fromId, organisationId: orgId },
    include: { rules: { include: { recommenders: true } }, termsBands: true },
  });
  if (!source) return { ok: false, message: "That issue no longer exists." };

  const r = new FormReader(data);
  const label = r.text("label", "Label", { required: true, max: 120 });
  const effectiveFrom = r.date("effectiveFrom", "Meant to start", { required: true });

  const [labels, drafts] = await Promise.all([
    db.authorityMatrix.findMany({ where: { organisationId: orgId }, select: { label: true } }),
    // Partitioned by route: a funder's draft rule set and the organisation's own draft
    // are not competing versions of one thing.
    db.authorityMatrix.count({ where: { organisationId: orgId, issuedAt: null, fundingRouteCode: source.fundingRouteCode } }),
  ]);
  if (labels.some((l) => l.label === label)) r.reject("label", "An issue with that label already exists.");
  // One draft at a time: two would be two competing versions of what comes next.
  if (drafts > 0) return { ok: false, message: "A draft issue already exists. Issue or finish that one first." };

  const parsed = r.finish({ label, effectiveFrom });
  if (!parsed.ok) return { ok: false, errors: parsed.errors };

  const { rules, termsBands, ...policy } = source;
  // A new row: the source's id is dropped, everything else carried.
  const draftPolicy = {
    ...policy,
    id: undefined,
    label,
    effectiveFrom: effectiveFrom!,
    effectiveTo: null,
    issuedAt: null,
  };

  await db.$transaction(async (tx) => {
    // Decimal columns pass straight through: never via a number.
    const draft = await tx.authorityMatrix.create({ data: draftPolicy });
    for (const rule of rules) {
      const { recommenders, ...ruleData } = rule;
      await tx.authorityRule.create({
        data: {
          ...ruleData,
          id: undefined,
          authorityMatrixId: draft.id,
          recommenders: {
            create: recommenders.map(({ roleCode, act, sequence }) => ({ roleCode, act, sequence })),
          },
        },
      });
    }
    // Terms bands travel with the issue, as its rules do (6.3).
    for (const band of termsBands) {
      await tx.termsBand.create({ data: { ...band, id: undefined, authorityMatrixId: draft.id } });
    }
    await writeAudit(
      tx,
      {
        organisationId: orgId,
        entity: "AuthorityMatrix",
        entityId: draft.id,
        entityLabel: label,
        reason: `New issue from ${source.label}`,
      },
      "CREATE",
      diffFields(null, { label, effectiveFrom, startedFrom: source.label, rules: rules.length, termsBands: termsBands.length }),
    );
  });

  revalidatePath(PATH);
  return { ok: true };
}

/**
 * Issue a draft: put it into force from a date, end the issue it replaces on that
 * date, and freeze it. One transaction, with the audit, so the history can never show
 * two issues in force or none.
 */
export async function issueDraft(_prev: FormState, data: FormData): Promise<FormState> {
  const orgId = await organisationId();
  if (!orgId) return NO_ORG;

  const id = String(data.get("id") ?? "");
  const draft = await db.authorityMatrix.findFirst({
    where: { id, organisationId: orgId },
    include: { _count: { select: { rules: true } } },
  });
  if (!draft) return { ok: false, message: "That draft no longer exists." };
  if (draft.issuedAt) return { ok: false, message: "That issue has already been issued." };

  const r = new FormReader(data);
  const from = r.date("effectiveFrom", "In force from", { required: true });
  const reason = r.text("reason", "Why", { required: true, max: 2000 });

  // Partitioned by route: issuing a funder's rule set never ends the organisation's
  // own issue, nor is it refused for coming before it (6.1, funder rule set ruling).
  const issued = onRoute(
    await db.authorityMatrix.findMany({
      where: { organisationId: orgId, issuedAt: { not: null } },
      select: { id: true, label: true, effectiveFrom: true, effectiveTo: true, fundingRouteCode: true },
    }),
    draft.fundingRouteCode,
  );

  // Every rule is re-checked at the boundary before the issue is frozen.
  const boundaryIssue =
    boundaryRefusal(await db.authorityRule.findMany({ where: { authorityMatrixId: draft.id } }), draft.boundaryValue) ??
    (await termsRefusal(draft.id, draft.boundaryValue));
  if (boundaryIssue) r.reject("effectiveFrom", boundaryIssue);
  if (draft._count.rules === 0) {
    r.reject("effectiveFrom", "This draft has no rules, so nothing could be routed under it. Add its rules first.");
  }
  if (from) {
    const fault = issueFault(from, new Date(), issued);
    if (fault === "IN_THE_PAST") {
      r.reject("effectiveFrom", "An issue cannot start in the past — that would change the rules decisions already ran under.");
    } else if (fault === "NOT_AFTER_LATEST") {
      r.reject("effectiveFrom", "Another issue is already issued to start on or after that date.");
    }
  }
  const parsed = r.finish({ from, reason });
  if (!parsed.ok) return { ok: false, errors: parsed.errors };

  const day = startOfDay(from!);
  const predecessor = predecessorOf(issued, day);
  const now = new Date();

  await db.$transaction(async (tx) => {
    if (predecessor) {
      await tx.authorityMatrix.update({ where: { id: predecessor.id }, data: { effectiveTo: day } });
      await writeAudit(
        tx,
        {
          organisationId: orgId,
          entity: "AuthorityMatrix",
          entityId: predecessor.id,
          entityLabel: issued.find((i) => i.id === predecessor.id)?.label ?? "",
          reason: `Superseded by ${draft.label}: ${reason}`,
        },
        "UPDATE",
        diffFields({ effectiveTo: predecessor.effectiveTo }, { effectiveTo: day }),
      );
    }
    await tx.authorityMatrix.update({
      where: { id: draft.id },
      data: { effectiveFrom: day, effectiveTo: null, issuedAt: now },
    });
    await writeAudit(
      tx,
      { organisationId: orgId, entity: "AuthorityMatrix", entityId: draft.id, entityLabel: draft.label, reason },
      "UPDATE",
      diffFields(
        decimals({ issuedAt: null, effectiveFrom: draft.effectiveFrom }),
        { issuedAt: now, effectiveFrom: day },
      ),
    );
  });

  revalidatePath(PATH);
  return { ok: true };
}

// ---------------------------------------------------------------- terms bands

/**
 * A contract terms band on a draft issue (FR-MTD-001, 6.3 ruling R-14): which terms set
 * applies at a value, never the retention or defects figures. Written under the issue's
 * row lock, so an issue being issued cannot take a band edited at the same moment.
 */
export async function saveTermsBand(_prev: FormState, data: FormData): Promise<FormState> {
  const orgId = await organisationId();
  if (!orgId) return NO_ORG;
  const id = String(data.get("id") ?? "");
  const authorityMatrixId = String(data.get("authorityMatrixId") ?? "");
  const r = new FormReader(data);
  const bandKey = r.code("bandKey", "Key");
  const minValue = r.money("minValue", "From value");
  const maxValue = r.money("maxValue", "To value");
  if (minValue && maxValue && compareAmounts(maxValue, minValue) <= 0) r.reject("maxValue", "The upper bound must be above the lower.");
  const tri = (name: string, label: string) => {
    const c = r.choice(name, label, ["yes", "no"] as const);
    return c == null ? null : c === "yes";
  };
  const v = {
    bandKey,
    minValue,
    maxValue,
    regime: r.choice("regime", "Regime", ["below", "quotation", "tender"] as const),
    labelEn: r.text("labelEn", "Terms set", { required: true, max: 240 }),
    labelMs: r.optionalText("labelMs"),
    retentionApplies: tri("retentionApplies", "Retention"),
    defectsLiabilityApplies: tri("defectsLiabilityApplies", "Defects liability period"),
    insuranceNote: r.text("insuranceNote", "Insurance", { max: 1000 }),
    followsBoundarySwitch: tri("followsBoundarySwitch", "At the boundary value"),
    clause: r.text("clause", "Clause", { max: 120 }),
    provenance: r.choice("provenance", "Where this comes from", ["STATED", "OBSERVED", "ASSUMED"] as const, { required: true }),
    sortOrder: r.int("sortOrder", "Order", { min: 0 }) ?? 0,
  };
  if (r.failed) return { ok: false, errors: r.errors };

  return db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "AuthorityMatrix" WHERE id = ${authorityMatrixId} FOR UPDATE`;
    const matrix = await tx.authorityMatrix.findFirst({ where: { id: authorityMatrixId, organisationId: orgId }, select: { id: true, label: true, issuedAt: true, boundaryValue: true } });
    if (!matrix) return { ok: false, message: "That issue of the limits no longer exists." } as FormState;
    if (matrix.issuedAt) return FROZEN;
    const before = id ? await tx.termsBand.findFirst({ where: { id, authorityMatrixId } }) : null;
    if (id && !before) return { ok: false, message: "That terms band no longer exists." } as FormState;
    const clash = await tx.termsBand.findFirst({ where: { authorityMatrixId, bandKey, ...(before ? { NOT: { id: before.id } } : {}) }, select: { id: true } });
    if (clash) return { ok: false, errors: { bandKey: "A band with that key already exists on this issue." } } as FormState;
    if (termsBandBoundaryFault({ minValue: n(minValue), maxValue: n(maxValue), followsBoundarySwitch: v.followsBoundarySwitch }, { boundaryValue: Number(matrix.boundaryValue.toString()) })) {
      return { ok: false, errors: { followsBoundarySwitch: "An edge of this band is the value where the regimes meet. Decide whether the band follows the boundary switch there." } } as FormState;
    }
    const data2 = { ...v, provenance: v.provenance! };
    const label = `${matrix.label} — ${v.labelEn}`;
    if (!before) {
      const row = await tx.termsBand.create({ data: { authorityMatrixId, ...data2 } });
      await writeAudit(tx, { organisationId: orgId, entity: "TermsBand", entityId: row.id, entityLabel: label }, "CREATE", diffFields(null, data2));
    } else {
      await tx.termsBand.update({ where: { id: before.id }, data: data2 });
      const changes = diffFields(decimals({ ...before }), data2);
      if (changes.length) await writeAudit(tx, { organisationId: orgId, entity: "TermsBand", entityId: before.id, entityLabel: label, reason: String(data.get("reason") ?? "") }, "UPDATE", changes);
    }
    revalidatePath(PATH);
    return { ok: true } as FormState;
  });
}

export async function removeTermsBand(_prev: FormState, data: FormData): Promise<FormState> {
  const orgId = await organisationId();
  if (!orgId) return NO_ORG;
  const id = String(data.get("id") ?? "");
  const reason = String(data.get("reason") ?? "").trim();
  if (!reason) return { ok: false, errors: { reason: "A reason is required." } };
  return db.$transaction(async (tx) => {
    const band = await tx.termsBand.findFirst({ where: { id, authorityMatrix: { organisationId: orgId } }, include: { authorityMatrix: { select: { id: true, label: true } } } });
    if (!band) return { ok: false, message: "That terms band no longer exists." } as FormState;
    await tx.$queryRaw`SELECT id FROM "AuthorityMatrix" WHERE id = ${band.authorityMatrixId} FOR UPDATE`;
    const m = await tx.authorityMatrix.findUniqueOrThrow({ where: { id: band.authorityMatrixId }, select: { issuedAt: true } });
    if (m.issuedAt) return FROZEN;
    const { authorityMatrix, ...row } = band;
    await tx.termsBand.delete({ where: { id } });
    await writeAudit(tx, { organisationId: orgId, entity: "TermsBand", entityId: id, entityLabel: `${authorityMatrix.label} — ${band.labelEn}`, reason }, "DELETE", snapshotFields(decimals(row)));
    revalidatePath(PATH);
    return { ok: true } as FormState;
  });
}
