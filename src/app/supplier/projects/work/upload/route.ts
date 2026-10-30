import { supplierUploadPost } from "../../../../_auth/supplier";
import type { SupplierActor } from "@/lib/auth/types";
import { filenameFault } from "@/lib/documents/access";
import { limitBodyPaced } from "@/lib/documents/body";
import { RETRY_AFTER_SECONDS, uploadLimiter } from "@/lib/documents/concurrency";
import { readLimit, requestLengthFault } from "@/lib/documents/limits";
import { mediaFault, recogniseFile } from "@/lib/documents/media";
import { logAccess, UploadRefusal } from "@/lib/documents/service";
import { STAGED_FOR_WORK_ITEM } from "@/lib/documents/staged-for";
import { sha256Hex } from "@/lib/documents/store";
import type { Finding } from "@/lib/documents/types";
import { PROJECT_BODY_DEADLINE_SECONDS, PROJECT_BODY_GRACE_SECONDS, PROJECT_BODY_MIN_BYTES_PER_SECOND } from "@/lib/project-docs/bounds";
import { parseUploadForm, parseUploadQuery } from "@/lib/project-docs/portal-api";
import { preflightProjectUpload, storeProjectFile, WindowRefused, windowRefusalOutcome, type PortalOutcome } from "@/lib/project-docs/portal-upload";
import { uploadFaultWords } from "@/lib/project-docs/upload-words";
import { unexpectedFailure } from "@/lib/unexpected-failure";

export const dynamic = "force-dynamic";

