"use client";

import type { ReactNode } from "react";

import { Callout } from "@/components/ui/feedback";
import { Field } from "@/components/ui/field";
import { Select, type RemoteLoad } from "@/components/ui/select";
import { REGISTRATION_HINT } from "@/lib/portal/labels";
import type { FaultView } from "@/lib/portal/register/contract";

import { errorText, faultsAt } from "./faults";

/**
 * Step 3 of the registration (FR-VND-003), the work codes, as a controlled component. Each code is recorded on the certificate it comes from, and read as "code — name", never alone. A body
 * whose certificate is not in step 2 says to add that first; a body whose list the office has not set up says so and offers nothing, and neither stops the supplier going on: codes are
 * optional. The lists run to thousands of codes, so they are searched on the server as the supplier types, through the search the page hands in (the signed-in wizard's route, or the
 * public form's own). A grade is one per certificate; the rest may be several. Nothing here filters a tender: the codes are "used for eligibility once verified by CPD".
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

/// The chosen values, per certificate: each kind's ids.
export type ChosenCodes = Record<string, Record<string, string[]>>;

/// How one list is searched: through a route (`url`, the signed-in wizard) or the page's own loader (`load`, the public form).
export interface CodeSearch {
  url?: string;
  load?: RemoteLoad;
  minChars: number;
  token?: string | null;
}

/// What the sections hold to start with: each certificate's chosen values, by kind.
export function startingChosen(sections: readonly CodeSectionView[]): ChosenCodes {
  const out: ChosenCodes = {};
  for (const s of sections) for (const d of s.documents) out[d.id] = Object.fromEntries(d.kinds.map((k) => [k.kind, d.chosen.filter((c) => c.kind === k.kind).map((c) => c.value)]));
  return out;
}

export function CodesFields({
  sections,
  chosen,
  onChange,
  labels,
  faults,
  searchFor,
  documentsLink,
}: {
  sections: readonly CodeSectionView[];
  chosen: ChosenCodes;
  onChange: (next: ChosenCodes) => void;
  /// The names of the values the page already holds, "code — name": their options are not among a search's results.
  labels: Readonly<Record<string, string>>;
  faults: readonly FaultView[];
  searchFor: (bodyId: string, kind: string) => CodeSearch;
  /// The way back to step 2, as the page moves between steps.
  documentsLink: (label: string) => ReactNode;
}) {
  return (
    <div>
      {sections.length === 0 && <p className="mb-3 text-[13.5px] text-ink-2">No codes asked for. Go to the next step.</p>}
      <div className="flex flex-col gap-5">
        {sections.map((s) => (
          <section key={s.bodyId} className="rounded-2xl border border-line p-4 sm:p-5">
            <h3 className="text-[14.5px] font-bold text-ink">{s.bodyName}</h3>
            <p className="mt-0.5 text-[12.5px] text-ink-3">Not yet used for eligibility.</p>
            {s.state === "DOCUMENT_FIRST" && (
              <Callout tone="warn" className="mt-3" title="Add the certificate first" action={documentsLink("Go to step 2")}>
                Add the {s.missingTypes.join(", ")} in step 2 first.
              </Callout>
            )}
            {s.state === "LIST_NOT_CONFIGURED" && <p className="mt-3 text-[13px] text-ink-2">Codes for {s.bodyName} not set. Nothing to choose.</p>}
            {s.state === "OPEN" && (
              <div className="mt-3 flex flex-col gap-4">
                {s.documents.map((d) => (
                  <div key={d.id} className="rounded-xl bg-sunken/60 p-3.5">
                    <h4 className="text-[13.5px] font-semibold text-ink">{d.label}</h4>
                    <div className="mt-1 grid gap-x-4 gap-y-1 sm:grid-cols-2">
                      {d.kinds.map((k) => {
                        const id = `codes-${d.id}-${k.kind}`;
                        const at = faultsAt(faults, `documents.${d.id}.values`);
                        const search = { ...searchFor(s.bodyId, k.kind), labels };
                        const values = chosen[d.id]?.[k.kind] ?? [];
                        // Only the values whose name the page already holds are listed here; one chosen in this sitting is named by the search that returned it.
                        const options = values
                          .filter((v) => labels[v])
                          .map((v) => (
                            <option key={v} value={v}>
                              {labels[v]}
                            </option>
                          ));
                        const set = (next: string[]) => onChange({ ...chosen, [d.id]: { ...chosen[d.id], [k.kind]: next } });
                        return (
                          <Field key={k.kind} label={k.single ? `${k.label} (one)` : k.label} htmlFor={id} error={errorText(at)} hint={k.single ? REGISTRATION_HINT.oneGrade : REGISTRATION_HINT.several}>
                            {k.single ? (
                              <Select id={id} searchable value={values[0] ?? ""} onChange={(e) => set(e.target.value ? [e.target.value] : [])} placeholder="Choose" search={search}>
                                <option value="">Choose</option>
                                {options}
                              </Select>
                            ) : (
                              <Select id={id} multiple searchable value={values} onValuesChange={set} placeholder="Choose" search={search}>
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
    </div>
  );
}
