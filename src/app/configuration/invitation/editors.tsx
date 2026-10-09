import { RecordEditor, type Field } from "@/components/record-editor";
import { buttonClass } from "@/components/ui/button";
import { RULE_LABEL } from "@/lib/window/labels";
import { BID_RULES_APPLY_TEXT } from "@/lib/bids/config";
import { OPENING_RULES_APPLY_TEXT } from "@/lib/opening/config";

import { saveMethodBidRule, saveMethodOpeningRule, saveOpeningPolicy, importHolidayYear, removeFeeFloor, removeHoliday, saveCalendar, saveCalendarYear, saveChannel, saveFeeFloor, saveHoliday, saveWindowPolicy, setCalendarRetired, setChannelRetired } from "./actions";

/**
 * Configuration › Invitation controls drawers. No field carries a default: a value left not set
 * blocks the act it governs and says so, and a value set says where it came from. Each save is
 * audited with its before and after; a change to the policy asks for a reason.
 */

type Option = { value: string; label: string };
const hidden = (name: string): Field => ({ kind: "hidden", name });
const ghost = buttonClass("ghost", "sm");
const secondary = buttonClass("secondary", "sm");
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

// ------------------------------------------------------------------ policy

export function EditWindowPolicy({ values, channels, calendars, templates }: { values: Record<string, string>; channels: Option[]; calendars: Option[]; templates: Option[] }) {
  return (
    <RecordEditor
      title="Edit the window rules"
      description="Leave a value not set if it has not been decided: it then blocks the act it governs, naming itself. Nothing is defaulted. Say where each group of values comes from."
      columns={2}
      fields={[
        { kind: "number", name: "minAdvertisementDays", label: "Minimum days from advertisement to closing", min: 0 },
        { kind: "number", name: "targetAdvertisementDays", label: "Target days from advertisement to closing", min: 0, hint: "Below it is a warning, not a refusal." },
        { kind: "number", name: "newspaperWarnDays", label: "Margin for a late newspaper (days)", min: 0 },
        { kind: "number", name: "purchaseCutoffDays", label: RULE_LABEL.purchaseCutoff, min: 0, hint: "Exactly this many passes." },
        provenance("dateRulesProvenance", "Where the date rules come from"),
        { kind: "text", name: "dateRuleSource", label: "The source the date rules cite", hint: "Quoted in the messages that refuse a date. Leave empty to cite none." },
        { kind: "text", name: "defaultClosingTime", label: "Default closing time", placeholder: "14:30", hint: "24-hour. Another time needs a reason on the window." },
        provenance("closingTimeProvenance", "Where the closing time comes from"),
        { kind: "select", name: "advertisementDayRule", label: "Which publication day is the advertisement day", placeholder: "Not set", options: [{ value: "LATEST_REQUIRED_CHANNEL", label: "The latest day among the required channels" }, { value: "NAMED_CHANNEL", label: "The day of one named channel" }] },
        { kind: "select", name: "advertisementChannelId", label: "The named channel", placeholder: "None", options: channels, hint: "Only where one channel is named. It must be a required channel." },
        provenance("dayRuleProvenance", "Where the advertisement-day rule comes from"),
        { kind: "select", name: "calendarId", label: "Holiday calendar", placeholder: "Not set", options: calendars },
        { kind: "select", name: "mandatoryAttendancePermitted", label: RULE_LABEL.mandatoryAttendance, placeholder: "Not set", options: [{ value: "yes", label: "Yes, it may be" }, { value: "no", label: "No, it may not" }, { value: "unset", label: "Not set: no event is mandatory" }] },
        provenance("attendanceProvenance", "Where the attendance rule comes from"),
        { kind: "select", name: "electronicDocumentRelease", label: "Release the tender documents online after payment", placeholder: "Not set", options: [{ value: "yes", label: "Yes, once an officer records the payment" }, { value: "no", label: "No, collected at the counter only" }, { value: "unset", label: "Not set: nothing is released online" }], hint: "A supplier asks online and an officer records the sale and the payment receipt. Paying online is not available." },
        provenance("electronicReleaseProvenance", "Where the release decision comes from"),
        { kind: "select", name: "noticeTemplateId", label: "Template for the published notice", placeholder: "Not set", options: templates },
        { kind: "select", name: "invitationTemplateId", label: "Template for a letter of invitation", placeholder: "Not set", options: templates },
        { kind: "select", name: "addendumTemplateId", label: "Template for an addendum", placeholder: "Not set", options: templates },
        { kind: "textarea", name: "notes", label: "Notes" },
      ]}
      values={values}
      reason={{ label: "Why the rules are changed" }}
      action={saveWindowPolicy}
      submitLabel="Save"
      trigger={{ label: "Edit the rules", className: buttonClass("primary", "sm") }}
      size="lg"
    />
  );
}

