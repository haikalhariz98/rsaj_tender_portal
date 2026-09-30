import type {
  ApprovalStep,
  AuthorityAct,
  Matrix,
  Policy,
  Regime,
  ResolutionWarning,
  Resolution,
  ResolveQuery,
  Rule,
} from "./types";
import { MANDATORY_ACTS } from "./types";
import { senFromAmount } from "@/lib/money";

/// Maximum upward hops when escalating past absent holders. Guards against a cycle
/// in a mis-seeded escalation map.
const MAX_ESCALATION_HOPS = 6;

/**
 * Does `value` fall inside the band (min, max]?
 *
 * Every band edge is exclusive at the bottom and inclusive at the top, EXCEPT at
 * `policy.boundaryValue`, where spec decision D3 applies and `boundaryInclusive`
 * decides which side a value exactly on the boundary lands — but only for a band
 * that follows the switch (`follows === true`). The issue's own regime thresholds
 * always follow it, which is the default; a rule passes its own
 * `followsBoundarySwitch`, and a rule that does not follow it (or has not decided,
 * null) keeps (min, max] at the boundary too (6.1 ruling OD-4).
 *
 * A null value matches only an unbounded row — a row with a band is not a candidate
 * for a matter whose value is unknown.
 */
export function inBand(
  value: number | null | undefined,
  min: number | null,
  max: number | null,
  policy: Policy,
  follows: boolean | null = true,
): boolean {
  if (value == null) return min == null && max == null;

  // Compared in exact sen. Equality at the boundary is what decides which regime a
  // matter falls in, and float equality is the wrong tool for that one comparison.
  const v = senFromAmount(value);
  const lo = min == null ? null : senFromAmount(min);
  const hi = max == null ? null : senFromAmount(max);
  const flip = follows === true && policy.boundaryInclusive === false;
  const b = senFromAmount(policy.boundaryValue);

  const lowerOk = lo == null || (flip && lo === b ? v >= lo : v > lo);
  const upperOk = hi == null || (flip && hi === b ? v < hi : v <= hi);

  return lowerOk && upperOk;
}

/// Whether any of a rule's money edges sits exactly on the boundary value — the only
/// place the boundary switch can matter to it.
export function edgeAtBoundary(
  rule: Pick<Rule, "minValue" | "maxValue" | "contractValueMin" | "contractValueMax">,
  policy: Pick<Policy, "boundaryValue">,
): boolean {
  const b = senFromAmount(policy.boundaryValue);
  return [rule.minValue, rule.maxValue, rule.contractValueMin, rule.contractValueMax].some(
    (e) => e != null && senFromAmount(e) === b,
  );
}

/**
 * The comparison applied at a rule's boundary edge: "GTE" only where the rule
 * follows the switch and the switch puts a value exactly on the boundary in the upper
 * band; otherwise "GT". Null where no edge of the rule sits on the boundary.
 */
export function boundaryOperatorFor(
  rule: Pick<Rule, "minValue" | "maxValue" | "contractValueMin" | "contractValueMax" | "followsBoundarySwitch">,
  policy: Pick<Policy, "boundaryValue" | "boundaryInclusive">,
): "GT" | "GTE" | null {
  if (!edgeAtBoundary(rule, policy)) return null;
  return rule.followsBoundarySwitch === true && policy.boundaryInclusive === false ? "GTE" : "GT";
}

export type BoundaryRuleFault = "BOUNDARY_SWITCH_UNDECIDED" | "BOUNDARY_SWITCH_DISAGREES";

/**
 * Why a rule cannot be saved as it stands at the boundary.
 *
 * A rule with an edge on the boundary must say whether it follows the switch: left
 * undecided, which band a value exactly on the boundary falls in is nobody's
 * decision. And two rules that meet at the boundary for the same matter must agree:
 * if one follows the switch and the other does not, the boundary value falls in both
 * bands or in neither, depending on the setting.
 */
