import Link from "next/link";
import type { ButtonHTMLAttributes, ComponentProps, ReactNode } from "react";

import { cx } from "./cx";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "subtle" | "danger" | "link";
export type ButtonSize = "sm" | "md" | "lg";

const BASE =
  "inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-full font-semibold no-underline transition " +
  "hover:no-underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 " +
  "disabled:cursor-not-allowed disabled:opacity-45 aria-disabled:pointer-events-none aria-disabled:opacity-45";

const VARIANT: Record<ButtonVariant, string> = {
  primary:
    "bg-brand-700 text-white shadow-brand hover:bg-brand-800 active:translate-y-px " +
    // Unavailable reads as unavailable, not as a washed-out version of the main action.
    "disabled:bg-ink/10 disabled:text-ink-3 disabled:opacity-100 disabled:shadow-none",
  secondary:
    "border border-line-2 bg-surface text-ink shadow-[0_1px_2px_rgb(15_23_42/0.05)] hover:border-ink-4 hover:bg-sunken",
  ghost: "text-ink-2 hover:bg-ink/5 hover:text-ink",
  subtle: "bg-brand-50 text-brand-800 hover:bg-brand-100",
  danger: "bg-rose-600 text-white hover:bg-rose-700",
  link: "px-0! text-brand-700 hover:text-brand-800 hover:underline",
};

const SIZE: Record<ButtonSize, string> = {
  sm: "h-8 px-3.5 text-[13px]",
  md: "h-10 px-4.5 text-sm",
  lg: "h-12 px-6 text-[15px]",
};

export function buttonClass(
  variant: ButtonVariant = "secondary",
  size: ButtonSize = "md",
  extra?: string,
): string {
  return cx(BASE, VARIANT[variant], SIZE[size], extra);
}

type Common = { variant?: ButtonVariant; size?: ButtonSize; icon?: ReactNode; block?: boolean };

export function Button({
  variant,
  size,
  icon,
  block,
  className,
  children,
  type = "button",
  ...props
}: Common & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type={type}
      className={buttonClass(variant, size, cx(block && "w-full", className))}
      {...props}
    >
      {icon}
      {children}
    </button>
  );
}

export function ButtonLink({
  variant,
  size,
  icon,
  block,
  className,
  children,
  ...props
}: Common & ComponentProps<typeof Link>) {
  return (
    <Link className={buttonClass(variant, size, cx(block && "w-full", className))} {...props}>
      {icon}
      {children}
    </Link>
  );
}

const ICON_SIZE = { sm: "size-8", md: "size-10", lg: "size-12" } as const;

/// A square, icon-only button. `label` is required: it is the only name a screen
/// reader gets.
export function IconButton({
  label,
  size = "md",
  bordered,
  className,
  children,
  type = "button",
  ...props
}: {
  label: string;
  size?: keyof typeof ICON_SIZE;
  bordered?: boolean;
} & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type={type}
      aria-label={label}
      title={label}
      className={iconButtonClass(size, bordered, className)}
      {...props}
    >
      {children}
    </button>
  );
}

export function iconButtonClass(
  size: keyof typeof ICON_SIZE = "md",
  bordered = false,
  extra?: string,
): string {
  return cx(
    "relative inline-flex shrink-0 items-center justify-center rounded-full text-ink-3 transition",
    "hover:bg-ink/5 hover:text-ink disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:bg-transparent",
    bordered && "border border-line-2 bg-surface hover:bg-sunken",
    ICON_SIZE[size],
    extra,
  );
}
