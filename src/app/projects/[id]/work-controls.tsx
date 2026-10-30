"use client";

import { useRouter } from "next/navigation";
import { useCallback, useId, useRef, useState, useTransition, type ReactNode } from "react";

import { stageFiles, withStaged } from "@/app/projects/[id]/document-editors";
import { attachWorkFiles, editWorkField, linkWorkItem, removeWorkFile, unlinkWorkItem } from "@/app/projects/[id]/work-actions";
import { ShareConfirm } from "@/app/projects/[id]/work-editors";
import { useActGate } from "@/components/act-gate";
import { RecordEditor } from "@/components/record-editor";
import { Button } from "@/components/ui/button";
import { DrawerHeader } from "@/components/ui/drawer";
import { Field, FileInput, Input, Select, Textarea } from "@/components/ui/field";
import { MoreText } from "@/components/ui/more-text";
import { SidePanel, useRequestClose } from "@/components/ui/side-panel";
import { WORK_PANEL_SIZE } from "@/app/projects/[id]/work-shared";
import { STAGED_FOR_WORK_ITEM } from "@/lib/documents/staged-for";
import { CONTRACTOR_ASSIGNEE } from "@/lib/work/fields";

/**
 * The Work item panel's client pieces (workspace 3a step 5): the shell, one field that saves on its own, the link picker and remover, and the file attacher. Every one calls a
 * staff act in `work-actions.ts`, which answers `{ refused }` in words; the words are shown where the control is and the control keeps what was typed. No rule is restated here.
 */

// ------------------------------------------------------------------ the shell

function PanelHead({ title, badge, subtitle, close }: { title: ReactNode; badge?: ReactNode; subtitle?: ReactNode; close: () => void }) {
  // The close that asks first when a comment is half written (`SidePanel` wires it).
  return <DrawerHeader title={title} badge={badge} subtitle={subtitle} onClose={useRequestClose(close)} />;
}

/// The non-modal panel, pinned right under the top bar. Closing goes to the address without `item`, keeping the scroll.
export function WorkPanelShell({ label, closeHref, title, badge, subtitle, children }: { label: string; closeHref: string; title: ReactNode; badge?: ReactNode; subtitle?: ReactNode; children: ReactNode }) {
  const router = useRouter();
  const close = useCallback(() => router.push(closeHref, { scroll: false }), [router, closeHref]);
  return (
    <div className="fixed top-16 right-0 bottom-0 z-30 print:hidden">
      <SidePanel label={label} onClose={close} size={WORK_PANEL_SIZE}>
        <PanelHead title={title} badge={badge} subtitle={subtitle} close={close} />
        <div className="flex-1 overflow-y-auto px-6 py-5">{children}</div>
      </SidePanel>
    </div>
  );
}

// ------------------------------------------------------------------ one field

type Kind = "text" | "textarea" | "date" | "datetime-local";

