import type { ReactNode } from "react";

import { XIcon } from "@/components/icons";

import { iconButtonClass } from "./button";
import { cx } from "./cx";

/**
 * (A drawer is rendered where its opener sits, which can be inside a table cell that
 * says `whitespace-nowrap`; the scrim resets it so the drawer's text always wraps.)
 *
 * The side drawer every create, edit, history and detail view opens in: a dimmed
 * scrim, a white panel on the right, a header with the record's name and a close
 * button, then a scrolling body. One shell, so no two drawers differ in width,
 * spacing or how they close.
 */

export const DRAWER_SCRIM = "fixed inset-0 z-50 flex justify-end bg-ink/30 text-left font-normal whitespace-normal backdrop-blur-[2px]";

export const DRAWER_WIDTH = {
  sm: "w-[28rem]",
  md: "w-[34rem]",
  lg: "w-[46rem]",
  xl: "w-[60rem]",
} as const;

export type DrawerSize = keyof typeof DRAWER_WIDTH;

export function drawerPanelClass(size: DrawerSize = "md", extra?: string): string {
  return cx("flex h-full max-w-[96vw] flex-col bg-surface shadow-pop", DRAWER_WIDTH[size], extra);
}

/// A confirmation with nothing to fill in opens as a small box in the middle, sized to its
/// words, rather than a full-height panel that is mostly empty (founder, 2026-10-05).
export const CONFIRM_SCRIM = "fixed inset-0 z-50 flex items-center justify-center bg-ink/30 p-4 text-left font-normal whitespace-normal backdrop-blur-[2px]";

export function confirmPanelClass(extra?: string): string {
  return cx("flex max-h-[90vh] w-[28rem] max-w-full flex-col overflow-hidden rounded-2xl bg-surface shadow-pop", extra);
}

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
      </div>
      <button type="button" className={iconButtonClass("sm")} aria-label="Close" onClick={onClose}>
        <XIcon size={17} />
      </button>
    </header>
  );
}
