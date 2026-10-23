import { cx } from "./cx";

const ITEM = "flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-[13.5px] font-medium no-underline transition hover:no-underline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand-500 disabled:cursor-not-allowed disabled:opacity-45";
const TONE = { normal: "text-ink-2 hover:bg-ink/5 hover:text-ink", danger: "text-rose-700 hover:bg-rose-50" } as const;

/// The look of one entry of a `MoreActions` menu. A plain module, so a server file can hand it to a drawer's trigger button.
export const moreItemClass = (danger?: boolean) => cx(ITEM, TONE[danger ? "danger" : "normal"]);
