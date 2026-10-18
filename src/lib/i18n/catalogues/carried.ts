/**
 * Pairs that existed before the N1 slice and are rendered by converted screens, registered by reference and not moved (NFR-LNG-001, ADR 0040).
 * Their Malay was not reviewed by the customer when it was written, and it still is not, so each is CARRIED_NOT_REVIEWED. The keys are property
 * names in code and are never rendered.
 */

import { AUTH_WORDS } from "@/lib/auth/words";
import { CASE_ENDED_WORDS, CASE_STAGE_WORDS, CASE_VIEW_WORDS, ENDED_VIEW_WORDS } from "@/lib/contract/case-list-words";
import { CHECK_WORDS, CONTRACT_STATUS_WORDS, PHASE_WORDS, type Words } from "@/lib/contract/labels";
import { MATTER_WORDS } from "@/lib/labels";
import { OUTCOME_WORDS, SERVICE_NOT_SET, SUBMISSION_KIND_WORDS } from "@/lib/portal/projects/labels";
import { ACT_WORDS, HIDDEN_NEED_WORDS } from "@/lib/supervision/labels";

import type { Catalogue } from "../registry";

const flat = (prefix: string, table: Readonly<Record<string, Words>>): Record<string, Words> =>
  Object.fromEntries(Object.entries(table).map(([k, v]) => [`${prefix}${k}`, v]));

export const CARRIED: readonly Catalogue[] = [
  {
    name: "case-list-words",
    review: "CARRIED_NOT_REVIEWED",
    words: { ...flat("stage.", CASE_STAGE_WORDS), ...flat("ended.", CASE_ENDED_WORDS), endedView: ENDED_VIEW_WORDS, ...flat("view.", CASE_VIEW_WORDS) },
  },
  { name: "contract-status", review: "CARRIED_NOT_REVIEWED", words: { ...flat("status.", CONTRACT_STATUS_WORDS), ...flat("phase.", PHASE_WORDS) } },
  { name: "formation-checks", review: "CARRIED_NOT_REVIEWED", words: flat("check.", CHECK_WORDS) },
  {
    name: "sign-in-notices",
    review: "CARRIED_NOT_REVIEWED",
    words: { mustChangeTitle: AUTH_WORDS.mustChangeTitle, mustChangeBody: AUTH_WORDS.mustChangeBody, resetNoticeTitle: AUTH_WORDS.resetNoticeTitle, resetNoticeBody: AUTH_WORDS.resetNoticeBody },
  },
  {
    name: "submissions",
    review: "CARRIED_NOT_REVIEWED",
    words: { ...flat("kind.", SUBMISSION_KIND_WORDS), ...flat("outcome.", OUTCOME_WORDS), serviceNotSet: SERVICE_NOT_SET },
  },
  { name: "supervision-acts", review: "CARRIED_NOT_REVIEWED", words: { ...flat("act.", ACT_WORDS), ...flat("need.", HIDDEN_NEED_WORDS) } },
  { name: "matter-labels", review: "CARRIED_NOT_REVIEWED", words: flat("matter.", MATTER_WORDS) },
];
