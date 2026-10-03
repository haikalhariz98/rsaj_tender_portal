/**
 * Supervision's vocabulary (6.13 Part A, 4b, FR-SUP), as pure types mirroring the Prisma enums so
 * `src/lib/supervision/**` stays free of the client. `types-schema.test.ts` keeps every list equal to the
 * schema's enum, in order, and every map over them exhaustive.
 */

export type { Finding, Level } from "@/lib/method/types";
export type { Provenance } from "@/lib/award/types";

export const SO_ASSIGNMENT_REASONS = ["EXECUTION", "RESOLVED", "RE_RESOLVED"] as const;
export type SoAssignmentReason = (typeof SO_ASSIGNMENT_REASONS)[number];

export const DELEGATE_KINDS = ["PRINCIPAL", "SPECIALIST", "SPECIALIST_QS"] as const;
export type DelegateKind = (typeof DELEGATE_KINDS)[number];

export const SUPERVISION_ACTS = ["DIARY", "PROGRAMME_SCRUTINY", "PROGRESS", "OBSERVATION", "CONTRACTOR_COMMUNICATION", "INSTRUCTION", "VALUATION", "VARIATION_APPLICATION"] as const;
export type SupervisionAct = (typeof SUPERVISION_ACTS)[number];

export const PROGRAMME_KINDS = ["WORK_PROGRAMME", "SERVICE_SCHEDULE"] as const;
export type ProgrammeKind = (typeof PROGRAMME_KINDS)[number];

export const PROGRAMME_DECISIONS = ["APPROVED", "RETURNED"] as const;
export type ProgrammeDecision = (typeof PROGRAMME_DECISIONS)[number];

export const DIARY_ENDORSERS = ["SUPERIOR_OFFICER", "SUPERINTENDING_OFFICER"] as const;
export type DiaryEndorser = (typeof DIARY_ENDORSERS)[number];

export const COMPLIANCE_AREAS = ["MATERIAL_QUALITY", "WORKMANSHIP", "AUTHORITY_COMPLIANCE", "WORKER_WELFARE", "SAFETY", "INSURANCE", "WAGES", "OSHA"] as const;
export type ComplianceArea = (typeof COMPLIANCE_AREAS)[number];

export const DIRECTION_CAUSES = ["VARIATION", "LOCAL_AUTHORITY_DELAY", "OTHER_DELAY"] as const;
export type DirectionCause = (typeof DIRECTION_CAUSES)[number];

export const PENDING_DEDUCTION_KINDS = ["INSURANCE_PREMIUM"] as const;
export type PendingDeductionKind = (typeof PENDING_DEDUCTION_KINDS)[number];

export const EARLY_ACTION_BRANCHES = ["EXTEND_TIME", "IMPOSE_LAD", "TERMINATE"] as const;
export type EarlyActionBranch = (typeof EARLY_ACTION_BRANCHES)[number];

export const CONTRACT_PARTY_KINDS = ["NOMINATED_SUBCONTRACTOR", "NOMINATED_SUPPLIER", "ASSIGNEE"] as const;
export type ContractPartyKind = (typeof CONTRACT_PARTY_KINDS)[number];

export const SITE_RECORDS_SETS = ["PIPE_LOG", "AS_BUILT"] as const;
export type SiteRecordsSet = (typeof SITE_RECORDS_SETS)[number];

export const DELEGATION_VARIANTS = ["CONVENTIONAL", "DESIGN_AND_BUILD"] as const;
export type DelegationVariant = (typeof DELEGATION_VARIANTS)[number];

/// A day, YYYY-MM-DD (the organisation's).
export type Day = string;