/// A field that saves when asked: Enter (a line) or Save. A field the reader may not change shows its words, with who can in a popover. A refusal stays beside it and keeps what was typed.
export function FieldEdit({ label, field, value, display, kind = "text", contractId, itemId, disabledWhy: askedWhy }: { label: string; field: string; value: string; display?: string; kind?: Kind; contractId: string; itemId: string; disabledWhy?: string }) {
  // The contract tab's gate (the WORK_ITEM row) states its words first.
  const disabledWhy = useActGate() ?? askedWhy;
  const id = useId();
  const [draft, setDraft] = useState(value);
  const [seen, setSeen] = useState(value);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, start] = useTransition();
  // The server's word after a save is the new truth (derive, do not mirror).
  if (seen !== value) {
    setSeen(value);
    setDraft(value);
  }
  const dirty = draft !== value;
  const save = () => {
    if (!dirty || pending) return;
    const data = new FormData();
    data.set("contractId", contractId);
    data.set("itemId", itemId);
    data.set("field", field);
    data.set("value", draft);
    setMessage(null);
    start(async () => {
      try {
        const r = await editWorkField(data);
        if (r.refused) setMessage(r.refused);
      } catch {
        setMessage("That didn't save. Try again.");
      }
    });
  };
  if (disabledWhy) {
    return (
      <div className="min-w-0">
        <div className="text-[12.5px] font-semibold text-ink-3">{label}</div>
        <div className="flex items-start gap-1.5 text-[14px] break-words whitespace-pre-wrap text-ink">
          {(display ?? value) || <span className="text-ink-4">Not set</span>}
          <MoreText text={disabledWhy} label={`Who can change ${label.toLowerCase()}`} />
        </div>
      </div>
    );
  }
  const common = {
    id,
    value: draft,
    onChange: (e: { target: { value: string } }) => setDraft(e.target.value),
    "aria-invalid": message ? true : undefined,
  };
  return (
    <div className="min-w-0">
      <Field label={label} htmlFor={id} error={message}>
        {kind === "textarea" ? (
          <Textarea {...common} rows={3} />
        ) : (
          <Input {...common} type={kind} onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), save())} />
        )}
      </Field>
      {(dirty || pending) && (
        <div className="mt-2 flex justify-end gap-2">
          <Button size="sm" variant="ghost" onClick={() => setDraft(value)} disabled={pending}>
            Undo
          </Button>
          <Button size="sm" variant="primary" onClick={save} pending={pending}>
            Save
          </Button>
        </div>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ links

/// A dropdown that links on pick (an item or a project document). It goes back to its prompt once the link is made.
export function LinkPicker({ label, name, options, contractId, itemId }: { label: string; name: "toItemId" | "documentId"; options: { value: string; label: string }[]; contractId: string; itemId: string }) {
  const gate = useActGate();
  const [round, setRound] = useState(0);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const msg = useId();
  if (gate) return null;
  return (
    <div className="min-w-0 flex-1">
      <Select
        key={round}
        variant="chip"
        aria-label={label}
        chipLabel={label}
        aria-describedby={message ? msg : undefined}
        value=""
        disabled={pending || options.length === 0}
        onChange={(e) => {
          const value = e.target.value;
          if (!value) return;
          const data = new FormData();
          data.set("contractId", contractId);
          data.set("itemId", itemId);
          data.set(name, value);
          setMessage(null);
          start(async () => {
            try {
              const r = await linkWorkItem(data);
              if (r.refused) setMessage(r.refused);
            } catch {
              setMessage("That didn't save. Try again.");
            }
            setRound((n) => n + 1);
          });
        }}
      >
        <option value="">Choose…</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </Select>
      <p id={msg} role="status" className="mt-1 text-[12.5px] font-medium text-rose-700 empty:hidden">
        {message}
      </p>
    </div>
  );
}

export function UnlinkButton({ contractId, itemId, linkId, what }: { contractId: string; itemId: string; linkId: string; what: string }) {
  const gate = useActGate();
  const [message, setMessage] = useState<string | null>(null);
  const [pending, start] = useTransition();
  if (gate) return null;
  return (
    <>
      <Button
        size="sm"
        variant="ghost"
        pending={pending}
        aria-label={`Remove link to ${what}`}
        onClick={() =>
          start(async () => {
            const data = new FormData();
            data.set("contractId", contractId);
            data.set("itemId", itemId);
            data.set("linkId", linkId);
            try {
              const r = await unlinkWorkItem(data);
              setMessage(r.refused ?? null);
            } catch {
              setMessage("That didn't save. Try again.");
            }
          })
        }
      >
        Remove
      </Button>
      {message && (
        <span role="status" className="text-[12.5px] font-medium text-rose-700">
          {message}
        </span>
      )}
    </>
  );
}

// ------------------------------------------------------------------ files

/// Stage the chosen files through the upload route (outside any lock), then pin them to the item. A refusal names the file; the staged ones are reused on a second press.
export function AttachFiles({ contractId, itemId }: { contractId: string; itemId: string }) {
  const gate = useActGate();
  const staged = useRef(new Map<string, string>());
  const [message, setMessage] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [round, setRound] = useState(0);
  const fileId = useId();
  if (gate) return null;
  return (
    <form
      className="flex flex-wrap items-center gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (pending) return;
        const data = new FormData(e.currentTarget);
        setMessage(null);
        start(async () => {
          const s = await stageFiles(data, staged.current, STAGED_FOR_WORK_ITEM);
          if (!s.ok) {
            setMessage(s.state.errors?.file ?? s.state.message ?? "That didn't upload.");
            return;
          }
          const next = withStaged(data, s.ids);
          next.set("contractId", contractId);
          next.set("itemId", itemId);
          try {
            const r = await attachWorkFiles(next);
            if (r.refused) setMessage(`${r.refused} Your files are kept. Press again to retry.`);
            else {
              staged.current.clear();
              setRound((n) => n + 1); // a fresh picker, so the chosen names clear too
            }
          } catch {
            setMessage("That didn't save. Your files are kept. Press again to retry.");
          }
        });
      }}
    >
      <FileInput key={round} id={fileId} name="file" multiple required aria-label="Choose files to attach" className="min-w-0 flex-1" />
      <Button type="submit" size="sm" variant="secondary" pending={pending}>
        Attach
      </Button>
      <p role="status" className="basis-full text-[12.5px] font-medium text-rose-700 empty:hidden">
        {message}
      </p>
    </form>
  );
}

