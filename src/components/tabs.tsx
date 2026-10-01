"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, type FocusEvent, type KeyboardEvent, type ReactNode } from "react";

import { navigatesOnSelect, tabKeyMove } from "@/lib/ui/tab-keys";

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
  /// What the tab shows. A tab with `sections` is loaded by the server one section at a
  /// time, so its panel is only there while it is the one being looked at: leave it
  /// null otherwise and selecting the tab asks the server for it.
  panel?: ReactNode;
  /// A second level under the tab, for a group of views that belong together (Scope,
  /// Bill of quantities, Company estimate). Each section is a link to
  /// `?tab=<tab>&section=<section>`, so it can be shared and survives a refresh, and the
  /// server renders only the section the address names.
  sections?: { id: string; label: string }[];
  /// The section the server rendered. Only read for the tab that has `sections`.
  section?: string;
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
  // The address names the tab: when a navigation (a section link, a shared URL) brings a
  // different one, follow it. Adjusting state while rendering, as React recommends, rather
  // than in an effect that would paint the old tab first.
  const [seen, setSeen] = useState(initial);
  if (initial !== seen) {
    setSeen(initial);
    setActive(initial ?? tabs[0]?.id);
  }
  const router = useRouter();
  const pathname = usePathname();
  // A long strip drops its icons and tightens below the widest screens, so every tab
  // fits beside the sidebar instead of scrolling the last ones out of sight.
  const dense = tabs.length > 6;
  const current = tabs.find((t) => t.id === active) ?? tabs[0];
  // Roving focus: the tab the keyboard is on, which may be ahead of the one selected (a tab
  // with sections is selected only on Enter, Space or a click). Null: focus follows selection.
  const [focused, setFocused] = useState<string | null>(null);
  const focusId = focused ?? current?.id;
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
    const next = tabs.find((t) => t.id === id);
    setActive(id);
    setFocused(null);
    // A tab with sections is loaded by the server, one section at a time: go and get it.
    if (next?.sections && navigatesOnSelect(next)) {
      if (id !== current?.id) router.push(sectionHref(pathname, id, next.sections[0].id), { scroll: false });
      return;
    }
    const url = new URL(window.location.href);
    url.searchParams.set("tab", id);
    // Another tab's section is not this tab's.
    url.searchParams.delete("section");
    window.history.replaceState(null, "", url);
  };

  // Arrow keys (and Home/End) move between tabs, as a tablist is expected to. A plain tab
  // is selected as focus arrives; a tab with sections is a navigation, so arrowing onto it
  // only moves focus and Enter or Space (the button's click) selects it (tab-keys.ts).
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const move = tabKeyMove(tabs, focusId, e.key);
    if (!move) return;
    e.preventDefault();
    if (move.select) select(move.focus);
    else setFocused(move.focus);
    strip.current?.querySelector<HTMLButtonElement>(`[data-tab="${move.focus}"]`)?.focus();
  };
  // Leaving the strip hands the roving stop back to the selected tab.
  const onBlur = (e: FocusEvent<HTMLDivElement>) => {
    if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setFocused(null);
  };

  return (
    <div className="flex min-w-0 flex-col gap-5">
      <div className="relative w-fit max-w-full min-w-0 rounded-full bg-ink/[0.05]">
      <div
        ref={strip}
        role="tablist"
        aria-label={label}
        onKeyDown={onKeyDown}
        onBlur={onBlur}
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
              tabIndex={tab.id === focusId ? 0 : -1}
              onClick={() => select(tab.id)}
              className={`flex shrink-0 snap-center items-center gap-2 rounded-full py-2 text-[13.5px] font-semibold whitespace-nowrap text-ink-3 transition hover:text-ink aria-selected:bg-surface aria-selected:text-ink aria-selected:shadow-[0_1px_3px_rgb(15_23_42/0.12)] ${dense ? "px-3 2xl:px-4" : "px-4"}`}
            >
              {tab.icon && (dense ? <span className="hidden 2xl:inline-flex">{tab.icon}</span> : tab.icon)}
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
        {current?.sections?.length ? (
          <div className="flex min-w-0 flex-col gap-5">
            <nav aria-label={`${current.label} sections`} className="flex max-w-full gap-1 overflow-x-auto border-b border-line [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {current.sections.map((s) => {
                const on = s.id === (current.section ?? current.sections![0].id);
                return (
                  <Link
                    key={s.id}
                    href={sectionHref(pathname, current.id, s.id)}
                    scroll={false}
                    aria-current={on ? "page" : undefined}
                    className={`-mb-px shrink-0 border-b-2 px-3.5 py-2.5 text-[13.5px] font-semibold whitespace-nowrap transition hover:text-ink hover:no-underline ${on ? "border-brand-600 text-ink" : "border-transparent text-ink-3"}`}
                  >
                    {s.label}
                  </Link>
                );
              })}
            </nav>
            {current.panel ?? <p className="text-[13.5px] text-ink-3" role="status">Loading…</p>}
          </div>
        ) : (
          current?.panel
        )}
      </div>
    </div>
  );
}

/// Where a section of a tab is: the same page, with the tab and the section named.
const sectionHref = (pathname: string, tab: string, section: string) => `${pathname}?tab=${encodeURIComponent(tab)}&section=${encodeURIComponent(section)}`;
