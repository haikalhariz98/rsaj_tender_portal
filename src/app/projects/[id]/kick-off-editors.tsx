"use client";

import { useCallback, useRef } from "react";

import { changeKickOff, recordKickOffHeld, scheduleKickOff } from "@/app/projects/[id]/kick-off-actions";
import { EMPTY_FORM_STATE, RecordEditor, type Field, type SaveAction } from "@/components/record-editor";
import { buttonClass } from "@/components/ui/button";

import { kept, stageFiles, withStaged } from "./document-editors";

/**
 * The kick-off meeting's drawers (ADR 0042 D10, PW-18, PW-29; plan step 7 §8.2): schedule it, change it before it is held, record it held with the attendance and the
 * minutes. Each is a client island over the shared RecordEditor and posts to `kick-off-actions.ts`, which judges everything again under the locks. A gate that is shut is
 * rendered as `Blocked` by the card, never as one of these.
 *
 * The minutes are staged first through the upload route, exactly as the New document drawer stages its files (a Server Action body is capped at 1 MB), and only the staged
 * versions' ids are posted. The other attendees are typed one a line and posted one `otherName` each.
 */

const hidden = (name: string): Field => ({ kind: "hidden", name });
const secondary = buttonClass("secondary", "sm");

export interface MeetingValues {
  meetsOn: string | null;
  meetsTime: string | null;
  place: string;
  onlineLink: string;
  agenda: string;
}

const arrangementFields = (): Field[] => [
  hidden("contractId"),
  { kind: "date", name: "meetsOn", label: "Day", required: true },
  { kind: "time", name: "meetsTime", label: "Time", required: true },
  { kind: "text", name: "place", label: "Place", hint: "A place or an online link." },
  { kind: "text", name: "onlineLink", label: "Online link" },
  { kind: "textarea", name: "agenda", label: "Agenda", required: true },
];

/// The meeting, once: when, where (or a link), and the agenda.
export function ScheduleKickOffDrawer({ contractId }: { contractId: string }) {
  return (
    <RecordEditor
      title="Schedule the kick-off meeting"
      fields={arrangementFields()}
      values={{ contractId }}
      action={scheduleKickOff}
      submitLabel="Schedule"
      trigger={{ label: "Schedule", className: secondary }}
      size="md"
    />
  );
}

/// Change it while it has not been held.
export function ChangeKickOffDrawer({ contractId, current }: { contractId: string; current: MeetingValues }) {
  return (
    <RecordEditor
      title="Change the kick-off meeting"
      fields={arrangementFields()}
      values={{ contractId, ...current }}
      action={changeKickOff}
      submitLabel="Save"
      trigger={{ label: "Change", className: secondary }}
      size="md"
    />
  );
}

export interface HeldChoices {
  organisation: { personId: string; name: string; office: string }[];
  contractor: { accountId: string; label: string; statusLabel: string }[];
  contractorNamesWithheld: string | null;
}

const NAMES_FIELD = "otherNames";

/// What the form posts, less the typed names, plus one `otherName` for each non-blank line.
export function withOtherNames(data: FormData): FormData {
  const next = new FormData();
  for (const [k, v] of data.entries()) if (k !== NAMES_FIELD) next.append(k, v);
  const typed = data.get(NAMES_FIELD);
  for (const line of typeof typed === "string" ? typed.split(/\r?\n/) : []) if (line.trim()) next.append("otherName", line.trim());
  return next;
}

/// Record it held: the day, who attended, and the minutes, in one act.
export function RecordKickOffHeldDrawer({ contractId, today, choices }: { contractId: string; today: string | null; choices: HeldChoices }) {
  const staged = useRef(new Map<string, string>());
  const save = useCallback<SaveAction>(async (_prev, data) => {
    const s = await stageFiles(data, staged.current);
    if (!s.ok) return s.state.errors?.file ? { ...s.state, errors: { ...s.state.errors, file: s.state.errors.file.replace("Choose at least one file.", "Add the minutes.") } } : s.state;
    const r = await recordKickOffHeld(EMPTY_FORM_STATE, withStaged(withOtherNames(data), s.ids));
    if (!r.ok) return kept(r);
    staged.current.clear();
    return r;
  }, []);
  return (
    <RecordEditor
      title="Record the kick-off meeting as held"
      fields={[
        hidden("contractId"),
        { kind: "date", name: "heldOn", label: "Held on", required: true },
        { kind: "checks", name: "attendeePersonId", label: "For the organisation", options: choices.organisation.map((p) => ({ value: p.personId, label: p.name, description: p.office })), empty: "Nobody to choose today." },
        {
          kind: "checks",
          name: "attendeeAccountId",
          label: "For the contractor",
          options: choices.contractor.map((a) => ({ value: a.accountId, label: a.label, description: a.statusLabel })),
          empty: "No portal accounts to choose.",
          ...(choices.contractorNamesWithheld ? { info: choices.contractorNamesWithheld } : {}),
        },
        { kind: "textarea", name: NAMES_FIELD, label: "Others", hint: "One name a line." },
        { kind: "file", name: "file", label: "Minutes", required: true, multiple: true },
      ]}
      values={{ contractId, heldOn: today }}
      action={save}
      submitLabel="Record as held"
      trigger={{ label: "Record as held", className: secondary }}
      size="md"
    />
  );
}
