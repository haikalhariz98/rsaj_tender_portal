import { AUTH_WORDS } from "./words";

/**
 * How a route handler turns a person away for who is asking, not for what was asked (Phase 1b). One shape, so a client reading any route's
 * answer finds the stable `code` and the human `message`, and the `error` text the older routes already answer with.
 */

export type RouteRefusalCode = "NOT_SIGNED_IN" | "FORBIDDEN" | "CROSS_SITE" | "NO_ORIGIN" | "WRONG_ORIGIN" | "WRONG_CONTENT_TYPE" | "NOT_FOUND";

export const REFUSAL_STATUS: Record<RouteRefusalCode, number> = {
  NOT_SIGNED_IN: 401,
  FORBIDDEN: 403,
  CROSS_SITE: 403,
  NO_ORIGIN: 403,
  WRONG_ORIGIN: 403,
  WRONG_CONTENT_TYPE: 415,
  NOT_FOUND: 404,
};

export function refusalBody(code: RouteRefusalCode, message?: string): { ok: false; code: RouteRefusalCode; message: string; error: string } {
  const text = message ?? (code === "NOT_SIGNED_IN" ? AUTH_WORDS.notSignedIn.en : code === "FORBIDDEN" ? "You do not hold the permission this needs." : AUTH_WORDS.wrongOrigin.en);
  return { ok: false, code, message: text, error: text };
}
