/**
 * How the tender documents are sold on an exercise (Sourcing Requirements v2, SR-10, ruling 16, G1). Pure.
 *
 * Two modes. COUNTER: a supplier asks online, an officer sells at the counter and records the finance receipt, and the notice states where and
 * when the documents are inspected and bought and how the fee is paid. ONLINE: a supplier buys through the portal, so those physical particulars
 * mean nothing and are neither asked for nor required.
 *
 * Whether a customer sells online is that customer's policy (`WindowPolicy.documentSaleMode`, two-person path, ships unset). An exercise takes
 * the organisation's setting when it is created and is never read against the setting again (G1), so changing the setting never rewrites the gates
 * of an exercise in flight. Created while the setting was unset, it pins "not set": creating is never refused, and publication refuses in words until
 * the officer takes the organisation's setting (`takeSaleModeFaults`), allowed only before the exercise is published.
 */

import type { ExerciseStatus } from "@/lib/method/types";

import type { Finding } from "./types";

export const SALE_MODES = ["COUNTER", "ONLINE"] as const;
export type SaleMode = (typeof SALE_MODES)[number];

export const SALE_MODE_LABEL: Readonly<Record<SaleMode, string>> = {
  COUNTER: "At the counter",
  ONLINE: "Online, through the supplier portal",
};

/// "At the counter", "Online, through the supplier portal" or "Not set", for a pin or a setting.
export const saleModeWords = (m: SaleMode | null): string => (m == null ? "Not set" : SALE_MODE_LABEL[m]);

/// What a new exercise pins: the organisation's setting as it is now, set or not.
export const pinSaleMode = (setting: SaleMode | null): SaleMode | null => setting;

/// The notice's items an online sale does not have (SR-10): where the documents are inspected and bought, the hours, where tenders are submitted, and how the fee is paid.
export const PHYSICAL_ITEM_CODES: ReadonlySet<string> = new Set<string>(["INSPECTION_PLACE_MISSING", "PURCHASE_PLACE_MISSING", "INSPECTION_HOURS_MISSING", "SUBMISSION_PLACE_MISSING", "PAYMENT_METHODS_MISSING"]);

/// The merge fields for those items (`window.*`), retired for an online exercise.
export const PHYSICAL_MERGE_KEYS: ReadonlySet<string> = new Set<string>(["window.inspectionPlace", "window.purchasePlace", "window.inspectionHours", "window.submissionPlace", "window.feePaymentMethods"]);

/// The merge field that states how to buy the documents online. It exists only for an online exercise.
export const HOW_TO_BUY_KEY = "window.howToBuy";

/// Whether the physical items (places, hours, how the fee is paid) are asked for: not for an exercise sold online.
export const physicalItemsApply = (mode: SaleMode | null): boolean => mode !== "ONLINE";

export type SaleModeFault = "SALE_MODE_NOT_SET";

/// Publication (and the notice's submission gate) refuses while the exercise's pin is not set, naming it.
export function saleModeFault(pin: SaleMode | null): Finding<SaleModeFault> | null {
  return pin == null ? { code: "SALE_MODE_NOT_SET", level: "block" } : null;
}

export type TakeSaleModeFault = "EXERCISE_CANCELLED" | "ALREADY_PUBLISHED" | "NOTHING_TO_TAKE" | "SETTING_NOT_SET";

/**
 * Whether the exercise may take the organisation's setting now. Allowed only while the pin is not set and before the exercise is published, and only when the setting
 * is set: it copies the configured value and is not a free choice. A pin that is set is never changed.
 */
export function takeSaleModeFaults(i: { status: ExerciseStatus; published: boolean; pin: SaleMode | null; setting: SaleMode | null }): Finding<TakeSaleModeFault>[] {
  if (i.status === "CANCELLED") return [{ code: "EXERCISE_CANCELLED", level: "block" }];
  if (i.published) return [{ code: "ALREADY_PUBLISHED", level: "block" }];
  if (i.pin != null) return [{ code: "NOTHING_TO_TAKE", level: "block" }];
  if (i.setting == null) return [{ code: "SETTING_NOT_SET", level: "block" }];
  return [];
}

/// The online payment the organisation has switched on: the simulator today, a provider later. Both a switch and at least one method are needed.
export interface OnlinePaymentFacts {
  simulatorOn: boolean | null;
  methods: readonly string[];
}

export const onlinePaymentAvailable = (f: OnlinePaymentFacts): boolean => f.simulatorOn === true && f.methods.length > 0;

/**
 * The notice's statement of how to buy an online exercise's documents. It promises online payment only where it is switched on: with the simulator
 * (or, later, a provider) off, it says the office records the payment and releases the documents, so a notice never promises what the portal cannot do.
 */
export function howToBuyText(f: OnlinePaymentFacts): string {
  return onlinePaymentAvailable(f)
    ? "Buy the documents online through the supplier portal and pay there. They are released to you once the payment is made."
    : "Ask for the documents online through the supplier portal. Online payment is not available: the procurement office records your payment, and then releases the documents to you.";
}
