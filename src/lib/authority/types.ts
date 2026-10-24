import type { ExactRatio } from "@/lib/percent-band";

/// The DAL authority grammar. Fixed by the manual.
export type AuthorityAct = "P" | "JP" | "R" | "JR" | "MR" | "MJR" | "A" | "MA";

/// Every act of the grammar, in the manual's order: the one list a form's choice reads.
export const AUTHORITY_ACTS: readonly AuthorityAct[] = ["P", "JP", "R", "JR", "MR", "MJR", "A", "MA"];

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
  /// FR-APR-002: the contract type the row is confined to (ContractType.code). Null or absent: any type.
  contractTypeCode?: string | null;
  minValue: number | null;
  maxValue: number | null;
  /// Band on a percentage, each edge its Decimal(9,4) string (ADR 0024 Amendment 1): judged exactly against a
  /// ratio of two amounts, never as a float. Which side of an edge a value exactly on it falls is the issue's
  /// switch (`Policy.boundaryInclusive`).
  pctMin: string | null;
  pctMax: string | null;
  contractValueMin: number | null;
  contractValueMax: number | null;
  /// Whether this rule's edges follow the issue's boundary switch where an edge equals
  /// `boundaryValue`. Null: nobody has decided. See `inBand`.
  followsBoundarySwitch: boolean | null;
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
  /// Whether the chain beneath the approver is generated from the issue's core routing
  /// (FR-APR-004). Null or absent: nobody has decided, and the route warns that its
  /// chain was not checked. False is a decision ("as entered"), with its reason.
  generateCoreChain?: boolean | null;
  coreChainReason?: string | null;
  /// A route choice (decision D2): rows of one matter carrying an option are alternative readings, and the customer
  /// picks one. The option in words; null or absent on a row that is no option.
  choiceOptionEn?: string | null;
  /// Whether the row's option is chosen. Null: not made, and a matter it would route says so. False: never routed.
  chosen?: boolean | null;
}

export type Provenance = "STATED" | "OBSERVED" | "ASSUMED";

/// An office beneath the approver in the core routing, in order. Its act is one of
/// P, JP, R, JR (6.9 note D-4); anything else is a fault `coreLevelFaults` reports.
export interface CoreStep {
  roleCode: string;
  act: AuthorityAct;
  provenance: Provenance;
  note?: string;
}

/// One approving office's row of the core routing rule (§2.2.1). No steps means the
/// office approves alone, which is not the same as having no row.
export interface CoreLevel {
  approverCode: string;
  clause: string;
  provenance: Provenance;
  note?: string;
  steps: CoreStep[];
}

/// Where a step of a generated chain came from (6.9 ruling C1): the core routing as it
/// stands, a core step the rule raised to a stronger act, a core step the rule set to
/// another act of the same rank, or a step the rule adds.
export type ChainOrigin = "CORE" | "CORE_STRENGTHENED" | "CORE_ACT_SET" | "RULE";

/// What a resolution records about core routing, for the route's snapshot.
export interface CoreChainRecord {
  /// The rule's flag as it stood: null not decided, false as entered, true generated.
  flag: boolean | null;
  /// The reason recorded for "as entered".
  reason: string | null;
  /// The core row the chain was generated from; null where it was not generated.
  level: CoreLevel | null;
}

/// Thresholds that travel with the DAL issue rather than with the code.
export interface Policy {
  boundaryValue: number;
  /// See spec decision D3. True => a value exactly equal to `boundaryValue` sits in
  /// the LOWER band ("melebihi" / exceeding). False => it sits in the upper band
  /// (the `>= RM300,000.00` flowchart reading). ADR 0024 Amendment 1: a percentage band
  /// edge follows the same side (true: (min, max]; false: [min, max)).
  boundaryInclusive: boolean;
  quotationFloor: number;
  tenderFloor: number;
  requisitionBoundary: number;
  currency: string;
  /// Clauses the engine cites for its own standing rules. Customer text; absent means
  /// the source is not recorded, and warnings say so instead of citing one.
  clauses?: StandingClauses;
}

export interface StandingClauses {
  noRule?: string | null;
  selfApproval?: string | null;
  absence?: string | null;
  funderOverride?: string | null;
}

export interface Matrix {
  policy: Policy;
  roles: Record<string, Role>;
  rules: Rule[];
  /// The issue's core routing. Absent or empty: not set, so no chain is generated
  /// and a rule that asks for one warns that its chain was not checked.
  coreRouting?: CoreLevel[];
}

export type Regime = "tender" | "quotation" | "below";

export type WarningLevel = "info" | "warn" | "err" | "gap";

export interface ResolutionWarning {
  code:
    | "NO_RULE"
    | "GAP_RULE"
    | "RULE_NOTE"
    | "AMBIGUOUS"
    | "SELF_APPROVAL"
    | "ABSENCE"
    | "GOV_OVERRIDE"
    | "BOUNDARY_SWITCH_UNDECIDED"
    | "CORE_NOT_CHECKED"
    | "CORE_CHAIN_FAULT"
    | "CORE_AS_ENTERED"
    | "EDGE_UNDECIDED"
    | "TYPE_ROW_SKIPPED"
    | "CHOICE_NOT_MADE";
  level: WarningLevel;
  messageEn: string;
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
  /// Set only on a chain generated from core routing; absent on a chain as entered.
  origin?: ChainOrigin;
}

export interface ResolveQuery {
  domain: string;
  method?: string | null;
  /// FR-APR-002: the matter's contract type (the exercise's ContractType.code), where rows are confined by it.
  contractTypeCode?: string | null;
  cond?: string | null;
  /// Value of the matter being authorised.
  value?: number | null;
  /// The percentage, where the row is banded by percentage (a variation's sum over the contract sum, a waiver
  /// over the damages), as the exact ratio of the two amounts (ADR 0024 Amendment 1). The float `pct` is retired:
  /// 0.07 × 100 is 7.000000000000001 in binary, and a value exactly on an edge must land where the edge says.
  pctRatio?: ExactRatio | null;
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

/// The comparison applied at a band edge that sat on the boundary value.
export type BoundaryOperator = "GT" | "GTE";

export interface Resolution {
  rule: Rule | null;
  /// The comparison applied at the matched rule's boundary edge, or null where no
  /// edge of the rule sat on the boundary.
  boundaryOperator: BoundaryOperator | null;
  chain: ApprovalStep[];
  warnings: ResolutionWarning[];
  regime: Regime | null;
  approverCode: string | null;
  committeeCode: string | null;
  nonDelegable: boolean;
  query: ResolveQuery;
  /// Set wherever a rule matched: the flag, reason and core row behind the chain.
  core?: CoreChainRecord;
}
