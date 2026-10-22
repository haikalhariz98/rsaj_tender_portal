import { supplierGet } from "../../../../../_auth/supplier";
import { db } from "@/lib/db";
import { dispositionFilename, EXTENSION_FOR } from "@/lib/documents/access";
import { downloadLimiter, RETRY_AFTER_SECONDS } from "@/lib/documents/concurrency";
import { documentOrg, logAccess } from "@/lib/documents/service";
import { blobStore, sha256Hex } from "@/lib/documents/store";
import { findProjectFile } from "@/lib/project-docs/portal-file";
import { DOWNLOAD_POLICY } from "@/lib/security-headers";

export const dynamic = "force-dynamic";

/**
 * A signed-in contractor downloads one file of a Project workspace document (plan step 5, §6; PW-8, PW-14): `GET /supplier/projects/documents/file/[attachmentId]`. The portal's guard
 * comes first (the copy, a request no other site started, the page's signed token in `t`, who is signed in). The supplier is the session's and no supplier is read from the request.
 *
 * Another contractor's file, a missing one, another organisation's, and a file of an organisation version still waiting for its approvers are all the same 404. The classification
 * is judged now: a class raised to SULIT (or left unclassified) after the upload is refused 403. Every refusal of a file that exists, and every download, is logged with the
 * supplier's account as the actor (the contractor never sees the log). The bytes are read through the façade and their SHA-256 recomputed. Served as an attachment, never inline,
 * with the stored (sniffed) type, `nosniff`, a sandbox policy and no caching; the page beside it says "Not scanned". HEAD is refused: no read, no log entry.
 */
export async function GET(request: Request, ctx: RouteContext<"/supplier/projects/documents/file/[attachmentId]">) {
  const guard = await supplierGet(request, "projects");
  if (!guard.ok) return guard.response;
  const { actor } = guard;
  const { attachmentId } = await ctx.params;

  const slot = downloadLimiter().tryAcquire();
  if (!slot) return plain(503, "The portal is busy. Try again in a few seconds.", { "Retry-After": String(RETRY_AFTER_SECONDS) });
  try {
    const org = await documentOrg(actor.organisationId);
    if (!org) return plain(503, "The portal is not set up.");
    const as = { organisationId: org.id, supplierAccountId: actor.accountId, sessionId: actor.sessionId, sourceAddress: actor.sourceAddress };
    const found = await findProjectFile(db, actor, attachmentId);
    if (!found.ok) {
      if (found.log) await logAccess({ organisationId: org.id, kind: "REFUSED", reasonCode: found.log.reason, versionId: found.log.versionId, actor: as });
      return found.status === 403 ? plain(403, "This file can no longer be downloaded from the portal. Ask the procurement office.") : plain(404, "No such file.");
    }
    const { file } = found;
    const s = blobStore();
    if ("fault" in s) {
      await logAccess({ organisationId: org.id, kind: "REFUSED", reasonCode: s.fault, versionId: file.versionId, actor: as });
      return plain(503, "The portal's document store is not set up. Tell the procurement office.");
    }
    const bytes = await s.store.get(org.id, file.sha256);
    if (!bytes || sha256Hex(bytes) !== file.sha256) {
      await logAccess({ organisationId: org.id, kind: "INTEGRITY_FAILED", reasonCode: bytes ? "DIGEST_MISMATCH" : "BYTES_MISSING", versionId: file.versionId, actor: as });
      return plain(500, "The stored file does not match its fingerprint. Logged. Tell the procurement office.");
    }
    // Everything that can fail is built before the download is logged, so that no entry says a file was downloaded for a response that was not sent.
    const response = new Response(bytes as Uint8Array<ArrayBuffer>, {
      status: 200,
      headers: {
        "Content-Type": file.mediaType,
        "Content-Length": String(bytes.byteLength),
        "Content-Disposition": dispositionFilename(file.originalFilename, EXTENSION_FOR[file.mediaType] ?? "bin"),
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": DOWNLOAD_POLICY,
        "Cache-Control": "private, no-store",
      },
    });
    await logAccess({ organisationId: org.id, kind: "DOWNLOADED", versionId: file.versionId, actor: as });
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
