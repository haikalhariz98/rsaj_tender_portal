/**
 * The body of a portal POST, read once and bounded (Phase 4a). The portal's sign-in, activation, reset and account forms post a small JSON object; nothing they
 * carry is near this size, so a body past it is not read at all. The size is stated by the request (a body of no stated size is refused, as the registration route
 * refuses one) AND enforced while reading, so a request that states less than it sends is cut off.
 */

export const PORTAL_BODY_LIMIT = 8 * 1024;

export type JsonBody = { ok: true; body: Record<string, unknown> } | { ok: false; status: 400 | 411 | 413; code: "NOT_JSON" | "NO_LENGTH" | "TOO_LARGE" };

export async function readJsonBody(request: Request, maxBytes: number = PORTAL_BODY_LIMIT): Promise<JsonBody> {
  const declared = Number(request.headers.get("content-length"));
  if (!Number.isFinite(declared) || declared <= 0) return { ok: false, status: 411, code: "NO_LENGTH" };
  if (declared > maxBytes) return { ok: false, status: 413, code: "TOO_LARGE" };
  if (!request.body) return { ok: false, status: 400, code: "NOT_JSON" };

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      return { ok: false, status: 413, code: "TOO_LARGE" };
    }
    chunks.push(value);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    return { ok: false, status: 400, code: "NOT_JSON" };
  }
  // A form is an object of fields: an array, a number, null or a bare string is not one.
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) return { ok: false, status: 400, code: "NOT_JSON" };
  return { ok: true, body: parsed as Record<string, unknown> };
}

/// The fields of a JSON object as the entries the sign-in parsers (`forms.ts`) read. A value that is not text is passed on as an object, which they refuse by name.
export function entriesOf(body: Record<string, unknown>): [string, FormDataEntryValue][] {
  return Object.entries(body).map(([k, v]) => [k, typeof v === "string" ? v : (new Blob([]) as unknown as FormDataEntryValue)]);
}
