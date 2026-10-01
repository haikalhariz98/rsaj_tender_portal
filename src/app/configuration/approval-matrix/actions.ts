"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import type { FormState } from "@/components/record-editor";
import { auditedCreate, auditedDelete, auditedUpdate, writeAudit } from "@/lib/audit/record";
import { diffFields, snapshotFields } from "@/lib/audit/diff";
import { issueFault, onRoute, predecessorOf, startOfDay } from "@/lib/authority/issue";
import { boundaryFaultsAcross, boundaryRuleFault, rulesTiedWith } from "@/lib/authority/resolve";
import type { AuthorityAct, CoreLevel, Rule } from "@/lib/authority/types";
import type { Tx } from "@/lib/audit/record";
import { loadIssue } from "@/lib/authority/load";
import { copyCoreRouting, CORE_ACTS, coreChainFaultsAcross, coreLevelFaults, coreLevelFor, ruleCoreFault, type CoreLevelRow } from "@/lib/authority/core-routing";
import { coreLevelFaultText, issueRefusal, ruleSaveRefusal } from "@/lib/authority/core-routing-labels";
import { destinationRowFaults, type RejectionKind } from "@/lib/authority/rejection";
import { DESTINATION_FAULT_TEXT } from "@/lib/authority/rejection-labels";
import { actWithCode, matterLabel } from "@/lib/labels";
import { db } from "@/lib/db";
import { compareAmounts } from "@/lib/money";
import { findingText } from "@/lib/method/labels";
import { overlappingBands } from "@/lib/method/bands";
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
async function termsRefusal(authorityMatrixId: string, boundaryValue: unknown, client: Tx = db): Promise<string | null> {
  const bands = await client.termsBand.findMany({ where: { authorityMatrixId } });
  const undecided = bands.filter((t) => termsBandBoundaryFault({ minValue: n(t.minValue), maxValue: n(t.maxValue), followsBoundarySwitch: t.followsBoundarySwitch }, { boundaryValue: Number(String(boundaryValue)) }));
  if (undecided.length === 0) return null;
  return `At the boundary value, the terms ${undecided.length === 1 ? "band" : "bands"} ${undecided.map((t) => `“${t.labelEn}”`).join(", ")} ${undecided.length === 1 ? "has" : "have"} not decided whether to follow the boundary switch. Decide it on each band first.`;
}

/// A refusal raised inside a write's transaction: it rolls the write back and is
/// returned to the form as it stands.
class Refused extends Error {
  constructor(readonly state: FormState) {
    super("refused");
  }
}

async function refusable(run: () => Promise<FormState>): Promise<FormState> {
  try {
    return await run();
  } catch (e) {
    if (e instanceof Refused) return e.state;
    throw e;
  }
}

/// Lock an issue's row for the rest of the transaction: every write to an issue, its
/// rules or its core routing takes it, so issuing cannot take a half-made change.
async function lockIssue(tx: Tx, authorityMatrixId: string) {
  await tx.$queryRaw`SELECT id FROM "AuthorityMatrix" WHERE id = ${authorityMatrixId} FOR UPDATE`;
}

/// An issue as the resolver reads it, inside the caller's transaction.
async function issueIn(tx: Tx, authorityMatrixId: string) {
  return loadIssue(ORGANISATION_CODE, new Date(), authorityMatrixId, null, tx);
}

/// An office's name for a message, never its code.
const officeIn = (roles: Record<string, { nameEn: string }>, code: string) => roles[code]?.nameEn ?? "An office no longer configured";

/**
 * Whether a rule taking its chain from the core routing may be saved as it would stand
 * (6.9 departure 1): a weaker act, core offices out of order, its approver or an
 * approval beneath it, or one office twice is refused. No core row for its approver is
 * not refused — rules and rows may be entered in either order; the rule warns, and
 * issuing refuses it until the row exists.
 */
