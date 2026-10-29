import type { ReactNode } from "react";

import { avatarTone, initials } from "@/lib/format";

import { cx } from "./cx";

/// `avatarTone` hashes a name to one of six slots (`avatar--n1`…`n6`). The slot is
/// business-stable; how it looks is ours.
const TONES: Record<string, string> = {
  "avatar--n1": "bg-emerald-100 text-emerald-800",
  "avatar--n2": "bg-sky-100 text-sky-800",
  "avatar--n3": "bg-amber-100 text-amber-800",
  "avatar--n4": "bg-violet-100 text-violet-800",
  "avatar--n5": "bg-rose-100 text-rose-800",
  "avatar--n6": "bg-teal-100 text-teal-800",
};

const SIZES = {
  xs: "size-6 text-[10px]",
  sm: "size-8 text-[11px]",
  md: "size-10 text-[13px]",
  lg: "size-12 text-[15px]",
} as const;

export function Avatar({
  name,
  size = "sm",
  muted,
  decorative,
  children,
  className,
}: {
  /// Omit for a placeholder (pass an icon as children instead).
  name?: string;
  size?: keyof typeof SIZES;
  muted?: boolean;
  /// The name is written beside it: hide the initials from a screen reader and drop the tooltip.
  decorative?: boolean;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <span
      title={decorative ? undefined : name}
      aria-hidden={decorative || undefined}
      className={cx(
        "inline-grid shrink-0 place-items-center rounded-full font-bold ring-2 ring-surface",
        SIZES[size],
        muted || !name ? "bg-ink/[0.07] text-ink-3" : TONES[avatarTone(name)],
        className,
      )}
    >
      {children ?? (name ? initials(name) : null)}
    </span>
  );
}

export function AvatarStack({ names, max = 4, size = "xs" }: {
  names: string[];
  max?: number;
  size?: keyof typeof SIZES;
}) {
  const shown = names.slice(0, max);
  const rest = names.length - shown.length;
  return (
    <span className="inline-flex -space-x-1.5">
      {shown.map((n) => (
        <Avatar key={n} name={n} size={size} />
      ))}
      {rest > 0 && (
        <Avatar size={size} muted>
          +{rest}
        </Avatar>
      )}
    </span>
  );
}
