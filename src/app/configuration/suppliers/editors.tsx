import { RecordEditor, type Field } from "@/components/record-editor";
import { buttonClass } from "@/components/ui/button";
import { REGISTRATION_VALUE_KINDS } from "@/lib/suppliers/types";
import { VALUE_KIND_LABEL } from "@/lib/suppliers/labels";

import { saveDeclarationText, saveDocumentType, saveListValue, savePortalIntake, saveRegistrationSettings, saveRegistrationValue, saveStandingReason, saveStandingRules, saveSupplierPolicy, setDeclarationTextRetired, setDocumentTypeRetired, setListValueRetired, setRegistrationValueRetired, setStandingReasonRetired } from "./actions";

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
      description="What the body publishes. Rank orders grades. Ceilings are shown, never compared."
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
      description="A statutory document. Each switch left not set holds back the act that needs it."
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
        { kind: "text", name: "hintEn", label: "What the applicant is told it is", hint: "Shown beside the upload on the supplier's registration, for example the form's name. Blank: nothing is said." },
        { kind: "text", name: "hintMs", label: "What the applicant is told it is (Malay)" },
        { kind: "select", name: "recordsRate", label: "Whether it records a rate", placeholder: "Not set", options: three("Records a rate (such as a tax rate)", "Records no rate", "Not set: no rate is asked") },
        { kind: "select", name: "repeatable", label: "Whether several may be lodged", placeholder: "Not set", options: three("Several, each with a title", "One only", "Not set: one only") },
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
      description="Chosen when recording a supplier. A retired entry stays on records."
      fields={[
        hidden("id"),
        hidden("list"),
        ...(value ? [hidden("code")] : [{ kind: "text", name: "code", label: "Code", required: true, mono: true, hint: "A key, not shown to officers; it cannot be changed." } as Field]),
        { kind: "text", name: "nameEn", label: "Name", required: true },
        { kind: "text", name: "nameMs", label: "Name (Malay)" },
        // A dial code belongs to a country: shown before the mobile number on the public form. Not set: no prefix is shown and a number is taken as typed.
        ...(list === "COUNTRY" ? [{ kind: "text", name: "callingCode", label: "Dial code", mono: true, hint: "A plus sign and up to six digits, for example +60. Not set: no prefix is shown on the form and the number is taken as typed." } as Field] : []),
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
      description="What the supplier is told about document checks. Not set if undecided."
      fields={[
        { kind: "textarea", name: "verificationNoticeEn", label: "Verification notice" },
        { kind: "textarea", name: "verificationNoticeMs", label: "Verification notice (Malay)" },
        provenance("noticeProvenance", "Where the notice comes from"),
        {
          kind: "select",
          name: "contactRule",
          label: "What a contact must give",
          placeholder: "Not set: an email or a telephone is enough",
          options: [
            { value: "both", label: "Both an email and a mobile number" },
            { value: "either", label: "An email or a mobile number" },
          ],
          hint: "Applies to the public form and to an officer recording a supplier. Not set keeps today's rule, either one.",
        },
        provenance("contactRuleProvenance", "Where the contact rule comes from"),
        { kind: "text", name: "governingSource", label: "Source" },
      ]}
      values={values}
      reason={{ label: "Why the policy changes" }}
      action={saveSupplierPolicy}
      trigger={{ label: "Edit the policy", className: buttonClass("primary", "sm") }}
    />
  );
}

type ClassOption = { value: string; label: string };

export function EditRegistrationSettings({ values, classes }: { values: Record<string, string>; classes: { upload: ClassOption[]; statement: ClassOption[] } }) {
  return (
    <RecordEditor
      title="Edit registration online"
      description="What a registration is judged by. Not set keeps what it governs closed."
      columns={2}
      fields={[
        { kind: "text", name: "helpEmail", label: "Help email", hint: "Shown on the supplier's registration. Blank: no line is shown." },
        { kind: "text", name: "helpPhone", label: "Help telephone" },
        provenance("helpProvenance", "Where the help contact comes from"),
        { kind: "number", name: "maxFiles", label: "Files one registration may hold", min: 1, hint: "Every version uploaded counts, a withdrawn one too: bytes are never deleted. Set both limits, or neither." },
        { kind: "number", name: "maxMegabytes", label: "Megabytes one registration may hold", min: 1 },
        provenance("uploadLimitProvenance", "Where the limits come from"),
        { kind: "select", name: "uploadClassId", label: "Document class of a supplier's uploads", placeholder: "Not set: uploads are closed", options: classes.upload, hint: "A supplier cannot choose a class. Classes are configured under Documents." },
        { kind: "select", name: "statementClassId", label: "Document class of a bank statement", placeholder: "Not set: the statement cannot be uploaded", options: classes.statement, hint: "Only a class classified SULIT is offered: the statement is restricted data." },
        provenance("uploadClassProvenance", "Where the classes come from"),
        { kind: "select", name: "onlineDeclarationReplacesPaper", label: "The declaration signed online", placeholder: "Not set: the paper is still required", options: three("Replaces the paper declaration", "Does not replace it: the paper is still required", "Not set: the paper is still required") },
        provenance("onlineDeclarationProvenance", "Where that ruling comes from"),
      ]}
      values={values}
      reason={{ label: "Why this changes" }}
      action={saveRegistrationSettings}
      trigger={{ label: "Edit registration online", className: buttonClass("secondary", "sm") }}
      size="lg"
    />
  );
}

