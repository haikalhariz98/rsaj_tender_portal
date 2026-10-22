"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { CodesFields, startingChosen, type ChosenCodes, type CodeSectionView } from "@/components/registration/codes-fields";
import { SUPPLIER_REGISTRATION_GETS } from "@/lib/auth/routes";
import { codesChangedFields } from "@/lib/portal/registration/changed-fields";

import { StepFooter, FaultSummary } from "./step-footer";
import { stepHref, useStepSave } from "./wizard-api";

/**
 * Step 3 of the registration (FR-VND-003): the work codes, drawn by the shared `CodesFields`. The signed-in wizard searches its own route (`/supplier/registration/values`) with the page's
 * token, and saves the chosen codes in its draft. Nothing here filters a tender: the codes are "used for eligibility once verified by CPD".
 */

export type { CodeDocumentView, CodeKindView, CodeSectionView } from "@/components/registration/codes-fields";

export function CodesStep({ token, version, sections }: { token: string | null; version: number; sections: CodeSectionView[] }) {
  const router = useRouter();
  const { busy, message, saved, faults, stale, save, answered } = useStepSave("codes", token, version);
  const [chosen, setChosen] = useState<ChosenCodes>(() => startingChosen(sections));
  const labels: Record<string, string> = Object.fromEntries(sections.flatMap((s) => s.documents.flatMap((d) => d.chosen.map((c) => [c.value, c.label]))));

  const body = () => ({
    step: "codes",
    documents: sections.flatMap((s) => s.documents).map((d) => ({ id: d.id, valueIds: Object.values(chosen[d.id] ?? {}).flat() })),
  });

  async function run(next: boolean) {
    const done = await save(body(), { next });
    if (done.ok && done.advance) router.push(stepHref("epayment"));
  }

  return (
    <div>
      <FaultSummary faults={faults} />
      <CodesFields
        sections={sections}
        chosen={chosen}
        onChange={(next) => {
          answered(codesChangedFields(chosen, next));
          setChosen(next);
        }}
        labels={labels}
        faults={faults}
        searchFor={(bodyId, kind) => ({ url: `${SUPPLIER_REGISTRATION_GETS.values}?body=${encodeURIComponent(bodyId)}&kind=${encodeURIComponent(kind)}`, minChars: 0, token })}
        documentsLink={(label) => (
          <Link className="text-[13px] font-semibold text-brand-700 hover:underline" href={stepHref("documents")}>
            {label}
          </Link>
        )}
      />
      <StepFooter backHref={stepHref("documents")} onSave={() => run(false)} onNext={() => run(true)} busy={busy} message={message} saved={saved} stale={stale} />
    </div>
  );
}
