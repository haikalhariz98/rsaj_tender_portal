/**
 * The certificate of making good defects and the final certificate route to the contract's S.O., not a fixed post (FR-CMP-016, FR-FIN-010;
 * OD-B10 A, BD-613-78 as ruled; plan closeout-plan.md §4.4). Pure.
 *
 * Only the approving step is compared: a proposing or recommending step held by another office passes. An S.O. that does not resolve on the
 * day refuses (never passes). Only `making_good` and `final_payment` are checked; every other domain's route is not.
 */

import type { Finding } from "./types";

export const SO_ROUTED_DOMAINS: readonly string[] = ["making_good", "final_payment"];

export function soRouteFaults(domain: string, approverCode: string | null, so: { roleCode: string; label: string } | null): Finding[] {
  if (!SO_ROUTED_DOMAINS.includes(domain)) return [];
  if (!so) return [{ code: "SO_UNRESOLVED", level: "block" }];
  if (approverCode !== so.roleCode) return [{ code: "SO_ROUTE_MISMATCH", level: "block", data: { so: so.label } }];
  return [];
}
