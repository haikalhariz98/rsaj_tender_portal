/**
 * The exercises of one organisation that still need the deployment's sealing pepper (ADR 0036 D4, ruling 20y; build plan step 15). Read only. Each exercise's facts are read here and judged
 * by `pepperStillNeeded`; nothing is decided in this file. The list is the organisation's own: a deployment serving several organisations checks each one's list.
 */

import { admission, type LateMatter } from "@/lib/bids/late";
import { loadLateMatters } from "@/lib/bids/repo";
import { db } from "@/lib/db";
import { rollEntries } from "@/lib/opening/online-unseal";
import { sealingPepper } from "@/lib/integration/sealing-deployment";

import { pepperStillNeeded, pepperListState, wrappedUnderHeld, type HeldPepperReading } from "./pepper";

export interface PepperListRow { id: string; reference: string; title: string }

export interface PepperList { held: HeldPepperReading; state: ReturnType<typeof pepperListState>; rows: PepperListRow[] }

export async function loadPepperList(organisationId: string, env: Record<string, string | undefined> = process.env): Promise<PepperList> {
  const reading = sealingPepper(env);
  const held: HeldPepperReading = reading.status === "SET" ? { status: "SET", id: reading.pepper.id } : { status: reading.status };
  if (held.status !== "SET") return { held, state: pepperListState(held, 0), rows: [] };

  const wraps = await db.officerExerciseKey.findMany({ where: { organisationId, pepperId: held.id }, select: { exerciseId: true }, distinct: ["exerciseId"] });
  if (wraps.length === 0) return { held, state: pepperListState(held, 0), rows: [] };
  const exercises = await db.sourcingExercise.findMany({
    where: { organisationId, id: { in: wraps.map((w) => w.exerciseId) } },
    orderBy: { reference: "asc" },
    select: { id: true, reference: true, title: true, status: true },
  });

  const rows: PepperListRow[] = [];
  for (const ex of exercises) {
    const wrapIds = (await db.officerExerciseKey.findMany({ where: { organisationId, exerciseId: ex.id }, select: { pepperId: true } })).map((w) => w.pepperId);
    const main = await db.opening.findFirst({ where: { organisationId, exerciseId: ex.id, kind: "MAIN" }, select: { finalisedAt: true, receiptRoll: true } });
    const mainFinalised = main?.finalisedAt != null;
    let lateInRoll: Parameters<typeof pepperStillNeeded>[0]["lateInRoll"] = [];
    if (mainFinalised) {
      const lateSeq = (rollEntries(main!.receiptRoll) ?? []).filter((e) => e.late).map((e) => e.sequence);
      if (lateSeq.length > 0) {
        const envelopes = await db.bidEnvelope.findMany({ where: { organisationId, exerciseId: ex.id, channel: "ONLINE", sequence: { in: lateSeq } }, select: { id: true, onlineBid: { select: { status: true } } } });
        const matters: LateMatter[] = await loadLateMatters(ex.id);
        const supplementary = await db.opening.findMany({ where: { organisationId, exerciseId: ex.id, kind: "SUPPLEMENTARY" }, select: { finalisedAt: true, admissionDecision: { select: { bidEnvelopeId: true } } } });
        lateInRoll = envelopes.map((e) => ({
          withdrawn: e.onlineBid?.status === "WITHDRAWN",
          admission: admission(e.id, matters).state,
          supplementaryFinalised: supplementary.some((s) => s.admissionDecision?.bidEnvelopeId === e.id && s.finalisedAt != null),
        }));
        // A roll entry whose envelope cannot be read is kept as undecided, never dropped: the pepper stays.
        for (let i = envelopes.length; i < lateSeq.length; i++) lateInRoll.push({ withdrawn: false, admission: "NOT_TABLED", supplementaryFinalised: false });
      }
    }
    if (pepperStillNeeded({ exerciseId: ex.id, wrappedUnderHeldPepper: wrappedUnderHeld(wrapIds, held.id), cancelled: ex.status === "CANCELLED", mainFinalised, lateInRoll })) rows.push({ id: ex.id, reference: ex.reference, title: ex.title });
  }
  return { held, state: pepperListState(held, rows.length), rows };
}
