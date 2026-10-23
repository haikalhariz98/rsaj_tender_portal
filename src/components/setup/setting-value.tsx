import type { ReactNode } from "react";

import { MoreText } from "@/components/ui/more-text";

/// A setting's value on a Settings page. An unset one stays on screen as plain grey "Not set" (SP-18); what it holds back
/// is one press away in the popover, never a sentence repeated on the page. `value` is unset when null, empty or "Not set...".
export function SettingValue({ value, unset, action }: { value: ReactNode | null; unset: string; action?: ReactNode }) {
  const isUnset = value == null || value === "" || (typeof value === "string" && value.startsWith("Not set"));
  if (!isUnset) return <span className="break-words whitespace-pre-line">{value}</span>;
  return (
    <span className="inline-flex items-center gap-1 text-[13px] text-ink-3">
      Not set
      {unset && <MoreText text={unset} label="What this holds back" />}
      {action}
    </span>
  );
}
