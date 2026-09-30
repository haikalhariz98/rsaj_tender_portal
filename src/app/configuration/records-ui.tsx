import type { ReactNode } from "react";

import { AlertTriangle } from "@/components/icons";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/feedback";
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
export function Section({
  title,
  blurb,
  empty,
  count,
  action,
  children,
}: {
  title: string;
  blurb: string;
  empty: string;
  count: number;
  /// Present even on an empty section: that is where the first entry gets added.
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <Card className="mb-6 overflow-hidden">
      <CardHeader
        title={
          <span className="inline-flex items-center gap-2">
            {title}
            {count > 0 && <Badge outline>{count}</Badge>}
          </span>
        }
        subtitle={blurb}
        actions={action}
        divided={count === 0}
      />
      {count === 0 ? <EmptyState title="Not set">{empty}</EmptyState> : children}
    </Card>
  );
}

export function ProvenanceChip({ value }: { value: string }) {
  return <ProvenanceBadge value={value} />;
}
