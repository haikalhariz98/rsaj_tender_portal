import type { SupplierConfirmOutcome } from "@/lib/auth/supplier-identity";
import { ACT_ROUTE_WORDS, type ActRouteNotice } from "@/lib/bids/online/words";
import type { SubmitFault, WithdrawFault } from "@/lib/bids/online/types";

import { reply } from "./reply";

/**
 * How the submit and withdraw routes answer (step 10): one shape, in English and Malay, never a code in words. `code` is a stable name for the page\'s logic and is never printed.
 */

export const actNotice = (code: ActRouteNotice, status: number, headers: Record<string, string> = {}) => reply({ ok: false, code, message: ACT_ROUTE_WORDS[code].en }, status, headers);

/// A body that did not parse: 400, with the names of the fields that were wrong and never what was in them.
export const actInvalid = (fields: string[]) => reply({ ok: false, code: "VALIDATION", message: ACT_ROUTE_WORDS.UNREADABLE.en, fields }, 400);

/// The password asked again, as the portal answers it, or null when it was right.
export function passwordNotice(asked: SupplierConfirmOutcome): Response | null {
  if (asked.ok) return null;
  if (asked.kind === "LOCKED") return actNotice("LOCKED", 403);
  if (asked.kind === "THROTTLED") return actNotice("THROTTLED", 429);
  if (asked.kind === "POLICY_NOT_SET") return actNotice("ACT_CLOSED", 503);
  return actNotice("WRONG_PASSWORD", 403);
}

const CONFLICTS: readonly string[] = ["STAMP_STALE", "NOT_TAKEN", "LIVE_BID_HELD"];

/// The faults the rules refused with, first one as the message and all of them listed. A stale stamp, a rival and a refusal at the commit are 409; the rest are 422.
export function faultsReply<F extends SubmitFault | WithdrawFault>(faults: readonly F[], words: Readonly<Record<F, { en: string;  }>>) {
  const first = words[faults[0]];
  return reply(
    { ok: false, code: faults[0], message: first.en, faults: faults.map((f) => ({ message: words[f].en })) },
    CONFLICTS.includes(faults[0]) ? 409 : 422,
  );
}
