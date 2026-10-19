import { RecordEditor, type Field } from "@/components/record-editor";
import { buttonClass } from "@/components/ui/button";
import { mediaLabel } from "@/lib/documents/labels";
import { BID_PART_MEDIA_TYPES } from "@/lib/tender-docs/bid-part-rules";
import { PCT_COLUMN, pctHint } from "@/lib/tender-docs/percent";

import { restoreTenderPart, retireTenderPart, saveMethodDocumentPack, saveTenderPart, saveTenderPartBidRules, saveTenderPolicy } from "./actions";

/**
 * Configuration › Tender documents drawers. No field carries a default: an unset value is
 * not set, and the screen says what that holds back. A value set says where it came from.
 */

type Option = { value: string; label: string };
const hidden = (name: string): Field => ({ kind: "hidden", name });
const secondary = buttonClass("secondary", "sm");
const ghost = buttonClass("ghost", "sm");
const PROVENANCE_OPTIONS: Option[] = [
  { value: "STATED", label: "Stated: written in a governing document" },
  { value: "OBSERVED", label: "Observed: seen in practice" },
  { value: "ASSUMED", label: "Assumed: a working default, needs sign-off" },
];
const provenance = (name: string, label = "Where this came from", required = false): Field => ({ kind: "select", name, label, required, placeholder: required ? "Choose" : "Not set", options: PROVENANCE_OPTIONS });
const THREE: Option[] = [
  { value: "yes", label: "Yes" },
  { value: "no", label: "No" },
  { value: "unset", label: "Not set" },
];

// ------------------------------------------------------------------ a method's document pack

export function EditMethodPack({ id, name, raw, packKinds }: { id: string; name: string; raw: { documentPackKind: string; documentPackKindProvenance: string }; packKinds: Option[] }) {
  return (
    <RecordEditor
      title={`Which documents does ${name} assemble?`}
      description="Preparation starts only once the method names its documents. Not set holds it back."
      fields={[
        hidden("id"),
        { kind: "select", name: "documentPackKind", label: "Documents assembled", required: true, placeholder: "Choose", placeholderDisabled: true, options: packKinds },
        provenance("documentPackKindProvenance", "Where this came from", false),
        { kind: "note", text: "Say where the answer came from whenever one is chosen." },
      ]}
      values={{ id, ...raw }}
      action={saveMethodDocumentPack}
      submitLabel="Save"
      trigger={{ label: "Edit", className: ghost, ariaLabel: `Edit the documents assembled for ${name}` }}
      size="md"
    />
  );
}

// ------------------------------------------------------------------ parts

export type PartValues = Record<string, string>;

