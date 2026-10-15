"use client";

import { useRouter } from "next/navigation";
import { useEffect, useId, useState } from "react";

import { Bi } from "@/components/ui/bilingual";
import { Button } from "@/components/ui/button";
import { CONFIRM_SCRIM, confirmPanelClass } from "@/components/ui/drawer";
import { Callout } from "@/components/ui/feedback";
import { Checkbox, Field, Input } from "@/components/ui/field";
import { SUPPLIER_BIDS_POSTS } from "@/lib/auth/routes";
import { SCREEN_WORDS } from "@/lib/bids/online/screen-words";
import type { Words } from "@/lib/contract/labels";

import { answerWords, postOnline } from "../online-post";

/**
 * Withdraws one of the supplier's own submissions (SR-13, ADR 0036 D7, ruling 20h): it lists the alternatives that go with it with tick boxes, and asks for the password again. The
 * rules are the server's. What it answers is shown in both languages. An alternative left unticked stays and is untied from the bid.
 */
export function WithdrawControl({ onlineBidId, token, linked, allowed }: { onlineBidId: string; token: string | null; linked: { id: string; number: number }[]; allowed: { allowed: true } | { allowed: false; reason: Words } }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [ticked, setTicked] = useState<string[]>([]);
  const [password, setPassword] = useState("");
  const [error, setError] = useState<Words | null>(null);
  const [done, setDone] = useState<Words | null>(null);
  const heading = useId();
  const field = useId();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !busy && setOpen(false);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, busy]);

  if (!allowed.allowed) {
    return (
      <span className="flex max-w-sm flex-col items-end gap-1">
        <Button variant="secondary" size="sm" disabled><Bi words={SCREEN_WORDS.withdraw} inline inherit /></Button>
        <span className="text-right text-[12px] text-ink-3"><Bi words={allowed.reason} /></span>
      </span>
    );
  }

  async function send() {
    setBusy(true);
    setError(null);
    const res = await postOnline(SUPPLIER_BIDS_POSTS.withdraw, token, { onlineBidId, alsoWithdraw: ticked, password });
    setBusy(false);
    if (res.status === 200 && res.body?.ok) {
      setPassword("");
      setOpen(false);
      setDone(SCREEN_WORDS.withdrawDone);
      router.refresh();
    } else setError(answerWords(res.status, res.body));
  }

  return (
    <>
      {done && <span className="text-[12.5px] text-emerald-800"><Bi words={done} /></span>}
      <Button variant="secondary" size="sm" onClick={() => { setError(null); setTicked([]); setOpen(true); }} disabled={!token} aria-haspopup="dialog">
        <Bi words={SCREEN_WORDS.withdraw} inline inherit />
      </Button>
      {open && (
        <div className={CONFIRM_SCRIM} onPointerDown={(e) => e.target === e.currentTarget && !busy && setOpen(false)}>
          <aside role="alertdialog" aria-modal="true" aria-labelledby={heading} className={confirmPanelClass()}>
            <div className="px-6 pt-6">
              <h2 id={heading} className="text-[16px] font-bold text-ink"><Bi words={SCREEN_WORDS.withdrawTitle} /></h2>
              <p className="mt-2 text-[14px] text-ink-2"><Bi words={SCREEN_WORDS.withdrawBody} /></p>
              {linked.length > 0 && (
                <fieldset className="mt-4 flex flex-col gap-2">
                  <legend className="text-[13px] font-semibold text-ink"><Bi words={SCREEN_WORDS.withdrawAlternatives} inline /></legend>
                  <p className="text-[12.5px] text-ink-3"><Bi words={SCREEN_WORDS.withdrawAlternativesNote} /></p>
                  {linked.map((a) => (
                    <Checkbox
                      key={a.id}
                      checked={ticked.includes(a.id)}
                      onChange={(e) => setTicked((t) => (e.target.checked ? [...t, a.id] : t.filter((x) => x !== a.id)))}
                      disabled={busy}
                      label={<span><Bi words={SCREEN_WORDS.submission} inline /> {a.number}</span>}
                    />
                  ))}
                </fieldset>
              )}
              <div className="mt-4">
                <Field label={<Bi words={SCREEN_WORDS.password} inline />} htmlFor={field} hint={<Bi words={SCREEN_WORDS.passwordHint} />}>
                  <Input id={field} type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} disabled={busy} autoFocus />
                </Field>
              </div>
              {error && <Callout tone="err" className="mt-3"><Bi words={error} /></Callout>}
            </div>
            <div className="flex items-center justify-end gap-2 px-6 py-5">
              <Button variant="ghost" onClick={() => setOpen(false)} disabled={busy}><Bi words={SCREEN_WORDS.cancel} inline inherit /></Button>
              <Button variant="destructive" onClick={() => void send()} disabled={busy || !token || password === ""}>
                <Bi words={busy ? SCREEN_WORDS.withdrawing : SCREEN_WORDS.withdrawButton} inline inherit />
              </Button>
            </div>
          </aside>
        </div>
      )}
    </>
  );
}
