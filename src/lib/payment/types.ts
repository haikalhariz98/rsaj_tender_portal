/**
 * Interim payment's vocabulary (6.13 Part A step 3, 4c: FR-PAY-001–019, 021), as pure types mirroring the Prisma
 * enums so `src/lib/payment/**` stays free of the client. `types-schema.test.ts` keeps every list equal to the
 * schema's enum, in order, and every map over them exhaustive (X-8).
 */

export type { Finding, Level } from "@/lib/method/types";
export type { Provenance } from "@/lib/award/types";

/// FR-PAY-004: what started the cycle: the agreed monthly valuation day, or a contractor's claim.
export const VALUATION_TRIGGERS = ["VALUATION_DATE", "CLAIM"] as const;
export type ValuationTrigger = (typeof VALUATION_TRIGGERS)[number];

/// FR-PAY-006: the contractor's answer to the joint valuation.
export const CONTRACTOR_ANSWERS = ["AGREED", "DISSENT"] as const;
export type ContractorAnswer = (typeof CONTRACTOR_ANSWERS)[number];

/// Where a valuation stands: being prepared, raised as a certificate, held to the next cycle (below the minimum,
/// FR-PAY-013), or withdrawn with its reason.
export const VALUATION_STATUSES = ["OPEN", "RAISED", "HELD", "WITHDRAWN"] as const;
export type ValuationStatus = (typeof VALUATION_STATUSES)[number];

/// FR-PAY-011: the deductions an officer keys (the rest are computed: retention, previous, advance, LAD).
export const KEYED_DEDUCTION_KINDS = ["PREMIUMS_PERKESO", "WAGES", "NON_COMPLIANCE", "OTHER", "LAD_ROUNDING"] as const;
export type KeyedDeductionKind = (typeof KEYED_DEDUCTION_KINDS)[number];

/// FR-PAY-011, 021: retention is held three ways.
export const RETENTION_TIERS = ["MAIN", "NSC", "NS"] as const;
export type RetentionTier = (typeof RETENTION_TIERS)[number];

/// FR-PAY-021: a release of retention money (what is held is read from the issued certificates, never stored).
export const RETENTION_RELEASES = ["RELEASED_FIRST", "RELEASED_BALANCE"] as const;
export type RetentionRelease = (typeof RETENTION_RELEASES)[number];

/// FR-PAY-002: whose advance is recouped (the main contractor's, or a nominated sub-contractor's).
export const ADVANCE_PARTIES = ["MAIN", "NSC"] as const;
export type AdvanceParty = (typeof ADVANCE_PARTIES)[number];

/// OD-A6: which figure the interim certificate is routed on (unset refuses).
export const PAYMENT_ROUTE_FIGURES = ["RECOMMENDED", "GROSS_THIS_PERIOD"] as const;
export type PaymentRouteFigure = (typeof PAYMENT_ROUTE_FIGURES)[number];

/// OD-A4: where the sen a pro-rata split leaves over go (unset refuses an insufficient certificate's split).
export const WATERFALL_REMAINDERS = ["LARGEST_REMAINDER", "FIRST_PARTY"] as const;
export type WaterfallRemainder = (typeof WATERFALL_REMAINDERS)[number];

/// FR-LAD-001, OD-A1 A: the non-completion decision: damages apply (a Certificate of Non-Completion), or the delay
/// is excusable or its entitlement still pending (the certificate proceeds without a damages line, reasons shown).
export const NON_COMPLETION_OUTCOMES = ["LAD_APPLIES", "EXCUSED_OR_PENDING"] as const;
export type NonCompletionOutcome = (typeof NON_COMPLETION_OUTCOMES)[number];

/// FR-LAD-004: the whole of the works, or a section.
export const NON_COMPLETION_SCOPES = ["WHOLE", "SECTION"] as const;
export type NonCompletionScope = (typeof NON_COMPLETION_SCOPES)[number];

/// The contract clocks Part A reads (plan A2): set per organisation, each with its provenance; unset reads "Not set".
export const CONTRACT_CLOCKS = ["ORAL_CONFIRM", "ORAL_OBJECTION", "DAYWORK_SUBSTANTIATION", "LAD_WARNING_RESPONSE", "CERT_ISSUE"] as const;
export type ContractClock = (typeof CONTRACT_CLOCKS)[number];

/// FR-LAD-005: the four items of the non-completion pack.
export const PACK_ITEMS = ["STUDY", "PROGRESS", "EMPLOYER_DELAY", "PAYMENTS"] as const;
export type PackItem = (typeof PACK_ITEMS)[number];

/// A day, YYYY-MM-DD (the organisation's).
export type Day = string;
