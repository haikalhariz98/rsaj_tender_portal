"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useId, useState, type CSSProperties, type FocusEvent, type KeyboardEvent, type ReactNode } from "react";

import { ChevronLeft, ChevronRight } from "@/components/icons";
import { PanelSkeleton } from "@/components/ui/skeleton";
import { useLanguage, useSay } from "@/components/i18n/language-context";
import { COMPONENT_WORDS as WORDS } from "@/lib/i18n/catalogues/components";
import { sayWith } from "@/lib/i18n/say";
import { scrollFor } from "@/lib/ui/strip-scroll";
import { tabHref } from "@/lib/ui/tab-href";
import { navigatesOnSelect, sectionToOpen, tabKeyMove } from "@/lib/ui/tab-keys";

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
  /// The server renders this tab's panel only while it is the one the address names (it reads
  /// data no other tab needs). Selecting it is a navigation to `?tab=<id>`; leave `panel` null
  /// until then. For a tab with `sections` this is already so.
  lazy?: boolean;
}

/**
 * A strip that scrolls sideways when its items do not fit, used by both levels of tabs so
 * they behave alike. It says whether there is more past either edge (`more`), keeps the
 * item `current` names in view when it changes (the strip only, never the page), and gives
 * `scroll` to the edge buttons. `keyOf` is whatever identifies the current item: a change
 * of it re-centres the strip, including on first paint from a deep link.
 */
