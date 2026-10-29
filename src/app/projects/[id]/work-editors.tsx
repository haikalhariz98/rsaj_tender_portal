"use client";

import { useRouter } from "next/navigation";
import { useCallback, useState, useTransition } from "react";

import { createWorkItem, moveWorkItem, type WorkResult } from "@/app/projects/[id]/work-actions";
import { useActGate } from "@/components/act-gate";
import { PlusIcon } from "@/components/icons";
import { RecordEditor, type Field, type FormState, type SaveAction } from "@/components/record-editor";
import { Button, buttonClass } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/field";
import { MoreActions, MoreItem } from "@/components/ui/more-actions";
import { moreItemClass } from "@/components/ui/more-item-class";
import { Blocked } from "@/components/ui/blocked";

/**
 * The Work tab's drawers and one-press acts (workspace 3a step 5): New item (the type first, then only that type's fields), the item's primary action and its menu (Cancel
 * and Send back collect their words in a drawer), and the List's quick-add row. Each posts to `work-actions.ts`, which judges everything again under the contract's lock; a refusal comes
 * back in words and is shown where the act was made. Nothing here knows who may do what: the server component hands over only what the reader may do.
 */

type Option = { value: string; label: string };
const hidden = (name: string): Field => ({ kind: "hidden", name });
const toState = (r: WorkResult): FormState => (r.refused ? { ok: false, message: r.refused } : { ok: true });
const itemHref = (base: string, ref: string) => `${base}${base.includes("?") ? "&" : "?"}item=${encodeURIComponent(ref)}`;

// ------------------------------------------------------------------ New item

/// The New item drawer. `openBase` is the Work address without an item; the new item's panel opens on it once raised.
export function NewItemDrawer({ contractId, openBase, types, priorities, impacts, severities, people, documents }: { contractId: string; openBase: string; types: Option[]; priorities: Option[]; impacts: Option[]; severities: Option[]; people: Option[]; documents: Option[] }) {
  const router = useRouter();
  const save = useCallback<SaveAction>(
    async (_prev, data) => {
      const next = new FormData();
      for (const [k, v] of data.entries()) next.append(k, v);
      // A wall clock the form takes as a day and a time; the act reads them as one.
      const day = String(data.get("happenedDay") ?? "");
      const time = String(data.get("happenedTime") ?? "");
      next.set("happenedAt", day && time ? `${day}T${time}` : "");
      const r = await createWorkItem(next);
      if (r.refused) return toState(r);
      if (r.ref) router.push(itemHref(openBase, r.ref), { scroll: false });
      return { ok: true };
    },
    [router, openBase],
  );
  const own = (...ts: string[]) => ({ name: "type", in: ts });
  return (
    <RecordEditor
      title="New item"
      size="md"
      fields={[
        hidden("contractId"),
        { kind: "select", name: "type", label: "Type", required: true, placeholder: "Choose a type", options: types },
        { kind: "text", name: "title", label: "Title", required: true },
        { kind: "textarea", name: "description", label: "Description" },
        { kind: "select", name: "priority", label: "Priority", placeholder: "Normal", options: priorities },
        { kind: "date", name: "dueOn", label: "Due" },
        { kind: "select", name: "assigneePersonId", label: "Assignee", placeholder: "Unassigned", options: people },
        { kind: "text", name: "location", label: "Location" },
        { kind: "textarea", name: "answer", label: "Answer" },
        { kind: "select", name: "impact", label: "Impact", placeholder: "Not set", options: impacts },
        { kind: "select", name: "severity", label: "Severity", required: true, placeholder: "Choose a severity", options: severities },
        { kind: "date", name: "happenedDay", label: "Happened on", required: true },
        { kind: "time", name: "happenedTime", label: "Happened at", required: true },
        { kind: "select", name: "fromDocumentId", label: "From", placeholder: "None", options: documents },
      ]}
      showWhen={{
        answer: own("RFI"),
        impact: own("RFI", "SITE_INSTRUCTION"),
        severity: own("SAFETY_INCIDENT"),
        happenedDay: own("SAFETY_INCIDENT"),
        happenedTime: own("SAFETY_INCIDENT"),
        fromDocumentId: own("ACTION"),
      }}
      values={{ contractId }}
      action={save}
      submitLabel="Raise"
      trigger={{ label: "New item", icon: true, className: buttonClass("primary", "sm") }}
    />
  );
}

// ------------------------------------------------------------------ the item's actions

export interface ItemActionsProps {
  contractId: string;
  itemId: string;
  /// The status the reader saw: the act refuses if the row has moved (MOVED_ALREADY).
  from: string;
  /// "RFI 12", for the dialogs' questions.
  itemLabel: string;
  primary: { label: string; to: string } | null;
  disabled: { label: string; whoCan: string } | null;
  /// The menu, in order: a move that needs no words (Reopen), or one that collects them.
  menu: { kind: "move" | "cancel" | "sendBack"; label: string; to: string }[];
}