// ------------------------------------------------------------------ channels

export function ChannelDrawer({ channel }: { channel?: { id: string; name: string; values: Record<string, string> } }) {
  return (
    <RecordEditor
      title={channel ? `Edit ${channel.name}` : "Add a publication channel"}
      description="Where an advertised exercise's notice appears. Whether a channel is required is the organisation's to say: not set holds publication back, naming it."
      columns={2}
      fields={[
        hidden("id"),
        ...(channel ? [hidden("code")] : [{ kind: "text", name: "code", label: "Code", required: true, mono: true, hint: "Lower case letters, numbers and underscores. A key, not shown to officers; it cannot be changed." } as Field]),
        { kind: "text", name: "nameEn", label: "Name", required: true },
        { kind: "text", name: "nameMs", label: "Name in Malay" },
        { kind: "select", name: "requiredWhenAdvertised", label: "Required for an advertised exercise", placeholder: "Not set", options: THREE },
        { kind: "number", name: "sortOrder", label: "Order", min: 0 },
        { kind: "text", name: "governingSource", label: "Where it is required" },
        provenance("provenance", "Where this came from", true),
        { kind: "textarea", name: "notes", label: "Notes" },
      ]}
      values={channel ? { ...channel.values, id: channel.id } : undefined}
      action={saveChannel}
      submitLabel={channel ? "Save" : "Add the channel"}
      trigger={channel ? { label: "Edit", className: ghost, ariaLabel: `Edit ${channel.name}` } : { label: "Add a channel", icon: true, className: buttonClass("secondary", "sm") }}
      size="md"
    />
  );
}

export function RetireChannelDrawer({ id, name, retired }: { id: string; name: string; retired: boolean }) {
  return (
    <RecordEditor
      title={retired ? `Bring ${name} back` : `Retire ${name}`}
      description={retired ? "It is offered again on new exercises." : "It stays on every publication already recorded through it, and is no longer offered on new ones."}
      fields={[hidden("id"), hidden("retire")]}
      values={{ id, retire: retired ? "no" : "yes" }}
      {...(retired ? {} : { destructive: { reasonLabel: "Why it is retired" } })}
      action={setChannelRetired}
      submitLabel={retired ? "Bring it back" : `Retire ${name}`}
      trigger={{ label: retired ? "Restore" : "Retire", className: ghost, ariaLabel: `${retired ? "Restore" : "Retire"} ${name}` }}
      size="sm"
    />
  );
}

// ------------------------------------------------------------------ fee floors

export function FloorDrawer({ regimes, floor }: { regimes: Option[]; floor?: { id: string; label: string; values: Record<string, string> } }) {
  return (
    <RecordEditor
      title={floor ? `Edit the least fee for ${floor.label}` : "Set a least fee for a band"}
      description="The window's document fee is refused below the least for its band. A band with none set holds publication back, naming it."
      columns={2}
      fields={[
        hidden("id"),
        { kind: "select", name: "regime", label: "Band", required: true, placeholder: "Choose", options: regimes },
        { kind: "money", name: "minimum", label: "Least fee", required: true },
        { kind: "text", name: "governingSource", label: "Where it is required" },
        provenance("provenance", "Where this came from", true),
        { kind: "textarea", name: "notes", label: "Notes" },
      ]}
      values={floor ? { ...floor.values, id: floor.id } : undefined}
      action={saveFeeFloor}
      submitLabel={floor ? "Save" : "Set the least fee"}
      trigger={floor ? { label: "Edit", className: ghost, ariaLabel: `Edit the least fee for ${floor.label}` } : { label: "Set a least fee", icon: true, className: buttonClass("secondary", "sm") }}
      size="md"
    />
  );
}

