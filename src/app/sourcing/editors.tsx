import { RecordEditor, type Field } from "@/components/record-editor";
import { buttonClass } from "@/components/ui/button";
import { actorField } from "@/lib/auth/actor-field";

import { Blocked } from "../requisitions/editors";
import {
  citeNameDecision,
  addParticipant,
  chooseNameRejection,
  cancelExercise,
  chooseTaxonomyValue,
  moveToPreparation,
  recordNameDecision,
  removeParticipant,
  requestNameApproval,
  reviewProposal,
  saveExerciseDetails,
  saveProposalAnswers,
  submitProposal,
} from "./actions";

/**
 * The drawers of a sourcing exercise. Fields are data; every rule sits in the action
 * and the pure checks behind it. Where the checks already say an act cannot proceed,
 * the control is disabled with the reason stated under the header's actions.
 */

type Option = { value: string; label: string };
const hidden = (name: string): Field => ({ kind: "hidden", name });

/// Id of the header note that states why a header action is unavailable.
export const EXERCISE_NOTE_ID = "exercise-actions-note";

export function MoveToPreparationDrawer({ id, blocker, summary }: { id: string; blocker: string | null; summary: { fixed: [string, string][]; notes: string[] } }) {
  if (blocker) return <Blocked label="Move to preparation" reason={blocker} primary noteId={EXERCISE_NOTE_ID} />;
  return (
    <RecordEditor
      title="Move to preparation"
      description="These are fixed from here and recorded as they stand today."
      fields={[hidden("id")]}
      values={{ id }}
      sections={
        <div className="flex flex-col gap-4">
          <dl className="grid gap-x-4 gap-y-2.5 text-[13.5px] sm:grid-cols-[minmax(0,10rem)_minmax(0,1fr)]">
            {summary.fixed.map(([k, v]) => (
              <div key={k} className="contents">
                <dt className="font-semibold text-ink-3">{k}</dt>
                <dd className="min-w-0 break-words text-ink">{v}</dd>
              </div>
            ))}
          </dl>
          {summary.notes.length > 0 && (
            <ul className="flex list-disc flex-col gap-1 pl-5 text-[13px] text-ink-2">
              {summary.notes.map((n) => (
                <li key={n}>{n}</li>
              ))}
            </ul>
          )}
        </div>
      }
      action={moveToPreparation}
      submitLabel="Move to preparation"
      trigger={{ label: "Move to preparation", className: buttonClass("primary", "sm") }}
      size="md"
    />
  );
}

export function CancelExerciseDrawer({ id, blocker }: { id: string; blocker?: string | null }) {
  if (blocker) return <Blocked label="Cancel exercise" reason={blocker} noteId={EXERCISE_NOTE_ID} destructive />;
  return (
    <RecordEditor
      title="Cancel this exercise"
      description="The procedure does not cover cancelling an exercise: this is recorded as the organisation's own step. It stays on record, its value no longer counts against the requisition, and an open name approval is withdrawn."
      fields={[hidden("id")]}
      values={{ id }}
      action={cancelExercise}
      destructive={{ reasonLabel: "Why it is cancelled" }}
      submitLabel="Cancel exercise"
      cancelLabel="Keep the exercise"
      trigger={{ label: "Cancel exercise", className: buttonClass("destructive", "sm") }}
      size="sm"
    />
  );
}

export function SubmitProposalDrawer({ id, blocker }: { id: string; blocker: string | null }) {
  if (blocker) return <Blocked label="Submit proposal" reason={blocker} noteId={EXERCISE_NOTE_ID} />;
  return (
    <RecordEditor
      title="Submit the proposal for review"
      description="Contract & Procurement review it, comment and adjust before the name is sent for approval. Its items are fixed while it is with them."
      fields={[hidden("id")]}
      values={{ id }}
      action={submitProposal}
      submitLabel="Submit for review"
      trigger={{ label: "Submit proposal", className: buttonClass("secondary", "sm") }}
      size="sm"
    />
  );
}

export function ReviewProposalDrawer({ id, people, today }: { id: string; people: Option[]; today: string | null }) {
  return (
    <RecordEditor
      title="Record Contract & Procurement's review"
      description="Reviewed, or returned for amendment with what to change. The reviewer signs in and records their own review."
      fields={[
        hidden("id"),
        {
          kind: "select",
          name: "outcome",
          label: "Outcome",
          required: true,
          placeholder: "Choose",
          options: [
            { value: "REVIEWED", label: "Reviewed" },
            { value: "DRAFT", label: "Returned for amendment" },
          ],
        },
        actorField("SourcingExercise.proposalReviewer", { name: "reviewerPersonId", people }),
        { kind: "date", name: "reviewedOn", label: "Reviewed on", required: true, hint: "Not after today." },
        { kind: "textarea", name: "comment", label: "Comment", hint: "Required when it is returned." },
      ]}
      values={{ id, reviewedOn: today }}
      action={reviewProposal}
      submitLabel="Record review"
      trigger={{ label: "Record review", className: buttonClass("secondary", "sm") }}
      size="md"
    />
  );
}

