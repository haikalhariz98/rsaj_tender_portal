"use client";

import { useRouter } from "next/navigation";
import { useId, useRef, useState } from "react";

import { PlusIcon, ShieldIcon } from "@/components/icons";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DRAWER_SCRIM, DrawerHeader, drawerPanelClass } from "@/components/ui/drawer";
import { Callout } from "@/components/ui/feedback";
import { Field, FileInput, Input, Option, Select, Textarea } from "@/components/ui/field";
import { SUPPLIER_PROJECT_WORK_POSTS } from "@/lib/auth/routes";
import type { PortalAction, WorkAction } from "@/lib/work/types";

import { answerWords, postBids as postJson } from "../../bids/post-json";
import { Frame, KEPT, refusal, stageFiles, useEscape, type Errors, type Staged } from "./document-drawers";
import { answerBody, attachBody, moveBody, raiseBody, raiseMissing, replyBody, workHref, type RaiseKind } from "./work-form";

/**
 * What the contractor does in the Work tab (workspace 3b step 6): ask a question, report an incident, and work an item in a drawer. Client islands that post to the portal's
 * literal Work routes with the page's `projects` form token (the public copy takes no server action). Files go first, one request each; a staged file stays staged across a
 * refusal and a second press. The rules are the server's: its refusals are already in the contractor's words and are shown as they are, and no code is printed.
 */

type Common = { contractId: string; token: string | null };
type Done = { ok?: boolean; ref?: string };
const succeeded = (res: { status: number; body: unknown }) => res.status >= 200 && res.status < 300 && (res.body as Done | null)?.ok === true;

// ------------------------------------------------------------------ ask a question, report an incident

const COPY: Record<RaiseKind, { open: string; description: string; send: string }> = {
  RFI: { open: "Ask a question", description: "Your question", send: "Ask" },
  SAFETY_INCIDENT: { open: "Report an incident", description: "What happened", send: "Report" },
};

export function RaiseDrawer({ contractId, token, kind, severities, primary = false }: Common & { kind: RaiseKind; severities: readonly { value: string; label: string }[]; primary?: boolean }) {
  const router = useRouter();
  const copy = COPY[kind];
  const blank = { title: "", description: "", location: "", dueOn: "", severity: "", happenedDay: "", happenedTime: "" };
  const [open, setOpen] = useState(false);
  const [v, setV] = useState(blank);
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errors, setErrors] = useState<Errors>({});
  const staged = useRef<Staged>(new Map());
  const heading = useId();
  const f = useId();
  const close = () => setOpen(false);
  useEscape(open, busy, close);
  const set = (k: keyof typeof blank) => (e: { target: { value: string } }) => setV((p) => ({ ...p, [k]: e.target.value }));

  async function send() {
    const missing = raiseMissing({ type: kind, ...v });
    if (Object.keys(missing).length > 0) {
      setErrors(missing);
      return;
    }
    setBusy(true);
    setError(null);
    setErrors({});
    const s = await stageFiles(files, contractId, token, staged.current, SUPPLIER_PROJECT_WORK_POSTS.upload);
    if (!s.ok) {
      setBusy(false);
      setErrors({ file: s.message });
      return;
    }
    const res = await postJson(SUPPLIER_PROJECT_WORK_POSTS.raise, token, raiseBody({ contractId, type: kind, ...v, stagedVersionIds: s.ids }));
    setBusy(false);
    const made = res.body as Done | null;
    if (res.status === 201 && made?.ok && made.ref) {
      close();
      setV(blank);
      setFiles([]);
      staged.current = new Map();
      router.push(workHref(contractId, made.ref), { scroll: false });
      return;
    }
    const r = refusal(res as { status: number; body: { message?: string; errors?: Errors } | null });
    setError(s.ids.length > 0 ? `${r.message} ${KEPT}` : r.message);
    setErrors(r.errors);
  }

  return (
    <>
      <Button variant={primary ? "primary" : "secondary"} size="sm" icon={primary ? <PlusIcon size={15} /> : <ShieldIcon size={15} />} onClick={() => { setError(null); setErrors({}); setOpen(true); }} disabled={!token} aria-haspopup="dialog">
        {copy.open}
      </Button>
      {open && (
        <Frame title={copy.open} heading={heading} error={error} busy={busy} onClose={close} onSend={send} canSend={!!token} sendLabel={copy.send}>
          <Field label="Title" htmlFor={`${f}-title`} required error={errors.title}>
            <Input id={`${f}-title`} value={v.title} maxLength={200} autoFocus onChange={set("title")} />
          </Field>
          <Field label={copy.description} htmlFor={`${f}-description`} error={errors.description}>
            <Textarea id={`${f}-description`} value={v.description} rows={4} onChange={set("description")} />
          </Field>
          {kind === "RFI" ? (
            <Field label="Answer needed by" htmlFor={`${f}-due`} required error={errors.dueOn}>
              <Input id={`${f}-due`} type="date" value={v.dueOn} onChange={set("dueOn")} />
            </Field>
          ) : (
            <>
              <Field label="Where" htmlFor={`${f}-where`} error={errors.location}>
                <Input id={`${f}-where`} value={v.location} maxLength={120} onChange={set("location")} />
              </Field>
              <Field label="How serious" htmlFor={`${f}-severity`} required error={errors.severity}>
                <Select id={`${f}-severity`} value={v.severity} onChange={set("severity")}>
                  <Option value="">Choose</Option>
                  {severities.map((s) => (
                    <Option key={s.value} value={s.value}>{s.label}</Option>
                  ))}
                </Select>
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Happened on" htmlFor={`${f}-day`} required error={errors.happenedAt}>
                  <Input id={`${f}-day`} type="date" value={v.happenedDay} onChange={set("happenedDay")} />
                </Field>
                <Field label="Happened at" htmlFor={`${f}-time`} required>
                  <Input id={`${f}-time`} type="time" value={v.happenedTime} onChange={set("happenedTime")} />
                </Field>
              </div>
            </>
          )}
          <Field label="Files" htmlFor={`${f}-file`} error={errors.file ?? errors.stagedVersionIds}>
            <FileInput id={`${f}-file`} multiple disabled={busy} onChange={(e) => setFiles([...(e.currentTarget.files ?? [])])} />
          </Field>
        </Frame>
      )}
    </>
  );
}

