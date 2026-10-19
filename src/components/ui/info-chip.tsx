import type { ComponentProps } from "react";

import { Badge } from "./badge";
import { MoreText } from "./more-text";

/// A chip with its detail one press away: the state on the surface, the sentence in a popover
/// (note 0005 §3.3, founder 2026-10-19). The popover is hidden from assistive technology, so the
/// detail is also in the page as screen-reader text and is heard once. It opens on hover, on
/// keyboard focus and on a press, and closes with Escape (MoreText; WCAG 2.1 SC 1.4.13).
export function InfoChip({ detail, label, children, ...badge }: ComponentProps<typeof Badge> & { detail: string; label?: string }) {
  return (
    <span className="inline-flex max-w-full items-center gap-0.5 align-middle">
      <Badge {...badge}>{children}</Badge>
      <span className="sr-only">{detail}</span>
      <MoreText text={detail} label={label} />
    </span>
  );
}
