import type { SupplierActor } from "@/lib/auth/types";
import { db } from "@/lib/db";
import { filenameFault } from "@/lib/documents/access";
import { limitBody } from "@/lib/documents/body";
import { readLimit, requestLengthFault } from "@/lib/documents/limits";
import { mediaFault, sniffMediaType, SNIFF_BYTES } from "@/lib/documents/media";
import { documentOrg, logAccess, type DocumentOrg } from "@/lib/documents/service";
import { blobStore, sha256Hex, type BlobStore } from "@/lib/documents/store";
import type { Finding as StoreFinding } from "@/lib/documents/types";
import { loadRegistrationSettings } from "@/lib/portal/registration/context-store";
import { uploadFault, uploadSettingFault, type UploadFault, type UploadKind, type UploadPolicy, type UploadStore } from "@/lib/portal/registration/upload";
import { loadUploadSettings } from "@/lib/portal/registration/upload-settings";
import { uploadFaultText } from "@/lib/portal/registration/words";
import type { Finding } from "@/lib/suppliers/types";

/**
 * The Company workspace's multipart request, read the way the registration's upload reads one (Phase 4b, B6), shared by its two uploads (a replacement document, a change of bank
 * details): before a byte of the body is read, the settings (the store and the file types and size, the class this kind of upload takes, the quota) must be set and a length stated and within
 * the cap; the body is then counted as it arrives and cut off at the same limit; the file's type is what its own bytes say, never its name or declared type. Every refusal is written to
 * the document access log and answered in plain words. The quota is judged again on the locked rows in the act's own transaction. The guard (the copy, the Origin check, the form token,
 * who is signed in) has run before this.
 */

const reply = (body: Record<string, unknown>, status = 200, headers: Record<string, string> = {}) => Response.json(body, { status, headers: { "Cache-Control": "no-store", ...headers } });

export interface UploadRequest {
  org: DocumentOrg;
  store: BlobStore;
  storeSettings: UploadStore;
  policy: UploadPolicy;
  form: FormData;
  file: File;
  /// The one copy of the file's bytes, its digest and the type its own bytes say.
  bytes: Uint8Array;
  sha256: string;
  mediaType: string;
  /// A text field of the form, trimmed.
  text: (name: string) => string;
}

export async function readUpload(actor: SupplierActor, request: Request, kind: UploadKind): Promise<{ ok: true; upload: UploadRequest } | { ok: false; response: Response }> {
  const org = await documentOrg(actor.organisationId);
  if (!org) return { ok: false, response: reply({ ok: false, code: "CLOSED", message: "The portal is not set up." }, 503) };
  const declared = request.headers.get("content-length");
  const offered = declared && /^\d{1,20}$/.test(declared.trim()) ? BigInt(declared.trim()) : null;
  const log = (reasonCode: string, extra: { filename?: string | null; bytes?: bigint | null } = {}) =>
    logAccess({ organisationId: org.id, kind: "REFUSED", reasonCode, offeredFilename: extra.filename ?? null, offeredBytes: extra.bytes ?? offered, actor: { organisationId: org.id, supplierAccountId: actor.accountId, sessionId: actor.sessionId, sourceAddress: actor.sourceAddress } });
  const refuse = async (status: number, f: Finding<UploadFault>, extra: { filename?: string | null; bytes?: bigint | null } = {}) => {
    await log(f.code, extra);
    const words = uploadFaultText(f, kind);
    return { ok: false as const, response: reply({ ok: false, code: f.code === "TOO_LARGE" ? "TOO_LARGE" : "REFUSED", message: words.en, messageMs: words.ms }, status) };
  };

  const s = blobStore();
  if ("fault" in s) {
    await log(s.fault);
    return { ok: false, response: reply({ ok: false, code: "CLOSED", message: "Uploads are closed: the portal's document store is not set up. Tell the procurement office." }, 503) };
  }
  const settings = await loadRegistrationSettings(db, actor.organisationId);
  if (!settings) return { ok: false, response: reply({ ok: false, code: "CLOSED", message: "The portal is not set up." }, 503) };
  const loaded = await loadUploadSettings(db, actor.organisationId, settings);
  const storeSettings = loaded.store;
  const policy = kind === "statement" ? loaded.statement : loaded.document;
  const unset = uploadSettingFault(storeSettings, policy, kind);
  if (unset) return refuse(422, unset);
  if (declared == null || declared.trim() === "") return { ok: false, response: reply({ ok: false, code: "NO_LENGTH", message: "The upload did not say how large it is, so it was not read." }, 411) };
  const lengthFault = requestLengthFault(declared, storeSettings.capBytes!);
  if (lengthFault) return refuse(lengthFault === "TOO_LARGE" ? 413 : 400, { code: "TOO_LARGE", level: "block" }, { bytes: offered });

  const limited = limitBody(request.body, readLimit(storeSettings.capBytes!));
  let form: FormData;
  try {
    form = await new Response(limited.stream, { headers: { "content-type": request.headers.get("content-type") ?? "" } }).formData();
  } catch {
    if (limited.exceeded()) return refuse(413, { code: "TOO_LARGE", level: "block" }, { bytes: limited.seen() });
    return { ok: false, response: reply({ ok: false, code: "VALIDATION", message: "That upload could not be read." }, 400) };
  }
  const file = form.get("file");
  if (!(file instanceof File)) return { ok: false, response: reply({ ok: false, code: "VALIDATION", message: "No file came with the upload." }, 400) };
  const text = (k: string) => {
    const v = form.get(k);
    return typeof v === "string" ? v.trim() : "";
  };
  const size = BigInt(file.size);
  const at = { filename: file.name, bytes: size };
  const nameFault = filenameFault(file.name);
  if (nameFault) return refuse(422, { code: "TYPE_NOT_ALLOWED", level: "block" }, at);
  const head = new Uint8Array(await file.slice(0, SNIFF_BYTES).arrayBuffer());
  const sniffed = sniffMediaType(head);
  // The type is what the bytes say. A file whose name or declared type disagrees with them is refused as well: a disguise or a mistake, and neither is filed.
  const disagrees = mediaFault(sniffed, { filename: file.name, contentType: file.type }, { allowedMediaTypes: [...storeSettings.allowedTypes], maxBytes: storeSettings.capBytes });
  const fault = disagrees ? ({ code: "TYPE_NOT_ALLOWED", level: "block" } as Finding<UploadFault>) : uploadFault({ size, sniffedType: sniffed }, storeSettings, policy, { files: 0, bytes: 0n }, kind);
  // (the quota is judged on the locked rows in the act's transaction: the usage here is nothing, so only the file's own faults can come from this call)
  if (fault && fault.code !== "QUOTA_FILES" && fault.code !== "QUOTA_BYTES") return refuse(fault.code === "TOO_LARGE" ? 413 : 415, fault, at);

  // The one copy of the file this request makes.
  const bytes = new Uint8Array(await file.arrayBuffer());
  return { ok: true, upload: { org, store: s.store, storeSettings, policy, form, file, bytes, sha256: sha256Hex(bytes), mediaType: sniffed!, text } };
}

/// The words for a refusal the document store itself gave (the class is gone, the quota is full), as an answer.
export function storeRefusalReply(finding: StoreFinding, status: number, kind: UploadKind): Response {
  const asFault = finding as unknown as Finding<UploadFault>;
  const words = uploadFaultText(asFault, kind);
  return reply({ ok: false, code: finding.code === "TOO_LARGE" ? "TOO_LARGE" : "REFUSED", message: words.en, messageMs: words.ms }, status);
}
