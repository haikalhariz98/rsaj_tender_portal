import type { NextRequest } from "next/server";

import { readBounded } from "@/lib/documents/body";
import { documentFaultText } from "@/lib/documents/labels";
import { effectiveCap, readLimit, requestLengthFault, sizeFault } from "@/lib/documents/limits";
import { mediaFault, sniffMediaType, SNIFF_BYTES } from "@/lib/documents/media";
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
 * Refused before the body is read: an unset policy or ceiling, and a declared length
 * over the cap (413). A body with no length is counted as it arrives and cut off at the
 * same limit. Then the file's own size against the exact cap, its type sniffed from its
 * bytes against the allow-list and its declared name and type, and its SHA-256. One
 * transaction stores the bytes, the document, the version and the audit rows. Every
 * refusal is logged as a REFUSED access event with what was offered (never the bytes).
 */
export async function POST(req: NextRequest) {
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

  const read = await readBounded(req.body, readLimit(cap.cap));
  if (!read.ok) return read.reason === "TOO_LARGE" ? refuse(413, { code: "TOO_LARGE", level: "block", data: { cap: cap.cap.toString(), from: cap.from } }, { bytes: read.readBytes }) : refuse(400, { code: read.reason, level: "block" }, { bytes: read.readBytes });

  let form: FormData;
  try {
    form = await new Request(req.url, { method: "POST", headers: { "content-type": req.headers.get("content-type") ?? "" }, body: new Blob([new Uint8Array(read.bytes)]) }).formData();
  } catch {
    return refuse(400, { code: "REQUEST_UNREADABLE", level: "block" });
  }
  const file = form.get("file");
  if (!(file instanceof File)) return refuse(400, { code: "NO_FILE", level: "block" });
  const bytes = new Uint8Array(await file.arrayBuffer());
  const size = BigInt(bytes.byteLength);
  const at = { filename: file.name, bytes: size };
  const tooBig = sizeFault(size, policy, ceiling);
  if (tooBig) return refuse(tooBig.code === "TOO_LARGE" ? 413 : 422, tooBig, at);
  const sniffed = sniffMediaType(bytes.subarray(0, SNIFF_BYTES));
  const media = mediaFault(sniffed, { filename: file.name, contentType: file.type }, policy);
  if (media) return refuse(415, media, at);

  const text = (k: string) => {
    const v = form.get(k);
    return typeof v === "string" ? v.trim() : "";
  };
  const personId = text("recordedByPersonId");
  if (!personId) return refuse(422, { code: "PERSON_REQUIRED", level: "block" }, at);
  try {
    const result = await storeUpload({
      org,
      store: s.store,
      bytes,
      sha256: sha256Hex(bytes),
      mediaType: sniffed!,
      originalFilename: file.name,
      title: text("title").slice(0, 300),
      documentClassId: text("documentClassId") || null,
      documentId: text("documentId") || null,
      recordedByPersonId: personId,
      receivedOn: text("receivedOn") || null,
      note: text("note").slice(0, 2000),
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

function refusal(status: number, f: Finding) {
  return Response.json({ ok: false, code: f.code, message: documentFaultText(f) }, { status, headers: { "Cache-Control": "no-store" } });
}