export function boundaryRuleFault(
  rule: Rule,
  policy: Pick<Policy, "boundaryValue">,
  others: readonly Rule[] = [],
): BoundaryRuleFault | null {
  if (!edgeAtBoundary(rule, policy)) return null;
  if (rule.followsBoundarySwitch == null) return "BOUNDARY_SWITCH_UNDECIDED";
  const b = senFromAmount(policy.boundaryValue);
  const at = (e: number | null) => e != null && senFromAmount(e) === b;
  const meets = others.some(
    (o) =>
      o.ruleKey !== rule.ruleKey &&
      o.domain === rule.domain &&
      (o.method ?? null) === (rule.method ?? null) &&
      (o.cond ?? null) === (rule.cond ?? null) &&
      o.followsBoundarySwitch != null &&
      o.followsBoundarySwitch !== rule.followsBoundarySwitch &&
      ((at(o.maxValue) && at(rule.minValue)) ||
        (at(o.minValue) && at(rule.maxValue)) ||
        (at(o.contractValueMax) && at(rule.contractValueMin)) ||
        (at(o.contractValueMin) && at(rule.contractValueMax))),
  );
  return meets ? "BOUNDARY_SWITCH_DISAGREES" : null;
}

/// Percentage bands are plain (min, max] — the D3 boundary rule is about ringgit.
export function inPercentBand(
  pct: number | null | undefined,
  min: number | null,
  max: number | null,
): boolean {
  if (min == null && max == null) return true;
  if (pct == null) return false;
  return (min == null || pct > min) && (max == null || pct <= max);
}

/// Which sourcing regime a value falls into.
export function regimeFor(value: number | null | undefined, policy: Policy): Regime | null {
  if (value == null) return null;
  if (inBand(value, policy.tenderFloor, null, policy, true)) return "tender";
  if (inBand(value, policy.quotationFloor, policy.tenderFloor, policy, true)) return "quotation";
  return "below";
}

/**
 * A standing rule's citation, and what to say when there is none.
 *
 * The engine applies a few rules of its own — escalate when nothing matches, nobody
 * approves their own matter, absence reverts upward, a funder's directives prevail.
 * Which clause of the customer's manual says so is configuration. Unset, the warning
 * says the source is not recorded rather than borrowing another manual's numbering.
 */
function cite(clause: string | null | undefined): { clause?: string; en: string; ms: string } {
  return clause
    ? { clause, en: "", ms: "" }
    : {
        en: " The clause behind this rule is not recorded in the approval matrix.",
        ms: " Klausa bagi peraturan ini tidak direkodkan dalam matriks kelulusan.",
      };
}

/**
 * How specific a rule is. The most specific matching row wins, so a row banded on
 * both contract value and percentage beats one banded on percentage alone.
 * Gap rows are pushed to the bottom: an assumed route is a last resort.
 */
export function specificity(rule: Rule): number {
  let score = 0;
  if (rule.contractValueMin != null || rule.contractValueMax != null) score += 16;
  if (rule.pctMin != null || rule.pctMax != null) score += 8;
  if (rule.minValue != null || rule.maxValue != null) score += 4;
  // A row confined to a method is more specific than one that applies to any method.
  // Without this the two tie, and the tie was settled silently by row order.
  if (rule.method != null) score += 2;
  if (rule.cond != null) score += 1;
  if (rule.isGap) score -= 32;
  return score;
}

/// Two (min, max] bands share at least one value. Null is unbounded on that side.
/// Half-open bands that merely touch do not share a value, whichever way the boundary
/// switch is set — the switch moves one exact figure, and it moves it for both.
function bandsMeet(
  aMin: number | null,
  aMax: number | null,
  bMin: number | null,
  bMax: number | null,
): boolean {
  const aBelowB = aMax != null && bMin != null && aMax <= bMin;
  const bBelowA = bMax != null && aMin != null && bMax <= aMin;
  return !aBelowB && !bBelowA;
}

/**
 * Rules that would tie with `rule` for some matter: same matter, method and
 * condition, equally specific, and every band they share overlapping.
 *
 * This is the save-time twin of the AMBIGUOUS warning. Gap rows are left out on
 * purpose: they sit below real rows as a fallback, so overlapping one is their design.
 */
export function rulesTiedWith(rule: Rule, others: readonly Rule[]): Rule[] {
  if (rule.isGap) return [];
  return others.filter(
    (o) =>
      o.ruleKey !== rule.ruleKey &&
      !o.isGap &&
      o.domain === rule.domain &&
      (o.method ?? null) === (rule.method ?? null) &&
      (o.cond ?? null) === (rule.cond ?? null) &&
      specificity(o) === specificity(rule) &&
      bandsMeet(o.minValue, o.maxValue, rule.minValue, rule.maxValue) &&
      bandsMeet(o.pctMin, o.pctMax, rule.pctMin, rule.pctMax) &&
      bandsMeet(o.contractValueMin, o.contractValueMax, rule.contractValueMin, rule.contractValueMax),
  );
}

