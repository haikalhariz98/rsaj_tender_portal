/**
 * Time's vocabulary (6.13 Part B run 1b: FR-EOT-001–013). Mirrors the schema's enums; a code never reaches a screen
 * (labels.ts words each). Pure.
 */

export type { Finding, Level } from "@/lib/method/types";

export type Day = string;

/// FR-EOT-001: how a delay notice came.
export const DELAY_NOTICE_PATHS = ["CONTRACTOR_NOTICE", "SO_DIRECTION"] as const;
export type DelayNoticePath = (typeof DELAY_NOTICE_PATHS)[number];

/// FR-EOT-002.
export const ENTITLEMENTS = ["ENTITLED", "NOT_ENTITLED"] as const;
export type Entitlement = (typeof ENTITLEMENTS)[number];

/// FR-EOT-003.
export const BEST_ENDEAVOURS = ["FULL", "PARTIAL", "NONE"] as const;
export type BestEndeavours = (typeof BEST_ENDEAVOURS)[number];

/// FR-EOT-007: the cause of the financial impact, which picks the route.
export const FINANCIAL_IMPACTS = ["NONE", "AUTHORITY_REQUIREMENT", "OTHER"] as const;
export type FinancialImpact = (typeof FINANCIAL_IMPACTS)[number];

/// FR-EOT-008.
export const CONCURRENCIES = ["CONCURRENT", "CONSECUTIVE"] as const;
export type Concurrency = (typeof CONCURRENCIES)[number];

/// FR-MTD-012, FR-EOT-011: which time instrument a contract type offers (ContractType.eotInstrumentKind).
export type EotInstrumentKind = "EXTENSION_OF_TIME" | "CONTRACT_PERIOD" | "BOTH";

/// The whole works or a section of the baseline (the damages decision's scope, NonCompletionScope).
export type Scope = "WHOLE" | "SECTION";

/// FR-EOT-006 (a)–(e): the five items of the EOT submission pack. CALCULATION: how the proposed period was
/// calculated; EMPLOYER_DELAY: where the employer is responsible, whether the cause is resolved and what is being done;
/// LOSS_EXPENSE: whether the contractor has claimed or will claim loss and expense, and the estimate; PROGRESS: the
/// progress at the certificate's preparation and the balance of work; COMPLETION: whether it can complete by the
/// proposed date and, if not, when.
export const EOT_PACK_ITEMS = ["CALCULATION", "EMPLOYER_DELAY", "LOSS_EXPENSE", "PROGRESS", "COMPLETION"] as const;
export type EotPackItem = (typeof EOT_PACK_ITEMS)[number];

export interface PackAnswer {
  item: EotPackItem;
  /// What it says; with `notRequired`, the reason it is not required.
  text: string;
  notRequired: boolean;
}
