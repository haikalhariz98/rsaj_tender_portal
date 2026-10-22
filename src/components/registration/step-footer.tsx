"use client";

import { useRouter } from "next/navigation";
import type { ReactNode } from "react";

import { Button, ButtonLink } from "@/components/ui/button";
import { Callout } from "@/components/ui/feedback";

import type { FaultView } from "@/lib/portal/register/contract";

/**
 * The foot of a registration step (Phase 4b, B5): Back, Save Draft (secondary) and Next (primary), and under them what the last save said. A save that was refused because the page is out
 * of date says so and offers to reload; a step that cannot go on lists what stands in the way, in words, each beside the field it is about as well.
 *
 * Shared with the public form (ADR 0041), which saves nothing: without `onSave` there is no Save draft, and Back is the page's own move (`onBack`) rather than a link.
 */
export function StepFooter({
  backHref,
  onBack,
  onSave,
  onNext,
  busy,
  nextLabel = "Next",
  message,
  saved,
  stale,
  closedReason,
}: {
  backHref: string | null;
  /// Back without a navigation: the public form holds every step in one page.
  onBack?: () => void;
  /// Save draft. Absent: nothing is saved (the public form).
  onSave?: () => void;
  onNext: () => void;
  busy: boolean;
  nextLabel?: string;
  message: string | null;
  saved: string | null;
  stale: boolean;
  /// Why the step cannot be finished at all (a setting the office has not made): Next is then disabled, with the reason beside it.
  closedReason?: string | null;
}) {
  const router = useRouter();
  return (
    <div className="mt-6 flex flex-col gap-3 border-t border-line pt-5">
      {closedReason && (
        <Callout tone="warn" title="This step cannot be finished yet">
          {closedReason}
        </Callout>
      )}
      <div className="flex flex-wrap items-center gap-3">
        {onBack ? (
          <Button type="button" variant="secondary" onClick={onBack} disabled={busy}>
            Back
          </Button>
        ) : (
          backHref && <ButtonLink href={backHref} variant="secondary">Back</ButtonLink>
        )}
        <span className="ml-auto flex flex-wrap items-center gap-3">
          {onSave && (
            <Button type="button" variant="secondary" onClick={onSave} disabled={busy} aria-busy={busy || undefined}>
              Save draft
            </Button>
          )}
          <Button type="button" variant="primary" onClick={onNext} disabled={busy || !!closedReason} aria-busy={busy || undefined} title={closedReason ?? undefined}>
            {nextLabel}
          </Button>
        </span>
      </div>
      <div aria-live="polite" className="min-h-5">
        {saved && <p className="text-[13px] font-medium text-emerald-700">{saved}</p>}
        {message && (
          <Callout tone="err" title={stale ? "This page is out of date" : "Nothing was saved"} action={stale ? <Button size="sm" variant="secondary" onClick={() => router.refresh()}>Reload the page</Button> : undefined}>
            {message}
          </Callout>
        )}
      </div>
    </div>
  );
}

/// What stands in the way of going on, listed once at the top of the step. The same words sit beside the field or the row each is about.
export function FaultSummary({ faults }: { faults: readonly FaultView[] }): ReactNode {
  const blocking = faults.filter((f) => f.level === "block");
  if (blocking.length === 0) return null;
  return (
    <Callout tone="err" title={blocking.length === 1 ? "One thing stands in the way" : `${blocking.length} things stand in the way`} className="mb-5">
      <ul className="list-disc pl-5">
        {blocking.map((f, i) => (
          <li key={i}>{f.message}</li>
        ))}
      </ul>
    </Callout>
  );
}
