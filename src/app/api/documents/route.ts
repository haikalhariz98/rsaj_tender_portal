import type { NextRequest } from "next/server";

import { filenameFault } from "@/lib/documents/access";
import { limitBody } from "@/lib/documents/body";
import { RETRY_AFTER_SECONDS, uploadLimiter } from "@/lib/documents/concurrency";
import { documentFaultText } from "@/lib/documents/labels";
import { effectiveCap, readLimit, requestLengthFault, sizeFault } from "@/lib/documents/limits";
import { mediaFault, sniffMediaType, SNIFF_BYTES } from "@/lib/documents/media";
import { uploadRequestFault, UPLOAD_HEADER } from "@/lib/documents/request-guard";
import { documentOrg, loadStorePolicy, logAccess, storeUpload, UploadRefusal } from "@/lib/documents/service";
import { blobStore, deploymentCeiling, sha256Hex } from "@/lib/documents/store";
import type { Finding } from "@/lib/documents/types";

/**
 * Upload a file (plan §2, step 5): stored as a STAGED document's first version, or as
 * a new version of an existing document (`documentId`). Attaching it to a record is the
 * owner's act, which takes the returned `versionId`.
 *
 * Multipart form fields: `file`, `title`, `documentClassId`, `recordedByPersonId`,
 * optional `receivedOn` (YYYY-MM-DD), `note`, `documentId`.
 *
 * Refused before anything else, and never logged: a request that is not same-origin
 * or lacks the `X-Perolehan-Upload` header (CSRF, audit M-3). Refused before the body is read: an unset policy or ceiling, and a declared length
 * over the cap (413). A body with no length is counted as it arrives and cut off at the
 * same limit. Then the file's own size against the exact cap, its type sniffed from its
 * bytes against the allow-list and its declared name and type, and its SHA-256. One
 * transaction stores the bytes, the document, the version and the audit rows. Every
 * refusal is logged as a REFUSED access event with what was offered (never the bytes).
 */
export async function POST(req: NextRequest) {
  // First, before the organisation is read, a body is read or anything is logged: a
  // cross-site request writes nothing (audit M-3).
  const guard = uploadRequestFault({
    secFetchSite: req.headers.get("sec-fetch-site"),
    origin: req.headers.get("origin"),
    host: req.headers.get("host"),
    uploadHeader: req.headers.get(UPLOAD_HEADER),
  });
  if (guard) return refusal(403, { code: guard, level: "block" });

  // Then the cap on uploads in flight (audit C-1): a request over it is told to retry,
  // and is not an access event, since nothing was asked of the store.
  const slot = uploadLimiter().tryAcquire();
  if (!slot) return refusal(503, { code: "BUSY", level: "block" }, { "Retry-After": String(RETRY_AFTER_SECONDS) });
  try {
    return await upload(req);
  } finally {
    slot();
  }
}

async function upload(req: NextRequest) {
  const org = await documentOrg();
  if (!org) return refusal(503, { code: "NO_ORGANISATION", level: "block" });
  const declaredLength = req.headers.get("content-length");
  const offered = declaredLength && /^\d{1,20}$/.test(declaredLength.trim()) ? BigInt(declaredLength.trim()) : null;
  const refuse = async (status: number, f: Finding, extra: { filename?: string | null; bytes?: bigint | null } = {}) => {
    await logAccess({ organisationId: org.id, kind: "REFUSED", reasonCode: f.code, offeredFilename: extra.filename ?? null, offeredBytes: extra.bytes ?? offered });
    return refusal(status, f);
  };

  const s = blobStore();
  if ("fault" in s) return refuse(503, { code: s.fault, level: "block" });
  const policy = await loadStorePolicy(org.id);
  const ceiling = deploymentCeiling();
  const cap = effectiveCap(policy, ceiling);
  if ("fault" in cap) return refuse(422, { code: cap.fault, level: "block" });
  if (policy.allowedMediaTypes.length === 0) return refuse(422, { code: "TYPES_NOT_SET", level: "block" });
  const lengthFault = requestLengthFault(declaredLength, cap.cap);
  if (lengthFault === "TOO_LARGE") return refuse(413, { code: "TOO_LARGE", level: "block", data: { cap: cap.cap.toString(), from: cap.from } });
  if (lengthFault) return refuse(400, { code: lengthFault, level: "block" });

  // The body is parsed once, straight from the request stream through the bound: this
  // route never joins it into an array of its own or copies it into a Blob (audit C-1).
  const limited = limitBody(req.body, readLimit(cap.cap));
  let form: FormData | null;
  try {
    form = await new Response(limited.stream, { headers: { "content-type": req.headers.get("content-type") ?? "" } }).formData();
  } catch {
    if (limited.exceeded()) return refuse(413, { code: "TOO_LARGE", level: "block", data: { cap: cap.cap.toString(), from: cap.from } }, { bytes: limited.seen() });
    return refuse(400, { code: "REQUEST_UNREADABLE", level: "block" }, { bytes: limited.seen() });
  }
  const file = form.get("file");
  if (!(file instanceof File)) return refuse(400, { code: "NO_FILE", level: "block" });
  const fileName = file.name;
  const text = (k: string) => {
    const v = form!.get(k);
    return typeof v === "string" ? v.trim() : "";
  };
  const fields = {
    personId: text("recordedByPersonId"),
    title: text("title").slice(0, 300),
    documentClassId: text("documentClassId") || null,
    documentId: text("documentId") || null,
    receivedOn: text("receivedOn") || null,
    note: text("note").slice(0, 2000),
  };
  // Judged on the file's size and its first bytes, before the whole file is copied out.
  const size = BigInt(file.size);
  const at = { filename: fileName, bytes: size };
  const nameFault = filenameFault(fileName);
  if (nameFault) return refuse(422, nameFault, at);
  const tooBig = sizeFault(size, policy, ceiling);
  if (tooBig) return refuse(tooBig.code === "TOO_LARGE" ? 413 : 422, tooBig, at);
  const head = new Uint8Array(await file.slice(0, SNIFF_BYTES).arrayBuffer());
  const sniffed = sniffMediaType(head);
  const media = mediaFault(sniffed, { filename: fileName, contentType: file.type }, policy);
  if (media) return refuse(415, media, at);
  if (!fields.personId) return refuse(422, { code: "PERSON_REQUIRED", level: "block" }, at);
  // The one copy of the file this route makes; the parsed form is let go with it.
  const bytes = new Uint8Array(await file.arrayBuffer());
  form = null;
  try {
    const result = await storeUpload({
      org,
      store: s.store,
      bytes,
      sha256: sha256Hex(bytes),
      mediaType: sniffed!,
      originalFilename: fileName,
      title: fields.title,
      documentClassId: fields.documentClassId,
      documentId: fields.documentId,
      recordedByPersonId: fields.personId,
      receivedOn: fields.receivedOn,
      note: fields.note,
    });
    return Response.json(
      { ok: true, ...result, warnings: result.warnings.map((w) => ({ code: w.code, message: documentFaultText(w) })) },
      { status: 201, headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    if (e instanceof UploadRefusal) return refuse(e.status, e.finding, at);
    throw e;
  }
}

function refusal(status: number, f: Finding, headers: Record<string, string> = {}) {
  return Response.json({ ok: false, code: f.code, message: documentFaultText(f) }, { status, headers: { "Cache-Control": "no-store", ...headers } });
}

