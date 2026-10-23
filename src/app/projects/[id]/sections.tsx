import type { ReactNode } from "react";

/// A tab's parts, one under another with a heading each: the tab holds sections, not a second row of tabs (plan 6.6). Every part is
/// read for the tab already, so nothing more is loaded; a part that renders nothing leaves no heading.
export function Sections({ items }: { items: { id: string; label: string; node: ReactNode }[] }) {
  return (
    <div className="flex flex-col gap-8">
      {items
        .filter((i) => i.node)
        .map((i) => (
          <section key={i.id} id={`section-${i.id}`} aria-labelledby={`section-${i.id}-h`} className="flex scroll-mt-24 flex-col gap-3">
            <h2 id={`section-${i.id}-h`} className="text-[13px] font-semibold tracking-wide text-ink-3 uppercase">
              {i.label}
            </h2>
            {i.node}
          </section>
        ))}
    </div>
  );
}
