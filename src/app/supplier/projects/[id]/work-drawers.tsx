"use client";

import { useRouter } from "next/navigation";
import { useId, useRef, useState, type KeyboardEvent } from "react";

import { ClipboardIcon, PlusIcon, ShieldIcon } from "@/components/icons";
import { Activity } from "@/components/ui/activity";
import { Badge, Chip } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DRAWER_SCRIM, DrawerHeader, drawerPanelClass } from "@/components/ui/drawer";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Callout } from "@/components/ui/feedback";
import { Field, FileInput, Input, Option, Select, Textarea } from "@/components/ui/field";
import { SUPPLIER_PROJECT_WORK_POSTS } from "@/lib/auth/routes";
import { LOCATION_MAX, TEXT_MAX, TITLE_MAX } from "@/lib/work/bounds";
import type { PortalAction, WorkAction } from "@/lib/work/types";

import { answerWords, postBids as postJson } from "../../bids/post-json";
import { Frame, KEPT, refusal, stageFiles, useDiscardGuard, useEscape, useFocusFirstError, type Errors, type Staged } from "./document-drawers";
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
  const dirty = Object.values(v).some((x) => x.trim() !== "") || files.length > 0;
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
        <Frame title={copy.open} heading={heading} error={error} errors={errors} busy={busy} dirty={dirty} icon={kind === "RFI" ? <ClipboardIcon size={17} /> : <ShieldIcon size={17} />} onClose={close} onSend={send} canSend={!!token} sendLabel={copy.send}>
          <Field label="Title" htmlFor={`${f}-title`} required error={errors.title}>
            <Input id={`${f}-title`} name="title" autoComplete="off" value={v.title} maxLength={TITLE_MAX} autoFocus onChange={set("title")} />
          </Field>
          <Field label={copy.description} htmlFor={`${f}-description`} error={errors.description}>
            <Textarea id={`${f}-description`} name="description" autoComplete="off" value={v.description} rows={4} maxLength={TEXT_MAX} onChange={set("description")} />
          </Field>
          {kind === "RFI" ? (
            <Field label="Answer needed by" htmlFor={`${f}-due`} required error={errors.dueOn}>
              <Input id={`${f}-due`} name="dueOn" autoComplete="off" type="date" value={v.dueOn} onChange={set("dueOn")} />
            </Field>
          ) : (
            <>
              <Field label="Where" htmlFor={`${f}-where`} error={errors.location}>
                <Input id={`${f}-where`} name="location" autoComplete="off" value={v.location} maxLength={LOCATION_MAX} onChange={set("location")} />
              </Field>
              <Field label="How serious" htmlFor={`${f}-severity`} required error={errors.severity}>
                <Select id={`${f}-severity`} name="severity" value={v.severity} onChange={set("severity")}>
                  <Option value="">Choose</Option>
                  {severities.map((s) => (
                    <Option key={s.value} value={s.value}>{s.label}</Option>
                  ))}
                </Select>
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Happened on" htmlFor={`${f}-day`} required error={errors.happenedAt}>
                  <Input id={`${f}-day`} name="happenedDay" autoComplete="off" type="date" value={v.happenedDay} onChange={set("happenedDay")} />
                </Field>
                <Field label="Happened at" htmlFor={`${f}-time`} required>
                  <Input id={`${f}-time`} name="happenedTime" autoComplete="off" type="time" value={v.happenedTime} onChange={set("happenedTime")} />
                </Field>
              </div>
            </>
          )}
          <Field label="Files" htmlFor={`${f}-file`} error={errors.file ?? errors.stagedVersionIds}>
            <FileInput id={`${f}-file`} name="file" multiple disabled={busy} onChange={(e) => setFiles([...(e.currentTarget.files ?? [])])} />
          </Field>
        </Frame>
      )}
    </>
  );
}

// ------------------------------------------------------------------ one item

