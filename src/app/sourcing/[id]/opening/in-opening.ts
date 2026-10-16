import type { FormState } from "@/components/record-editor";
import type { Tx } from "@/lib/audit/record";
import { sulitWriteRefusal, type Reader } from "@/lib/auth/sulit-store";
import type { StaffActor } from "@/lib/auth/types";
import { lockBoxRows, lockEnvelopeRows, lockWithdrawalRows } from "@/lib/bids/lock";
import { toSecond } from "@/lib/bids/lateness";
import { lockLiveEstimateRows } from "@/lib/scope/lock";
import { openingFindingText } from "@/lib/opening/labels";
import { lockOpenedBidRows, lockOpeningRows } from "@/lib/opening/lock";
import { openingContext, type OpeningContext } from "@/lib/opening/repo";
import { blocking, type Finding } from "@/lib/opening/types";

import { inWindow, type LockedWindow } from "../window/shared";

/**
 * The frame every write at an opening runs in (plan 6.7 section 4): the locks in their order, then the context read under them. Shared by the paper acts (`actions.ts`) and the online unseal
 * (`unseal-actions.ts`), so they cannot lock in different orders. Not a server action file, so these are plain exports.
 */

export const stampNow = () => toSecond(new Date());

export const refuse = (fs: readonly Finding[], lead = "Nothing was saved:"): FormState => ({ ok: false, message: `${lead} ${blocking(fs).map(openingFindingText).join(" ")}` });
export const warnings = (fs: readonly Finding[]) => fs.filter((f) => f.level !== "block").map(openingFindingText).join(" ");
export const GONE_OPENING: FormState = { ok: false, message: "That opening is not on this exercise." };
export const GONE_BID: FormState = { ok: false, message: "That offer is not on this exercise." };
export const ENVELOPE_CHANGED: FormState = { ok: false, message: "The envelope changed while this was being saved. Nothing was saved. Reload and try again." };

/// Run an opening write with every lock its order asks for, and the context read under them.
export async function inOpening(scope: Reader, exerciseId: string, now: Date, fn: (tx: Tx, l: LockedWindow, c: OpeningContext) => Promise<FormState>, opts: { estimate?: boolean; prices?: StaffActor } = {}): Promise<FormState> {
  return inWindow(scope, exerciseId, async (tx, l) => {
    // Phase 3b: an act that writes a price as read is done by someone the prices are open to; what they may not read they may not change, and are told why. Logged in this transaction.
    if (opts.prices) {
      const refusal = await sulitWriteRefusal(tx, opts.prices, { scope: "exercise", exerciseId: l.ex.id }, ["openingPrice", "correctedPrice"]);
      if (refusal) return { ok: false, message: `Nothing was saved: the prices read at the opening are SULIT and are closed to you. ${refusal}` };
    }
    await lockOpeningRows(tx, l.ex.id);
    if (opts.estimate) await lockLiveEstimateRows(tx, l.ex.id);
    await lockEnvelopeRows(tx, l.ex.id);
    await lockWithdrawalRows(tx, l.ex.id);
    await lockBoxRows(tx, l.ex.id);
    await lockOpenedBidRows(tx, l.ex.id);
    return fn(tx, l, await openingContext(l, tx, now));
  });
}
