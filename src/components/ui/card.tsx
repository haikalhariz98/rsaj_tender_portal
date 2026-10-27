import type { HTMLAttributes, ReactNode } from "react";

import { ChevronDown } from "@/components/icons";

import { cx } from "./cx";
import { MoreText } from "./more-text";
import { OpenOnHash } from "./open-on-hash";

/// The one surface everything sits on: white, softly rounded, barely lifted.
export function Card({
  className,
  tone = "default",
  ...props
}: HTMLAttributes<HTMLDivElement> & { tone?: "default" | "flat" | "brand" }) {
  return (
    <div
      className={cx(
        "min-w-0 rounded-card",
        tone === "default" && "border border-line/70 bg-surface shadow-card",
        tone === "flat" && "border border-line bg-surface",
        tone === "brand" &&
          "border border-brand-100 bg-linear-to-br from-brand-50 to-surface shadow-card",
        className,
      )}
      {...props}
    />
  );
}

/// Title row of a card. The icon sits in a soft tinted tile.
export function CardHeader({
  icon,
  title,
  subtitle,
  info,
  actions,
  className,
  divided = true,
  collapsible = false,
  defaultOpen = false,
  summary,
  children,
  id,
}: {
  icon?: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  /// What the card covers, behind an information button beside the title (as PageHeader's `info`). Not on a collapsible card: a button
  /// inside its `summary` would fold it.
  info?: { label: string; text: string };
  actions?: ReactNode;
  className?: string;
  /// A rule under the header. Off when the body flows straight on.
  divided?: boolean;
  /// The card folds (note 0005 R12): the header is a native `summary` and `children` is the body inside the fold.
  /// A folded card holds content only, never explanation. Decide `defaultOpen` with `startsOpen` in src/lib/disclosure.
  collapsible?: boolean;
  defaultOpen?: boolean;
  /// One line beside the title while folded: a state, a count, at most one fact.
  summary?: ReactNode;
  children?: ReactNode;
  id?: string;
}) {
  const header = (
    <div
      className={cx(
        "flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2 px-5 py-4 sm:px-6",
        divided && !collapsible && "border-b border-line",
        className,
      )}
      id={collapsible ? undefined : id}
    >
      {icon && (
        <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-700">
          {icon}
        </span>
      )}
      <div className="min-w-[9rem] flex-1 basis-40">
        {info && !collapsible ? (
          // The button stays beside the title, never wrapped below it (Phase 0.2 item 3).
          <div className="flex min-w-0 items-center gap-1.5">
            <h3 className="min-w-0 text-[15px] text-balance break-words font-bold tracking-tight text-ink">{title}</h3>
            <span className="shrink-0">
              <MoreText label={info.label} text={info.text} />
            </span>
          </div>
        ) : (
          <h3
            className="text-[15px] text-balance break-words font-bold tracking-tight text-ink"
                    >
            {title}
          </h3>
        )}
        {/* Wraps in full. One line cut sentences mid-way on narrow cards (6.3 UX review),
            and the sibling check at 390 found two lines still cut them there, where no
            hover can show the rest (BD-21). */}
        {subtitle && (
          <p className="text-[13px] text-pretty text-ink-3">
            {subtitle}
          </p>
        )}
      </div>
      {/* max-w-full: on a phone the actions take their own line and wrap inside it, never wider than the card (6.15a fix S-4). */}
      {summary && collapsible && <div className="flex min-w-0 flex-wrap items-center gap-2 text-[13px] text-ink-3 group-open/card:hidden">{summary}</div>}
      {actions && <div className="flex max-w-full shrink-0 flex-wrap items-center gap-2">{actions}</div>}
      {collapsible && <ChevronDown size={16} className="shrink-0 text-ink-3 transition-transform group-open/card:rotate-180" />}
    </div>
  );
  if (!collapsible) return header;
  return (
    <details open={defaultOpen} id={id} className="group/card min-w-0 scroll-mt-24">
      <summary className="cursor-pointer list-none rounded-card focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand-500 [&::-webkit-details-marker]:hidden group-open/card:border-b group-open/card:border-line">
        {header}
      </summary>
      <OpenOnHash id={id} />
      {children}
    </details>
  );
}

export function CardBody({
  className,
  pad = "default",
  ...props
}: HTMLAttributes<HTMLDivElement> & { pad?: "default" | "tight" | "none" }) {
  return (
    <div
      className={cx(
        pad === "default" && "px-5 py-5 sm:px-6",
        pad === "tight" && "px-5 py-3 sm:px-6",
        className,
      )}
      {...props}
    />
  );
}

export function CardFooter({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cx(
        "flex items-center gap-3 border-t border-line px-5 py-3.5 sm:px-6",
        className,
      )}
      {...props}
    />
  );
}
