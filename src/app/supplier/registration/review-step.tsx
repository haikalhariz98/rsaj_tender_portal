"use client";

import { useRouter } from "next/navigation";
import { useId, useState } from "react";

import { Blocked } from "@/components/ui/blocked";
import { Button, ButtonLink } from "@/components/ui/button";
import { Callout } from "@/components/ui/feedback";
import { Field, Input } from "@/components/ui/field";
import { DeclarationCard } from "@/components/registration/declaration-card";
import { TermsCard } from "@/components/registration/terms-card";
import { APPLY } from "@/lib/portal/labels";
import { SUPPLIER_REGISTRATION_POSTS } from "@/lib/auth/routes";
import type { DeclarationInput } from "@/lib/portal/registration/types";

import type { FaultView } from "./reply";
import { postJson, stepHref } from "./wizard-api";

/**
 * Step 5 of the registration (FR-VND-004, FR-VND-006, REG-4): the notice the office wrote, the terms card (the Terms and Conditions and the Personal Data Notice, one tick), the
 * false-declaration text with its tick, the password asked again, and Send. Submit is blocked, with its reason, until the terms are ticked. Sending is disabled, with
 * every thing that stands in the way named, until nothing does. The password signs the registration: the application, and the two declarations, are signed with it, on the office's day,
 * which the supplier does not type. A wrong password is counted towards the lockout like any other, and nothing is sent.
 */

export interface ReviewText {
  id: string;
  en: string;
  version: number;
  /// The SHA-256 of exactly these words (organisation name filled in): the signature names it, and is refused if the wording has changed since.
  sha256: string;
}

export function ReviewStep({
  token,
  version,
  notice,
  falseText,
  giroText,
  termsText,
  privacyNotice,
  termsMissing,
  signatoryName,
  signatoryDesignation,
  giroConfirmed,
  blockers,
}: {
  token: string | null;
  version: number;
  notice: string | null;
  falseText: ReviewText | null;
  giroText: ReviewText | null;
  /// The terms and conditions in force (ADR 0041 D4), or null while none is set.
  termsText: ReviewText | null;
  /// The Personal Data Notice as shown and hashed, or null while it is not set.
  privacyNotice: { en: string; sha256: string } | null;
  /// What is not set of the two, in words.
  termsMissing: string[];
  signatoryName: string;
  signatoryDesignation: string;
  giroConfirmed: boolean;
  /// What stands in the way of sending, from the rules on the draft as it is: the page names each.
  blockers: FaultView[];
}) {
  const router = useRouter();
  const base = useId();
  const [confirmed, setConfirmed] = useState(false);
  const [termsConfirmed, setTermsConfirmed] = useState(false);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [faults, setFaults] = useState<FaultView[]>([]);
  const [stale, setStale] = useState(false);

  const stopping = [...blockers, ...faults.filter((f) => f.level === "block" && !blockers.some((b) => b.message === f.message))].filter((f) => f.level === "block");
  const missing = !confirmed ? "Tick the box to confirm the declaration." : password.length === 0 ? "Enter your password to sign." : null;
  const reasons = [...new Set(stopping.map((f) => f.message))];

  async function send() {
    if (!falseText || !giroText || !termsText || !privacyNotice || busy) return;
    setBusy(true);
    setMessage(null);
    const declarations: DeclarationInput[] = [
      { kind: "GIRO_AUTHORISATION", textVersionId: giroText.id, textSha256: giroText.sha256, signatoryName, signatoryDesignation, confirmed: giroConfirmed },
      { kind: "FALSE_DECLARATION", textVersionId: falseText.id, textSha256: falseText.sha256, signatoryName, signatoryDesignation, confirmed },
      { kind: "TERMS_AND_CONDITIONS", textVersionId: termsText.id, textSha256: termsText.sha256, signatoryName, signatoryDesignation, confirmed: termsConfirmed },
    ];
    const { status, body } = await postJson(SUPPLIER_REGISTRATION_POSTS.submit, token, { version, password, declarations, noticeSha256: privacyNotice.sha256 });
    setBusy(false);
    setPassword("");
    if (status === 200 && body?.ok) {
      router.refresh();
      return;
    }
    setFaults(body?.faults ?? []);
    setStale(status === 409 && body?.code === "STALE");
    setMessage(body?.message ?? "Not sent. Try again in a moment.");
  }

  return (
    <div className="flex flex-col gap-5">
      {notice ? (
        <div className="rounded-xl border border-line bg-sunken/60 p-4 text-[13.5px] leading-relaxed whitespace-pre-line text-ink-2">{notice}</div>
      ) : (
        <Callout tone="warn" title="Notice before sending not set">
          Tell the procurement office.
        </Callout>
      )}

      <TermsCard terms={termsText} notice={privacyNotice} confirmed={termsConfirmed} onConfirm={setTermsConfirmed} missing={termsMissing} />

      <DeclarationCard
        text={falseText?.en ?? null}
        subtitle="Read, tick and sign"
        byLine={`Signed by ${signatoryName || "the person you name in step 4"}${signatoryDesignation ? `, ${signatoryDesignation}` : ""}. Dated the day you send.`}
        confirmed={confirmed}
        onConfirm={setConfirmed}
      >
        <div className="mt-3 max-w-sm">
          <Field label="Your password" htmlFor={`${base}-password`} required hint="Signs your registration.">
            <Input id={`${base}-password`} type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
          </Field>
        </div>
      </DeclarationCard>

      {message && (
        <Callout tone="err" title={stale ? "This page is out of date" : "Nothing was sent"} action={stale ? <Button size="sm" variant="secondary" onClick={() => router.refresh()}>Reload the page</Button> : undefined}>
          {message}
        </Callout>
      )}

      {reasons.length > 0 && (
        <Callout tone="warn" title={reasons.length === 1 ? "One thing to finish before you can send" : `${reasons.length} things to finish before you can send`}>
          <ul className="list-disc pl-5">
            {reasons.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        </Callout>
      )}

      <div className="flex flex-wrap items-center gap-3 border-t border-line pt-5">
        <ButtonLink href={stepHref("epayment")} variant="secondary">
          Back
        </ButtonLink>
        <span className="ml-auto flex flex-col items-end gap-1.5">
          {reasons.length > 0 || !falseText || !notice || !termsText || !privacyNotice ? (
            <Blocked label="Submit registration" primary reason={reasons.length ? "Finish what is listed above." : !notice ? "Notice before sending not set." : !falseText ? "Declaration text not set." : termsMissing.join(" ") || APPLY.termsTitle.en} />
          ) : !termsConfirmed ? (
            <Blocked label="Submit registration" primary reason={APPLY.tickToSubmit.en} />
          ) : (
            <>
              <Button type="button" variant="primary" disabled={busy || !!missing} aria-busy={busy || undefined} onClick={send} title={missing ?? undefined}>
                Submit registration
              </Button>
              {missing && <span className="text-[12px] text-ink-3">{missing}</span>}
            </>
          )}
        </span>
      </div>
    </div>
  );
}
