/**
 * My Projects' words (Phase 4e), English and Malay (AGENTS.md rule 5: no code reaches a screen). The kinds of submission, the officer's outcomes, and where a submission stands
 * against its service level.
 */

import { SUBMISSIONS_WORDS } from "@/lib/contract/case-page-words";
import { formatDate } from "@/lib/format";
import type { Language } from "@/lib/i18n/language";
import { say, sayWith } from "@/lib/i18n/say";

import type { ServiceState } from "./submission";
import type { SubmissionKind, SubmissionOutcome } from "./types";

export interface Words {
  en: string;
}
const w = (en: string): Words => ({ en });

export const SUBMISSION_KIND_WORDS: Readonly<Record<SubmissionKind, Words>> = {
  WORK_PROGRAMME: w("Work programme"),
  INTERIM_CLAIM: w("Interim claim"),
  MATERIALS_ON_SITE: w("Materials-on-site list"),
  DELAY_NOTICE: w("Notice of a cause of delay"),
  DEFECTS_RECTIFIED: w("Defects rectified"),
  // Decisions log, 2026-10-09, ruling on 1924(K): what the contractor sends from the portal is its NOTICE that the statutory declaration is lodged. The declaration itself is made on paper before a Commissioner for Oaths
  // (Statutory Declarations Act 1960) and recorded by an officer; this notice never stands in for it.
  STATUTORY_DECLARATION: w("Notice that the statutory declaration is lodged"),
};

/// What sending each kind means, said on the form.
export const SUBMISSION_KIND_HINT: Readonly<Record<SubmissionKind, Words>> = {
  WORK_PROGRAMME: w("The programme of works, or a revision of it."),
  INTERIM_CLAIM: w("The amount claimed and the day it is made up to."),
  MATERIALS_ON_SITE: w("Each unfixed item: quantity, place and value."),
  DELAY_NOTICE: w("The cause of delay and the day it arose."),
  DEFECTS_RECTIFIED: w("The listed defects have been made good."),
  STATUTORY_DECLARATION: w("Tell the office that the statutory declaration the contract requires before the final account has been lodged. This notice is signed with your password. It is not the declaration: that is made on paper before a Commissioner for Oaths and recorded by an officer, and only that lifts the block on final payment."),
};

export const OUTCOME_WORDS: Readonly<Record<SubmissionOutcome, Words>> = {
  TAKEN_UP: w("Taken up"),
  RETURNED: w("Returned"),
};
export const OUTCOME_TONE: Readonly<Record<SubmissionOutcome, "ok" | "warn">> = { TAKEN_UP: "ok", RETURNED: "warn" };

/// Decisions log, 2026-10-09, ruling on 1924(B), the unit of a service level ASSUMED to be calendar days, was said on the editor and the configuration page. PW-27 (plan step 6)
/// took that editor off Configuration: no screen shows or sets a service level any more, and each earlier submission shows only the due day stored on it, a plain date.


export function serviceWords(s: ServiceState, lang: Language = "en"): { text: string; tone: "ok" | "warn" | "err" | "neutral" | "info" } {
  const S = SUBMISSIONS_WORDS;
  const date = (d: Date | string) => formatDate(d, lang);
  switch (s.state) {
    case "NOT_SET":
      return { text: say(S.svcNotSet, lang), tone: "neutral" };
    case "DUE":
      return { text: s.daysLeft === 0 ? sayWith(S.svcDueToday, lang, { date: date(s.dueOn) }) : sayWith(s.daysLeft === 1 ? S.svcDueOne : S.svcDueMany, lang, { date: date(s.dueOn), count: String(s.daysLeft) }), tone: s.daysLeft <= 2 ? "warn" : "info" };
    case "OVERDUE":
      return { text: sayWith(s.daysOver === 1 ? S.svcOverdueOne : S.svcOverdueMany, lang, { date: date(s.dueOn), count: String(s.daysOver) }), tone: "err" };
    case "ANSWERED":
      return s.onTime == null ? { text: say(S.svcAnsweredNoLevel, lang), tone: "ok" } : s.onTime ? { text: sayWith(S.svcAnsweredOnTime, lang, { date: date(s.dueOn!) }), tone: "ok" } : { text: sayWith(S.svcAnsweredLate, lang, { date: date(s.dueOn!) }), tone: "warn" };
  }
}

/// Said on every screen that shows a routed submission or a notice of one: the delivery is a fact of the product.
export const ROUTING_STATEMENT = "Routed to the Superintending Officer in the portal. Not emailed.";
