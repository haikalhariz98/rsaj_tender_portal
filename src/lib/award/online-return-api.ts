/**
 * What the contractor's award-return routes read from a request (ADR 0045; wave V plan V3). Pure, by hand as `project-docs/portal-api.ts` does (no schema library): unknown fields are
 * refused 400 and named, with a field-level `errors`. No supplier, organisation, account, day or time is read from a body: the supplier is the session's and the day is the server's.
 * The exact bounds of a typed field or a question are the rules' (`lodgeFaults`, `askFaults`); here a value is only kept from being absurdly large.
 */

import type { PortalParsed } from "@/lib/project-docs/portal-api";

import { PAGE_FIELD_MAX, QUERY_MAX, type OnlineReturnPageInput } from "./online-return";
import { RETURN_SCANS } from "./stage-two";

const invalid = (errors: Record<string, string>): PortalParsed<never> => ({ ok: false, status: 400, code: "VALIDATION", message: "Check the fields marked below.", errors });
const ID = /^[A-Za-z0-9_-]{8,40}$/;
const isId = (v: unknown): v is string => typeof v === "string" && ID.test(v);
const PASSWORD_MAX = 512;
const ALL_SCANS: readonly string[] = [...new Set(Object.values(RETURN_SCANS).flat())];
/// The typed fields. The signatory is not one: it is chosen, by contact id (security review M1), and its name is the contact's, read by the lodge.
const TEXT_FIELDS = (Object.keys(PAGE_FIELD_MAX) as (keyof typeof PAGE_FIELD_MAX)[]).filter((k) => k !== "signatoryName") as Exclude<keyof typeof PAGE_FIELD_MAX, "signatoryName">[];
const FLAGS = ["contractorSigned", "stampAffixed", "witnessSigned"] as const;

const unknownFields = (fields: Readonly<Record<string, unknown>>, allowed: readonly string[]) =>
  Object.fromEntries(Object.keys(fields).filter((k) => !allowed.includes(k)).map((k) => [k, "Not a field of this request."]));
const plain = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/// The query of the staging upload: the contract and the scan, read before the body (the contract has to be checked first).
export function parseReturnUploadQuery(q: URLSearchParams): PortalParsed<{ contractId: string; scan: string }> {
  const errors = unknownFields(Object.fromEntries(q.entries()), ["contractId", "scan"]);
  const contractId = q.get("contractId");
  const scan = q.get("scan");
  if (!isId(contractId)) errors.contractId = "Say which contract this is for.";
  if (scan === null || !ALL_SCANS.includes(scan)) errors.scan = "Say which signed document this is.";
  if (Object.keys(errors).length > 0) return invalid(errors);
  return { ok: true, value: { contractId: contractId as string, scan: scan as string } };
}

/// The form of the upload: one `file`, and a `contractId` / `scan` only if each says what the query said.
export function parseReturnUploadForm(entries: Iterable<[string, unknown]>, query: { contractId: string; scan: string }): PortalParsed<{ file: File }> {
  const seen = new Map<string, unknown[]>();
  for (const [k, v] of entries) seen.set(k, [...(seen.get(k) ?? []), v]);
  const errors: Record<string, string> = {};
  for (const k of seen.keys()) if (k !== "file" && k !== "contractId" && k !== "scan") errors[k] = "Not a field of this request.";
  for (const k of ["contractId", "scan"] as const) {
    const said = seen.get(k);
    if (said && (said.length !== 1 || said[0] !== query[k])) errors[k] = "The form names another than the address does.";
  }
  const files = seen.get("file") ?? [];
  if (files.length !== 1 || !(files[0] instanceof File)) errors.file = files.length > 1 ? "Send one file at a time." : "No file came with the upload.";
  if (Object.keys(errors).length > 0) return invalid(errors);
  return { ok: true, value: { file: files[0] as File } };
}

export interface SubmitBody {
  contractId: string;
  files: Record<string, string>;
  page: OnlineReturnPageInput | null;
}

/// `POST /supplier/projects/award-return/submit`. The password is returned beside the body, for `confirmSupplierPassword` alone.
export function parseSubmitBody(b: Readonly<Record<string, unknown>>): PortalParsed<{ body: SubmitBody; password: string }> {
  const errors = unknownFields(b, ["contractId", "files", "page", "password"]);
  if (!isId(b.contractId)) errors.contractId = "Say which contract this is for.";
  const files: Record<string, string> = {};
  if (!plain(b.files) || Object.keys(b.files).length === 0) errors.files = "Attach the signed scans.";
  else
    for (const [scan, id] of Object.entries(b.files)) {
      if (!ALL_SCANS.includes(scan)) errors.files = "A file is not one this award takes.";
      else if (!isId(id)) errors.files = "A file is not one that was uploaded.";
      else files[scan] = id;
    }
  let page: OnlineReturnPageInput | null = null;
  if (b.page != null) {
    if (!plain(b.page)) errors.page = "The acceptance page is not readable.";
    else {
      const p = b.page;
      for (const k of Object.keys(unknownFields(p, ["signatoryContactId", ...TEXT_FIELDS, ...FLAGS]))) errors[`page.${k}`] = "Not a field of this request.";
      const out: Record<string, string | boolean> = {};
      if (!isId(p.signatoryContactId)) errors["page.signatoryContactId"] = "Choose the signatory.";
      else out.signatoryContactId = p.signatoryContactId;
      for (const k of TEXT_FIELDS) {
        // Far past the bound is refused here; a value between the bound and that is the rule's to word.
        if (typeof p[k] !== "string" || (p[k] as string).length > PAGE_FIELD_MAX[k] * 4) errors[`page.${k}`] = "Give this as text.";
        else out[k] = p[k] as string;
      }
      for (const k of FLAGS) {
        if (typeof p[k] !== "boolean") errors[`page.${k}`] = "Tick or leave this blank.";
        else out[k] = p[k] as boolean;
      }
      if (!Object.keys(errors).some((k) => k.startsWith("page."))) page = out as unknown as OnlineReturnPageInput;
    }
  }
  if (typeof b.password !== "string" || b.password === "" || b.password.length > PASSWORD_MAX) errors.password = "Enter your password to send the return.";
  if (Object.keys(errors).length > 0) return invalid(errors);
  return { ok: true, value: { body: { contractId: b.contractId as string, files, page }, password: b.password as string } };
}

/// `POST /supplier/projects/award-query`. `requestKey` is the browser's one-time key for this question (security review L2): sent again, it is the same question.
export function parseQueryBody(b: Readonly<Record<string, unknown>>): PortalParsed<{ contractId: string; body: string; requestKey: string }> {
  const errors = unknownFields(b, ["contractId", "body", "requestKey"]);
  if (!isId(b.contractId)) errors.contractId = "Say which contract this is for.";
  if (!isId(b.requestKey)) errors.requestKey = "Open the question again and send it.";
  if (typeof b.body !== "string") errors.body = "Write your question.";
  else if (b.body.length > QUERY_MAX) errors.body = `The question is longer than ${QUERY_MAX} characters.`;
  if (Object.keys(errors).length > 0) return invalid(errors);
  return { ok: true, value: { contractId: b.contractId as string, body: b.body as string, requestKey: b.requestKey as string } };
}
