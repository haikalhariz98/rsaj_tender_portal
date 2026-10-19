/**
 * The online submission switch, the conditions for LIVE and the channel setting (ADR 0036 D1, rulings 20i, 20o, 20v; build plan §1.3). Pure.
 *
 * Three readings of who allows what:
 *  - the organisation's switch (`BidSealingPolicy.onlineSubmission`: unset, DEMONSTRATION or LIVE), customer policy on the two-person path;
 *  - the deployment's two flags (`SEALED_BIDS_DEMONSTRATION_ALLOWED`, `SEALED_BIDS_LIVE_ALLOWED`), read live, the deployment's guard;
 *  - the exercise's own mode, frozen at publication (20i).
 * PUBLISH judges the organisation's mode against both flags. SUBMIT judges the exercise's frozen mode: a demonstration still needs the deployment's permission (read
 * live, as the payment simulator's is), and a LIVE exercise keeps its pin when the LIVE flag is later cleared (20i, G1): that flag gates issuing and publishing only.
 */

import { w, type Words } from "@/lib/contract/labels";
import type { OnlineSubmissionMode, SubmissionChannel } from "@/lib/bids/online/types";
import type { ExerciseStatus } from "@/lib/method/types";
import type { Finding } from "@/lib/window/types";

export type OnlineSubmissionFault = "ONLINE_NOT_SET" | "ONLINE_NOT_ALLOWED";

// src/lib/sealing/switch.ts (D1, 20i, 20o, 20v)
/// `at`: PUBLISH reads the organisation's mode and both deployment flags; SUBMIT reads the exercise's frozen mode, where demoAllowed is read live
/// (20i) and liveAllowed is NOT consulted, so a published LIVE exercise keeps its pin (20i, G1). SEALED_BIDS_LIVE_ALLOWED gates issuing and publishing only.
export function onlineSubmissionAllowed(mode: OnlineSubmissionMode | null, deployment: { demoAllowed: boolean; liveAllowed: boolean }, at: "PUBLISH" | "SUBMIT"): { allowed: boolean; demonstration: boolean; fault: "ONLINE_NOT_SET" | "ONLINE_NOT_ALLOWED" | null } {
  if (mode === null) return { allowed: false, demonstration: false, fault: "ONLINE_NOT_SET" };
  if (mode === "DEMONSTRATION") return deployment.demoAllowed ? { allowed: true, demonstration: true, fault: null } : { allowed: false, demonstration: true, fault: "ONLINE_NOT_ALLOWED" };
  if (at === "SUBMIT" || deployment.liveAllowed) return { allowed: true, demonstration: false, fault: null };
  return { allowed: false, demonstration: false, fault: "ONLINE_NOT_ALLOWED" };
}

export type LiveIssueFault = "REVIEW_NOT_RECORDED" | "AMENDMENT_NOT_RECORDED" | "ACCEPTANCE_NOT_RECORDED" | "SCANNER_NOT_CONFIGURED" | "LIVE_NOT_ALLOWED_BY_DEPLOYMENT" | "PEPPER_NOT_SET" | "PUBLIC_ROLE_NOT_ATTESTED" | "HARDENING_NOT_ATTESTED";

/// Every condition for issuing LIVE that is missing, in one list (threat model §G must-haves 1 to 8). A reference or an attestation of only spaces is missing.
export function liveIssueFaults(p: { cryptoReviewReference: string; procedureAmendmentReference: string; customerAcceptanceReference: string; scannerConfigured: boolean; liveAllowedByDeployment: boolean; pepperConfigured: boolean; publicRoleAttestation: string; deploymentHardeningAttestation: string }):
  ("REVIEW_NOT_RECORDED" | "AMENDMENT_NOT_RECORDED" | "ACCEPTANCE_NOT_RECORDED" | "SCANNER_NOT_CONFIGURED" | "LIVE_NOT_ALLOWED_BY_DEPLOYMENT" | "PEPPER_NOT_SET" | "PUBLIC_ROLE_NOT_ATTESTED" | "HARDENING_NOT_ATTESTED")[] {
  const out: LiveIssueFault[] = [];
  if (!p.cryptoReviewReference.trim()) out.push("REVIEW_NOT_RECORDED");
  if (!p.procedureAmendmentReference.trim()) out.push("AMENDMENT_NOT_RECORDED");
  if (!p.customerAcceptanceReference.trim()) out.push("ACCEPTANCE_NOT_RECORDED");
  if (!p.scannerConfigured) out.push("SCANNER_NOT_CONFIGURED");
  if (!p.liveAllowedByDeployment) out.push("LIVE_NOT_ALLOWED_BY_DEPLOYMENT");
  if (!p.pepperConfigured) out.push("PEPPER_NOT_SET");
  if (!p.publicRoleAttestation.trim()) out.push("PUBLIC_ROLE_NOT_ATTESTED");
  if (!p.deploymentHardeningAttestation.trim()) out.push("HARDENING_NOT_ATTESTED");
  return out;
}

