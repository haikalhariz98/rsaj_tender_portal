/**
 * Setting a share and changing the key: who may, and when, and the pepper a share is wrapped with (ADR 0036 D3, D4, D11; rulings 20d, 20g, 20p, 20v). Pure.
 */

import type { OnlineSubmissionMode, SubmissionChannel } from "@/lib/bids/online/types";
import type { ExerciseStatus } from "@/lib/method/types";

import { rekeyFaults, type RekeyFault } from "./ceremony";

export type ShareFault = "NOT_ONLINE" | "EXERCISE_CANCELLED" | "NOT_NAMED_OFFICER" | "AFTER_CLOSING" | "NEW_OFFICER_AFTER_PUBLICATION" | "SUBMISSIONS_EXIST";

/**
 * Whether the signed-in person may set their share now. Only a named, live opening officer of an ONLINE exercise, not cancelled, before the closing. After publication only an
 * officer who already has a share may set a new one (a re-key under their new passphrase, judged as `rekeyFaults` judges it: no submission); an officer named after
 * publication sets their share only as the incoming officer of a substitution that is waiting (`substitutionIncoming`), and is refused here otherwise.
 */
export function shareFaults(i: { channel: SubmissionChannel | null; status: ExerciseStatus; namedOfficer: boolean; now: Date; closing: Date | null; published: boolean; hasLiveShare: boolean; submissions: number; /** The officer was named in place of another and that officer's share has still to be released to them (a substitution waiting). */ substitutionIncoming?: boolean }): ShareFault[] {
  if (i.channel !== "ONLINE") return ["NOT_ONLINE"];
  if (i.status === "CANCELLED") return ["EXERCISE_CANCELLED"];
  if (!i.namedOfficer) return ["NOT_NAMED_OFFICER"];
  if (i.closing !== null && Math.floor(i.now.getTime() / 1000) * 1000 > i.closing.getTime()) return ["AFTER_CLOSING"];
  if (!i.published) return [];
  // A substitution waiting (wave 3b step 17, ADR 0036 D11): the incoming officer sets their own key. That is not a re-key, so bids already submitted stay openable.
  if (!i.hasLiveShare) return i.substitutionIncoming ? [] : ["NEW_OFFICER_AFTER_PUBLICATION"];
  return i.submissions > 0 ? ["SUBMISSIONS_EXIST"] : [];
}

export const SHARE_WORDS: Readonly<Record<ShareFault, string>> = {
  NOT_ONLINE: "This exercise does not take bids online, so there is no share to set.",
  EXERCISE_CANCELLED: "This exercise is cancelled, so no share can be set.",
  NOT_NAMED_OFFICER: "Only an opening officer named on this exercise sets their own share. Nobody sets it for them.",
  AFTER_CLOSING: "The closing has passed, so no share can be set. After the closing a lost share means the exercise is re-tendered.",
  NEW_OFFICER_AFTER_PUBLICATION: "This officer was named after the exercise was published, and no substitution is waiting for them. An officer of a published online exercise is replaced by a controlled change that names the officer to be replaced, and only then does the incoming officer set their share.",
  SUBMISSIONS_EXIST: "Bids have already been submitted under the published key, so a new share would make them unopenable. After a bid is submitted a forgotten passphrase means the exercise is re-tendered.",
};

export type RekeyRefusal = RekeyFault | "NOT_PUBLISHED" | "NOT_ONLINE" | "NO_LIVE_KEY" | "NOT_NAMED_OFFICER" | "REASON_REQUIRED" | "FEWER_THAN_TWO_OFFICERS" | "EXERCISE_CANCELLED" | "KEY_STALE";

