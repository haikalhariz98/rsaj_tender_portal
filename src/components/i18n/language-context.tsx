"use client";

import { createContext, useCallback, useContext, type ReactNode } from "react";

import type { Words } from "@/lib/contract/labels";
import type { Language, LanguageChoice } from "@/lib/i18n/language";
import { say, sayWith } from "@/lib/i18n/say";

/**
 * The language the staff screens are read in (NFR-LNG-001, ADR 0040), read by the root layout on this request and handed down. The default
 * is English with no switch, so a component drawn outside the provider (a test, a page with nobody signed in) reads English and offers
 * nothing. Nothing is keyed on the language: a refresh re-renders the same tree in place, so a half-filled drawer keeps its values.
 */
/// The server action that saves the choice, handed in by the root layout (as `signOut` is to the shell), so that no component imports the
/// server: a test of a drawer or the top bar reads without a database.
export type SetLanguage = (data: FormData) => Promise<{ ok: true } | { ok: false; message: Words }>;

interface LanguageState {
  language: Language;
  /// What the person stored: null when they never chose.
  choice: LanguageChoice;
  /// Whether this person may switch (a staff session on the staff side).
  canSwitch: boolean;
}

const LanguageContext = createContext<LanguageState & { setLanguage: SetLanguage | null }>({ language: "en", choice: null, canSwitch: false, setLanguage: null });

/// A switch is offered only where there is an action to save it with.
export function LanguageProvider({ language, choice, canSwitch, setLanguage, children }: LanguageState & { setLanguage?: SetLanguage; children?: ReactNode }) {
  return <LanguageContext.Provider value={{ language, choice, canSwitch: canSwitch && setLanguage != null, setLanguage: setLanguage ?? null }}>{children}</LanguageContext.Provider>;
}

export const useLanguage = (): LanguageState => useContext(LanguageContext);

/// The action behind the switch; null where none was handed in.
export const useSetLanguage = (): SetLanguage | null => useContext(LanguageContext).setLanguage;

/// Words to a string in the language being read.
export function useSay(): (words: Words) => string {
  const { language } = useLanguage();
  return useCallback((words: Words) => say(words, language), [language]);
}

/// A pair as text, for a server component's JSX: the same words, in the language being read.
export function Say({ words }: { words: Words }) {
  return <>{useSay()(words)}</>;
}

/// A sentence with values as text, for a server component's JSX: the same words, in the language being read.
export function SayWith({ words, values }: { words: Words; values: Readonly<Record<string, string>> }) {
  const { language } = useLanguage();
  return <>{sayWith(words, language, values)}</>;
}
