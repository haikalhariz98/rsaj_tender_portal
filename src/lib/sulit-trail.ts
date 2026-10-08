import { isSulitField } from "./sulit-fields";

/**
 * Which registered SULIT field a stored audit change is (Phase 3b). The registry names the fields a screen reads, and the trail's own keys match them where a writer
 * chose a specific key (`openingPrice`, `estimatedValue`). Four older writers kept a generic key ("rate", "amount", "total") because the figure was not SULIT when they
 * were written (6.2 OD-8) or because the row is a committee matter's or a scope part's, whose amount is the department estimate in another form. Those rows are in the
 * trail already, so they are read by entity and key: the History and the audit export treat them as the field they are. New writers use the registered key.
 */
const LEGACY: Readonly<Record<string, Readonly<Record<string, string>>>> = {
  BqItem: { rate: "bqRate", amount: "bqAmount" },
  BqVersion: { total: "bqTotals", buildersWorks: "bqBuildersWorks", firmValue: "bqFirmValue" },
  CommitteeDecision: { amount: "matterAmount" },
  ExerciseScopePart: { amount: "estimatedValue" },
};

/// The registered field a change is, or null where it is not a SULIT figure.
export function sulitFieldOf(entity: string, field: string): string | null {
  if (isSulitField(field)) return field;
  return LEGACY[entity]?.[field] ?? null;
}
