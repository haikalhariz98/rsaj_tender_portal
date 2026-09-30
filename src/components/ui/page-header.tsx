import type { ReactNode } from "react";

import { cx } from "./cx";

/// The head of every screen: a large friendly title, a sentence under it, an
/// optional row of facts, and the screen's actions on the right.
export function PageHeader({
  title,
  badge,
  subtitle,
  meta,
  actions,
  eyebrow,
  className,
}: {
  title: ReactNode;
  /// Sits beside the title — status of the whole screen, e.g. "Not built yet".
  badge?: ReactNode;
  subtitle?: ReactNode;
  /// Small facts under the subtitle. Pass an array; they are separated for you.
  meta?: ReactNode[];
  actions?: ReactNode;
  /// A small label above the title, e.g. the section it belongs to.
  eyebrow?: ReactNode;
  className?: string;
}) {
  const facts = (meta ?? []).filter(Boolean);
  return (
    <header
      className={cx(
        "mb-7 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between",
        className,
      )}
    >
      <div className="min-w-0">
        {eyebrow && (
          <div className="mb-1.5 text-[12px] font-semibold tracking-wide text-brand-700 uppercase">
            {eyebrow}
          </div>
        )}
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-[28px] leading-tight font-bold tracking-[-0.02em] text-ink">
            {title}
          </h1>
          {badge}
        </div>
        {subtitle && <p className="mt-1.5 max-w-[70ch] text-[15px] text-ink-2">{subtitle}</p>}
        {facts.length > 0 && (
          <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1.5 text-[13px] text-ink-3">
            {facts.map((f, i) => (
              <span key={i} className="inline-flex items-center gap-1.5">
                {i > 0 && <span className="mr-0.5 text-ink-4" aria-hidden="true">•</span>}
                {f}
              </span>
            ))}
          </div>
        )}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

/// A titled group of content inside a screen.
export function Section({
  title,
  description,
  actions,
  children,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cx("min-w-0", className)}>
      <div className="mb-3 flex items-end justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-[17px] font-bold tracking-tight text-ink">{title}</h2>
          {description && <p className="mt-0.5 text-[13px] text-ink-3">{description}</p>}
        </div>
        {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
      </div>
      {children}
    </section>
  );
}
