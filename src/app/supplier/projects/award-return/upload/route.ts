import { supplierUploadPost } from "../../../../_auth/supplier";
import type { SupplierActor } from "@/lib/auth/types";
import { parseReturnUploadForm, parseReturnUploadQuery } from "@/lib/award/online-return-api";
import { preflightReturnUpload, storeReturnFile } from "@/lib/award/return-upload";
import { filenameFault } from "@/lib/documents/access";
import { limitBodyPaced } from "@/lib/documents/body";
import { RETRY_AFTER_SECONDS, uploadLimiter } from "@/lib/documents/concurrency";
import { readLimit, requestLengthFault } from "@/lib/documents/limits";
import { mediaFault, recogniseFile } from "@/lib/documents/media";
import { logAccess, UploadRefusal } from "@/lib/documents/service";
import { sha256Hex } from "@/lib/documents/store";
import type { Finding } from "@/lib/documents/types";
import { PROJECT_BODY_DEADLINE_SECONDS, PROJECT_BODY_GRACE_SECONDS, PROJECT_BODY_MIN_BYTES_PER_SECOND } from "@/lib/project-docs/bounds";
import { WindowRefused, windowRefusalOutcome, type PortalOutcome } from "@/lib/project-docs/portal-upload";
import { uploadFaultWords } from "@/lib/project-docs/upload-words";
import { unexpectedFailure } from "@/lib/unexpected-failure";

export const dynamic = "force-dynamic";

/**
 * A signed-in contractor stages one wet-signed scan of its award return (ADR 0045 D1; Wave V, V3): `POST /supplier/projects/award-return/upload?contractId=...&scan=...`, multipart, one `file`.
 * The address names the contract and the scan so they are judged before a byte of the body is read (a form that names them must say the same). It follows the Project workspace's upload
 * step for step: the portal's guards (public copy, Origin guard, form token in `x-form-token`, who is signed in), the place in line, the preflight (the contract as this supplier holds it,
 * its standing, an issued award with no return waiting, a scan the instrument takes, the account may sign, the store, the SULIT class, the types and size, the window), the stated length
 * held to the cap, the body counted as it arrives, and the type the bytes say. No contract lock is held: the lodge pins the file later. The answer is `{ versionId }`.
 */
export async function POST(request: Request) {
  const guard = await supplierUploadPost(request, "projects");
  if (!guard.ok) return guard.response;
  const slot = uploadLimiter().tryAcquire();
  if (!slot) return send({ status: 503, body: { ok: false, code: "BUSY", message: "The portal is busy. Try again in a few seconds." }, headers: { "Retry-After": String(RETRY_AFTER_SECONDS) } });
  try {
    return await upload(guard.actor, request);
  } finally {
    slot();
  }
}

const send = (o: PortalOutcome) => Response.json(o.body, { status: o.status, headers: { "Cache-Control": "no-store", ...(o.headers ?? {}) } });

