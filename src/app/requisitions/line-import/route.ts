import type { NextRequest } from "next/server";
import { staffRoute } from "@/app/_auth/route";

import { readUpload } from "@/lib/requisition/line-import-file";

/**
 * Reads an uploaded line-item file (multipart, field `file`) and answers with the lines and
 * the problems, as JSON. Nothing is saved: the form shows them, and saving is its own step.
 * A route handler rather than a Server Action, because an action's body is capped at 1 MB.
 */
export async function POST(req: NextRequest) {
  const guard = await staffRoute({ contentTypes: ["multipart/form-data"] });
  if (!guard.ok) return guard.response;
  let file: FormDataEntryValue | null = null;
  try {
    file = (await req.formData()).get("file");
  } catch {
    // fall through: no file
  }
  if (!(file instanceof File)) {
    return Response.json({ lines: [], problems: [{ row: null, text: { en: "No file was sent.", ms: "Tiada fail dihantar." } }] }, { status: 400 });
  }
  const result = await readUpload(file.name, new Uint8Array(await file.arrayBuffer()));
  return Response.json(result, { headers: { "Cache-Control": "no-store" } });
}