/// The panel's one primary button and its "…" menu. A one-press move shows its refusal beside the button.
export function ItemActions({ contractId, itemId, from, itemLabel, primary, disabled, menu }: ItemActionsProps) {
  const gate = useActGate();
  const [message, setMessage] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const base = { contractId, itemId, from };
  const move = (to: string) =>
    start(async () => {
      const data = new FormData();
      for (const [k, v] of Object.entries({ ...base, to })) data.set(k, v);
      setMessage(null);
      try {
        const r = await moveWorkItem(data);
        if (r.refused) setMessage(r.refused);
      } catch {
        setMessage("That didn't save. Try again.");
      }
    });
  const words = (to: string): SaveAction => async (_p, data) => {
    const next = new FormData();
    for (const [k, v] of data.entries()) next.append(k, v);
    next.set("to", to);
    return toState(await moveWorkItem(next));
  };
  if (gate) return null;
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-wrap items-center gap-2">
        {primary && (
          <Button variant="primary" size="sm" pending={pending} onClick={() => move(primary.to)}>
            {primary.label}
          </Button>
        )}
        {!primary && disabled && <Blocked label={disabled.label} reason={disabled.whoCan} primary />}
        {menu.length > 0 && (
          <MoreActions label={`More for ${itemLabel}`}>
            {menu.map((m) =>
              m.kind === "move" ? (
                <MoreItem key={m.label} onClick={() => move(m.to)}>
                  {m.label}
                </MoreItem>
              ) : m.kind === "cancel" ? (
                <RecordEditor
                  key={m.label}
                  title={`Cancel ${itemLabel}?`}
                  description="It stays on record, marked cancelled."
                  fields={[hidden("contractId"), hidden("itemId"), hidden("from")]}
                  values={base}
                  destructive={{ reasonLabel: "Reason" }}
                  action={words(m.to)}
                  submitLabel="Cancel item"
                  cancelLabel="Keep it"
                  trigger={{ label: m.label, className: moreItemClass(true) }}
                  size="sm"
                />
              ) : (
                <RecordEditor
                  key={m.label}
                  title={`Send back ${itemLabel}`}
                  fields={[hidden("contractId"), hidden("itemId"), hidden("from"), { kind: "textarea", name: "comment", label: "What should change?", required: true }]}
                  values={base}
                  action={words(m.to)}
                  submitLabel="Send back"
                  trigger={{ label: m.label, className: moreItemClass() }}
                  size="sm"
                />
              ),
            )}
          </MoreActions>
        )}
      </div>
      <p role="status" className="text-[12.5px] font-medium text-rose-700 empty:hidden">
        {message}
      </p>
    </div>
  );
}

// ------------------------------------------------------------------ quick add

/// The List's quick-add row: a type that needs only a title, and the title; Enter raises it and opens its panel. Types that need more (a due date, a severity) are raised from New item.
export function QuickAdd({ contractId, openBase, types }: { contractId: string; openBase: string; types: Option[] }) {
  const router = useRouter();
  const gate = useActGate();
  const [type, setType] = useState(types.find((t) => t.value === "TASK")?.value ?? types[0]?.value ?? "");
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [pending, start] = useTransition();
  if (gate) return null;
  return (
    <form
      className="flex flex-col gap-1.5 border-b border-line/70 px-5 py-3 sm:px-6"
      onSubmit={(e) => {
        e.preventDefault();
        if (pending || !title.trim()) return;
        const data = new FormData();
        data.set("contractId", contractId);
        data.set("type", type);
        data.set("title", title);
        setMessage(null);
        start(async () => {
          try {
            const r = await createWorkItem(data);
            if (r.refused) setMessage(r.refused);
            else if (r.ref) {
              setTitle("");
              router.push(itemHref(openBase, r.ref), { scroll: false });
            }
          } catch {
            setMessage("That didn't save. Try again.");
          }
        });
      }}
    >
      <div className="flex flex-wrap items-center gap-2">
        <div className="w-40 shrink-0">
          <Select aria-label="Type of the new item" variant="chip" chipLabel="Add" value={type} onChange={(e) => setType(e.target.value)}>
            {types.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </Select>
        </div>
        <div className="min-w-48 flex-1">
          <Input aria-label="Title of the new item" placeholder="Add an item, then press Enter" maxLength={200} value={title} onChange={(e) => setTitle(e.target.value)} icon={<PlusIcon size={15} />} />
        </div>
      </div>
      <p role="status" className="text-[12.5px] font-medium text-rose-700 empty:hidden">
        {message}
      </p>
    </form>
  );
}
