import { prFileName } from "@/lib/requisition/pr-pdf-data";
import { loadPrPdf } from "@/lib/requisition/pr-pdf-load";

/**
 * The Expenditure Request Form of an approved requisition, as a PDF download. It carries the
 * estimated value, which is SULIT, so it is built here on the server for the one requisition
 * asked for and never cached.
 */
export async function GET(_req: Request, ctx: RouteContext<"/requisitions/[id]/pr.pdf">) {
  const { id } = await ctx.params;
  const out = await loadPrPdf(id);
  if (!out.ok) {
    return new Response(out.message, { status: out.status, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });
  }
  return new Response(out.bytes as BodyInit, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${prFileName(out.reference)}"`,
      "Content-Length": String(out.bytes.byteLength),
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