const DECLARATION_OPTIONS: Option[] = [
  { value: "GIRO_AUTHORISATION", label: "GIRO authorisation" },
  { value: "FALSE_DECLARATION", label: "False-declaration acknowledgement" },
];

export function DeclarationTextDrawer({ text }: { text?: { id: string; name: string; values: Record<string, string> } }) {
  return (
    <RecordEditor
      title={text ? `Edit ${text.name}` : "Add a declaration wording"}
      description={text ? "A wording nobody has signed may be corrected. One that has been signed is never changed: add a new version instead." : "A new wording is a new version, in force from today and replacing the one before it. A supplier part-way through is asked to read it again. Write {organisation} where the wording names the organisation."}
      fields={[
        hidden("id"),
        ...(text ? [hidden("kind")] : [{ kind: "select", name: "kind", label: "Which declaration", required: true, placeholder: "Choose", options: DECLARATION_OPTIONS } as Field]),
        { kind: "textarea", name: "bodyEn", label: "Wording", required: true },
        { kind: "textarea", name: "bodyMs", label: "Wording (Malay)" },
        { kind: "text", name: "governingSource", label: "Source", hint: "The document the wording is taken from." },
        provenance("provenance", "Where it comes from", true),
      ]}
      values={text?.values ?? {}}
      reason={{ label: text ? "Why the wording changes" : "Why a new version is issued" }}
      action={saveDeclarationText}
      trigger={text ? { label: "Edit", className: ghost, ariaLabel: `Edit ${text.name}` } : { label: "Add a wording" }}
      size="lg"
    />
  );
}

export function RetireDeclarationTextDrawer({ id, name, retired }: { id: string; name: string; retired: boolean }) {
  return <Retire id={id} name={name} retired={retired} action={setDeclarationTextRetired} what="wording" />;
}

export function EditPortalIntake({ values }: { values: Record<string, string> }) {
  return (
    <RecordEditor
      title="Edit online applications"
      description="The public form stays closed until the notice and both limits are set."
      columns={2}
      fields={[
        { kind: "textarea", name: "personalDataNoticeEn", label: "Notice about personal details", hint: "Say why the details are collected, that they are needed to review the application, who sees them, how long they are kept and how to ask for access or correction. Shown above the send button." },
        { kind: "textarea", name: "personalDataNoticeMs", label: "Notice about personal details (Malay)" },
        provenance("personalDataProvenance", "Where the notice comes from"),
        { kind: "number", name: "portalDailyLimit", label: "Applications taken in any 24 hours", min: 1, hint: "Once reached, the form says it is busy and takes no more until the earliest have aged out." },
        { kind: "number", name: "portalDailyLimitPerNumber", label: "Applications taken for one registration number in 24 hours", min: 1, hint: "Stops one number being sent over and over. Must not be more than the figure beside it. The cost: anyone can send a company's number this many times and turn that company away online for 24 hours. It can still apply on paper, and the busy message sends it to the office." },
        provenance("portalLimitProvenance", "Where the limits come from"),
      ]}
      values={values}
      reason={{ label: "Why this changes" }}
      action={savePortalIntake}
      trigger={{ label: "Edit online applications", className: buttonClass("secondary", "sm") }}
      size="lg"
    />
  );
}

// ------------------------------------------------------------------ a2: standing reasons and rules

