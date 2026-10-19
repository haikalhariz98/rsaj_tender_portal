import { supplierGet } from "../../../_auth/supplier";
import { creditorEventRow, OWN_RECORD, writeSupplierSulitEvent } from "@/lib/auth/creditor-access-store";
import { db } from "@/lib/db";
import { dispositionFilename, EXTENSION_FOR } from "@/lib/documents/access";
import { downloadLimiter, RETRY_AFTER_SECONDS } from "@/lib/documents/concurrency";
import { documentOrg, logAccess } from "@/lib/documents/service";
import { blobStore, sha256Hex } from "@/lib/documents/store";
import { findOwnVersion } from "@/lib/portal/registration/own-file-store";
import { DOWNLOAD_POLICY } from "@/lib/security-headers";

export const dynamic = "force-dynamic";

/**
 * A signed-in supplier opens one of its own files (Phase 4b, B6): `GET /supplier/registration/file?id=<version>`. Only a file that hangs on the supplier's own draft, bank details or
 * documents is served, and anything else, another supplier's included, is 404. It is served as an attachment, never inline, with the stored (sniffed) type, `nosniff`, a sandbox policy and
 * no caching. The bytes are read through the façade and their SHA-256 recomputed; a mismatch is logged and refused. Every download is logged with the supplier's account as the actor, and
 * a bank statement's is logged as the supplier's own reading of its creditor profile as well. HEAD is refused: no read, no log entry.
 */
export async function GET(request: Request) {
  const guard = await supplierGet(request, "registration");
  if (!guard.ok) return guard.response;
  const { actor } = guard;
  const id = new URL(request.url).searchParams.get("id") ?? "";
  if (!/^[A-Za-z0-9_-]{8,40}$/.test(id)) return plain(404, "No such file.");

  const slot = downloadLimiter().tryAcquire();
  if (!slot) return plain(503, "The portal is busy. Try again in a few seconds.", { "Retry-After": String(RETRY_AFTER_SECONDS) });
  try {
    const org = await documentOrg(actor.organisationId);
    if (!org) return plain(503, "The portal is not set up.");
    const version = await findOwnVersion(db, actor, id);
    if (!version) return plain(404, "No such file.");
    const as = { organisationId: org.id, supplierAccountId: actor.accountId, sessionId: actor.sessionId, sourceAddress: actor.sourceAddress };
    const s = blobStore();
    if ("fault" in s) {
      await logAccess({ organisationId: org.id, kind: "REFUSED", reasonCode: s.fault, versionId: version.id, actor: as });
      return plain(503, "The portal's document store is not set up. Tell the procurement office.");
    }
    const bytes = await s.store.get(org.id, version.sha256);
    if (!bytes || sha256Hex(bytes) !== version.sha256) {
      await logAccess({ organisationId: org.id, kind: "INTEGRITY_FAILED", reasonCode: bytes ? "DIGEST_MISMATCH" : "BYTES_MISSING", versionId: version.id, actor: as });
      return plain(500, "The stored file does not match its fingerprint. Logged. Tell the procurement office.");
    }
    // Everything that can fail is built before the download is logged, so that no entry says a file was downloaded for a response that was not sent.
    const response = new Response(bytes as Uint8Array<ArrayBuffer>, {
      status: 200,
      headers: {
        "Content-Type": version.mediaType,
        "Content-Length": String(bytes.byteLength),
        "Content-Disposition": dispositionFilename(version.originalFilename, EXTENSION_FOR[version.mediaType] ?? "bin"),
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": DOWNLOAD_POLICY,
        "Cache-Control": "private, no-store",
      },
    });
    await logAccess({ organisationId: org.id, kind: "DOWNLOADED", versionId: version.id, actor: as });
    if (version.creditorProfileId) await writeSupplierSulitEvent(db, actor, creditorEventRow({ id: version.creditorProfileId, label: "Creditor's profile" }, ["documentBytes"], OWN_RECORD));
    return response;
  } finally {
    slot();
  }
}

export async function HEAD() {
  return new Response(null, { status: 405, headers: { Allow: "GET", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });
}

function plain(status: number, text: string, extra: Record<string, string> = {}) {
  return new Response(text, { status, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", ...extra } });
}
