/**
 * The finance system's vendor master (INT-03), behind a façade. The finance system mints the vendor
 * code; the portal consumes it and never mints one, and never builds against one ERP's schema
 * (AGENTS.md). Until an adapter exists the only one is manual: an officer types the code the finance
 * system returned. A supplier approved on the register with no code is the reconciliation exception
 * ("approved, not in the finance system"), listed on the register (D5).
 */

import { matchesFormat } from "./award-commitment";

export type VendorCodeFault = "CODE_REQUIRED" | "FORMAT" | "TAKEN" | "NOT_REGISTERED";

export interface VendorMasterGateway {
  /// Where an adapter exists, ask the finance system to create or update the vendor. Manual: nothing to ask.
  requestVendor(supplierReference: string): Promise<void>;
  /// Check a code as it is recorded.
  check(code: string, ctx: { pattern: string | null; taken: boolean; registered: boolean }): VendorCodeFault[];
}

export const manualVendorMaster: VendorMasterGateway = {
  async requestVendor() {
    // Manual: the officer creates the vendor in the finance system and records its code here.
  },
  check(code, ctx) {
    const out: VendorCodeFault[] = [];
    if (!ctx.registered) out.push("NOT_REGISTERED");
    if (!code.trim()) out.push("CODE_REQUIRED");
    else if (matchesFormat(code.trim(), ctx.pattern) === false) out.push("FORMAT");
    if (ctx.taken) out.push("TAKEN");
    return out;
  },
};

/// The CodeFormat key a vendor code is checked against, where the organisation sets one. Unset: not checked.
export const VENDOR_CODE_FORMAT_KEY = "erp_vendor_code";
