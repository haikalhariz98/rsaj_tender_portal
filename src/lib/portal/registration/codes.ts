/**
 * Step 3 of the registration: the work codes (FR-VND-003). MOF field codes, a CIDB grade with its categories and specialisations, a SPAN permit and grade, an Energy Commission class: all
 * of them are `RegistrationValue`s of the customer's configuration, loaded from the published lists and never typed from memory. A code is recorded on the certificate it comes from, so a
 * body whose certificate is not in step 2 says to add that first. Pure.
 *
 * Codes are optional, so nothing here blocks the way on. What the supplier chooses must be live, of the right body and kind, and a certificate carries one grade at most.
 * Nothing filters a tender by these yet: they are "used for eligibility once verified by CPD", when the structured requirements of an exercise (615-C1) and eligibility (FR-VND-011) are built.
 */

import type { RegistrationValueKind } from "@/lib/suppliers/types";

import type { BodyConfig, DocumentTypeConfig, DraftDocument, RegistrationContext, StepFault } from "./types";

/// What a section of step 3 is able to do now.
export type CodeSectionState =
  /// The body's certificate is not in step 2: add it there first.
  | "DOCUMENT_FIRST"
  /// The body's list of values for the kinds its certificate carries is empty: nothing to pick, and it blocks nothing.
  | "LIST_NOT_CONFIGURED"
  | "OPEN";

export interface CodeSection {
  body: BodyConfig;
  /// The certificate types of this body that carry values, and the draft's documents of each.
  types: { type: DocumentTypeConfig; documents: DraftDocument[] }[];
  /// The kinds a certificate of this body may carry values of.
  kinds: RegistrationValueKind[];
  state: CodeSectionState;
  /// The names of the certificate types not yet in step 2, for "add the «type name» in step 2 first".
  missingTypeNames: string[];
}

/// The sections of step 3: one per registration body that has a live document type recording values.
export function codeSections(docs: readonly DraftDocument[], ctx: RegistrationContext): CodeSection[] {
  const bodies = new Map<string, BodyConfig>(ctx.bodies.map((b) => [b.id, b]));
  const out: CodeSection[] = [];
  for (const [bodyId, body] of bodies) {
    const types = ctx.types.filter((t) => !t.retired && t.bodyId === bodyId && t.valueKinds.length > 0);
    if (types.length === 0) continue;
    const withDocs = types.map((type) => ({ type, documents: docs.filter((d) => d.typeId === type.id && !d.notApplicable) }));
    const kinds = [...new Set(types.flatMap((t) => t.valueKinds))];
    const present = withDocs.filter((x) => x.documents.length > 0);
    const available = ctx.available.some((a) => a.bodyId === bodyId && kinds.includes(a.kind));
    const state: CodeSectionState = present.length === 0 ? "DOCUMENT_FIRST" : !available ? "LIST_NOT_CONFIGURED" : "OPEN";
    out.push({ body, types: withDocs, kinds, state, missingTypeNames: withDocs.filter((x) => x.documents.length === 0).map((x) => x.type.nameEn) });
  }
  return out;
}

/// The faults of step 3. A section that cannot be filled is information for the page, never a block.
export function codeFaults(docs: readonly DraftDocument[], ctx: RegistrationContext): StepFault[] {
  const out: StepFault[] = [];
  const add = (f: Omit<StepFault, "step">) => out.push({ step: "codes", ...f });
  for (const s of codeSections(docs, ctx)) {
    if (s.state === "DOCUMENT_FIRST") add({ code: "DOCUMENT_FIRST", level: "info", field: `body.${s.body.id}`, data: { body: s.body.nameEn, type: s.missingTypeNames.join(", ") } });
    else if (s.state === "LIST_NOT_CONFIGURED") add({ code: "LIST_NOT_CONFIGURED", level: "info", field: `body.${s.body.id}`, data: { body: s.body.nameEn } });
  }
  for (const d of docs) {
    if (d.valueIds.length === 0) continue;
    const type = ctx.types.find((t) => t.id === d.typeId);
    const at = `documents.${d.id}.values`;
    let grades = 0;
    for (const id of d.valueIds) {
      const v = ctx.values.find((x) => x.id === id);
      if (!v) {
        add({ code: "VALUE_UNKNOWN", level: "block", field: at });
        continue;
      }
      if (v.retired) {
        add({ code: "VALUE_RETIRED", level: "block", field: at, data: { value: `${v.code} — ${v.nameEn}` } });
        continue;
      }
      if (!type || !type.bodyId || v.bodyId !== type.bodyId || !type.valueKinds.includes(v.kind)) {
        add({ code: "VALUE_NOT_FOR_DOCUMENT", level: "block", field: at, data: { value: `${v.code} — ${v.nameEn}`, type: type?.nameEn ?? null } });
        continue;
      }
      if (v.kind === "GRADE") grades += 1;
    }
    if (grades > 1) add({ code: "ONE_GRADE_ONLY", level: "block", field: at, data: { type: type?.nameEn ?? null } });
  }
  return out;
}
