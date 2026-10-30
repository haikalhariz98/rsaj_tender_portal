import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

import { cx } from "./cx";

/**
 * The pill switch: a sunken track holding a few choices, the chosen one raised. A choice is a link when it has an `href` (an address-driven view, `aria-current`) and a
 * button otherwise (a local toggle, `aria-pressed`). One piece for the Work views, the List | Board switch and the Activity filter, so they cannot drift apart.
 */
export function Segmented({ as: Tag = "div", className, ...props }: { as?: "div" | "nav" } & ComponentProps<"div">) {
  return <Tag {...props} className={cx("inline-flex rounded-full bg-sunken p-0.5", className)} />;
}

const BASE = "rounded-full px-3.5 py-1 text-[13px] font-semibold no-underline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand-500";

/// `radio`: a local choice among exclusive ones (inside a `role="radiogroup"`), announced as a radio rather than a toggle.
export function Segment({ on, href, scroll, onClick, icon, radio, className, children }: { on: boolean; href?: string; scroll?: boolean; onClick?: () => void; icon?: ReactNode; radio?: boolean; className?: string; children: ReactNode }) {
  const cls = cx(BASE, icon && "inline-flex items-center gap-1.5", on ? "bg-surface text-ink shadow-card" : "text-ink-3 hover:text-ink", className);
  const inner = (
    <>
      {icon}
      {children}
    </>
  );
  return href !== undefined ? (
    <Link href={href} scroll={scroll} aria-current={on ? "page" : undefined} className={cls}>
      {inner}
    </Link>
  ) : (
    <button type="button" {...(radio ? { role: "radio", "aria-checked": on } : { "aria-pressed": on })} onClick={onClick} className={cls}>
      {inner}
    </button>
  );
}