/// Ruling 13 (no block that can never clear): the organisation's channel is not set to ONLINE while online submission is not allowed. `online` is read at PUBLISH.
export function channelSettingFaults(channel: SubmissionChannel | null, online: ReturnType<typeof onlineSubmissionAllowed>): ("ONLINE_NOT_ALLOWED")[] {
  return channel === "ONLINE" && !online.allowed ? ["ONLINE_NOT_ALLOWED"] : [];
}

/// The words for each, as a screen says them. Never a code. The two attestations are deployment facts the portal cannot check (20o, 20v).
export const LIVE_ISSUE_WORDS: Readonly<Record<LiveIssueFault, string>> = {
  REVIEW_NOT_RECORDED: "The outside cryptography review is not recorded.",
  AMENDMENT_NOT_RECORDED: "The amendment of the organisation's bid procedure is not recorded.",
  ACCEPTANCE_NOT_RECORDED: "The organisation's written acceptance of the limits of online sealing is not recorded. It must name that the company estimate's figure is held unencrypted in the database and its backups until the opening, and that encrypted backups with recorded custody are the organisation's own control.",
  SCANNER_NOT_CONFIGURED: "No malware scanner is configured for this copy of the system.",
  LIVE_NOT_ALLOWED_BY_DEPLOYMENT: "This copy of the system has not been told it may take live online bids. Whoever runs the system must allow it in the deployment settings first (the file .env.example says how).",
  PEPPER_NOT_SET: "The deployment's sealing pepper is not configured.",
  PUBLIC_ROLE_NOT_ATTESTED: "Nobody has attested that the public copy's database role cannot read sealed bids. This is attested, not checked by the portal.",
  HARDENING_NOT_ATTESTED: "Nobody has attested the deployment's hardening (no core dumps or swap, HTTPS only, no logging of request bodies). This is attested, not checked by the portal.",
};

export const ONLINE_SUBMISSION_WORDS: Readonly<Record<OnlineSubmissionFault, string>> = {
  ONLINE_NOT_SET: "Online submission of bids is not set for the organisation, so bids are not taken through the portal.",
  ONLINE_NOT_ALLOWED: "This copy of the system does not allow online bids in this mode.",
};

/// What every supplier screen, receipt and Received says under DEMONSTRATION (D1). In English and Malay (ruling 20ab); a staff screen reads `.en`.
export const DEMONSTRATION_WORDS: Words = w("Demonstration — not for real tenders");

export type TakeChannelFault = "EXERCISE_CANCELLED" | "ALREADY_PUBLISHED" | "NOTHING_TO_TAKE" | "SETTING_NOT_SET";

/**
 * Whether the exercise may take the organisation's channel now (ruling 20z, 12e), on the `takeSaleModeFaults` pattern. Allowed only while the exercise's pin is not set, before
 * publication, on an exercise not cancelled, and only while the organisation's setting is set: it copies that value and is not a free choice. A pin that is set never changes
 * (trigger 11 after publication).
 */
export function takeChannelFaults(i: { status: ExerciseStatus; published: boolean; pin: SubmissionChannel | null; setting: SubmissionChannel | null }): Finding<TakeChannelFault>[] {
  if (i.status === "CANCELLED") return [{ code: "EXERCISE_CANCELLED", level: "block" }];
  if (i.published) return [{ code: "ALREADY_PUBLISHED", level: "block" }];
  if (i.pin !== null) return [{ code: "NOTHING_TO_TAKE", level: "block" }];
  if (i.setting === null) return [{ code: "SETTING_NOT_SET", level: "block" }];
  return [];
}

/// Staff words for each. SETTING_NOT_SET names where the setting is made and that two people make it.
export const TAKE_CHANNEL_WORDS: Readonly<Record<TakeChannelFault, string>> = {
  EXERCISE_CANCELLED: "This exercise is cancelled, so how its bids are submitted cannot be set.",
  ALREADY_PUBLISHED: "This exercise is published, so how its bids are submitted is frozen and cannot be taken now.",
  NOTHING_TO_TAKE: "How bids are submitted on this exercise is already set, and a setting that is set does not change.",
  SETTING_NOT_SET: "The organisation has not set how bids are submitted, so there is nothing to take. Two people set it under Configuration, Invitation (one proposes, the other applies); then take it here.",
};
