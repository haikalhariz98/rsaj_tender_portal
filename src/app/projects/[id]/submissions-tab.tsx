import { ActGate } from "@/components/act-gate";
import { Callout } from "@/components/ui/feedback";
import { actStatusBlocker } from "@/lib/contract/act-status";
import type { ContractStatus } from "@/lib/contract/types";
import { db } from "@/lib/db";
import { loadReviewQueue } from "@/lib/portal/projects/review-store";

import { SubmissionsPanel } from "../submissions-panel";

/**
 * The contract's Submissions tab (FR-SUP-006, 009; AC-16): this contract's submissions from the contractor's portal account, waiting and answered, answered here with the same drawer as the
 * Contracts list's "Submissions waiting" view. A contract of a restricted exercise the reader is not named on shows none (FR-MTD-007; `restricted` is judged by the page from `hiddenExercises`).
 */
export async function SubmissionsTab({ organisationId, contractId, status, today, restricted, waiting, answered }: { organisationId: string; contractId: string; status: ContractStatus; today: string | null; restricted: boolean; waiting: string | undefined; answered: string | undefined }) {
  if (restricted) return <Callout tone="info" title="Restricted exercise">The exercise this contract was formed from is restricted, and you are not named on it, so its submissions are not shown to you.</Callout>;
  const review = await loadReviewQueue(db, organisationId, today, { waiting, answered }, { contractId });
  const href = (w: number, a: number) => {
    const q = new URLSearchParams({ tab: "submissions", ...(w ? { waiting: String(w) } : {}), ...(a ? { answered: String(a) } : {}) });
    return `/projects/${contractId}?${q.toString()}`;
  };
  // Answering is an act of the contract's supervision: its refusal for the contract's status is stated once, and the drawer is blocked in those words.
  const shut = actStatusBlocker("SUPERVISION", status);
  return (
    <ActGate blocker={shut}>
      <SubmissionsPanel review={review} judged={!!today} hrefOf={href} withContract={false} />
    </ActGate>
  );
}
