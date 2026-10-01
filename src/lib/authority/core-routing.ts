/**
 * The core routing rule (FR-APR-004, §2.2.1): the chain every approval carries beneath
 * the office that approves it.
 *
 * An issue records, per approving office, the offices beneath it and what each does. A
 * rule that takes its chain from the core routing gets every one of those steps — it may
 * strengthen a step or add steps of its own, never drop or weaken one. Which rules take
 * their chain from it is a decision on each rule (`generateCoreChain`): unset, the chain
 * is the one entered on the rule, and the route says it was not checked.
 *
 * Pure: matrices in, chains and faults out. Loading and saving live elsewhere.
 */

import type { Prisma } from "@/generated/prisma/client";

import type { ApprovalStep, AuthorityAct, ChainOrigin, CoreChainRecord, CoreLevel, Provenance, Role, Rule } from "./types";
import { MANDATORY_ACTS } from "./types";

/// The acts a core row may give an office beneath the approver (6.9 note D-4). Mandatory
/// acts come only from rules, so whether a rule may be delegated stays the rule's own.
export const CORE_ACTS = ["P", "JP", "R", "JR"] as const satisfies readonly AuthorityAct[];
export type CoreAct = (typeof CORE_ACTS)[number];

/**
 * The strength of each act, for "a rule may strengthen a step, never weaken it".
 *
 * Propose < recommend < mandatory recommendation; joint and sole share a rank (6.9
 * ruling OQ-3, an ASSUMED reading pending the customer's confirmation: the joint
 * partner office is not modelled). Approving is not a step beneath an approver at all,
 * so A and MA rank above everything and are refused there by `atLeastAsStrong`.
 */
export const ACT_RANK: Record<AuthorityAct, number> = { P: 1, JP: 1, R: 2, JR: 2, MR: 3, MJR: 3, A: 4, MA: 4 };

const APPROVING: ReadonlySet<AuthorityAct> = new Set<AuthorityAct>(["A", "MA"]);

/// Whether a rule's act on a core office keeps at least the core's strength. An
/// approving act is never valid beneath the approver, whatever the core says.
export function atLeastAsStrong(ruleAct: AuthorityAct, coreAct: AuthorityAct): boolean {
  if (APPROVING.has(ruleAct) || APPROVING.has(coreAct)) return false;
  return ACT_RANK[ruleAct] >= ACT_RANK[coreAct];
}

/// How a step the core routing generated reads once the rule has had its say (ruling
/// C1): unchanged, raised above the core act, or set to another act of the same rank.
export function originOf(ruleAct: AuthorityAct | null, coreAct: AuthorityAct): ChainOrigin {
  if (ruleAct == null || ruleAct === coreAct) return "CORE";
  return ACT_RANK[ruleAct] > ACT_RANK[coreAct] ? "CORE_STRENGTHENED" : "CORE_ACT_SET";
}

export type CoreLevelFault = "UNKNOWN_OFFICE" | "APPROVER_BENEATH" | "APPROVE_BENEATH" | "MANDATORY_IN_CORE" | "DUPLICATE_OFFICE";

/**
 * Why a core row cannot be saved: an office that is not configured, the approving office
 * beneath itself, an approval or a mandatory act beneath the approver (D-4), or one
 * office twice.
 */
export function coreLevelFaults(level: CoreLevel, roles: Record<string, Role>): { fault: CoreLevelFault; roleCode: string }[] {
  const faults: { fault: CoreLevelFault; roleCode: string }[] = [];
  if (!roles[level.approverCode]) faults.push({ fault: "UNKNOWN_OFFICE", roleCode: level.approverCode });
  const seen = new Set<string>();
  for (const s of level.steps) {
    if (!roles[s.roleCode]) faults.push({ fault: "UNKNOWN_OFFICE", roleCode: s.roleCode });
    if (s.roleCode === level.approverCode) faults.push({ fault: "APPROVER_BENEATH", roleCode: s.roleCode });
    if (APPROVING.has(s.act)) faults.push({ fault: "APPROVE_BENEATH", roleCode: s.roleCode });
    else if (MANDATORY_ACTS.has(s.act)) faults.push({ fault: "MANDATORY_IN_CORE", roleCode: s.roleCode });
    if (seen.has(s.roleCode)) faults.push({ fault: "DUPLICATE_OFFICE", roleCode: s.roleCode });
    seen.add(s.roleCode);
  }
  return faults;
}

