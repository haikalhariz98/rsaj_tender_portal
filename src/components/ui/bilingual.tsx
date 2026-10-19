import type { Words } from "@/lib/contract/labels";

import { cx } from "./cx";

/// A supplier-facing string. English only (founder, 2026-10-19: no Malay on screen). The component keeps its name and its `inline` and `inherit`
/// props so the portal's call sites need no change. `inline` keeps it on one line, for a label or a button.
export function Bi({ words, inline, className }: { words: Words; inline?: boolean; inherit?: boolean; className?: string }) {
  return <span className={inline ? className : cx("block", className)}>{words.en}</span>;
}
