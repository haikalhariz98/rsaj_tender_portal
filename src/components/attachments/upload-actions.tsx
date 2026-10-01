"use client";

import { useCallback, useRef, useTransition } from "react";

import { attachDocument, attachNewVersion, detachDocument, verifyVersion } from "@/app/documents/actions";
import { EMPTY_FORM_STATE, RecordEditor, type Field, type FormState, type SaveAction } from "@/components/record-editor";
import { Button, buttonClass } from "@/components/ui/button";
import { DETACH_NOTE, NEW_VERSION_NOTE } from "@/lib/documents/labels";
import type { AttachmentItemView, SlotView, UploadView } from "@/lib/documents/views";

import { fieldOfRefusal, postUpload } from "./post-upload";

/**
 * The panel's acts that take a file or a reason. Each is a client island over the shared
 * RecordEditor: the file goes to the upload route (never through a Server Action, which
 * caps a body at 1 MB), then the owner's act is called with the version's id.
 *
 * If the file is stored but attaching it is refused, the version is kept in the island
 * and a second press retries only the attaching — it never uploads the same file twice —
 * and the officer is told the file is stored and where it is listed.
 */

export interface Notice {
  tone: "ok" | "warn" | "err" | "info";
  text: string;
}
export type OnNotice = (n: Notice) => void;

export interface OwnerKey {
  kind: string;
  id: string;
  label: string;
}

export const STORED_NOT_FILED = "The file itself is stored and listed under Configuration, Documents, Received, not filed. Press the button again to retry only the attaching.";

/// A file is the same file if its name, size and time are: a retry after a refusal reuses what was stored.
const fileKey = (f: File) => `${f.name}|${f.size}|${f.lastModified}`;

export function useStagedRef() {
  return useRef<{ key: string; versionId: string; documentId: string } | null>(null);
}

function uploadFields(upload: UploadView, opts: { newDocument: boolean; titleHint?: string }): Field[] {
  return [
    {
      kind: "file",
      name: "file",
      label: "File",
      required: true,
      accept: upload.accept || undefined,
      hint: [upload.allowedTypes.length ? `Allowed: ${upload.allowedTypes.join(", ")}.` : null, upload.capText ? `${upload.capText}.` : null, "Its type is read from the file itself, not from its name."].filter(Boolean).join(" "),
    },
    ...(opts.newDocument
      ? ([
          { kind: "text", name: "title", label: "Title", required: true, placeholder: opts.titleHint, hint: "What this document is called in lists." },
          {
            kind: "select",
            name: "documentClassId",
            label: "Class",
            required: true,
            placeholder: "Choose a class",
            options: upload.classes,
            hint: "Decides its classification and how long it is kept. A SULIT or unclassified document is listed but never opened in the portal.",
          },
        ] satisfies Field[])
      : []),
    {
      kind: "select",
      name: "recordedByPersonId",
      label: "Recorded by",
      required: true,
      placeholder: "Choose who is recording it",
      options: upload.people,
      hint: "Recorded on their behalf, not signed: nobody is signed in.",
    },
    { kind: "date", name: "receivedOn", label: "Received on", hint: upload.receivedHint },
    { kind: "textarea", name: "note", label: "Note", hint: "Optional. Anything the next reader should know about this file." },
  ];
}

/// Stage the file (or reuse what an earlier press stored). Never throws: a refusal is a form state.
export async function stage(data: FormData, stagedRef: ReturnType<typeof useStagedRef>, extra: Record<string, string>): Promise<{ ok: true; versionId: string; warnings: string[] } | { ok: false; state: FormState }> {
  const file = data.get("file");
  if (!(file instanceof File) || (file.size === 0 && !file.name)) return { ok: false, state: { ok: false, errors: { file: "Choose a file to upload." } } };
  const key = fileKey(file);
  if (stagedRef.current?.key === key) return { ok: true, versionId: stagedRef.current.versionId, warnings: [] };
  const answer = await postUpload(data, extra);
  if (!answer.ok) {
    const field = fieldOfRefusal(answer.code);
    return { ok: false, state: field ? { ok: false, errors: { [field]: answer.message } } : { ok: false, message: answer.message } };
  }
  stagedRef.current = { key, versionId: answer.versionId, documentId: answer.documentId };
  return { ok: true, versionId: answer.versionId, warnings: answer.warnings };
}

const withNotes = (message: string | undefined, warnings: string[]) => [message, ...warnings].filter(Boolean).join(" ") || undefined;

