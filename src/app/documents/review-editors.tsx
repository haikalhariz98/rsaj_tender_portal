"use client";

import { RecordEditor } from "@/components/record-editor";
import { buttonClass } from "@/components/ui/button";
import { actorField } from "@/lib/auth/actor-field";
import { SUBMISSIONS_WORDS as S } from "@/lib/contract/case-page-words";
import type { Words } from "@/lib/contract/labels";
import type { Language } from "@/lib/i18n/language";
import { say, sayWith } from "@/lib/i18n/say";
import { OUTCOME_WORDS } from "@/lib/portal/projects/labels";

import { answerContractorSubmission } from "./review-actions";

/**
 * Answering a contractor's submission from the review queue (Phase 4e). The answer is the signed-in officer's own act; the rules (who may answer, once, with a note where it is returned) are the
 * action's, judged under the contract's lock.
 */
export function AnswerDrawer({ id, label, contractor, lang = "en" }: { id: string; label: string; contractor: string; lang?: Language }) {
  const t = (words: Words) => say(words, lang);
  return (
    <RecordEditor
      title={sayWith(S.answerTitle, lang, { label })}
      description={sayWith(S.answerDescription, lang, { contractor })}
      fields={[
        { kind: "hidden", name: "id" },
        { kind: "select", name: "outcome", label: t(S.answerField), required: true, placeholder: t(S.answerChoose), options: [{ value: "TAKEN_UP", label: t(OUTCOME_WORDS.TAKEN_UP) }, { value: "RETURNED", label: t(S.answerReturned) }] },
        { kind: "textarea", name: "note", label: t(S.answerNote), hint: t(S.answerNoteHint) },
        actorField("ContractorSubmission.decidedBy", { name: "decidedByPersonId" }),
      ]}
      values={{ id }}
      action={answerContractorSubmission}
      submitLabel={t(S.answerSubmit)}
      trigger={{ label: t(S.answerSubmit), className: buttonClass("primary", "sm") }}
      size="md"
    />
  );
}