/**
 * Whether anything on a rule may be delegated. Not while the rule is marked fixed, the
 * approval is mandatory, or any recommendation on it is mandatory — the engine treats
 * all three as non-delegable, so the screen must too.
 */
export function ruleIsDelegable(
  rule: Pick<Rule, "nonDelegable" | "approverMandatory" | "recommenders">,
): boolean {
  return (
    !rule.nonDelegable &&
    !rule.approverMandatory &&
    !rule.recommenders.some((rec) => MANDATORY_ACTS.has(rec.act))
  );
}

/**
 * What a committee does on a rule that routes to it. Where the rule records the act,
 * that; where the committee is the approver, it approves. Otherwise the act is not set
 * — it used to be guessed as "recommend", which a screen then stated as fact.
 */
export function committeeActOn(
  rule: Pick<Rule, "committeeAct" | "approverCode">,
  committeeCode: string,
): AuthorityAct | null {
  if (rule.committeeAct) return rule.committeeAct;
  return rule.approverCode === committeeCode ? "A" : null;
}

/**
 * The approver's act on a rule. Mandatory approval follows from `approverMandatory`
 * alone, as the schema documents; the page and the engine both read it from here.
 */
export function approverAct(rule: Pick<Rule, "approverMandatory">): AuthorityAct {
  return rule.approverMandatory ? "MA" : "A";
}

function candidateRules(matrix: Matrix, q: ResolveQuery): Rule[] {
  const { policy, rules } = matrix;
  const method = q.method ?? null;
  const cond = q.cond ?? null;

  return rules.filter((r) => {
    if (r.domain !== q.domain) return false;

    // A row confined to a method applies only when that method is asked for; a row
    // with no method applies whatever the method.
    if (r.method != null && (method == null || r.method !== method)) return false;

    // A conditional row applies only to its condition. A general row is suppressed
    // when a conditional sibling exists for the condition actually asked about.
    if (r.cond != null && r.cond !== cond) return false;
    if (
      r.cond == null &&
      cond != null &&
      rules.some((o) => o.domain === q.domain && o.method === r.method && o.cond === cond)
    ) {
      return false;
    }

    if (
      (r.contractValueMin != null || r.contractValueMax != null) &&
      !inBand(q.contractValue, r.contractValueMin, r.contractValueMax, policy, r.followsBoundarySwitch)
    ) {
      return false;
    }
    if ((r.pctMin != null || r.pctMax != null) && !inPercentBand(q.pct, r.pctMin, r.pctMax)) {
      return false;
    }
    if (
      (r.minValue != null || r.maxValue != null) &&
      !inBand(q.value, r.minValue, r.maxValue, policy, r.followsBoundarySwitch)
    ) {
      return false;
    }

    return true;
  });
}

function roleName(matrix: Matrix, code: string): { en: string; ms: string } {
  const role = matrix.roles[code];
  return role ? { en: role.nameEn, ms: role.nameMs } : { en: code, ms: code };
}

/**
 * Resolve the approval chain for a matter.
 *
 * Pure: it reads the matrix and the query and returns the chain, the warnings and
 * the rule it came from. Nothing here touches the database, so a routing decision
 * can be unit-tested against the printed manual.
 */
