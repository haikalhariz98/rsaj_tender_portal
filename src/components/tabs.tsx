"use client";

import { useState, type ReactNode } from "react";

/**
 * The tab strip the prototype puts at the head of a configuration screen.
 *
 * Markup taken from the prototype's rendered DOM rather than approximated:
 * `.tabbar.tabbar--flush[role=tablist]` holding `button.tab[role=tab][aria-selected]`,
 * inside a `.card > .card__body--flush.card__body--tight`.
 *
 * Only the selected panel is rendered. The prototype does the same — its inactive
 * tabs have no DOM at all — and it matters here beyond fidelity: each panel loads a
 * different slice of the roster, and rendering all four would query for three the
 * officer is not looking at.
 */
export interface TabSpec {
  id: string;
  label: string;
  icon?: ReactNode;
  panel: ReactNode;
}

export function Tabs({ tabs, initial }: { tabs: TabSpec[]; initial?: string }) {
  const [active, setActive] = useState(initial ?? tabs[0]?.id);
  const current = tabs.find((t) => t.id === active) ?? tabs[0];

  /**
   * Switching a tab writes it to the address bar.
   *
   * Not a navigation — every panel is already on the client, so a round trip would
   * only make the strip feel slow. The server reads the same parameter, which is
   * what makes a tab shareable, survive a refresh, and be fetchable one at a time by
   * the screen comparator. Without it only the first tab is ever in the markup, and
   * three of these four have never been compared against the sample.
   */
  const select = (id: string) => {
    setActive(id);
    const url = new URL(window.location.href);
    url.searchParams.set("tab", id);
    window.history.replaceState(null, "", url);
  };

  return (
    <>
      <div className="card">
        <div className="card__body card__body--flush card__body--tight">
          <div style={{ padding: "4px 14px 0" }}>
            <div className="tabbar tabbar--flush" role="tablist">
              {tabs.map((tab) => {
                const selected = tab.id === current?.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    role="tab"
                    className="tab"
                    aria-selected={selected}
                    tabIndex={selected ? 0 : -1}
                    onClick={() => select(tab.id)}
                  >
                    {tab.icon}
                    {tab.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {current?.panel}
    </>
  );
}
