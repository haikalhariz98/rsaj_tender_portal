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

export const DRAWER_SCRIM = "fixed inset-0 z-50 flex justify-end overscroll-contain bg-ink/30 text-left font-normal whitespace-normal backdrop-blur-[2px]";

export const DRAWER_WIDTH = {
  sm: "w-[28rem]",
  md: "w-[34rem]",
  lg: "w-[46rem]",
  xl: "w-[60rem]",
} as const;

export type DrawerSize = keyof typeof DRAWER_WIDTH;

export function drawerPanelClass(size: DrawerSize = "md", extra?: string): string {
  return cx("flex h-full max-w-[96vw] flex-col overscroll-contain bg-surface shadow-pop", DRAWER_WIDTH[size], extra);
}

/// A confirmation with nothing to fill in opens as a small box in the middle, sized to its
/// words, rather than a full-height panel that is mostly empty (founder, 2026-10-05).
export const CONFIRM_SCRIM = "fixed inset-0 z-50 flex items-center justify-center overscroll-contain bg-ink/30 p-4 text-left font-normal whitespace-normal backdrop-blur-[2px]";

export function confirmPanelClass(extra?: string): string {
  return cx("flex max-h-[90vh] w-[28rem] max-w-full flex-col overflow-hidden overscroll-contain rounded-2xl bg-surface shadow-pop", extra);
}

/// The drawer's header is a client component (it carries the language switch and says "Close" in the language being read), so it lives in its own
/// file; this module stays free of hooks, because server components import the scrim and panel classes from it.
export { DrawerHeader } from "./drawer-header";
