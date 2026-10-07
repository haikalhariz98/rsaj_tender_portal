import type { NextRequest } from "next/server";
import { staffRoute } from "@/app/_auth/route";

import { dispositionFilename, downloadDecision, EXTENSION_FOR } from "@/lib/documents/access";
import { DOWNLOAD_REFUSAL_TEXT } from "@/lib/documents/labels";
import { documentOrg, logAccess } from "@/lib/documents/service";
import { downloadLimiter, RETRY_AFTER_SECONDS } from "@/lib/documents/concurrency";
import { downloadRequestFault } from "@/lib/documents/request-guard";
import { DOWNLOAD_POLICY } from "@/lib/security-headers";
import { blobStore, sha256Hex } from "@/lib/documents/store";
import type { OrgScope } from "@/lib/org-scope";

/**
 * Download one version (plan §2, §4). `downloadDecision` first: SULIT, unclassified and
 * threat-flagged versions are never served, and the refusal is logged. Then the bytes
 * are read through the façade and their SHA-256 recomputed; a mismatch (or missing
 * bytes) is logged as INTEGRITY_FAILED and refused with 500 (OD-9). What is served is
 * served as an attachment, never inline, with the stored (sniffed) type, `nosniff`, a
 * sandbox policy and no caching, and the download is logged. A withdrawn version is
 * still served: it is withdrawn, not deleted, and the drawer lists it as withdrawn.
 */
export async function GET(req: NextRequest, ctx: RouteContext<"/api/documents/versions/[id]">) {
  const guard = await staffRoute();
  if (!guard.ok) return guard.response;
  const scope = guard.actor;
  // Before anything is read or logged: a download another site started writes nothing (audit C-2).
  if (downloadRequestFault(req.headers.get("sec-fetch-site"))) return plain(403, "This file is opened from the portal's own pages. Open the portal and download it from there.");
  // The cap on downloads in flight (audit C-1): each holds a whole file in memory. Over it,
  // 503 with Retry-After, and no access event: nothing was asked of the store.
  const slot = downloadLimiter().tryAcquire();
  if (!slot) return busy();
  try {
    return await download(scope, ctx);
  } finally {
    slot();
  }
}

async function download(scope: OrgScope, ctx: RouteContext<"/api/documents/versions/[id]">) {
  const { id } = await ctx.params;
  const org = await documentOrg(scope.organisationId);
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
  // Everything that can fail is built before the download is logged: an entry saying a
  // file was downloaded must never be written for a response that was not sent (audit M-2).
  let response: Response;
  try {
    // The array the store returned, not a copy of it. The Postgres driver returns the
    // database driver's own ArrayBuffer-backed Buffer.
    response = new Response(bytes as Uint8Array<ArrayBuffer>, {
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
  } catch {
    return plain(500, "The file could not be prepared for download, so it was not served and no download was logged. Report it to whoever runs the portal.");
  }
  await logAccess({ organisationId: org.id, kind: "DOWNLOADED", versionId: version.id });
  return response;
}

/**
 * Next answers HEAD with the GET handler when none is exported, which would read the
 * bytes and log a download for a request that sends none. HEAD is refused outright:
 * no database read, no bytes, no log entry (audit C-2).
 */
export async function HEAD() {
  return new Response(null, { status: 405, headers: { Allow: "GET", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });
}

function busy() {
  return plain(503, "The portal is busy with other files. Nothing was logged. Wait a few seconds and try again.", { "Retry-After": String(RETRY_AFTER_SECONDS) });
}

function plain(status: number, text: string, extra: Record<string, string> = {}) {
  return new Response(text, { status, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", ...extra } });
}
