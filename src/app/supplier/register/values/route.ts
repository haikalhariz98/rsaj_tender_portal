import { FORM_TOKEN_HEADER } from "../../../_auth/supplier";
import { checkFormToken } from "@/lib/auth/form-secret";
import { refusalBody, REFUSAL_STATUS } from "@/lib/auth/route-refusal";
import { todayIn } from "@/lib/dates";
import { db } from "@/lib/db";
import { downloadRequestFault } from "@/lib/documents/request-guard";
import { deploymentOrganisation } from "@/lib/portal/deployment";
import { APPLY } from "@/lib/portal/labels";
import { REGISTER_VALUES_MAX_HITS, REGISTER_VALUES_MIN_QUERY, type ValueHit, type ValuesReply } from "@/lib/portal/register/contract";
import { parseValuesQuery } from "@/lib/portal/registration/api";

export const dynamic = "force-dynamic";

const reply = (body: ValuesReply | ReturnType<typeof refusalBody>, status = 200) => Response.json(body, { status, headers: { "cache-control": "no-store" } });

/**
 * Search the registration codes of one body for the public form (ADR 0041, plan 2.4): `GET /supplier/register/values?body=&kind=&q=`. The published lists run to thousands of codes, so
 * the form asks for some as the applicant types. Only the live values of the deployment's organisation are searched, at least two characters at a time and at most fifty answered; a
 * retired value is never offered. The request must come from the form (the register token in `x-form-token`) and not from another site. Nothing is written.
 */
export async function GET(request: Request) {
  if (downloadRequestFault(request.headers.get("sec-fetch-site"))) return reply(refusalBody("CROSS_SITE"), REFUSAL_STATUS.CROSS_SITE);
  const verdict = checkFormToken("register", request.headers.get(FORM_TOKEN_HEADER));
  if (verdict === "KEY_NOT_SET") return reply({ ok: false, code: "CLOSED", message: APPLY.closedTitle.en }, 503);
  if (verdict !== "OK") return reply({ ok: false, code: "FORM_EXPIRED", message: APPLY.submitExpired.en }, 400);
  const parsed = parseValuesQuery(new URL(request.url).searchParams);
  if (!parsed.ok) return reply({ ok: false, code: "VALIDATION", message: parsed.message }, 400);
  const { bodyId, kind, q } = parsed.value;
  if (Array.from(q).length < REGISTER_VALUES_MIN_QUERY) return reply({ ok: false, code: "VALIDATION", message: "Type at least two characters." }, 400);

  const org = await deploymentOrganisation();
  if (!org) return reply({ ok: false, code: "CLOSED", message: APPLY.closedTitle.en }, 503);
  const today = todayIn(new Date(), org.timeZone);
  const live = [{ retiredOn: null }, ...(today ? [{ retiredOn: { gt: new Date(`${today}T00:00:00Z`) } }] : [])];
  const rows = await db.registrationValue.findMany({
    where: {
      organisationId: org.id,
      bodyId,
      OR: live,
      ...(kind ? { kind: kind as never } : {}),
      AND: [{ OR: [{ code: { contains: q, mode: "insensitive" } }, { nameEn: { contains: q, mode: "insensitive" } }] }],
    },
    orderBy: [{ kind: "asc" }, { sortOrder: "asc" }, { code: "asc" }],
    take: REGISTER_VALUES_MAX_HITS,
    select: { id: true, kind: true, code: true, nameEn: true, bodyId: true },
  });
  const hits: ValueHit[] = rows.map((v) => ({ id: v.id, code: v.code, name: v.nameEn, kind: v.kind, bodyId: v.bodyId }));
  return reply({ ok: true, hits });
}
