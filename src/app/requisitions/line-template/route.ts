import type { NextRequest } from "next/server";

import { csvTemplate, TEMPLATE_BASENAME, xlsxTemplate, XLSX_TYPE } from "@/lib/requisition/line-template";

/// The blank line-item template, as Excel (the default) or CSV: `?format=csv`.
export async function GET(req: NextRequest) {
  const csv = req.nextUrl.searchParams.get("format") === "csv";
  const body = csv ? csvTemplate() : await xlsxTemplate();
  return new Response(body as BodyInit, {
    headers: {
      "Content-Type": csv ? "text/csv; charset=utf-8" : XLSX_TYPE,
      "Content-Disposition": `attachment; filename="${TEMPLATE_BASENAME}.${csv ? "csv" : "xlsx"}"`,
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