function useScrollStrip<T extends HTMLElement>(currentSelector: string, keyOf: string | undefined, count: number) {
  // The element is held as state (a callback ref), so nothing reads a ref while rendering and
  // the effects below run again when the strip mounts or is swapped for another.
  const [el, setEl] = useState<T | null>(null);
  const [more, setMore] = useState({ start: false, end: false });

  const measure = useCallback(() => {
    if (!el) return;
    const start = el.scrollLeft > 2;
    const end = el.scrollLeft + el.clientWidth < el.scrollWidth - 2;
    setMore((m) => (m.start === start && m.end === end ? m : { start, end }));
  }, [el]);

  // Observing reports the strip's size at once, so this also takes the first measurement.
  useEffect(() => {
    if (!el) return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [el, measure, count]);

  useEffect(() => {
    const item = el?.querySelector<HTMLElement>(currentSelector);
    if (!el || !item) return;
    // Only as far as the item needs (`scrollFor`), measured from the rectangles so it does not
    // depend on which ancestor is positioned.
    const box = el.getBoundingClientRect();
    const r = item.getBoundingClientRect();
    const to = scrollFor({ scrollLeft: el.scrollLeft, scrollWidth: el.scrollWidth, width: el.clientWidth, itemLeft: r.left - box.left, itemRight: r.right - box.left, fade: 44 });
    if (to != null) el.scrollTo({ left: to, behavior: "auto" });
    // The scroll event that follows (onScroll) measures again.
  }, [el, currentSelector, keyOf]);

  const scroll = (dir: -1 | 1) => el?.scrollBy({ left: dir * Math.max(120, el.clientWidth * 0.6), behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  // Edge fades say there are more items off-screen. A mask rather than an overlay, so it
  // needs no colour matched to what is behind and never intercepts a click.
  const mask: CSSProperties | undefined =
    more.start || more.end
      ? { maskImage: `linear-gradient(to right, ${more.start ? "transparent, #000 36px" : "black, black"}, ${more.end ? "black calc(100% - 36px), transparent" : "black, black"})` }
      : undefined;
  return { el, attach: setEl, more, measure, scroll, mask };
}

/// The buttons at a strip's edges that scroll it, shown only on the side that has more. They
/// are for the pointer: the keyboard moves between tabs with the arrow keys, so they stay out
/// of the tab order.
function EdgeButtons({ more, scroll, label }: { more: { start: boolean; end: boolean }; scroll: (dir: -1 | 1) => void; label: string }) {
  const { language } = useLanguage();
  const cls = "absolute top-1/2 z-10 flex size-7 -translate-y-1/2 items-center justify-center rounded-full border border-line bg-surface text-ink-2 shadow-sm transition hover:text-ink";
  return (
    <>
      {more.start && (
        <button type="button" tabIndex={-1} aria-label={sayWith(WORDS.scrollBack, language, { label })} onClick={() => scroll(-1)} className={`${cls} left-1`}>
          <ChevronLeft size={15} />
        </button>
      )}
      {more.end && (
        <button type="button" tabIndex={-1} aria-label={sayWith(WORDS.scrollForward, language, { label })} onClick={() => scroll(1)} className={`${cls} right-1`}>
          <ChevronRight size={15} />
        </button>
      )}
    </>
  );
}

export function Tabs({
  tabs,
  initial,
  label,
  dense: denseAsked,
  keep,
}: {
  tabs: TabSpec[];
  /// Tighten the strip and drop its icons below the widest screens. By default a strip does it
  /// when it has more than six tabs; a screen whose tab set varies from one record to the next
  /// says so itself, so its strip looks the same on every record.
  dense?: boolean;
  initial?: string;
  /// Other address parameters a navigation from this strip carries along (the case page's `stage`), so a tab or section
  /// hop does not drop them. Absent: the address is `?tab=` and `?section=` only, as ever.
  keep?: Readonly<Record<string, string>>;
  /// What the strip is, for a screen reader.
  label?: string;
}) {
  const say = useSay();
  const { language } = useLanguage();
  // Each tab names the panel it controls, and the panel is named by the selected tab (APG tabs pattern).
  const uid = useId();
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
  const dense = denseAsked ?? tabs.length > 6;
  const current = tabs.find((t) => t.id === active) ?? tabs[0];
  // Roving focus: the tab the keyboard is on, which may be ahead of the one selected (a tab
  // with sections is selected only on Enter, Space or a click). Null: focus follows selection.
  const [focused, setFocused] = useState<string | null>(null);
  const focusId = focused ?? current?.id;
  const { el: stripEl, attach: attachStrip, more: stripMore, measure: measureStrip, scroll: scrollStrip, mask: stripMask } = useScrollStrip<HTMLDivElement>('[aria-selected="true"]', current?.id, tabs.length);
  const { attach: attachSub, more: subMore, measure: measureSub, scroll: scrollSub, mask: subMask } = useScrollStrip<HTMLElement>('[aria-current="page"]', current?.section ?? current?.id, current?.sections?.length ?? 0);

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
      // Back to a tab that has sections lands on the section the address last named, if it is one of its.
      const section = sectionToOpen(next.sections, new URL(window.location.href).searchParams.get("section"));
      if (id !== current?.id && section) router.push(tabHref(pathname, id, section, keep), { scroll: false });
      return;
    }
    if (next && next.lazy) {
      if (id !== current?.id) router.push(tabHref(pathname, id, undefined, keep), { scroll: false });
      return;
    }
    const url = new URL(window.location.href);
    url.searchParams.set("tab", id);
    // The section stays in the address: it is only used when it is one of the sectioned tab's own, so
    // returning to that tab finds the section the officer was on.
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
    stripEl?.querySelector<HTMLButtonElement>(`[data-tab="${move.focus}"]`)?.focus();
  };
  // Leaving the strip hands the roving stop back to the selected tab.
  const onBlur = (e: FocusEvent<HTMLDivElement>) => {
    if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setFocused(null);
  };

  return (
    <div className="flex min-w-0 flex-col gap-5">
      <div className="relative w-fit max-w-full min-w-0 rounded-full bg-ink/[0.05]">
      <div
        ref={attachStrip}
        role="tablist"
        aria-label={label ?? say(WORDS.sections)}
        onKeyDown={onKeyDown}
        onBlur={onBlur}
        onScroll={measureStrip}
        style={stripMask}
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
              id={`${uid}-tab-${tab.id}`}
              aria-controls={selected ? `${uid}-panel` : undefined}
              aria-selected={selected}
              tabIndex={tab.id === focusId ? 0 : -1}
              onClick={() => select(tab.id)}
              className={`flex shrink-0 snap-center items-center gap-2 rounded-full py-2 text-[13.5px] font-semibold whitespace-nowrap text-ink-3 transition hover:text-ink focus-visible:-outline-offset-2! aria-selected:bg-surface aria-selected:text-ink aria-selected:shadow-[0_1px_3px_rgb(15_23_42/0.12)] ${dense ? "px-3 2xl:px-4" : "px-4"}`}
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
      <EdgeButtons more={stripMore} scroll={scrollStrip} label={say(WORDS.theTabs)} />
      </div>

      <div role="tabpanel" id={`${uid}-panel`} aria-labelledby={current ? `${uid}-tab-${current.id}` : undefined} className="min-w-0">
        {current?.sections?.length ? (
          <div className="flex min-w-0 flex-col gap-5">
            <div className="relative min-w-0">
              <nav
                ref={attachSub}
                aria-label={sayWith(WORDS.sectionsOf, language, { label: current.label })}
                onScroll={measureSub}
                style={subMask}
                className="flex max-w-full gap-1 overflow-x-auto border-b border-line [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
              >
                {current.sections.map((s) => {
                  const on = s.id === (current.section ?? current.sections![0].id);
                  return (
                    <Link
                      key={s.id}
                      href={tabHref(pathname, current.id, s.id, keep)}
                      scroll={false}
                      aria-current={on ? "page" : undefined}
                      // Inset: the strip scrolls, so it clips an outline drawn outside the link.
                      className={`-mb-px shrink-0 border-b-2 px-3.5 py-2.5 text-[13.5px] font-semibold whitespace-nowrap transition hover:text-ink hover:no-underline focus-visible:-outline-offset-2! ${on ? "border-brand-600 text-ink" : "border-transparent text-ink-3"}`}
                    >
                      {s.label}
                    </Link>
                  );
                })}
              </nav>
              <EdgeButtons more={subMore} scroll={scrollSub} label={sayWith(WORDS.sectionsOf, language, { label: current.label })} />
            </div>
            {current.panel ?? <PanelSkeleton label={say(WORDS.loading)} />}
          </div>
        ) : (
          (current?.panel ?? (current?.lazy ? <PanelSkeleton label={say(WORDS.loading)} /> : null))
        )}
      </div>
    </div>
  );
}

