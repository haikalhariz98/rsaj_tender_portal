"use server";

import { revalidatePath } from "next/cache";

import { beginAct, attributionRefusalState } from "@/app/_auth/act";
import { staffForAct, toAuditActor } from "@/app/_auth/actor";
import type { FormState } from "@/components/record-editor";
import { diffFields } from "@/lib/audit/diff";
import { writeAudit } from "@/lib/audit/record";
import { actStatusFault, actStatusText } from "@/lib/contract/act-status";
import { contractLabel, withLockedContract } from "@/lib/contract/repo";
import type { ContractStatus } from "@/lib/contract/types";
import { dayOf, dayToDate } from "@/lib/dates";
import { db } from "@/lib/db";
import { formatDate } from "@/lib/format";
import { OUTCOME_WORDS, SUBMISSION_KIND_WORDS } from "@/lib/portal/projects/labels";
import { answerFaults } from "@/lib/portal/projects/submission";
import { SUBMISSION_OUTCOMES, type SubmissionKind } from "@/lib/portal/projects/types";
import { projectFaultText } from "@/lib/portal/projects/words";
import { supervisionFaultText } from "@/lib/supervision/labels";
import { loadSupervision, recorderFaultToday, soOfficeOn } from "@/lib/supervision/load";
import { FormReader } from "@/lib/validate";

/**
 * An officer answers a contractor's submission from the review queue (6.14 OD-6, BD-614-31; Phase 4e): taken up (the officer records what it calls for on the contract through its own act)
 * or returned to the contractor with a note. The signed-in officer's own act, judged by the contract's supervision as a contractor communication (FR-SUP-002–004): the S.O. office's
 * holders, or a representative whose letter lists it. Once per submission, under the contract's lock, with the attribution and the audit row in the same transaction. An administrator is
 * refused (NFR-SEC-004).
 */

const GONE: FormState = { ok: false, message: "That submission no longer exists." };
const NO_ZONE: FormState = { ok: false, message: "Set the organisation's time zone under Configuration, Organisation first: the day of the answer is the organisation's, never UTC's." };

export async function answerContractorSubmission(_prev: FormState, data: FormData): Promise<FormState> {
  const txGuard = await staffForAct("TRANSACTION");
  if (!txGuard.ok) return txGuard.state;
  const actor = txGuard.actor;
  const r = new FormReader(data);
  const id = r.text("id", "Submission", { required: true });
  const outcome = r.choice("outcome", "The answer", SUBMISSION_OUTCOMES, { required: true });
  const note = r.text("note", "Note to the contractor", { max: 2000 });
  if (r.failed || !outcome) return { ok: false, errors: r.errors };
  const begun = await beginAct(actor, data, "ContractorSubmission.decidedBy", { personField: "decidedByPersonId", onBehalf: false });
  if (!begun.ok) return begun.state;
  const act = begun.act;
  const found = await db.contractorSubmission.findFirst({ where: { id, organisationId: actor.organisationId }, select: { contractId: true } });
  if (!found) return GONE;
  let result: FormState | null;
  try {
    result = await withLockedContract(actor.organisationId, found.contractId, async (tx, l) => {
      // The act x status table: answering is an act of the contract's supervision.
      const shut = actStatusFault("SUPERVISION", l.contract.status as ContractStatus);
      if (shut) return { ok: false, message: actStatusText(shut) };
      const today = dayOf(new Date(), l.org.timeZone);
      if (!today) return NO_ZONE;
      await tx.$queryRaw`SELECT id FROM "ContractorSubmission" WHERE id = ${id} FOR UPDATE`;
      const s = await tx.contractorSubmission.findFirst({ where: { id, contractId: l.contract.id, organisationId: actor.organisationId }, select: { id: true, kind: true, title: true, outcome: true } });
      if (!s) return GONE;
      const faults = answerFaults({ outcome, note, alreadyAnswered: s.outcome != null });
      if (faults.length) return faults.every((f) => f.code === "NOTE_REQUIRED" || f.code === "NOTE_TOO_LONG") ? { ok: false, errors: { note: faults.map((f) => projectFaultText(f).en).join(" ") } } : { ok: false, message: faults.map((f) => projectFaultText(f).en).join(" ") };
      // Who may answer: the S.O. office's holders (or those acting in it), or a representative whose letter lists contractor communication, judged today.
      const sv = await loadSupervision(l.contract.id, tx);
      const so = await soOfficeOn(l, sv, today, tx);
      const who = await recorderFaultToday(l, sv, act.subjectPersonId, { act: "CONTRACTOR_COMMUNICATION" }, today, so?.office ?? null, today, tx);
      if (who) return { ok: false, message: `Not answered: ${supervisionFaultText(who)}` };
      const now = new Date();
      const moved = await tx.contractorSubmission.updateMany({ where: { id: s.id, outcome: null }, data: { outcome, outcomeNote: note.trim(), decidedByPersonId: act.subjectPersonId, decidedOn: dayToDate(today), decidedAt: now } });
      if (moved.count !== 1) return { ok: false, message: "This submission was answered a moment ago by someone else. Reload to see the answer." };
      await act.write(tx, s.id);
      const label = contractLabel({ number: l.contract.number, award: { awardeeName: l.award.awardeeName } });
      await writeAudit(
        tx,
        { actor: toAuditActor(actor), organisationId: actor.organisationId, entity: "ContractorSubmission", entityId: s.id, entityLabel: `${label} · ${SUBMISSION_KIND_WORDS[s.kind as SubmissionKind].en}: ${s.title}` },
        "UPDATE",
        diffFields({ answer: null }, { answer: OUTCOME_WORDS[outcome].en, note: note.trim() || null, answeredOn: formatDate(today) }),
      );
      return { ok: true, message: outcome === "TAKEN_UP" ? "Taken up. Record what it calls for on the contract's own tabs." : "Returned to the contractor, who reads the note in the portal." };
    });
  } catch (e) {
    const attribution = attributionRefusalState(e);
    if (attribution) return attribution;
    throw e;
  }
  if (result?.ok) {
    revalidatePath("/documents");
    revalidatePath(`/projects/${found.contractId}`);
  }
  return result ?? GONE;
}
