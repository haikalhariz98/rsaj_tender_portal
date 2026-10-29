"use client";

import { useRouter } from "next/navigation";
import { useEffect, useId, useState, type ReactNode } from "react";

import { CheckIcon, FileIcon } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { CONFIRM_SCRIM, DRAWER_SCRIM, DrawerHeader, confirmPanelClass, drawerPanelClass } from "@/components/ui/drawer";
import { Callout } from "@/components/ui/feedback";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { SUPPLIER_PROJECTS_POSTS } from "@/lib/auth/routes";

import { answerWords, postBids as post } from "../../bids/post-json";

/**
 * What a contractor does from a contract in My Projects (Phase 4e): attest a diary entry or record a disagreement on it, and sign or dispute a certificate's contractor block. Each posts JSON to its route handler with the page's signed token and refreshes the
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
              <Field label="Your password" htmlFor={field} required className="mt-3" hint="Signs the attestation.">
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
            <DrawerHeader icon={<FileIcon size={17} />} title="Record a disagreement" subtitle={`The diary for ${dayText}.`} onClose={() => !busy && setOpen(false)} />
            <div className="flex-1 overflow-y-auto overscroll-contain px-6 py-5">
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

// ------------------------------------------------------------------ a defect line (Phase 2 close-out stage B)

/// Mark a defect line rectified: a note and, optionally, one of the contractor's own documents on this contract as evidence. Words, not a signature.
export function MarkRectifiedControl({ contractId, defectId, token, defect, documents }: { contractId: string; defectId: string; token: string | null; defect: string; documents: readonly { id: string; title: string }[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const [evidence, setEvidence] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const heading = useId();
  const field = useId();
  const pick = useId();
  useEscape(open, busy, () => setOpen(false));

  async function send() {
    setBusy(true);
    setError(null);
    const res = await post(SUPPLIER_PROJECTS_POSTS.defects, token, { contractId, defectId, note, evidenceDocumentId: evidence || null });
    setBusy(false);
    if (ok(res.status, res.body)) {
      setOpen(false);
      setNote("");
      setEvidence("");
      router.refresh();
    } else setError(answerWords(res.status, res.body));
  }

  return (
    <>
      <Button variant="primary" size="sm" icon={<CheckIcon size={15} />} onClick={() => { setError(null); setOpen(true); }} disabled={!token} aria-haspopup="dialog">
        Mark rectified
      </Button>
      {open && (
        <div className={DRAWER_SCRIM} onPointerDown={(e) => e.target === e.currentTarget && !busy && setOpen(false)}>
          <aside role="dialog" aria-modal="true" aria-labelledby={heading} className={drawerPanelClass("md")}>
            <span id={heading} className="sr-only">Mark the defect rectified: {defect}</span>
            <DrawerHeader icon={<CheckIcon size={17} />} title="Mark rectified" subtitle={defect} onClose={() => !busy && setOpen(false)} />
            <div className="flex flex-1 flex-col gap-4 overflow-y-auto overscroll-contain px-6 py-5">
              {error && <Callout tone="err">{error}</Callout>}
              <Field label="Note" htmlFor={field}>
                <Textarea id={field} value={note} maxLength={2000} rows={4} autoFocus onChange={(e) => setNote(e.target.value)} />
              </Field>
              <Field label="Evidence" htmlFor={pick} hint={documents.length ? undefined : "Send one under Documents first."}>
                <Select id={pick} value={evidence} onChange={(e) => setEvidence(e.target.value)} disabled={!documents.length}>
                  <option value="">None</option>
                  {documents.map((d) => <option key={d.id} value={d.id}>{d.title}</option>)}
                </Select>
              </Field>
            </div>
            <div className="flex items-center justify-end gap-2 border-t border-line px-6 py-4">
              <Button variant="ghost" onClick={() => setOpen(false)} disabled={busy}>Cancel</Button>
              <Button variant="primary" onClick={send} disabled={busy || !token}>{busy ? "Sending…" : "Mark rectified"}</Button>
            </div>
          </aside>
        </div>
      )}
    </>
  );
}

// ------------------------------------------------------------------ a certificate's contractor block

export function SignCertificateControl({ contractId, certificateId, refusalWords, token, label, mode, refusalAllowed }: { contractId: string; certificateId: string; refusalWords: string; token: string | null; label: string; mode: "sign" | "dispute"; refusalAllowed: boolean }) {
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
        <Why>The form has no refusal to sign. Dispute in writing with the Superintending Officer.</Why>
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
                  : refusalWords}
              </p>
              {error && <Callout tone="err" className="mt-3">{error}</Callout>}
              {mode === "dispute" && (
                <Field label="What you dispute" htmlFor={`${f}-note`} required className="mt-3">
                  <Textarea id={`${f}-note`} value={note} maxLength={2000} rows={4} autoFocus onChange={(e) => setNote(e.target.value)} />
                </Field>
              )}
              <Field label="Your password" htmlFor={`${f}-pw`} required className="mt-3" hint="Signs the record.">
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
