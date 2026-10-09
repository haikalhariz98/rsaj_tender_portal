"use client";

import { useRouter } from "next/navigation";
import { useEffect, useId, useState, type ReactNode } from "react";

import { CheckIcon, FileIcon, InboxIcon, XIcon } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { CONFIRM_SCRIM, DRAWER_SCRIM, DrawerHeader, confirmPanelClass, drawerPanelClass } from "@/components/ui/drawer";
import { Callout } from "@/components/ui/feedback";
import { Field, Input, Option, Select, Textarea } from "@/components/ui/field";
import { SUPPLIER_PROJECTS_POSTS } from "@/lib/auth/routes";
import { SUBMISSION_KIND_HINT, SUBMISSION_KIND_WORDS } from "@/lib/portal/projects/labels";
import { KIND_SHAPE } from "@/lib/portal/projects/submission";
import { LINES_MAX, SUBMISSION_KINDS, type SubmissionKind } from "@/lib/portal/projects/types";

import { answerWords, postBids as post } from "../../bids/post-json";

/**
 * What a contractor does from a contract in My Projects (Phase 4e): send a submission (a programme, a claim, a materials list, a delay notice, a defects report, a statutory declaration),
 * attest a diary entry or record a disagreement on it, and sign or dispute a certificate's contractor block. Each posts JSON to its route handler with the page's signed token and refreshes the
 * page; the rules are the server's, and what comes back is shown in its own words. A signature asks the password here and sends it once, to be checked by the server; it is kept nowhere.
 * A control that cannot be used says why beside it, never just a disabled button. The supplier is the session's: nothing here names one.
 */

function useEscape(open: boolean, busy: boolean, close: () => void) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !busy && close();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, busy, close]);
}

function Why({ children }: { children: ReactNode }) {
  return <span className="max-w-xs text-right text-[12px] text-ink-3">{children}</span>;
}

const ok = (status: number, body: { ok?: boolean } | null) => (status === 200 || status === 201) && body?.ok === true;

// ------------------------------------------------------------------ a submission

type Line = { description: string; quantity: string; location: string; value: string };
const EMPTY_LINE: Line = { description: "", quantity: "", location: "", value: "" };

