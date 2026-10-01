/**
 * Sending a file to the portal (plan §2). A Server Action cannot take it — a body is
 * capped at 1 MB there — so the file goes to the Route Handler, which stores it as a
 * received document and answers with the version it made. Attaching that version to a
 * record is the owner's act, called separately with the version's id and never the file.
 *
 * The `code` in the answer is for the island's own logic (which field to put a refusal
 * beside). It is never rendered: the `message` is the words.
 */

export type UploadAnswer =
  | { ok: true; versionId: string; documentId: string; warnings: string[] }
  | { ok: false; code: string; message: string };

/// The form fields the upload route reads.
const UPLOAD_FIELDS = ["file", "title", "documentClassId", "recordedByPersonId", "receivedOn", "note", "documentId"] as const;

export async function postUpload(data: FormData, extra: Record<string, string> = {}): Promise<UploadAnswer> {
  const body = new FormData();
  for (const k of UPLOAD_FIELDS) {
    const v = data.get(k);
    if (v != null) body.set(k, v);
  }
  for (const [k, v] of Object.entries(extra)) body.set(k, v);
  let res: Response;
  try {
    // No Content-Type of our own: the browser writes the multipart boundary.
    res = await fetch("/api/documents", { method: "POST", body });
  } catch {
    return { ok: false, code: "NETWORK", message: "The upload did not reach the portal. Check the connection and try again." };
  }
  let json: { ok?: boolean; code?: string; message?: string; versionId?: string; documentId?: string; warnings?: { message: string }[] } | null = null;
  try {
    json = await res.json();
  } catch {
    json = null;
  }
  if (res.ok && json?.ok && json.versionId && json.documentId) {
    return { ok: true, versionId: json.versionId, documentId: json.documentId, warnings: (json.warnings ?? []).map((w) => w.message) };
  }
  return { ok: false, code: json?.code ?? "UNREADABLE", message: json?.message ?? "The portal did not accept the upload, and its answer could not be read. Nothing was stored. Try again." };
}

/// Which field a refusal belongs beside. Anything else reads at the top of the form.
export function fieldOfRefusal(code: string): "file" | "title" | "documentClassId" | "recordedByPersonId" | "receivedOn" | null {
  switch (code) {
    case "NO_FILE":
    case "EMPTY":
    case "TOO_LARGE":
    case "NAME_TOO_LONG":
    case "TYPE_NOT_RECOGNISED":
    case "ARCHIVE_NOT_ACCEPTED":
    case "MARKUP_NEVER_ACCEPTED":
    case "TYPE_NOT_ALLOWED":
    case "NAME_WITHOUT_TYPE":
    case "DECLARED_TYPE_MISMATCH":
    case "IDENTICAL_TO_VERSION_N":
      return "file";
    case "TITLE_REQUIRED":
      return "title";
    case "CLASS_NOT_SET":
    case "CLASS_UNKNOWN":
      return "documentClassId";
    case "PERSON_REQUIRED":
    case "PERSON_UNKNOWN":
      return "recordedByPersonId";
    case "RECEIVED_ON_INVALID":
    case "RECEIVED_ON_FUTURE":
    case "TIME_ZONE_UNSET":
      return "receivedOn";
    default:
      return null;
  }
}
