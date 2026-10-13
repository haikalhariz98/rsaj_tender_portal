/**
 * The online submission switch, the conditions for LIVE and the channel setting (ADR 0036 D1, rulings 20i, 20o, 20v; build plan §1.3, written verbatim). Pure.
 */

import type { OnlineSubmissionMode, SubmissionChannel } from "@/lib/bids/online/types";

// src/lib/sealing/switch.ts (D1, 20i, 20o, 20v)
/// `at`: PUBLISH reads the organisation's mode and both deployment flags; SUBMIT reads the exercise's frozen mode, where demoAllowed is read live
/// (20i) and liveAllowed is NOT consulted, so a published LIVE exercise keeps its pin (20i, G1). SEALED_BIDS_LIVE_ALLOWED gates issuing and publishing only.
export declare function onlineSubmissionAllowed(mode: OnlineSubmissionMode | null, deployment: { demoAllowed: boolean; liveAllowed: boolean }, at: "PUBLISH" | "SUBMIT"): { allowed: boolean; demonstration: boolean; fault: "ONLINE_NOT_SET" | "ONLINE_NOT_ALLOWED" | null };
export declare function liveIssueFaults(p: { cryptoReviewReference: string; procedureAmendmentReference: string; customerAcceptanceReference: string; scannerConfigured: boolean; liveAllowedByDeployment: boolean; pepperConfigured: boolean; publicRoleAttestation: string; deploymentHardeningAttestation: string }):
  ("REVIEW_NOT_RECORDED" | "AMENDMENT_NOT_RECORDED" | "ACCEPTANCE_NOT_RECORDED" | "SCANNER_NOT_CONFIGURED" | "LIVE_NOT_ALLOWED_BY_DEPLOYMENT" | "PEPPER_NOT_SET" | "PUBLIC_ROLE_NOT_ATTESTED" | "HARDENING_NOT_ATTESTED")[];
export declare function channelSettingFaults(channel: SubmissionChannel | null, online: ReturnType<typeof onlineSubmissionAllowed>): ("ONLINE_NOT_ALLOWED")[];