function coreSaveFault(rule: Pick<Rule, "approverCode" | "proposerCode" | "recommenders">, core: readonly CoreLevel[], roles: Record<string, { nameEn: string }>): string | null {
  const level = coreLevelFor(core, rule.approverCode);
  if (!level) return null;
  const f = ruleCoreFault(rule, level);
  return f ? ruleSaveRefusal(f.fault, officeIn(roles, f.roleCode)) : null;
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
  // Where the bands meet is the tender floor (ruling R-7): derived, not a second input
  // (UX review). A form that still sends one is checked against the floor in lib.
  const boundaryValue = data.has("boundaryValue") ? r.money("boundaryValue", "Where the bands meet", { required: true }) : tenderFloor;
  // The form has no boundary input: a refusal about it belongs on the tender floor.
  const onForm = (field: string) => (field === "boundaryValue" && !data.has("boundaryValue") ? "tenderFloor" : field);
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
      r.reject(onForm(f.field), findingText(f));
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
    if (refusal) r.reject(moved ? onForm("boundaryValue") : "boundaryInclusive", refusal);
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
    const created = await auditedCreate(ctx, v, (tx) =>
      tx.authorityMatrix.create({ data: { organisationId: orgId, ...v } }),
    );
    // Straight to the new draft (UX review).
    revalidatePath(PATH);
    redirect(`${PATH}?issue=${created.id}`);
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
    // Where the chain beneath the approver comes from (FR-APR-004): not set, generated
    // from the core routing, or as entered — a decision not to check, which needs its
    // reason (ruling OQ-4). The reason is kept only with that decision.
    ...(() => {
      const c = r.choice("generateCoreChain", "Chain beneath the approver", ["yes", "no"] as const);
      const generateCoreChain = c == null ? null : c === "yes";
      const why = r.text("coreChainReason", "Why the chain is as entered", { max: 1000 });
      if (generateCoreChain === false && !why) r.reject("coreChainReason", "Say why this rule's chain is not taken from the core routing — the clause that states it, for example.");
      return { generateCoreChain, coreChainReason: generateCoreChain === false ? why : null };
    })(),
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

  // Re-checked under the issue's lock, on the core routing as it stands in the same
  // transaction, so a core row changed or the issue issued meanwhile is seen.
  const guard = async (tx: Tx) => {
    await lockIssue(tx, authorityMatrixId);
    const locked = await tx.authorityMatrix.findUniqueOrThrow({ where: { id: authorityMatrixId }, select: { issuedAt: true } });
    if (locked.issuedAt) throw new Refused(FROZEN);
    if (v.generateCoreChain !== true) return;
    const issue = await issueIn(tx, authorityMatrixId);
    const steps = issue?.matrix.rules.find((x) => x.ruleKey === before?.ruleKey)?.recommenders ?? [];
    const fault = issue && coreSaveFault({ approverCode: v.approverCode, proposerCode: v.proposerCode, recommenders: steps }, issue.matrix.coreRouting ?? [], issue.matrix.roles);
    if (fault) throw new Refused({ ok: false, errors: { generateCoreChain: fault } });
  };

  const saved = await refusable(async () => {
    if (!before) {
      await auditedCreate(ctx, v, async (tx) => {
        await guard(tx);
        return tx.authorityRule.create({ data: v });
      });
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
        async (tx) => {
          await guard(tx);
          return tx.authorityRule.update({ where: { id }, data: v });
        },
      );
    }
    return { ok: true };
  });
  if (!saved.ok) return saved;

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
    select: { id: true, labelEn: true, authorityMatrixId: true, authorityMatrix: { select: { issuedAt: true } } },
  });
  if (!rule) return { ok: false, message: "That rule no longer exists." };
  if (rule.authorityMatrix.issuedAt) return FROZEN;

  const r = new FormReader(data);
  const roleCode = r.text("roleCode", "Office", { required: true });
  const act = r.choice("act", "Acts as", RECOMMENDER_ACTS, { required: true });
  const sequence = r.int("sequence", "Order", { min: 0 }) ?? 0;

  const office = await db.authorityRole.findFirst({
    where: { organisationId: orgId, code: roleCode },
    select: { code: true, nameEn: true },
  });
  if (!office) r.reject("roleCode", "That is not an office.");

  const parsed = r.finish({ authorityRuleId, roleCode, act: act ?? "R", sequence });
  if (!parsed.ok) return { ok: false, errors: parsed.errors };

  const saved = await refusable(async () => {
    await auditedCreate(
      {
        organisationId: orgId,
        entity: "AuthorityRuleStep",
        entityLabel: `${rule.labelEn} — ${office?.nameEn ?? "An office no longer configured"}`,
        reason: String(data.get("reason") ?? ""),
      },
      parsed.value,
      async (tx) => {
        // The same check as saving the rule, on the chain as it would stand, under the
        // issue's lock (6.9 departure 1).
        await lockIssue(tx, rule.authorityMatrixId);
        const locked = await tx.authorityMatrix.findUniqueOrThrow({ where: { id: rule.authorityMatrixId }, select: { issuedAt: true } });
        if (locked.issuedAt) throw new Refused(FROZEN);
        const row = await tx.authorityRule.findUniqueOrThrow({ where: { id: rule.id }, include: { recommenders: { orderBy: { sequence: "asc" } } } });
        if (row.generateCoreChain === true) {
          const issue = await issueIn(tx, rule.authorityMatrixId);
          const steps = [...row.recommenders.map((x) => ({ roleCode: x.roleCode, act: x.act as AuthorityAct, sequence: x.sequence })), { roleCode, act: (act ?? "R") as AuthorityAct, sequence }]
            .sort((a, b) => a.sequence - b.sequence);
          const fault = issue && coreSaveFault({ approverCode: row.approverCode, proposerCode: row.proposerCode, recommenders: steps }, issue.matrix.coreRouting ?? [], issue.matrix.roles);
          if (fault) throw new Refused({ ok: false, errors: { roleCode: fault } });
        }
        return tx.authorityRuleStep.create({ data: parsed.value });
      },
    );
    return { ok: true };
  });
  if (!saved.ok) return saved;

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
  const r = new FormReader(data);
  const label = r.text("label", "Label", { required: true, max: 120 });
  const effectiveFrom = r.date("effectiveFrom", "Meant to start", { required: true });
  const parsed = r.finish({ label, effectiveFrom });
  if (!parsed.ok) return { ok: false, errors: parsed.errors };

  const result = await db.$transaction(async (tx): Promise<FormState & { draftId?: string }> => {
    // The source is read under its lock, with everything it owns: its rules, its terms
    // bands and its own core routing — never another issue's (6.9 note D-1, OQ-7).
    await lockIssue(tx, fromId);
    const source = await tx.authorityMatrix.findFirst({
      where: { id: fromId, organisationId: orgId },
      include: { rules: { include: { recommenders: true } }, termsBands: true, coreRouting: { include: { steps: true } } },
    });
    if (!source) return { ok: false, message: "That issue no longer exists." };

    const [labels, drafts] = await Promise.all([
      tx.authorityMatrix.findMany({ where: { organisationId: orgId }, select: { label: true } }),
      // Partitioned by route: a funder's draft rule set and the organisation's own draft
      // are not competing versions of one thing.
      tx.authorityMatrix.count({ where: { organisationId: orgId, issuedAt: null, fundingRouteCode: source.fundingRouteCode } }),
    ]);
    if (labels.some((l) => l.label === label)) return { ok: false, errors: { label: "An issue with that label already exists." } };
    // One draft at a time: two would be two competing versions of what comes next.
    if (drafts > 0) return { ok: false, message: "A draft issue already exists. Issue or finish that one first." };

    const { rules, termsBands, coreRouting, ...policy } = source;
    // A new row: the source's id is dropped, everything else carried.
    const draftPolicy = {
      ...policy,
      id: undefined,
      label,
      effectiveFrom: effectiveFrom!,
      effectiveTo: null,
      issuedAt: null,
    };

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
    // So does its core routing: revising §2.2.1 is revising the issue (6.9 note D-1).
    for (const level of copyCoreRouting(coreRouting as CoreLevelRow[], { authorityMatrixId: draft.id, organisationId: orgId })) {
      await tx.coreRoutingLevel.create({ data: level });
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
      diffFields(null, { label, effectiveFrom, startedFrom: source.label, rules: rules.length, termsBands: termsBands.length, coreRouting: coreRouting.length }),
    );
    return { ok: true, draftId: draft.id };
  });
  if (!result.ok || !result.draftId) return result;

  // Straight to the new draft, as a new issue from scratch does (UX 12).
  revalidatePath(PATH);
  redirect(`${PATH}?issue=${result.draftId}`);
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
  const r = new FormReader(data);
  const from = r.date("effectiveFrom", "In force from", { required: true });
  const reason = r.text("reason", "Why", { required: true, max: 2000 });
  const parsed = r.finish({ from, reason });
  if (!parsed.ok) return { ok: false, errors: parsed.errors };

  // Every check runs on the draft as it stands under its lock, in the transaction that
  // issues it (6.9 ruling C6): a rule or a core row changed a moment before is seen.
  const result = await db.$transaction(async (tx): Promise<FormState> => {
    await lockIssue(tx, id);
    const draft = await tx.authorityMatrix.findFirst({
      where: { id, organisationId: orgId },
      include: { _count: { select: { rules: true } } },
    });
    if (!draft) return { ok: false, message: "That draft no longer exists." };
    if (draft.issuedAt) return { ok: false, message: "That issue has already been issued." };

    // Partitioned by route: issuing a funder's rule set never ends the organisation's
    // own issue, nor is it refused for coming before it (6.1, funder rule set ruling).
    const issued = onRoute(
      await tx.authorityMatrix.findMany({
        where: { organisationId: orgId, issuedAt: { not: null } },
        select: { id: true, label: true, effectiveFrom: true, effectiveTo: true, fundingRouteCode: true },
      }),
      draft.fundingRouteCode,
    );

    const refusals: string[] = [];
    // Every rule is re-checked at the boundary before the issue is frozen.
    const boundaryIssue =
      boundaryRefusal(await tx.authorityRule.findMany({ where: { authorityMatrixId: draft.id } }), draft.boundaryValue) ??
      (await termsRefusal(draft.id, draft.boundaryValue, tx));
    if (boundaryIssue) refusals.push(boundaryIssue);
    if (draft._count.rules === 0) {
      refusals.push("This draft has no rules, so nothing could be routed under it. Add its rules first.");
    }
    // Core routing (FR-APR-004): every core row sound, and every rule taking its chain
    // from the core routing able to — none shortened, weakened or out of order.
    const issue = await issueIn(tx, draft.id);
    if (issue) {
      const core = issue.matrix.coreRouting ?? [];
      for (const level of core) {
        for (const f of coreLevelFaults(level, issue.matrix.roles)) {
          refusals.push(`The core routing for ${officeIn(issue.matrix.roles, level.approverCode)}: ${coreLevelFaultText(f.fault, officeIn(issue.matrix.roles, f.roleCode))}`);
        }
      }
      for (const f of coreChainFaultsAcross(issue.matrix.rules, core, issue.matrix.roles)) {
        refusals.push(issueRefusal(f.fault, f.rule.labelEn, f.roleCode ? officeIn(issue.matrix.roles, f.roleCode) : "its approver"));
      }
    }
    const fault = issueFault(from!, new Date(), issued);
    if (fault === "IN_THE_PAST") {
      refusals.push("An issue cannot start in the past — that would change the rules decisions already ran under.");
    } else if (fault === "NOT_AFTER_LATEST") {
      refusals.push("Another issue is already issued to start on or after that date.");
    }
    if (refusals.length > 0) return { ok: false, errors: { effectiveFrom: refusals.join(" ") } };

    const day = startOfDay(from!);
    const predecessor = predecessorOf(issued, day);
    const now = new Date();
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
    return { ok: true };
  });
  if (!result.ok) return result;

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
  // The key is generated from the terms set's name (UX 13); an edit keeps its own.
  const typedKey = String(data.get("bandKey") ?? "").trim();
  // A key a form still sends is a configuration key: lower case, digits, "_", "." or "-".
  if (typedKey && !/^[a-z0-9][a-z0-9_.-]{0,59}$/.test(typedKey)) r.reject("bandKey", "A terms band key is up to 60 lower-case letters, digits, dots, dashes or underscores.");
  const minValue = r.money("minValue", "From value");
  const maxValue = r.money("maxValue", "To value");
  if (minValue && maxValue && compareAmounts(maxValue, minValue) <= 0) r.reject("maxValue", "The upper bound must be above the lower.");
  const tri = (name: string, label: string) => {
    const c = r.choice(name, label, ["yes", "no"] as const);
    return c == null ? null : c === "yes";
  };
  const v = {
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
  };
  if (r.failed) return { ok: false, errors: r.errors };

  return db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "AuthorityMatrix" WHERE id = ${authorityMatrixId} FOR UPDATE`;
    const matrix = await tx.authorityMatrix.findFirst({ where: { id: authorityMatrixId, organisationId: orgId }, select: { id: true, label: true, issuedAt: true, boundaryValue: true, boundaryInclusive: true } });
    if (!matrix) return { ok: false, message: "That issue of the limits no longer exists." } as FormState;
    if (matrix.issuedAt) return FROZEN;
    const before = id ? await tx.termsBand.findFirst({ where: { id, authorityMatrixId } }) : null;
    // Two terms sets never both apply at one value (ruling on BD-24).
    const siblings = await tx.termsBand.findMany({ where: { authorityMatrixId, ...(id ? { NOT: { id } } : {}) } });
    const clash = overlappingBands(
      { minValue: n(minValue), maxValue: n(maxValue), regime: v.regime, followsBoundarySwitch: v.followsBoundarySwitch },
      siblings.map((t) => ({ labelEn: t.labelEn, minValue: n(t.minValue), maxValue: n(t.maxValue), regime: t.regime, followsBoundarySwitch: t.followsBoundarySwitch })),
      { boundaryValue: Number(matrix.boundaryValue.toString()), boundaryInclusive: matrix.boundaryInclusive },
    );
    if (clash.length > 0) {
      return { ok: false, errors: { maxValue: `These values overlap ${clash.map((t) => `“${t.labelEn}”`).join(", ")} in the same regime. Two terms sets cannot both apply at one value; change the edges or the regime.` } } as FormState;
    }
    if (id && !before) return { ok: false, message: "That terms band no longer exists." } as FormState;
    const taken = new Set((await tx.termsBand.findMany({ where: { authorityMatrixId, ...(before ? { NOT: { id: before.id } } : {}) }, select: { bandKey: true } })).map((x) => x.bandKey));
    const base = before?.bandKey ?? (typedKey || v.labelEn.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 50) || "band");
    let bandKey = base;
    for (let n = 2; !before && taken.has(bandKey); n++) bandKey = `${base}_${n}`;
    if (termsBandBoundaryFault({ minValue: n(minValue), maxValue: n(maxValue), followsBoundarySwitch: v.followsBoundarySwitch }, { boundaryValue: Number(matrix.boundaryValue.toString()) })) {
      return { ok: false, errors: { followsBoundarySwitch: "An edge of this band is the value where the regimes meet. Decide whether the band follows the boundary switch there." } } as FormState;
    }
    // Bands read in value order: no order to set by hand (UX 13).
    const data2 = { ...v, bandKey, provenance: v.provenance! };
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

/**
 * Discard a draft issue: its rules, their steps, its terms bands and its core routing go with it, on the
 * record with a reason. An issued issue is never discarded — decisions ran under it.
 */
export async function discardDraft(_prev: FormState, data: FormData): Promise<FormState> {
  const orgId = await organisationId();
  if (!orgId) return NO_ORG;
  const id = String(data.get("id") ?? "");
  const reason = String(data.get("reason") ?? "").trim();
  if (!reason) return { ok: false, errors: { reason: "A reason is required." } };
  const result = await db.$transaction(async (tx): Promise<FormState> => {
    await tx.$queryRaw`SELECT id FROM "AuthorityMatrix" WHERE id = ${id} FOR UPDATE`;
    const draft = await tx.authorityMatrix.findFirst({ where: { id, organisationId: orgId }, include: { rules: { include: { recommenders: true } }, termsBands: true, coreRouting: { include: { steps: true } } } });
    if (!draft) return { ok: false, message: "That draft no longer exists." };
    if (draft.issuedAt) return { ok: false, message: "An issued issue cannot be discarded: decisions ran under it." };
    const used = await tx.approvalInstance.count({ where: { OR: [{ authorityMatrixId: id }, { overrideMatrixId: id }] } });
    if (used > 0) return { ok: false, message: "A route cites this draft, so it cannot be discarded." };
    await tx.authorityRuleStep.deleteMany({ where: { authorityRule: { authorityMatrixId: id } } });
    await tx.authorityRule.deleteMany({ where: { authorityMatrixId: id } });
    await tx.termsBand.deleteMany({ where: { authorityMatrixId: id } });
    await tx.coreRoutingStep.deleteMany({ where: { level: { authorityMatrixId: id } } });
    await tx.coreRoutingLevel.deleteMany({ where: { authorityMatrixId: id } });
    await tx.authorityMatrix.delete({ where: { id } });
    // Every row goes into the trail with what it held, so the draft can be rebuilt from
    // history (6.3 re-review): each rule, each of its steps, each terms band, then the issue.
    const offices = new Map((await tx.authorityRole.findMany({ where: { organisationId: orgId }, select: { code: true, nameEn: true } })).map((o) => [o.code, o.nameEn]));
    const del = (entity: string, entityId: string, entityLabel: string, row: Record<string, unknown>) =>
      writeAudit(tx, { organisationId: orgId, entity, entityId, entityLabel, reason: `Draft discarded: ${reason}` }, "DELETE", snapshotFields(decimals(row)));
    for (const { recommenders, ...rule } of draft.rules) {
      for (const step of recommenders) await del("AuthorityRuleStep", step.id, `${rule.labelEn} — ${offices.get(step.roleCode) ?? "An office no longer configured"}`, step);
      await del("AuthorityRule", rule.id, `${draft.label} — ${rule.labelEn}`, rule);
    }
    for (const band of draft.termsBands) await del("TermsBand", band.id, `${draft.label} — ${band.labelEn}`, band);
    // The core routing, step by step and row by row (FR-APR-004).
    const officeName = (code: string) => offices.get(code) ?? "An office no longer configured";
    for (const { steps, ...level } of draft.coreRouting) {
      for (const step of steps) await del("CoreRoutingStep", step.id, `${draft.label} — core routing: ${officeName(level.approverCode)} — ${officeName(step.roleCode)}`, { ...step, roleCode: officeName(step.roleCode) });
      await del("CoreRoutingLevel", level.id, `${draft.label} — core routing: ${officeName(level.approverCode)}`, { ...level, approverCode: officeName(level.approverCode) });
    }
    const { rules, termsBands, coreRouting, ...issue } = draft;
    await writeAudit(tx, { organisationId: orgId, entity: "AuthorityMatrix", entityId: id, entityLabel: draft.label, reason }, "DELETE",
      snapshotFields({ ...decimals(issue), rules: rules.length, termsBands: termsBands.length, coreRouting: coreRouting.length, status: "Draft" }));
    return { ok: true };
  });
  if (!result.ok) return result;
  revalidatePath(PATH);
  redirect(PATH);
}

// ------------------------------------------------------------------ core routing

const PROVENANCES = ["STATED", "OBSERVED", "ASSUMED"] as const;

/**
 * One approving office's row of the core routing on a draft (FR-APR-004, §2.2.1): which
 * office approves, the clause and where it comes from. Its steps are added one by one.
 * Written under the issue's row lock, refused on an issued issue, audited in the same
 * transaction.
 */
export async function saveCoreLevel(_prev: FormState, data: FormData): Promise<FormState> {
  const orgId = await organisationId();
  if (!orgId) return NO_ORG;
  const id = String(data.get("id") ?? "");
  const authorityMatrixId = String(data.get("authorityMatrixId") ?? "");
  const r = new FormReader(data);
  const v = {
    approverCode: r.text("approverCode", "Approved by", { required: true }),
    clause: r.text("clause", "Clause", { max: 120 }),
    provenance: r.choice("provenance", "Where this comes from", PROVENANCES, { required: true }),
    note: r.text("note", "Note", { max: 1000 }),
  };
  if (r.failed || !v.provenance) return { ok: false, errors: r.errors };
  const write = { ...v, provenance: v.provenance };

  const result = await refusable(() =>
    db.$transaction(async (tx): Promise<FormState> => {
      await lockIssue(tx, authorityMatrixId);
      const matrix = await tx.authorityMatrix.findFirst({ where: { id: authorityMatrixId, organisationId: orgId }, select: { id: true, label: true, issuedAt: true } });
      if (!matrix) return { ok: false, message: "That issue of the limits no longer exists." };
      if (matrix.issuedAt) return FROZEN;
      const before = id ? await tx.coreRoutingLevel.findFirst({ where: { id, authorityMatrixId }, include: { steps: { orderBy: { sequence: "asc" } } } }) : null;
      if (id && !before) return { ok: false, message: "That core routing row no longer exists." };
      const roles = (await issueIn(tx, authorityMatrixId))?.matrix.roles ?? {};
      if (!roles[write.approverCode]) return { ok: false, errors: { approverCode: coreLevelFaultText("UNKNOWN_OFFICE", "") } };
      const clash = await tx.coreRoutingLevel.findFirst({ where: { authorityMatrixId, approverCode: write.approverCode, ...(before ? { NOT: { id: before.id } } : {}) }, select: { id: true } });
      if (clash) return { ok: false, errors: { approverCode: `${officeIn(roles, write.approverCode)} already has a row in this issue's core routing. Change that row instead.` } };
      // The row as it would stand, with its steps, through the same check issuing runs.
      const level: CoreLevel = { approverCode: write.approverCode, clause: write.clause, provenance: write.provenance, steps: (before?.steps ?? []).map((st) => ({ roleCode: st.roleCode, act: st.act as AuthorityAct, provenance: st.provenance })) };
      const fault = coreLevelFaults(level, roles)[0];
      if (fault) return { ok: false, errors: { approverCode: coreLevelFaultText(fault.fault, officeIn(roles, fault.roleCode)) } };
      const label = `${matrix.label} — core routing: ${officeIn(roles, write.approverCode)}`;
      const shown = { ...write, approverCode: officeIn(roles, write.approverCode) };
      if (!before) {
        const row = await tx.coreRoutingLevel.create({ data: { organisationId: orgId, authorityMatrixId, ...write } });
        await writeAudit(tx, { organisationId: orgId, entity: "CoreRoutingLevel", entityId: row.id, entityLabel: label }, "CREATE", diffFields(null, shown));
      } else {
        await tx.coreRoutingLevel.update({ where: { id: before.id }, data: write });
        const changes = diffFields({ approverCode: officeIn(roles, before.approverCode), clause: before.clause, provenance: before.provenance, note: before.note }, shown);
        if (changes.length) await writeAudit(tx, { organisationId: orgId, entity: "CoreRoutingLevel", entityId: before.id, entityLabel: label, reason: String(data.get("reason") ?? "") }, "UPDATE", changes);
      }
      return { ok: true };
    }),
  );
  if (!result.ok) return result;
  revalidatePath(PATH);
  return { ok: true };
}

