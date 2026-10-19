import type { ReactNode } from "react";

import { AlertTriangle } from "@/components/icons";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/feedback";
import { MoreText } from "@/components/ui/more-text";
import { ProvenanceBadge } from "@/components/ui/provenance";
import { Stat as UiStat } from "@/components/ui/stat";

/**
 * The pieces the record registers (Documents, Templates, Notifications) share, built
 * on the design system so the three screens cannot drift from one another.
 */

export function Stat({
  label,
  value,
  hint,
  warn,
}: {
  label: string;
  /// Null is "nothing to count yet", shown as a dash rather than a nought.
  value: string | number | null;
  hint: string;
  warn?: boolean;
}) {
  return (
    <UiStat
      label={label}
      value={value}
      hint={hint}
      tone={warn ? "warn" : "neutral"}
      icon={warn ? <AlertTriangle size={16} /> : undefined}
    />
  );
}

/// A row of headline figures above a register.
export function Stats({ children }: { children: ReactNode }) {
  return <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">{children}</div>;
}

/// One register: its title, count and add action, what it is for, and the list — or,
/// where nothing is set, what that leaves undecided.
/// An empty register: "Not set" with what that leaves undecided one press away, or the text itself
/// where it is six words or fewer (note 0005, founder 2026-10-19).
export function NotSet({ text, size = "md" }: { text: string; size?: "sm" | "md" }) {
  if (text.split(/\s+/).length <= 6) return <EmptyState size={size} title={text} />;
  return (
    <EmptyState
      size={size}
      title={
        <span className="inline-flex items-center gap-1">
          Not set
          <span className="sr-only">{text}</span>
          <MoreText text={text} label="What this leaves undecided" />
        </span>
      }
    />
  );
}

export function Section({
  title,
  blurb,
  empty,
  count,
  action,
  id,
  children,
}: {
  /// An anchor, so a link from another screen (a readiness finding) lands on this card.
  id?: string;
  title: string;
  blurb: string;
  empty: string;
  count: number;
  /// Present even on an empty section: that is where the first entry gets added.
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <Card id={id} className="mb-6 scroll-mt-24 overflow-hidden">
      <CardHeader
        title={
          <span className="inline-flex items-center gap-2">
            {title}
            {count > 0 && <Badge outline>{count}</Badge>}
            <span className="sr-only">{blurb}</span>
            <MoreText text={blurb} label={`About ${title}`} />
          </span>
        }
        actions={action}
        divided={count === 0}
      />
      {count === 0 ? <NotSet text={empty} /> : children}
    </Card>
  );
}

export function ProvenanceChip({ value }: { value: string }) {
  return <ProvenanceBadge value={value} />;
}
