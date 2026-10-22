import Link from "next/link";
import type { ButtonHTMLAttributes, ComponentProps, ReactNode } from "react";

import { cx } from "./cx";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "subtle" | "danger" | "destructive" | "link";
export type ButtonSize = "sm" | "md" | "lg";

const BASE =
  "inline-flex max-w-full shrink-0 items-center justify-center gap-2 whitespace-nowrap max-sm:text-center max-sm:whitespace-normal rounded-full font-semibold no-underline transition " +
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
  /// The trigger of a destructive act (Cancel requisition, Discard draft): quiet until the
  /// drawer asks for a reason, but unmistakable. Every such trigger looks like this.
  destructive: "text-rose-700 hover:bg-rose-50 hover:text-rose-800",
  link: "px-0! text-brand-700 hover:text-brand-800 hover:underline",
};

const SIZE: Record<ButtonSize, string> = {
  // On a phone a long label wraps (the height becomes a floor) rather than leaving the screen.
  sm: "h-8 px-3.5 text-[13px] max-sm:h-auto max-sm:min-h-8 max-sm:py-1",
  md: "h-10 px-4.5 text-sm max-sm:h-auto max-sm:min-h-10 max-sm:py-1.5",
  lg: "h-12 px-6 text-[15px] max-sm:h-auto max-sm:min-h-12 max-sm:py-2",
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
  wholeDocument,
  ...props
}: Common & ComponentProps<typeof Link> & { /** Load the page as a whole document, never a client navigation: a page that warns before it is left needs Back to be a real unload. */ wholeDocument?: boolean }) {
  const cls = buttonClass(variant, size, cx(block && "w-full", className));
  if (wholeDocument)
    return (
      <a className={cls} href={String(props.href)} aria-label={props["aria-label"]} target={props.target} rel={props.rel}>
        {icon}
        {children}
      </a>
    );
  return (
    <Link className={cls} {...props}>
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
  touchTarget,
  className,
  children,
  type = "button",
  ...props
}: {
  label: string;
  size?: keyof typeof ICON_SIZE;
  bordered?: boolean;
  /// Below the `sm` breakpoint, grow the pressable area 6px past the drawn box on every side (a 32px button reaches 44px) without changing what is
  /// drawn. For a button that has to sit inside a box no taller than itself, such as the eye inside a text field.
  touchTarget?: boolean;
} & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type={type}
      aria-label={label}
      title={label}
      className={iconButtonClass(size, bordered, cx(touchTarget && "after:absolute after:-inset-1.5 after:content-[''] sm:after:hidden", className))}
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