export function PartDrawer({
  part,
  options,
}: {
  part?: { id: string; label: string; values: PartValues };
  options: { packKinds: Option[]; bases: Option[]; templates: Option[]; units: Option[]; roles: Option[]; contents: Option[]; sources: Option[] };
}) {
  return (
    <RecordEditor
      title={part ? `Edit ${part.label}` : "Add a part"}
      description="A part of the pack, per basis. A basis part replaces the every-basis part."
      columns={2}
      fields={[
        hidden("id"),
        ...(part ? [hidden("code")] : [{ kind: "text", name: "code", label: "Code", required: true, mono: true, hint: "Lower case letters, numbers and underscores. A key, not shown to officers; it cannot be changed." } as Field]),
        { kind: "select", name: "packKind", label: "Documents", required: true, placeholder: "Choose", options: options.packKinds },
        { kind: "select", name: "contractBasisCode", label: "Contract basis", placeholder: "Every basis", options: options.bases },
        { kind: "text", name: "printedNumber", label: "Printed number", required: true, hint: "As the part is numbered when the documents are printed, e.g. 7a." },
        { kind: "number", name: "sortOrder", label: "Print order", min: 0, hint: "Parts print from the lowest." },
        { kind: "text", name: "labelEn", label: "Name", required: true },
        { kind: "hidden", name: "labelMs" },
        { kind: "select", name: "role", label: "What the part is", required: true, placeholder: "Choose", options: options.roles, hint: "Rules recognise a part by what it is, not by its name." },
        { kind: "select", name: "content", label: "Content", required: true, placeholder: "Choose", options: options.contents },
        { kind: "select", name: "source", label: "Where its content comes from", required: true, placeholder: "Choose", options: options.sources },
        { kind: "select", name: "templateCode", label: "Template it draws", placeholder: "Chosen on each exercise", options: options.templates, hint: "Only for a part drawn from the template library, and never a bespoke one." },
        { kind: "select", name: "mandatory", label: "Mandatory", required: true, placeholder: "Choose", placeholderDisabled: true, options: THREE, hint: "Not set holds submission back, naming this setting." },
        { kind: "select", name: "inTableDocument", label: "In the Tender Table Document", required: true, placeholder: "Choose", placeholderDisabled: true, options: THREE, hint: "Not set holds submission back, naming this setting." },
        { kind: "select", name: "returnedByBidder", label: "Returned by the bidder", required: true, placeholder: "Choose", placeholderDisabled: true, options: THREE, hint: "Whether a bidder returns this part with its bid, so the opening checks each bid for it. Not set holds an opening's finalising back where the part is mandatory. The declaration is returned by definition." },
        provenance("returnedByBidderProvenance", "Where the return answer came from"),
        { kind: "select", name: "ownerOrgUnitCode", label: "Prepared by", placeholder: "Not set", options: options.units },
        { kind: "text", name: "governingSource", label: "Where it is required", hint: "The document that asks for it." },
        provenance("provenance", "Where this came from", true),
        { kind: "textarea", name: "notes", label: "Notes" },
      ]}
      values={part ? { ...part.values, id: part.id } : undefined}
      showWhen={{ templateCode: { name: "source", in: ["TEMPLATE"] }, returnedByBidderProvenance: { name: "returnedByBidder", in: ["yes", "no"] } }}
      action={saveTenderPart}
      submitLabel={part ? "Save" : "Add the part"}
      trigger={part ? { label: "Edit", className: ghost, ariaLabel: `Edit ${part.label}` } : { label: "Add a part", icon: true, className: buttonClass("primary", "sm") }}
      size="xl"
    />
  );
}

export function RetirePartDrawer({ id, label }: { id: string; label: string }) {
  return (
    <RecordEditor
      title={`Retire ${label}`}
      description="New packs omit the part. Started packs keep it. It can be restored."
      fields={[hidden("id"), { kind: "date", name: "retiredOn", label: "Retired from", required: true }]}
      values={{ id }}
      destructive={{ reasonLabel: "Why it is retired" }}
      cancelLabel="Keep the part"
      action={retireTenderPart}
      submitLabel="Retire the part"
      trigger={{ label: "Retire", className: buttonClass("destructive", "sm"), ariaLabel: `Retire ${label}` }}
      size="sm"
    />
  );
}

export function RestorePartDrawer({ id, label }: { id: string; label: string }) {
  return (
    <RecordEditor
      title={`Restore ${label}`}
      description="New packs take the part again. Refused if another live part has the same role."
      fields={[hidden("id")]}
      values={{ id }}
      reason={{ label: "Why it is restored" }}
      action={restoreTenderPart}
      submitLabel="Restore the part"
      trigger={{ label: "Restore", className: secondary, ariaLabel: `Restore ${label}` }}
      size="sm"
    />
  );
}

// ------------------------------------------------------------------ policy