export function RemoveFloorDrawer({ id, label }: { id: string; label: string }) {
  return (
    <RecordEditor
      title={`Remove the least fee for ${label}`}
      description="The band then has none, and its exercises cannot be published until one is set."
      fields={[hidden("id")]}
      values={{ id }}
      destructive={{ reasonLabel: "Why it is removed" }}
      cancelLabel="Keep it"
      action={removeFeeFloor}
      submitLabel="Remove it"
      trigger={{ label: "Remove", className: ghost, ariaLabel: `Remove the least fee for ${label}` }}
      size="sm"
    />
  );
}

// ------------------------------------------------------------------ calendars

const WEEKDAYS: Option[] = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"].map((d, i) => ({ value: String(i + 1), label: d }));

export function CalendarDrawer({ calendar }: { calendar?: { id: string; name: string; values: Record<string, string> } }) {
  return (
    <RecordEditor
      title={calendar ? `Edit ${calendar.name}` : "Add a holiday calendar"}
      description="A closing date may not fall on a weekend day or a public holiday of the calendar. Empty weekend days are not set, and block the check."
      columns={2}
      fields={[
        hidden("id"),
        ...(calendar ? [hidden("code")] : [{ kind: "text", name: "code", label: "Code", required: true, mono: true, hint: "A key, not shown to officers; it cannot be changed." } as Field]),
        { kind: "text", name: "name", label: "Name", required: true },
        { kind: "tokens", name: "weekendDays", label: "Weekend days", placeholder: "Not set", options: WEEKDAYS },
        provenance("weekendProvenance", "Where the weekend comes from"),
        { kind: "text", name: "governingSource", label: "Where it is published" },
        provenance("provenance", "Where this came from", true),
        { kind: "textarea", name: "notes", label: "Notes" },
      ]}
      values={calendar ? { ...calendar.values, id: calendar.id } : undefined}
      action={saveCalendar}
      submitLabel={calendar ? "Save" : "Add the calendar"}
      trigger={calendar ? { label: "Edit", className: ghost, ariaLabel: `Edit ${calendar.name}` } : { label: "Add a calendar", icon: true, className: buttonClass("secondary", "sm") }}
      size="md"
    />
  );
}

export function RetireCalendarDrawer({ id, name, retired }: { id: string; name: string; retired: boolean }) {
  return (
    <RecordEditor
      title={retired ? `Bring ${name} back` : `Retire ${name}`}
      description={retired ? "It can be chosen again." : "The rules refuse to save while they name a retired calendar: choose another first."}
      fields={[hidden("id"), hidden("retire")]}
      values={{ id, retire: retired ? "no" : "yes" }}
      {...(retired ? {} : { destructive: { reasonLabel: "Why it is retired" } })}
      action={setCalendarRetired}
      submitLabel={retired ? "Bring it back" : `Retire ${name}`}
      trigger={{ label: retired ? "Restore" : "Retire", className: ghost, ariaLabel: `${retired ? "Restore" : "Retire"} ${name}` }}
      size="sm"
    />
  );
}

