import { CheckIcon, XIcon } from "@/components/icons";
import type { StepState, StepperStep } from "@/lib/ui/steps";

import { cx } from "./cx";

export type { StepState, StepperStep };

const STATE_WORDS: Record<StepState, string> = {
  done: "done",
  current: "waiting now",
  waiting: "not reached yet",
  rejected: "rejected",
};

const DOT: Record<StepState, string> = {
  done: "bg-emerald-600 text-white",
  current: "bg-amber-400 text-white ring-4 ring-amber-100",
  waiting: "border-2 border-line-2 bg-surface text-ink-3",
  rejected: "bg-rose-600 text-white",
};

/**
 * A flow's steps at a glance, left to right (founder, 2026-10-05: an approval should read like
 * "Submitted → Head of Department → Chief Executive → Approved", not as its rule). Wide screens
 * show a row joined by a line; a phone shows the same steps as a column. The state is in words
 * as well as colour, for a screen reader and for anyone who cannot tell the colours apart.
 */
export function Stepper({ steps, label }: { steps: StepperStep[]; label: string }) {
  return (
    <ol aria-label={label} className="flex flex-col gap-3 sm:flex-row sm:gap-0">
      {steps.map((s, i) => {
        const last = i === steps.length - 1;
        const reached = s.state === "done";
        return (
          <li
            key={s.key}
            aria-current={s.state === "current" ? "step" : undefined}
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
            <span aria-hidden="true" className={cx("relative z-10 grid size-8 shrink-0 place-items-center rounded-full text-[13px] font-bold", s.state === "rejected" && s.tone === "warn" ? "bg-amber-500 text-white" : DOT[s.state])}>
              {s.state === "done" ? <CheckIcon size={16} strokeWidth={2.5} /> : s.state === "rejected" ? <XIcon size={16} strokeWidth={2.5} /> : i + 1}
            </span>
            <span className="min-w-0 sm:px-2">
              <span className={cx("block text-[13.5px] leading-snug font-semibold break-words", s.state === "waiting" ? "text-ink-3" : "text-ink")}>{s.label}</span>
              {s.sub && <span className="mt-0.5 block text-[12.5px] leading-snug break-words text-ink-3">{s.sub}</span>}
              <span className="sr-only">, {s.stateText ?? STATE_WORDS[s.state]}</span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}
