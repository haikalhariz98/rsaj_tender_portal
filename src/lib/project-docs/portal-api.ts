/**
 * What the contractor's Project workspace routes read from a request (plan step 5, §6). Pure: a route parses with these and acts on the result, so the shape a request must
 * have is held in one place and tested without a server. By hand, as `src/lib/portal/projects/api.ts` does (no schema library is installed).
 *
 * - Unknown fields are refused, each named (400 VALIDATION, with a field-level `errors`).
 * - The kind (plan step 6; PW-9, PW-23): one of the six is picked with a document's FIRST version, so it is read by the create route (with an upload, never with a request)
 *   and by the version route (the first version of a document the organisation asked the contractor for). The request route and the staging upload refuse a posted `kind`
 *   422, judged before anything else: a route never ignores it. An unknown kind is a field error (400).
 * - The password (PW-10, AC-30): a statutory declaration's every version is signed with the contractor's password, asked again. The create route takes one only with that
 *   kind (posted with any other, it is refused, so nobody spends a step-up or a lockout count for nothing). The version route parses one when posted, then reads the
 *   document's kind as the contractor may open it and refuses the password unless it is a declaration (`versionTakesPassword`, PW-41), as create does. The password is
 *   handed to `confirmSupplierPassword` alone.
 * - No supplier, organisation, account, day or time is read from a body: the supplier is the session's and the day is the server's. No approver is accepted from a
 *   contractor: it names none (PW-6 is the organisation's).
 * - The ids named are a contract's, a document's and staged store versions', which the stores read only as the session's supplier may hold them.
 * - A supply claim's files (ADR 0045 D6, WV-11) are posted as `files: {versionId, purpose}[]`, each purpose "DELIVERY_ORDER" or "SUPPLY_INVOICE", in place of `versionIds`
 *   (both together is a field error). On create, `files` go only with the kind SUPPLY_CLAIM (422 otherwise). On a new version the document's kind is the store's to read:
 *   `versionFileFaults` refuses them (422) on any other kind, and refuses a supply claim's version sent with `versionIds`.
 *
 * The exact bounds of a title, note or file count are the pure faults' (`faults.ts`); here a value is only kept from being absurdly large, so a refusal can say the real bound.
 */

import { isSubmissionKind } from "@/lib/portal/projects/types";

import { isSupplyFilePurpose, type SupplyFilePurpose } from "./kinds-offered";

import { PROJECT_FILES_PER_VERSION } from "./bounds";
import { NOTE_MAX, TITLE_MAX } from "./faults";
import { SIGNED_KIND } from "./labels";
import type { DocKind } from "./types";

export type PortalParsed<T> = { ok: true; value: T } | { ok: false; status: 400 | 422; code: "VALIDATION" | "KIND_NOT_AVAILABLE"; message: string; errors: Record<string, string> };

/// The staged files of an upload, and their purposes where they were posted as a supply claim's `files` (absent: each is a plain project file).
interface Staged {
  stagedVersionIds: string[];
  filePurposes?: SupplyFilePurpose[];
}

const invalid = (errors: Record<string, string>): PortalParsed<never> => ({ ok: false, status: 400, code: "VALIDATION", message: "Check the fields marked below.", errors });
/// A kind posted where none is taken: to the request route, or to the staging upload. A kind is picked when the document's first version is sent (plan step 6).
const KIND_REFUSED: PortalParsed<never> = { ok: false, status: 422, code: "KIND_NOT_AVAILABLE", message: "A kind is picked when the document's first version is sent, not here.", errors: { kind: "Not taken here." } };
/// The longest password read from a body: far past any rule, so a bound refuses an absurd one before it is hashed.
const PASSWORD_MAX = 512;

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

/// `versionIds` or `files`, never both: the staged ids, with the purposes where `files` was posted.
function stagedOf(b: Readonly<Record<string, unknown>>, errors: Record<string, string>): Staged {
  const versionIds = idList(b.versionIds, errors, "versionIds");
  if (b.files == null) return { stagedVersionIds: versionIds };
  if (b.versionIds != null) {
    errors.files = "Send the files as a list of files or as a delivery order and invoice, not both.";
    return { stagedVersionIds: versionIds };
  }
  const v = b.files;
  if (!Array.isArray(v) || v.length > PROJECT_FILES_PER_VERSION * 2) {
    errors.files = Array.isArray(v) ? "Far too many files in one request." : "The files are not a list.";
    return { stagedVersionIds: [] };
  }
  const ids: string[] = [];
  const purposes: SupplyFilePurpose[] = [];
  for (const x of v) {
    const f = x as Record<string, unknown> | null;
    if (typeof f !== "object" || f === null || Array.isArray(f) || Object.keys(f).some((k) => k !== "versionId" && k !== "purpose") || !isId(f.versionId)) {
      errors.files = "A file is not one that was uploaded.";
      return { stagedVersionIds: [] };
    }
    if (!isSupplyFilePurpose(f.purpose)) {
      errors.files = "Say whether each file is the delivery order or the invoice.";
      return { stagedVersionIds: [] };
    }
    ids.push(f.versionId);
    purposes.push(f.purpose);
  }
  return { stagedVersionIds: ids, filePurposes: purposes };
}

