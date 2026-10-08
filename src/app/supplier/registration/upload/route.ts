import { supplierUploadPost } from "../../../_auth/supplier";
import type { SupplierActor } from "@/lib/auth/types";
import { db } from "@/lib/db";
import { filenameFault } from "@/lib/documents/access";
import { limitBody } from "@/lib/documents/body";
import { RETRY_AFTER_SECONDS, uploadLimiter } from "@/lib/documents/concurrency";
import { readLimit, requestLengthFault } from "@/lib/documents/limits";
import { mediaFault, sniffMediaType, SNIFF_BYTES } from "@/lib/documents/media";
import { documentOrg, logAccess, UploadRefusal } from "@/lib/documents/service";
import { blobStore, sha256Hex } from "@/lib/documents/store";
import type { Finding as StoreFinding } from "@/lib/documents/types";
import { loadRegistrationSettings } from "@/lib/portal/registration/context-store";
import { DraftRefused } from "@/lib/portal/registration/draft-store";
import { loadUploadSettings } from "@/lib/portal/registration/upload-settings";
import { uploadFault, uploadSettingFault, type UploadFault, type UploadKind, type UploadPolicy, type UploadStore } from "@/lib/portal/registration/upload";
import { storeSupplierUpload, type UploadTarget } from "@/lib/portal/registration/upload-store";
import { uploadFaultText } from "@/lib/portal/registration/words";
import type { Finding } from "@/lib/suppliers/types";

import { refusalReply, reply } from "../reply";

export const dynamic = "force-dynamic";

/**
 * A signed-in supplier uploads a file to its registration (Phase 4b, B6): `POST /supplier/registration/upload?kind=document|statement`, multipart.
 *
 * Guarded in the portal's order and before a byte of the body is read: the public copy, the Origin guard (multipart only), the form token (in `x-form-token`), who is signed in. Then,
 * before the body is read, the settings: a request with no stated length is refused (411), the file types and size, the class this kind of upload takes, and the quota must all be set
 * (unset refuses, naming the setting), and the stated length is held to the cap. The body is then counted as it is read and cut off at the same limit. The type is read from the file's own
 * bytes, never from its name or declared type. The quota is judged again on the locked draft in the transaction that stores the file, so two uploads that arrive together cannot both
 * pass it. The answer is the same whether or not the organisation already holds the same bytes (threat model C-6). Every file is "Not scanned": nothing scans.
 *
 * Form fields: `file`, `version` (the draft's version the page last saw), and for a certificate `documentId` (a row of the supplier's own draft) or `typeId` with an optional `title`.
 */
export async function POST(request: Request) {
  const guard = await supplierUploadPost(request, "registration");
  if (!guard.ok) return guard.response;
  const slot = uploadLimiter().tryAcquire();
  if (!slot) return reply({ ok: false, code: "BUSY", message: "The portal is busy with other files. Wait a few seconds and try again." }, 503, { "Retry-After": String(RETRY_AFTER_SECONDS) });
  try {
    return await upload(guard.actor, request);
  } finally {
    slot();
  }
}