export type CoreChainFault = "CORE_ROW_MISSING" | "WEAKENS" | "ORDER_DIFFERS" | "APPROVER_BENEATH" | "APPROVE_BENEATH" | "DUPLICATE_OFFICE";

/// The steps a rule names beneath its approver, as entered: its proposer, then its
/// recommenders in order.
function entered(rule: Pick<Rule, "proposerCode" | "recommenders">): { roleCode: string; act: AuthorityAct }[] {
  return [...(rule.proposerCode ? [{ roleCode: rule.proposerCode, act: "P" as AuthorityAct }] : []), ...rule.recommenders];
}

/**
 * Why a rule cannot take its chain from a core row: it gives a core office a weaker act,
 * names core offices in another order, names its own approver or an approving act
 * beneath the approver, or names one office twice. Null where it may.
 */
export function ruleCoreFault(
  rule: Pick<Rule, "approverCode" | "proposerCode" | "recommenders">,
  level: CoreLevel,
): { fault: Exclude<CoreChainFault, "CORE_ROW_MISSING">; roleCode: string } | null {
  const steps = entered(rule);
  for (const s of steps) if (APPROVING.has(s.act)) return { fault: "APPROVE_BENEATH", roleCode: s.roleCode };
  for (const s of steps) if (s.roleCode === rule.approverCode) return { fault: "APPROVER_BENEATH", roleCode: s.roleCode };
  const seen = new Set<string>();
  for (const s of steps) {
    if (seen.has(s.roleCode)) return { fault: "DUPLICATE_OFFICE", roleCode: s.roleCode };
    seen.add(s.roleCode);
  }
  const at = new Map(level.steps.map((c, i) => [c.roleCode, i]));
  for (const s of steps) {
    const i = at.get(s.roleCode);
    if (i != null && !atLeastAsStrong(s.act, level.steps[i].act)) return { fault: "WEAKENS", roleCode: s.roleCode };
  }
  let last = -1;
  for (const s of steps) {
    const i = at.get(s.roleCode);
    if (i == null) continue;
    if (i < last) return { fault: "ORDER_DIFFERS", roleCode: s.roleCode };
    last = i;
  }
  return null;
}

export type GeneratedStep = ApprovalStep & { origin: ChainOrigin };

export type GeneratedChain =
  | { ok: true; steps: GeneratedStep[]; level: CoreLevel }
  | { ok: false; fault: CoreChainFault; roleCode?: string };

/// The core row for an approving office, if the issue records one.
export function coreLevelFor(core: readonly CoreLevel[] | undefined, approverCode: string | null): CoreLevel | null {
  if (!approverCode) return null;
  return core?.find((l) => l.approverCode === approverCode) ?? null;
}

/**
 * The chain beneath a rule's approver, generated from the core routing.
 *
 * In order: (1) a proposer the rule names whose office is not in the core row; (2) every
 * step of the core row, in its order, each taking the rule's act where the rule names
 * that office; (3) the rule's other steps, in the order entered (a committee's mandatory
 * recommendation lands here); the approver is the resolver's. Every core step is always
 * emitted: "never dropped" is structural. Keyed on the rule's own approver, never on an
 * office the approval escalates to (6.9 note D-6).
 */
export function generateChain(rule: Rule, core: readonly CoreLevel[] | undefined, roles: Record<string, Role>): GeneratedChain {
  const level = coreLevelFor(core, rule.approverCode);
  if (!level) return { ok: false, fault: "CORE_ROW_MISSING", ...(rule.approverCode ? { roleCode: rule.approverCode } : {}) };
  const fault = ruleCoreFault(rule, level);
  if (fault) return { ok: false, ...fault };

  const step = (roleCode: string, act: AuthorityAct, origin: ChainOrigin): GeneratedStep => ({
    roleCode,
    act,
    ...(roles[roleCode]?.isCommittee ? { committeeCode: roleCode } : {}),
    nonDelegable: MANDATORY_ACTS.has(act),
    sourceRuleKey: rule.ruleKey,
    origin,
  });

  const inCore = new Set(level.steps.map((c) => c.roleCode));
  const named = new Map(entered(rule).map((s) => [s.roleCode, s.act]));
  const steps: GeneratedStep[] = [];
  if (rule.proposerCode && !inCore.has(rule.proposerCode)) steps.push(step(rule.proposerCode, "P", "RULE"));
  for (const c of level.steps) {
    const ruleAct = named.get(c.roleCode) ?? null;
    steps.push(step(c.roleCode, ruleAct ?? c.act, originOf(ruleAct, c.act)));
  }
  for (const r of rule.recommenders) if (!inCore.has(r.roleCode)) steps.push(step(r.roleCode, r.act, "RULE"));
  return { ok: true, steps, level };
}