/// Take an approving office's row out of a draft's core routing, with its steps. Asks why.
export async function removeCoreLevel(_prev: FormState, data: FormData): Promise<FormState> {
  const orgId = await organisationId();
  if (!orgId) return NO_ORG;
  const id = String(data.get("id") ?? "");
  const reason = String(data.get("reason") ?? "").trim();
  if (!reason) return { ok: false, errors: { reason: "A reason is required." } };
  const result = await db.$transaction(async (tx): Promise<FormState> => {
    const level = await tx.coreRoutingLevel.findFirst({ where: { id, organisationId: orgId }, include: { steps: true } });
    if (!level) return { ok: false, message: "That core routing row no longer exists." };
    await lockIssue(tx, level.authorityMatrixId);
    const matrix = await tx.authorityMatrix.findUniqueOrThrow({ where: { id: level.authorityMatrixId }, select: { label: true, issuedAt: true } });
    if (matrix.issuedAt) return FROZEN;
    const roles = (await issueIn(tx, level.authorityMatrixId))?.matrix.roles ?? {};
    const name = (code: string) => officeIn(roles, code);
    const label = `${matrix.label} — core routing: ${name(level.approverCode)}`;
    for (const step of level.steps) {
      await tx.coreRoutingStep.delete({ where: { id: step.id } });
      await writeAudit(tx, { organisationId: orgId, entity: "CoreRoutingStep", entityId: step.id, entityLabel: `${label} — ${name(step.roleCode)}`, reason }, "DELETE",
        snapshotFields({ office: name(step.roleCode), act: actWithCode(step.act), sequence: step.sequence, provenance: step.provenance, note: step.note }));
    }
    await tx.coreRoutingLevel.delete({ where: { id } });
    await writeAudit(tx, { organisationId: orgId, entity: "CoreRoutingLevel", entityId: id, entityLabel: label, reason }, "DELETE",
      snapshotFields({ approverCode: name(level.approverCode), clause: level.clause, provenance: level.provenance, note: level.note, steps: level.steps.length }));
    return { ok: true };
  });
  if (!result.ok) return result;
  revalidatePath(PATH);
  return { ok: true };
}

