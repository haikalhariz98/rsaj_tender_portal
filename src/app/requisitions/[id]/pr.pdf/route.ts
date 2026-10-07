import { staffRoute } from "@/app/_auth/route";
import { sulitGate } from "@/app/_auth/sulit";
import { fieldsOfScope } from "@/lib/sulit-fields";
import { prFileName } from "@/lib/requisition/pr-pdf-data";
import { loadPrPdf } from "@/lib/requisition/pr-pdf-load";

/**
 * The Expenditure Request Form of an approved requisition, as a PDF download. It carries the
 * estimated value, which is SULIT, so it is built here on the server for the one requisition
 * asked for and never cached. It leaves only for a reader the estimate is open to (Phase 3b): the access is logged, whether it is allowed or refused.
 */
export async function GET(_req: Request, ctx: RouteContext<"/requisitions/[id]/pr.pdf">) {
  const guard = await staffRoute();
  if (!guard.ok) return guard.response;
  const scope = guard.actor;
  const { id } = await ctx.params;
  const out = await loadPrPdf(scope.organisationId, id);
  if (!out.ok) {
    return new Response(out.message, { status: out.status, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });
  }
  const gate = await sulitGate(scope, { scope: "requisition", entity: "Requisition", id, label: out.reference }, fieldsOfScope("requisition"));
  if (gate.state === "WITHHELD") {
    return new Response(`The form carries the department estimate, which is SULIT, and it is withheld from you. ${gate.words.en}`, { status: 403, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });
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
