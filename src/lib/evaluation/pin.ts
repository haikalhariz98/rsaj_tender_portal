/**
 * Choosing and pinning the evaluation model (FR-EVL-005, 006; E-1, E-2). The model is chosen on the
 * Invitation › Window card while the exercise is unpublished — an issued version whose route is the one
 * the exercise's contract basis takes — and pinned in the publish transaction: its frozen content is
 * copied onto the exercise, and nothing changes it after. An exercise published before evaluation
 * models existed has no snapshot and is never pinned later (E-1: its evaluation is refused, naming
 * cancel and replace). Pure.
 */

import type { EvaluationRoute, Finding, ModelStatus } from "./types";

export type PinFault = "EVALUATION_MODEL_NOT_SET" | "EVALUATION_MODEL_NOT_ISSUED" | "EVALUATION_MODEL_RETIRED" | "EVALUATION_ROUTE_NOT_SET" | "EVALUATION_ROUTE_MISMATCH" | "EVALUATION_MODEL_PINNED" | "EVALUATION_MODEL_FROZEN" | "CONTRACT_BASIS_NOT_SET";

export interface PinInput {
  /// The model chosen on the exercise; null: none chosen.
  model: { status: ModelStatus; route: EvaluationRoute; name: string } | null;
  /// The exercise's contract basis: its evaluation route (null: not set), or null itself where the exercise has no basis.
  basis: { name: string; route: EvaluationRoute | null } | null;
  pinned: boolean;
}

/// What publication asks of the model (`publishFaults` reads these): chosen, issued, the basis's route.
export function pinFaults(i: PinInput): Finding<PinFault>[] {
  if (i.pinned) return [{ code: "EVALUATION_MODEL_PINNED", level: "block" }];
  const out: Finding<PinFault>[] = [];
  const f = (code: PinFault, data?: Finding["data"]) => out.push({ code, level: "block", ...(data ? { data } : {}) });
  if (!i.basis) f("CONTRACT_BASIS_NOT_SET");
  else if (i.basis.route == null) f("EVALUATION_ROUTE_NOT_SET", { basis: i.basis.name });
  if (!i.model) f("EVALUATION_MODEL_NOT_SET");
  else {
    if (i.model.status === "DRAFT") f("EVALUATION_MODEL_NOT_ISSUED", { model: i.model.name });
    if (i.model.status === "RETIRED") f("EVALUATION_MODEL_RETIRED", { model: i.model.name });
    if (i.basis?.route && i.model.route !== i.basis.route) f("EVALUATION_ROUTE_MISMATCH", { model: i.model.name, basis: i.basis.name });
  }
  return out;
}

/// Choosing a model on the Window card: only while unpublished, and only an issued version (its route checked at publication too).
export function chooseFaults(i: { published: boolean; cancelled: boolean; model: { status: ModelStatus; name: string } | null }): Finding<PinFault>[] {
  if (i.published || i.cancelled) return [{ code: "EVALUATION_MODEL_FROZEN", level: "block" }];
  if (!i.model) return [{ code: "EVALUATION_MODEL_NOT_SET", level: "block" }];
  if (i.model.status === "DRAFT") return [{ code: "EVALUATION_MODEL_NOT_ISSUED", level: "block", data: { model: i.model.name } }];
  if (i.model.status === "RETIRED") return [{ code: "EVALUATION_MODEL_RETIRED", level: "block", data: { model: i.model.name } }];
  return [];
}