/// An office beneath the approver in a draft's core row, in order. Its act is one of
/// the four the core routing holds (6.9 note D-4).
export async function saveCoreStep(_prev: FormState, data: FormData): Promise<FormState> {
  const orgId = await organisationId();
  if (!orgId) return NO_ORG;
  const levelId = String(data.get("coreRoutingLevelId") ?? "");
  const r = new FormReader(data);
  const roleCode = r.text("roleCode", "Office", { required: true });
  const act = r.choice("act", "Acts as", CORE_ACTS, { required: true });
  const asked = r.int("sequence", "Place in the chain", { min: 1 });
  const provenance = r.choice("provenance", "Where this comes from", PROVENANCES, { required: true });
  const note = r.text("note", "Note", { max: 1000 });
  if (r.failed || !act || !provenance) return { ok: false, errors: r.errors };

  const result = await db.$transaction(async (tx): Promise<FormState> => {
    const level = await tx.coreRoutingLevel.findFirst({ where: { id: levelId, organisationId: orgId }, include: { steps: { orderBy: { sequence: "asc" } } } });
    if (!level) return { ok: false, message: "That core routing row no longer exists." };
    await lockIssue(tx, level.authorityMatrixId);
    const matrix = await tx.authorityMatrix.findUniqueOrThrow({ where: { id: level.authorityMatrixId }, select: { label: true, issuedAt: true } });
    if (matrix.issuedAt) return FROZEN;
    const roles = (await issueIn(tx, level.authorityMatrixId))?.matrix.roles ?? {};
    const sequence = asked ?? (level.steps.at(-1)?.sequence ?? 0) + 1;
    if (level.steps.some((st) => st.sequence === sequence)) {
      return { ok: false, errors: { sequence: `Place ${sequence} is taken by ${officeIn(roles, level.steps.find((st) => st.sequence === sequence)!.roleCode)}. Choose another place, or leave it empty to add at the end.` } };
    }
    const steps = [...level.steps.map((st) => ({ roleCode: st.roleCode, act: st.act as AuthorityAct, provenance: st.provenance, sequence: st.sequence })), { roleCode, act: act as AuthorityAct, provenance, sequence }].sort((a, b) => a.sequence - b.sequence);
    const fault = coreLevelFaults({ approverCode: level.approverCode, clause: level.clause, provenance: level.provenance, steps }, roles).find((f) => f.roleCode === roleCode);
    if (fault) return { ok: false, errors: { roleCode: coreLevelFaultText(fault.fault, officeIn(roles, fault.roleCode)) } };
    const row = await tx.coreRoutingStep.create({ data: { organisationId: orgId, coreRoutingLevelId: level.id, roleCode, act, sequence, provenance, note } });
    await writeAudit(tx, { organisationId: orgId, entity: "CoreRoutingStep", entityId: row.id, entityLabel: `${matrix.label} — core routing: ${officeIn(roles, level.approverCode)} — ${officeIn(roles, roleCode)}`, reason: String(data.get("reason") ?? "") }, "CREATE",
      diffFields(null, { office: officeIn(roles, roleCode), act: actWithCode(act), sequence, provenance, note }));
    return { ok: true };
  });
  if (!result.ok) return result;
  revalidatePath(PATH);
  return { ok: true };
}

