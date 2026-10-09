/**
 * My Projects' words (Phase 4e), English and Malay (AGENTS.md rule 5: no code reaches a screen). The kinds of submission, the officer's outcomes, and where a submission stands
 * against its service level.
 */

import { formatDate } from "@/lib/format";

import type { ServiceState } from "./submission";
import type { SubmissionKind, SubmissionOutcome } from "./types";

export interface Words {
  en: string;
  ms: string;
}
const w = (en: string, ms: string): Words => ({ en, ms });

export const SUBMISSION_KIND_WORDS: Readonly<Record<SubmissionKind, Words>> = {
  WORK_PROGRAMME: w("Work programme", "Program kerja"),
  INTERIM_CLAIM: w("Interim claim", "Tuntutan interim"),
  MATERIALS_ON_SITE: w("Materials-on-site list", "Senarai bahan di tapak"),
  DELAY_NOTICE: w("Notice of a cause of delay", "Notis sebab kelewatan"),
  DEFECTS_RECTIFIED: w("Defects rectified", "Kecacatan telah dibaiki"),
  STATUTORY_DECLARATION: w("Statutory declaration", "Akuan berkanun"),
};

/// What sending each kind means, said on the form.
export const SUBMISSION_KIND_HINT: Readonly<Record<SubmissionKind, Words>> = {
  WORK_PROGRAMME: w("The programme of works, or a revision of it. The S.O.'s representative scrutinises it and the Principal Representative approves or returns it; the points are keyed by the office from what you send.", "Program kerja, atau semakannya. Wakil P.P. meneliti dan Wakil Utama meluluskan atau memulangkannya."),
  INTERIM_CLAIM: w("A claim for an interim payment: the amount claimed and the day it is made up to. The office values the work and raises the certificate from its valuation.", "Tuntutan bayaran interim: amaun yang dituntut dan tarikh ia disediakan."),
  MATERIALS_ON_SITE: w("The unfixed materials on site you ask to be valued: each item, its quantity, where it is and its value. The office answers the three questions on each item at the valuation.", "Bahan belum dipasang di tapak yang anda minta dinilai: setiap item, kuantiti, lokasi dan nilainya."),
  DELAY_NOTICE: w("Written notice of a cause of delay, as the contract requires, with the day it arose. The office records the notice; an extension of time is claimed separately.", "Notis bertulis sebab kelewatan, seperti yang dikehendaki kontrak, dengan tarikh ia berlaku."),
  DEFECTS_RECTIFIED: w("A report that the defects listed have been made good, for the office to inspect.", "Laporan bahawa kecacatan yang disenaraikan telah dibaiki, untuk diperiksa oleh pejabat."),
  STATUTORY_DECLARATION: w("The statutory declaration the contract requires before the final account. It is signed with your password.", "Akuan berkanun yang dikehendaki kontrak sebelum akaun muktamad. Ia ditandatangani dengan kata laluan anda."),
};

export const OUTCOME_WORDS: Readonly<Record<SubmissionOutcome, Words>> = {
  TAKEN_UP: w("Taken up", "Diambil tindakan"),
  RETURNED: w("Returned", "Dipulangkan"),
};
export const OUTCOME_TONE: Readonly<Record<SubmissionOutcome, "ok" | "warn">> = { TAKEN_UP: "ok", RETURNED: "warn" };

export const SERVICE_NOT_SET = w("Service level not set", "Tahap perkhidmatan belum ditetapkan");

export function serviceWords(s: ServiceState): { text: string; tone: "ok" | "warn" | "err" | "neutral" | "info" } {
  switch (s.state) {
    case "NOT_SET":
      return { text: `${SERVICE_NOT_SET.en}: no due day`, tone: "neutral" };
    case "DUE":
      return { text: s.daysLeft === 0 ? `Due today, ${formatDate(s.dueOn)}` : `Due ${formatDate(s.dueOn)}, ${s.daysLeft} day${s.daysLeft === 1 ? "" : "s"} left`, tone: s.daysLeft <= 2 ? "warn" : "info" };
    case "OVERDUE":
      return { text: `Overdue: was due ${formatDate(s.dueOn)}, ${s.daysOver} day${s.daysOver === 1 ? "" : "s"} ago`, tone: "err" };
    case "ANSWERED":
      return s.onTime == null ? { text: "Answered (no service level was set)", tone: "ok" } : s.onTime ? { text: `Answered by its due day, ${formatDate(s.dueOn!)}`, tone: "ok" } : { text: `Answered after its due day, ${formatDate(s.dueOn!)}`, tone: "warn" };
  }
}

/// Said on every screen that shows a routed submission or a notice of one: the delivery is a fact of the product.
export const ROUTING_STATEMENT = "Routed inside the portal to the contract's Superintending Officer; not sent by email (INT-09).";