/// Upload a file and attach it to a slot of the record.
export function UploadButton({ owner, slot, upload, onNotice }: { owner: OwnerKey; slot: SlotView; upload: UploadView; onNotice: OnNotice }) {
  const stagedRef = useStagedRef();
  const action = useCallback<SaveAction>(
    async (_prev, data) => {
      const s = await stage(data, stagedRef, {});
      if (!s.ok) return s.state;
      const fd = new FormData();
      fd.set("ownerKind", owner.kind);
      fd.set("ownerId", owner.id);
      fd.set("purpose", slot.purpose);
      fd.set("versionId", s.versionId);
      const r = await attachDocument(EMPTY_FORM_STATE, fd);
      if (!r.ok) return { ...r, message: `${r.message ?? "Attaching was refused."} ${STORED_NOT_FILED}` };
      stagedRef.current = null;
      onNotice({ tone: "ok", text: withNotes(r.message, s.warnings) ?? `${slot.label} attached.` });
      return r;
    },
    [owner, slot, stagedRef, onNotice],
  );
  return (
    <RecordEditor
      title={`Upload: ${slot.label}`}
      description={`Will be attached to ${owner.label} as ${slot.label}. The file is stored, then attached in one step.`}
      fields={uploadFields(upload, { newDocument: true, titleHint: slot.label })}
      action={action}
      submitLabel="Upload and attach"
      trigger={{ label: "Upload", ariaLabel: `Upload ${slot.label}`, icon: true, className: buttonClass("secondary", "sm") }}
      size="md"
    />
  );
}

/// Upload a corrected file as the next version of a document, and move this record's pin to it.
export function NewVersionButton({ owner, item, upload, onNotice }: { owner: OwnerKey; item: AttachmentItemView; upload: UploadView; onNotice: OnNotice }) {
  const stagedRef = useStagedRef();
  const action = useCallback<SaveAction>(
    async (_prev, data) => {
      const reason = String(data.get("reason") ?? "").trim();
      if (!reason) return { ok: false, errors: { reason: "Give the reason it is replaced." } };
      const s = await stage(data, stagedRef, { documentId: item.documentId });
      if (!s.ok) return s.state;
      const fd = new FormData();
      fd.set("attachmentId", item.attachmentId);
      fd.set("versionId", s.versionId);
      fd.set("reason", reason);
      const r = await attachNewVersion(EMPTY_FORM_STATE, fd);
      if (!r.ok) return { ...r, message: `${r.message ?? "Replacing was refused."} The new version is stored with the document; press the button again to retry only the replacing.` };
      stagedRef.current = null;
      onNotice({ tone: "ok", text: withNotes(r.message, s.warnings) ?? `${item.title} now points at its new version.` });
      return r;
    },
    [item, stagedRef, onNotice],
  );
  return (
    <RecordEditor
      title={`New version of ${item.title}`}
      description={`Replaces version ${item.versionNo} on ${owner.label}.`}
      fields={[{ kind: "note", text: NEW_VERSION_NOTE }, ...uploadFields(upload, { newDocument: false })]}
      reason={{ label: "Why is it being replaced?" }}
      action={action}
      submitLabel="Upload new version"
      trigger={{ label: "New version", ariaLabel: `New version of ${item.title}`, className: buttonClass("ghost", "sm") }}
      size="md"
    />
  );
}

/// Take a document off the record, with the reason. Says what it does and what it keeps.
export function DetachButton({ owner, item, onNotice }: { owner: OwnerKey; item: AttachmentItemView; onNotice: OnNotice }) {
  const action = useCallback<SaveAction>(
    async (_prev, data) => {
      const r = await detachDocument(EMPTY_FORM_STATE, data);
      if (r.ok) onNotice({ tone: "ok", text: r.message ?? `${item.title} taken off ${owner.label}. The file stays stored.` });
      return r;
    },
    [item, owner, onNotice],
  );
  return (
    <RecordEditor
      title="Detach this document"
      description={item.title}
      fields={[{ kind: "hidden", name: "attachmentId" }, { kind: "note", text: `${item.purposeLabel}, version ${item.versionNo}, on ${owner.label}. ${DETACH_NOTE}` }]}
      values={{ attachmentId: item.attachmentId }}
      destructive={{ reasonLabel: "Why is it being taken off?" }}
      cancelLabel="Keep it attached"
      action={action}
      submitLabel="Detach document"
      trigger={{ label: "Detach", ariaLabel: `Detach ${item.title} from ${owner.label}`, className: buttonClass("destructive", "sm") }}
      size="sm"
    />
  );
}

/// Re-read a version's stored file and compare its fingerprint. Allowed for every version; serves nothing.
export function VerifyButton({ versionId, onNotice, label = "Verify" }: { versionId: string; onNotice: OnNotice; label?: string }) {
  const [pending, start] = useTransition();
  return (
    <Button
      size="sm"
      variant="ghost"
      disabled={pending}
      title="Read the stored file again and check it still matches its fingerprint"
      onClick={() =>
        start(async () => {
          const fd = new FormData();
          fd.set("versionId", versionId);
          const r = await verifyVersion(EMPTY_FORM_STATE, fd);
          onNotice({ tone: r.ok ? "ok" : "err", text: r.message ?? (r.ok ? "Verified." : "Could not verify.") });
        })
      }
    >
      {pending ? "Checking…" : label}
    </Button>
  );
}
