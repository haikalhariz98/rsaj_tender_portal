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

/// Maximum upward hops when escalating past absent holders. Guards against a cycle
/// in a mis-seeded escalation map.
const MAX_ESCALATION_HOPS = 6;

/**
 * Does `value` fall inside the band (min, max]?
 *
 * Every band edge is exclusive at the bottom and inclusive at the top, EXCEPT at
 * `policy.boundaryValue`, where spec decision D3 applies and `boundaryInclusive`
 * decides which side a value exactly on the boundary lands.
 *
 * A null value matches only an unbounded row — a row with a band is not a candidate
 * for a matter whose value is unknown.
 */
export function inBand(
  value: number | null | undefined,
  min: number | null,
  max: number | null,
  policy: Policy,
): boolean {
  if (value == null) return min == null && max == null;

  const flip = policy.boundaryInclusive === false;
  const b = policy.boundaryValue;

  const lowerOk = min == null || (flip && min === b ? value >= min : value > min);
  const upperOk = max == null || (flip && max === b ? value < max : value <= max);

  return lowerOk && upperOk;
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
  if (inBand(value, policy.tenderFloor, null, policy)) return "tender";
  if (inBand(value, policy.quotationFloor, policy.tenderFloor, policy)) return "quotation";
  return "below";
}

/**
 * The Superintending Officer is not a standing office — it is resolved from the
 * contract value at the time the matter arises (DAL §3.1.4.4 item 5).
 */
export function resolveSuperintendingOfficer(contractValue: number | null | undefined): string {
  if (contractValue == null) return "HOD";
  if (contractValue > 3_000_000) return "CEO";
  if (contractValue > 1_000_000) return "FD";
  return "HOD";
}

/**
 * How specific a rule is. The most specific matching row wins, so a row banded on
 * both contract value and percentage beats one banded on percentage alone.
 * Gap rows are pushed to the bottom: an assumed route is a last resort.
 */
function specificity(rule: Rule): number {
  let score = 0;
  if (rule.contractValueMin != null || rule.contractValueMax != null) score += 8;
  if (rule.pctMin != null || rule.pctMax != null) score += 4;
  if (rule.minValue != null || rule.maxValue != null) score += 2;
  if (rule.cond != null) score += 1;
  if (rule.isGap) score -= 16;
  return score;
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
      !inBand(q.contractValue, r.contractValueMin, r.contractValueMax, policy)
    ) {
      return false;
    }
    if ((r.pctMin != null || r.pctMax != null) && !inPercentBand(q.pct, r.pctMin, r.pctMax)) {
      return false;
    }
    if (
      (r.minValue != null || r.maxValue != null) &&
      !inBand(q.value, r.minValue, r.maxValue, policy)
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

  if (!rule) {
    warnings.push({
      code: "NO_RULE",
      level: "err",
      messageEn:
        "No DAL row matches this combination. DAL §1.6: escalate to the immediate superior of the expected approving authority.",
      messageMs:
        "Tiada baris DAL sepadan. DAL §1.6: naikkan kepada atasan terdekat pegawai yang dijangka meluluskan.",
      clause: "DAL_16",
    });
    return {
      rule: null,
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
        "No DAL row exists for this item — the routing shown is an assumption, not a documented rule.",
      messageMs:
        "Tiada baris DAL untuk perkara ini — laluan yang ditunjukkan adalah andaian, bukan peraturan bertulis.",
      clause: rule.clause,
    });
  }
  if (rule.gapNote) {
    warnings.push({
      code: "RULE_NOTE",
      level: "info",
      messageEn: rule.note,
      messageMs: rule.note,
      clause: rule.gapNote,
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

  let approver = rule.approverCode;

  // The SO is resolved from the contract value, not held as a standing office.
  if (approver === "SO_PD") {
    approver = resolveSuperintendingOfficer(query.contractValue);
    warnings.push({
      code: "SO_RESOLVED",
      level: "info",
      messageEn: `Superintending Officer resolved from contract value: ${roleName(matrix, approver).en}.`,
      messageMs: `Pegawai Penguasa ditentukan daripada nilai kontrak: ${roleName(matrix, approver).ms}.`,
      clause: "DAL_3144_5",
      to: approver,
    });
  }

  // No one may approve their own expenses or allocations. The actor is downgraded to
  // a recommender and the approval moves up.
  if (approver && query.actorRoleCode && query.actorRoleCode === approver) {
    const escalated = matrix.roles[approver]?.selfApprovalEscalatesToCode;
    if (escalated) {
      warnings.push({
        code: "SELF_APPROVAL",
        level: "warn",
        messageEn: `No one may approve their own expenses or allocations — escalated to ${roleName(matrix, escalated).en}.`,
        messageMs: `Tiada sesiapa boleh meluluskan perbelanjaan sendiri — dinaikkan kepada ${roleName(matrix, escalated).ms}.`,
        clause: "DAL_16",
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
  for (let hops = 0; approver && absent.has(approver) && hops < MAX_ESCALATION_HOPS; hops++) {
    const up = matrix.roles[approver]?.escalatesToCode;
    if (!up) break;
    warnings.push({
      code: "ABSENCE",
      level: "warn",
      messageEn: `${roleName(matrix, approver).en} is absent. Authority reverts UPWARD to ${roleName(matrix, up).en} — it never passes down automatically, and may be re-delegated only on the absent holder's recommendation.`,
      messageMs: `${roleName(matrix, approver).ms} tiada. Kuasa kembali KE ATAS kepada ${roleName(matrix, up).ms} — ia tidak turun secara automatik.`,
      clause: "DAL_ABSENCE",
      from: approver,
      to: up,
    });
    approver = up;
  }

  if (approver) {
    const act: AuthorityAct = rule.nonDelegable && rule.approverMandatory ? "MA" : "A";
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
    warnings.push({
      code: "GOV_OVERRIDE",
      level: "warn",
      messageEn:
        "Externally funded: the funder's own guidelines and directives supersede these limits where they conflict.",
      messageMs:
        "Dibiayai pihak luar: garis panduan dan arahan penyandang dana mengatasi had ini apabila bercanggah.",
      clause: "DAL_GOV",
    });
  }

  return {
    rule,
    chain: deduped,
    warnings,
    regime,
    approverCode: approver,
    committeeCode: rule.committeeCode,
    nonDelegable: rule.nonDelegable,
    query,
  };
}
