import Link from "next/link";

import { Say } from "@/components/i18n/language-context";
import { CheckIcon, XIcon } from "@/components/icons";
import { COMPONENT_WORDS } from "@/lib/i18n/catalogues/components";
import type { StepState, StepperStep } from "@/lib/ui/steps";

import { cx } from "./cx";

export type { StepState, StepperStep };

const STATE_WORDS = {
  done: COMPONENT_WORDS.stepDone,
  current: COMPONENT_WORDS.stepCurrent,
  waiting: COMPONENT_WORDS.stepWaiting,
  rejected: COMPONENT_WORDS.stepRejected,
  parked: COMPONENT_WORDS.stepParked,
} as const;

const DOT: Record<StepState, string> = {
  done: "bg-emerald-600 text-white",
  current: "bg-brand-600 text-white ring-4 ring-brand-100",
  waiting: "border-2 border-line-2 bg-surface text-ink-3",
  rejected: "bg-rose-600 text-white",
  parked: "border-2 border-dashed border-line-2 bg-surface text-ink-3",
};

/// The step being viewed (`selected`): a brand ring round the dot and an underlined label, set apart from the ring of an in-progress step. No words, so nothing for a screen reader to add: `aria-current` already says it.
const VIEWED_DOT = "outline-2 outline-offset-2 outline-brand-600";
const VIEWED_LABEL = "underline decoration-brand-600 decoration-2 underline-offset-4";

/**
 * A flow's steps at a glance, left to right (founder, 2026-10-05: an approval should read like
 * "Submitted → Head of Department → Chief Executive → Approved", not as its rule). Wide screens
 * show a row joined by a line; a phone shows the same steps as a column. The state is in words
 * as well as colour, for a screen reader and for anyone who cannot tell the colours apart.
 *
 * Colours (SP-17): done is emerald, the current step brand indigo with a ring, and amber only where a step is a warning (a return).
 *
 * Without `selected`, every `current` step carries aria-current="step", as ever. With it, only the
 * step with that key does, so several steps can be `current` (running in parallel) while one is the
 * stage being viewed. A step with an `href` draws its label as a link, one with `onSelect` as a button; a `parked` step is greyed out.
 */
export function Stepper({ steps, label, selected }: { steps: StepperStep[]; label: string; selected?: string }) {
  return (
    <ol aria-label={label} className="flex flex-col gap-3 sm:flex-row sm:gap-0">
      {steps.map((s, i) => {
        const last = i === steps.length - 1;
        const reached = s.state === "done";
        const viewed = selected !== undefined && s.key === selected;
        return (
          <li
            key={s.key}
            aria-current={(selected === undefined ? s.state === "current" : s.key === selected) ? "step" : undefined}
            className="relative flex min-w-0 gap-3 sm:flex-1 sm:flex-col sm:items-center sm:gap-2 sm:text-center"
          >
            {!last && (
              <span
                aria-hidden="true"
                className={cx(
                  "absolute hidden sm:block sm:top-4 sm:left-[calc(50%+1.25rem)] sm:h-0.5 sm:w-[calc(100%-2.5rem)]",
                  reached ? "bg-emerald-500" : "bg-line-2",
                )}
              />
            )}
            <span aria-hidden="true" className={cx("relative z-10 grid size-8 shrink-0 place-items-center rounded-full text-[13px] font-bold", s.state === "rejected" && s.tone === "warn" ? "bg-amber-500 text-white" : DOT[s.state], viewed && VIEWED_DOT)}>
              {s.state === "done" ? <CheckIcon size={16} strokeWidth={2.5} /> : s.state === "rejected" ? <XIcon size={16} strokeWidth={2.5} /> : i + 1}
            </span>
            <span className="min-w-0 sm:px-2">
              <span title={s.label} className={cx("line-clamp-2 block text-[13.5px] leading-snug font-semibold break-words", viewed && VIEWED_LABEL, s.state === "waiting" || s.state === "parked" ? "text-ink-3" : "text-ink")}>
                {s.href ? (
                  <Link href={s.href} className="rounded-sm underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500">
                    {s.label}
                  </Link>
                ) : s.onSelect ? (
                  <button type="button" onClick={s.onSelect} className="rounded-sm font-semibold underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500">
                    {s.label}
                  </button>
                ) : (
                  s.label
                )}
              </span>
              {s.owner && <span className="mt-0.5 block text-[12px] leading-snug break-words text-ink-3">{s.owner}</span>}
              {s.sub && <span className="mt-0.5 block text-[12.5px] leading-snug break-words text-ink-3">{s.sub}</span>}
              <span className="sr-only">, {s.stateText ?? <Say words={STATE_WORDS[s.state]} />}</span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}
