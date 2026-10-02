/**
 * The awardee's standing on the supplier register, as an award shows it (6.15a fix S-3, against accepted
 * 6.11; BD-615-17 sent back). An award is linked to the register through its awardee party (or on its own,
 * where it has none, OD-9). Its supplier's standing is derived as everywhere (never stored) and shown on
 * the award's record, its form and beside its route's steps. Where the supplier is barred (blacklisted,
 * registration cancelled, suspended, suspended on lapse) the award warns, naming the standing and since
 * when, and says plainly that the product does not refuse it: whether a barred supplier may be awarded
 * is a customer policy question with no rule set (carry 615-C5). Never a refusal. Pure.
 */

import { blacklistEndPhrase, standingTone, standingWords, type Words } from "./labels";
import { barred, type StandingReading } from "./standing";

export interface AwardStanding {
  /// The standing in words, as the register says it.
  words: Words;
  tone: "ok" | "warn" | "err" | "info" | "neutral";
  /// Where the supplier is barred: the warning, naming the standing. Null otherwise.
  warning: Words | null;
}

const w = (en: string, ms: string): Words => ({ en, ms });
const NOT_REFUSED = w("an award is not refused by the product: rule not set", "anugerah tidak ditolak oleh sistem: peraturan belum ditetapkan");

export function awardStanding(r: Pick<StandingReading, "standing" | "notes" | "blacklist" | "suspension" | "cancellation" | "lapsed">, day: (d: string) => string): AwardStanding {
  const words = standingWords(r);
  const tone = standingTone(r);
  // Active (also "Active — lapse rule not set", OD-7) or not registered: said as the register says it, not a bar.
  if (!barred(r.standing)) return { words, tone, warning: null };
  let what: Words;
  if (r.standing === "BLACKLISTED" && r.blacklist) {
    const end = blacklistEndPhrase(r.blacklist.endsOn);
    what = w(`Blacklisted since ${day(r.blacklist.effectiveOn)} (${r.blacklist.reasonLabel}; ${end.en})`, `Disenarai hitam sejak ${day(r.blacklist.effectiveOn)} (${r.blacklist.reasonLabel}; ${end.ms})`);
  } else if (r.standing === "CANCELLED" && r.cancellation) {
    what = w(`Registration cancelled since ${day(r.cancellation.effectiveOn)}`, `Pendaftaran dibatalkan sejak ${day(r.cancellation.effectiveOn)}`);
  } else if (r.standing === "SUSPENDED" && r.suspension) {
    what = w(`Suspended since ${day(r.suspension.effectiveOn)} (${r.suspension.reasonLabel})`, `Digantung sejak ${day(r.suspension.effectiveOn)} (${r.suspension.reasonLabel})`);
  } else {
    what = w(`Suspended on lapse: ${r.lapsed.join(", ") || "a mandatory document"} expired`, `Digantung kerana luput: ${r.lapsed.join(", ") || "dokumen wajib"} tamat tempoh`);
  }
  return { words, tone, warning: w(`${what.en} — ${NOT_REFUSED.en}.`, `${what.ms} — ${NOT_REFUSED.ms}.`) };
}
