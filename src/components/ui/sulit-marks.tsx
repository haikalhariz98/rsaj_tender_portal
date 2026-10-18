"use client";

import type { ReactNode } from "react";

import { LockIcon } from "@/components/icons";
import { useSay } from "@/components/i18n/language-context";
import { grantedWords, type Sulit } from "@/lib/auth/sulit-access";
import { COMPONENT_WORDS } from "@/lib/i18n/catalogues/components";

import { cx } from "./cx";

/// The mark for a SULIT value or column: a small lock to the eye, the whole sentence in the tooltip and to a screen reader. By default the
/// sentence is the general one (`SULIT_VALUE_WORDS`); a value a loader has judged (`Sulit<T>`) says why it is shown instead, so the mark never implies a protection
/// that is not there, nor denies one that is.
export function SulitLock({ size = 13, className, label }: { size?: number; className?: string; label?: string }) {
  const say = useSay();
  label ??= say(COMPONENT_WORDS.sulitValue);
  return (
    <span title={label} className={cx("inline-flex shrink-0 items-center text-ink-3", className)}>
      <LockIcon size={size} strokeWidth={2} />
      <span className="sr-only">{label}</span>
    </span>
  );
}

/// The tag on a card or section whose content is SULIT: it says the figures are shown only to the people entitled to them and that every reading is logged. It
/// promises nothing about who the reader is: the figures themselves are drawn, or withheld with the reason, one by one.
export function SulitTag({ className }: { className?: string }) {
  const words = useSay()(COMPONENT_WORDS.sulitValue);
  return (
    <span title={words} className={cx("inline-flex items-center gap-1.5 rounded-full border border-rose-200 bg-rose-50 px-3 py-1 text-[12.5px] font-medium text-rose-700", className)}>
      <LockIcon size={12} strokeWidth={2} />
      <span>SULIT</span>
      <span className="sr-only">{words}</span>
    </span>
  );
}

/// What stands where a SULIT value is withheld from the reader: the lock and "SULIT · withheld", with the reason in words as the tooltip and to a
/// screen reader. Never the value, never a placeholder shaped like one.
///
/// `compact` is for a place that says the reason itself (a list cell, whose column header carries the sentence once; a card that prints it beside): the reason stays in the
/// tooltip, and a screen reader is not read the same sentence again for every row.
export function SulitWithheld({ words, className, compact }: { words: string; className?: string; compact?: boolean }) {
  const say = useSay();
  return (
    <span title={words} className={cx("inline-flex items-center gap-1.5 text-[12.5px] font-medium whitespace-nowrap text-ink-3", className)}>
      <LockIcon size={13} strokeWidth={2} />
      <span>{say(COMPONENT_WORDS.sulitWithheld)}</span>
      {!compact && <span className="sr-only">{words}</span>}
    </span>
  );
}

/**
 * A value the organisation treats as SULIT, as a loader judged it for the reader (`Sulit<ReactNode>`, ADR 0034 D14): the value with a lock whose tooltip says why the
 * reader may see it, or "SULIT · withheld" with the reason. A withheld answer carries no value, so there is nothing to leak. There is no form that draws a value nothing has
 * judged: a screen that has a figure to show asks the rule first (Phase 3b retired the older form).
 */
export function SulitValue({ of: s }: { of: Sulit<ReactNode> }) {
  const say = useSay();
  if (s.state === "WITHHELD") return <SulitWithheld words={say(s.words)} />;
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="tabular-nums">{s.value}</span>
      <SulitLock label={`SULIT. ${say(grantedWords(s.basis))}`} />
    </span>
  );
}
