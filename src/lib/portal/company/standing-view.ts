/**
 * A supplier's standing, said to the supplier (Phase 4c; the Company page's "current standing: active, suspended or blacklisted, and what that means for eligibility"). Pure. The standing is
 * derived (`standing`, never stored); this words it for the person it is about: since when, the reason as the organisation's own maintained list names it, and what it means: a barred
 * supplier is not eligible for an exercise (the eligibility view says so condition by condition).
 */

import { blacklistEndPhrase, cancellationWords, standingTone, standingWords } from "@/lib/suppliers/labels";
import { barred, type StandingReading } from "@/lib/suppliers/standing";

export interface StandingView {
  /// "Active", "Suspended", "Blacklisted"...
  title: string;
  tone: "ok" | "warn" | "err" | "info" | "neutral";
  /// What stands behind it, a line each: since when and why, and when it ends where it does.
  lines: string[];
  /// What it means for taking part.
  meaning: string;
}

export function standingView(r: Pick<StandingReading, "standing" | "notes" | "blacklist" | "suspension" | "cancellation" | "lapsed">, day: (d: string) => string): StandingView {
  const words = standingWords(r);
  const tone = standingTone(r);
  const lines: string[] = [];
  if (r.blacklist) lines.push(`Blacklisted since ${day(r.blacklist.effectiveOn)}${r.blacklist.reasonLabel ? ` (${r.blacklist.reasonLabel})` : ""}. ${blacklistEndPhrase(r.blacklist.endsOn).en}.`);
  if (r.cancellation) lines.push(`Registration cancelled since ${day(r.cancellation.effectiveOn)}${r.cancellation.cancelledBy ? ` (${cancellationWords(r.cancellation.cancelledBy).en})` : ""}.`);
  if (r.suspension) lines.push(`Suspended since ${day(r.suspension.effectiveOn)}${r.suspension.reasonLabel ? ` (${r.suspension.reasonLabel})` : ""}.`);
  if (r.standing === "SUSPENDED_ON_LAPSE") lines.push(`Suspended because ${r.lapsed.join(", ") || "a document the office requires"} expired. Send a current one to be lifted.`);
  if (r.standing === "ACTIVE" && r.lapsed.length > 0) lines.push(`${r.lapsed.join(", ")} has expired. Send a current copy.`);
  for (const n of r.notes) {
    if (n.code === "BLACKLIST_ENDED") lines.push(`A blacklisting ended: the last day was ${day(String(n.data?.lastDay))}.`);
    else if (n.code === "SCHEDULED") lines.push(`A change to your standing takes effect on ${day(String(n.data?.effectiveOn))}.`);
  }
  return {
    title: words.en,
    tone,
    lines,
    meaning: barred(r.standing)
      ? "While this stands you are not eligible for an exercise. The eligibility view says so, and why."
      : r.standing === "NOT_REGISTERED"
        ? "You are not on the supplier register yet, so you are not eligible for an exercise."
        : "Nothing about your standing stops you taking part.",
  };
}
