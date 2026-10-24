"use client";

import Form from "next/form";
import { useSearchParams } from "next/navigation";
import { useEffect, useRef } from "react";

import { SearchIcon } from "@/components/icons";
import { useSay } from "@/components/i18n/language-context";
import { SHELL_WORDS } from "@/lib/i18n/catalogues/shell";

/// The top bar's one search box (global search, plan 7.2). A plain GET form to /search; "/" focuses it from anywhere outside a field.
export function SearchBox({ onSearchPage }: { onSearchPage: boolean }) {
  const say = useSay();
  const q = useSearchParams().get("q") ?? "";
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (e.key !== "/" || e.ctrlKey || e.metaKey || e.altKey || t?.closest("input, textarea, select, [contenteditable]")) return;
      e.preventDefault();
      input.current?.focus();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  return (
    <Form action="/search" role="search" className="hidden h-10 w-56 shrink-0 items-center gap-2.5 overflow-hidden rounded-full border border-line bg-surface px-4 text-[13.5px] text-ink focus-within:border-brand-500 focus-within:ring-2 focus-within:ring-brand-500/30 md:flex 2xl:w-64">
      <SearchIcon size={16} className="shrink-0 text-ink-4" />
      <input
        ref={input}
        key={onSearchPage ? q : ""}
        name="q"
        type="search"
        defaultValue={onSearchPage ? q : ""}
        maxLength={100}
        aria-label={say(SHELL_WORDS.searchRecords)}
        placeholder={say(SHELL_WORDS.searchRecords)}
        autoComplete="off"
        className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-ink-4"
      />
    </Form>
  );
}
