/**
 * Variations' and the contract sum's adjustment vocabulary (6.13 Part A step 4, 4d: FR-VAR-001–024, FR-PAD-001–007),
 * as pure types mirroring the Prisma enums so `src/lib/variation/**` stays free of the client. `types-schema.test.ts`
 * keeps every list equal to the schema's enum, in order, and every map over them exhaustive (X-8).
 */

export type { Finding, Level } from "@/lib/method/types";
export type { Provenance } from "@/lib/award/types";

/// A day, as the organisation's day: YYYY-MM-DD.
export type Day = string;

/// OD-A2: what a variation's percentage is of.
export const VARIATION_PCT_BASES = ["THIS_VARIATION", "CUMULATIVE"] as const;
export type VariationPctBasis = (typeof VARIATION_PCT_BASES)[number];

/// OD-A2: the sum the percentage is taken over, and the contract value its band is read at.
export const VARIATION_BASES = ["ORIGINAL", "REVISED"] as const;
export type VariationBase = (typeof VARIATION_BASES)[number];

/// FR-VAR-007 (OD-A5): the schedule form a variation produces.
export const SCHEDULE_FORMS = ["AGREED_PRICE", "MEASURED", "BOTH"] as const;
export type ScheduleForm = (typeof SCHEDULE_FORMS)[number];

/// FR-VAR-001: the two origination paths.
export const VARIATION_ORIGINS = ["DEPARTMENT", "SO_REPRESENTATIVE"] as const;
export type VariationOrigin = (typeof VARIATION_ORIGINS)[number];

/// FR-VAR-004: the four exemptions from prior approval.
export const VARIATION_EXEMPTIONS = ["REDUCTION", "PC_SUM", "PROVISIONAL_SUM", "REMEASUREMENT"] as const;
export type VariationExemption = (typeof VARIATION_EXEMPTIONS)[number];

/// Where a variation stands, as stored (the rest of its stage is read from its records).
export const VARIATION_STATUSES = ["DRAFT", "SUBMITTED", "SUPPORTED", "CLOSED"] as const;
export type VariationStatus = (typeof VARIATION_STATUSES)[number];

/// FR-VAR-008, FR-PAD-004: the separate approvals a variation may need.
export const VARIATION_EVENTS = ["PRIOR", "INCREASE", "AGREED_RATE", "REMEASUREMENT"] as const;
export type VariationEvent = (typeof VARIATION_EVENTS)[number];

/// FR-VAR-018: where a measured item's rate comes from.
export const RATE_SOURCES = ["CONTRACT_RATE", "AGREED_RATE"] as const;
export type RateSource = (typeof RATE_SOURCES)[number];

/// An addition to the contract sum, or an omission from it.
export const ADJUSTMENT_DIRECTIONS = ["ADDITION", "OMISSION"] as const;
export type AdjustmentDirection = (typeof ADJUSTMENT_DIRECTIONS)[number];

/// FR-PAD-002: 1.1 variation-driven, 1.2 other.
export const ADJUSTMENT_SECTIONS = ["VARIATION", "OTHER"] as const;
export type AdjustmentSection = (typeof ADJUSTMENT_SECTIONS)[number];

/// FR-PAD-001: the five triggers (the contract type's `sumAdjustmentTriggers`).
export const ADJUSTMENT_TRIGGERS = ["VARIATION", "LOSS_AND_EXPENSE", "REMEASUREMENT", "PC_AND_PROVISIONAL_SUMS", "PRICE_FLUCTUATION"] as const;
export type AdjustmentTrigger = (typeof ADJUSTMENT_TRIGGERS)[number];

/// FR-VAR-005: the S.O.'s answer on the application (the core's signature decision: supported or not).
export const SO_DECISIONS = ["SUPPORTED", "NOT_SUPPORTED"] as const;
export type SoDecision = (typeof SO_DECISIONS)[number];
