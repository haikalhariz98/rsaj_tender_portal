/**
 * The key ceremony: the key's state, re-keying, publication's sealing faults and the passphrase (ADR 0036 D3, D4, D11, rulings 20g, 20h, 20k; build plan §1.3).
 * Pure.
 */

import type { BidPartRule, SubmissionChannel } from "@/lib/bids/online/types";
import type { Finding } from "@/lib/window/types";

import type { onlineSubmissionAllowed } from "./switch";

// src/lib/sealing/ceremony.ts (D3, D11, 20g, 20h)
export type KeyState = "AWAITING_OFFICERS" | "LIVE";

/**
 * Where the exercise key stands against the live roster. LIVE once a live key exists. `missing`: the live roster rows with no live officer key of their own, in roster
 * order. `stale`: a live key that no longer matches, because its share holders are not exactly the live roster, or a holder's officer key has since been replaced
 * (its share is sealed to a key that is gone). A stale key cannot open (n-of-n), so publication refuses it (D3) and the officers must set their shares again.
 */
export function keyState(i: { liveOfficerRowIds: string[]; officersWithKey: string[]; liveKey: { shareHolderRowIds: string[] } | null }): { state: KeyState; missing: string[]; stale: boolean } {
  const withKey = new Set(i.officersWithKey);
  const missing = i.liveOfficerRowIds.filter((r) => !withKey.has(r));
  if (!i.liveKey) return { state: "AWAITING_OFFICERS", missing, stale: false };
  const holders = new Set(i.liveKey.shareHolderRowIds);
  const roster = new Set(i.liveOfficerRowIds);
  const sameSet = holders.size === roster.size && [...roster].every((r) => holders.has(r)) && i.liveKey.shareHolderRowIds.length === holders.size;
  return { state: "LIVE", missing, stale: !sameSet || missing.length > 0 };
}

export type RekeyFault = "SUBMISSIONS_EXIST" | "AFTER_CLOSING" | "CLOSING_NOT_SET";

/**
 * A re-key (20g, 20p): only while no submission exists, and before the closing. The closing second is still before it: refused when the clock, to the second, is past
 * the closing, as the key trigger judges it (migration 20261103110000). With no closing set, "before the closing" cannot be judged, so it is refused.
 */
export function rekeyFaults(i: { submissions: number; now: Date; closing: Date | null }): ("SUBMISSIONS_EXIST" | "AFTER_CLOSING" | "CLOSING_NOT_SET")[] {
  const out: RekeyFault[] = [];
  if (i.submissions > 0) out.push("SUBMISSIONS_EXIST");
  if (i.closing === null) out.push("CLOSING_NOT_SET");
  else if (Math.floor(i.now.getTime() / 1000) * 1000 > i.closing.getTime()) out.push("AFTER_CLOSING");
  return out;
}

export type PublishSealingFault =
  | "CHANNEL_NOT_SET"
  | "ONLINE_NOT_SET"
  | "ONLINE_NOT_ALLOWED"
  | "KEY_NOT_SET"
  | "KEY_STALE"
  | "RULES_NOT_SET"
  | "PART_TYPES_NOT_SET"
  | "PART_SIZE_NOT_SET"
  | "ALTERNATIVES_NOT_STATED"
  | "PEPPER_NOT_SET";

const positiveInteger = (s: string) => /^[1-9][0-9]*$/.test(s);

/**
 * What publication refuses for sealing (ADR 0036 D1, D3, D7; 20h, 20o, 20v), each its own finding so each is said in its own words. A paper exercise has none.
 * `rules`: the returned parts' rules as they would be frozen, or null when they cannot be built because a returned part's opening check is not set (an unset opening
 * check cannot be written into a rule, whose `openingCheck` is a yes or a no). A rule with no accepted types, or no size, is named by its part's label.
 * `pepperRequired`: the mode being frozen is LIVE.
 */
export function publishSealingFaults(i: { channel: SubmissionChannel | null; online: ReturnType<typeof onlineSubmissionAllowed>; key: ReturnType<typeof keyState>; rules: BidPartRule[] | null; alternativesPermitted: boolean | null; pepperRequired: boolean; pepperConfigured: boolean }): Finding[] {
  const out: Finding<PublishSealingFault>[] = [];
  const f = (code: PublishSealingFault, data?: Finding["data"]) => out.push({ code, level: "block", ...(data ? { data } : {}) });
  if (i.channel === null) {
    f("CHANNEL_NOT_SET");
    return out;
  }
  if (i.channel === "PAPER") return out;
  if (i.online.fault) f(i.online.fault);
  if (i.key.state === "AWAITING_OFFICERS") f("KEY_NOT_SET", { missing: i.key.missing.length });
  else if (i.key.stale) f("KEY_STALE");
  if (i.rules === null) f("RULES_NOT_SET");
  else
    for (const r of i.rules.filter((x) => x.returnedByBidder)) {
      if (r.acceptedMediaTypes.length === 0) f("PART_TYPES_NOT_SET", { label: r.label });
      if (!positiveInteger(r.maxBytes)) f("PART_SIZE_NOT_SET", { label: r.label });
    }
  if (i.alternativesPermitted === null) f("ALTERNATIVES_NOT_STATED");
  if (i.pepperRequired && !i.pepperConfigured) f("PEPPER_NOT_SET");
  return out;
}

