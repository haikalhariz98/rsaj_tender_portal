import Link from "next/link";

import { CheckIcon } from "@/components/icons";
import { Dot } from "@/components/ui/badge";
import { Card, CardHeader } from "@/components/ui/card";
import { MoreText } from "@/components/ui/more-text";
import type { ChecklistItem, ChecklistState } from "@/lib/setup/types";

const TONE: Record<ChecklistState, "ok" | "warn" | "neutral"> = { done: "ok", confirm: "warn", todo: "neutral" };
const STATE_WORDS: Record<ChecklistState, string> = { done: "Done", confirm: "Needs confirming", todo: "Not done" };

function Row({ item, at }: { item: ChecklistItem; at: (d: Date) => string }) {
  const link = item.state === "done" ? "Open" : item.kind === "confirm" ? "Confirm" : "Set";
  return (
    <li className="flex min-h-12 flex-wrap items-center gap-3 border-t border-line px-5 py-2.5 first:border-t-0">
      <Dot tone={TONE[item.state]} />
      <span className="sr-only">{STATE_WORDS[item.state]}: </span>
      <span className="min-w-0 flex-1 text-[14px] text-ink">
        {item.label}
        {item.confirmedBy && <span className="ml-2 text-[12.5px] text-ink-3">{item.confirmedBy.name}, {at(item.confirmedBy.at)}</span>}
      </span>
      {item.detail && <MoreText text={item.detail} label={`About: ${item.label}`} />}
      {item.also && <Link href={item.also.href} className="text-[13px] font-semibold text-brand-700 underline-offset-2 hover:underline">{item.also.label}</Link>}
      <Link href={item.href} className="inline-flex min-h-9 min-w-20 items-center justify-end rounded-lg px-3 text-[13px] font-semibold text-brand-700 hover:bg-brand-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500" aria-label={`${link}: ${item.label}`}>{link}</Link>
    </li>
  );
}

/// One card of checklist rows. The dates are formatted by the page (`at`), never here.
export function ChecklistCard({ title, items, at }: { title: string; items: ChecklistItem[]; at: (d: Date) => string }) {
  if (items.length === 0) return null;
  const done = items.every((i) => i.state === "done");
  return (
    <Card className="overflow-hidden">
      <CardHeader icon={done ? <CheckIcon size={17} /> : undefined} title={title} />
      <ul>{items.map((i) => <Row key={i.key} item={i} at={at} />)}</ul>
    </Card>
  );
}
