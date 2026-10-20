import { supplierGet } from "../../../../_auth/supplier";
import { downloadLimiter, RETRY_AFTER_SECONDS } from "@/lib/documents/concurrency";
import { prepareDownload } from "@/lib/portal/bids/download-store";
import { DOWNLOAD_POLICY } from "@/lib/security-headers";

export const dynamic = "force-dynamic";

const plain = (status: number, text: string, extra: Record<string, string> = {}) => new Response(text, { status, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", ...extra } });

/**
 * A file or a merged text of the released documents, to the supplier whose purchase is released (SR-10, ruling 17): `GET /supplier/bids/[id]/download?file=<version id>` or `?text=<part>.<language>`.
 * The portal's guard comes first (the copy, a request no other site started, the page's signed token in `t`, who is signed in). The supplier is the session's, and the release is judged on this request by the rule that opens the documents on screen; only what the approved pack names is served. Served as an attachment, never inline,
 * with `nosniff` and a sandbox policy. Each download is logged once the response is built (`commit`); a repeat within minutes is not logged again, and an account may ask only so often (429). A HEAD is refused: it would log a download nobody made.
 */
export async function GET(request: Request, ctx: RouteContext<"/supplier/bids/[id]/download">) {
  const guard = await supplierGet(request, "bids");
  if (!guard.ok) return guard.response;
  const { id } = await ctx.params;
  const url = new URL(request.url);
  const file = url.searchParams.get("file");
  const text = url.searchParams.get("text");
  if ((file == null) === (text == null)) return plain(400, "Say which file or text to download.");
  // The cap on downloads in flight (audit C-1, SEC-5): each holds a whole file and takes a scanner worker, which bid-part scans share. Over it, 503 with Retry-After, and nothing logged.
  const slot = downloadLimiter().tryAcquire();
  if (!slot) return plain(503, "Busy. Try again in a few seconds.", { "Retry-After": String(RETRY_AFTER_SECONDS) });
  try {
    const out = await prepareDownload(guard.actor, { exerciseId: id, file, text, secFetchSite: request.headers.get("sec-fetch-site") });
    if (!out.ok) return plain(out.status, out.text, out.retryAfterSeconds != null ? { "Retry-After": String(out.retryAfterSeconds) } : {});
    const response = new Response(out.body, { status: 200, headers: { "Content-Type": out.contentType, "Content-Length": String(out.body.byteLength), "Content-Disposition": out.disposition, "X-Content-Type-Options": "nosniff", "Content-Security-Policy": DOWNLOAD_POLICY, "Cache-Control": "private, no-store" } });
    await out.commit();
    return response;
  } finally {
    slot();
  }
}

export async function HEAD() {
  return new Response(null, { status: 405, headers: { Allow: "GET", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });
}
