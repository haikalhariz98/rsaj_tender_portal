"use client";

import { FORM_TOKEN_FIELD } from "@/lib/auth/form-token";
import type { Receipt } from "@/lib/bids/online/types";
import { SCREEN_WORDS } from "@/lib/bids/online/screen-words";
import type { Words } from "@/lib/contract/labels";

import { postForm } from "../company/post-form";

/**
 * Posting to the online-bid routes from the supplier's screens (SR-13, build plan step 11). Every route answers `{ ok, code, message, messageMs, ... }`: the message is already in
 * words in both languages, and `code` is a stable name for the page's logic and is never printed. A failed connection is status 0 and says so, in both languages, with what is
 * known: nothing is known to have been done.
 */

export interface OnlineAnswer {
  ok?: boolean;
  code?: string;
  message?: string;
  messageMs?: string;
  faults?: { message: string; messageMs: string }[];
  receipt?: Receipt;
  warnings?: { message: string; messageMs: string }[];
  fileId?: string;
  withdrawn?: string[];
  linksCleared?: string[];
}

export async function postOnline(path: string, token: string | null, body: Record<string, unknown>): Promise<{ status: number; body: OnlineAnswer | null }> {
  try {
    const res = await fetch(path, { method: "POST", headers: { "content-type": "application/json" }, credentials: "same-origin", body: JSON.stringify({ ...body, [FORM_TOKEN_FIELD]: token }) });
    let json: OnlineAnswer | null = null;
    try {
      json = (await res.json()) as OnlineAnswer;
    } catch {
      json = null;
    }
    return { status: res.status, body: json };
  } catch {
    return { status: 0, body: null };
  }
}

export async function postUpload(path: string, token: string | null, form: FormData): Promise<{ status: number; body: OnlineAnswer | null }> {
  const sent = await postForm(path, token, form);
  return { status: sent.status, body: sent.body as OnlineAnswer | null };
}

/// The words for an answer, in both languages: its own where it carried them, else what the status tells.
export function answerWords(status: number, body: OnlineAnswer | null): Words {
  if (typeof body?.message === "string" && body.message.trim()) return { en: body.message.trim(), ms: typeof body.messageMs === "string" && body.messageMs.trim() ? body.messageMs.trim() : body.message.trim() };
  if (status === 401) return SCREEN_WORDS.signedOut;
  if (status === 403 || status === 400) return SCREEN_WORDS.secondTab;
  return SCREEN_WORDS.notReached;
}
