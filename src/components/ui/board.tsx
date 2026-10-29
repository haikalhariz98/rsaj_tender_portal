"use client";

import Link from "next/link";
import { startTransition, useId, useOptimistic, useRef, useState, type KeyboardEvent } from "react";

import { MoreIcon } from "@/components/icons";

import { Badge } from "./badge";
import { cx } from "./cx";
import { iconButtonClass } from "./button";

/**
 * Columns of cards, as data (so a server component can hand them over). A card moves three ways that end in the same call: drag and drop, the card's own
 * "Move to" menu, and the keyboard (the menu is a button). The board never decides what may move: each card carries `moves`, the column ids the caller's rule
 * (`moveFaults`) allows it into, and the board offers only those. The caller's `move` action does the real act and may refuse; the card then returns to
 * its column and the refusal is said. Arrow keys walk the cards (up and down in a column, left and right across columns); Enter on a card opens it, as it is a link.
 */
export interface BoardCard {
  id: string;
  columnId: string;
  title: string;
  /// A reference or a second line under the title.
  sub?: string;
  /// Where Enter and a click go; the board knows no routing.
  href: string;
  badges?: { text: string; tone?: "ok" | "warn" | "err" | "info" | "brand" }[];
  /// The person it is with, as a name.
  assignee?: string;
  /// Column ids this card may move into. Empty: it cannot move, and `stuckWhy` says why.
  moves: string[];
  stuckWhy?: string;
  /// Sent with the move: the card's own identifiers (item id, the type…), beside `from` and `to`.
  fields: Record<string, string>;
}

export interface BoardColumn {
  id: string;
  label: string;
  /// The true number in the column; the cards are capped by the reader, so this can be more than `cards`.
  total: number;
  /// Where the rest of a capped column is (the list view filtered to it).
  moreHref?: string;
}

export type BoardMove = (data: FormData) => Promise<{ refused?: string } | void>;

