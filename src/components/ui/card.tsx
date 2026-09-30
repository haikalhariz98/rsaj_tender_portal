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
        "flex min-w-0 items-center gap-3 px-5 py-4 sm:px-6",
        divided && "border-b border-line",
        className,
      )}
    >
      {icon && (
        <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-700">
          {icon}
        </span>
      )}
      <div className="min-w-0 flex-1">
        <h3
          className="truncate text-[15px] font-bold tracking-tight text-ink"
          title={typeof title === "string" ? title : undefined}
        >
          {title}
        </h3>
        {/* One line, so a long subtitle is cut — the full text is on hover. */}
        {subtitle && (
          <p
            className="truncate text-[13px] text-ink-3"
            title={typeof subtitle === "string" ? subtitle : undefined}
          >
            {subtitle}
          </p>
        )}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
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