export function ProposalAnswersDrawer({ id, items, answers }: { id: string; items: { key: string; label: string; required: boolean }[]; answers: Record<string, string> }) {
  return (
    <RecordEditor
      title="Prepare the proposal"
      description="Every required item must be answered before it can be submitted for review."
      fields={[hidden("id"), ...items.map((i) => ({ kind: "textarea" as const, name: `item_${i.key}`, label: i.required ? `${i.label} (required)` : i.label }))]}
      values={{ id, ...Object.fromEntries(items.map((i) => [`item_${i.key}`, answers[i.key] ?? ""])) }}
      action={saveProposalAnswers}
      submitLabel="Save proposal"
      trigger={{ label: "Edit proposal", className: buttonClass("secondary", "sm") }}
      size="lg"
    />
  );
}

export function RequestNameApprovalDrawer({ id, blocker }: { id: string; blocker: string | null }) {
  if (blocker) return <Blocked label="Request name approval" reason={blocker} noteId={EXERCISE_NOTE_ID} />;
  return (
    <RecordEditor
      title="Send the name for approval"
      description="The route is resolved now under the approval matrix in force and kept with the rules it was judged under. The invitee list is recorded with it: the name is approved for exactly that list, and the letters go only to those on it."
      fields={[hidden("id")]}
      values={{ id }}
      action={requestNameApproval}
      submitLabel="Request approval"
      trigger={{ label: "Request name approval", className: buttonClass("secondary", "sm") }}
      size="sm"
    />
  );
}

/// A committee step of the name route is discharged by the committee's own decision on this exercise, cited, never by a person (FR-MTD-008).
export function CiteNameDecisionDrawer({ id, stepId, committee, matters }: { id: string; stepId: string; committee: string; matters: (Option & { disabled?: boolean })[] }) {
  if (matters.length === 0) return <Blocked label="Cite decision" reason={`No matter on this exercise has been tabled before the ${committee} for the approval of the name yet. Table it at a sitting first.`} />;
  if (matters.every((m) => m.disabled)) return <Blocked label="Cite decision" reason={`The ${committee} has not decided the matter tabled on this exercise yet.`} />;
  return (
    <RecordEditor
      title={`Cite the ${committee}'s decision`}
      description="A committee's step is discharged by its decision on the approval of the name for this exercise, as the sitting recorded it. Until it is cited, the invitation is held back."
      fields={[hidden("id"), hidden("stepId"), { kind: "select", name: "committeeDecisionId", label: "The matter", required: true, placeholder: "Choose", options: matters, hint: "A matter not decided yet is listed but cannot be chosen." }]}
      values={{ id, stepId }}
      action={citeNameDecision}
      submitLabel="Cite decision"
      trigger={{ label: "Cite decision", className: buttonClass("primary", "sm") }}
      size="md"
    />
  );
}

export function NameDecisionDrawer({
  id,
  stepId,
  roleLabel,
  act,
  done,
  people,
  today,
  blocker,
}: {
  id: string;
  stepId: string;
  roleLabel: string;
  act: string;
  done: string;
  people: Option[];
  today: string | null;
  blocker: string | null;
}) {
  if (blocker) return <Blocked label="Record decision" reason={blocker} />;
  return (
    <RecordEditor
      title={`Record ${roleLabel}'s decision`}
      description={`The ${act.toLowerCase()} step of the name approval. The holder signs in and decides it with their password. A decision that came from paper is recorded for them by someone else, and is not signed. Whoever it is for must hold the office for the requisition's department, or a delegation of it.`}
      fields={[
        hidden("id"),
        hidden("stepId"),
        {
          kind: "select",
          name: "decision",
          label: "Decision",
          required: true,
          placeholder: "Choose",
          options: [
            { value: "DONE", label: done },
            { value: "REJECTED", label: "Refused" },
          ],
        },
        actorField("ApprovalStep.decidedBy", { name: "personId", people, dated: true }),
        { kind: "date", name: "decidedOn", label: "Decided on", required: true, hint: "Not after today, nor before it was requested. A signed decision is dated today unless back-dating is recorded." },
        { kind: "textarea", name: "reason", label: "Reason", hint: "Required for a refusal." },
      ]}
      values={{ id, stepId, decidedOn: today }}
      action={recordNameDecision}
      submitLabel="Record decision"
      trigger={{ label: "Record decision", className: buttonClass("primary", "sm") }}
      size="md"
    />
  );
}