// ------------------------------------------------------------------ the assignee

/// The assignee dropdown. Picking "{contractor}" asks the Share confirm first (WB-2): it posts only on Share, and the pick goes back if the officer keeps it internal.
export function AssigneeSelect({ contractId, itemId, value, options, contractor, disabledWhy: askedWhy }: { contractId: string; itemId: string; value: string; options: { value: string; label: string }[]; contractor: string; disabledWhy?: string }) {
  const disabledWhy = useActGate() ?? askedWhy;
  const [picked, setPicked] = useState(value);
  const [seen, setSeen] = useState(value);
  const [asking, setAsking] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const msg = useId();
  if (seen !== value) {
    setSeen(value);
    setPicked(value);
  }
  if (disabledWhy) {
    return (
      <span className="inline-flex items-center gap-1.5 text-[14px] text-ink">
        {options.find((o) => o.value === value)?.label ?? "Unassigned"}
        <MoreText text={disabledWhy} label="Who can change assignee" />
      </span>
    );
  }
  const post = (next: string) => {
    const before = picked;
    setPicked(next);
    setMessage(null);
    start(async () => {
      const data = new FormData();
      data.set("contractId", contractId);
      data.set("itemId", itemId);
      data.set("field", "assigneePersonId");
      data.set("value", next);
      try {
        const r = await editWorkField(data);
        if (r.refused) {
          setPicked(before);
          setMessage(r.refused);
        }
      } catch {
        setPicked(before);
        setMessage("That didn't save. Try again.");
      }
    });
  };
  return (
    <div className="min-w-0">
      <Select
        variant="chip"
        aria-label="Assignee"
        aria-describedby={message ? msg : undefined}
        aria-invalid={message ? true : undefined}
        value={picked}
        onChange={(e) => {
          if (pending) return;
          const next = e.target.value;
          if (next === CONTRACTOR_ASSIGNEE) setAsking(next);
          else post(next);
        }}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </Select>
      <p id={msg} role="status" className="mt-1 text-[12.5px] font-medium text-rose-700 empty:hidden">
        {message}
      </p>
      {asking && (
        <ShareConfirm
          contractor={contractor}
          onConfirm={() => {
            post(asking);
            setAsking(null);
          }}
          onCancel={() => setAsking(null)}
        />
      )}
    </div>
  );
}

// ------------------------------------------------------------------ removing a file

/// Remove a file from an unshared item: a drawer that asks a reason and names the file. The server judges who may (the attacher or the lead) again.
export function RemoveFile({ contractId, itemId, attachmentId, filename }: { contractId: string; itemId: string; attachmentId: string; filename: string }) {
  return (
    <RecordEditor
      title={`Remove ${filename}?`}
      description="It stays on record, marked removed."
      fields={[
        { kind: "hidden", name: "contractId" },
        { kind: "hidden", name: "itemId" },
        { kind: "hidden", name: "attachmentId" },
      ]}
      values={{ contractId, itemId, attachmentId }}
      destructive={{ reasonLabel: "Reason" }}
      action={async (_prev, data) => {
        const r = await removeWorkFile(data);
        return r.refused ? { ok: false, message: r.refused } : { ok: true };
      }}
      submitLabel="Remove file"
      cancelLabel="Keep it"
      trigger={{ label: "Remove", className: "text-[13px] font-semibold text-rose-700 underline-offset-2 hover:underline", ariaLabel: `Remove ${filename}` }}
      size="sm"
    />
  );
}
