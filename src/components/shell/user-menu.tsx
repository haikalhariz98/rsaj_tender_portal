"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";

import { ChevronDown, LogOutIcon, UserIcon } from "@/components/icons";
import { Avatar } from "@/components/ui/avatar";
import { useLanguage, useSay } from "@/components/i18n/language-context";
import { cx } from "@/components/ui/cx";
import { SHELL_WORDS } from "@/lib/i18n/catalogues/shell";
import { titleFor } from "@/lib/i18n/job-title";
import type { ShellUser } from "@/lib/shell";

/**
 * The signed-in person in the top bar, and what they can do from it: see their account, and sign out. Sign-out is a POST (a form), never a
 * link, so that nobody can be signed out by being sent an address. The action comes in as a prop from the layout, so that this frame, which
 * a test reads without a database, imports nothing of the server.
 */
export function UserMenu({ user, signOut }: { user: ShellUser; signOut: (data: FormData) => Promise<void> }) {
  // A supplier's session is the portal's own: its account page, and a sign-out that is a plain POST to the portal's route (the public copy takes no server action).
  const supplier = user.kind === "supplier";
  const say = useSay();
  const { language, choice } = useLanguage();
  // The Malay title when Malay is chosen and one is recorded; never a made-up one.
  const jobTitle = titleFor(user, language);
  // A default is not a choice: say which this is (NFR-LNG-001).
  const languageLine = choice === null ? SHELL_WORDS.languageNotChosen : choice === "ms" ? SHELL_WORDS.languageChosenMs : SHELL_WORDS.languageChosenEn;
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    const onDown = (e: MouseEvent) => root.current && !root.current.contains(e.target as Node) && setOpen(false);
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onDown);
    };
  }, [open]);

  const item = "flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-[13.5px] font-medium text-ink-2 no-underline hover:bg-ink/5 hover:text-ink hover:no-underline";

  return (
    <div ref={root} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2.5 rounded-full py-1 pr-2 pl-1 hover:bg-ink/5"
      >
        <Avatar name={user.name} size="sm" />
        <span className="hidden min-w-0 text-left leading-tight md:block">
          <span className="block truncate text-[13px] font-semibold text-ink">{user.name}</span>
          {jobTitle && <span className="block truncate text-[12px] text-ink-3">{jobTitle}</span>}
        </span>
        <ChevronDown size={15} className={cx("text-ink-3 transition", open && "rotate-180")} />
      </button>

      {open && (
        <div id={menuId} role="menu" className="absolute right-0 z-30 mt-2 w-60 rounded-2xl border border-line bg-surface p-1.5 shadow-pop">
          <div className="px-3 pt-2 pb-2.5">
            <div className="truncate text-[13.5px] font-bold text-ink">{user.name}</div>
            {jobTitle && <div className="truncate text-[12px] text-ink-3">{jobTitle}</div>}
            {!supplier && (
              <div className="mt-1.5 text-[12px] text-ink-3">
                <span className="font-semibold">{say(SHELL_WORDS.language)}: </span>
                {say(languageLine)}
              </div>
            )}
          </div>
          <div className="my-1 h-px bg-line" />
          <Link href={supplier ? "/supplier/account" : "/account"} role="menuitem" className={item} onClick={() => setOpen(false)}>
            <UserIcon size={16} />
            {say(SHELL_WORDS.yourAccount)}
          </Link>
          <form {...(supplier ? { action: "/supplier/sign-out", method: "post" } : { action: signOut })}>
            <button type="submit" role="menuitem" className={item}>
              <LogOutIcon size={16} />
              {say(SHELL_WORDS.signOut)}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
