"use client";

import { useRouter } from "next/navigation";
import { useCallback, useRef } from "react";

import { addProjectApprover, createProjectDocument, decideProjectVersion, removeProjectApprover, requestProjectDocument, uploadProjectVersion } from "@/app/projects/[id]/document-actions";
import { postUpload } from "@/components/attachments/post-upload";
import { EMPTY_FORM_STATE, RecordEditor, type Field, type FormState, type SaveAction } from "@/components/record-editor";
import { buttonClass } from "@/components/ui/button";
import { STAGED_FOR_PROJECT_DOCUMENT } from "@/lib/documents/staged-for";

/**
 * The Project workspace's drawers (plan step 4 §5.3): create a document, upload a version, ask for it, add and remove an approver, approve and reject. Each is a client island
 * over the shared RecordEditor and posts to the staff actions in `document-actions.ts`, which judge everything again under the locks. A drawer's gate is the screen's: a
 * blocked act is rendered as `Blocked` by the view, never as one of these.
 *
 * Files never travel in a Server Action (a body is capped at 1 MB): each is staged first through the upload route (`stagedFor=project-document`, which takes the project class
 * itself), and only the staged versions' ids are posted. A file already staged by an earlier press of the same form is reused, so a refusal and a second press never store it twice.
 */

const hidden = (name: string): Field => ({ kind: "hidden", name });
const primary = buttonClass("primary", "sm");
const secondary = buttonClass("secondary", "sm");
const ghost = buttonClass("ghost", "sm");

export interface PickerOption {
  personId: string;
  name: string;
  officeLabel: string;
}

const fileKey = (f: File) => `${f.name}|${f.size}|${f.lastModified}`;
const isChosen = (f: FormDataEntryValue): f is File => f instanceof File && (f.size > 0 || f.name !== "");

/// Stage each chosen file (or reuse what an earlier press stored). Never throws: a refusal is a form state naming the file.
async function stageFiles(data: FormData, staged: Map<string, string>): Promise<{ ok: true; ids: string[] } | { ok: false; state: FormState }> {
  const files = data.getAll("file").filter(isChosen);
  if (files.length === 0) return { ok: false, state: { ok: false, errors: { file: "Choose at least one file." } } };
  const ids: string[] = [];
  for (const file of files) {
    const known = staged.get(fileKey(file));
    if (known) {
      ids.push(known);
      continue;
    }
    const one = new FormData();
    one.set("file", file);
    one.set("title", file.name);
    const answer = await postUpload(one, { stagedFor: STAGED_FOR_PROJECT_DOCUMENT });
    if (!answer.ok) return { ok: false, state: { ok: false, errors: { file: `${file.name}: ${answer.message}` } } };
    staged.set(fileKey(file), answer.versionId);
    ids.push(answer.versionId);
  }
  return { ok: true, ids };
}

/// What the form posts, less the files, plus the staged ids.
function withStaged(data: FormData, ids: string[]): FormData {
  const next = new FormData();
  for (const [k, v] of data.entries()) if (k !== "file") next.append(k, v);
  for (const id of ids) next.append("stagedVersionId", id);
  return next;
}

const KEPT = "Your files are kept. Press again to retry.";
const kept = (r: FormState): FormState => ({ ...r, message: [r.message, KEPT].filter(Boolean).join(" ") });

const FILES: Field = { kind: "file", name: "file", label: "Files", required: true, multiple: true };
const NOTE: Field = { kind: "textarea", name: "note", label: "Note" };

/// A document, started by uploading its first files or by asking the contractor for it, with approvers named at once. Goes to the new document's page.
export function NewDocumentDrawer({ contractId, picker }: { contractId: string; picker: PickerOption[] }) {
  const router = useRouter();
  const staged = useRef(new Map<string, string>());
  const save = useCallback<SaveAction>(
    async (_prev, data) => {
      let next = data;
      if (data.get("mode") === "upload") {
        const s = await stageFiles(data, staged.current);
        if (!s.ok) return s.state;
        next = withStaged(data, s.ids);
      }
      const r = await createProjectDocument(EMPTY_FORM_STATE, next);
      if (!r.ok) return data.get("mode") === "upload" ? kept(r) : r;
      staged.current.clear();
      if (r.href) router.push(r.href);
      return r;
    },
    [router],
  );
  return (
    <RecordEditor
      title="New document"
      fields={[
        hidden("contractId"),
        { kind: "text", name: "title", label: "Title", required: true },
        NOTE,
        {
          kind: "select",
          name: "mode",
          label: "Start with",
          required: true,
          options: [
            { value: "upload", label: "Upload files now" },
            { value: "request", label: "Ask the contractor for it" },
          ],
        },
        FILES,
        {
          kind: "checks",
          name: "approverPersonId",
          label: "Approvers (optional)",
          options: picker.map((m) => ({ value: m.personId, label: m.name, description: m.officeLabel })),
          empty: "Nobody holds authority to approve today.",
        },
      ]}
      showWhen={{ file: { name: "mode", in: ["upload"] } }}
      values={{ contractId, mode: "upload" }}
      action={save}
      submitLabel="Create"
      trigger={{ label: "New document", icon: true, className: secondary }}
      size="md"
    />
  );
}

