import { defineOperations } from "../_editors/define";

export const awardsOperations = defineOperations("awards", "Awards", {
  saveAwardPolicy: { label: "Save the award policy", load: () => import("./core").then((m) => m.saveAwardPolicy) },
  saveNonAwardPolicy: { label: "Save the non-award notice policy", load: () => import("./core").then((m) => m.saveNonAwardPolicy) },
  saveRecipient: { label: "Save a recipient of an instrument's copies", load: () => import("./core").then((m) => m.saveRecipient) },
  saveVariant: { label: "Save an appointment-letter variant", load: () => import("./core").then((m) => m.saveVariant) },
  saveConditionKind: { label: "Save a kind of condition precedent", load: () => import("./core").then((m) => m.saveConditionKind) },
  saveRequirement: { label: "Save a policy a contract must carry", load: () => import("./core").then((m) => m.saveRequirement) },
  saveBand: { label: "Save a liability band", load: () => import("./core").then((m) => m.saveBand) },
  saveIssuer: { label: "Save an approved issuer", load: () => import("./core").then((m) => m.saveIssuer) },
  retireRow: { label: "Retire a row from an awards list", load: () => import("./core").then((m) => m.retireRow) },
});