/// Take a step out of a draft's core row. Asks why.
export async function removeCoreStep(_prev: FormState, data: FormData): Promise<FormState> {
  const orgId = await organisationId();
  if (!orgId) return NO_ORG;
  const id = String(data.get("id") ?? "");
  const reason = String(data.get("reason") ?? "").trim();
  if (!reason) return { ok: false, errors: { reason: "A reason is required." } };
  const result = await db.$transaction(async (tx): Promise<FormState> => {
    const step = await tx.coreRoutingStep.findFirst({ where: { id, organisationId: orgId }, include: { level: true } });
    if (!step) return { ok: false, message: "That step no longer exists." };
    await lockIssue(tx, step.level.authorityMatrixId);
    const matrix = await tx.authorityMatrix.findUniqueOrThrow({ where: { id: step.level.authorityMatrixId }, select: { label: true, issuedAt: true } });
    if (matrix.issuedAt) return FROZEN;
    const roles = (await issueIn(tx, step.level.authorityMatrixId))?.matrix.roles ?? {};
    await tx.coreRoutingStep.delete({ where: { id } });
    await writeAudit(tx, { organisationId: orgId, entity: "CoreRoutingStep", entityId: id, entityLabel: `${matrix.label} — core routing: ${officeIn(roles, step.level.approverCode)} — ${officeIn(roles, step.roleCode)}`, reason }, "DELETE",
      snapshotFields({ office: officeIn(roles, step.roleCode), act: actWithCode(step.act), sequence: step.sequence, provenance: step.provenance, note: step.note }));
    return { ok: true };
  });
  if (!result.ok) return result;
  revalidatePath(PATH);
  return { ok: true };
}

