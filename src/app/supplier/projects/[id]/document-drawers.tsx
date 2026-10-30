"use client";

import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";

import { FilesIcon, PlusIcon } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { DRAWER_SCRIM, DrawerHeader, drawerPanelClass } from "@/components/ui/drawer";
import { Callout } from "@/components/ui/feedback";
import { Field, FileInput, Input, Option, Select, Textarea } from "@/components/ui/field";
import { SUPPLIER_PROJECT_DOCUMENTS_POSTS } from "@/lib/auth/routes";

import { answerWords, postBids as postJson } from "../../bids/post-json";
import { postForm, answerWords as formWords } from "../../company/post-form";
import { createBody, kindOffered, passwordShown, PURPOSE_CHOICES, purposesComplete, takesPurposes, titleFieldLabel, versionBody, type KindChoice } from "./document-form";

/**
 * What the contractor does from the Documents list and a document's page (the simple Project workspace, plan step 5): start a document by sending files or asking the
 * organisation for it, send a new version, and ask for a document. Each is a client island that posts to the portal's literal routes with the page's `projects` form token (the
 * public copy takes no server action): files first, one request each, then one act that names them. The rules are the server's; what comes back is shown as it is, beside the
 * field it concerns, and a code is never printed.
 *
 * A file that is staged stays staged: a refusal and a second press reuse what was already stored, because every staged file counts toward the account's hourly allowance whether
 * or not it is ever sent. A document's first version may name a kind (plan step 6); a statutory declaration is signed with the password, asked again here, posted once
 * with the act, kept in no state past the answer and never echoed back (`autocomplete="current-password"`). What the server refuses is shown in its own words; a code is never printed.
 */

export type Errors = Record<string, string>;
export type Staged = Map<string, string>;
const keyOf = (f: File) => `${f.name}|${f.size}|${f.lastModified}`;
export const KEPT = "Your files are kept. Press again to retry.";

/// Stage each file, one request each (the route takes one), reusing what an earlier press already stored. A refusal names the file and says it in the server's words.
export async function stageFiles(files: readonly File[], contractId: string, token: string | null, staged: Staged, route: string = SUPPLIER_PROJECT_DOCUMENTS_POSTS.upload): Promise<{ ok: true; ids: string[] } | { ok: false; message: string }> {
  const ids: string[] = [];
  for (const file of files) {
    const known = staged.get(keyOf(file));
    if (known) {
      ids.push(known);
      continue;
    }
    const form = new FormData();
    form.append("file", file);
    const res = await postForm(`${route}?contractId=${encodeURIComponent(contractId)}`, token, form);
    if (res.status === 201 && res.body?.ok && typeof res.body.versionId === "string") {
      staged.set(keyOf(file), res.body.versionId);
      ids.push(res.body.versionId);
      continue;
    }
    return { ok: false, message: `${file.name}: ${formWords(res.status, res.body)}` };
  }
  return { ok: true, ids };
}

export function useEscape(open: boolean, busy: boolean, close: () => void) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !busy && close();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, busy, close]);
}

/// The drawer's frame: the dimmed scrim, the panel, the header, the refusal, the fields and the two buttons. One copy for the three drawers.
export function Frame({ title, heading, error, busy, onClose, onSend, canSend, sendLabel, children }: { title: string; heading: string; error: string | null; busy: boolean; onClose: () => void; onSend: () => void; canSend: boolean; sendLabel: string; children: ReactNode }) {
  return (
    <div className={DRAWER_SCRIM} onPointerDown={(e) => e.target === e.currentTarget && !busy && onClose()}>
      <aside role="dialog" aria-modal="true" aria-labelledby={heading} className={drawerPanelClass("md")}>
        <span id={heading} className="sr-only">{title}</span>
        <DrawerHeader icon={<FilesIcon size={17} />} title={title} onClose={() => !busy && onClose()} />
        <div className="flex-1 overflow-y-auto overscroll-contain px-6 py-5">
          {error && (
            <Callout tone="err" className="mb-3">
              {error}
            </Callout>
          )}
          <div className="flex flex-col gap-4">{children}</div>
        </div>
        <div className="flex items-center justify-end gap-2 border-t border-line px-6 py-4">
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant="primary" onClick={onSend} disabled={busy || !canSend}>
            {busy ? "Sending…" : sendLabel}
          </Button>
        </div>
      </aside>
    </div>
  );
}

