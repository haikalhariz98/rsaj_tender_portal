import { PencilIcon } from "@/components/icons";
import { RecordEditor, type Field } from "@/components/record-editor";
import { buttonClass } from "@/components/ui/button";

import { removeCorrection, removeTerm, saveCorrection, saveTerm } from "./glossary-actions";

/**
 * Typing corrections and terms (6.14 increment 2, FR-CRT-010, 011). Nothing is pre-filled: which misprints a
 * customer corrects, on which forms, and its glossary are its own decisions.
 */

type Option = { value: string; label: string };
const ghost = buttonClass("ghost", "sm");
const PROVENANCE: Field = {
  kind: "select",
  name: "provenance",
  label: "Where it came from",
  required: true,
  placeholder: "Choose",
  options: [
    { value: "STATED", label: "Stated — a document-control decision or a governing document" },
    { value: "OBSERVED", label: "Observed — seen in practice" },
    { value: "ASSUMED", label: "Assumed — a working reading, needs sign-off" },
  ],
};

function correctionFields(forms: Option[]): Field[] {
  return [
    { kind: "hidden", name: "id" },
    { kind: "text", name: "fromText", label: "As the form misprints it", required: true, hint: "Exactly, letter case included. Only the form's own words are corrected, never a merge field or the value it is filled with." },
    { kind: "text", name: "toText", label: "As it should read", required: true },
    { kind: "tokens", name: "templateIds", label: "The forms it corrects", placeholder: forms.length ? "Choose" : "No certificate form to choose", options: forms, hint: "Certificate forms only. The form's code and revision stay as printed." },
    PROVENANCE,
    { kind: "textarea", name: "notes", label: "Notes", placeholder: "The document-control decision it rests on" },
  ];
}

const CORRECTION_NOTE = "A certificate already being signed keeps the corrections it was pinned with; a draft follows the list as it stands; an issued certificate's text never changes.";

export function AddCorrection({ forms }: { forms: Option[] }) {
  return <RecordEditor title="Add a typing correction" description={CORRECTION_NOTE} fields={correctionFields(forms)} action={saveCorrection} submitLabel="Add correction" trigger={{ label: "Add correction", icon: true }} />;
}

export function EditCorrection({ forms, row }: { forms: Option[]; row: { id: string; fromText: string; toText: string; templateIds: string[]; provenance: string; notes: string } }) {
  return (
    <RecordEditor
      title={`Edit the correction of ${row.fromText}`}
      description={CORRECTION_NOTE}
      fields={correctionFields(forms)}
      values={{ id: row.id, fromText: row.fromText, toText: row.toText, templateIds: row.templateIds.join("\n"), provenance: row.provenance, notes: row.notes }}
      action={saveCorrection}
      trigger={{ label: `Edit the correction of ${row.fromText}`, iconOnly: <PencilIcon size={15} /> }}
    />
  );
}

export function RemoveCorrection({ id, label }: { id: string; label: string }) {
  return (
    <RecordEditor
      title={`Withdraw the correction of ${label}`}
      description="Certificates already pinned keep it; drafts render the form's words as printed from now on."
      fields={[{ kind: "hidden", name: "id" }]}
      values={{ id }}
      destructive={{ reasonLabel: "Why it is withdrawn" }}
      action={removeCorrection}
      submitLabel="Withdraw it"
      cancelLabel="Keep it"
      trigger={{ label: "Withdraw", className: ghost, ariaLabel: `Withdraw the correction of ${label}` }}
    />
  );
}

function termFields(editing: boolean, code: string | null): Field[] {
  return [
    { kind: "hidden", name: "id" },
    editing ? { kind: "readonly", name: "codeShown", label: "Code", text: code ?? "", hint: "Set once: a form's text cites the term by it." } : { kind: "text", name: "code", label: "Code", required: true, mono: true, hint: "Small letters, digits and underscores. A form cites the term as {{term:code}}." },
    { kind: "text", name: "canonicalMs", label: "Wording (Malay)", hint: "What a Malay text prints. At least one wording is needed." },
    { kind: "text", name: "canonicalEn", label: "Wording (English)" },
    { kind: "textarea", name: "aliases", label: "Other wordings, one per line", hint: "The variants the source documents use. A search for any of them finds what the others find." },
    PROVENANCE,
    { kind: "textarea", name: "notes", label: "Notes" },
  ];
}

const TERM_NOTE = "A certificate prints the wording as the glossary holds it at its first signature; one already being signed or issued never changes.";

export function AddTerm() {
  return <RecordEditor title="Add a term" description={TERM_NOTE} fields={termFields(false, null)} action={saveTerm} submitLabel="Add term" trigger={{ label: "Add term", icon: true }} />;
}

export function EditTerm({ row }: { row: { id: string; code: string; canonicalEn: string | null; canonicalMs: string | null; aliases: string[]; provenance: string; notes: string } }) {
  const name = row.canonicalMs ?? row.canonicalEn ?? row.code;
  return (
    <RecordEditor
      title={`Edit ${name}`}
      description={TERM_NOTE}
      fields={termFields(true, row.code)}
      values={{ id: row.id, canonicalEn: row.canonicalEn, canonicalMs: row.canonicalMs, aliases: row.aliases.join("\n"), provenance: row.provenance, notes: row.notes }}
      action={saveTerm}
      trigger={{ label: `Edit ${name}`, iconOnly: <PencilIcon size={15} /> }}
    />
  );
}

export function RemoveTerm({ id, label }: { id: string; label: string }) {
  return (
    <RecordEditor
      title={`Take ${label} out of the glossary`}
      description="Refused while a form's text cites it. Certificates already pinned keep the wording they were pinned with."
      fields={[{ kind: "hidden", name: "id" }]}
      values={{ id }}
      destructive={{ reasonLabel: "Why it comes out" }}
      action={removeTerm}
      submitLabel="Take it out"
      cancelLabel="Keep it"
      trigger={{ label: "Remove", className: ghost, ariaLabel: `Remove ${label}` }}
    />
  );
}
