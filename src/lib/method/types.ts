/**
 * The vocabulary of method selection, value bands and contract-type classification
 * (spec §6.3), as pure types.
 *
 * Mirrors the Prisma enums so `src/lib/method/**` stays free of the client, as the other
 * lib modules do. Every rule about an exercise's classification lives beside this file;
 * actions and screens call it and never restate it.
 */

import type { Regime } from "@/lib/authority/types";
import type { FundingPosture, Provenance, SourcingMethod } from "@/lib/reference/types";

export type { Provenance, Regime, FundingPosture };

/// The matters the method family routes on. Vocabulary, not policy: which rows exist
/// for them is the customer's configuration.
export const APPOINTMENT_DOMAIN = "appointment";
export const NAME_APPROVAL_DOMAIN = "name_approval";
/// Approval for Tendering (FR-DOC-012, 6.4): the exercise's second route of its own.
export const TENDERING_APPROVAL_DOMAIN = "tendering_approval";
/// A change to the invitation window after approval for tendering: a closing correction or
/// extension, or cancelling an advertised or invited exercise (6.5 OD-5, FR-ADV-015, 016).
export const WINDOW_CHANGE_DOMAIN = "window_change";

/// The exercise's states (§7.3.2). 6.4 adds the two tendering states, 6.5 the two acts that open
/// the window (advertised, invited), 6.7 the two acts of the opening (the box opened on the second
/// authorisation; the main opening finalised), 6.8 the two of the evaluation (started on the pinned
/// model; its report issued); every map over them is exhaustive (X-8), so a state added here fails
/// to compile until each map decides it. The window's phases are derived, never states (ADR 0014);
/// clarification, negotiation and the committee stages are derived from their records (6.8 OD-3 A).
export const EXERCISE_STATUSES = ["DRAFT", "DOCUMENTS_IN_PREPARATION", "PENDING_APPROVAL_FOR_TENDERING", "APPROVED_FOR_TENDERING", "ADVERTISED", "INVITED", "OPENING_IN_PROGRESS", "OPENED", "UNDER_EVALUATION", "EVALUATED", "CANCELLED"] as const;
export type ExerciseStatus = (typeof EXERCISE_STATUSES)[number];
/// What a sourcing method assembles for tenderers (6.4, FR-DOC-001, 013).
export type PackKind = "TENDER" | "QUOTATION" | "NONE";
export type DeliverableKind = "GOODS_DELIVERED" | "MEASURED_CONSTRUCTION" | "TERM_PERFORMANCE";
export const DELIVERABLE_KINDS: readonly DeliverableKind[] = ["GOODS_DELIVERED", "MEASURED_CONSTRUCTION", "TERM_PERFORMANCE"];
export type ProposalState = "DRAFT" | "SUBMITTED" | "REVIEWED";
export type TaxonomyPick = "DERIVED" | "CHOSEN";
export type ContractTypeState = "DERIVED" | "OVERRIDDEN" | "CHOSEN";
export type BoundaryOperator = "GT" | "GTE";
export const REGIMES: readonly Regime[] = ["below", "quotation", "tender"];

/// What choosing a method asks of the exercise (FR-MTD-004–010, FR-REQ-013).
export interface MethodBehaviour {
  defaultInTender: boolean;
  defaultInQuotation: boolean;
  defaultBelow: boolean;
  requiresJustification: boolean;
  justificationPrompt: string;
  requiresProposal: boolean;
  requiresNameApproval: boolean;
  restrictedAccess: boolean;
  requiresDossier: boolean;
  requiresCoordinationRecord: boolean;
  dossierSeriesKey: string | null;
  /// RSAJ answer 22: the series an exercise of this method takes its reference from when it is opened. Null or absent: "exercise".
  exerciseSeriesKey?: string | null;
  /// 6.4: the tender pack the method assembles. Null or absent: not set, and the move into
  /// preparation blocks naming it (never read as "no pack").
  documentPackKind?: PackKind | null;
}

export type Method = SourcingMethod & MethodBehaviour;

/// A contract terms band on an issue (FR-MTD-001). Names the terms set; never figures.
export interface TermsBand {
  bandKey: string;
  minValue: number | null;
  maxValue: number | null;
  /// The regime it applies in; null: every regime.
  regime: string | null;
  labelEn: string;
  retentionApplies: boolean | null;
  defectsLiabilityApplies: boolean | null;
  insuranceNote: string;
  followsBoundarySwitch: boolean | null;
  clause: string;
  provenance: Provenance;
  sortOrder: number;
}

export interface ChecklistItem {
  key: string;
  labelEn: string;
  required: boolean;
  sortOrder: number;
  retiredOn: Date | null;
}

export interface JustificationReason {
  code: string;
  nameEn: string;
  sourcingMethodCode: string | null;
  provenance: Provenance;
  sortOrder: number;
  retiredOn: Date | null;
}

/// The twelve behaviours a contract type drives (FR-MTD-012). Null or empty: not set.
export interface ContractBehaviours {
  pricingBasis: string | null;
  registrationTest: string | null;
  administratorRoleCodes: string[];
  startRequiresSecurities: boolean | null;
  eotInstrument: string | null;
  completionInstrument: string | null;
  defectsLiabilityApplies: boolean | null;
  makingGoodCertificate: boolean | null;
  nominationAllowed: boolean | null;
  interimPaymentRule: string | null;
  sumAdjustmentDrivers: string[];
  claimsApprovalCommitteeCode: string | null;
  /// 6.13 Part A step 1: the typed twin of `sumAdjustmentDrivers` (not one of the twelve; read by the
  /// adjustment certificate). Absent on rows built before it.
  sumAdjustmentTriggers?: string[];
  /// 6.13 Part A step 2 (FR-SUP-003): which delegation letters the type's contracts use. Null: not set, and a
  /// delegation is refused naming it. Absent on rows built before it.
  delegationVariant?: string | null;
}

export interface ContractTypeRow extends ContractBehaviours {
  code: string;
  nameEn: string;
  deliverableKind: DeliverableKind | null;
  provenance: Provenance;
  sortOrder: number;
  retiredOn: Date | null;
}

export interface ContractBasis {
  code: string;
  nameEn: string;
  standardFormLabel: string | null;
  sortOrder: number;
  retiredOn: Date | null;
}

export interface Taxonomy {
  code: string;
  nameEn: string;
  sortOrder: number;
  retiredOn: Date | null;
  values: { code: string; nameEn: string; retiredOn: Date | null }[];
}

export interface TaxonomyMapping {
  contractTypeCode: string;
  taxonomyCode: string;
  valueCode: string;
  whenBasisCode: string | null;
  whenTaxonomyCode: string | null;
  whenValueCode: string | null;
  provenance: Provenance;
}

/// How mixed scope is classified. A null share is not set, never 50.
export interface ClassificationPolicy {
  /// Decimal(9,4) as its string, e.g. "50.0000". Null: not set.
  dominanceSharePct: string | null;
  provenance: Provenance | null;
}

/// A finding about an exercise: a fault that blocks, or a warning shown with it. The
/// code is a key for `findingText`, never rendered.
export type Level = "block" | "warn" | "info";
export interface Finding<C extends string = string> {
  code: C;
  level: Level;
  /// Values the text is written with (money as sen strings, names, keys).
  data?: Record<string, string | number | null>;
}

export const blocks = (fs: readonly Finding[]) => fs.filter((f) => f.level === "block");