/// The codes `publishSealingFaults` can return, for a reader that must tell them from the window's own.
export const SEALING_CODES: ReadonlySet<string> = new Set<PublishSealingFault>(["CHANNEL_NOT_SET", "ONLINE_NOT_SET", "ONLINE_NOT_ALLOWED", "KEY_NOT_SET", "KEY_STALE", "RULES_NOT_SET", "PART_TYPES_NOT_SET", "PART_SIZE_NOT_SET", "ALTERNATIVES_NOT_STATED", "PEPPER_NOT_SET"]);

/// Publication's sealing refusals in words. Never a code.
export function publishSealingWords(fnd: Finding): string {
  const label = String(fnd.data?.label ?? "a returned part");
  switch (fnd.code as PublishSealingFault) {
    // Ruling 20z: why and where, as SALE_MODE_NOT_SET says it. The take act is step 8's, beside the sale mode's.
    case "CHANNEL_NOT_SET":
      return "How bids are submitted on this exercise (on paper, or online and sealed) is not set, because the organisation had not set it when the exercise was made. Take the organisation's setting under Notice and fee on Scope and estimate; if it is not set either, two people set it under Configuration, Invitation.";
    case "ONLINE_NOT_SET":
      return "Online submission of bids is not set for the organisation, so an online exercise cannot be published.";
    case "ONLINE_NOT_ALLOWED":
      return "This copy of the system does not allow online bids in the organisation's mode, so an online exercise cannot be published.";
    case "KEY_NOT_SET": {
      const n = Number(fnd.data?.missing ?? 0);
      if (n === 0) return "The key has not been made yet: it is made when at least two opening officers are named and each has set their share. Name the officers and have each set a share under Opening officers on Scope and estimate.";
      return `The opening officers have not all set their shares of the key, so bids could not be sealed. ${n === 1 ? "One officer has" : `${n} officers have`} still to set one. Every named officer is needed to open the bids.`;
    }
    case "KEY_STALE":
      return "The key no longer matches the opening officers named, so it could not open the bids. Each named officer must set their share again.";
    case "RULES_NOT_SET":
      return "A part the bidder returns has no opening check set, so the rules for uploading bids cannot be frozen. Set it under Configuration, Tender documents.";
    case "PART_TYPES_NOT_SET":
      return `The file types a bidder may upload for ${label} are not set (Configuration, Tender documents).`;
    case "PART_SIZE_NOT_SET":
      return `The largest file a bidder may upload for ${label} is not set (Configuration, Tender documents).`;
    case "ALTERNATIVES_NOT_STATED":
      return "Whether alternative bids are permitted is not stated, so suppliers could not be told whether an alternative will be considered.";
    case "PEPPER_NOT_SET":
      return "The deployment's sealing pepper is not configured, and a live exercise cannot be sealed without it.";
    default:
      return "Publication is refused for sealing.";
  }
}

export type PassphraseFault = "MIN_LENGTH_NOT_SET" | "TOO_SHORT" | "NOT_REPEATED" | "SAME_AS_SIGN_IN";

/**
 * An officer's unseal passphrase (D4): at least the organisation's minimum (unset refuses; the database floor is 12), typed twice the same, and not the sign-in
 * password. Counted in characters, and compared, in Unicode normal form C, as the key derivation reads it (`kdf.ts`).
 */
export function passphraseFaults(p: string, repeat: string, minLength: number | null, equalsSignInPassword: boolean): ("MIN_LENGTH_NOT_SET" | "TOO_SHORT" | "NOT_REPEATED" | "SAME_AS_SIGN_IN")[] {
  const out: PassphraseFault[] = [];
  const nfc = p.normalize("NFC");
  if (minLength === null) out.push("MIN_LENGTH_NOT_SET");
  else if ([...nfc].length < minLength) out.push("TOO_SHORT");
  if (nfc !== repeat.normalize("NFC")) out.push("NOT_REPEATED");
  if (equalsSignInPassword) out.push("SAME_AS_SIGN_IN");
  return out;
}

export const PASSPHRASE_WORDS: Readonly<Record<PassphraseFault, string>> = {
  MIN_LENGTH_NOT_SET: "The shortest unseal passphrase is not set for the organisation, so no share can be set yet.",
  TOO_SHORT: "The passphrase is shorter than the organisation's minimum.",
  NOT_REPEATED: "The two passphrases typed are not the same.",
  SAME_AS_SIGN_IN: "The unseal passphrase must not be your sign-in password: a sign-in password can be reset by others, and this passphrase never can.",
};