// ------------------------------------------------------- rejection destinations

const DESTINATION_KINDS = ["RETURN_TO_ORIGINATOR", "RETURN_TO_STEP", "TERMINATE"] as const;

/**
 * Where a rejected matter of one type goes (FR-APR-016, B4). The customer's policy:
 * none ships. A change takes effect from a day and ends the destination it replaces
 * then, with a reason; every route already open keeps the destination it opened with
 * (ruling CO-4).
 */
export async function saveRejectionDestination(_prev: FormState, data: FormData): Promise<FormState> {
  const orgId = await organisationId();
  if (!orgId) return { ok: false, message: "No organisation is configured. Run npm run setup first." };
  const r = new FormReader(data);
  const v = {
    domain: r.text("domain", "Matter type", { required: true }),
    kind: r.choice("kind", "Where it goes", DESTINATION_KINDS, { required: true }),
    returnToRoleCode: r.optionalText("returnToRoleCode"),
    governingSource: r.text("governingSource", "Source", { max: 240 }),
    provenance: r.choice("provenance", "Provenance", ["STATED", "OBSERVED", "ASSUMED"] as const, { required: true }),
    notes: r.text("notes", "Notes", { max: 2000 }),
    effectiveFrom: r.date("effectiveFrom", "Takes effect", { required: true }),
  };
  const reason = r.text("reason", "Reason", { required: true, max: 2000 });
  if (r.failed || !v.kind || !v.provenance || !v.effectiveFrom) return { ok: false, errors: r.errors };
  const write = { ...v, kind: v.kind, provenance: v.provenance, effectiveFrom: v.effectiveFrom };
  const [others, offices] = await Promise.all([
    db.rejectionDestination.findMany({ where: { organisationId: orgId } }),
    db.authorityRole.findMany({ where: { organisationId: orgId, isCommittee: false }, select: { code: true } }),
  ]);
  const faults = destinationRowFaults({ id: "new", ...write, effectiveTo: null }, others.map((o) => ({ ...o, kind: o.kind as RejectionKind })), offices.map((o) => o.code));
  if (faults.length > 0) return { ok: false, errors: Object.fromEntries(faults.map((f) => [DESTINATION_FAULT_TEXT[f].field, DESTINATION_FAULT_TEXT[f].message])) };
  const label = `When rejected: ${matterLabel(v.domain)}`;
  await db.$transaction(async (tx) => {
    // The destination this one replaces ends the day this one takes effect.
    const replaced = await tx.rejectionDestination.findMany({
      where: { organisationId: orgId, domain: v.domain, effectiveFrom: { lt: v.effectiveFrom! }, OR: [{ effectiveTo: null }, { effectiveTo: { gt: v.effectiveFrom! } }] },
    });
    for (const old of replaced) {
      await tx.rejectionDestination.update({ where: { id: old.id }, data: { effectiveTo: v.effectiveFrom } });
      await writeAudit(tx, { organisationId: orgId, entity: "RejectionDestination", entityId: old.id, entityLabel: label, reason }, "UPDATE", diffFields({ effectiveTo: old.effectiveTo }, { effectiveTo: v.effectiveFrom }));
    }
    const row = await tx.rejectionDestination.create({ data: { organisationId: orgId, ...write, returnToRoleCode: write.returnToRoleCode ?? null } });
    await writeAudit(tx, { organisationId: orgId, entity: "RejectionDestination", entityId: row.id, entityLabel: label, reason }, "CREATE",
      diffFields(null, { domain: matterLabel(v.domain), kind: v.kind, returnToRoleCode: write.returnToRoleCode, provenance: v.provenance, effectiveFrom: v.effectiveFrom, governingSource: v.governingSource }));
  });
  revalidatePath(PATH);
  return { ok: true };
}

