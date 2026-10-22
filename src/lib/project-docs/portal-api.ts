/**
 * What the contractor's Project workspace routes read from a request (plan step 5, §6). Pure: a route parses with these and acts on the result, so the shape a request must
 * have is held in one place and tested without a server. By hand, as `src/lib/portal/projects/api.ts` does (no schema library is installed).
 *
 * - Unknown fields are refused, each named (400 VALIDATION, with a field-level `errors`).
 * - A posted `kind` is refused 422 (PW-23): the six kinds arrive in step 6, and a route that is sent one must say so, never ignore it. It is judged before anything else.
 * - No supplier, organisation, account, day or time is read from a body: the supplier is the session's and the day is the server's. No approver is accepted from a
 *   contractor: it names none (PW-6 is the organisation's).
 * - The ids named are a contract's, a document's and staged store versions', which the stores read only as the session's supplier may hold them.
 *
 * The exact bounds of a title, note or file count are the pure faults' (`faults.ts`); here a value is only kept from being absurdly large, so a refusal can say the real bound.
 */

import { PROJECT_FILES_PER_VERSION } from "./bounds";
import { NOTE_MAX, TITLE_MAX } from "./faults";

export type PortalParsed<T> = { ok: true; value: T } | { ok: false; status: 400 | 422; code: "VALIDATION" | "KIND_NOT_AVAILABLE"; message: string; errors: Record<string, string> };

const invalid = (errors: Record<string, string>): PortalParsed<never> => ({ ok: false, status: 400, code: "VALIDATION", message: "Check the fields marked below.", errors });
const KIND_REFUSED: PortalParsed<never> = { ok: false, status: 422, code: "KIND_NOT_AVAILABLE", message: "Choosing a kind is not available yet. Send the document without one.", errors: { kind: "Not available yet." } };

const ID = /^[A-Za-z0-9_-]{8,40}$/;
const isId = (v: unknown): v is string => typeof v === "string" && ID.test(v);
/// Text, or null where it is not text or is far past any bound (the rule says the exact bound in words).
const text = (v: unknown, max: number): string | null => (v == null ? "" : typeof v === "string" && v.length <= max * 4 ? v : null);

/// Every key of `fields` that is not in `allowed`, as a field error. A `kind` is judged first by the caller.
function unknownFields(fields: Readonly<Record<string, unknown>>, allowed: readonly string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const k of Object.keys(fields)) if (!allowed.includes(k)) out[k] = "Not a field of this request.";
  return out;
}

const hasKind = (o: Readonly<Record<string, unknown>>) => Object.prototype.hasOwnProperty.call(o, "kind");

function idList(v: unknown, errors: Record<string, string>, field: string): string[] {
  if (v == null) return [];
  if (!Array.isArray(v)) {
    errors[field] = "The files are not a list.";
    return [];
  }
  if (v.length > PROJECT_FILES_PER_VERSION * 2) {
    errors[field] = "Far too many files in one request.";
    return [];
  }
  const out: string[] = [];
  for (const x of v) {
    if (!isId(x)) {
      errors[field] = "A file is not one that was uploaded.";
      return [];
    }
    out.push(x);
  }
  return out;
}

// ------------------------------------------------------------------ create

export interface CreateBody {
  contractId: string;
  title: string;
  /// The document's own note.
  note: string;
  first: { upload: { stagedVersionIds: string[]; note: string } } | { request: { note: string } };
}

const CREATE_FIELDS = ["contractId", "title", "note", "mode", "versionIds", "versionNote", "requestNote"] as const;

/// `POST /supplier/projects/documents/create`: a document with its first version (`mode: "upload"`, `versionIds`, `versionNote`) or its first request (`mode: "request"`, `requestNote`).
export function parseCreateBody(b: Readonly<Record<string, unknown>>): PortalParsed<CreateBody> {
  if (hasKind(b)) return KIND_REFUSED;
  const errors: Record<string, string> = unknownFields(b, CREATE_FIELDS);
  if (!isId(b.contractId)) errors.contractId = "Say which contract this is for.";
  const title = text(b.title, TITLE_MAX);
  const note = text(b.note, NOTE_MAX);
  if (title == null) errors.title = "The title is not text.";
  if (note == null) errors.note = "The note is not text.";
  if (b.mode !== "upload" && b.mode !== "request") errors.mode = "Say whether you are sending a file or asking for one.";
  const versionNote = text(b.versionNote, NOTE_MAX);
  const requestNote = text(b.requestNote, NOTE_MAX);
  if (versionNote == null) errors.versionNote = "The note is not text.";
  if (requestNote == null) errors.requestNote = "The note is not text.";
  const versionIds = idList(b.versionIds, errors, "versionIds");
  if (b.mode === "upload" && requestNote) errors.requestNote = "A request note goes with a request, not with a file.";
  if (b.mode === "request" && (versionIds.length > 0 || versionNote)) errors.versionIds = "Files go with a version, not with a request.";
  if (Object.keys(errors).length > 0) return invalid(errors);
  const first = b.mode === "upload" ? { upload: { stagedVersionIds: versionIds, note: versionNote! } } : { request: { note: requestNote! } };
  return { ok: true, value: { contractId: b.contractId as string, title: title!, note: note!, first } };
}

