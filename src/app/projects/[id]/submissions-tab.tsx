import { ActGate } from "@/components/act-gate";
import { ENGLISH } from "@/lib/i18n/language";
import { actStatusBlocker } from "@/lib/contract/act-status";
import type { ContractStatus } from "@/lib/contract/types";
import { db } from "@/lib/db";
import { loadReviewQueue } from "@/lib/portal/projects/review-store";

import { SubmissionsPanel } from "../submissions-panel";

/**
 * The contract's Submissions tab (FR-SUP-006, 009; AC-16): this contract's submissions from the contractor's portal account, waiting and answered, answered here with the same drawer as the
 * Contracts list's "Submissions waiting" view. Not hidden for a restricted exercise (AC-18, AC-19): the contract's supervising officer answers it whether or not named on the exercise.
 */
export async function SubmissionsTab({ organisationId, contractId, status, today, waiting, answered }: { organisationId: string; contractId: string; status: ContractStatus; today: string | null; waiting: string | undefined; answered: string | undefined }) {
  const lang = ENGLISH;
  const review = await loadReviewQueue(db, organisationId, today, { waiting, answered }, { contractId }, lang);
  const href = (w: number, a: number) => {
    const q = new URLSearchParams({ tab: "submissions", ...(w ? { waiting: String(w) } : {}), ...(a ? { answered: String(a) } : {}) });
    return `/projects/${contractId}?${q.toString()}`;
  };
  // Answering is an act of the contract's supervision: its refusal for the contract's status is stated once, and the drawer is blocked in those words.
  const shut = actStatusBlocker("SUPERVISION", status);
  return (
    <ActGate blocker={shut}>
      <SubmissionsPanel review={review} judged={!!today} hrefOf={href} withContract={false} lang={lang} />
    </ActGate>
  );
}