export function Board({
  columns,
  cards,
  move,
  label,
  moreLabel = "See all",
  moveLabel = "Move to",
  emptyColumn = "Nothing here",
}: {
  columns: BoardColumn[];
  cards: BoardCard[];
  move: BoardMove;
  /// The accessible name of the whole board.
  label: string;
  moreLabel?: string;
  moveLabel?: string;
  emptyColumn?: string;
}) {
  const [shown, place] = useOptimistic(cards, (cur, p: { id: string; to: string }) => cur.map((c) => (c.id === p.id ? { ...c, columnId: p.to } : c)));
  const [refused, setRefused] = useState<string | null>(null);
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const dragging = useRef<BoardCard | null>(null);
  const names = useId();

  function go(card: BoardCard, to: string) {
    if (to === card.columnId || !card.moves.includes(to)) return;
    setRefused(null);
    setMenuFor(null);
    startTransition(async () => {
      place({ id: card.id, to });
      const data = new FormData();
      for (const [k, v] of Object.entries(card.fields)) data.set(k, v);
      data.set("from", card.columnId);
      data.set("to", to);
      try {
        const r = await move(data);
        if (r?.refused) setRefused(r.refused);
      } catch {
        setRefused("That did not save. Try again.");
      }
    });
  }

  // Arrow keys: the cards are in DOM order column by column, so up and down are the neighbours in the column, left and right the same row in the next column.
  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    const here = (e.target as HTMLElement).closest<HTMLElement>("[data-board-card]");
    if (!here || !["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.key)) return;
    if ((e.target as HTMLElement) !== here.querySelector("a")) return;
    const col = here.closest<HTMLElement>("[data-board-column]")!;
    const inCol = [...col.querySelectorAll<HTMLElement>("[data-board-card]")];
    const i = inCol.indexOf(here);
    let next: HTMLElement | undefined;
    if (e.key === "ArrowUp") next = inCol[i - 1];
    if (e.key === "ArrowDown") next = inCol[i + 1];
    if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
      const cols = [...root.current!.querySelectorAll<HTMLElement>("[data-board-column]")];
      const step = e.key === "ArrowLeft" ? -1 : 1;
      // Skip empty columns: the nearest column in that direction that holds a card.
      for (let j = cols.indexOf(col) + step; j >= 0 && j < cols.length && !next; j += step) {
        const there = [...cols[j].querySelectorAll<HTMLElement>("[data-board-card]")];
        next = there[Math.min(i, there.length - 1)];
      }
    }
    if (!next) return;
    e.preventDefault();
    next.querySelector<HTMLElement>("a")?.focus();
  }

  return (
    <div>
      {refused && (
        <p role="alert" className="mb-3 rounded-xl bg-rose-50 px-4 py-2.5 text-[13.5px] text-rose-700">
          {refused}
        </p>
      )}
      <div ref={root} role="group" aria-label={label} onKeyDown={onKeyDown} className="flex gap-3 overflow-x-auto pb-2">
        {columns.map((col) => {
          const inCol = shown.filter((c) => c.columnId === col.id);
          const headId = `${names}-${col.id}`;
          return (
            <section
              key={col.id}
              data-board-column
              aria-labelledby={headId}
              onDragOver={(e) => {
                if (dragging.current?.moves.includes(col.id) && dragging.current.columnId !== col.id) e.preventDefault();
              }}
              onDrop={(e) => {
                e.preventDefault();
                if (dragging.current) go(dragging.current, col.id);
                dragging.current = null;
              }}
              className="flex w-72 shrink-0 flex-col rounded-2xl bg-sunken p-2.5"
            >
              <h3 id={headId} className="flex items-center justify-between px-1.5 pt-1 pb-2.5 text-[13px] font-semibold text-ink-2">
                {col.label}
                <span className="text-ink-3 tabular-nums">{col.total}</span>
              </h3>
              <ul className="flex min-h-12 flex-col gap-2">
                {inCol.map((c) => (
                  <li key={c.id} data-board-card draggable={c.moves.length > 0} onDragStart={() => (dragging.current = c)} onDragEnd={() => (dragging.current = null)} className="relative rounded-xl border border-line/70 bg-surface p-3 shadow-card">
                    <Link href={c.href} className="block pr-7 text-[14px] font-semibold break-words text-ink no-underline hover:text-brand-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500">
                      {c.title}
                    </Link>
                    {c.sub && <div className="text-[12.5px] break-words text-ink-3">{c.sub}</div>}
                    {(c.badges?.length || c.assignee) && (
                      <div className="mt-2 flex flex-wrap items-center gap-1.5">
                        {c.badges?.map((b) => (
                          <Badge key={b.text} tone={b.tone}>
                            {b.text}
                          </Badge>
                        ))}
                        {c.assignee && <span className="text-[12.5px] text-ink-3">{c.assignee}</span>}
                      </div>
                    )}
                    {c.moves.length > 0 ? (
                      <div className="absolute top-2 right-2">
                        <button
                          type="button"
                          aria-haspopup="menu"
                          aria-expanded={menuFor === c.id}
                          aria-label={`${moveLabel}: ${c.title}`}
                          className={iconButtonClass("sm", false, "size-7")}
                          onClick={() => setMenuFor(menuFor === c.id ? null : c.id)}
                          onKeyDown={(e) => {
                            if (e.key === "Escape") setMenuFor(null);
                          }}
                        >
                          <MoreIcon size={16} />
                        </button>
                        {menuFor === c.id && (
                          <ul role="menu" aria-label={moveLabel} className="absolute right-0 z-20 mt-1 w-48 rounded-xl border border-line bg-surface p-1 shadow-pop">
                            {c.moves
                              .filter((to) => to !== c.columnId)
                              .map((to, n) => (
                                <li key={to} role="none">
                                  <button
                                    autoFocus={n === 0}
                                    type="button"
                                    role="menuitem"
                                    className={cx("block w-full rounded-lg px-3 py-2 text-left text-[13.5px] text-ink hover:bg-sunken focus-visible:bg-sunken focus-visible:outline-none")}
                                    onClick={() => go(c, to)}
                                    onKeyDown={(e) => {
                                      if (e.key === "Escape") setMenuFor(null);
                                    }}
                                  >
                                    {columns.find((k) => k.id === to)?.label ?? to}
                                  </button>
                                </li>
                              ))}
                          </ul>
                        )}
                      </div>
                    ) : (
                      c.stuckWhy && <span className="sr-only">{c.stuckWhy}</span>
                    )}
                  </li>
                ))}
                {inCol.length === 0 && <li className="px-1.5 py-3 text-[13px] text-ink-3">{emptyColumn}</li>}
              </ul>
              {col.moreHref && col.total > inCol.length && (
                <Link href={col.moreHref} className="px-1.5 pt-2.5 text-[13px] font-semibold text-brand-700 no-underline hover:underline">
                  {moreLabel} ({col.total})
                </Link>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}
