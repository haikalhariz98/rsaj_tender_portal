"use client";

import { FORM_TOKEN_FIELD } from "@/lib/auth/form-token";

/**
 * Posting JSON to one of My Bids' route handlers (Phase 4d). The public copy takes no server action, so every write is a post to a literal path with the page's signed token. A failed connection is status 0
 * and says that nothing was done. What the handler answers is shown as it is: its `message` is already in words.
 */

export interface BidsAnswer {
  ok?: boolean;
  code?: string;
  message?: string;
  reasons?: string[];
  recorded?: boolean;
}

export async function postBids(path: string, token: string | null, body: Record<string, unknown>): Promise<{ status: number; body: BidsAnswer | null }> {
  try {
    const res = await fetch(path, { method: "POST", headers: { "content-type": "application/json" }, credentials: "same-origin", body: JSON.stringify({ ...body, [FORM_TOKEN_FIELD]: token }) });
    let json: BidsAnswer | null = null;
    try {
      json = (await res.json()) as BidsAnswer;
    } catch {
      json = null;
    }
    return { status: res.status, body: json };
  } catch {
    return { status: 0, body: null };
  }
}

/// The words for an answer that carried none of its own.
export function answerWords(status: number, body: BidsAnswer | null): string {
  const said = typeof body?.message === "string" && body.message.trim() ? body.message.trim() : null;
  if (said) return said;
  if (status === 0) return "Not received. Check your connection and try again.";
  if (status === 401) return "You have been signed out. Sign in again, then try again.";
  return "Not done. Try again in a moment.";
}