async function upload(actor: SupplierActor, request: Request) {
  const query = parseReturnUploadQuery(new URL(request.url).searchParams);
  if (!query.ok) return send({ status: query.status, body: { ok: false, code: query.code, message: query.message, errors: query.errors } });
  const { contractId, scan } = query.value;

  const declared = request.headers.get("content-length");
  const offered = declared && /^\d{1,20}$/.test(declared.trim()) ? BigInt(declared.trim()) : null;
  const pre = await preflightReturnUpload(actor, contractId, scan, { declaredBytes: offered });
  const log = (org: string, reasonCode: string, extra: { filename?: string | null; bytes?: bigint | null } = {}) =>
    logAccess({ organisationId: org, kind: "REFUSED", reasonCode, offeredFilename: extra.filename ?? null, offeredBytes: extra.bytes ?? offered, actor: { organisationId: org, supplierAccountId: actor.accountId, sessionId: actor.sessionId, sourceAddress: actor.sourceAddress } });
  if (!pre.ok) {
    // A contract that is not the supplier's writes nothing (the same answer as one that is not there); every other refusal is logged.
    if (pre.outcome.logReason && pre.outcome.logReason !== "NOT_FOUND" && pre.outcome.logReason !== "NO_ORGANISATION") await log(actor.organisationId, pre.outcome.logReason);
    return send(pre.outcome);
  }
  const { org, store, classId, cap, capFrom, allowedTypes, orgName } = pre.value;
  const refuse = async (status: number, f: Finding, extra: { filename?: string | null; bytes?: bigint | null } = {}, code?: string) => {
    await log(org.id, f.code, extra);
    return send({ status, body: { ok: false, code: code ?? (f.code === "TOO_LARGE" ? "TOO_LARGE" : "REFUSED"), message: uploadFaultWords(f, { orgName, allowedTypes }) } });
  };

  if (declared == null || declared.trim() === "") {
    await log(org.id, "NO_LENGTH");
    return send({ status: 411, body: { ok: false, code: "NO_LENGTH", message: "The upload size was not stated. Try again." } });
  }
  const lengthFault = requestLengthFault(declared, cap);
  if (lengthFault) return refuse(lengthFault === "TOO_LARGE" ? 413 : 400, { code: lengthFault === "TOO_LARGE" ? "TOO_LARGE" : "REQUEST_UNREADABLE", level: "block", data: { cap: cap.toString(), from: capFrom } });

  const limited = limitBodyPaced(request.body, readLimit(cap), { deadlineMs: PROJECT_BODY_DEADLINE_SECONDS * 1000, minBytesPerSecond: PROJECT_BODY_MIN_BYTES_PER_SECOND, graceMs: PROJECT_BODY_GRACE_SECONDS * 1000 });
  let form: FormData | null;
  try {
    form = await new Response(limited.stream, { headers: { "content-type": request.headers.get("content-type") ?? "" } }).formData();
  } catch {
    if (limited.tooSlow()) return refuse(408, { code: "BODY_TOO_SLOW", level: "block" }, { bytes: limited.seen() }, "BODY_TOO_SLOW");
    if (limited.exceeded()) return refuse(413, { code: "TOO_LARGE", level: "block", data: { cap: cap.toString(), from: capFrom } }, { bytes: limited.seen() });
    return refuse(400, { code: "REQUEST_UNREADABLE", level: "block" }, { bytes: limited.seen() });
  }
  const fields = parseReturnUploadForm(form.entries(), { contractId, scan });
  form = null;
  if (!fields.ok) {
    await log(org.id, "FIELDS_REFUSED");
    return send({ status: fields.status, body: { ok: false, code: fields.code, message: fields.message, errors: fields.errors } });
  }
  const file = fields.value.file;

  const at = { filename: file.name, bytes: BigInt(file.size) };
  const nameFault = filenameFault(file.name);
  if (nameFault) return refuse(422, nameFault, at);
  if (file.size === 0) return refuse(422, { code: "EMPTY", level: "block" }, at);
  if (at.bytes > cap) return refuse(413, { code: "TOO_LARGE", level: "block", data: { cap: cap.toString(), from: capFrom } }, at);
  // The type is what the bytes say, never the name or the declared type.
  const recognised = await recogniseFile(file);
  const media = mediaFault(recognised.sniffed, { filename: file.name, contentType: file.type }, { allowedMediaTypes: allowedTypes, maxBytes: cap });
  if (media) return refuse(415, media, at);

  const bytes = new Uint8Array(await file.arrayBuffer());
  try {
    const stored = await storeReturnFile(actor, { org, store, classId, bytes, sha256: sha256Hex(bytes), mediaType: recognised.sniffed!, originalFilename: file.name });
    return send({ status: 201, body: { ok: true, versionId: stored.versionId, name: file.name, bytes: Number(stored.byteSize) } });
  } catch (e) {
    if (e instanceof WindowRefused) {
      const outcome = windowRefusalOutcome(e, orgName);
      await log(org.id, outcome.logReason ?? "WINDOW", at);
      return send(outcome);
    }
    if (e instanceof UploadRefusal) return refuse(e.status, e.finding, at);
    return unexpectedFailure(e);
  }
}