/// A new version of an organisation's document: files, and a note.
export function UploadVersionDrawer({ contractId, documentId, title, tone = "secondary" }: { contractId: string; documentId: string; title: string; tone?: "primary" | "secondary" }) {
  const staged = useRef(new Map<string, string>());
  const save = useCallback<SaveAction>(async (_prev, data) => {
    const s = await stageFiles(data, staged.current);
    if (!s.ok) return s.state;
    const r = await uploadProjectVersion(EMPTY_FORM_STATE, withStaged(data, s.ids));
    if (!r.ok) return kept(r);
    staged.current.clear();
    return r;
  }, []);
  return (
    <RecordEditor
      title={`Upload a new version of ${title}`}
      fields={[hidden("contractId"), hidden("documentId"), FILES, NOTE]}
      values={{ contractId, documentId }}
      action={save}
      submitLabel="Upload"
      trigger={{ label: "Upload a new version", className: tone === "primary" ? primary : secondary }}
      size="md"
    />
  );
}

/// Ask the document's side for it again.
export function AskDrawer({ contractId, documentId, title }: { contractId: string; documentId: string; title: string }) {
  return (
    <RecordEditor
      title={`Ask the contractor for ${title}`}
      fields={[hidden("contractId"), hidden("documentId"), { kind: "textarea", name: "note", label: "What you need" }]}
      values={{ contractId, documentId }}
      action={requestProjectDocument}
      submitLabel="Ask"
      trigger={{ label: "Ask for it", className: secondary }}
      size="sm"
    />
  );
}

/// Name an approver from those who hold authority today.
export function AddApproverDrawer({ contractId, documentId, picker }: { contractId: string; documentId: string; picker: PickerOption[] }) {
  return (
    <RecordEditor
      title="Add an approver"
      fields={[
        hidden("contractId"),
        hidden("documentId"),
        { kind: "select", name: "approverPersonId", label: "Approver", required: true, placeholder: "Choose a person", options: picker.map((m) => ({ value: m.personId, label: `${m.name}, ${m.officeLabel}` })) },
      ]}
      values={{ contractId, documentId }}
      action={addProjectApprover}
      submitLabel="Add approver"
      trigger={{ label: "Add approver", className: secondary }}
      size="sm"
    />
  );
}

/// Take an approver off, with the reason (audited).
export function RemoveApproverDrawer({ contractId, documentId, approverId, name }: { contractId: string; documentId: string; approverId: string; name: string }) {
  return (
    <RecordEditor
      title={`Remove ${name} as an approver`}
      fields={[hidden("contractId"), hidden("documentId"), hidden("approverId")]}
      values={{ contractId, documentId, approverId }}
      destructive={{ reasonLabel: "Why they are removed" }}
      cancelLabel={`Keep ${name}`}
      action={removeProjectApprover}
      submitLabel="Remove"
      trigger={{ label: "Remove", ariaLabel: `Remove ${name} as an approver`, className: ghost }}
      size="sm"
    />
  );
}

/// Approve the latest version; remarks are optional.
export function ApproveDrawer({ contractId, documentId, versionId, title, versionLabel, tone = "secondary" }: { contractId: string; documentId: string; versionId: string; title: string; versionLabel: string; tone?: "primary" | "secondary" }) {
  return (
    <RecordEditor
      title={`Approve ${versionLabel} of ${title}`}
      fields={[hidden("contractId"), hidden("documentId"), hidden("versionId"), hidden("outcome"), { kind: "textarea", name: "remarks", label: "Remarks (optional)" }]}
      values={{ contractId, documentId, versionId, outcome: "APPROVED" }}
      action={decideProjectVersion}
      submitLabel="Approve"
      trigger={{ label: "Approve", className: tone === "primary" ? primary : secondary }}
      size="sm"
    />
  );
}

/// Reject the latest version; the remarks go back with it.
export function RejectDrawer({ contractId, documentId, versionId, title, versionLabel }: { contractId: string; documentId: string; versionId: string; title: string; versionLabel: string }) {
  return (
    <RecordEditor
      title={`Reject ${versionLabel} of ${title}`}
      fields={[hidden("contractId"), hidden("documentId"), hidden("versionId"), hidden("outcome"), { kind: "textarea", name: "remarks", label: "Remarks", required: true, hint: "They go back with it." }]}
      values={{ contractId, documentId, versionId, outcome: "REJECTED" }}
      danger
      action={decideProjectVersion}
      submitLabel="Reject"
      trigger={{ label: "Reject", className: secondary }}
      size="sm"
    />
  );
}
