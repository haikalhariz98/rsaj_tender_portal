import { hiddenExercises } from "@/app/_auth/sulit";
import { staffRoute } from "@/app/_auth/route";
import { db } from "@/lib/db";

/**
 * Type-to-search for a form field that names a register record (the shared Select's server-searched mode).
 *
 * GET /api/lookup?kind=supplier|contract&q=
 *   { options: [{ value, label }], hasMore }
 *
 * The organisation is the signed-in officer's. `supplier`: registered suppliers, value = the supplier's id. `contract`: value = the contract's number (what an
 * exercise's parent contract stores); contracts on an exercise restricted to people the officer is not among are left out (FR-MTD-007). A label is words, never a bare code.
 */

export const dynamic = "force-dynamic";
const LOOKUP_PAGE = 20;

export async function GET(request: Request) {
  const guard = await staffRoute();
  if (!guard.ok) return guard.response;
  const actor = guard.actor;
  const params = new URL(request.url).searchParams;
  const kind = params.get("kind");
  const q = (params.get("q") ?? "").trim().slice(0, 100);
  const organisationId = actor.organisationId;

  if (kind === "supplier") {
    const rows = await db.supplier.findMany({
      where: { organisationId, status: "REGISTERED", ...(q ? { OR: [{ registeredName: { contains: q, mode: "insensitive" } }, { registrationNo: { contains: q, mode: "insensitive" } }, { reference: { contains: q, mode: "insensitive" } }] } : {}) },
      orderBy: [{ registeredName: "asc" }, { id: "asc" }],
      take: LOOKUP_PAGE + 1,
      select: { id: true, registeredName: true, registrationNo: true },
    });
    return Response.json({ options: rows.slice(0, LOOKUP_PAGE).map((s) => ({ value: s.id, label: `${s.registeredName} (${s.registrationNo})` })), hasMore: rows.length > LOOKUP_PAGE });
  }

  if (kind === "contract") {
    const hidden = await hiddenExercises(actor);
    const rows = await db.contract.findMany({
      where: {
        organisationId,
        award: { exerciseId: { notIn: hidden } },
        ...(q ? { OR: [{ number: { contains: q, mode: "insensitive" } }, { award: { awardeeName: { contains: q, mode: "insensitive" } } }] } : {}),
      },
      orderBy: [{ number: "asc" }, { id: "asc" }],
      take: LOOKUP_PAGE + 1,
      select: { number: true, award: { select: { awardeeName: true } } },
    });
    return Response.json({ options: rows.slice(0, LOOKUP_PAGE).map((c) => ({ value: c.number, label: `${c.number} — ${c.award.awardeeName}` })), hasMore: rows.length > LOOKUP_PAGE });
  }

  return Response.json({ error: "Say what to look up: supplier or contract." }, { status: 400 });
}