// ------------------------------------------------------------------ a new version

export interface VersionBody {
  contractId: string;
  documentId: string;
  stagedVersionIds: string[];
  note: string;
}

const VERSION_FIELDS = ["contractId", "documentId", "versionIds", "note"] as const;

/// `POST /supplier/projects/documents/version`.
export function parseVersionBody(b: Readonly<Record<string, unknown>>): PortalParsed<VersionBody> {
  if (hasKind(b)) return KIND_REFUSED;
  const errors: Record<string, string> = unknownFields(b, VERSION_FIELDS);
  if (!isId(b.contractId)) errors.contractId = "Say which contract this is for.";
  if (!isId(b.documentId)) errors.documentId = "Say which document this is for.";
  const note = text(b.note, NOTE_MAX);
  if (note == null) errors.note = "The note is not text.";
  const versionIds = idList(b.versionIds, errors, "versionIds");
  if (Object.keys(errors).length > 0) return invalid(errors);
  return { ok: true, value: { contractId: b.contractId as string, documentId: b.documentId as string, stagedVersionIds: versionIds, note: note! } };
}

// ------------------------------------------------------------------ a request

export interface RequestBody {
  contractId: string;
  documentId: string;
  note: string;
}

const REQUEST_FIELDS = ["contractId", "documentId", "note"] as const;

/// `POST /supplier/projects/documents/request`.
export function parseRequestBody(b: Readonly<Record<string, unknown>>): PortalParsed<RequestBody> {
  if (hasKind(b)) return KIND_REFUSED;
  const errors: Record<string, string> = unknownFields(b, REQUEST_FIELDS);
  if (!isId(b.contractId)) errors.contractId = "Say which contract this is for.";
  if (!isId(b.documentId)) errors.documentId = "Say which document this is for.";
  const note = text(b.note, NOTE_MAX);
  if (note == null) errors.note = "The note is not text.";
  if (Object.keys(errors).length > 0) return invalid(errors);
  return { ok: true, value: { contractId: b.contractId as string, documentId: b.documentId as string, note: note! } };
}

// ------------------------------------------------------------------ the staging upload

/// The query of `POST /supplier/projects/documents/upload`: the contract, and nothing else (it is read before the body, which is where the contract has to be checked). A `kind` is refused 422.
export function parseUploadQuery(q: URLSearchParams): PortalParsed<{ contractId: string }> {
  if (q.has("kind")) return KIND_REFUSED;
  const errors: Record<string, string> = unknownFields(Object.fromEntries(q.entries()), ["contractId"]);
  const contractId = q.get("contractId");
  if (!isId(contractId)) errors.contractId = "Say which contract this is for.";
  if (Object.keys(errors).length > 0) return invalid(errors);
  return { ok: true, value: { contractId: contractId as string } };
}

/// The form of the upload: one `file`, and a `contractId` only if it says what the query said. Any other field is refused; a `kind` is refused 422.
export function parseUploadForm(entries: Iterable<[string, unknown]>, contractId: string): PortalParsed<{ file: File }> {
  const seen = new Map<string, unknown[]>();
  for (const [k, v] of entries) seen.set(k, [...(seen.get(k) ?? []), v]);
  if (seen.has("kind")) return KIND_REFUSED;
  const errors: Record<string, string> = {};
  for (const k of seen.keys()) if (k !== "file" && k !== "contractId") errors[k] = "Not a field of this request.";
  const said = seen.get("contractId");
  if (said && (said.length !== 1 || said[0] !== contractId)) errors.contractId = "The form names another contract than the address does.";
  const files = seen.get("file") ?? [];
  if (files.length !== 1 || !(files[0] instanceof File)) errors.file = files.length > 1 ? "Send one file at a time." : "No file came with the upload.";
  if (Object.keys(errors).length > 0) return invalid(errors);
  return { ok: true, value: { file: files[0] as File } };
}
