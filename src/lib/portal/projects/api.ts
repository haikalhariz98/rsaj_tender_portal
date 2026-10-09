/**
 * What My Projects' route handlers read from a request body (Phase 4e). Pure: a handler parses with these and acts on the result, so the shape a request must have is held in one
 * place and tested without a server. Nothing here reads a supplier, an organisation, an account or a day the act is dated from the body: those come from the session and the server's
 * clock. A field of the wrong type or past its bound is a refusal, never a guess. The ids named are a contract's, a diary entry's and a certificate's, which the stores read only as the
 * session's supplier may see them (another's read as not found). The password is read here only to be handed to `confirmSupplierPassword`; it is written nowhere.
 */

import { BODY_MAX, DISAGREEMENT_MAX, isSubmissionKind, LINES_MAX, NOTE_MAX, TITLE_MAX, type SubmissionKind } from "./types";
import type { LineInput } from "./submission";

/// A materials list of sixty lines is well inside this; past it the request is not read at all.
export const PROJECTS_BODY_LIMIT = 64 * 1024;

export type Parsed<T> = { ok: true; value: T } | { ok: false; message: string };
const bad = <T>(message: string): Parsed<T> => ({ ok: false, message });

const ID = /^[A-Za-z0-9_-]{8,40}$/;
const isId = (v: unknown): v is string => typeof v === "string" && ID.test(v);
/// Text of at most `max` characters, or null where it is not text or far past the bound (the rule says the exact bound in words).
const text = (v: unknown, max: number): string | null => (v == null ? "" : typeof v === "string" && v.length <= max * 4 ? v.slice(0, max * 2) : null);
const password = (v: unknown): string => (typeof v === "string" ? v : "");

export interface SubmitBody {
  contractId: string;
  kind: SubmissionKind;
  title: string;
  body: string;
  amount: string;
  aboutDay: string;
  lines: LineInput[];
  password: string;
}

export function parseSubmitBody(b: Record<string, unknown>): Parsed<SubmitBody> {
  if (!isId(b.contractId)) return bad("Say which contract this is for.");
  if (!isSubmissionKind(b.kind)) return bad("Say what kind of submission this is.");
  const title = text(b.title, TITLE_MAX);
  const body = text(b.body, BODY_MAX);
  const amount = text(b.amount, 40);
  const aboutDay = text(b.aboutDay, 10);
  if (title == null || body == null || amount == null || aboutDay == null) return bad("A field is not text.");
  const rawLines = b.lines == null ? [] : b.lines;
  if (!Array.isArray(rawLines)) return bad("The items are not a list.");
  if (rawLines.length > LINES_MAX * 2) return bad(`A list holds at most ${LINES_MAX} items.`);
  const lines: LineInput[] = [];
  for (const l of rawLines) {
    if (typeof l !== "object" || l == null || Array.isArray(l)) return bad("An item is not an item.");
    const o = l as Record<string, unknown>;
    const description = text(o.description, 300);
    const quantity = text(o.quantity, 60);
    const location = text(o.location, 200);
    const value = text(o.value, 40);
    if (description == null || quantity == null || location == null || value == null) return bad("An item's field is not text.");
    lines.push({ description, quantity, location, value });
  }
  return { ok: true, value: { contractId: b.contractId, kind: b.kind, title, body, amount, aboutDay, lines, password: password(b.password) } };
}

export interface DiaryBody {
  contractId: string;
  entryId: string;
  action: "attest" | "dispute";
  disagreement: string;
  password: string;
}

export function parseDiaryBody(b: Record<string, unknown>): Parsed<DiaryBody> {
  if (!isId(b.contractId) || !isId(b.entryId)) return bad("Say which diary entry this is for.");
  if (b.action !== "attest" && b.action !== "dispute") return bad("Say whether you are attesting the entry or recording a disagreement.");
  const disagreement = text(b.disagreement, DISAGREEMENT_MAX);
  if (disagreement == null) return bad("The disagreement is not text.");
  return { ok: true, value: { contractId: b.contractId, entryId: b.entryId, action: b.action, disagreement, password: password(b.password) } };
}

export interface CertificateBody {
  contractId: string;
  certificateId: string;
  action: "sign" | "dispute";
  note: string;
  password: string;
}

export function parseCertificateBody(b: Record<string, unknown>): Parsed<CertificateBody> {
  if (!isId(b.contractId) || !isId(b.certificateId)) return bad("Say which certificate this is for.");
  if (b.action !== "sign" && b.action !== "dispute") return bad("Say whether you are signing the certificate or disputing it.");
  const note = text(b.note, NOTE_MAX);
  if (note == null) return bad("The dispute is not text.");
  return { ok: true, value: { contractId: b.contractId, certificateId: b.certificateId, action: b.action, note, password: password(b.password) } };
}
