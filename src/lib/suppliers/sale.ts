/**
 * The register's checks at a document sale (FR-ADV-010, SK002 7.5.1 (c)), for 6.5's `recordSale`. A
 * party linked to the register is checked from it: registered, not cancelled, not suspended (by hand or
 * on lapse), not blacklisted; anything barring refuses the sale, naming it. A party not linked keeps 6.5's
 * "not checked", unless the policy requires the register for a sale (OD-5 `registerRequiredForSale`): true
 * refuses, naming the link to make; not set says the rule is not set; false notes it. Pure.
 */

import type { Standing } from "./standing";
import { barred } from "./standing";
import type { Finding } from "./types";

export type CheckState = "NOT_CHECKED" | "CLEAR" | "FAILED";

export type SaleFault = "SALE_NOT_REGISTERED" | "BARRED" | "NOT_LINKED_REGISTER_REQUIRED" | "REGISTER_RULE_NOT_SET" | "NOT_LINKED" | "LAPSE_RULE_NOT_SET";

export interface SaleCheck {
  registrationCheck: CheckState;
  suspensionCheck: CheckState;
  findings: Finding<SaleFault>[];
}

export function saleStandingCheck(
  supplier: { status: string; standing: Standing; lapseRuleNotSet: boolean } | null,
  policy: { registerRequiredForSale: boolean | null },
): SaleCheck {
  if (!supplier) {
    if (policy.registerRequiredForSale === true) return { registrationCheck: "FAILED", suspensionCheck: "NOT_CHECKED", findings: [{ code: "NOT_LINKED_REGISTER_REQUIRED", level: "block" }] };
    return { registrationCheck: "NOT_CHECKED", suspensionCheck: "NOT_CHECKED", findings: [{ code: policy.registerRequiredForSale == null ? "REGISTER_RULE_NOT_SET" : "NOT_LINKED", level: "warn" }] };
  }
  const findings: Finding<SaleFault>[] = [];
  const registered = supplier.status === "REGISTERED";
  if (!registered) findings.push({ code: "SALE_NOT_REGISTERED", level: "block" });
  const isBarred = registered && barred(supplier.standing);
  if (isBarred) findings.push({ code: "BARRED", level: "block", data: { standing: supplier.standing } });
  if (registered && !isBarred && supplier.lapseRuleNotSet) findings.push({ code: "LAPSE_RULE_NOT_SET", level: "warn" });
  return { registrationCheck: registered ? "CLEAR" : "FAILED", suspensionCheck: !registered ? "NOT_CHECKED" : isBarred ? "FAILED" : "CLEAR", findings };
}
