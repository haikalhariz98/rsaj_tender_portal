import { Say } from "@/components/i18n/language-context";
import { ButtonLink } from "@/components/ui/button";
import { Callout } from "@/components/ui/feedback";
import type { IssuedAdjustmentsRead } from "@/lib/adjustment/ppjhk";
import { CASE_REFUSAL_WORDS as R } from "@/lib/contract/case-page-words";
import type { LoadedContract } from "@/lib/contract/repo";

export type AdjustmentRefused = Extract<IssuedAdjustmentsRead, { ok: false }>["refused"];

/// Run 3 residual M1: an issued adjustment whose net cannot be read, named in place of the figures read over it.
export function AdjustmentRefusedCallout({ l, refused }: { l: LoadedContract; refused: AdjustmentRefused }) {
  return (
    <Callout
      tone="err"
      title={<><Say words={R.revisedSumUnreadable} />{refused.number ? `: ${refused.number}` : ""}</>}
      action={refused.certificateId ? <ButtonLink href={`/projects/${l.contract.id}/certificates/${refused.certificateId}`} size="sm" variant="secondary"><Say words={R.openTheCertificate} /></ButtonLink> : undefined}
    >
      {refused.message}
    </Callout>
  );
}

