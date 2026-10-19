import type { ReactNode } from "react";

import { Badge, Chip } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/feedback";
import { ProvenanceBadge } from "@/components/ui/provenance";

export const GONE = (
  <Card>
    <EmptyState title="This exercise could not be found">Its organisation may no longer be configured.</EmptyState>
  </Card>
);

export const SETTINGS_HREF = "/configuration/invitation";
export const levelTone = (l: string) => (l === "block" ? "err" : l === "info" ? "info" : "warn") as "err" | "warn" | "info";
export const NOT_RECORDED = "Not recorded";

/// A rule's provenance as the read model words it ("Stated", "Assumed", "Not set"), as the shared badge.
export function FromBadge({ text }: { text: string }) {
  const value = text === "Stated" ? "STATED" : text === "Observed" ? "OBSERVED" : text === "Assumed" ? "ASSUMED" : null;
  return value || text === "Not set" ? <ProvenanceBadge value={value} /> : <Badge outline>{text}</Badge>;
}

export type Delivery = { sentBy: string; consignment: string | null; sentOn: string; acknowledgedOn: string; raw: { method: string; consignmentRef: string; despatchedOn: string; acknowledgedOn: string } };

/**
 * One line per recipient of a letter, an addendum or a notice: how it was sent and whether it was
 * acknowledged, as the officer recorded it. The portal sends nothing (the mail platform is not
 * connected), so the list says "recorded, not sent" once and each line says what is recorded.
 */
export function DeliveryList({ items, caption }: { items: { id: string; who: string; sub?: string; delivery: Delivery; given?: string | null; action?: ReactNode }[]; caption?: string }) {
  if (items.length === 0) return null;
  return (
    <div className="flex flex-col">
      <p className="px-5 py-2 text-[12.5px] text-ink-3 sm:px-6">{caption ?? "Not emailed. Delivery is recorded by the officer."}</p>
      <ul className="divide-y divide-line/70 border-t border-line">
        {items.map((i) => {
          const sent = i.delivery.sentOn !== NOT_RECORDED;
          const acknowledged = i.delivery.acknowledgedOn !== NOT_RECORDED;
          return (
            <li key={i.id} className="flex flex-col gap-2 px-5 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-6">
              <div className="min-w-0">
                <div className="text-[13.5px] font-semibold break-words text-ink">{i.who}</div>
                <div className="text-[12.5px] break-words text-ink-3">
                  {i.given ? i.given : sent ? `Recorded as sent ${i.delivery.sentOn}, ${i.delivery.sentBy.toLowerCase()}${i.delivery.consignment ? ` · consignment ${i.delivery.consignment}` : ""}` : "Delivery not recorded yet"}
                  {i.sub ? ` · ${i.sub}` : ""}
                </div>
              </div>
              <div className="flex shrink-0 flex-wrap items-center gap-2 sm:justify-end">
                {i.given ? <Chip tone="info">With the documents</Chip> : sent ? <Chip tone="ok">Recorded as sent</Chip> : <Chip tone="warn">Not recorded</Chip>}
                {acknowledged && <Chip tone="ok">{`Acknowledged ${i.delivery.acknowledgedOn}`}</Chip>}
                {i.action}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
