import { foreignRequestFault } from "@/lib/auth/request-guard";
import { refusalBody, REFUSAL_STATUS } from "@/lib/auth/route-refusal";
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
 *
 * Phase 4a: it passes the Origin guard like every other POST (a form body of the type a browser sends, from a page of this origin), and the form carries a
 * signed token that `receiveApplication` checks. The guard comes before anything is read.
 */
export async function POST(request: Request) {
  const fault = foreignRequestFault(request, ["multipart/form-data"]);
  if (fault) return reply(refusalBody(fault.code, fault.message), REFUSAL_STATUS[fault.code]);
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