// ------------------------------------------------------------------ one item

export interface ItemView {
  ref: string;
  title: string;
  typeLabel: string;
  status: string;
  /// Where it stands, in words (`portalStatusWords`).
  standing: string;
  dueText: string | null;
  lateText: string | null;
  description: string;
  location: string;
  severityLabel: string | null;
  happenedText: string | null;
  answer: string;
  mayAnswer: boolean;
  /// The row's one button, and its words.
  action: PortalAction;
  actionLabel: string;
  moves: WorkAction[];
  files: { id: string; filename: string; href: string; byYou: boolean; onText: string }[];
  comments: { id: string; by: string; byYou: boolean; body: string; atText: string }[];
}

const MOVE_OF: Partial<Record<PortalAction, "SEND_FOR_CHECKING" | "ACCEPT_ANSWER">> = { SEND_FOR_CHECKING: "SEND_FOR_CHECKING", ACCEPT_ANSWER: "ACCEPT_ANSWER" };

export function WorkItemDrawer({ contractId, token, orgName, canAct, cannotWhy, item }: Common & { orgName: string; canAct: boolean; cannotWhy: string; item: ItemView }) {
  const router = useRouter();
  const [reply, setReply] = useState("");
  const [answer, setAnswer] = useState(item.answer);
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errors, setErrors] = useState<Errors>({});
  const staged = useRef<Staged>(new Map());
  const heading = useId();
  const f = useId();
  const close = () => router.replace(workHref(contractId), { scroll: false });
  useEscape(true, busy, close);
  const act = canAct && !!token;

  /// One act: post, show what the server said in its own words, and on success read the item again. `then` clears what the act used.
  async function run(path: string, body: Record<string, unknown>, then?: () => void, kept?: boolean) {
    setBusy(true);
    setError(null);
    setErrors({});
    const res = await postJson(path, token, body);
    setBusy(false);
    if (succeeded(res)) {
      then?.();
      router.refresh();
      return;
    }
    const r = refusal(res as { status: number; body: { message?: string; errors?: Errors } | null });
    setError(kept ? `${r.message} ${KEPT}` : r.message || answerWords(res.status, res.body));
    setErrors(r.errors);
  }

  async function attach() {
    if (files.length === 0) return setErrors({ file: "Choose at least one file." });
    setBusy(true);
    setError(null);
    const s = await stageFiles(files, contractId, token, staged.current, SUPPLIER_PROJECT_WORK_POSTS.upload);
    setBusy(false);
    if (!s.ok) return setErrors({ file: s.message });
    await run(SUPPLIER_PROJECT_WORK_POSTS.attach, attachBody(contractId, item.ref, s.ids), () => { setFiles([]); staged.current = new Map(); }, true);
  }

  const move = MOVE_OF[item.action];
  const askAgain = item.moves.includes("SEND_BACK");
  const answerChanged = answer.trim() !== item.answer.trim();
  const replyId = `${f}-reply`;

  return (
    <div className={DRAWER_SCRIM} onPointerDown={(e) => e.target === e.currentTarget && !busy && close()}>
      <aside role="dialog" aria-modal="true" aria-labelledby={heading} className={drawerPanelClass("md")}>
        <span id={heading} className="sr-only">{`${item.typeLabel} ${item.ref}: ${item.title}`}</span>
        <DrawerHeader title={item.title} subtitle={`${item.typeLabel} ${item.ref}`} badge={item.lateText ? <Badge tone="err">{item.lateText}</Badge> : undefined} onClose={() => !busy && close()} />
        {act && item.action !== "OPEN" && (
          <div className="flex items-center justify-end gap-2 border-b border-line px-6 py-4">
            {askAgain && (
              <Button variant="secondary" disabled={busy || reply.trim() === ""} title={reply.trim() === "" ? "Write what is still missing in your reply first." : undefined} onClick={() => run(SUPPLIER_PROJECT_WORK_POSTS.move, moveBody(contractId, item.ref, "ASK_AGAIN", item.status, reply), () => setReply(""))}>
                Ask again
              </Button>
            )}
            <Button variant="primary" disabled={busy} onClick={() => (move ? run(SUPPLIER_PROJECT_WORK_POSTS.move, moveBody(contractId, item.ref, move, item.status)) : document.getElementById(replyId)?.focus())}>
              {item.actionLabel}
            </Button>
          </div>
        )}
        <div className="flex-1 overflow-y-auto overscroll-contain px-6 py-5">
          {error && <Callout tone="err" className="mb-3">{error}</Callout>}
          {!act && <Callout tone="warn" className="mb-3">{cannotWhy}</Callout>}
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <Badge tone="neutral">{item.standing}</Badge>
            {item.dueText && <span className="text-[13px] text-ink-3">{item.dueText}</span>}
          </div>
          <div className="flex flex-col gap-5">
            {item.description && <p className="text-[14px] whitespace-pre-wrap break-words text-ink">{item.description}</p>}
            {(item.location || item.severityLabel || item.happenedText) && (
              <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-[13.5px]">
                {item.location && <><dt className="text-ink-3">Where</dt><dd>{item.location}</dd></>}
                {item.severityLabel && <><dt className="text-ink-3">How serious</dt><dd>{item.severityLabel}</dd></>}
                {item.happenedText && <><dt className="text-ink-3">Happened</dt><dd>{item.happenedText}</dd></>}
              </dl>
            )}
            {((item.mayAnswer && act) || item.answer) && (
              <Field label="Answer" htmlFor={`${f}-answer`} error={errors.answer}>
                {item.mayAnswer && act ? (
                  <div className="flex flex-col items-start gap-2">
                    <Textarea id={`${f}-answer`} value={answer} rows={4} onChange={(e) => setAnswer(e.target.value)} />
                    <Button size="sm" variant="secondary" disabled={busy || !answerChanged} onClick={() => run(SUPPLIER_PROJECT_WORK_POSTS.answer, answerBody(contractId, item.ref, answer))}>
                      Save answer
                    </Button>
                  </div>
                ) : (
                  <p id={`${f}-answer`} className="text-[14px] whitespace-pre-wrap break-words text-ink">{item.answer}</p>
                )}
              </Field>
            )}
            <section aria-label="Files">
              <h3 className="mb-2 text-[13px] font-semibold text-ink-3">Files</h3>
              {item.files.length === 0 ? (
                <p className="text-[13.5px] text-ink-3">No files yet.</p>
              ) : (
                <ul className="flex flex-col gap-1.5">
                  {item.files.map((x) => (
                    <li key={x.id} className="flex flex-wrap items-baseline gap-x-2 text-[13.5px]">
                      <a href={x.href} download className="font-medium text-brand-700 underline-offset-2 hover:underline">{x.filename}</a>
                      <span className="text-ink-3">{x.byYou ? "You" : orgName} · {x.onText}</span>
                    </li>
                  ))}
                </ul>
              )}
              {act && (
                <div className="mt-3 flex flex-col items-start gap-2">
                  <Field label="Add files" htmlFor={`${f}-file`} error={errors.file ?? errors.stagedVersionIds} className="w-full">
                    <FileInput id={`${f}-file`} multiple disabled={busy} onChange={(e) => setFiles([...(e.currentTarget.files ?? [])])} />
                  </Field>
                  {files.length > 0 && <Button size="sm" variant="secondary" disabled={busy} onClick={attach}>Attach</Button>}
                </div>
              )}
            </section>
            <section aria-label="Replies">
              <h3 className="mb-2 text-[13px] font-semibold text-ink-3">Replies</h3>
              {item.comments.length === 0 ? (
                <p className="text-[13.5px] text-ink-3">No replies yet.</p>
              ) : (
                <ol className="flex flex-col gap-3">
                  {item.comments.map((c) => (
                    <li key={c.id}>
                      <div className="text-[13px] text-ink-3"><span className="font-semibold text-ink">{c.by}</span> · {c.atText}</div>
                      <p className={`mt-1 rounded-xl px-3.5 py-2.5 text-[14px] whitespace-pre-wrap break-words text-ink ${c.byYou ? "bg-brand-50" : "bg-sunken"}`}>{c.body}</p>
                    </li>
                  ))}
                </ol>
              )}
              {act && (
                <div className="mt-3 flex flex-col items-start gap-2">
                  <Field label="Your reply" htmlFor={replyId} error={errors.body} className="w-full">
                    <Textarea id={replyId} value={reply} rows={3} onChange={(e) => setReply(e.target.value)} />
                  </Field>
                  <Button size="sm" variant="secondary" disabled={busy || reply.trim() === ""} onClick={() => run(SUPPLIER_PROJECT_WORK_POSTS.reply, replyBody(contractId, item.ref, reply), () => setReply(""))}>
                    Send
                  </Button>
                </div>
              )}
            </section>
          </div>
        </div>
      </aside>
    </div>
  );
}
