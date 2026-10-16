/**
 * The online sealed-bid demonstration (wave 3b step 18; rulings 12c, 12d, 20z). Pure: what the demo loader decides and says, so it is tested without a database.
 *
 * The loader sets the organisation's channel to ONLINE only where the product's own rule (`channelSettingFaults`) allows it, and only where the pieces the online acts
 * stand on are there. Where one is missing it falls back to PAPER and says, in words, what is missing. It never leaves the online exercise half made, and it never reads an
 * unset setting as PAPER.
 */

/// What the loader found when it asked whether the online demonstration can be made.
export interface OnlineDemoFacts {
  /// `channelSettingFaults("ONLINE", ...)` for the mode the demo sets: non-empty where the deployment does not allow demonstration bids.
  channelFaults: readonly string[];
  /// The document store the sealed files are kept in is set up.
  blobStoreReady: boolean;
  /// `pepperForWrapFault(...)`: the deployment's pepper is configured wrongly.
  pepperFault: string | null;
}

export type OnlineDemoDecision = { online: true } | { online: false; reasons: string[] };

export const NEEDS_FLAG_WORDS = "The online demonstration needs the deployment to allow demonstration bids: set SEALED_BIDS_DEMONSTRATION_ALLOWED to true in the deployment settings (the file .env.example says how), then load the demonstration into a new database.";
export const NEEDS_STORE_WORDS = "The online demonstration needs the document store to be set up, because sealed bid files are kept in it.";
export const NEEDS_PEPPER_WORDS = "The online demonstration needs the deployment's sealing pepper to be configured correctly, or left unset: it is set wrongly.";

/// Whether the demonstration can be made online. Every reason it cannot is listed.
export function onlineDemoDecision(f: OnlineDemoFacts): OnlineDemoDecision {
  const reasons: string[] = [];
  if (f.channelFaults.length > 0) reasons.push(NEEDS_FLAG_WORDS);
  if (!f.blobStoreReady) reasons.push(NEEDS_STORE_WORDS);
  if (f.pepperFault) reasons.push(NEEDS_PEPPER_WORDS);
  return reasons.length === 0 ? { online: true } : { online: false, reasons };
}

/// The settings an online exercise stands on, as the database holds them. `null` is "not set": never read as off or as paper.
export interface OnlineSettingsFacts {
  documentSaleMode: "COUNTER" | "ONLINE" | null;
  submissionChannel: "PAPER" | "ONLINE" | null;
  onlineSubmission: "DEMONSTRATION" | "LIVE" | null;
  sealingPassphraseMinLength: number | null;
  onlineBidFileClassSet: boolean;
}

/// What a re-run says of the settings that are not set, in words, so whoever owns the organisation can set them through Configuration (two people, ruling G2). Nothing is written.
export function unsetOnlineSettings(s: OnlineSettingsFacts): string[] {
  const out: string[] = [];
  if (s.documentSaleMode === null) out.push("How the documents are sold (Configuration, Invitation controls) is not set.");
  if (s.submissionChannel === null) out.push("How bids are submitted (Configuration, Invitation controls) is not set, and publication refuses an exercise made while it is unset.");
  if (s.onlineSubmission === null) out.push("Online bid submission (Configuration, Bid sealing) is not set.");
  if (s.sealingPassphraseMinLength === null) out.push("The shortest passphrase an opening officer may set (Configuration, Sign-in settings) is not set, so no officer can set a share.");
  if (!s.onlineBidFileClassSet) out.push("The document class online bid files are filed under (Configuration, Documents) is not set, so an opening cannot finalise.");
  return out;
}

/// The passphrases the demonstration's opening officers set on the online exercise, in the order the officers are named, printed in the demonstration guide. Invented: a
/// demonstration passphrase protects nothing real. Each is at least 12 characters, as the policy's minimum is, and none is the demonstration's sign-in password.
export const DEMO_UNSEAL_PASSPHRASES: readonly string[] = ["demo unseal passphrase one, 2026", "demo unseal passphrase two, 2026", "demo unseal passphrase three, 2026", "demo unseal passphrase four, 2026"];

/// The clock time a closing takes so that it falls `minutes` after `from`, to the minute, in the organisation's zone: "HH:MM", and the day it falls on ("YYYY-MM-DD").
export function closingAfter(from: Date, minutes: number, timeZone: string): { instant: Date; day: string; time: string } {
  const instant = new Date(Math.ceil((from.getTime() + minutes * 60_000) / 60_000) * 60_000);
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(instant);
  const get = (t: string) => parts.find((p) => p.type === t)!.value;
  return { instant, day: `${get("year")}-${get("month")}-${get("day")}`, time: `${get("hour")}:${get("minute")}` };
}