/**
 * A signed-in contractor stages one file for a work item (3b step 4, B-14): `POST /supplier/projects/work/upload?contractId=...`, multipart, one `file`. The same route as the
 * Project workspace's staging (`documents/upload`), with one difference: the file is staged `STAGED_FOR_WORK_ITEM` and the contract must be one that opens work (`WORK_ITEM`).
 * Staging takes no contract lock; the act that attaches or raises pins the file (`attachAsContractor`, `raiseAsContractor`). The account's window (60 files, 256 MiB an hour) is the
 * workspace's own, counting every file the account staged.
 *
 * Guarded in the portal's order and before a byte of the body is read: the public copy, the Origin guard (multipart only), the form token (in `x-form-token`), who is signed in.
 * Then the place in line (one of a few uploads at a time), the query (the contract, and a posted `kind` is refused 422: PW-23), the contract as this supplier holds it (another's
 * answers 404 and writes nothing), the supplier's standing, the contract's state, the settings (the project class, the file types and size), and the stated length held to the cap.
 * The body is then counted as it arrives, cut off at the cap, at the deadline and under the minimum rate. The type is the one the bytes say. The account's window is judged on its
 * own row, locked, in the transaction that stores the file (60 files and 256 MiB an hour, counting what was staged and never sent), and a refusal names the limit and when to try
 * again. Every file is "Not scanned": nothing scans. The answer is `{ versionId }`, which the act names.
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
  const query = parseUploadQuery(new URL(request.url).searchParams);
  if (!query.ok) return send({ status: query.status, body: { ok: false, code: query.code, message: query.message, errors: query.errors } });
  const { contractId } = query.value;

  const declared = request.headers.get("content-length");
  const offered = declared && /^\d{1,20}$/.test(declared.trim()) ? BigInt(declared.trim()) : null;
  // The account's window is judged here too, without a lock, on the stated length (PW-38): an account over it is answered 429 before the body is read.
  const pre = await preflightProjectUpload(actor, contractId, { declaredBytes: offered, act: "WORK_ITEM" });
  const log = (org: string, reasonCode: string, extra: { filename?: string | null; bytes?: bigint | null } = {}) =>
    logAccess({ organisationId: org, kind: "REFUSED", reasonCode, offeredFilename: extra.filename ?? null, offeredBytes: extra.bytes ?? offered, actor: { organisationId: org, supplierAccountId: actor.accountId, sessionId: actor.sessionId, sourceAddress: actor.sourceAddress } });
  if (!pre.ok) {
    // A contract that is not the supplier's writes nothing (the same answer as one that is not there); every other refusal is logged.
    if (pre.outcome.logReason && pre.outcome.logReason !== "NOT_FOUND") await log(actor.organisationId, pre.outcome.logReason);
    return send(pre.outcome);
  }
  const { org, store, classId, cap, capFrom, allowedTypes, ctx } = pre.value;
  const words = (f: Finding) => uploadFaultWords(f, { orgName: ctx.org.name, allowedTypes });
  const refuse = async (status: number, f: Finding, extra: { filename?: string | null; bytes?: bigint | null } = {}, code?: string) => {
    await log(org.id, f.code, extra);
    return send({ status, body: { ok: false, code: code ?? (f.code === "TOO_LARGE" ? "TOO_LARGE" : "REFUSED"), message: words(f) } });
  };

  if (declared == null || declared.trim() === "") {
    await log(org.id, "NO_LENGTH");
    return send({ status: 411, body: { ok: false, code: "NO_LENGTH", message: "The upload size was not stated. Try again." } });
  }
  const lengthFault = requestLengthFault(declared, cap);
  if (lengthFault) return refuse(lengthFault === "TOO_LARGE" ? 413 : 400, { code: lengthFault === "TOO_LARGE" ? "TOO_LARGE" : "REQUEST_UNREADABLE", level: "block", data: { cap: cap.toString(), from: capFrom } });

  // The body, counted as it arrives: cut off at the cap, at the deadline, and under the minimum rate.
  const limited = limitBodyPaced(request.body, readLimit(cap), { deadlineMs: PROJECT_BODY_DEADLINE_SECONDS * 1000, minBytesPerSecond: PROJECT_BODY_MIN_BYTES_PER_SECOND, graceMs: PROJECT_BODY_GRACE_SECONDS * 1000 });
  let form: FormData | null;
  try {
    form = await new Response(limited.stream, { headers: { "content-type": request.headers.get("content-type") ?? "" } }).formData();
  } catch {
    if (limited.tooSlow()) return refuse(408, { code: "BODY_TOO_SLOW", level: "block" }, { bytes: limited.seen() }, "BODY_TOO_SLOW");
    if (limited.exceeded()) return refuse(413, { code: "TOO_LARGE", level: "block", data: { cap: cap.toString(), from: capFrom } }, { bytes: limited.seen() });
    return refuse(400, { code: "REQUEST_UNREADABLE", level: "block" }, { bytes: limited.seen() });
  }
  const fields = parseUploadForm(form.entries(), contractId);
  form = null;
  if (!fields.ok) {
    await log(org.id, fields.code === "KIND_NOT_AVAILABLE" ? "KIND_POSTED" : "FIELDS_REFUSED");
    return send({ status: fields.status, body: { ok: false, code: fields.code, message: fields.message, errors: fields.errors } });
  }
  const file = fields.value.file;

  const size = BigInt(file.size);
  const at = { filename: file.name, bytes: size };
  const nameFault = filenameFault(file.name);
  if (nameFault) return refuse(422, nameFault, at);
  if (size === 0n) return refuse(422, { code: "EMPTY", level: "block" }, at);
  if (size > cap) return refuse(413, { code: "TOO_LARGE", level: "block", data: { cap: cap.toString(), from: capFrom } }, at);
  // The type is what the bytes say, never the name or the declared type; a file whose name or declared type disagrees is refused as well. Office files are staff-only.
  const recognised = await recogniseFile(file);
  const media = mediaFault(recognised.sniffed, { filename: file.name, contentType: file.type }, { allowedMediaTypes: allowedTypes, maxBytes: cap });
  if (media) return refuse(415, media, at);

  // The one copy of the file this route makes; the parsed form is let go with it.
  const bytes = new Uint8Array(await file.arrayBuffer());
  try {
    const stored = await storeProjectFile(actor, { org, store, classId, bytes, sha256: sha256Hex(bytes), mediaType: recognised.sniffed!, originalFilename: file.name, stagedFor: STAGED_FOR_WORK_ITEM });
    return send({ status: 201, body: { ok: true, versionId: stored.versionId, name: file.name, byteSize: stored.byteSize, scanState: "NOT_SCANNED" } });
  } catch (e) {
    if (e instanceof WindowRefused) {
      const outcome = windowRefusalOutcome(e, ctx.org.name);
      await log(org.id, outcome.logReason ?? "WINDOW", at);
      return send(outcome);
    }
    if (e instanceof UploadRefusal) return refuse(e.status, e.finding, at);
    return unexpectedFailure(e);
  }
}
