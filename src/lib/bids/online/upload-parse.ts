/**
 * What the part routes read from a request, parsed by hand in one place (the API rules: validate at the edge, reject unknown fields). Pure.
 * The ids of the exercise and the returned part ride in the query as well as the form (step 9): the guards, the part's size limit and the supplier's place all have to be
 * judged before the body is read, and a multipart body cannot be read until then. The form's own copies, where sent, must agree.
 */

const ID = /^[A-Za-z0-9_-]{8,64}$/;
export const isId = (v: unknown): v is string => typeof v === "string" && ID.test(v);

export type Parsed<T> = { ok: true; value: T } | { ok: false };

export function parseUploadQuery(q: URLSearchParams): Parsed<{ exerciseId: string; packPartId: string }> {
  const keys = [...q.keys()];
  if (keys.some((k) => k !== "exerciseId" && k !== "packPartId") || q.getAll("exerciseId").length !== 1 || q.getAll("packPartId").length !== 1) return { ok: false };
  const exerciseId = q.get("exerciseId");
  const packPartId = q.get("packPartId");
  return isId(exerciseId) && isId(packPartId) ? { ok: true, value: { exerciseId, packPartId } } : { ok: false };
}

export const UPLOAD_FIELDS = ["exerciseId", "packPartId", "contentSha256", "file"] as const;

export type UploadFields = { file: File; contentSha256: string };
/// `null`: unreadable, an unknown field, a repeated one, or an id that disagrees with the query. The browser's hash is kept as sent: the rule compares it exactly (lower-case hex).
export function parseUploadForm(form: FormData, query: { exerciseId: string; packPartId: string }): Parsed<UploadFields> | { ok: false; disagree: true } {
  const keys = [...form.keys()];
  if (keys.some((k) => !(UPLOAD_FIELDS as readonly string[]).includes(k)) || new Set(keys).size !== keys.length) return { ok: false };
  const file = form.get("file");
  const sha = form.get("contentSha256");
  if (!(file instanceof File) || typeof sha !== "string") return { ok: false };
  for (const k of ["exerciseId", "packPartId"] as const) {
    const v = form.get(k);
    if (v !== null && v !== query[k]) return { ok: false, disagree: true };
  }
  return { ok: true, value: { file, contentSha256: sha.trim() } };
}

export function parseDiscardBody(b: Record<string, unknown>): Parsed<{ exerciseId: string; fileId: string }> {
  const keys = Object.keys(b);
  if (keys.some((k) => k !== "exerciseId" && k !== "fileId")) return { ok: false };
  return isId(b.exerciseId) && isId(b.fileId) ? { ok: true, value: { exerciseId: b.exerciseId, fileId: b.fileId } } : { ok: false };
}
