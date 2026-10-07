import { Blocked } from "@/app/requisitions/editors";
import { RecordEditor, type Field } from "@/components/record-editor";
import { buttonClass } from "@/components/ui/button";
import { actorField } from "@/lib/auth/actor-field";
import { Callout } from "@/components/ui/feedback";

import { TENDERING_STATE_LABEL } from "@/lib/tender-docs/labels";

import { REFRESH_LABEL, type RefreshView } from "@/lib/tender-docs/refresh";

import { markPartReady, omitPart, pickPartTemplate, recordTenderingDecision, refreshPartFlags, reopenPart, startPack, submitPack } from "./actions";

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
      description="The parts are taken from the configuration as it stands today and kept with the version."
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
export function SubmitPackDrawer({ exerciseId, rows, warnings, today }: { exerciseId: string; rows: [string, string][]; warnings: string[]; today: string | null }) {
  return (
    <RecordEditor
      title="Submit for Approval for Tendering"
      description="Submitting freezes this version: each part's text is stored as it reads now, the bill of quantities is issued unpriced and files are pinned. A version that is frozen is changed only by returning it. If anything is still missing, submitting says what it is and nothing is frozen."
      columns={2}
      fields={[
        hidden("exerciseId"),
        { kind: "date", name: "startOn", label: "Tendering starts on", required: true, hint: "Today or later. Where the notice states the validity window, it states these days, and the approver records them." },
        { kind: "date", name: "closingDay", label: "Closing day", required: true, hint: "After the start day." },
        { kind: "text", name: "closingTime", label: "Closing time", required: true, placeholder: "14:30", hint: "Hours and minutes, 24-hour, the organisation's clock." },
      ]}
      values={{ exerciseId }}
      sections={
        <div className="flex flex-col gap-4">
          <Facts rows={rows} />
          {warnings.map((w) => (
            <Callout key={w} tone="warn">{w}</Callout>
          ))}
          {!today && <Callout tone="warn">The organisation&apos;s time zone is not set, so the dates cannot be judged. Set it under Configuration, Organisation.</Callout>}
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
      description="A version keeps the answers it was started with. Where the configuration has since said whether a part is mandatory, or is in the Tender Table Document, they are taken into this draft. A frozen version is never changed."
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

export function PickTemplateDrawer({ exerciseId, partId, partLabel, options, current }: { exerciseId: string; partId: string; partLabel: string; options: Option[]; current: string }) {
  return (
    <RecordEditor
      title={`Template for ${partLabel}`}
      description="The part is printed from the template's text as it stands when the version is submitted. Choosing another takes the part back to not ready."
      fields={[hidden("exerciseId"), hidden("partId"), { kind: "select", name: "templateId", label: "Template", required: true, placeholder: "Choose", options }]}
      values={{ exerciseId, partId, templateId: current }}
      action={pickPartTemplate}
      submitLabel="Use this template"
      trigger={{ label: "Template", className: ghost, ariaLabel: `Choose the template for ${partLabel}` }}
      size="md"
    />
  );
}

export function MarkReadyDrawer({ exerciseId, partId, partLabel, allowed }: { exerciseId: string; partId: string; partLabel: string; allowed: Allowed }) {
  if (!allowed.allowed) return null;
  return (
    <RecordEditor
      title={`Mark ${partLabel} ready`}
      description="It is checked again as it is saved: its template, file, bill or Appendix must be in place."
      fields={[hidden("exerciseId"), hidden("partId")]}
      values={{ exerciseId, partId }}
      action={markPartReady}
      submitLabel="Mark ready"
      trigger={{ label: "Mark ready", className: secondary, ariaLabel: `Mark ${partLabel} ready` }}
      size="sm"
    />
  );
}

export function OmitPartDrawer({ exerciseId, partId, partLabel, allowed }: { exerciseId: string; partId: string; partLabel: string; allowed: Allowed }) {
  if (!allowed.allowed) return null;
  return (
    <RecordEditor
      title={`Omit ${partLabel}`}
      description="The part is left out of this version, and the reason goes on its record. It can be put back until the version is submitted."
      fields={[hidden("exerciseId"), hidden("partId")]}
      values={{ exerciseId, partId }}
      destructive={{ reasonLabel: "Why it is omitted" }}
      cancelLabel="Keep the part"
      action={omitPart}
      submitLabel="Omit the part"
      trigger={{ label: "Omit", className: ghost, ariaLabel: `Omit ${partLabel}` }}
      size="sm"
    />
  );
}

export function ReopenPartDrawer({ exerciseId, partId, partLabel, state }: { exerciseId: string; partId: string; partLabel: string; state: string }) {
  return (
    <RecordEditor
      title={state === "Omitted" ? `Put ${partLabel} back` : `Rework ${partLabel}`}
      description="The part goes back to not ready, to be made ready again."
      fields={[hidden("exerciseId"), hidden("partId")]}
      values={{ exerciseId, partId }}
      action={reopenPart}
      submitLabel={state === "Omitted" ? "Put it back" : "Take it back to not ready"}
      trigger={{ label: state === "Omitted" ? "Put back" : "Rework", className: ghost, ariaLabel: `${state === "Omitted" ? "Put back" : "Rework"} ${partLabel}` }}
      size="sm"
    />
  );
}

/// What the approving step is shown when a frozen notice states the validity window (decisionWindow).
export type FixedWindow = { startOn: string; closingDay: string; startText: string; closingText: string; note: string };

export function DecideDrawer({ exerciseId, stepId, office, done, people, today, recordsDates, proposed, fixedWindow }: { exerciseId: string; stepId: string; office: string; done: string; people: Option[]; today: string | null; recordsDates: boolean; proposed: { startOn: string; closingDay: string; closingTime: string } | null; fixedWindow?: FixedWindow | null }) {
  return (
    <RecordEditor
      title={`Record ${office}'s decision`}
      description={`The holder signs in and decides it with their password. A decision that came from paper is recorded for them by someone else, and is not signed. Whoever it is for must hold the office for the requisition's department, or a delegation of it. A refusal returns the documents for amendment.${recordsDates ? " This is the last step: it records the dates tendering starts and closes." : ""}`}
      fields={[
        hidden("exerciseId"),
        hidden("stepId"),
        { kind: "select", name: "decision", label: "Decision", required: true, placeholder: "Choose", options: [{ value: "DONE", label: done }, { value: "REJECTED", label: TENDERING_STATE_LABEL.RETURNED }] },
        actorField("ApprovalStep.decidedBy", { name: "personId", people, dated: true, hint: people.length === 0 ? "Nobody holds this office for the requisition's department today." : undefined }),
        { kind: "date", name: "decidedOn", label: "Decided on", required: true, hint: "Not after today, nor before it was submitted. A signed decision is dated today unless back-dating is recorded." },
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
                  { kind: "text", name: "closingTime", label: "Closing time", required: true, hint: "Hours and minutes, 24-hour (14:30). The time is not part of the window." },
                ] as Field[])
              : ([
                  { kind: "date", name: "startOn", label: "Tendering starts on", required: true, hint: "As proposed when submitted; the approver may set another. Not before the day decided." },
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