export function ChooseTaxonomyDrawer({ id, taxonomyCode, taxonomy, candidates }: { id: string; taxonomyCode: string; taxonomy: string; candidates: Option[] }) {
  return (
    <RecordEditor
      title={`Choose the ${taxonomy.toLowerCase()}`}
      description="The mapping gives more than one value for this contract type. Choose once: the choice is stored and kept while the type and basis stay as they are."
      fields={[hidden("id"), hidden("taxonomyCode"), { kind: "select", name: "valueCode", label: taxonomy, required: true, placeholder: "Choose", options: candidates }]}
      values={{ id, taxonomyCode }}
      action={chooseTaxonomyValue}
      submitLabel="Choose"
      trigger={{ label: "Choose", className: buttonClass("secondary", "sm") }}
      size="sm"
    />
  );
}

/// The exercise's person in charge and work code (founder, 2026-10-05). `people` are the
/// organisation's active people; a person already named but since retired is passed in too,
/// so the drawer shows who is named rather than an empty choice.
/// `blocker`: why the details cannot change now (`detailsFault`), said beside the disabled control.
/// `what`: where the control sits in a row of its own ("Change" beside the work code or the person in
/// charge), rather than as a stand-alone "Edit details" button.
export function EditDetailsDrawer({ id, people, personInChargeId, workCode, blocker, what }: { id: string; people: Option[]; personInChargeId: string | null; workCode: string | null; blocker?: string | null; what?: "work code" | "person in charge" }) {
  // Beside a value already recorded it changes it; beside "Not recorded" it adds one.
  const recorded = what === "work code" ? !!workCode : what === "person in charge" ? !!personInChargeId : true;
  const label = !what ? "Edit details" : recorded ? "Change" : "Add";
  const ariaLabel = what ? `${recorded ? "Change" : "Add"} the ${what}` : undefined;
  if (blocker) return <Blocked label={label} reason={blocker} ariaLabel={ariaLabel} />;
  return (
    <RecordEditor
      title="Edit details"
      description="Who is in charge of this exercise, and its work code. Either may be left blank."
      fields={[
        hidden("id"),
        { kind: "select", name: "personInChargeId", label: "Person in charge", placeholder: "Not named", options: people, orphanLabel: "Someone no longer on record" },
        { kind: "text", name: "workCode", label: "Work code", hint: "As your organisation writes it, up to 100 characters." },
      ]}
      values={{ id, personInChargeId: personInChargeId ?? "", workCode: workCode ?? "" }}
      action={saveExerciseDetails}
      submitLabel="Save details"
      trigger={{ label, className: buttonClass(what ? "ghost" : "secondary", "sm"), ariaLabel }}
      size="md"
    />
  );
}

export function AddParticipantDrawer({ id, people }: { id: string; people: Option[] }) {
  return (
    <RecordEditor
      title="Name a participant"
      description="Who may see this exercise once sign-in exists. Until then the list is recorded, and the restriction is not enforced."
      fields={[
        hidden("id"),
        { kind: "select", name: "personId", label: "Person", required: true, placeholder: "Choose", options: people },
        { kind: "text", name: "capacity", label: "Capacity", placeholder: "e.g. evaluation panel" },
      ]}
      values={{ id }}
      action={addParticipant}
      submitLabel="Add participant"
      trigger={{ label: "Add participant", icon: true, className: buttonClass("secondary", "sm") }}
      size="md"
    />
  );
}

export function RemoveParticipantDrawer({ id, participantId, name }: { id: string; participantId: string; name: string }) {
  return (
    <RecordEditor
      title={`Remove ${name}`}
      description="They are taken off the named list. The change is on the record."
      fields={[hidden("id"), hidden("participantId")]}
      values={{ id, participantId }}
      action={removeParticipant}
      destructive={{ reasonLabel: "Why they are removed" }}
      submitLabel="Remove participant"
      trigger={{ label: "Remove", className: buttonClass("ghost", "sm") }}
      size="sm"
    />
  );
}

/// Where a refused name goes next, where the refusal decided nothing (FR-APR-016, CO-5).
export function NameChoiceDrawer({ id, kinds, steps, people }: { id: string; kinds: { value: string; label: string }[]; steps: { value: string; label: string }[]; people: { value: string; label: string }[] }) {
  return (
    <RecordEditor
      title="Where the refused name goes next"
      description="No destination applied to this refusal, so the officer chooses. The choice is recorded as yours — it is not the organisation's policy."
      fields={[
        { kind: "hidden", name: "id" },
        { kind: "select", name: "kind", label: "Where it goes", required: true, placeholder: "Choose", options: kinds },
        { kind: "select", name: "returnToSeq", label: "The step it returns to", required: true, placeholder: "Choose", options: steps, hint: "The route continues from this step; the steps before it keep their decisions." },
        actorField("ApprovalInstance.rejectionChosenBy", { name: "personId", people }),
        { kind: "textarea", name: "reason", label: "Why it goes there" },
      ]}
      showWhen={{ returnToSeq: { name: "kind", in: ["RETURN_TO_STEP"] } }}
      values={{ id }}
      action={chooseNameRejection}
      submitLabel="Record the choice"
      trigger={{ label: "Choose where it goes", className: buttonClass("primary", "sm") }}
      size="md"
    />
  );
}
