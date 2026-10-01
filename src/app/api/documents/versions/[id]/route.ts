import type { NextRequest } from "next/server";

import { dispositionFilename, downloadDecision, EXTENSION_FOR } from "@/lib/documents/access";
import { DOWNLOAD_REFUSAL_TEXT } from "@/lib/documents/labels";
import { documentOrg, logAccess } from "@/lib/documents/service";
import { blobStore, sha256Hex } from "@/lib/documents/store";

/**
 * Download one version (plan §2, §4). `downloadDecision` first: SULIT, unclassified and
 * threat-flagged versions are never served, and the refusal is logged. Then the bytes
 * are read through the façade and their SHA-256 recomputed; a mismatch (or missing
 * bytes) is logged as INTEGRITY_FAILED and refused with 500 (OD-9). What is served is
 * served as an attachment, never inline, with the stored (sniffed) type, `nosniff`, a
 * sandbox policy and no caching, and the download is logged. A withdrawn version is
 * still served: it is withdrawn, not deleted, and the drawer lists it as withdrawn.
 */
export async function GET(_req: NextRequest, ctx: RouteContext<"/api/documents/versions/[id]">) {
  const { id } = await ctx.params;
  const org = await documentOrg();
  if (!org) return plain(503, "No organisation is configured.");
  const { db } = await import("@/lib/db");
  const version = await db.documentVersion.findFirst({
    where: { id, organisationId: org.id },
    select: { id: true, sha256: true, byteSize: true, mediaType: true, originalFilename: true, scanState: true, document: { select: { classificationSnapshot: true } } },
  });
  if (!version) return plain(404, "No such document version.");

  const decision = downloadDecision({ classification: version.document.classificationSnapshot, scanState: version.scanState });
  if (!decision.allow) {
    await logAccess({ organisationId: org.id, kind: "REFUSED", reasonCode: decision.reason, versionId: version.id });
    return plain(403, DOWNLOAD_REFUSAL_TEXT[decision.reason]);
  }
  const s = blobStore();
  if ("fault" in s) {
    await logAccess({ organisationId: org.id, kind: "REFUSED", reasonCode: s.fault, versionId: version.id });
    return plain(503, "The deployment's document store is not configured. Whoever runs the portal sets DOCUMENT_STORE_DRIVER.");
  }
  const bytes = await s.store.get(org.id, version.sha256);
  if (!bytes || sha256Hex(bytes) !== version.sha256) {
    await logAccess({ organisationId: org.id, kind: "INTEGRITY_FAILED", reasonCode: bytes ? "DIGEST_MISMATCH" : "BYTES_MISSING", versionId: version.id });
    return plain(500, "The stored file does not match its fingerprint, so it is not served. This has been logged; report it to whoever runs the portal.");
  }
  await logAccess({ organisationId: org.id, kind: "DOWNLOADED", versionId: version.id });
  return new Response(new Uint8Array(bytes), {
    status: 200,
    headers: {
      "Content-Type": version.mediaType,
      "Content-Length": String(bytes.byteLength),
      "Content-Disposition": dispositionFilename(version.originalFilename, EXTENSION_FOR[version.mediaType] ?? "bin"),
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; sandbox",
      "Cache-Control": "private, no-store",
    },
  });
}

function plain(status: number, text: string) {
  return new Response(text, { status, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });
}
