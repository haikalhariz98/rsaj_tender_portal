"use client";

import { useRouter } from "next/navigation";
import { useEffect, useId, useState, type ReactNode } from "react";

import { CalendarIcon, CheckIcon, FileIcon } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { CONFIRM_SCRIM, DRAWER_SCRIM, DrawerHeader, confirmPanelClass, drawerPanelClass } from "@/components/ui/drawer";
import { Callout } from "@/components/ui/feedback";
import { Field, Input } from "@/components/ui/field";
import { SUPPLIER_BIDS_POSTS } from "@/lib/auth/routes";

import { answerWords, postBids } from "../post-json";

/**
 * The three things a supplier does from an exercise in My Bids (Phase 4d): sign up for a briefing or a site visit (and withdraw), acknowledge an addendum, and ask for the documents (and withdraw the
 * request). Each posts JSON to its route handler with the page's signed token and refreshes the page; the rules are the server's, and what comes back is shown in its own words. A control that cannot
 * be used says why beside it, never just a disabled button. The supplier is the session's: nothing here names one.
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

// ------------------------------------------------------------------ sign-up

export function SignUpControl({ exerciseId, eventId, token, what, mode, defaultName, representative, why }: { exerciseId: string; eventId: string; token: string | null; what: string; mode: "signup" | "withdraw"; defaultName: string; representative: string | null; why: string | null }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(representative ?? defaultName);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const heading = useId();
  const field = useId();
  useEscape(open, busy, () => setOpen(false));

  if (mode === "signup" && why) {
    return (
      <span className="flex flex-col items-end gap-1">
        <Button variant="secondary" size="sm" disabled>
          Sign up
        </Button>
        <Why>{why}</Why>
      </span>
    );
  }

  async function send() {
    setBusy(true);
    setError(null);
    const res = await postBids(SUPPLIER_BIDS_POSTS.event, token, { exerciseId, eventId, action: mode, representative: name });
    setBusy(false);
    if (res.status === 200 && res.body?.ok) {
      setOpen(false);
      router.refresh();
    } else setError(answerWords(res.status, res.body));
  }

  return (
    <>
      <Button variant={mode === "signup" ? "primary" : "secondary"} size="sm" icon={<CalendarIcon size={15} />} onClick={() => { setError(null); setOpen(true); }} disabled={!token} aria-haspopup="dialog">
        {mode === "signup" ? "Sign up" : "Withdraw"}
      </Button>
      {open && mode === "signup" && (
        <div className={DRAWER_SCRIM} onPointerDown={(e) => e.target === e.currentTarget && !busy && setOpen(false)}>
          <aside role="dialog" aria-modal="true" aria-labelledby={heading} className={drawerPanelClass("md")}>
            <span id={heading} className="sr-only">Sign up for the {what}</span>
            <DrawerHeader icon={<CalendarIcon size={17} />} title={`Sign up for the ${what}`} subtitle="Tell the procurement office who your company will send." onClose={() => !busy && setOpen(false)} />
            <div className="flex-1 overflow-y-auto px-6 py-5">
              {error && <Callout tone="err" className="mb-3">{error}</Callout>}
              <Field label="Who will you send?" htmlFor={field} required hint="The person's full name, as they will be known at the door.">
                <Input id={field} value={name} maxLength={240} autoFocus onChange={(e) => setName(e.target.value)} />
              </Field>
              <Callout tone="info" title="This is not attendance" className="mt-3">
                Signing up tells the office to expect you. Attendance is recorded by an officer at the {what}, from the sheet signed there, and only that counts where the notice makes attendance a condition of buying the documents.
              </Callout>
            </div>
            <div className="flex items-center justify-end gap-2 border-t border-line px-6 py-4">
              <Button variant="ghost" onClick={() => setOpen(false)} disabled={busy}>Cancel</Button>
              <Button variant="primary" onClick={send} disabled={busy || !token || !name.trim()}>{busy ? "Saving…" : "Sign up"}</Button>
            </div>
          </aside>
        </div>
      )}
      {open && mode === "withdraw" && (
        <div className={CONFIRM_SCRIM} onPointerDown={(e) => e.target === e.currentTarget && !busy && setOpen(false)}>
          <aside role="alertdialog" aria-modal="true" aria-labelledby={heading} className={confirmPanelClass()}>
            <div className="px-6 pt-6">
              <h2 id={heading} className="text-[16px] font-bold text-ink">Withdraw your sign-up?</h2>
              <p className="mt-2 text-[14px] text-ink-2">Your company will no longer be expected at the {what}{representative ? `, and ${representative} will not be on the list` : ""}. You can sign up again until it begins.</p>
              {error && <Callout tone="err" className="mt-3">{error}</Callout>}
            </div>
            <div className="flex items-center justify-end gap-2 px-6 py-5">
              <Button variant="ghost" onClick={() => setOpen(false)} disabled={busy}>Keep my sign-up</Button>
              <Button variant="destructive" onClick={send} disabled={busy || !token}>{busy ? "Withdrawing…" : "Withdraw"}</Button>
            </div>
          </aside>
        </div>
      )}
    </>
  );
}

// ------------------------------------------------------------------ acknowledge

export function AcknowledgeControl({ exerciseId, addendumId, token, label, why }: { exerciseId: string; addendumId: string; token: string | null; label: string; why: string | null }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const heading = useId();
  useEscape(open, busy, () => setOpen(false));

  if (why) {
    return (
      <span className="flex flex-col items-end gap-1">
        <Button variant="secondary" size="sm" disabled>Acknowledge</Button>
        <Why>{why}</Why>
      </span>
    );
  }

  async function send() {
    setBusy(true);
    setError(null);
    const res = await postBids(SUPPLIER_BIDS_POSTS.acknowledge, token, { exerciseId, addendumId });
    setBusy(false);
    if (res.status === 200 && res.body?.ok) {
      setOpen(false);
      router.refresh();
    } else setError(answerWords(res.status, res.body));
  }

  return (
    <>
      <Button variant="primary" size="sm" icon={<CheckIcon size={15} />} onClick={() => { setError(null); setOpen(true); }} disabled={!token} aria-haspopup="dialog">
        Acknowledge
      </Button>
      {open && (
        <div className={CONFIRM_SCRIM} onPointerDown={(e) => e.target === e.currentTarget && !busy && setOpen(false)}>
          <aside role="alertdialog" aria-modal="true" aria-labelledby={heading} className={confirmPanelClass()}>
            <div className="px-6 pt-6">
              <h2 id={heading} className="text-[16px] font-bold text-ink">Acknowledge {label}?</h2>
              <p className="mt-2 text-[14px] text-ink-2">You are saying that your company has read it. The day is recorded, and it cannot be taken back. It is not a record that the office delivered it to you.</p>
              {error && <Callout tone="err" className="mt-3">{error}</Callout>}
            </div>
            <div className="flex items-center justify-end gap-2 px-6 py-5">
              <Button variant="ghost" onClick={() => setOpen(false)} disabled={busy}>Cancel</Button>
              <Button variant="primary" onClick={send} disabled={busy || !token}>{busy ? "Saving…" : "Acknowledge"}</Button>
            </div>
          </aside>
        </div>
      )}
    </>
  );
}

// ------------------------------------------------------------------ the documents

export function RequestControl({ exerciseId, token, mode, defaultName, collector, why }: { exerciseId: string; token: string | null; mode: "request" | "withdraw"; defaultName: string; collector: string | null; why: string | null }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(collector ?? defaultName);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reasons, setReasons] = useState<string[]>([]);
  const heading = useId();
  const field = useId();
  useEscape(open, busy, () => setOpen(false));

  if (mode === "request" && why) {
    return (
      <span className="flex flex-col items-end gap-1">
        <Button variant="secondary" size="sm" disabled>Ask for the documents</Button>
        <Why>{why}</Why>
      </span>
    );
  }

  async function send() {
    setBusy(true);
    setError(null);
    setReasons([]);
    const res = await postBids(SUPPLIER_BIDS_POSTS.request, token, { exerciseId, action: mode, collectorName: name });
    setBusy(false);
    if (res.status === 200 && res.body?.ok) {
      setOpen(false);
      router.refresh();
      return;
    }
    if (res.body?.code === "REFUSED") {
      setReasons(res.body.reasons ?? []);
      // The refusal is kept (or deliberately not): either way the page shows it from the record.
      if (res.body.recorded) router.refresh();
      return;
    }
    setError(answerWords(res.status, res.body));
  }

  return (
    <>
      <Button variant={mode === "request" ? "primary" : "secondary"} size="sm" icon={<FileIcon size={15} />} onClick={() => { setError(null); setReasons([]); setOpen(true); }} disabled={!token} aria-haspopup="dialog">
        {mode === "request" ? "Ask for the documents" : "Withdraw the request"}
      </Button>
      {open && mode === "request" && (
        <div className={DRAWER_SCRIM} onPointerDown={(e) => e.target === e.currentTarget && !busy && setOpen(false)}>
          <aside role="dialog" aria-modal="true" aria-labelledby={heading} className={drawerPanelClass("md")}>
            <span id={heading} className="sr-only">Ask for the tender documents</span>
            <DrawerHeader icon={<FileIcon size={17} />} title="Ask for the tender documents" subtitle="The office sells them to you, as it does at the counter." onClose={() => !busy && setOpen(false)} />
            <div className="flex-1 overflow-y-auto px-6 py-5">
              {error && <Callout tone="err" className="mb-3">{error}</Callout>}
              {reasons.length > 0 && (
                <Callout tone="err" title="The documents cannot be sold to your company at the moment" className="mb-3">
                  <ul className="list-disc pl-5">{reasons.map((r) => <li key={r}>{r}</li>)}</ul>
                </Callout>
              )}
              <Field label="Who will collect them?" htmlFor={field} required hint="The person's full name. They bring proof that they may receive the documents for your company.">
                <Input id={field} value={name} maxLength={240} autoFocus onChange={(e) => setName(e.target.value)} />
              </Field>
              <Callout tone="info" title="Nothing is paid or released here" className="mt-3">
                Asking tells the office you want them. An officer sells them to you and records the payment. Paying online is not available.
              </Callout>
            </div>
            <div className="flex items-center justify-end gap-2 border-t border-line px-6 py-4">
              <Button variant="ghost" onClick={() => setOpen(false)} disabled={busy}>Cancel</Button>
              <Button variant="primary" onClick={send} disabled={busy || !token || !name.trim()}>{busy ? "Sending…" : "Ask for the documents"}</Button>
            </div>
          </aside>
        </div>
      )}
      {open && mode === "withdraw" && (
        <div className={CONFIRM_SCRIM} onPointerDown={(e) => e.target === e.currentTarget && !busy && setOpen(false)}>
          <aside role="alertdialog" aria-modal="true" aria-labelledby={heading} className={confirmPanelClass()}>
            <div className="px-6 pt-6">
              <h2 id={heading} className="text-[16px] font-bold text-ink">Withdraw your request for the documents?</h2>
              <p className="mt-2 text-[14px] text-ink-2">The office will no longer expect {collector ?? "your collector"} to collect them. You can ask again while the sale is open.</p>
              {error && <Callout tone="err" className="mt-3">{error}</Callout>}
            </div>
            <div className="flex items-center justify-end gap-2 px-6 py-5">
              <Button variant="ghost" onClick={() => setOpen(false)} disabled={busy}>Keep my request</Button>
              <Button variant="destructive" onClick={send} disabled={busy || !token}>{busy ? "Withdrawing…" : "Withdraw"}</Button>
            </div>
          </aside>
        </div>
      )}
    </>
  );
}

// ------------------------------------------------------------------ buying the documents online (SR-10)

/**
 * "Buy documents" on an exercise sold online. It makes a purchase that waits for payment and then takes the buyer to pay for it: nothing is paid or released by pressing it. Where something stops the
 * purchase, the button is disabled and says what, beside it; a check that refuses it is shown with its reasons.
 */