export function YearDrawer({ calendarId, calendar, year }: { calendarId: string; calendar: string; year?: { year: number; complete: boolean; source: string; provenance: string } }) {
  return (
    <RecordEditor
      title={year ? `${calendar}, ${year.year}` : `Say how a year of ${calendar} stands`}
      description="A closing in a year not maintained in full is refused, naming this setting. Marking a year complete is the organisation's statement that every public holiday of it is listed."
      columns={2}
      fields={[
        hidden("calendarId"),
        year ? hidden("year") : { kind: "number", name: "year", label: "Year", required: true },
        { kind: "switch", name: "complete", label: "Every public holiday of the year is listed", hint: "Leave off while the list is incomplete." },
        { kind: "text", name: "source", label: "Where the year's list comes from", hint: "For example the gazette notice." },
        provenance("provenance", "Where this came from", true),
      ]}
      values={{ calendarId, ...(year ? { year: String(year.year), complete: year.complete, source: year.source, provenance: year.provenance } : {}) }}
      action={saveCalendarYear}
      submitLabel="Save"
      trigger={year ? { label: "Edit", className: ghost, ariaLabel: `Edit ${calendar}, ${year.year}` } : { label: "Add a year", icon: true, className: secondary }}
      size="md"
    />
  );
}

export function HolidayDrawer({ calendarId, calendar }: { calendarId: string; calendar: string }) {
  return (
    <RecordEditor
      title={`Add a public holiday to ${calendar}`}
      description="One day, with the gazette notice that appoints it."
      columns={2}
      fields={[
        hidden("calendarId"),
        { kind: "date", name: "day", label: "Day", required: true },
        { kind: "text", name: "nameEn", label: "Name", required: true },
        { kind: "text", name: "nameMs", label: "Name in Malay" },
        { kind: "text", name: "gazetteRef", label: "Gazette reference" },
        provenance("provenance", "Where this came from", true),
      ]}
      values={{ calendarId }}
      action={saveHoliday}
      submitLabel="Add the holiday"
      trigger={{ label: "Add a holiday", icon: true, className: secondary }}
      size="md"
    />
  );
}

export function RemoveHolidayDrawer({ id, name }: { id: string; name: string }) {
  return (
    <RecordEditor
      title={`Remove ${name}`}
      description="A holiday added in error. A closing on that day is then no longer refused."
      fields={[hidden("id")]}
      values={{ id }}
      destructive={{ reasonLabel: "Why it is removed" }}
      cancelLabel="Keep it"
      action={removeHoliday}
      submitLabel="Remove the holiday"
      trigger={{ label: "Remove", className: ghost, ariaLabel: `Remove ${name}` }}
      size="sm"
    />
  );
}

export function ImportYearDrawer({ calendarId, calendar }: { calendarId: string; calendar: string }) {
  return (
    <RecordEditor
      title={`Import a year's holidays into ${calendar}`}
      description="Paste one holiday a line: the day (2026-12-25), the name, then optionally the name in Malay and the gazette reference, separated by commas. Every line is checked first, and nothing is taken from a list with a fault. Whether the year is then complete is said separately."
      fields={[
        hidden("calendarId"),
        { kind: "number", name: "year", label: "Year", required: true },
        provenance("provenance", "Where this came from", true),
        { kind: "textarea", name: "csv", label: "The year's holidays", required: true, placeholder: "2026-12-25,Christmas Day" },
      ]}
      values={{ calendarId }}
      action={importHolidayYear}
      submitLabel="Import"
      trigger={{ label: "Import a year", className: secondary }}
      size="lg"
    />
  );
}

// ------------------------------------------------------------------ 6.6: a method's bid-receipt rules

