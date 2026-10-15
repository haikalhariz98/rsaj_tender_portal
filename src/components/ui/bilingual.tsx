import type { Words } from "@/lib/contract/labels";

import { cx } from "./cx";

/// A supplier-facing string in both languages (ruling 20ab): the English, and the Malay under it in a quieter tone with its language set for a screen reader. The Malay says no more
/// than the English, so a reader of either loses nothing. `inline` keeps both on one line, for a label or a button where a second line would break the control; `inherit` keeps the colour of the control the words sit in (a button).
export function Bi({ words, inline, inherit, className }: { words: Words; inline?: boolean; inherit?: boolean; className?: string }) {
  if (inline) {
    return (
      <span className={className}>
        {words.en}
        <span lang="ms" className={inherit ? "opacity-80" : "text-ink-3"}> · {words.ms}</span>
      </span>
    );
  }
  return (
    <span className={cx("block", className)}>
      <span className="block">{words.en}</span>
      <span lang="ms" className="mt-0.5 block text-[0.92em] text-ink-3">
        {words.ms}
      </span>
    </span>
  );
}
