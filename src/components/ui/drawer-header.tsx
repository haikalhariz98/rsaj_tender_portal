"use client";

import type { ReactNode } from "react";

import { XIcon } from "@/components/icons";
import { useSay } from "@/components/i18n/language-context";
import { LanguageSwitch } from "@/components/shell/language-switch";
import { COMPONENT_WORDS } from "@/lib/i18n/catalogues/components";

import { iconButtonClass } from "./button";

/**
 * The header of every drawer (see `drawer.tsx`): the record's name, a language switch where the person may choose one, and a close button.
 *
 * The switch is here because an open drawer is modal (ruling 20bt): the top bar cannot be reached while one is open, and pressing the scrim
 * closes it. Its controls are plain buttons, never submit buttons, because `RecordEditor` draws this header inside its own form (NFR-LNG-001,
 * ADR 0040).
 */
export function DrawerHeader({
  icon,
  title,
  badge,
  subtitle,
  onClose,
}: {
  icon?: ReactNode;
  title: ReactNode;
  badge?: ReactNode;
  subtitle?: ReactNode;
  onClose: () => void;
}) {
  const say = useSay();
  return (
    <header className="flex items-start gap-3 border-b border-line px-6 py-5">
      {icon && (
        <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-700">
          {icon}
        </span>
      )}
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-2">
          <h2
            className="min-w-0 text-[18px] leading-snug font-bold tracking-tight break-words text-ink"
            title={typeof title === "string" ? title : undefined}
          >
            {title}
          </h2>
          {badge}
        </div>
        {subtitle && <p className="mt-0.5 text-[13px] break-words text-ink-3">{subtitle}</p>}
        {/* On its own row: the narrowest drawer has no room beside a title for two language names. */}
        <LanguageSwitch className="mt-3 items-start" />
      </div>
      <button type="button" className={iconButtonClass("sm")} aria-label={say(COMPONENT_WORDS.close)} onClick={onClose}>
        <XIcon size={17} />
      </button>
    </header>
  );
}
