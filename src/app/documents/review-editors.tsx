"use client";

import { RecordEditor } from "@/components/record-editor";
import { buttonClass } from "@/components/ui/button";
import { actorField } from "@/lib/auth/actor-field";

import { answerContractorSubmission } from "./review-actions";

/**
 * Answering a contractor's submission from the review queue (Phase 4e). The answer is the signed-in officer's own act; the rules (who may answer, once, with a note where it is returned) are the
 * action's, judged under the contract's lock.
 */
export function AnswerDrawer({ id, label, contractor }: { id: string; label: string; contractor: string }) {
  return (
    <RecordEditor
      title={`Answer: ${label}`}
      description={`From ${contractor}. Taken up means you record what it calls for on the contract's own tabs (the programme, the valuation, the delay notice); returned sends it back to the contractor with your note, which it reads in the portal. Either way the answer is shown in the portal and not sent by email.`}
      fields={[
        { kind: "hidden", name: "id" },
        { kind: "select", name: "outcome", label: "The answer", required: true, placeholder: "Choose", options: [{ value: "TAKEN_UP", label: "Taken up" }, { value: "RETURNED", label: "Returned to the contractor" }] },
        { kind: "textarea", name: "note", label: "Note to the contractor", hint: "Required where it is returned. Shown to the contractor." },
        actorField("ContractorSubmission.decidedBy", { name: "decidedByPersonId" }),
      ]}
      values={{ id }}
      action={answerContractorSubmission}
      submitLabel="Answer"
      trigger={{ label: "Answer", className: buttonClass("primary", "sm") }}
      size="md"
    />
  );
}
