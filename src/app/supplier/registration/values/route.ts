import { supplierGet } from "../../../_auth/supplier";
import { db } from "@/lib/db";
import { parseValuesQuery, VALUES_PAGE } from "@/lib/portal/registration/api";
import { valueLabel } from "@/lib/portal/registration/values";
import { todayIn } from "@/lib/dates";

import { reply } from "../reply";

export const dynamic = "force-dynamic";

/**
 * Search the registration codes of one body (Phase 4b, B6): `GET /supplier/registration/values?body=&kind=&q=`. The published lists run to thousands of codes, so the page asks for a
 * page of them as the supplier types, and the shared `Select` renders each as "code — name": a code never appears alone. Only the live values of the SUPPLIER'S OWN organisation are
 * searched (the organisation is the session's), at most a page at a time, and never a retired one. A signed-in supplier only; nothing is written.
 */
export async function GET(request: Request) {
  const guard = await supplierGet(request, "registration");
  if (!guard.ok) return guard.response;
  const { actor } = guard;
  const parsed = parseValuesQuery(new URL(request.url).searchParams);
  if (!parsed.ok) return reply({ ok: false, code: "VALIDATION", message: parsed.message }, 400);
  const { bodyId, kind, q } = parsed.value;

  const org = await db.organisation.findUnique({ where: { id: actor.organisationId }, select: { timeZone: true } });
  const today = todayIn(new Date(), org?.timeZone ?? null);
  const live = [{ retiredOn: null }, ...(today ? [{ retiredOn: { gt: new Date(`${today}T00:00:00Z`) } }] : [])];
  const rows = await db.registrationValue.findMany({
    where: {
      organisationId: actor.organisationId,
      bodyId,
      OR: live,
      ...(kind ? { kind: kind as never } : {}),
      ...(q ? { AND: [{ OR: [{ code: { contains: q, mode: "insensitive" } }, { nameEn: { contains: q, mode: "insensitive" } }, { nameMs: { contains: q, mode: "insensitive" } }] }] } : {}),
    },
    orderBy: [{ kind: "asc" }, { sortOrder: "asc" }, { code: "asc" }],
    take: VALUES_PAGE + 1,
    select: { id: true, kind: true, code: true, nameEn: true },
  });
  return reply({ ok: true, options: rows.slice(0, VALUES_PAGE).map((v) => ({ value: v.id, label: valueLabel(v), kind: v.kind })), hasMore: rows.length > VALUES_PAGE });
}
