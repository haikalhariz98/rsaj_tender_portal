"use client";

/**
 * Posting a multipart form to a route handler from the Company workspace (Phase 4c). The public copy takes no server action, so every write is a post to a literal path. XMLHttpRequest rather than
 * `fetch`: it states the body's length (the handlers refuse a body that does not) and reports how far the upload has got. The token rides in `x-form-token`: it cannot ride in a body that
 * is not read until the guards have passed. A failed connection is status 0.
 */

export interface FormAnswer {
  ok?: boolean;
  code?: string;
  message?: string;
  faults?: { field: string | null; level: "block" | "warn" | "info"; message: string }[];
  [key: string]: unknown;
}

export function postForm(url: string, token: string | null, form: FormData, onProgress?: (loaded: number, total: number) => void): Promise<{ status: number; body: FormAnswer | null }> {
  return new Promise((resolve) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", url);
    if (token) xhr.setRequestHeader("x-form-token", token);
    xhr.responseType = "json";
    xhr.upload.onprogress = (e) => onProgress?.(e.loaded, e.lengthComputable ? e.total : 0);
    xhr.onload = () => resolve({ status: xhr.status, body: (xhr.response ?? null) as FormAnswer | null });
    xhr.onerror = () => resolve({ status: 0, body: null });
    xhr.send(form);
  });
}

/// The words for an answer that carried none of its own.
export function answerWords(status: number, body: FormAnswer | null): string {
  const said = typeof body?.message === "string" && body.message.trim() ? body.message.trim() : null;
  if (said) return said;
  if (status === 0) return "That did not reach the portal. Check your connection and try again. Nothing was sent.";
  if (status === 401) return "You have been signed out. Sign in again, then send it.";
  return "That did not work and nothing was sent. Try again in a moment.";
}

/// The fault messages at a field, blocking first.
export function at(faults: FormAnswer["faults"], field: string): string | undefined {
  const mine = (faults ?? []).filter((f) => f.field === field);
  const blocking = mine.filter((f) => f.level === "block");
  const list = blocking.length ? blocking : mine;
  return list.length ? list.map((f) => f.message).join(" ") : undefined;
}
