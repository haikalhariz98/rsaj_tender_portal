import { RecordEditor, type Field } from "@/components/record-editor";
import { buttonClass } from "@/components/ui/button";
import { REGISTRATION_VALUE_KINDS } from "@/lib/suppliers/types";
import { VALUE_KIND_LABEL } from "@/lib/suppliers/labels";

import { saveDocumentType, saveListValue, saveRegistrationValue, saveSupplierPolicy, setDocumentTypeRetired, setListValueRetired, setRegistrationValueRetired } from "./actions";

/**
 * Configuration › Supplier register drawers. No field carries a default: a switch left not set blocks
 * the act it governs and says so, and a value set says where it came from. Each save is audited with
 * its before and after; retiring and changing a judged switch ask for a reason.
 */

type Option = { value: string; label: string };
const hidden = (name: string): Field => ({ kind: "hidden", name });
const ghost = buttonClass("ghost", "sm");
const PROVENANCE_OPTIONS: Option[] = [
  { value: "STATED", label: "Stated: written in a governing document" },
  { value: "OBSERVED", label: "Observed: seen in practice" },
  { value: "ASSUMED", label: "Assumed: a working default, needs sign-off" },
];
const provenance = (name: string, label = "Where this came from", required = false): Field => ({ kind: "select", name, label, required, placeholder: required ? "Choose" : "Not set", options: PROVENANCE_OPTIONS });
const KIND_OPTIONS: Option[] = REGISTRATION_VALUE_KINDS.map((k) => ({ value: k, label: VALUE_KIND_LABEL[k].en }));
const three = (yes: string, no: string, unset: string): Option[] => [
  { value: "yes", label: yes },
  { value: "no", label: no },
  { value: "unset", label: unset },
];

// ------------------------------------------------------------------ values

export function ValueDrawer({ bodyId, bodyName, categories, value }: { bodyId: string; bodyName: string; categories: Option[]; value?: { id: string; name: string; values: Record<string, string> } }) {
  return (
    <RecordEditor
      title={value ? `Edit ${value.name}` : `Add a value under ${bodyName}`}
      description="A grade, category, specialisation, field code, class or permit type the body publishes. A grade's rank orders the grades (the higher, the more it covers); its ceiling is shown only and never compared with an estimate."
      columns={2}
      fields={[
        hidden("id"),
        hidden("bodyId"),
        ...(value ? [hidden("kind"), hidden("code")] : [{ kind: "select", name: "kind", label: "Kind of value", required: true, placeholder: "Choose", options: KIND_OPTIONS } as Field, { kind: "text", name: "code", label: "Code", required: true, mono: true, hint: "As the body publishes it. A key, not shown to officers; it cannot be changed." } as Field]),
        { kind: "text", name: "nameEn", label: "Name", required: true },
        { kind: "text", name: "nameMs", label: "Name (Malay)" },
        { kind: "select", name: "parentCode", label: "Under the category", placeholder: "None", options: categories, hint: "A specialisation only." },
        { kind: "number", name: "rank", label: "Rank", min: 1, hint: "A grade only. Ranks are unique within the body." },
        { kind: "money", name: "valueCeiling", label: "Value ceiling", hint: "A grade only, as the body publishes it. Shown only." },
        provenance("ceilingProvenance", "Where the ceiling comes from"),
        { kind: "text", name: "governingSource", label: "Source", hint: "The list it is taken from." },
        provenance("provenance", "Where it comes from", true),
        { kind: "number", name: "sortOrder", label: "Order", min: 0 },
      ]}
      values={{ bodyId, ...(value?.values ?? {}) }}
      action={saveRegistrationValue}
      trigger={value ? { label: "Edit", className: ghost, ariaLabel: `Edit ${value.name}` } : { label: "Add a value" }}
      size="lg"
    />
  );
}

export function RetireValueDrawer({ id, name, retired }: { id: string; name: string; retired: boolean }) {
  return <Retire id={id} name={name} retired={retired} action={setRegistrationValueRetired} what="value" />;
}

// ------------------------------------------------------------------ document types