export const REKEY_WORDS: Readonly<Record<RekeyRefusal, string>> = {
  SUBMISSIONS_EXIST: "A bid has been submitted under the current key, so the key cannot be changed: every sealed bid would become unopenable. The exercise would have to be re-tendered.",
  AFTER_CLOSING: "The closing has passed, so the key cannot be changed. After the closing a lost share means the exercise is re-tendered.",
  CLOSING_NOT_SET: "The closing is not set, so it cannot be judged whether the key may still change.",
  NOT_ONLINE: "This exercise does not take bids online, so there is no key to change.",
  NOT_PUBLISHED: "This exercise is not published, so no key is frozen yet. If a share was lost, the officer sets their share again and the key is made again.",
  NO_LIVE_KEY: "There is no key to change yet: it is made when every named opening officer has set their share.",
  NOT_NAMED_OFFICER: "Only an opening officer named on this exercise may change its key.",
  REASON_REQUIRED: "Say why the key is being changed. The reason is kept with the change.",
  FEWER_THAN_TWO_OFFICERS: "A key is split across at least two opening officers, and fewer are named.",
  EXERCISE_CANCELLED: "This exercise is cancelled, so its key cannot be changed.",
  KEY_STALE: "The key no longer matches the officers named. Each named officer must set their share again before the key is changed.",
};

/**
 * Whether the key of a published exercise may be changed now (rulings 20g, 20p). Only a named opening officer, with a reason, on a published online exercise that has a
 * current key matching the officers named, before the closing and while no bid exists. Early refusals stand alone; the rest are listed together.
 */
export function rekeyRefusals(i: { channel: SubmissionChannel | null; status: ExerciseStatus; published: boolean; namedOfficer: boolean; reason: string; hasLiveKey: boolean; officers: number; stale: boolean; submissions: number; now: Date; closing: Date | null }): RekeyRefusal[] {
  if (i.channel !== "ONLINE") return ["NOT_ONLINE"];
  if (i.status === "CANCELLED") return ["EXERCISE_CANCELLED"];
  if (!i.namedOfficer) return ["NOT_NAMED_OFFICER"];
  const out: RekeyRefusal[] = [];
  if (!i.published) out.push("NOT_PUBLISHED");
  if (i.reason.trim() === "") out.push("REASON_REQUIRED");
  if (!i.hasLiveKey) out.push("NO_LIVE_KEY");
  else if (i.officers < 2) out.push("FEWER_THAN_TWO_OFFICERS");
  else if (i.stale) out.push("KEY_STALE");
  out.push(...rekeyFaults({ submissions: i.submissions, now: i.now, closing: i.closing }));
  return out;
}

/**
 * The pepper a share is wrapped with (D4, ruling 20v). Required unless the organisation's mode is DEMONSTRATION: before publication the exercise has no frozen mode for the
 * database to judge by, so an officer key made without it would block the LIVE freeze later. An invalid configured pepper is never set aside. DEMONSTRATION wraps with the
 * pepper where one is held, and without where none is.
 */
export function pepperForWrapFault(mode: OnlineSubmissionMode | null, reading: "NOT_SET" | "SET" | "INVALID"): "PEPPER_NOT_SET" | "PEPPER_INVALID" | null {
  if (reading === "INVALID") return "PEPPER_INVALID";
  if (reading === "SET") return null;
  return mode === "DEMONSTRATION" ? null : "PEPPER_NOT_SET";
}

export const PEPPER_WRAP_WORDS: Readonly<Record<"PEPPER_NOT_SET" | "PEPPER_INVALID", string>> = {
  PEPPER_NOT_SET: "The deployment's sealing pepper is not configured, and a share for a live exercise cannot be set without it. Whoever runs the system must configure it first (the file .env.example says how).",
  PEPPER_INVALID: "The deployment's sealing pepper is configured wrongly, so no share can be set. Whoever runs the system must correct it first (the file .env.example says how).",
};

/// Publication freezing LIVE while an officer's share was set without the pepper (the database refuses it, trigger 9): said in words, with the way out.
export const SHARE_WITHOUT_PEPPER_WORDS =
  "An opening officer's share was set without the deployment's sealing pepper, so this exercise cannot be published as a live one. The deployment's pepper must be configured, and each officer must set their share again.";
