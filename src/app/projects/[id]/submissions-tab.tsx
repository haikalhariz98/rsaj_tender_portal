import { ActGate } from "@/components/act-gate";
import { ENGLISH, type Language } from "@/lib/i18n/language";
import { actStatusBlocker } from "@/lib/contract/act-status";
import type { ContractStatus } from "@/lib/contract/types";
import { db } from "@/lib/db";
import type { StaffActor } from "@/lib/auth/types";
import type { LoadedContract } from "@/lib/contract/repo";
import { loadReviewQueue } from "@/lib/portal/projects/review-store";
import { loadWorkspaceStart } from "@/lib/project-docs/page-store";
import { isRegisterFilter, loadRegister } from "@/lib/project-docs/register";

import { SubmissionsPanel } from "../submissions-panel";
import { ProjectDocumentsCard } from "./project-documents-card";

/**
 * The contract's Documents list comes first (the simple Project workspace, ADR 0042): every document of the contract, started by an upload or a request, with the day of its latest
 * version, its state and who it waits on. It is outside the supervision gate below on purpose: the workspace is open from Executed through Terminated (PW-22), and its own acts
 * judge the contract's state. The queue below it is the earlier Submissions tab, unchanged until the six kinds move in (step 6).
 *
 * The contract's Submissions tab (FR-SUP-006, 009; AC-16): this contract's submissions from the contractor's portal account, waiting and answered, answered here with the same drawer as the
 * Contracts list's "Submissions waiting" view. Not hidden for a restricted exercise (AC-18, AC-19): the contract's supervising officer answers it whether or not named on the exercise.
 */
export async function SubmissionsTab({ l, actor, organisationId, contractId, status, today, waiting, answered, docs, docsAfter }: { l: LoadedContract; actor: StaffActor; organisationId: string; contractId: string; status: ContractStatus; today: string | null; waiting: string | undefined; answered: string | undefined; docs: string | undefined; docsAfter: string | undefined }) {
  const lang = ENGLISH;
  const filter = isRegisterFilter(docs) ? docs : "ALL";
  const after = docsAfter || null;
  const [review, register, start] = await Promise.all([
    loadReviewQueue(db, organisationId, today, { waiting, answered }, { contractId }, lang),
    loadRegister(db, { organisationId, contractId, orgName: l.org.name, filter, after }),
    loadWorkspaceStart(db, l, actor),
  ]);
  const href = (w: number, a: number) => {
    const q = new URLSearchParams({ tab: "submissions", ...(w ? { waiting: String(w) } : {}), ...(a ? { answered: String(a) } : {}) });
    return `/projects/${contractId}?${q.toString()}`;
  };
  // Answering is an act of the contract's supervision: its refusal for the contract's status is stated once, and the drawer is blocked in those words.
  return (
    <div className="flex flex-col gap-6">
      <ProjectDocumentsCard contractId={contractId} orgName={l.org.name} rows={register.rows} filter={filter} next={register.next} after={after} start={start} />
      <EarlierQueue review={review} status={status} judged={!!today} hrefOf={href} lang={lang} />
    </div>
  );
}

/// The earlier queue of contractors' submissions, under the supervision family's gate: a submission is answered by the contract's supervision, whatever the Documents list above allows.
function EarlierQueue({ review, status, judged, hrefOf, lang }: { review: Parameters<typeof SubmissionsPanel>[0]["review"]; status: ContractStatus; judged: boolean; hrefOf: Parameters<typeof SubmissionsPanel>[0]["hrefOf"]; lang: Language }) {
  const shut = actStatusBlocker("SUPERVISION", status);
  return (
    <ActGate blocker={shut}>
      <SubmissionsPanel review={review} judged={judged} hrefOf={hrefOf} withContract={false} lang={lang} />
    </ActGate>
  );
}
