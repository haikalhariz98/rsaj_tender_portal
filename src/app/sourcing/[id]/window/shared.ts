/**
 * What every 6.5 window write shares (plan §4): one transaction that locks the exercise's
 * requisition, then the exercise (`withLockedRequisitionForSourcing`), then the exercise's window
 * row (`lockWindowRow`), and re-reads everything the rules judge (`windowData`) under those locks.
 * The pure rule (`src/lib/window`) is re-run on the locked rows; the write and its audit rows share
 * the transaction; a refusal saves nothing and names what blocks it and where to set it. The signed-in
 * officer is named on every audit row; every person named is "recorded on behalf of, not signed". The derived phase is recomputed here on every write, never taken from the form.
 */

import { revalidatePath } from "next/cache";

import type { FormState } from "@/components/record-editor";
import type { FieldChange } from "@/lib/audit/diff";
import { writeAudit, type Tx } from "@/lib/audit/record";
import type { AuditActor } from "@/lib/auth/types";
import { findingText } from "@/lib/method/labels";
import { ExerciseMoveRefused } from "@/lib/method/move";
import { requisitionOfExercise, withLockedRequisitionForSourcing, type ExerciseOrg, type ExerciseRow, type SourcingRequisition } from "@/lib/method/repo";
import { transactionTimedOut } from "@/lib/scope/tx-timeout";
import { windowFindingText } from "@/lib/window/labels";
import { lockWindowRow } from "@/lib/window/lock";
import { windowData, type WindowData } from "@/lib/window/repo";
import type { Finding } from "@/lib/window/types";

export const GONE: FormState = { ok: false, message: "That exercise no longer exists." };
export const CHANGED: FormState = { ok: false, message: "The exercise changed while this was being saved. Reload and try again." };
export const NO_ZONE: FormState = { ok: false, message: "The organisation's time zone is not set, so nothing on the window can be dated. Set it under Configuration, Organisation." };
export const NO_WINDOW: FormState = { ok: false, message: "The window is not prepared yet. Save its notice items on the Invitation tab first." };

export class Refusal extends Error {
  constructor(readonly state: FormState) {
    super(state.message ?? "Refused");
  }
}

export type LockedWindow = { org: ExerciseOrg; req: SourcingRequisition; ex: ExerciseRow };

/// The blocking findings, in words, after a lead.
export const refuse = (fs: readonly Finding[], lead = "Nothing was saved:"): FormState => ({ ok: false, message: `${lead} ${fs.filter((f) => f.level === "block").map(windowFindingText).join(" ")}` });

/// The warnings and notes of a finding list, in words, for a saved act's message.
export const notes = (fs: readonly Finding[]) => fs.filter((f) => f.level !== "block").map(windowFindingText).join(" ");

export async function audit(tx: Tx, actor: AuditActor, orgId: string, entity: string, entityId: string, entityLabel: string, action: "CREATE" | "UPDATE" | "DELETE", changes: FieldChange[], reason = "") {
  if (action === "UPDATE" && changes.length === 0) return;
  await writeAudit(tx, { actor, organisationId: orgId, entity, entityId, entityLabel, reason }, action, changes);
}

/// Every window row is labelled with its exercise's reference, so the exercise's History finds it.
export const label = (l: { ex: { reference: string } }, what: string) => `${l.ex.reference} · ${what}`;

/**
 * Run a window write: requisition, exercise and window locked, the window's data read under the
 * locks, and `fn` given both. A refusal thrown deep inside rolls everything back.
 */
export async function inWindow(exerciseId: string, fn: (tx: Tx, l: LockedWindow, d: WindowData) => Promise<FormState>): Promise<FormState> {
  const requisitionId = await requisitionOfExercise(exerciseId);
  if (!requisitionId) return GONE;
  let result: FormState | null;
  try {
    result = await withLockedRequisitionForSourcing(requisitionId, exerciseId, async (tx, l) => {
      if (!l.ex) return GONE;
      await lockWindowRow(tx, exerciseId);
      return fn(tx, { org: l.org, req: l.req, ex: l.ex }, await windowData(l.org.id, l.ex, tx));
    });
  } catch (e) {
    if (e instanceof Refusal) return e.state;
    if (e instanceof ExerciseMoveRefused) return e.findings[0]?.code === "CHANGED" ? CHANGED : { ok: false, message: `The exercise cannot move: ${e.findings.map(findingText).join(" ")}` };
    if (transactionTimedOut(e)) return { ok: false, message: "This took too long and nothing was saved. Try again." };
    throw e;
  }
  if (result?.ok) {
    revalidatePath(`/sourcing/${exerciseId}`);
    revalidatePath("/sourcing");
    revalidatePath("/approvals");
  }
  return result ?? GONE;
}

export const exerciseIdOf = (data: FormData) => String(data.get("exerciseId") ?? "");

/// A Person on record and active in the organisation, read under the lock; null if not.
export async function activePerson(tx: Tx, organisationId: string, personId: string | null) {
  if (!personId) return null;
  return tx.person.findFirst({ where: { id: personId, organisationId, isActive: true }, select: { id: true, name: true } });
}
