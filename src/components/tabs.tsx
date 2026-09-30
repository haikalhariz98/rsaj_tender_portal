"use client";

import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";

/**
 * The tab strip under a Configuration screen's header. One component, so every
 * screen with tabs — Organisation, Users & roles, Budget — looks and behaves alike.
 *
 * Only the selected panel is rendered: each panel may load a different slice of the
 * record, and rendering all of them would do work for tabs nobody is looking at.
 */
export interface TabSpec {
  id: string;
  label: string;
  icon?: ReactNode;
  /// A count beside the label, where the tab is a list.
  count?: number;
  panel: ReactNode;
}

export function Tabs({
  tabs,
  initial,
  label = "Sections",
}: {
  tabs: TabSpec[];
  initial?: string;
  /// What the strip is, for a screen reader.
  label?: string;
}) {
  const [active, setActive] = useState(initial ?? tabs[0]?.id);
  const current = tabs.find((t) => t.id === active) ?? tabs[0];
  const strip = useRef<HTMLDivElement>(null);
  // Whether the strip has more tabs hidden past its left / right edge. Drives the
  // edge fades, which are the visible cue that the strip scrolls.
  const [more, setMore] = useState({ start: false, end: false });

  const measure = useCallback(() => {
    const el = strip.current;
    if (!el) return;
    const start = el.scrollLeft > 2;
    const end = el.scrollLeft + el.clientWidth < el.scrollWidth - 2;
    setMore((m) => (m.start === start && m.end === end ? m : { start, end }));
  }, []);

  useEffect(() => {
    measure();
    const el = strip.current;
    if (!el) return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [measure, tabs.length]);

  // Keep the selected tab in view, including on first paint with `?tab=` deep links.
  // Scrolls the strip only (never the page).
  useEffect(() => {
    const el = strip.current;
    const tab = el?.querySelector<HTMLElement>('[aria-selected="true"]');
    if (!el || !tab) return;
    const left = tab.offsetLeft - (el.clientWidth - tab.offsetWidth) / 2;
    el.scrollTo({ left: Math.max(0, left), behavior: "auto" });
    measure();
  }, [current?.id, measure]);

  /**
   * Switching a tab writes it to the address bar as `?tab=`. Not a navigation —
   * every panel is already on the client. The server reads the same parameter, which
   * is what makes a tab shareable and survive a refresh.
   */
  const select = (id: string) => {
    setActive(id);
    const url = new URL(window.location.href);
    url.searchParams.set("tab", id);
    window.history.replaceState(null, "", url);
  };

  // Arrow keys move between tabs, as a tablist is expected to.
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    const i = tabs.findIndex((t) => t.id === current?.id);
    const next = tabs[(i + (e.key === "ArrowRight" ? 1 : tabs.length - 1)) % tabs.length];
    select(next.id);
    strip.current?.querySelector<HTMLButtonElement>(`[data-tab="${next.id}"]`)?.focus();
  };

  return (
    <div className="flex min-w-0 flex-col gap-5">
      <div className="relative w-fit max-w-full min-w-0 rounded-full bg-ink/[0.05]">
      <div
        ref={strip}
        role="tablist"
        aria-label={label}
        onKeyDown={onKeyDown}
        onScroll={measure}
        // Edge fades say there are more tabs off-screen. A mask rather than an overlay,
        // so it needs no colour matched to the pill and never intercepts a click.
        style={
          more.start || more.end
            ? {
                maskImage: `linear-gradient(to right, ${more.start ? "transparent, #000 28px" : "black, black"}, ${more.end ? "black calc(100% - 28px), transparent" : "black, black"})`,
              }
            : undefined
        }
        className="flex max-w-full snap-x snap-proximity gap-1 overflow-x-auto overscroll-x-contain rounded-full p-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {tabs.map((tab) => {
          const selected = tab.id === current?.id;
          return (
            <button
              key={tab.id}
              data-tab={tab.id}
              type="button"
              role="tab"
              aria-selected={selected}
              tabIndex={selected ? 0 : -1}
              onClick={() => select(tab.id)}
              className="flex shrink-0 snap-center items-center gap-2 rounded-full px-4 py-2 text-[13.5px] font-semibold whitespace-nowrap text-ink-3 transition hover:text-ink aria-selected:bg-surface aria-selected:text-ink aria-selected:shadow-[0_1px_3px_rgb(15_23_42/0.12)]"
            >
              {tab.icon}
              {tab.label}
              {tab.count != null && (
                <span className="rounded-full bg-ink/[0.07] px-1.5 text-[11.5px] leading-5 tabular-nums">
                  {tab.count}
                </span>
              )}
            </button>
          );
        })}
      </div>
      </div>

      <div role="tabpanel" className="min-w-0">
        {current?.panel}
      </div>
    </div>
  );
}
