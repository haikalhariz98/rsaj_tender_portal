import { staffRoute } from "@/app/_auth/route";
import { evaluateExercise, type ExerciseDraft } from "@/lib/method/evaluate";
import { presentEvaluation } from "@/lib/method/present";
import { evaluationContext, loadExercise, loadRequisitionForSourcing } from "@/lib/method/repo";
import { DELIVERABLE_KINDS, type DeliverableKind } from "@/lib/method/types";
import { parseSen } from "@/lib/money";

/**
 * How an exercise would run, before it is created or saved (FR-MTD-002).
 *
 * POST /api/method/determine
 *   { requisitionId, exerciseId?, value, methodCode?, scope?: [{ kind, amount }],
 *     contractTypeCode?, basisCode?, ... }
 *
 * Every rule is `src/lib/method`'s; this reads, judges and words the result. The
 * response is text only — no code reaches a screen — and nothing is written.
 */

const AMOUNT = /^\d+(\.\d{1,2})?$/;
const str = (v: unknown, max = 4000): string => (typeof v === "string" ? v.trim().slice(0, max) : "");
const opt = (v: unknown): string | null => str(v, 200) || null;

export async function POST(request: Request) {
  const guard = await staffRoute({ contentTypes: ["application/json"] });
  if (!guard.ok) return guard.response;
  const actor = guard.actor;
  let body: Record<string, unknown>;
  try {
    const parsed = await request.json();
    if (typeof parsed !== "object" || parsed == null || Array.isArray(parsed)) return Response.json({ error: "Expected an object." }, { status: 400 });
    body = parsed as Record<string, unknown>;
  } catch {
    return Response.json({ error: "Expected JSON." }, { status: 400 });
  }
  const requisitionId = str(body.requisitionId, 64);
  const exerciseId = opt(body.exerciseId);
  const value = str(body.value, 32).replace(/,/g, "");
  if (!requisitionId) return Response.json({ error: "requisitionId is required." }, { status: 400 });
  if (!AMOUNT.test(value)) return Response.json({ error: "value must be an amount, to at most two decimal places." }, { status: 400 });
  const scopeRaw = Array.isArray(body.scope) ? body.scope.slice(0, 50) : [];
  const scope: ExerciseDraft["scope"] = [];
  for (const s of scopeRaw) {
    const kind = (s as { kind?: unknown })?.kind;
    const amount = str((s as { amount?: unknown })?.amount, 32).replace(/,/g, "");
    if (!DELIVERABLE_KINDS.includes(kind as DeliverableKind) || !AMOUNT.test(amount)) continue;
    scope.push({ kind: kind as DeliverableKind, amount: parseSen(amount), description: "" });
  }

  const loaded = await loadRequisitionForSourcing(actor.organisationId, requisitionId);
  if (!loaded) return Response.json({ error: "No such requisition." }, { status: 404 });
  const ex = exerciseId ? await loadExercise(actor.organisationId, exerciseId) : null;
  if (exerciseId && (!ex || ex.ex.requisitionId !== requisitionId)) return Response.json({ error: "No such exercise on this requisition." }, { status: 404 });

  const { issue, cfg, ctx } = await evaluationContext(loaded.org, loaded.req, ex?.ex ?? null);
  if (!issue || !ctx) return Response.json({ ok: false, message: "No approval matrix is in force, so the bands cannot be determined." });

  const draft: ExerciseDraft = {
    id: exerciseId,
    value: parseSen(value),
    methodCode: opt(body.methodCode),
    methodReason: str(body.methodReason),
    externalRouteNote: str(body.externalRouteNote),
    parentContractRef: opt(body.parentContractRef),
    scope,
    contractTypeCode: opt(body.contractTypeCode),
    typeReason: str(body.typeReason),
    typePersonId: opt(body.typePersonId),
    basisCode: opt(body.basisCode),
    justificationReasonCode: opt(body.justificationReasonCode),
    justificationText: str(body.justificationText),
    evidenceNote: str(body.evidenceNote),
    dossierReference: null,
    emergencyTrigger: str(body.emergencyTrigger),
    coordinationMeetingOn: /^\d{4}-\d{2}-\d{2}$/.test(str(body.coordinationMeetingOn, 10)) ? str(body.coordinationMeetingOn, 10) : null,
  };
  const ev = evaluateExercise(draft, ctx);
  const c = cfg.config;
  return Response.json({
    ok: true,
    matrixLabel: issue.label,
    // Not shown: the form uses it to offer the proposed method.
    proposedMethodCode: ev.bands.proposed.state === "PROPOSED" ? ev.bands.proposed.code : null,
    result: presentEvaluation(ev, {
      name: (code) => issue.matrix.roles[code]?.nameEn ?? "An office no longer configured",
      typeName: (code) => c.types.find((t) => t.code === code)?.nameEn ?? "A type no longer configured",
      taxonomyName: (code) => c.taxonomies.find((t) => t.code === code)?.nameEn ?? "A classification no longer configured",
      valueName: (t, v) => c.taxonomies.find((x) => x.code === t)?.values.find((x) => x.code === v)?.nameEn ?? "A value no longer configured",
      approved: ctx.approved,
      boundarySource: issue.boundarySource,
    }),
  });
}
