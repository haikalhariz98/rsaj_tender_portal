import { cx } from "./cx";

/// The outlined box every form control shares: Input, Textarea, AffixInput and the
/// Select trigger. One string, so siblings cannot drift apart.
export const CONTROL =
  "w-full min-w-0 rounded-control border border-line-2 bg-surface text-ink shadow-[0_1px_2px_rgb(15_23_42/0.04)] " +
  "placeholder:text-ink-4 transition outline-none " +
  "hover:border-ink-4 focus:border-brand-500 focus:ring-4 focus:ring-brand-500/15 " +
  "disabled:cursor-not-allowed disabled:bg-sunken disabled:text-ink-3 " +
  "aria-invalid:border-rose-400 aria-invalid:focus:ring-rose-500/15";

export const HEIGHT = { sm: "h-9 px-3 text-[13px]", md: "h-10 px-3.5 text-[14px]" } as const;

export type ControlSize = keyof typeof HEIGHT;

export function inputClass(size: ControlSize = "md", extra?: string) {
  return cx(CONTROL, HEIGHT[size], extra);
}

/// The wrapper that carries a control's notched label, and the label itself: it sits on
/// the box's top border, centred on the line, with the surface colour behind it so the
/// border breaks around the words. It never moves: the placeholder fills the box.
///
/// The label reads the control's state through its wrapper: brand-coloured while the
/// control (or its open list) has focus, rose when invalid, and over a disabled box the
/// lower half takes the box's own grey so no white patch shows inside it.
export const NOTCH_WRAP = "group/field relative min-w-0";
export const NOTCH_LABEL =
  "absolute -top-2 left-3 z-[1] block max-w-[calc(100%-1.5rem)] truncate bg-surface px-1 text-[12px] leading-4 font-semibold text-ink-2 " +
  "transition-colors group-focus-within/field:text-brand-700 group-has-[[aria-invalid=true]]/field:text-rose-700 " +
  "group-has-[:disabled]/field:bg-linear-to-b group-has-[:disabled]/field:from-surface group-has-[:disabled]/field:from-50% " +
  "group-has-[:disabled]/field:to-sunken group-has-[:disabled]/field:to-50%";