/// Back to not set from a day: the officer chooses again from then (ruling CO-5).
export async function endRejectionDestination(_prev: FormState, data: FormData): Promise<FormState> {
  const orgId = await organisationId();
  if (!orgId) return { ok: false, message: "No organisation is configured. Run npm run setup first." };
  const r = new FormReader(data);
  const id = r.text("id", "Destination", { required: true });
  const on = r.date("effectiveTo", "Ends", { required: true });
  const reason = r.text("reason", "Reason", { required: true, max: 2000 });
  if (r.failed || !on) return { ok: false, errors: r.errors };
  const row = await db.rejectionDestination.findFirst({ where: { id, organisationId: orgId } });
  if (!row) return { ok: false, message: "That destination no longer exists." };
  if (on <= row.effectiveFrom) return { ok: false, errors: { effectiveTo: "It must end after it took effect." } };
  await auditedUpdate(
    { organisationId: orgId, entity: "RejectionDestination", entityId: id, entityLabel: `When rejected: ${matterLabel(row.domain)}`, reason },
    { effectiveTo: row.effectiveTo },
    { effectiveTo: on },
    (tx) => tx.rejectionDestination.update({ where: { id }, data: { effectiveTo: on } }),
  );
  revalidatePath(PATH);
  return { ok: true };
}
