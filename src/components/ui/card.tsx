import type { HTMLAttributes, ReactNode } from "react";

import { cx } from "./cx";

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
  actions,
  className,
  divided = true,
}: {
  icon?: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  className?: string;
  /// A rule under the header. Off when the body flows straight on.
  divided?: boolean;
}) {
  return (
    <div
      className={cx(
        "flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2 px-5 py-4 sm:px-6",
        divided && "border-b border-line",
        className,
      )}
    >
      {icon && (
        <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-700">
          {icon}
        </span>
      )}
      <div className="min-w-[9rem] flex-1 basis-40">
        <h3
          className="text-[15px] text-balance break-words font-bold tracking-tight text-ink"
                  >
          {title}
        </h3>
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
      {actions && <div className="flex max-w-full shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </div>
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
