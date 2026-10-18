"use server";

import { refresh } from "next/cache";

import { setStaffLanguage } from "@/lib/auth/account-store";
import { AUTH_WORDS, type Words } from "@/lib/auth/words";
import { parseLanguageChoice } from "@/lib/i18n/language";

import { requireStaff } from "./actor";
import { refuseForeignPost } from "./cookies";

type LanguageResult = { ok: true } | { ok: false; message: Words };

/**
 * The person's own display-language setting (NFR-LNG-001, ADR 0040). It needs no permission, because it changes nothing but how the
 * signed-in person reads the screens, and it never redirects: the page stays where it is and `refresh()` re-renders it in the new language,
 * so whatever is typed in an open drawer survives. Nobody signed in is refused (thrown, as the other account actions do).
 */
export async function setLanguageAction(data: FormData): Promise<LanguageResult> {
  const actor = await requireStaff({ on: "throw" });
  if (await refuseForeignPost()) return { ok: false, message: AUTH_WORDS.wrongOrigin };
  const parsed = parseLanguageChoice(data.get("language"));
  if (!parsed.ok) return { ok: false, message: AUTH_WORDS.languageNotRecognised };
  await setStaffLanguage(actor, parsed.value);
  refresh();
  return { ok: true };
}