export function BuyControl({ exerciseId, token, why, label = "Buy documents", payHref }: { exerciseId: string; token: string | null; why: string | null; label?: string; payHref: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reasons, setReasons] = useState<string[]>([]);

  if (why) {
    return (
      <span className="flex flex-col items-end gap-1">
        <Button variant="primary" size="sm" disabled>{label}</Button>
        <Why>{why}</Why>
      </span>
    );
  }

  async function buy() {
    setBusy(true);
    setError(null);
    setReasons([]);
    const res = await postBids(SUPPLIER_BIDS_POSTS.request, token, { exerciseId, action: "buy" });
    setBusy(false);
    if (res.status === 200 && res.body?.ok) {
      router.push(payHref);
      return;
    }
    if (res.body?.code === "REFUSED") {
      setReasons(res.body.reasons ?? []);
      if (res.body.recorded) router.refresh();
      return;
    }
    setError(answerWords(res.status, res.body));
  }

  return (
    <span className="flex flex-col items-end gap-2">
      <Button variant="primary" size="sm" icon={<FileIcon size={15} />} onClick={buy} disabled={busy || !token}>{busy ? "Starting…" : label}</Button>
      {error && <Callout tone="err" className="max-w-sm text-left">{error}</Callout>}
      {reasons.length > 0 && (
        <Callout tone="err" title="The documents cannot be sold to your company at the moment" className="max-w-sm text-left">
          <ul className="list-disc pl-5">{reasons.map((r) => <li key={r}>{r}</li>)}</ul>
        </Callout>
      )}
    </span>
  );
}