/// What a refusal of an act says: the message, and the field-level words beside their fields.
export function refusal(res: { status: number; body: { message?: string; errors?: Errors } | null }): { message: string; errors: Errors } {
  return { message: answerWords(res.status, res.body), errors: res.body?.errors ?? {} };
}

type Common = { contractId: string; token: string | null };

/// The kind picker (never offered with a request) and, for a kind that is signed, the password, each beside the field the server's answer names.
export function KindFields({ id, kinds, kind, onKind, showKind, showPassword, password, onPassword, errors }: { id: string; kinds: readonly KindChoice[]; kind: string; onKind: (v: string) => void; showKind: boolean; showPassword: boolean; password: string; onPassword: (v: string) => void; errors: Errors }) {
  return (
    <>
      {showKind && (
        <Field label="Kind" htmlFor={`${id}-kind`} error={errors.kind}>
          <Select id={`${id}-kind`} value={kind} onChange={(e) => onKind(e.target.value)}>
            <Option value="">None, an ordinary document</Option>
            {kinds.map((k) => (
              <Option key={k.value} value={k.value}>{k.label}</Option>
            ))}
          </Select>
        </Field>
      )}
      {showPassword && (
        <Field label="Your password" htmlFor={`${id}-password`} required error={errors.password}>
          <Input id={`${id}-password`} type="password" autoComplete="current-password" value={password} onChange={(e) => onPassword(e.target.value)} />
        </Field>
      )}
    </>
  );
}

/// A delivery order and invoice: each chosen file says which of the two it is, and both are needed.
function PurposeFields({ id, files, purposes, onPurpose, error }: { id: string; files: readonly File[]; purposes: readonly string[]; onPurpose: (n: number, v: string) => void; error?: string }) {
  if (files.length === 0) return null;
  return (
    <>
      {files.map((file, n) => (
        <Field key={keyOf(file)} label={`What is ${file.name}?`} htmlFor={`${id}-purpose-${n}`} required error={n === 0 ? error : undefined}>
          <Select id={`${id}-purpose-${n}`} value={purposes[n] ?? ""} onChange={(e) => onPurpose(n, e.target.value)}>
            <Option value="">Choose</Option>
            {PURPOSE_CHOICES.map((p) => (
              <Option key={p.value} value={p.value}>{p.label}</Option>
            ))}
          </Select>
        </Field>
      ))}
      {!purposesComplete(files.length, purposes) && <p className="text-[12.5px] text-ink-3">Send at least one delivery order and one invoice.</p>}
    </>
  );
}

const setAt = (list: readonly string[], n: number, v: string) => Object.assign([...list], { [n]: v });