export function EditTenderPolicy({ values, taxonomies = [] }: { values: Record<string, string>; taxonomies?: Option[] }) {
  return (
    <RecordEditor
      title="Edit the tender documents policy"
      description="Each value is the organisation's own. Empty stays unset."
      columns={2}
      fields={[
        { kind: "textarea", name: "restrictionStampTextEn", label: "Stamp wording, English", hint: "The wording stamped on a restricted tender, as it is to be printed. Nothing is stamped while this is empty." },
        { kind: "textarea", name: "restrictionStampTextMs", label: "Stamp wording, Malay", hint: "The same, for documents issued in Malay." },
        { kind: "text", name: "restrictionLabelEn", label: "Restriction question", hint: "The question an officer answers on each exercise, in the organisation's own words. Not set, the question has no wording." },
        provenance("restrictionProvenance", "Restriction wording, source"),
        { kind: "select", name: "assuranceRequired", label: "Assurance required", hint: "Whether the two assurance confirmations are required before documents go for approval.", placeholder: "Not set", options: [{ value: "yes", label: "Yes" }, { value: "no", label: "No, recorded as a decision" }] },
        provenance("assuranceProvenance", "Assurance answer, source"),
        { kind: "note", text: "Not set holds every submission back: no answer is assumed." },
        { kind: "text", name: "ladDailyPct", label: "LAD a day, % of contract sum", hint: `Liquidated damages a day, as a percentage of the contract sum. ${pctHint(PCT_COLUMN.ladDailyPct)}` },
        provenance("ladDailyPctProvenance"),
        { kind: "money", name: "firstCertificateFloor", label: "First interim, amount cap", hint: "The amount that caps the first interim certificate's minimum." },
        { kind: "text", name: "firstCertificatePct", label: "First interim, % of builders' works", hint: `The first interim certificate's percentage of the builders' works value. ${pctHint(PCT_COLUMN.firstCertificatePct)}` },
        provenance("firstCertificateProvenance"),
        { kind: "note", text: "Set both the amount and the percentage, or neither. The minimum is the lesser of the two, worked out at award." },
        { kind: "number", name: "insuranceExtraMonths", label: "Insurance tail, months", hint: "Insurance beyond the defects liability period.", min: 0 },
        { kind: "number", name: "insuranceExtraDays", label: "Insurance tail, days", min: 0 },
        provenance("insuranceExtraProvenance"),
        { kind: "note", text: "Both months and days are needed for the period to be worked out." },
        { kind: "number", name: "dbInsuranceExtraMonths", label: "Design and build tail, months", hint: "Insurance beyond the defects liability period, for a design and build contract.", min: 0 },
        { kind: "number", name: "dbInsuranceExtraDays", label: "Design and build tail, days", min: 0 },
        provenance("dbInsuranceExtraProvenance"),
        { kind: "select", name: "regulatorPermitTaxonomyCode", label: "Permit list", placeholder: "Not set", options: taxonomies, hint: "The list of regulator permits: a list under Reference data, its values the permit types an exercise chooses from. A list that contract types are mapped into is not offered." },
        { kind: "text", name: "governingSource", label: "Where the policy is written", hint: "The document that sets these." },
        { kind: "textarea", name: "notes", label: "Notes" },
      ]}
      values={values}
      action={saveTenderPolicy}
      submitLabel="Save the policy"
      trigger={{ label: "Edit the policy", className: secondary }}
      size="xl"
    />
  );
}

// ------------------------------------------------------------------ what a bidder may upload for a part, online

export function PartBidRulesDrawer({ id, label, values }: { id: string; label: string; values: Record<string, string> }) {
  return (
    <RecordEditor
      title={`Online upload rules: ${label}`}
      description="What a bidder may upload. An online exercise cannot publish without types and size."
      fields={[
        hidden("id"),
        { kind: "tokens", name: "bidAcceptedMediaTypes", label: "File types a bidder may upload", placeholder: "Not set", options: BID_PART_MEDIA_TYPES.map((t) => ({ value: t, label: mediaLabel(t) })), hint: "Only types the portal can recognise from the file itself. A file whose contents are another type is refused." },
        { kind: "number", name: "bidMaxMegabytes", label: "Largest file, in megabytes", min: 1, hint: "Leave empty if it is not decided. The system's own ceiling applies as well." },
        { kind: "select", name: "openingCheck", label: "Checked at the opening", placeholder: "Not set", options: THREE, hint: "Whether the opening officers may download this file to check it. Not set holds publication back for a returned part." },
        provenance("openingCheckProvenance", "Where the opening-check answer comes from"),
      ]}
      values={{ id, ...values }}
      showWhen={{ openingCheckProvenance: { name: "openingCheck", in: ["yes", "no"] } }}
      reason={{ label: "Why the rules are changed" }}
      action={saveTenderPartBidRules}
      submitLabel="Propose"
      trigger={{ label: "Online rules", className: secondary, ariaLabel: `Online upload rules for ${label}` }}
      size="md"
    />
  );
}