export interface ItemView {
  /// The address form ("RFI-12"): for the post bodies only. The screen shows `label`.
  ref: string;
  /// What the screen shows (WSEC-3): "RFI 12", "Incident 3".
  label: string;
  title: string;
  typeLabel: string;
  status: string;
  /// Where it stands, in words (`portalStatusWords`).
  standing: string;
  dueText: string | null;
  lateText: string | null;
  description: string;
  /// A linked defect's latest return note, read from its line (WR-2).
  returnNote: string | null;
  location: string;
  severityLabel: string | null;
  happenedText: string | null;
  answer: string;
  mayAnswer: boolean;
  /// Whether the contractor may reply, attach or answer now (WSEC-5): false on a closed item, which shows none of those controls.
  mayPost: boolean;
  /// The row's one button, and its words.
  action: PortalAction;
  actionLabel: string;
  moves: WorkAction[];
  files: { id: string; filename: string; href: string; byYou: boolean; onText: string; scanLabel: string; scanText: string; scanBad: boolean }[];
  comments: { id: string; by: string; byYou: boolean; body: string; atText: string }[];
}

const MOVE_OF: Partial<Record<PortalAction, "SEND_FOR_CHECKING" | "MARK_AS_FIXED" | "ACCEPT_ANSWER">> = { SEND_FOR_CHECKING: "SEND_FOR_CHECKING", MARK_AS_FIXED: "MARK_AS_FIXED", ACCEPT_ANSWER: "ACCEPT_ANSWER" };