async function upload(actor: SupplierActor, request: Request) {
  const kindParam = new URL(request.url).searchParams.get("kind");
  const kind: UploadKind | null = kindParam === "document" || kindParam === "statement" ? kindParam : null;
  if (!kind) return reply({ ok: false, code: "VALIDATION", message: "Say what is being uploaded." }, 400);
  const org = await documentOrg(actor.organisationId);
  if (!org) return reply({ ok: false, code: "CLOSED", message: "The portal is not set up." }, 503);

  const declared = request.headers.get("content-length");
  const offered = declared && /^\d{1,20}$/.test(declared.trim()) ? BigInt(declared.trim()) : null;
  const log = (reasonCode: string, extra: { filename?: string | null; bytes?: bigint | null } = {}) =>
    logAccess({ organisationId: org.id, kind: "REFUSED", reasonCode, offeredFilename: extra.filename ?? null, offeredBytes: extra.bytes ?? offered, actor: { organisationId: org.id, supplierAccountId: actor.accountId, sessionId: actor.sessionId, sourceAddress: actor.sourceAddress } });
  const refuse = async (status: number, f: Finding<UploadFault>, extra: { filename?: string | null; bytes?: bigint | null } = {}) => {
    await log(f.code, extra);
    return reply({ ok: false, code: f.code === "TOO_LARGE" ? "TOO_LARGE" : "REFUSED", message: uploadFaultText(f, kind).en, messageMs: uploadFaultText(f, kind).ms }, status);
  };

  // Before the body is read: the store, the settings, the stated length.
  const s = blobStore();
  if ("fault" in s) {
    await log(s.fault);
    return reply({ ok: false, code: "CLOSED", message: "Uploads are closed: the portal's document store is not set up. Tell the procurement office." }, 503);
  }
  const settings = await loadRegistrationSettings(db, actor.organisationId);
  if (!settings) return reply({ ok: false, code: "CLOSED", message: "The portal is not set up." }, 503);
  // The one reader of what an upload is judged by, which the page also asks to say whether uploads are open.
  const loaded = await loadUploadSettings(db, actor.organisationId, settings);
  const storeSettings: UploadStore = loaded.store;
  const policy: UploadPolicy = kind === "statement" ? loaded.statement : loaded.document;
  const unset = uploadSettingFault(storeSettings, policy, kind);
  if (unset) return refuse(422, unset);
  if (declared == null || declared.trim() === "") return reply({ ok: false, code: "NO_LENGTH", message: "The upload did not say how large it is, so it was not read." }, 411);
  const lengthFault = requestLengthFault(declared, storeSettings.capBytes!);
  if (lengthFault) return refuse(lengthFault === "TOO_LARGE" ? 413 : 400, { code: "TOO_LARGE", level: "block" }, { bytes: offered });

  // The body, counted as it arrives and cut off at the same limit.
  const limited = limitBody(request.body, readLimit(storeSettings.capBytes!));
  let form: FormData | null;
  try {
    form = await new Response(limited.stream, { headers: { "content-type": request.headers.get("content-type") ?? "" } }).formData();
  } catch {
    if (limited.exceeded()) return refuse(413, { code: "TOO_LARGE", level: "block" }, { bytes: limited.seen() });
    return reply({ ok: false, code: "VALIDATION", message: "That upload could not be read." }, 400);
  }
  const file = form.get("file");
  if (!(file instanceof File)) return reply({ ok: false, code: "VALIDATION", message: "No file came with the upload." }, 400);
  const text = (k: string) => {
    const v = form!.get(k);
    return typeof v === "string" ? v.trim() : "";
  };
  const version = Number(text("version"));
  if (!Number.isInteger(version) || version < 0 || version > 1_000_000_000) return reply({ ok: false, code: "VALIDATION", message: "The page did not say which version of the draft it was showing." }, 400);
  const target: UploadTarget = kind === "statement" ? { kind: "statement" } : { kind: "document", documentId: text("documentId") || null, typeId: text("typeId") || null, title: text("title").slice(0, 120) };

  const size = BigInt(file.size);
  const at = { filename: file.name, bytes: size };
  const nameFault = filenameFault(file.name);
  if (nameFault) return refuse(422, { code: "TYPE_NOT_ALLOWED", level: "block" }, at);
  const head = new Uint8Array(await file.slice(0, SNIFF_BYTES).arrayBuffer());
  const sniffed = sniffMediaType(head);
  // The type is what the bytes say. A file whose name or declared type disagrees with them is refused as well: a disguise or a mistake, and neither is filed.
  const disagrees = mediaFault(sniffed, { filename: file.name, contentType: file.type }, { allowedMediaTypes: [...storeSettings.allowedTypes], maxBytes: storeSettings.capBytes });
  const fault = disagrees ? ({ code: "TYPE_NOT_ALLOWED", level: "block" } as Finding<UploadFault>) : uploadFault({ size, sniffedType: sniffed }, storeSettings, policy, { files: 0, bytes: 0n }, kind);
  // (the quota is judged on the locked draft below: the usage here is nothing, so only the file's own faults can come from this call)
  if (fault && fault.code !== "QUOTA_FILES" && fault.code !== "QUOTA_BYTES") return refuse(fault.code === "TOO_LARGE" ? 413 : 415, fault, at);

  // The one copy of the file this route makes; the parsed form is let go with it.
  const bytes = new Uint8Array(await file.arrayBuffer());
  form = null;
  try {
    const stored = await storeSupplierUpload(actor, {
      version,
      target,
      bytes,
      sha256: sha256Hex(bytes),
      mediaType: sniffed!,
      originalFilename: file.name,
      org,
      store: s.store,
      storeSettings,
      policy,
    });
    return reply({ ok: true, versionId: stored.versionId, rowId: stored.rowId, label: stored.label, byteSize: stored.byteSize, scanState: stored.scanState, version: stored.version }, 201);
  } catch (e) {
    if (e instanceof UploadRefusal) {
      const f = e.finding as StoreFinding;
      await log(f.code, at);
      const asFault = f as unknown as Finding<UploadFault>;
      return reply({ ok: false, code: f.code === "TOO_LARGE" ? "TOO_LARGE" : "REFUSED", message: uploadFaultText(asFault, kind).en, messageMs: uploadFaultText(asFault, kind).ms }, e.status);
    }
    const refused = e instanceof DraftRefused ? refusalReply(e) : null;
    if (refused) return refused;
    throw e;
  }
}