export function resolveApproval(matrix: Matrix, query: ResolveQuery): Resolution {
  const warnings: ResolutionWarning[] = [];
  const regime = regimeFor(query.value, matrix.policy);

  const matches = candidateRules(matrix, query).sort((a, b) => specificity(b) - specificity(a));
  const rule = matches[0] ?? null;

  // Two rules that match equally well: which one routes is down to row order, which
  // is not a decision anybody took. Resolve by the first, but say it is a guess.
  if (rule && matches[1] && specificity(matches[1]) === specificity(rule)) {
    warnings.push({
      code: "AMBIGUOUS",
      level: "err",
      messageEn: `More than one approval rule matches this matter equally (“${rule.labelEn}” and “${matches[1].labelEn}”). The route shown follows the first by row order, which is not a decision — correct the overlapping rules.`,
      messageMs: `Lebih daripada satu peraturan kelulusan sepadan sama rata (“${rule.labelMs ?? rule.labelEn}” dan “${matches[1].labelMs ?? matches[1].labelEn}”). Laluan yang ditunjukkan mengikut susunan baris, bukan keputusan — betulkan peraturan yang bertindih.`,
      clause: rule.clause,
    });
  }

  if (!rule) {
    // Deliberately no chain. With nothing matching there is no expected approver to
    // escalate from, and inventing one would be a hard-coded route. A matter the
    // customer knows is uncovered is recorded as a gap row, which does resolve.
    const src = cite(matrix.policy.clauses?.noRule);
    warnings.push({
      code: "NO_RULE",
      level: "err",
      messageEn:
        "No approval rule matches this matter, so it cannot be routed. Escalate it to the immediate superior of the officer expected to approve, and record a rule or a known gap for it." +
        src.en,
      messageMs:
        "Tiada peraturan kelulusan sepadan, jadi perkara ini tidak boleh dihalakan. Naikkan kepada atasan terdekat pegawai yang dijangka meluluskan, dan rekodkan peraturan atau jurang yang diketahui." +
        src.ms,
      clause: src.clause,
    });
    return {
      rule: null,
      boundaryOperator: null,
      chain: [],
      warnings,
      regime,
      approverCode: null,
      committeeCode: null,
      nonDelegable: false,
      query,
    };
  }

  if (rule.isGap) {
    warnings.push({
      code: "GAP_RULE",
      level: "gap",
      messageEn:
        "No documented approval rule exists for this item — the routing shown is an assumption, not a documented rule.",
      messageMs:
        "Tiada peraturan kelulusan bertulis untuk perkara ini — laluan yang ditunjukkan adalah andaian, bukan peraturan bertulis.",
      clause: rule.clause,
    });
  }
  if (rule.gapNote) {
    // The gap note is what the administrator wrote to explain the gap, so it is the
    // message. The rule's clause is the citation.
    warnings.push({
      code: "RULE_NOTE",
      level: "info",
      messageEn: rule.gapNote,
      messageMs: rule.gapNote,
      clause: rule.clause,
    });
  }

  // A rule with an edge on the boundary that has not said whether it follows the
  // switch. It is matched as (min, max], but which band the boundary value falls in
  // is nobody's decision, so the route is not one anybody can rely on.
  if (edgeAtBoundary(rule, matrix.policy) && rule.followsBoundarySwitch == null) {
    warnings.push({
      code: "BOUNDARY_SWITCH_UNDECIDED",
      level: "err",
      messageEn: `“${rule.labelEn}” has a band edge on the boundary value and nobody has decided whether it follows the boundary switch. Decide it on the rule before relying on this route.`,
      messageMs: `“${rule.labelMs ?? rule.labelEn}” mempunyai had jalur pada nilai sempadan dan belum ditetapkan sama ada ia mengikut suis sempadan.`,
      clause: rule.clause,
    });
  }

  const chain: ApprovalStep[] = [];

  if (rule.proposerCode) {
    chain.push({
      roleCode: rule.proposerCode,
      act: "P",
      nonDelegable: false,
      sourceRuleKey: rule.ruleKey,
    });
  }

  for (const rec of rule.recommenders) {
    const role = matrix.roles[rec.roleCode];
    chain.push({
      roleCode: rec.roleCode,
      act: rec.act,
      ...(role?.isCommittee ? { committeeCode: rec.roleCode } : {}),
      nonDelegable: MANDATORY_ACTS.has(rec.act),
      sourceRuleKey: rule.ruleKey,
    });
  }

  // An office resolved from the contract value (a superintending officer, say) is not
  // special-cased here: it is rows banded on contract value, like any other band.
  let approver: string | null = rule.approverCode;

  const clauses = matrix.policy.clauses;

  // No one may approve their own expenses or allocations. The actor is downgraded to
  // a recommender and the approval moves up.
  if (approver && query.actorRoleCode && query.actorRoleCode === approver) {
    const escalated = matrix.roles[approver]?.selfApprovalEscalatesToCode;
    const src = cite(clauses?.selfApproval);
    if (!escalated) {
      // Nowhere to send it. Routing it to the actor would let them approve their own
      // matter, so the approver is left empty and the warning says why.
      warnings.push({
        code: "SELF_APPROVAL",
        level: "err",
        messageEn: `${roleName(matrix, approver).en} would be approving their own matter, and no office is set to approve in their place. Set where self-approval escalates to for this role.${src.en}`,
        messageMs: `${roleName(matrix, approver).ms} akan meluluskan perkara sendiri, dan tiada jawatan ditetapkan untuk meluluskan bagi pihaknya.${src.ms}`,
        clause: src.clause,
        from: approver,
      });
      approver = null;
    } else {
      warnings.push({
        code: "SELF_APPROVAL",
        level: "warn",
        messageEn: `No one may approve their own expenses or allocations — escalated to ${roleName(matrix, escalated).en}.${src.en}`,
        messageMs: `Tiada sesiapa boleh meluluskan perbelanjaan sendiri — dinaikkan kepada ${roleName(matrix, escalated).ms}.${src.ms}`,
        clause: src.clause,
        from: approver,
        to: escalated,
      });
      chain.push({
        roleCode: approver,
        act: "R",
        nonDelegable: false,
        sourceRuleKey: rule.ruleKey,
        note: "downgraded",
      });
      approver = escalated;
    }
  }

  // Absence reverts authority UPWARD. It never passes down automatically.
  const absent = new Set(query.absentRoleCodes ?? []);
  const absenceSrc = cite(clauses?.absence);
  for (let hops = 0; approver && absent.has(approver) && hops < MAX_ESCALATION_HOPS; hops++) {
    const up = matrix.roles[approver]?.escalatesToCode;
    if (!up) {
      // Absent, with nobody above configured. The matter would sit with someone who is
      // not there, so say so rather than route to them in silence.
      warnings.push({
        code: "ABSENCE",
        level: "err",
        messageEn: `${roleName(matrix, approver).en} is absent and no office is set to take their authority. Set where this role escalates to.${absenceSrc.en}`,
        messageMs: `${roleName(matrix, approver).ms} tiada dan tiada jawatan ditetapkan untuk mengambil alih kuasanya.${absenceSrc.ms}`,
        clause: absenceSrc.clause,
        from: approver,
      });
      break;
    }
    warnings.push({
      code: "ABSENCE",
      level: "warn",
      messageEn: `${roleName(matrix, approver).en} is absent. Authority reverts upward to ${roleName(matrix, up).en} — it never passes down automatically.${absenceSrc.en}`,
      messageMs: `${roleName(matrix, approver).ms} tiada. Kuasa kembali ke atas kepada ${roleName(matrix, up).ms} — ia tidak turun secara automatik.${absenceSrc.ms}`,
      clause: absenceSrc.clause,
      from: approver,
      to: up,
    });
    approver = up;
  }

  // Escalating past an absence can land on the actor. The same rule applies there.
  if (approver && query.actorRoleCode && query.actorRoleCode === approver) {
    const src = cite(clauses?.selfApproval);
    warnings.push({
      code: "SELF_APPROVAL",
      level: "err",
      messageEn: `After escalation, ${roleName(matrix, approver).en} would be approving their own matter. It needs an approver above them.${src.en}`,
      messageMs: `Selepas dinaikkan, ${roleName(matrix, approver).ms} akan meluluskan perkara sendiri.${src.ms}`,
      clause: src.clause,
      from: approver,
    });
    approver = null;
  }

  if (approver) {
    const act = approverAct(rule);
    const role = matrix.roles[approver];
    chain.push({
      roleCode: approver,
      act,
      ...(role?.isCommittee ? { committeeCode: approver } : {}),
      nonDelegable: rule.approverMandatory,
      sourceRuleKey: rule.ruleKey,
    });
  }

  // Collapse a step that merely repeats the one before it.
  const deduped = chain.filter(
    (step, i, all) => i === 0 || !(all[i - 1].roleCode === step.roleCode && all[i - 1].act === step.act),
  );

  if (query.fundingSupersedesAuthority) {
    const src = cite(clauses?.funderOverride);
    warnings.push({
      code: "GOV_OVERRIDE",
      level: "warn",
      messageEn:
        "Externally funded: the funder's own guidelines and directives supersede these limits where they conflict." +
        src.en,
      messageMs:
        "Dibiayai pihak luar: garis panduan dan arahan penyandang dana mengatasi had ini apabila bercanggah." +
        src.ms,
      clause: src.clause,
    });
  }

  return {
    rule,
    boundaryOperator: boundaryOperatorFor(rule, matrix.policy),
    chain: deduped,
    warnings,
    regime,
    approverCode: approver,
    committeeCode: rule.committeeCode,
    nonDelegable: rule.nonDelegable,
    query,
  };
}

/**
 * Every rule of an issue that fails the boundary check against `policy` — re-run
 * whenever the issue is issued or its boundary moves, since a rule saved against the
 * old boundary may now have an edge on the new one (code review, item 7).
 */
export function boundaryFaultsAcross(
  rules: readonly Rule[],
  policy: Pick<Policy, "boundaryValue">,
): { rule: Rule; fault: BoundaryRuleFault }[] {
  return rules
    .map((rule) => ({ rule, fault: boundaryRuleFault(rule, policy, rules) }))
    .filter((x): x is { rule: Rule; fault: BoundaryRuleFault } => x.fault != null);
}