export function DocumentTypeDrawer({ bodies, type }: { bodies: Option[]; type?: { id: string; name: string; values: Record<string, string | null> } }) {
  return (
    <RecordEditor
      title={type ? `Edit ${type.name}` : "Add a document type"}
      description="A statutory document a supplier lodges. Whether it expires, whether it is mandatory for every registration and whether it may be not applicable may each be left not set: each then holds back the act that needs it, naming itself."
      columns={2}
      fields={[
        hidden("id"),
        ...(type ? [hidden("code")] : [{ kind: "text", name: "code", label: "Code", required: true, mono: true, hint: "A key, not shown to officers; it cannot be changed." } as Field]),
        { kind: "text", name: "nameEn", label: "Name", required: true },
        { kind: "text", name: "nameMs", label: "Name (Malay)" },
        { kind: "select", name: "bodyId", label: "Registration body", placeholder: "None", options: bodies, hint: "The body whose values it records. Bodies are configured under Tender documents." },
        { kind: "tokens", name: "valueKinds", label: "Values it records", options: KIND_OPTIONS, hint: "Only of the body named." },
        { kind: "select", name: "expires", label: "Whether it expires", placeholder: "Not set", options: three("Carries an expiry", "Does not expire", "Not set: none can be lodged") },
        { kind: "select", name: "mandatoryAtRegistration", label: "Mandatory for every registration", placeholder: "Not set", options: three("Mandatory", "Not mandatory", "Not set: no application can be decided") },
        { kind: "select", name: "notApplicableAllowed", label: "May be recorded as not applicable", placeholder: "Not set", options: three("Yes", "No", "Not set: none is recorded so") },
        { kind: "text", name: "governingSource", label: "Source" },
        provenance("provenance", "Where it comes from", true),
        { kind: "number", name: "sortOrder", label: "Order", min: 0 },
      ]}
      values={type?.values ?? {}}
      reason={type ? { label: "Why it changes (needed where documents of this type are on file and a setting changes)" } : undefined}
      action={saveDocumentType}
      trigger={type ? { label: "Edit", className: ghost, ariaLabel: `Edit ${type.name}` } : { label: "Add a document type" }}
      size="lg"
    />
  );
}

export function RetireTypeDrawer({ id, name, retired }: { id: string; name: string; retired: boolean }) {
  return <Retire id={id} name={name} retired={retired} action={setDocumentTypeRetired} what="document type" />;
}

// ------------------------------------------------------------------ lists

export function ListValueDrawer({ list, listName, value }: { list: string; listName: string; value?: { id: string; name: string; values: Record<string, string> } }) {
  return (
    <RecordEditor
      title={value ? `Edit ${value.name}` : `Add to ${listName.toLowerCase()}`}
      description="An entry an officer chooses when recording a supplier. A retired entry stays on the suppliers recorded with it."
      fields={[
        hidden("id"),
        hidden("list"),
        ...(value ? [hidden("code")] : [{ kind: "text", name: "code", label: "Code", required: true, mono: true, hint: "A key, not shown to officers; it cannot be changed." } as Field]),
        { kind: "text", name: "nameEn", label: "Name", required: true },
        { kind: "text", name: "nameMs", label: "Name (Malay)" },
        provenance("provenance", "Where it comes from", true),
        { kind: "number", name: "sortOrder", label: "Order", min: 0 },
      ]}
      values={{ list, ...(value?.values ?? {}) }}
      action={saveListValue}
      trigger={value ? { label: "Edit", className: ghost, ariaLabel: `Edit ${value.name}` } : { label: "Add" }}
    />
  );
}

export function RetireListValueDrawer({ id, name, retired }: { id: string; name: string; retired: boolean }) {
  return <Retire id={id} name={name} retired={retired} action={setListValueRetired} what="entry" />;
}

// ------------------------------------------------------------------ policy

export function EditSupplierPolicy({ values }: { values: Record<string, string> }) {
  return (
    <RecordEditor
      title="Edit the register's policy"
      description="What the supplier is told about how its documents are checked (shown to the vendor once it can sign in). Leave it not set if it has not been decided."
      fields={[
        { kind: "textarea", name: "verificationNoticeEn", label: "Verification notice" },
        { kind: "textarea", name: "verificationNoticeMs", label: "Verification notice (Malay)" },
        provenance("noticeProvenance", "Where the notice comes from"),
        { kind: "text", name: "governingSource", label: "Source" },
      ]}
      values={values}
      reason={{ label: "Why the policy changes" }}
      action={saveSupplierPolicy}
      trigger={{ label: "Edit the policy", className: buttonClass("primary", "sm") }}
    />
  );
}

// ------------------------------------------------------------------ retiring

function Retire({ id, name, retired, action, what }: { id: string; name: string; retired: boolean; action: typeof setRegistrationValueRetired; what: string }) {
  return (
    <RecordEditor
      title={retired ? `Bring back ${name}` : `Retire ${name}`}
      description={retired ? `The ${what} can be chosen again.` : `The ${what} can no longer be chosen. It stays on the records that used it.`}
      fields={[hidden("id"), hidden("retire")]}
      values={{ id, retire: retired ? "no" : "yes" }}
      {...(retired ? { reason: { label: "Why it comes back" } } : { destructive: { reasonLabel: "Why it is retired" } })}
      action={action}
      submitLabel={retired ? "Bring back" : "Retire"}
      trigger={{ label: retired ? "Bring back" : "Retire", className: ghost, ariaLabel: `${retired ? "Bring back" : "Retire"} ${name}` }}
    />
  );
}
