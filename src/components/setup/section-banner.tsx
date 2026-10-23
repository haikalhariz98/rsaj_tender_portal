import Link from "next/link";

import { Callout } from "@/components/ui/feedback";
import type { ChecklistItem } from "@/lib/setup/types";

/// "n settings need a value", with a link to each one still to do. Nothing to do, nothing shown.
export function SectionBanner({ items }: { items: ChecklistItem[] }) {
  const todo = items.filter((i) => i.state !== "done");
  if (todo.length === 0) return null;
  return (
    <Callout tone="warn" className="mb-6" title={`${todo.length} ${todo.length === 1 ? "setting needs" : "settings need"} a value`}>
      <ul className="flex flex-wrap gap-x-4 gap-y-1">
        {todo.map((i) => (
          <li key={i.key}>
            <Link href={i.href} className="font-semibold underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500">{i.label}</Link>
          </li>
        ))}
      </ul>
    </Callout>
  );
}
