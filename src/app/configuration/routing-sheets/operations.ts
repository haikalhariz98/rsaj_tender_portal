import { defineOperations } from "../_editors/define";

export const routingSheetsOperations = defineOperations("routing-sheets", "Routing sheets", {
  saveRoutingType: { label: "Save a routing sheet type", load: () => import("./core").then((m) => m.saveRoutingType) },
  retireRoutingType: { label: "Retire a routing sheet type", load: () => import("./core").then((m) => m.retireRoutingType) },
  saveCheckDef: { label: "Save a check on a routing sheet", load: () => import("./core").then((m) => m.saveCheckDef) },
  removeCheckDef: { label: "Remove a check from a routing sheet", load: () => import("./core").then((m) => m.removeCheckDef) },
  saveTarget: { label: "Save a target of a routing sheet", load: () => import("./core").then((m) => m.saveTarget) },
  removeTarget: { label: "Remove a target of a routing sheet", load: () => import("./core").then((m) => m.removeTarget) },
});
