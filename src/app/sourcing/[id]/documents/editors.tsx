import { Blocked } from "@/app/requisitions/editors";
import { RecordEditor, type Field } from "@/components/record-editor";
import { buttonClass } from "@/components/ui/button";
import { actorField } from "@/lib/auth/actor-field";
import { Callout } from "@/components/ui/feedback";

import { TENDERING_STATE_LABEL } from "@/lib/tender-docs/labels";

import { TAKE_PARTS_LABEL } from "@/lib/tender-docs/new-parts";
import { REFRESH_LABEL, type RefreshView } from "@/lib/tender-docs/refresh";

import { pickPartTemplate, recordTenderingDecision, refreshPartFlags, startPack, submitPack, takeNewParts } from "./actions";

/**
 * The drawers of the Tender documents tab. Fields are data; every rule sits in the action and
 * the pure checks behind it. Where the checks already say an act cannot proceed, the control
 * is disabled with the reason beside it (read.ts judges with the rule the action runs).
 */

type Option = { value: string; label: string };
type Allowed = { allowed: true } | { allowed: false; reason: string };
const hidden = (name: string): Field => ({ kind: "hidden", name });
const ghost = buttonClass("ghost", "sm");
const secondary = buttonClass("secondary", "sm");

export function Facts({ rows, notes }: { rows: [string, string][]; notes?: string[] }) {
  return (
    <div className="flex flex-col gap-4">
      <dl className="grid gap-x-4 gap-y-2.5 text-[13.5px] sm:grid-cols-[minmax(0,10rem)_minmax(0,1fr)]">
        {rows.map(([k, v]) => (
          <div key={k} className="contents">
            <dt className="font-semibold text-ink-3">{k}</dt>
            <dd className="min-w-0 break-words text-ink">{v}</dd>
          </div>
        ))}
      </dl>
      {notes && notes.length > 0 && (
        <ul className="flex list-disc flex-col gap-1 pl-5 text-[13px] text-ink-2">
          {notes.map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function StartPackDrawer({ exerciseId, label, allowed, rows, notes }: { exerciseId: string; label: string; allowed: Allowed; rows: [string, string][]; notes: string[] }) {
  if (!allowed.allowed) return <Blocked label="Start the tender documents" reason={allowed.reason} primary />;
  return (
    <RecordEditor
      title={label}
      description="Parts are taken from today's configuration."
      fields={[hidden("exerciseId")]}
      values={{ exerciseId }}
      sections={<Facts rows={rows} notes={notes} />}
      action={startPack}
      submitLabel={label}
      trigger={{ label, className: buttonClass("primary", "sm") }}
      size="md"
    />
  );
}

/**
 * Always openable on a draft: what is still missing is not listed on the screen (founder, 2026-10-05).
 * `submitPack` judges everything under lock and refuses with the list, which this drawer shows.
 */
export function SubmitPackDrawer({ exerciseId, rows, warnings, today, dates }: { exerciseId: string; rows: [string, string][]; warnings: string[]; today: string | null; dates: { start: string | null; closing: string | null } }) {
  return (
    <RecordEditor
      title="Submit for Approval for Tendering"
      description="Freezes this version. Changed only by returning it."
      fields={[hidden("exerciseId")]}
      values={{ exerciseId }}
      sections={
        <div className="flex flex-col gap-4">
          <Facts rows={[...rows, ["Proposed start", dates.start ?? "Not entered"], ["Proposed closing", dates.closing ?? "Not entered"]]} />
          <p className="text-[12.5px] text-ink-3">Days from Key dates on Scope and estimate.</p>
          {warnings.map((w) => (
            <Callout key={w} tone="warn">{w}</Callout>
          ))}
          {!today && <Callout tone="warn">Time zone not set. Dates cannot be judged.</Callout>}
        </div>
      }
      action={submitPack}
      submitLabel="Submit for approval"
      trigger={{ label: "Submit for approval", className: buttonClass("primary", "sm") }}
      size="lg"
    />
  );
}

/// `confirmedChanges` is the key of the list shown: the act writes only that list (64-C2).
export function RefreshFlagsDrawer({ exerciseId, refresh, confirmedChanges }: { exerciseId: string; refresh: RefreshView; confirmedChanges: string }) {
  if (!refresh.allowed) return <Blocked label={REFRESH_LABEL} reason={refresh.reason} />;
  return (
    <RecordEditor
      title={REFRESH_LABEL}
      description="Takes newly configured answers into this draft. Frozen versions never change."
      fields={[hidden("exerciseId"), hidden("confirmedChanges")]}
      values={{ exerciseId, confirmedChanges }}
      sections={
        <ul className="flex list-disc flex-col gap-1 pl-5 text-[13px] text-ink-2">
          {refresh.changes.map((c) => (
            <li key={c}>{c}</li>
          ))}
        </ul>
      }
      action={refreshPartFlags}
      submitLabel="Take them from the configuration"
      trigger={{ label: REFRESH_LABEL, className: secondary }}
      size="md"
    />
  );
}

/// Review M2: the parts configured since this draft was started, taken into it. `confirmedParts` is the key of the list shown: the act writes only that list.
export function TakeNewPartsDrawer({ exerciseId, parts, confirmedParts }: { exerciseId: string; parts: string[]; confirmedParts: string }) {
  return (
    <RecordEditor
      title={TAKE_PARTS_LABEL}
      description="Adds parts configured since. Nothing on the draft is changed."
      fields={[hidden("exerciseId"), hidden("confirmedParts")]}
      values={{ exerciseId, confirmedParts }}
      sections={
        <ul className="flex list-disc flex-col gap-1 pl-5 text-[13px] text-ink-2">
          {parts.map((c) => (
            <li key={c}>{c}</li>
          ))}
        </ul>
      }
      action={takeNewParts}
      submitLabel="Add them to this draft"
      trigger={{ label: TAKE_PARTS_LABEL, className: secondary }}
      size="md"
    />
  );
}

/**
 * Template (SR-11): for a merged-text part, the library template it is merged from and the merged draft to download. The part is issued as that text unless a file is
 * uploaded in its place; there is nothing to mark ready. `file`: the organisation's own template file for this part, where Configuration names one.
 */
export function PickTemplateDrawer({ exerciseId, partId, partLabel, options, current, draftHref, file }: { exerciseId: string; partId: string; partLabel: string; options: Option[]; current: string; draftHref: string | null; file: { filename: string; href: string } | null }) {
  return (
    <RecordEditor
      title={`Template for ${partLabel}`}
      description="Issued as the template text unless a file replaces it."
      fields={[hidden("exerciseId"), hidden("partId"), { kind: "select", name: "templateId", label: "Template", required: true, placeholder: "Choose", options }]}
      values={{ exerciseId, partId, templateId: current }}
      sections={
        <div className="flex flex-col gap-2 text-[13.5px]">
          {draftHref ? (
            <a href={draftHref} className="font-semibold">Download the merged draft</a>
          ) : (
            <p className="text-ink-3">Choose a template to download its merged draft.</p>
          )}
          {file && (
            <a href={file.href} className="font-semibold">
              Download the organisation&apos;s template file: {file.filename}
            </a>
          )}
        </div>
      }
      action={pickPartTemplate}
      submitLabel="Use this template"
      trigger={{ label: "Template", className: ghost, ariaLabel: `Template for ${partLabel}: the merged text and its draft` }}
      size="md"
    />
  );
}

/// What the approving step is shown when a frozen notice states the validity window (decisionWindow).
export type FixedWindow = { startOn: string; closingDay: string; startText: string; closingText: string; note: string };

export function DecideDrawer({ exerciseId, stepId, office, done, people, today, recordsDates, proposed, fixedWindow }: { exerciseId: string; stepId: string; office: string; done: string; people: Option[]; today: string | null; recordsDates: boolean; proposed: { startOn: string; closingDay: string; closingTime: string } | null; fixedWindow?: FixedWindow | null }) {
  return (
    <RecordEditor
      title={`Record ${office}'s decision`}
      description={`Signed with the holder's password. A refusal returns the documents.${recordsDates ? " Last step: records the tendering dates." : ""}`}
      fields={[
        hidden("exerciseId"),
        hidden("stepId"),
        { kind: "select", name: "decision", label: "Decision", required: true, placeholder: "Choose", options: [{ value: "DONE", label: done }, { value: "REJECTED", label: TENDERING_STATE_LABEL.RETURNED }] },
        actorField("ApprovalStep.decidedBy", { name: "personId", people, dated: true, hint: people.length === 0 ? "Nobody holds this office for the department." : undefined }),
        { kind: "date", name: "decidedOn", label: "Decided on", required: true, hint: "Not after today, nor before submission." },
        { kind: "textarea", name: "reason", label: "Reason for returning them", required: true, hint: "Say what is to be amended." },
        ...(recordsDates
          ? (fixedWindow
              ? ([
                  // The notice states the window: its note first, then the days as fixed values; only the time is the approver's.
                  { kind: "readonly", name: "windowNote", label: "Validity window", text: "Stated by the frozen notice", hint: fixedWindow.note },
                  { kind: "readonly", name: "startShown", label: "Tendering starts on", text: fixedWindow.startText },
                  { kind: "readonly", name: "closingShown", label: "Closing day", text: fixedWindow.closingText },
                  hidden("startOn"),
                  hidden("closingDay"),
                  { kind: "text", name: "closingTime", label: "Closing time", required: true, hint: "24-hour, such as 14:30." },
                ] as Field[])
              : ([
                  { kind: "date", name: "startOn", label: "Tendering starts on", required: true, hint: "As proposed. Not before the day decided." },
                  { kind: "date", name: "closingDay", label: "Closing day", required: true, hint: "After the start day." },
                  { kind: "text", name: "closingTime", label: "Closing time", required: true, hint: "Hours and minutes, 24-hour (14:30)." },
                ] as Field[]))
          : []),
      ]}
      values={{ exerciseId, stepId, decidedOn: today, ...(recordsDates && proposed ? proposed : {}), ...(recordsDates && fixedWindow ? { startOn: fixedWindow.startOn, closingDay: fixedWindow.closingDay } : {}) }}
      showWhen={{ reason: { name: "decision", in: ["REJECTED"] }, ...(recordsDates ? { startOn: { name: "decision", in: ["DONE"] }, closingDay: { name: "decision", in: ["DONE"] }, closingTime: { name: "decision", in: ["DONE"] }, windowNote: { name: "decision", in: ["DONE"] }, startShown: { name: "decision", in: ["DONE"] }, closingShown: { name: "decision", in: ["DONE"] } } : {}) }}
      action={recordTenderingDecision}
      submitLabel="Record decision"
      trigger={{ label: "Record decision", className: buttonClass("primary", "sm") }}
      size="md"
    />
  );
}
