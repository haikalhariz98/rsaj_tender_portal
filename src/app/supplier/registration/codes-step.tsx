"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Callout } from "@/components/ui/feedback";
import { Field } from "@/components/ui/field";
import { Select } from "@/components/ui/select";
import { SUPPLIER_REGISTRATION_GETS } from "@/lib/auth/routes";

import { StepFooter, FaultSummary } from "./step-footer";
import { errorText, faultsAt, stepHref, useStepSave } from "./wizard-api";

/**
 * Step 3 of the registration (FR-VND-003): the work codes. Each code is recorded on the certificate it comes from, and read as "code — name", never alone. A body whose certificate is not in
 * step 2 says to add that first; a body whose list the office has not set up says so and offers nothing, and neither stops the supplier going on: codes are optional. The lists run to
 * thousands of codes, so they are searched on the server as the supplier types. A grade is one per certificate; the rest may be several. Nothing here filters a tender: the codes are "used
 * for eligibility once verified by CPD".
 */

export interface CodeKindView {
  kind: string;
  label: string;
  /// A grade is one per certificate.
  single: boolean;
}

export interface CodeDocumentView {
  id: string;
  /// "Works board certificate" or "Other · Safety".
  label: string;
  kinds: CodeKindView[];
  /// What the draft holds now: every chosen value with its label and kind.
  chosen: { value: string; label: string; kind: string }[];
}

export interface CodeSectionView {
  bodyId: string;
  bodyName: string;
  state: "OPEN" | "DOCUMENT_FIRST" | "LIST_NOT_CONFIGURED";
  /// The certificate types not yet added in step 2.
  missingTypes: string[];
  documents: CodeDocumentView[];
}

export function CodesStep({ token, version, sections }: { token: string | null; version: number; sections: CodeSectionView[] }) {
  const router = useRouter();
  const { version: current, busy, message, saved, faults, stale, save } = useStepSave("codes", token, version);
  void current;
  // The chosen values, per certificate: each kind's ids.
  const [chosen, setChosen] = useState<Record<string, Record<string, string[]>>>(() => {
    const out: Record<string, Record<string, string[]>> = {};
    for (const s of sections) for (const d of s.documents) out[d.id] = Object.fromEntries(d.kinds.map((k) => [k.kind, d.chosen.filter((c) => c.kind === k.kind).map((c) => c.value)]));
    return out;
  });
  const labels: Record<string, string> = Object.fromEntries(sections.flatMap((s) => s.documents.flatMap((d) => d.chosen.map((c) => [c.value, c.label]))));

  const body = () => ({
    step: "codes",
    documents: sections.flatMap((s) => s.documents).map((d) => ({ id: d.id, valueIds: Object.values(chosen[d.id] ?? {}).flat() })),
  });

  async function run(next: boolean) {
    const done = await save(body(), { next });
    if (done.ok && done.advance) router.push(stepHref("epayment"));
  }

  const none = sections.length === 0;
  return (
    <div>
      <FaultSummary faults={faults} />
      {none && (
        <Callout tone="info" title="The procurement office asks for no codes">
          Nothing here needs choosing. Go on to the next step.
        </Callout>
      )}
      <div className="flex flex-col gap-5">
        {sections.map((s) => (
          <section key={s.bodyId} className="rounded-2xl border border-line p-4 sm:p-5">
            <h3 className="text-[14.5px] font-bold text-ink">{s.bodyName}</h3>
            <p className="mt-0.5 text-[12.5px] text-ink-3">Used for eligibility once verified by the procurement office. Nothing is filtered by them yet.</p>
            {s.state === "DOCUMENT_FIRST" && (
              <Callout tone="info" className="mt-3" title="Add the certificate first" action={<Link className="text-[13px] font-semibold text-brand-700 hover:underline" href={stepHref("documents")}>Go to step 2</Link>}>
                Add the {s.missingTypes.join(", ")} in step 2 first. The codes of {s.bodyName} are recorded on it.
              </Callout>
            )}
            {s.state === "LIST_NOT_CONFIGURED" && (
              <Callout tone="neutral" className="mt-3" title="Nothing to choose yet">
                The procurement office has not set up the codes for {s.bodyName}, so there is nothing to choose. This does not stop you sending your registration.
              </Callout>
            )}
            {s.state === "OPEN" && (
              <div className="mt-3 flex flex-col gap-4">
                {s.documents.map((d) => (
                  <div key={d.id} className="rounded-xl bg-sunken/60 p-3.5">
                    <h4 className="text-[13.5px] font-semibold text-ink">{d.label}</h4>
                    <div className="mt-1 grid gap-x-4 gap-y-1 sm:grid-cols-2">
                      {d.kinds.map((k) => {
                        const id = `codes-${d.id}-${k.kind}`;
                        const at = faultsAt(faults, `documents.${d.id}.values`);
                        const url = `${SUPPLIER_REGISTRATION_GETS.values}?body=${encodeURIComponent(s.bodyId)}&kind=${encodeURIComponent(k.kind)}`;
                        const values = chosen[d.id]?.[k.kind] ?? [];
                        // Only the values whose name the page already holds are listed here; one chosen in this sitting is named by the search that returned it.
                        const options = values.filter((v) => labels[v]).map((v) => (
                          <option key={v} value={v}>
                            {labels[v]}
                          </option>
                        ));
                        const set = (next: string[]) => setChosen((all) => ({ ...all, [d.id]: { ...all[d.id], [k.kind]: next } }));
                        return (
                          <Field key={k.kind} label={k.single ? `${k.label} (one)` : k.label} htmlFor={id} error={errorText(at)} hint={k.single ? "A certificate carries one grade." : "You may choose several."}>
                            {k.single ? (
                              <Select id={id} searchable value={values[0] ?? ""} onChange={(e) => set(e.target.value ? [e.target.value] : [])} placeholder="Choose" search={{ url, minChars: 0, token, labels }}>
                                <option value="">Choose</option>
                                {options}
                              </Select>
                            ) : (
                              <Select id={id} multiple searchable value={values} onValuesChange={set} placeholder="Choose" search={{ url, minChars: 0, token, labels }}>
                                {options}
                              </Select>
                            )}
                          </Field>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        ))}
      </div>
      <StepFooter backHref={stepHref("documents")} onSave={() => run(false)} onNext={() => run(true)} busy={busy} message={message} saved={saved} stale={stale} />
    </div>
  );
}
