import { dispositionFilename, downloadDecision, EXTENSION_FOR } from "@/lib/documents/access";
import { publicDownloadLimiter, RETRY_AFTER_SECONDS } from "@/lib/documents/concurrency";
import { logAccess } from "@/lib/documents/service";
import { releaseScanRefusal } from "@/lib/documents/release-scan";
import { blobStore, malwareScanner, runScan, sha256Hex } from "@/lib/documents/store";
import { liveAllowedByDeployment } from "@/lib/integration/sealing-deployment";
import { loadResultSchedule } from "@/lib/portal/repo";
import { DOWNLOAD_POLICY } from "@/lib/security-headers";

export const dynamic = "force-dynamic";

/**
 * The schedule of tenders for one result (go-live R4a): `GET /supplier/results/{id}/schedule`. No sign-in: the file is one the procurement office chose to publish, and
 * it is served only while all of this holds, asked again on every request. The exercise is a result (advertised, not confidential, an award issued: `toPublicResult`); a
 * schedule is attached, live and not withdrawn; its document is classified Public; it is not flagged as a threat. Anything else is the same 404, so the route does not say which.
 * The bytes are read through the store and their SHA-256 checked against the version's; a mismatch is logged and refused. Then the release scan (`releaseScanRefusal`) runs as on the supplier pack download. It takes a slot from its own limiter, not the signed-in downloads'. Served as an attachment with `nosniff`
 * and a sandbox policy, never cached. A HEAD is refused. A successful download writes nothing: the file is public and the route is open to anyone.
 */
export async function GET(_request: Request, ctx: RouteContext<"/supplier/results/[id]/schedule">) {
  const { id } = await ctx.params;
  const slot = publicDownloadLimiter().tryAcquire();
  if (!slot) return plain(503, "Busy. Try again in a few seconds.", { "Retry-After": String(RETRY_AFTER_SECONDS) });
  try {
    return await serve(id);
  } finally {
    slot();
  }
}

async function serve(id: string) {
  const found = await loadResultSchedule(id);
  if (!found) return plain(404, "Not found.");
  const v = found.schedule.version;
  const decision = downloadDecision({ classification: v.document.classificationSnapshot, scanState: v.scanState });
  // The rule above already excludes a threat; asked again here with the store's own decision, and anything but Public is refused whatever it says.
  if (!decision.allow || v.document.classificationSnapshot !== "PUBLIC") return plain(404, "Not found.");
  const s = blobStore();
  if ("fault" in s) return plain(503, "The file is not available now.");
  const bytes = await s.store.get(found.organisationId, v.sha256);
  if (!bytes || sha256Hex(bytes) !== v.sha256) {
    await logAccess({ organisationId: found.organisationId, kind: "INTEGRITY_FAILED", reasonCode: bytes ? "DIGEST_MISMATCH" : "BYTES_MISSING", versionId: v.id });
    return plain(500, "The file is not available now.");
  }
  // SEC-5, as on the supplier pack download: a fresh scan at release, after the bytes are proved. A refusal is the same 404 and is logged.
  const scanner = malwareScanner();
  const fresh = await runScan(scanner, bytes);
  const scanRefusal = releaseScanRefusal({ stored: v.scanState, fresh, scannerConfigured: scanner.configured, scannerRequired: liveAllowedByDeployment() });
  if (scanRefusal) {
    await logAccess({ organisationId: found.organisationId, kind: "REFUSED", reasonCode: scanRefusal, versionId: v.id });
    return plain(404, "Not found.");
  }
  return new Response(bytes as Uint8Array<ArrayBuffer>, {
    status: 200,
    headers: {
      "Content-Type": v.mediaType,
      "Content-Length": String(bytes.byteLength),
      "Content-Disposition": dispositionFilename(v.originalFilename, EXTENSION_FOR[v.mediaType] ?? "bin"),
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": DOWNLOAD_POLICY,
      "Cache-Control": "no-store",
    },
  });
}

export async function HEAD() {
  return new Response(null, { status: 405, headers: { Allow: "GET", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });
}

function plain(status: number, text: string, extra: Record<string, string> = {}) {
  return new Response(text, { status, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", ...extra } });
}
