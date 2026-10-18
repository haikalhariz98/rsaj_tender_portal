"use client";

import { useState, useTransition } from "react";

import { useLanguage, useSay, useSetLanguage } from "@/components/i18n/language-context";
import { cx } from "@/components/ui/cx";
import { Toggle } from "@/components/ui/toggle";
import { SHELL_WORDS } from "@/lib/i18n/catalogues/shell";
import { LANGUAGE_NAMES, LANGUAGES, type Language } from "@/lib/i18n/language";
import type { Words } from "@/lib/contract/labels";

/**
 * The switch between English and Bahasa Malaysia (NFR-LNG-001, ADR 0040), in the top bar and in every drawer's header, because an open
 * drawer is modal and the top bar cannot be reached from inside one.
 *
 * It must never submit anything. RecordEditor draws its drawer's header inside its own `<form>`, so a submit button here would submit that
 * form, a nested `<form>` is invalid, and React 19 resets a form's uncontrolled fields after a form action succeeds: any of the three would
 * lose what was typed. So the controls are `type="button"`, the action is called from a transition, and `refresh()` on the server re-renders
 * the page in place. Each option is named in its own language, the same in both settings. Nothing is keyed on the language.
 */
export function LanguageSwitch({ className }: { className?: string }) {
  const { language, choice, canSwitch } = useLanguage();
  const say = useSay();
  const setLanguage = useSetLanguage();
  const [pending, startTransition] = useTransition();
  const [refused, setRefused] = useState<Words | null>(null);
  if (!canSwitch || !setLanguage) return null;

  const choose = (next: Language) => {
    // Against the stored choice, not the language read: with nothing chosen English reads, and pressing it must record that English was chosen.
    // Presses while a save is out are ignored, not disabled: a disabled button drops the keyboard focus out of a modal drawer.
    if (next === choice || pending) return;
    const data = new FormData();
    data.set("language", next);
    startTransition(async () => {
      try {
        const result = await setLanguage(data);
        setRefused(result.ok ? null : result.message);
      } catch {
        setRefused(SHELL_WORDS.languageNotSaved);
      }
    });
  };

  return (
    <span aria-busy={pending} className={cx("flex shrink-0 flex-col gap-1", className ?? "items-end")}>
      <Toggle
        label={say(SHELL_WORDS.languageSwitch)}
        value={language}
        options={LANGUAGES.map((l) => ({ value: l, label: LANGUAGE_NAMES[l] }))}
        onChange={choose}
      />
      {refused && (
        <span role="alert" className="max-w-64 text-[12px] text-rose-700">
          {say(refused)}
        </span>
      )}
    </span>
  );
}