export function EditMethodBidRule({ id, name, values, committees }: { id: string; name: string; values: Record<string, string>; committees: Option[] }) {
  return (
    <RecordEditor
      title={`Bid receipt under ${name}`}
      description={`Each may be left not set: it then holds back what it governs and says so. Late admission is never read as a refusal; an unset minimum is never read as met. ${BID_RULES_APPLY_TEXT}`}
      columns={2}
      fields={[
        hidden("id"),
        { kind: "select", name: "lateAdmissionCommitteeCode", label: "Committee that decides late admission", placeholder: "Not set", options: committees, hint: "Each late envelope is tabled at its sitting: carried admits it." },
        provenance("lateAdmissionProvenance"),
        { kind: "number", name: "minimumBids", label: "Fewest bids expected", min: 1, hint: "Fewer is shown to the committee, never refused. One bid is flagged and proceeds." },
        provenance("minimumBidsProvenance"),
        { kind: "select", name: "completenessEliminates", label: "An incomplete bid", required: true, placeholder: "Choose", placeholderDisabled: true, options: [{ value: "yes", label: "Is eliminated" }, { value: "no", label: "Is reported to the committee" }, { value: "unset", label: "Not set" }] },
        provenance("completenessProvenance"),
      ]}
      values={{ id, ...values }}
      action={saveMethodBidRule}
      submitLabel="Save"
      trigger={{ label: "Edit", className: ghost, ariaLabel: `Edit the bid receipt rules for ${name}` }}
      size="lg"
    />
  );
}

// ------------------------------------------------------------------ 6.7: a method's opening rules, and the opening policy

export function EditMethodOpeningRule({ id, name, values, committees }: { id: string; name: string; values: Record<string, string>; committees: Option[] }) {
  return (
    <RecordEditor
      title={`Opening under ${name}`}
      description={`Each may be left not set: it then holds back what it governs and says so. ${OPENING_RULES_APPLY_TEXT}`}
      columns={2}
      fields={[
        hidden("id"),
        { kind: "select", name: "openingCommitteeCode", label: "Committee whose panel opens the bids", placeholder: "Not set", options: committees, hint: "Its opening panel size and independence rule are set under Committees." },
        provenance("openingCommitteeProvenance"),
        { kind: "select", name: "unpurchasedBidConsequence", label: "A bid by a bidder with no live purchase, or not invited", placeholder: "Not set", options: [{ value: "ELIMINATE", label: "Is not carried to evaluation" }, { value: "REPORT", label: "Is carried, and reported to the committee" }] },
        provenance("unpurchasedProvenance"),
      ]}
      values={{ id, ...values }}
      reason={{ label: "Why the rules are changed" }}
      action={saveMethodOpeningRule}
      submitLabel="Save"
      trigger={{ label: "Edit", className: ghost, ariaLabel: `Edit the opening rules for ${name}` }}
      size="lg"
    />
  );
}

export function EditOpeningPolicy({ values }: { values: Record<string, string> }) {
  return (
    <RecordEditor
      title="Edit the opening policy"
      description={`How the schedule counts the tenderers invited, and the words the Grand Summary uses. A count not set holds finalising back; words not set read the product's own. ${OPENING_RULES_APPLY_TEXT}`}
      columns={2}
      fields={[
        { kind: "select", name: "invitedCountReading", label: "The tenderers invited are", placeholder: "Not set", options: [{ value: "PURCHASERS", label: "The bidders who bought the documents" }, { value: "INVITEES", label: "The bidders sent a letter of invitation" }] },
        provenance("invitedCountProvenance"),
        { kind: "text", name: "qualifiedLabelEn", label: "A bid that passed", hint: "The Grand Summary's word. Empty: Qualified." },
        { kind: "text", name: "qualifiedLabelMs", label: "A bid that passed, in Malay" },
        { kind: "text", name: "notQualifiedLabelEn", label: "A bid that did not pass", hint: "Empty: Not qualified." },
        { kind: "text", name: "notQualifiedLabelMs", label: "A bid that did not pass, in Malay" },
        { kind: "text", name: "lowestLabelEn", label: "The lowest qualifying offer", hint: "Empty: Lowest qualifying offer." },
        { kind: "text", name: "lowestLabelMs", label: "The lowest qualifying offer, in Malay" },
        provenance("labelsProvenance", "Where the words came from"),
        { kind: "text", name: "governingSource", label: "Where it is written" },
      ]}
      values={values}
      reason={{ label: "Why the policy is changed" }}
      action={saveOpeningPolicy}
      submitLabel="Save"
      trigger={{ label: "Edit the opening policy", className: secondary }}
      size="lg"
    />
  );
}
