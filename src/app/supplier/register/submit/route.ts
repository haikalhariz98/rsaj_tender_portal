import { APPLICATION_BODY_LIMIT } from "@/lib/portal/apply";
import { APPLY } from "@/lib/portal/labels";

import { receiveApplication } from "../receive";

export const dynamic = "force-dynamic";

const reply = (body: unknown, status = 200) => Response.json(body, { status, headers: { "cache-control": "no-store" } });

/**
 * The public registration form's one write. A route handler and not a server action, on purpose: the
 * public copy of the product refuses every request that names a server action (`src/proxy.ts`), so a
 * stranger can never reach a staff action through this form. Nothing is read from the request but the
 * form's own fields, and nothing is echoed back.
 */
export async function POST(request: Request) {
  const declared = Number(request.headers.get("content-length"));
  if (!Number.isFinite(declared) || declared <= 0 || declared > APPLICATION_BODY_LIMIT) return reply({ ok: false, message: APPLY.tryAgainLater.en }, 413);
  let data: FormData;
  try {
    data = await request.formData();
  } catch {
    return reply({ ok: false, message: APPLY.tryAgainLater.en }, 400);
  }
  return reply(await receiveApplication(data));
}