export function StandingReasonDrawer({ reason }: { reason?: { id: string; name: string; values: Record<string, string> } }) {
  return (
    <RecordEditor
      title={reason ? `Edit ${reason.name}` : "Add a standing reason"}
      description="Given for a suspension or blacklisting. Fixed once made. Retired reasons stay on records."
      fields={[
        hidden("id"),
        ...(reason
          ? [hidden("code"), hidden("appliesTo")]
          : ([
              { kind: "select", name: "appliesTo", label: "Given for", required: true, placeholder: "Choose", placeholderDisabled: true, options: [{ value: "SUSPEND", label: "A suspension" }, { value: "BLACKLIST", label: "A blacklisting" }] },
              { kind: "text", name: "code", label: "Code", required: true, mono: true, hint: "A key, not shown to officers; it cannot be changed." },
            ] as Field[])),
        { kind: "text", name: "nameEn", label: "Reason", required: true },
        { kind: "text", name: "nameMs", label: "Reason (Malay)" },
        { kind: "text", name: "governingSource", label: "Source", hint: "The clause or circular it comes from, if any." },
        provenance("provenance", "Where it comes from", true),
        { kind: "number", name: "sortOrder", label: "Order", min: 0 },
      ]}
      values={reason?.values ?? {}}
      action={saveStandingReason}
      {...(reason ? { reason: { label: "Why it changes" } } : {})}
      trigger={reason ? { label: "Edit", className: ghost, ariaLabel: `Edit ${reason.name}` } : { label: "Add a reason" }}
    />
  );
}

export function RetireStandingReasonDrawer({ id, name, retired }: { id: string; name: string; retired: boolean }) {
  return <Retire id={id} name={name} retired={retired} action={setStandingReasonRetired} what="reason" />;
}

export function EditStandingRules({ values, suspensionReasons, documentTypes }: { values: Record<string, string>; suspensionReasons: Option[]; documentTypes: Option[] }) {
  return (
    <RecordEditor
      title="Edit the standing rules"
      description="Not set: the act it governs says so. A rule set shows its source."
      columns={2}
      fields={[
        { kind: "number", name: "criticalDays", label: "Critical, within (days)", min: 0, hint: "A document this many days or fewer from its expiry is critical. Set all three bands, or none." },
        { kind: "number", name: "warningDays", label: "Warning, within (days)", min: 0 },
        { kind: "number", name: "upcomingDays", label: "Upcoming, within (days)", min: 0 },
        provenance("bandsProvenance", "Where the bands come from"),
        { kind: "select", name: "expiryOnClosingDayCounts", label: "A document expiring on the closing day", options: three("Counts as valid for the window", "Does not count as valid", "Not set: read as not assessed") },
        provenance("closingDayProvenance", "Where that comes from"),
        { kind: "select", name: "autoSuspendOnLapse", label: "A registered supplier with an expired mandatory document", options: three("Stands suspended on lapse, until it is renewed and verified", "Stays active, with the expiry noted", "Not set: active, saying the rule is not set") },
        { kind: "select", name: "lapseReasonId", label: "Shown with the reason", placeholder: "None", options: suspensionReasons, hint: "A suspension reason, shown beside a suspension on lapse." },
        provenance("lapseProvenance", "Where that comes from"),
        { kind: "number", name: "blacklistFirstOffenceMonths", label: "A first-offence blacklisting lasts (months)", min: 1, hint: "A later offence lasts until further notice. Not set: a first offence cannot be recorded." },
        provenance("blacklistProvenance", "Where the period comes from"),
        { kind: "select", name: "registerRequiredForSale", label: "Documents sold only to suppliers on the register", options: three("Yes: a purchaser not linked to the register is refused", "No: an unlinked purchaser is sold to, not checked", "Not set: sold to, not checked, saying the rule is not set") },
        provenance("saleProvenance", "Where that comes from"),
        { kind: "select", name: "restrictionEvidenceTypeId", label: "The document that evidences a restricted tender's restriction", placeholder: "Not set", options: documentTypes, hint: "Not set: a restricted tender's restriction reads not assessed." },
        provenance("restrictionProvenance", "Where that comes from"),
        { kind: "select", name: "ineligibleBidConsequence", label: "A linked bidder found not eligible at the opening", options: [{ value: "ELIMINATE", label: "Eliminated at the opening" }, { value: "REPORT", label: "Reported to the committee, which decides" }, { value: "unset", label: "Not set: an opening holding one cannot finalise" }] },
        provenance("ineligibleProvenance", "Where that comes from"),
      ]}
      values={values}
      reason={{ label: "Why the rules change" }}
      action={saveStandingRules}
      trigger={{ label: "Edit the standing rules", className: buttonClass("secondary", "sm") }}
      size="lg"
    />
  );
}

// ------------------------------------------------------------------ retiring

function Retire({ id, name, retired, action, what }: { id: string; name: string; retired: boolean; action: typeof setRegistrationValueRetired | typeof setStandingReasonRetired; what: string }) {
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
