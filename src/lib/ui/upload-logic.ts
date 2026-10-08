/// The pure part of the shared FileInput's upload mode (Phase 4b): what an answer from an upload route means to the person who chose the file, and the words said while it goes. The
/// component sends and draws; it decides none of this. An answer's `code` is for the page's logic and is never printed: what is shown is the answer's own `message`.

export type UploadPhase = "idle" | "uploading" | "done" | "refused";

export interface UploadAnswer {
  ok?: boolean;
  message?: string;
  code?: string;
  [key: string]: unknown;
}

export interface UploadOutcome {
  phase: "done" | "refused";
  /// Said to the person, under the control.
  message: string;
  /// The page the file was chosen on is out of date (409): it must be reloaded before another try.
  stale: boolean;
}

/// What an answer means. A 2xx with `ok` is done; anything else is a refusal worded by the server, or, when it sent no words (a proxy's page, a dropped connection), by us.
export function uploadOutcome(status: number, body: UploadAnswer | null): UploadOutcome {
  if (status >= 200 && status < 300 && body?.ok === true) return { phase: "done", message: "", stale: false };
  const said = typeof body?.message === "string" && body.message.trim() ? body.message.trim() : null;
  if (status === 0) return { phase: "refused", message: "The upload did not reach the portal. Check your connection and try again.", stale: false };
  if (status === 413) return { phase: "refused", message: said ?? "That file is larger than the portal takes.", stale: false };
  if (status === 401) return { phase: "refused", message: said ?? "You have been signed out. Sign in again, then upload the file.", stale: false };
  if (status === 409) return { phase: "refused", message: said ?? "This page is out of date. Reload it, then upload the file.", stale: true };
  return { phase: "refused", message: said ?? "The file could not be uploaded. Try again, or tell the procurement office.", stale: false };
}

/// "Uploading… 40%". The percentage is whole, and never past a hundred or below nothing.
export function progressText(loaded: number, total: number): string {
  if (!(total > 0)) return "Uploading…";
  const pct = Math.max(0, Math.min(100, Math.round((loaded / total) * 100)));
  return `Uploading… ${pct}%`;
}

export const progressPercent = (loaded: number, total: number): number => (total > 0 ? Math.max(0, Math.min(100, Math.round((loaded / total) * 100))) : 0);

/// What every uploaded file is called until something scans it: nothing does (go-live condition OD-4).
export const NOT_SCANNED_LABEL = "Not scanned";
