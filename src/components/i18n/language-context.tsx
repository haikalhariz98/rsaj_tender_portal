"use client";

import { useCallback, type ReactNode } from "react";

import type { Words } from "@/lib/contract/labels";
import { ENGLISH, type Language } from "@/lib/i18n/language";
import { say, sayWith } from "@/lib/i18n/say";

/**
 * English only (founder, 2026-10-19; supersedes ADR 0040). There is no provider and no switch: these readers are kept so the components
 * that call them need no change, and every one reads English.
 */
export const useLanguage = (): { language: Language } => ({ language: ENGLISH });

/// Words to a string.
export function useSay(): (words: Words) => string {
  return useCallback((words: Words) => say(words, ENGLISH), []);
}

/// A pair as text, for a server component's JSX.
export function Say({ words }: { words: Words }): ReactNode {
  return <>{say(words, ENGLISH)}</>;
}

/// A sentence with values as text, for a server component's JSX.
export function SayWith({ words, values }: { words: Words; values: Readonly<Record<string, string>> }): ReactNode {
  return <>{sayWith(words, ENGLISH, values)}</>;
}