/// A supply claim's files posted on create with another kind, or none (WV-11): judged before anything else, as a misplaced kind is.
const FILES_NOT_TAKEN: PortalParsed<never> = { ok: false, status: 422, code: "KIND_NOT_AVAILABLE", message: "A delivery order and invoice go only with that kind.", errors: { files: "Not taken with this kind." } };

// ------------------------------------------------------------------ create

export interface CreateBody {
  contractId: string;
  title: string;
  /// The document's own note.
  note: string;
  first: { upload: Staged & { note: string } } | { request: { note: string } };
  /// One of the six kinds, picked with the first version; null for an ordinary document.
  kind: DocKind | null;
}

/// What a route reads besides the act's own body: the password, for the route alone (it never reaches a store).
export interface Signed<T> {
  body: T;
  /// The password to ask again, or null where none was posted.
  password: string | null;
}

/// A password posted with anything but a statutory declaration (PW-10, PW-41): the same words on both routes.
export const PASSWORD_ONLY_DECLARATION = "Only a statutory declaration is signed with your password.";

/// PW-41: a posted password is taken by the version route only for a statutory declaration's version: the document's kind, or (on the first version of a document the
/// organisation asked for, with no kind yet) the kind picked with it. A later version of a declaration still needs it (PW-10).
export const versionTakesPassword = (documentKind: DocKind | null, postedKind: DocKind | null): boolean => (documentKind ?? postedKind) === SIGNED_KIND;

const CREATE_FIELDS = ["contractId", "title", "note", "mode", "versionIds", "files", "versionNote", "requestNote", "kind", "password"] as const;

/// A posted kind: absent, null or empty is none; one of the six is that kind; anything else is a field error.
function kindOf(b: Readonly<Record<string, unknown>>, errors: Record<string, string>): DocKind | null {
  const v = b.kind;
  if (v == null || v === "") return null;
  if (isSubmissionKind(v)) return v;
  errors.kind = "Not one of the six kinds.";
  return null;
}

/// A posted password: absent or empty is none; text within the bound is the password; anything else is a field error.
function passwordOf(b: Readonly<Record<string, unknown>>, errors: Record<string, string>): string | null {
  const v = b.password;
  if (v == null || v === "") return null;
  if (typeof v === "string" && v.length <= PASSWORD_MAX) return v;
  errors.password = "The password is not text.";
  return null;
}

/**
 * `POST /supplier/projects/documents/create`: a document with its first version (`mode: "upload"`, `versionIds`, `versionNote`, and optionally `kind`) or its first request
 * (`mode: "request"`, `requestNote`). A statutory declaration needs `password`; no other kind takes one. A supply claim posts `files` in place of `versionIds`.
 */
export function parseCreateBody(b: Readonly<Record<string, unknown>>): PortalParsed<Signed<CreateBody>> {
  const errors: Record<string, string> = unknownFields(b, CREATE_FIELDS);
  const kind = kindOf(b, errors);
  if (b.files != null && kind !== "SUPPLY_CLAIM" && !errors.kind) return FILES_NOT_TAKEN;
  const password = passwordOf(b, errors);
  if (kind !== null && b.mode === "request") errors.kind = "A kind goes with a file sent, not with a request.";
  if (password !== null && kind !== SIGNED_KIND) errors.password = PASSWORD_ONLY_DECLARATION;
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
  const staged = stagedOf(b, errors);
  if (b.mode === "upload" && requestNote) errors.requestNote = "A request note goes with a request, not with a file.";
  if (b.mode === "request" && (staged.stagedVersionIds.length > 0 || versionNote)) errors.versionIds = "Files go with a version, not with a request.";
  if (Object.keys(errors).length > 0) return invalid(errors);
  const first = b.mode === "upload" ? { upload: { ...staged, note: versionNote! } } : { request: { note: requestNote! } };
  return { ok: true, value: { body: { contractId: b.contractId as string, title: title!, note: note!, first, kind }, password } };
}

// ------------------------------------------------------------------ a new version

export interface VersionBody {
  contractId: string;
  documentId: string;
  stagedVersionIds: string[];
  /// A supply claim's purposes, one per staged file; absent where `versionIds` was posted.
  filePurposes?: SupplyFilePurpose[];
  note: string;
  /// One of the six kinds, for the first version of a document the organisation asked for; null otherwise. The store refuses it on any later version (KIND_ALREADY_SET).
  kind: DocKind | null;
}

const VERSION_FIELDS = ["contractId", "documentId", "versionIds", "files", "note", "kind", "password"] as const;

/// `POST /supplier/projects/documents/version`. `password` is parsed when posted; the route then takes it only for a declaration's version (`versionTakesPassword`).
export function parseVersionBody(b: Readonly<Record<string, unknown>>): PortalParsed<Signed<VersionBody>> {
  const errors: Record<string, string> = unknownFields(b, VERSION_FIELDS);
  if (!isId(b.contractId)) errors.contractId = "Say which contract this is for.";
  if (!isId(b.documentId)) errors.documentId = "Say which document this is for.";
  const note = text(b.note, NOTE_MAX);
  if (note == null) errors.note = "The note is not text.";
  const staged = stagedOf(b, errors);
  const kind = kindOf(b, errors);
  const password = passwordOf(b, errors);
  if (Object.keys(errors).length > 0) return invalid(errors);
  return { ok: true, value: { body: { contractId: b.contractId as string, documentId: b.documentId as string, ...staged, note: note!, kind }, password } };
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
