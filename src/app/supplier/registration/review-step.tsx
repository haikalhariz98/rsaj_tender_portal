"use client";

import { useRouter } from "next/navigation";
import { useId, useState } from "react";

import { Blocked } from "@/components/ui/blocked";
import { Button, ButtonLink } from "@/components/ui/button";
import { Callout } from "@/components/ui/feedback";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Checkbox, Field, Input } from "@/components/ui/field";
import { SUPPLIER_REGISTRATION_POSTS } from "@/lib/auth/routes";
import type { DeclarationInput } from "@/lib/portal/registration/types";

import type { FaultView } from "./reply";
import { postJson, stepHref } from "./wizard-api";

/**
 * Step 5 of the registration (FR-VND-004, FR-VND-006): the notice the office wrote, the false-declaration text with its tick, the password asked again, and Send. Sending is disabled, with
 * every thing that stands in the way named, until nothing does. The password signs the registration: the application, and the two declarations, are signed with it, on the office's day,
 * which the supplier does not type. A wrong password is counted towards the lockout like any other, and nothing is sent.
 */

export interface ReviewText {
  id: string;
  en: string;
  ms: string;
  version: number;
}

export function ReviewStep({
  token,
  version,
  notice,
  falseText,
  giroText,
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
  signatoryName: string;
  signatoryDesignation: string;
  giroConfirmed: boolean;
  /// What stands in the way of sending, from the rules on the draft as it is: the page names each.
  blockers: FaultView[];
}) {
  const router = useRouter();
  const base = useId();
  const [confirmed, setConfirmed] = useState(false);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [faults, setFaults] = useState<FaultView[]>([]);
  const [stale, setStale] = useState(false);

  const stopping = [...blockers, ...faults.filter((f) => f.level === "block" && !blockers.some((b) => b.message === f.message))].filter((f) => f.level === "block");
  const missing = !confirmed ? "Tick the box to confirm the declaration." : password.length === 0 ? "Enter your password to sign." : null;
  const reasons = [...new Set(stopping.map((f) => f.message))];

  async function send() {
    if (!falseText || !giroText || busy) return;
    setBusy(true);
    setMessage(null);
    const declarations: DeclarationInput[] = [
      { kind: "GIRO_AUTHORISATION", textVersionId: giroText.id, signatoryName, signatoryDesignation, confirmed: giroConfirmed },
      { kind: "FALSE_DECLARATION", textVersionId: falseText.id, signatoryName, signatoryDesignation, confirmed },
    ];
    const { status, body } = await postJson(SUPPLIER_REGISTRATION_POSTS.submit, token, { version, password, declarations });
    setBusy(false);
    setPassword("");
    if (status === 200 && body?.ok) {
      router.refresh();
      return;
    }
    setFaults(body?.faults ?? []);
    setStale(status === 409 && body?.code === "STALE");
    setMessage(body?.message ?? "That did not work and nothing was sent. Try again in a moment.");
  }

  return (
    <div className="flex flex-col gap-5">
      {notice ? (
        <Callout tone="info" title="What happens next">
          <span className="whitespace-pre-line">{notice}</span>
        </Callout>
      ) : (
        <Callout tone="warn" title="The notice you read before sending is not set">
          The procurement office has not written it, so the registration cannot be sent yet. Tell the procurement office.
        </Callout>
      )}

      <Card>
        <CardHeader title="Declaration" subtitle="Read it, tick the box, and sign with your password." />
        <CardBody>
          {falseText ? (
            <>
              <div className="rounded-xl bg-sunken/60 p-4 text-[13.5px] leading-relaxed whitespace-pre-line text-ink-2">{falseText.en}</div>
              {falseText.ms && (
                <div lang="ms" className="mt-2 rounded-xl bg-sunken/60 p-4 text-[13.5px] leading-relaxed whitespace-pre-line text-ink-2">
                  {falseText.ms}
                </div>
              )}
              <p className="mt-3 text-[13px] text-ink-3">
                Signed by {signatoryName || "the person you name in step 4"}
                {signatoryDesignation ? `, ${signatoryDesignation}` : ""}. Date: signed when you send, on the procurement office&apos;s day. You do not type it.
              </p>
              <div className="mt-3">
                <Checkbox label="I have read this declaration and confirm it." checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} />
              </div>
              <div className="mt-3 max-w-sm">
                <Field label="Your password" htmlFor={`${base}-password`} required hint="Asked again, because this signs your registration.">
                  <Input id={`${base}-password`} type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
                </Field>
              </div>
            </>
          ) : (
            <Callout tone="warn" title="The false-declaration text is not set">
              The procurement office has to write it before you can send your registration. Tell the procurement office.
            </Callout>
          )}
        </CardBody>
      </Card>

      {message && (
        <Callout tone="err" title={stale ? "This page is out of date" : "Nothing was sent"} action={stale ? <Button size="sm" variant="secondary" onClick={() => router.refresh()}>Reload the page</Button> : undefined}>
          {message}
        </Callout>
      )}

      <div className="flex flex-wrap items-center gap-3 border-t border-line pt-5">
        <ButtonLink href={stepHref("epayment")} variant="secondary">
          Back
        </ButtonLink>
        <span className="ml-auto flex flex-col items-end gap-1.5">
          {reasons.length > 0 || !falseText || !notice ? (
            <Blocked label="Send registration" primary reason={reasons.length ? reasons.join(" ") : !notice ? "The notice you read before sending is not set." : "The false-declaration text is not set."} />
          ) : (
            <>
              <Button type="button" variant="primary" disabled={busy || !!missing} aria-busy={busy || undefined} onClick={send} title={missing ?? undefined}>
                Send registration
              </Button>
              {missing && <span className="text-[12px] text-ink-3">{missing}</span>}
            </>
          )}
        </span>
      </div>
    </div>
  );
}