/// A document, started by sending its first files or by asking the organisation for it. Goes to the new document's page.
export function NewDocumentDrawer({ contractId, token, organisationName, kinds }: Common & { organisationName: string; kinds: readonly KindChoice[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [note, setNote] = useState("");
  const [mode, setMode] = useState<"upload" | "request">("upload");
  const [files, setFiles] = useState<File[]>([]);
  const [purposes, setPurposes] = useState<string[]>([]);
  const [kind, setKind] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errors, setErrors] = useState<Errors>({});
  const staged = useRef<Staged>(new Map());
  const heading = useId();
  const f = useId();
  // The password is never kept past the drawer or an answer.
  const close = () => {
    setPassword("");
    setOpen(false);
  };
  useEscape(open, busy, close);
  const showKind = kindOffered(mode, kinds);
  const showPassword = showKind && passwordShown(kinds, kind);
  const showPurposes = mode === "upload" && takesPurposes(kind);

  const reset = () => {
    setTitle("");
    setNote("");
    setKind("");
    setPassword("");
    setMode("upload");
    setFiles([]);
    setPurposes([]);
    setError(null);
    setErrors({});
    staged.current = new Map();
  };

  async function send() {
    setBusy(true);
    setError(null);
    setErrors({});
    let ids: string[] = [];
    if (mode === "upload") {
      if (files.length === 0) {
        setBusy(false);
        setErrors({ file: "Choose at least one file." });
        return;
      }
      const s = await stageFiles(files, contractId, token, staged.current);
      if (!s.ok) {
        setBusy(false);
        setErrors({ file: s.message });
        return;
      }
      ids = s.ids;
    }
    const res = await postJson(SUPPLIER_PROJECT_DOCUMENTS_POSTS.create, token, createBody({ contractId, title, note, mode, versionIds: ids, purposes, kinds, kind, password }));
    setBusy(false);
    setPassword("");
    const made = res.body as { ok?: boolean; documentId?: string } | null;
    if (res.status === 201 && made?.ok && made.documentId) {
      const href = `/supplier/projects/${encodeURIComponent(contractId)}/documents/${encodeURIComponent(made.documentId)}`;
      close();
      reset();
      router.push(href);
      return;
    }
    const r = refusal(res as { status: number; body: { message?: string; errors?: Errors } | null });
    setError(mode === "upload" && ids.length > 0 ? `${r.message} ${KEPT}` : r.message);
    setErrors(r.errors);
  }

  return (
    <>
      <Button variant="secondary" size="sm" icon={<PlusIcon size={15} />} onClick={() => { reset(); setOpen(true); }} disabled={!token} aria-haspopup="dialog">
        New document
      </Button>
      {open && (
        <Frame title="New document" heading={heading} error={error} busy={busy} onClose={close} onSend={send} canSend={!!token && title.trim() !== "" && (!showPassword || password !== "") && (!showPurposes || purposesComplete(files.length, purposes))} sendLabel={mode === "upload" ? (showPassword ? "Sign and send" : "Send") : "Ask"}>
          <Field label={titleFieldLabel(mode === "upload" ? kind : "")} htmlFor={`${f}-title`} required error={errors.title}>
            <Input id={`${f}-title`} value={title} maxLength={200} autoFocus onChange={(e) => setTitle(e.target.value)} />
          </Field>
          <Field label="Note" htmlFor={`${f}-note`} error={errors.note}>
            <Textarea id={`${f}-note`} value={note} maxLength={2000} rows={3} onChange={(e) => setNote(e.target.value)} />
          </Field>
          <Field label="Start with" htmlFor={`${f}-mode`} required error={errors.mode}>
            <Select id={`${f}-mode`} value={mode} onChange={(e) => setMode(e.target.value as "upload" | "request")}>
              <Option value="upload">Upload files now</Option>
              <Option value="request">{`Ask ${organisationName} for it`}</Option>
            </Select>
          </Field>
          {mode === "upload" && (
            <Field label="Files" htmlFor={`${f}-file`} required error={errors.file ?? errors.versionIds}>
              <FileInput id={`${f}-file`} multiple disabled={busy} onChange={(e) => { setFiles([...(e.currentTarget.files ?? [])]); setPurposes([]); }} />
            </Field>
          )}
          <KindFields id={f} kinds={kinds} kind={kind} onKind={(v) => { setKind(v); setPassword(""); }} showKind={showKind} showPassword={showPassword} password={password} onPassword={setPassword} errors={errors} />
          {showPurposes && <PurposeFields id={f} files={files} purposes={purposes} onPurpose={(n, v) => setPurposes((p) => setAt(p, n, v))} error={errors.files} />}
        </Frame>
      )}
    </>
  );
}

/// A new version of the contractor's own document: files, and a note.
export function UploadVersionDrawer({ contractId, documentId, title, token, tone = "secondary", asksPassword = false, mayPickKind = false, takesFiles = false, kinds = [] }: Common & { documentId: string; title: string; tone?: "primary" | "secondary"; asksPassword?: boolean; mayPickKind?: boolean; takesFiles?: boolean; kinds?: readonly KindChoice[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [purposes, setPurposes] = useState<string[]>([]);
  const [kind, setKind] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errors, setErrors] = useState<Errors>({});
  const staged = useRef<Staged>(new Map());
  const heading = useId();
  const f = useId();
  // The password is never kept past the drawer or an answer.
  const close = () => {
    setPassword("");
    setOpen(false);
  };
  useEscape(open, busy, close);
  const showKind = mayPickKind && kinds.length > 0;
  const showPassword = passwordShown(showKind ? kinds : [], kind, asksPassword);
  const showPurposes = takesFiles || (showKind && takesPurposes(kind));

  async function send() {
    setBusy(true);
    setError(null);
    setErrors({});
    if (files.length === 0) {
      setBusy(false);
      setErrors({ file: "Choose at least one file." });
      return;
    }
    const s = await stageFiles(files, contractId, token, staged.current);
    if (!s.ok) {
      setBusy(false);
      setErrors({ file: s.message });
      return;
    }
    const res = await postJson(SUPPLIER_PROJECT_DOCUMENTS_POSTS.version, token, versionBody({ contractId, documentId, versionIds: s.ids, purposes, takesPurposes: showPurposes, note, mayPickKind, kinds, kind, pageAsksPassword: asksPassword, password }));
    setBusy(false);
    setPassword("");
    if (res.status === 201 && res.body?.ok) {
      close();
      setNote("");
      setKind("");
      setFiles([]);
      setPurposes([]);
      staged.current = new Map();
      router.refresh();
      return;
    }
    const r = refusal(res as { status: number; body: { message?: string; errors?: Errors } | null });
    setError(`${r.message} ${KEPT}`);
    setErrors(r.errors);
  }

  return (
    <>
      <Button variant={tone} size="sm" onClick={() => { setError(null); setErrors({}); setOpen(true); }} disabled={!token} aria-haspopup="dialog">
        Upload a new version
      </Button>
      {open && (
        <Frame title={`Upload a new version of ${title}`} heading={heading} error={error} busy={busy} onClose={close} onSend={send} canSend={!!token && (!showPassword || password !== "") && (!showPurposes || purposesComplete(files.length, purposes))} sendLabel={showPassword ? "Sign and send" : "Send"}>
          <Field label="Files" htmlFor={`${f}-file`} required error={errors.file ?? errors.versionIds}>
            <FileInput id={`${f}-file`} multiple disabled={busy} onChange={(e) => { setFiles([...(e.currentTarget.files ?? [])]); setPurposes([]); }} />
          </Field>
          {showPurposes && <PurposeFields id={f} files={files} purposes={purposes} onPurpose={(n, v) => setPurposes((p) => setAt(p, n, v))} error={errors.files} />}
          <Field label="Note" htmlFor={`${f}-note`} error={errors.note}>
            <Textarea id={`${f}-note`} value={note} maxLength={2000} rows={3} onChange={(e) => setNote(e.target.value)} />
          </Field>
          <KindFields id={f} kinds={kinds} kind={kind} onKind={(v) => { setKind(v); setPassword(""); }} showKind={showKind} showPassword={showPassword} password={password} onPassword={setPassword} errors={errors} />
        </Frame>
      )}
    </>
  );
}

/// Ask the organisation for the document.
export function AskDrawer({ contractId, documentId, title, token, organisationName }: Common & { documentId: string; title: string; organisationName: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errors, setErrors] = useState<Errors>({});
  const heading = useId();
  const f = useId();
  const close = () => setOpen(false);
  useEscape(open, busy, close);

  async function send() {
    setBusy(true);
    setError(null);
    setErrors({});
    const res = await postJson(SUPPLIER_PROJECT_DOCUMENTS_POSTS.request, token, { contractId, documentId, note });
    setBusy(false);
    if (res.status === 201 && res.body?.ok) {
      close();
      setNote("");
      router.refresh();
      return;
    }
    const r = refusal(res as { status: number; body: { message?: string; errors?: Errors } | null });
    setError(r.message);
    setErrors(r.errors);
  }

  return (
    <>
      <Button variant="secondary" size="sm" onClick={() => { setError(null); setErrors({}); setOpen(true); }} disabled={!token} aria-haspopup="dialog">
        Ask for it
      </Button>
      {open && (
        <Frame title={`Ask ${organisationName} for ${title}`} heading={heading} error={error} busy={busy} onClose={close} onSend={send} canSend={!!token} sendLabel="Ask">
          <Field label="What you need" htmlFor={`${f}-note`} error={errors.note}>
            <Textarea id={`${f}-note`} value={note} maxLength={2000} rows={4} autoFocus onChange={(e) => setNote(e.target.value)} />
          </Field>
        </Frame>
      )}
    </>
  );
}
