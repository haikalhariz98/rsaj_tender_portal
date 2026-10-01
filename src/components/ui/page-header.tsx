import { useId, type ReactNode } from "react";

import { cutAtWord } from "@/lib/ui/cut-text";

import { cx } from "./cx";
import { MoreText } from "./more-text";

/// The head of every screen: a large friendly title, a sentence under it, an
/// optional row of facts, and the screen's actions on the right.
export function PageHeader({
  title,
  badge,
  subtitle,
  meta,
  actions,
  actionsNote,
  actionsNoteId,
  eyebrow,
  actionsBelow,
  className,
}: {
  title: ReactNode;
  /// Sits beside the title — status of the whole screen, e.g. "Not built yet".
  badge?: ReactNode;
  subtitle?: ReactNode;
  /// Small facts under the subtitle. Pass an array; they are separated for you.
  meta?: ReactNode[];
  actions?: ReactNode;
  /// Why an action is unavailable, shown on its own line under the action row rather
  /// than between buttons. The action group is described by it (aria-describedby); a
  /// disabled button inside can point at `actionsNoteId` to be described by it too.
  actionsNote?: ReactNode;
  /// Id for the note, when a caller needs to reference it. Generated when omitted.
  actionsNoteId?: string;
  /// A small label above the title, e.g. the section it belongs to.
  eyebrow?: ReactNode;
  /// Put the actions on their own row under the title, left-aligned — for a record
  /// whose title and facts need the full width and whose actions are several.
  actionsBelow?: boolean;
  className?: string;
}) {
  const facts = (meta ?? []).filter(Boolean);
  const generated = useId();
  const noteId = actionsNoteId ?? `${generated}-note`;
  return (
    <header
      className={cx(
        "mb-7 flex flex-wrap items-end justify-between gap-x-6 gap-y-4",
        className,
      )}
    >
      {/* The title block keeps a floor of 40rem (or the full row on a phone): when the
          actions do not fit beside it they wrap onto their own row below, instead of
          squeezing the title into a narrow column. */}
      <div className="min-w-[min(100%,40rem)] flex-1">
        {eyebrow && (
          <div className="mb-1.5 text-[12px] font-semibold tracking-wide text-brand-700 uppercase [&_a]:no-underline">
            {eyebrow}
          </div>
        )}
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-[28px] leading-tight font-bold tracking-[-0.02em] text-ink">
            {title}
          </h1>
          {badge}
        </div>
        {subtitle && (
          <p className="relative mt-1.5 max-w-[70ch] text-[15px] text-ink-2">
            <Subtitle>{subtitle}</Subtitle>
          </p>
        )}
        {facts.length > 0 && (
          // Each fact carries its separator in a left gutter; the row is shifted left by
          // that gutter and clipped sideways only, so a fact starting a wrapped line shows
          // no stray "•". The 4px clip margin keeps a focused link's ring whole.
          <div className="mt-3 overflow-x-clip [overflow-clip-margin:4px]">
            <div className="-ml-4 flex flex-wrap items-center gap-y-1.5 text-[13px] text-ink-3">
              {facts.map((f, i) => (
                <span key={i} className="relative inline-flex min-w-0 items-center gap-1.5 pl-4">
                  <span className="absolute left-1 text-ink-4" aria-hidden="true">•</span>
                  {f}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
      {(actions || actionsNote) && (
        <div className={cx("flex max-w-full min-w-0 flex-col items-start gap-1.5", actionsBelow ? "basis-full" : "sm:ml-auto sm:items-end")}>
          {actions && (
            <div
              role={actionsNote ? "group" : undefined}
              aria-describedby={actionsNote ? noteId : undefined}
              className={cx("flex flex-wrap items-center gap-2", !actionsBelow && "sm:justify-end")}
            >
              {actions}
            </div>
          )}
          {actionsNote && (
            <p id={noteId} className={cx("text-[12.5px] leading-snug text-ink-3", actionsBelow ? "max-w-[70ch]" : "max-w-[44ch] sm:text-right")}>
              {actionsNote}
            </p>
          )}
        </div>
      )}
    </header>
  );
}

/// A string subtitle past SUBTITLE_LIMIT is cut on a word boundary, with an information
/// button for the rest. The full text stays in the page for screen readers and text
/// snapshots; the visible cut is hidden from them, so it is heard once. JSX subtitles are
/// never cut: a cut through a link is unsafe.
function Subtitle({ children }: { children: ReactNode }) {
  if (typeof children !== "string") return <>{children}</>;
  const { text, cut } = cutAtWord(children);
  if (!cut) return <>{children}</>;
  return (
    <>
      <span className="sr-only">{children}</span>
      <span aria-hidden="true">{text}…</span> <MoreText text={children} />
    </>
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
