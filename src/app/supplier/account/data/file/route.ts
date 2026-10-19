import { supplierGet } from "../../../../_auth/supplier";
import { downloadLimiter, RETRY_AFTER_SECONDS } from "@/lib/documents/concurrency";
import { exportSupplierData } from "@/lib/portal/data-export-store";
import { DOWNLOAD_POLICY } from "@/lib/security-headers";

export const dynamic = "force-dynamic";

/**
 * A signed-in supplier downloads its own data as one JSON file (N2, the PDPA right of access, ruling 1875(8)): `GET /supplier/account/data/file`. The portal's guard comes first (the copy, a
 * request no other site started, the page's signed token in `t`, who is signed in). The supplier is the session's and no id is read. The store builds the file, writes one export row and its
 * audit row in one transaction, and stores the SHA-256 of the file's bytes; the bytes sent are exactly those. Served as an attachment with `nosniff` and a sandbox policy, never cached.
 * A HEAD is refused: it would record an export nobody received. No standing gate: the export is a read (ruling 1875(3)).
 */
export async function GET(request: Request) {
  const guard = await supplierGet(request, "data-export");
  if (!guard.ok) return guard.response;
  // A technical bound on exports in flight (audit C-1): each is a long transaction. Over it, 503 with Retry-After, and nothing is written.
  const slot = downloadLimiter().tryAcquire();
  if (!slot) return new Response("Busy", { status: 503, headers: { "Content-Type": "text/plain; charset=utf-8", "Retry-After": String(RETRY_AFTER_SECONDS), "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });
  let out;
  try {
    out = await exportSupplierData(guard.actor, "FILE");
  } finally {
    slot();
  }
  if (!out) return new Response("Not found", { status: 404, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });
  const bytes = Buffer.from(out.json, "utf8");
  // The store hashed `json` as UTF-8 for the row; the same bytes are sent here.
  return new Response(bytes, {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Length": String(bytes.byteLength),
      "Content-Disposition": `attachment; filename="${out.fileName}"`,
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": DOWNLOAD_POLICY,
      "Cache-Control": "no-store",
    },
  });
}

export async function HEAD() {
  return new Response(null, { status: 405, headers: { Allow: "GET", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });
}
