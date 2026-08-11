/// The DAL authority grammar. Fixed by the manual.
export type AuthorityAct = "P" | "JP" | "R" | "JR" | "MR" | "MJR" | "A" | "MA";

/// Acts that cannot be delegated or skipped. A mandatory recommendation must be
/// obtained even where the approver would otherwise be willing to proceed.
export const MANDATORY_ACTS: ReadonlySet<AuthorityAct> = new Set<AuthorityAct>(["MR", "MJR", "MA"]);

export interface Role {
  code: string;
  nameEn: string;
  nameMs: string;
  isCommittee: boolean;
  /// DAL §1.6 — where the holder is absent, authority reverts UPWARD to this role.
  escalatesToCode: string | null;
  /// Where the actor would be approving their own matter, it escalates here instead.
  selfApprovalEscalatesToCode: string | null;
}

export interface Recommender {
  roleCode: string;
  act: AuthorityAct;
}

export interface Rule {
  ruleKey: string;
  domain: string;
  method: string | null;
  cond: string | null;
  minValue: number | null;
  maxValue: number | null;
  pctMin: number | null;
  pctMax: number | null;
  contractValueMin: number | null;
  contractValueMax: number | null;
  labelEn: string;
  labelMs: string | null;
  proposerCode: string | null;
  approverCode: string | null;
  committeeCode: string | null;
  committeeAct: AuthorityAct | null;
  nonDelegable: boolean;
  approverMandatory: boolean;
  isGap: boolean;
  gapNote: string | null;
  note: string;
  clause: string;
  sortOrder: number;
  recommenders: Recommender[];
}

/// Thresholds that travel with the DAL issue rather than with the code.
export interface Policy {
  boundaryValue: number;
  /// See spec decision D3. True => a value exactly equal to `boundaryValue` sits in
  /// the LOWER band ("melebihi" / exceeding). False => it sits in the upper band
  /// (the `>= RM300,000.00` flowchart reading).
  boundaryInclusive: boolean;
  quotationFloor: number;
  tenderFloor: number;
  requisitionBoundary: number;
  splittingWindowDays: number;
  currency: string;
}

export interface Matrix {
  policy: Policy;
  roles: Record<string, Role>;
  rules: Rule[];
}

export type Regime = "tender" | "quotation" | "below";

export type WarningLevel = "info" | "warn" | "err" | "gap";

export interface ResolutionWarning {
  code:
    | "NO_RULE"
    | "GAP_RULE"
    | "RULE_NOTE"
    | "SO_RESOLVED"
    | "SELF_APPROVAL"
    | "ABSENCE"
    | "GOV_OVERRIDE";
  level: WarningLevel;
  messageEn: string;
  messageMs: string;
  clause?: string;
  from?: string;
  to?: string;
}

export interface ApprovalStep {
  roleCode: string;
  act: AuthorityAct;
  /// Set where the step is discharged by a committee rather than an individual.
  committeeCode?: string;
  nonDelegable: boolean;
  /// The rule this step came from, so every step is traceable to a clause.
  sourceRuleKey: string;
  note?: string;
}

export interface ResolveQuery {
  domain: string;
  method?: string | null;
  cond?: string | null;
  /// Value of the matter being authorised.
  value?: number | null;
  /// Percentage, where the row is banded by percentage (variation orders).
  pct?: number | null;
  /// Value of the parent contract, where that is banded separately from the matter.
  contractValue?: number | null;
  /// Role codes currently absent, for the upward-reversion rule.
  absentRoleCodes?: string[];
  /// The role acting, for the self-approval rule.
  actorRoleCode?: string | null;
  /// The funding route this matter is on, as a configured code. Carried so a
  /// resolution can say what it was decided under; the engine does not interpret it.
  funding?: string | null;
  /// Whether that route's funder overrides these limits. Read from the configured
  /// route rather than inferred from its code — which routes supersede is the
  /// customer's arrangement with its funders, not a fact about the words used.
  fundingSupersedesAuthority?: boolean;
}

export interface Resolution {
  rule: Rule | null;
  chain: ApprovalStep[];
  warnings: ResolutionWarning[];
  regime: Regime | null;
  approverCode: string | null;
  committeeCode: string | null;
  nonDelegable: boolean;
  query: ResolveQuery;
}
