import { AnswerDrawer } from "@/app/documents/review-editors";
import { ActGate } from "@/components/act-gate";
import { EarlierRecordCard } from "@/components/earlier-record-card";
import { Blocked } from "@/components/ui/blocked";
import { actStatusBlocker } from "@/lib/contract/act-status";
import type { ContractStatus } from "@/lib/contract/types";
import { db } from "@/lib/db";
import type { StaffActor } from "@/lib/auth/types";
import type { LoadedContract } from "@/lib/contract/repo";
import { EARLIER_RECORD } from "@/lib/project-docs/earlier";
import { loadStaffEarlier, type StaffEarlier } from "@/lib/project-docs/earlier-read";
import { loadWorkspaceStart } from "@/lib/project-docs/page-store";
import { isRegisterFilter, loadRegister } from "@/lib/project-docs/register";

import { documentsHref, ProjectDocumentsCard } from "./project-documents-card";

/**
 * The contract's Documents tab (the simple Project workspace, ADR 0042): every document of the contract in one list, the six kinds the contractor sends and the earlier records
 * (the contractor's earlier submissions, read only, PW-11) among them. It is outside the supervision gate on purpose: the workspace is open from Executed through Terminated
 * (PW-22), and its own acts judge the contract's state.
 *
 * An earlier record opens in its own read-only card above the list (`earlier` in the address), read by its id so an older record opens whatever page the list is on. Answering
 * one that is still unanswered is the supervision family's act (AC-16, AC-18, AC-19: the contract's supervising officer answers it whether or not named on the exercise), so
 * the answer alone sits under that gate, in the contract's own words when the state shuts it.
 */
export async function SubmissionsTab({ l, actor, organisationId, contractId, status, docs, docsAfter, earlier }: { l: LoadedContract; actor: StaffActor; organisationId: string; contractId: string; status: ContractStatus; docs: string | undefined; docsAfter: string | undefined; earlier: string | undefined }) {
  const filter = isRegisterFilter(docs) ? docs : "ALL";
  const after = docsAfter || null;
  const [register, start, record] = await Promise.all([
    loadRegister(db, { organisationId, contractId, orgName: l.org.name, filter, after }),
    loadWorkspaceStart(db, l, actor),
    earlier ? loadStaffEarlier(db, { organisationId, contractId, id: earlier }) : Promise.resolve(null),
  ]);
  return (
    <div className="flex flex-col gap-6">
      {record && <EarlierRecord record={record} status={status} backHref={documentsHref(contractId, filter, after)} />}
      <ProjectDocumentsCard contractId={contractId} orgName={l.org.name} rows={register.rows} filter={filter} next={register.next} after={after} start={start} />
    </div>
  );
}

const ANSWER_NOTE = "earlier-answer-note";

/// An earlier record, read only; while it is unanswered its answer is offered under the supervision family's gate, or blocked with the reason the record itself gives.
export function EarlierRecord({ record, status, backHref }: { record: StaffEarlier; status: ContractStatus; backHref: string }) {
  const shut = actStatusBlocker("SUPERVISION", status);
  const action = !record.answerable ? undefined : record.answerShut ? <Blocked label="Answer" reason={record.answerShut} noteId={ANSWER_NOTE} /> : <AnswerDrawer id={record.id} label={`${record.kindLabel}: ${record.title}`} contractor={record.contractor} />;
  return (
    <ActGate blocker={shut}>
      <EarlierRecordCard record={record} label={EARLIER_RECORD} backHref={backHref} answeredBy={record.answeredBy} action={action} />
      {record.answerShut && <p id={ANSWER_NOTE} className="mt-2 px-1 text-[12.5px] text-ink-3">{record.answerShut}</p>}
    </ActGate>
  );
}