export function SubmitControl({ contractId, token, kinds, why, label = "Send a submission" }: { contractId: string; token: string | null; kinds: readonly SubmissionKind[]; why: string | null; label?: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<SubmissionKind>(kinds[0] ?? "WORK_PROGRAMME");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [amount, setAmount] = useState("");
  const [aboutDay, setAboutDay] = useState("");
  const [lines, setLines] = useState<Line[]>([{ ...EMPTY_LINE }]);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [faults, setFaults] = useState<string[]>([]);
  const heading = useId();
  const f = useId();
  useEscape(open, busy, () => setOpen(false));
  const shape = KIND_SHAPE[kind];

  if (why) {
    return (
      <span className="flex flex-col items-end gap-1">
        <Button variant="primary" size="sm" disabled>{label}</Button>
        <Why>{why}</Why>
      </span>
    );
  }

  const reset = () => {
    setTitle("");
    setBody("");
    setAmount("");
    setAboutDay("");
    setLines([{ ...EMPTY_LINE }]);
    setPassword("");
    setError(null);
    setFaults([]);
  };

  async function send() {
    setBusy(true);
    setError(null);
    setFaults([]);
    const res = await post(SUPPLIER_PROJECTS_POSTS.submit, token, { contractId, kind, title, body, amount: shape.amount ? amount : "", aboutDay: shape.day ? aboutDay : "", lines: shape.lines ? lines : [], ...(shape.signed ? { password } : {}) });
    setPassword("");
    setBusy(false);
    if (ok(res.status, res.body)) {
      setOpen(false);
      reset();
      router.refresh();
      return;
    }
    const fs = (res.body as { faults?: { message: string }[] } | null)?.faults ?? [];
    if (fs.length > 1) setFaults(fs.map((x) => x.message));
    setError(answerWords(res.status, res.body));
  }

  const setLine = (n: number, k: keyof Line, v: string) => setLines((ls) => ls.map((l, i) => (i === n ? { ...l, [k]: v } : l)));
  const canSend = !!token && title.trim() !== "" && body.trim() !== "" && (!shape.amount || amount.trim() !== "") && (!shape.day || aboutDay.trim() !== "") && (!shape.signed || password.length > 0);

  return (
    <>
      <Button variant="primary" size="sm" icon={<InboxIcon size={15} />} onClick={() => { reset(); setOpen(true); }} disabled={!token} aria-haspopup="dialog">
        {label}
      </Button>
      {open && (
        <div className={DRAWER_SCRIM} onPointerDown={(e) => e.target === e.currentTarget && !busy && setOpen(false)}>
          <aside role="dialog" aria-modal="true" aria-labelledby={heading} className={drawerPanelClass("lg")}>
            <span id={heading} className="sr-only">Send a submission to the office</span>
            <DrawerHeader icon={<InboxIcon size={17} />} title="Send a submission" subtitle="It goes to the contract's Superintending Officer inside the portal, against the office's service level." onClose={() => !busy && setOpen(false)} />
            <div className="flex-1 overflow-y-auto px-6 py-5">
              {error && (
                <Callout tone="err" className="mb-3">
                  {error}
                  {faults.length > 1 && <ul className="mt-1 list-disc pl-5">{faults.map((x) => <li key={x}>{x}</li>)}</ul>}
                </Callout>
              )}
              <div className="flex flex-col gap-4">
                <Field label="What you are sending" htmlFor={`${f}-kind`} required hint={SUBMISSION_KIND_HINT[kind].en}>
                  <Select id={`${f}-kind`} value={kind} onChange={(e) => setKind(e.target.value as SubmissionKind)}>
                    {kinds.map((k) => (
                      <Option key={k} value={k}>{SUBMISSION_KIND_WORDS[k].en}</Option>
                    ))}
                  </Select>
                </Field>
                <Field label="Title" htmlFor={`${f}-title`} required>
                  <Input id={`${f}-title`} value={title} maxLength={200} onChange={(e) => setTitle(e.target.value)} />
                </Field>
                {shape.amount && (
                  <Field label="Amount claimed (RM)" htmlFor={`${f}-amount`} required hint="Ringgit and sen, such as 12500.00.">
                    <Input id={`${f}-amount`} inputMode="decimal" value={amount} maxLength={20} onChange={(e) => setAmount(e.target.value)} />
                  </Field>
                )}
                {shape.day && (
                  <Field label={shape.day === "UP_TO" ? "Made up to" : "The day the cause arose"} htmlFor={`${f}-day`} required>
                    <Input id={`${f}-day`} type="date" value={aboutDay} onChange={(e) => setAboutDay(e.target.value)} />
                  </Field>
                )}
                <Field label={shape.lines ? "A note on the list" : "What it says"} htmlFor={`${f}-body`} required>
                  <Textarea id={`${f}-body`} value={body} maxLength={8000} rows={shape.lines ? 3 : 8} onChange={(e) => setBody(e.target.value)} />
                </Field>
                {shape.lines && (
                  <fieldset className="flex flex-col gap-3">
                    <legend className="text-[13.5px] font-semibold text-ink">Materials on site</legend>
                    {lines.map((l, n) => (
                      <div key={n} className="grid gap-3 rounded-xl border border-line p-3 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_auto]">
                        <Field label={`Item ${n + 1}`} htmlFor={`${f}-l${n}-d`} required>
                          <Input id={`${f}-l${n}-d`} value={l.description} maxLength={300} onChange={(e) => setLine(n, "description", e.target.value)} />
                        </Field>
                        <Field label="Quantity" htmlFor={`${f}-l${n}-q`} required>
                          <Input id={`${f}-l${n}-q`} value={l.quantity} maxLength={60} onChange={(e) => setLine(n, "quantity", e.target.value)} />
                        </Field>
                        <Field label="Where on site" htmlFor={`${f}-l${n}-w`} required>
                          <Input id={`${f}-l${n}-w`} value={l.location} maxLength={200} onChange={(e) => setLine(n, "location", e.target.value)} />
                        </Field>
                        <Field label="Value (RM)" htmlFor={`${f}-l${n}-v`} required>
                          <Input id={`${f}-l${n}-v`} inputMode="decimal" value={l.value} maxLength={20} onChange={(e) => setLine(n, "value", e.target.value)} />
                        </Field>
                        <div className="flex items-end pb-1">
                          <Button variant="ghost" size="sm" icon={<XIcon size={14} />} onClick={() => setLines((ls) => (ls.length > 1 ? ls.filter((_, i) => i !== n) : ls))} disabled={lines.length <= 1} aria-label={`Remove item ${n + 1}`}>
                            Remove
                          </Button>
                        </div>
                      </div>
                    ))}
                    <div>
                      <Button variant="secondary" size="sm" onClick={() => setLines((ls) => [...ls, { ...EMPTY_LINE }])} disabled={lines.length >= LINES_MAX}>
                        Add an item
                      </Button>
                      {lines.length >= LINES_MAX && <span className="ml-2 text-[12px] text-ink-3">A list holds at most {LINES_MAX} items.</span>}
                    </div>
                  </fieldset>
                )}
                {shape.signed && (
                  <Field label="Your password" htmlFor={`${f}-pw`} required hint="The declaration is signed with it. A wrong password counts towards locking your account.">
                    <Input id={`${f}-pw`} type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
                  </Field>
                )}
              </div>
              <Callout tone="info" title="What happens next" className="mt-4">
                The office answers it: taken up (recorded on the contract through its own act) or returned to you with the reason. You read the answer here, under Submissions.
              </Callout>
            </div>
            <div className="flex items-center justify-end gap-2 border-t border-line px-6 py-4">
              <Button variant="ghost" onClick={() => setOpen(false)} disabled={busy}>Cancel</Button>
              <Button variant="primary" onClick={send} disabled={busy || !canSend}>{busy ? "Sending…" : shape.signed ? "Sign and send" : "Send"}</Button>
            </div>
          </aside>
        </div>
      )}
    </>
  );
}

// ------------------------------------------------------------------ the diary

export function AttestControl({ contractId, entryId, token, dayText, why }: { contractId: string; entryId: string; token: string | null; dayText: string; why: string | null }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const heading = useId();
  const field = useId();
  useEscape(open, busy, () => setOpen(false));

  if (why) {
    return (
      <span className="flex flex-col items-end gap-1">
        <Button variant="primary" size="sm" disabled>Attest</Button>
        <Why>{why}</Why>
      </span>
    );
  }

  async function send() {
    setBusy(true);
    setError(null);
    const res = await post(SUPPLIER_PROJECTS_POSTS.diary, token, { contractId, entryId, action: "attest", password });
    setPassword("");
    setBusy(false);
    if (ok(res.status, res.body)) {
      setOpen(false);
      router.refresh();
    } else setError(answerWords(res.status, res.body));
  }

  return (
    <>
      <Button variant="primary" size="sm" icon={<CheckIcon size={15} />} onClick={() => { setError(null); setPassword(""); setOpen(true); }} disabled={!token} aria-haspopup="dialog">
        Attest
      </Button>
      {open && (
        <div className={CONFIRM_SCRIM} onPointerDown={(e) => e.target === e.currentTarget && !busy && setOpen(false)}>
          <aside role="alertdialog" aria-modal="true" aria-labelledby={heading} className={confirmPanelClass()}>
            <div className="px-6 pt-6">
              <h2 id={heading} className="text-[16px] font-bold text-ink">Attest the diary for {dayText}?</h2>
              <p className="mt-2 text-[14px] text-ink-2">You are signing, as the contractor&apos;s agent, that the entry is accurate. It is dated today and cannot be taken back. If you do not agree with it, record a disagreement instead.</p>
              {error && <Callout tone="err" className="mt-3">{error}</Callout>}
              <Field label="Your password" htmlFor={field} required className="mt-3" hint="The attestation is signed with it.">
                <Input id={field} type="password" autoComplete="current-password" value={password} autoFocus onChange={(e) => setPassword(e.target.value)} />
              </Field>
            </div>
            <div className="flex items-center justify-end gap-2 px-6 py-5">
              <Button variant="ghost" onClick={() => setOpen(false)} disabled={busy}>Cancel</Button>
              <Button variant="primary" onClick={send} disabled={busy || !token || password.length === 0}>{busy ? "Signing…" : "Sign and attest"}</Button>
            </div>
          </aside>
        </div>
      )}
    </>
  );
}

export function DisputeDiaryControl({ contractId, entryId, token, dayText }: { contractId: string; entryId: string; token: string | null; dayText: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [words, setWords] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const heading = useId();
  const field = useId();
  useEscape(open, busy, () => setOpen(false));

  async function send() {
    setBusy(true);
    setError(null);
    const res = await post(SUPPLIER_PROJECTS_POSTS.diary, token, { contractId, entryId, action: "dispute", disagreement: words });
    setBusy(false);
    if (ok(res.status, res.body)) {
      setOpen(false);
      setWords("");
      router.refresh();
    } else setError(answerWords(res.status, res.body));
  }

  return (
    <>
      <Button variant="secondary" size="sm" onClick={() => { setError(null); setOpen(true); }} disabled={!token} aria-haspopup="dialog">
        Disagree
      </Button>
      {open && (
        <div className={DRAWER_SCRIM} onPointerDown={(e) => e.target === e.currentTarget && !busy && setOpen(false)}>
          <aside role="dialog" aria-modal="true" aria-labelledby={heading} className={drawerPanelClass("md")}>
            <span id={heading} className="sr-only">Record a disagreement on the diary for {dayText}</span>
            <DrawerHeader icon={<FileIcon size={17} />} title="Record a disagreement" subtitle={`The diary for ${dayText}: what you and the responsible officer do not agree on. The entry goes to the Superintending Officer.`} onClose={() => !busy && setOpen(false)} />
            <div className="flex-1 overflow-y-auto px-6 py-5">
              {error && <Callout tone="err" className="mb-3">{error}</Callout>}
              <Field label="What you disagree with" htmlFor={field} required>
                <Textarea id={field} value={words} maxLength={4000} rows={6} autoFocus onChange={(e) => setWords(e.target.value)} />
              </Field>
            </div>
            <div className="flex items-center justify-end gap-2 border-t border-line px-6 py-4">
              <Button variant="ghost" onClick={() => setOpen(false)} disabled={busy}>Cancel</Button>
              <Button variant="primary" onClick={send} disabled={busy || !token || !words.trim()}>{busy ? "Sending…" : "Record the disagreement"}</Button>
            </div>
          </aside>
        </div>
      )}
    </>
  );
}

// ------------------------------------------------------------------ a certificate's contractor block

export function SignCertificateControl({ contractId, certificateId, token, label, mode, refusalAllowed }: { contractId: string; certificateId: string; token: string | null; label: string; mode: "sign" | "dispute"; refusalAllowed: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const heading = useId();
  const f = useId();
  useEscape(open, busy, () => setOpen(false));

  if (mode === "dispute" && !refusalAllowed) {
    return (
      <span className="flex flex-col items-end gap-1">
        <Button variant="secondary" size="sm" disabled>Dispute</Button>
        <Why>This form does not provide for the contractor to refuse to sign. Raise a dispute with the Superintending Officer in writing.</Why>
      </span>
    );
  }

  async function send() {
    setBusy(true);
    setError(null);
    const res = await post(SUPPLIER_PROJECTS_POSTS.block, token, { contractId, certificateId, action: mode, note: mode === "dispute" ? note : "", password });
    setPassword("");
    setBusy(false);
    if (ok(res.status, res.body)) {
      setOpen(false);
      setNote("");
      router.refresh();
    } else setError(answerWords(res.status, res.body));
  }

  return (
    <>
      <Button variant={mode === "sign" ? "primary" : "secondary"} size="sm" icon={mode === "sign" ? <CheckIcon size={15} /> : undefined} onClick={() => { setError(null); setPassword(""); setOpen(true); }} disabled={!token} aria-haspopup="dialog">
        {mode === "sign" ? "Sign" : "Dispute"}
      </Button>
      {open && (
        <div className={CONFIRM_SCRIM} onPointerDown={(e) => e.target === e.currentTarget && !busy && setOpen(false)}>
          <aside role="alertdialog" aria-modal="true" aria-labelledby={heading} className={confirmPanelClass()}>
            <div className="px-6 pt-6">
              <h2 id={heading} className="text-[16px] font-bold text-ink">{mode === "sign" ? `Sign ${label}?` : `Dispute ${label}?`}</h2>
              <p className="mt-2 text-[14px] text-ink-2">
                {mode === "sign"
                  ? "You are signing the contractor's block of this certificate, as your company's representative, dated today. It cannot be taken back."
                  : "Your refusal to sign is recorded on the certificate with your reason, dated today. It does not hold up the blocks after yours, and the certificate may still be issued."}
              </p>
              {error && <Callout tone="err" className="mt-3">{error}</Callout>}
              {mode === "dispute" && (
                <Field label="What you dispute" htmlFor={`${f}-note`} required className="mt-3">
                  <Textarea id={`${f}-note`} value={note} maxLength={2000} rows={4} autoFocus onChange={(e) => setNote(e.target.value)} />
                </Field>
              )}
              <Field label="Your password" htmlFor={`${f}-pw`} required className="mt-3" hint="The record is signed with it.">
                <Input id={`${f}-pw`} type="password" autoComplete="current-password" value={password} autoFocus={mode === "sign"} onChange={(e) => setPassword(e.target.value)} />
              </Field>
            </div>
            <div className="flex items-center justify-end gap-2 px-6 py-5">
              <Button variant="ghost" onClick={() => setOpen(false)} disabled={busy}>Cancel</Button>
              <Button variant={mode === "sign" ? "primary" : "destructive"} onClick={send} disabled={busy || !token || password.length === 0 || (mode === "dispute" && !note.trim())}>{busy ? "Signing…" : mode === "sign" ? "Sign" : "Record the dispute"}</Button>
            </div>
          </aside>
        </div>
      )}
    </>
  );
}

export { SUBMISSION_KINDS };
