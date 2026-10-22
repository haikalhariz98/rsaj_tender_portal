"use client";

import { useEffect, useId, useRef } from "react";

import { Button } from "./button";
import { CONFIRM_SCRIM, confirmPanelClass } from "./drawer";

/**
 * A question asked before something that cannot be taken back (design note 0005: the consequence, in 12 words at most): a small centred box with the question, an optional line under it,
 * and two buttons. The safe answer has the focus and is what Escape and a press on the scrim give. The one copy for every such question, built on the shared `CONFIRM_SCRIM`: focus and Tab
 * follow the one dialog rule (`dialog-focus.ts`), which a box marked modal gets for free.
 */
export function ConfirmDialog({
  question,
  words,
  confirmLabel,
  cancelLabel,
  onConfirm,
  onCancel,
  destructive,
}: {
  question: string;
  /// A line under the question, where one is needed.
  words?: string;
  confirmLabel: string;
  cancelLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
  /// The confirming answer loses something: drawn as the destructive button.
  destructive?: boolean;
}) {
  const title = useId();
  const line = useId();
  const latest = useRef(onCancel);
  useEffect(() => {
    latest.current = onCancel;
  });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && latest.current();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);
  return (
    <div className={CONFIRM_SCRIM} onPointerDown={(e) => e.target === e.currentTarget && onCancel()}>
      <div className={confirmPanelClass()} role="alertdialog" aria-modal="true" aria-labelledby={title} aria-describedby={words ? line : undefined}>
        <div className="flex flex-col gap-2 px-6 pt-5 pb-4">
          <h2 id={title} className="text-[18px] leading-snug font-bold tracking-tight text-ink">
            {question}
          </h2>
          {words && (
            <p id={line} className="text-[14px] text-ink-2">
              {words}
            </p>
          )}
        </div>
        <div className="flex flex-wrap justify-end gap-2 border-t border-line px-6 py-4">
          <Button autoFocus variant="ghost" onClick={onCancel}>
            {cancelLabel}
          </Button>
          <Button variant={destructive ? "destructive" : "primary"} onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