export function WorkItemDrawer({ contractId, token, orgName, canAct, cannotWhy, item }: Common & { orgName: string; canAct: boolean; cannotWhy: string; item: ItemView }) {
  const router = useRouter();
  const [reply, setReply] = useState("");
  const [answer, setAnswer] = useState(item.answer);
  const [files, setFiles] = useState<File[]>([]);
  /// Which act is under way (its button spins and keeps its label); every act is held off meanwhile.
  const [doing, setDoing] = useState<"move" | "ask" | "answer" | "attach" | "reply" | null>(null);
  const busy = doing !== null;
  const [error, setError] = useState<string | null>(null);
  const [errors, setErrors] = useState<Errors>({});
  /// What the last act did, said politely once it has.
  const [said, setSaid] = useState("");
  /// Accepting closes the item for good on this side (the contractor cannot reopen), so it asks first.
  const [confirmAccept, setConfirmAccept] = useState(false);
  const staged = useRef<Staged>(new Map());
  const area = useRef<HTMLDivElement>(null);
  const heading = useId();
  const f = useId();
  // One close for both sides (the staff panel pushes too): the address is history, so Back reopens the item.
  const close = () => router.push(workHref(contractId), { scroll: false });
  const answerChanged = answer.trim() !== item.answer.trim();
  const guard = useDiscardGuard(reply.trim() !== "" || answerChanged || files.length > 0, close);
  useEscape(!guard.asking && !confirmAccept, busy, guard.request);
  useFocusFirstError(area, errors);
  const act = canAct && !!token;
  // WSEC-5: a closed item takes no reply, no file and no answer, so those controls are not drawn at all (no control that is always refused).
  const post = act && item.mayPost;

  /// One act: post, show what the server said in its own words, and on success read the item again. `then` clears what the act used.
  async function run(what: NonNullable<typeof doing>, path: string, payload: Record<string, unknown>, success: string, then?: () => void, kept?: boolean) {
    setDoing(what);
    setError(null);
    setErrors({});
    setSaid("");
    const res = await postJson(path, token, payload);
    setDoing(null);
    if (succeeded(res)) {
      then?.();
      setSaid(success);
      router.refresh();
      return;
    }
    const r = refusal(res as { status: number; body: { message?: string; errors?: Errors } | null });
    setError(kept ? `${r.message} ${KEPT}` : r.message || answerWords(res.status, res.body));
    setErrors(r.errors);
  }

  async function attach() {
    if (busy) return;
    if (files.length === 0) return setErrors({ file: "Choose at least one file." });
    setDoing("attach");
    setError(null);
    setSaid("");
    const s = await stageFiles(files, contractId, token, staged.current, SUPPLIER_PROJECT_WORK_POSTS.upload);
    setDoing(null);
    if (!s.ok) return setErrors({ file: s.message });
    await run("attach", SUPPLIER_PROJECT_WORK_POSTS.attach, attachBody(contractId, item.ref, s.ids), "Files attached.", () => { setFiles([]); staged.current = new Map(); }, true);
  }

  /// The reply box's text, trimmed. Empty is said beside the box, which takes the focus; the buttons stay pressable.
  function replyOrSay(words: string): string | null {
    const text = reply.trim();
    if (text === "") {
      setError(null);
      setErrors({ body: words });
      return null;
    }
    return text;
  }

  const move = MOVE_OF[item.action];
  const askAgain = item.moves.includes("SEND_BACK");
  const replyId = `${f}-reply`;
  const submitOnCtrlEnter = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      e.currentTarget.form?.requestSubmit();
    }
  };

  return (
    <>
      <div className={DRAWER_SCRIM} onPointerDown={(e) => e.target === e.currentTarget && !busy && guard.request()}>
        <aside role="dialog" aria-modal="true" aria-labelledby={heading} className={drawerPanelClass("md")}>
          <span id={heading} className="sr-only">{`${item.label}: ${item.title}`}</span>
          <DrawerHeader title={item.title} subtitle={item.label} badge={item.lateText ? <Badge tone="err">{item.lateText}</Badge> : undefined} onClose={() => !busy && guard.request()} />
          {act && item.action !== "OPEN" && (
            <div className="flex items-center justify-end gap-2 border-b border-line px-6 py-4">
              {askAgain && (
                <Button
                  variant="secondary"
                  disabled={busy}
                  pending={doing === "ask"}
                  onClick={() => {
                    const text = replyOrSay("Write what is still missing in your reply first.");
                    if (text) run("ask", SUPPLIER_PROJECT_WORK_POSTS.move, moveBody(contractId, item.ref, "ASK_AGAIN", item.status, text), "Sent back with your reply.", () => setReply(""));
                  }}
                >
                  Ask again
                </Button>
              )}
              <Button variant="primary" disabled={busy} pending={doing === "move"} onClick={() => (move === "ACCEPT_ANSWER" ? setConfirmAccept(true) : move ? run("move", SUPPLIER_PROJECT_WORK_POSTS.move, moveBody(contractId, item.ref, move, item.status), move === "MARK_AS_FIXED" ? "Marked as fixed." : "Sent for checking.") : document.getElementById(replyId)?.focus())}>
                {item.actionLabel}
              </Button>
            </div>
          )}
          <div ref={area} className="flex-1 overflow-y-auto overscroll-contain px-6 py-5">
            {error && <Callout tone="err" className="mb-3">{error}</Callout>}
            {!act && <Callout tone="warn" className="mb-3">{cannotWhy}</Callout>}
            {/* Polite and always present, so what an act did is announced when the words land. */}
            <p role="status" className="mb-3 text-[13px] font-medium text-emerald-700 empty:hidden">{said}</p>
            <div className="mb-4 flex flex-wrap items-center gap-2">
              <Chip wrap>{item.standing}</Chip>
              {item.dueText && <span className="text-[13px] text-ink-3">{item.dueText}</span>}
            </div>
            <div className="flex flex-col gap-5">
              {item.description && <p className="text-[14px] whitespace-pre-wrap break-words text-ink">{item.description}</p>}
              {item.returnNote && <p className="text-[13.5px] whitespace-pre-wrap break-words text-ink-2"><span className="font-semibold text-ink">Returned:</span> {item.returnNote}</p>}
              {(item.location || item.severityLabel || item.happenedText) && (
                <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-[13.5px]">
                  {item.location && <><dt className="text-ink-3">Where</dt><dd>{item.location}</dd></>}
                  {item.severityLabel && <><dt className="text-ink-3">How serious</dt><dd>{item.severityLabel}</dd></>}
                  {item.happenedText && <><dt className="text-ink-3">Happened</dt><dd>{item.happenedText}</dd></>}
                </dl>
              )}
              {((item.mayAnswer && post) || item.answer) && (
                <Field label="Answer" htmlFor={`${f}-answer`} error={errors.answer}>
                  {item.mayAnswer && post ? (
                    <form
                      noValidate
                      className="flex flex-col items-start gap-2"
                      onSubmit={(e) => {
                        e.preventDefault();
                        if (busy) return;
                        if (!answerChanged) return setErrors({ answer: "Change the answer first." });
                        run("answer", SUPPLIER_PROJECT_WORK_POSTS.answer, answerBody(contractId, item.ref, answer.trim()), "Answer saved.");
                      }}
                    >
                      <Textarea id={`${f}-answer`} name="answer" autoComplete="off" value={answer} rows={4} maxLength={TEXT_MAX} onChange={(e) => setAnswer(e.target.value)} onKeyDown={submitOnCtrlEnter} />
                      <Button type="submit" size="sm" variant="secondary" disabled={busy} pending={doing === "answer"}>
                        Save answer
                      </Button>
                    </form>
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
                        <Chip tone={x.scanBad ? "err" : "neutral"} title={x.scanLabel}>{x.scanText}</Chip>
                      </li>
                    ))}
                  </ul>
                )}
                {post && (
                  <form
                    noValidate
                    className="mt-3 flex flex-col items-start gap-2"
                    onSubmit={(e) => {
                      e.preventDefault();
                      attach();
                    }}
                  >
                    <Field label="Add files" htmlFor={`${f}-file`} error={errors.file ?? errors.stagedVersionIds} className="w-full">
                      <FileInput id={`${f}-file`} name="file" multiple disabled={busy} onChange={(e) => setFiles([...(e.currentTarget.files ?? [])])} />
                    </Field>
                    {files.length > 0 && <Button type="submit" size="sm" variant="secondary" disabled={busy} pending={doing === "attach"}>Attach</Button>}
                  </form>
                )}
              </section>
              <section aria-label="Replies">
                <h3 className="mb-2 text-[13px] font-semibold text-ink-3">Replies</h3>
                <Activity
                  label="Reply list"
                  filter={false}
                  empty="No replies yet."
                  entries={item.comments.map((c) => ({ id: c.id, kind: "comment" as const, who: c.byYou ? "You" : c.by, at: c.atText, text: c.body }))}
                />
                {post && (
                  <form
                    noValidate
                    className="mt-3 flex flex-col items-start gap-2"
                    onSubmit={(e) => {
                      e.preventDefault();
                      if (busy) return;
                      const text = replyOrSay("Write a reply first.");
                      if (text) run("reply", SUPPLIER_PROJECT_WORK_POSTS.reply, replyBody(contractId, item.ref, text), "Reply sent.", () => setReply(""));
                    }}
                  >
                    <Field label="Your reply" htmlFor={replyId} error={errors.body} className="w-full">
                      <Textarea id={replyId} name="body" autoComplete="off" value={reply} rows={3} maxLength={TEXT_MAX} placeholder="Write a reply…" onChange={(e) => setReply(e.target.value)} onKeyDown={submitOnCtrlEnter} />
                    </Field>
                    <Button type="submit" size="sm" variant="secondary" disabled={busy} pending={doing === "reply"}>
                      Send
                    </Button>
                  </form>
                )}
              </section>
            </div>
          </div>
        </aside>
      </div>
      {guard.dialog}
      {confirmAccept && (
        <ConfirmDialog
          question={`Accept the answer to ${item.label}?`}
          words="This closes it. You can't reopen it; if something is still open, raise a new item."
          confirmLabel="Accept answer"
          cancelLabel="Not yet"
          onCancel={() => setConfirmAccept(false)}
          onConfirm={() => {
            setConfirmAccept(false);
            run("move", SUPPLIER_PROJECT_WORK_POSTS.move, moveBody(contractId, item.ref, "ACCEPT_ANSWER", item.status), "Answer accepted.");
          }}
        />
      )}
    </>
  );
}