/// Every rule taking its chain from the core routing that cannot: what issuing refuses.
/// A rule whose flag is unset or false is not checked here — it warns on its route.
export function coreChainFaultsAcross(
  rules: readonly Rule[],
  core: readonly CoreLevel[],
  roles: Record<string, Role> = {},
): { rule: Rule; fault: CoreChainFault; roleCode?: string }[] {
  const out: { rule: Rule; fault: CoreChainFault; roleCode?: string }[] = [];
  for (const rule of rules) {
    if (rule.generateCoreChain !== true) continue;
    const g = generateChain(rule, core, roles);
    if (!g.ok) out.push({ rule, fault: g.fault, ...(g.roleCode ? { roleCode: g.roleCode } : {}) });
  }
  return out;
}

/// A stored core row as read for copying: ids and owners are dropped.
export interface CoreLevelRow {
  approverCode: string;
  clause: string;
  provenance: Provenance;
  note: string;
  sortOrder: number;
  steps: { roleCode: string; act: AuthorityAct; sequence: number; provenance: Provenance; note: string }[];
}

/**
 * A revision's copy of its source issue's core routing (6.9 note D-1): every row and step
 * with its provenance, clause and order, under new ids, for the new issue. Only the rows
 * handed in are copied — a funder's rule set carries its own, never the organisation's.
 */
export function copyCoreRouting(
  levels: readonly CoreLevelRow[],
  to: { authorityMatrixId: string; organisationId: string },
): Prisma.CoreRoutingLevelUncheckedCreateInput[] {
  return levels.map((l) => ({
    organisationId: to.organisationId,
    authorityMatrixId: to.authorityMatrixId,
    approverCode: l.approverCode,
    clause: l.clause,
    provenance: l.provenance,
    note: l.note,
    sortOrder: l.sortOrder,
    steps: {
      create: [...l.steps]
        .sort((a, b) => a.sequence - b.sequence)
        .map((s) => ({ organisationId: to.organisationId, roleCode: s.roleCode, act: s.act, sequence: s.sequence, provenance: s.provenance, note: s.note })),
    },
  }));
}

/**
 * What a route stores about its chain when it opens (ruling C4): when it was recorded,
 * the rule's flag and "as entered" reason as they stood, and the core row a generated
 * chain came from. Stored, never re-read from configuration.
 */
export function routeCoreFields(core: CoreChainRecord | undefined, at: Date) {
  return {
    coreSnapshotAt: at,
    coreChainFlag: core?.flag ?? null,
    coreChainReason: core?.flag === false ? (core.reason ?? null) : null,
    ...(core?.level ? { coreRoutingSnapshot: core.level as unknown as Prisma.InputJsonValue } : {}),
  };
}

/**
 * Whether a persisted route's chain was in fact generated from the core routing.
 *
 * `coreChainFlag` is the rule's flag as it stood, not the outcome: a flagged rule whose
 * approver had no core row fell back to the chain as entered (CORE_ROW_MISSING) and
 * stored no core row. A generated chain always stores the row it came from, so the flag
 * and a recorded row together are the outcome — derived from the route's own snapshot.
 */
export function chainWasGenerated(route: { coreChainFlag: boolean | null; coreRoutingSnapshot: unknown }): boolean {
  if (route.coreChainFlag !== true) return false;
  const level = route.coreRoutingSnapshot as Partial<CoreLevel> | null | undefined;
  return typeof level?.approverCode === "string" && level.approverCode !== "";
}

/// A persisted step's origin: set on a generated chain's steps, null otherwise.
export function stepOrigin(step: Pick<ApprovalStep, "origin">): ChainOrigin | null {
  return step.origin ?? null;
}
