import { defineOperations } from "../_editors/define";

export const budgetOperations = defineOperations("budget", "Budget", {
  saveBudgetCode: { label: "Save a budget code", load: () => import("./core").then((m) => m.saveBudgetCode) },
  changePeriod: { label: "Open or close a period", load: () => import("./core").then((m) => m.changePeriod) },
  setRollForward: { label: "Set whether unspent allocation rolls forward", load: () => import("./core").then((m) => (_prev, data) => m.setRollForward(Number(data.get("year")), data.get("on") === "yes")) },
  addRevision: { label: "Revise an allocation", load: () => import("./core").then((m) => m.addRevision) },
  transferBetweenCodes: { label: "Transfer allocation between budget codes", load: () => import("./core").then((m) => m.transferBetweenCodes) },
  saveBudgetControls: { label: "Save the budget controls", load: () => import("./core").then((m) => m.saveBudgetControls) },
  clearBudgetControls: { label: "Put every budget control back to not set", load: () => import("./core").then((m) => () => m.clearBudgetControls()) },
  saveFinanceSettings: { label: "Save how the portal reconciles with the finance system", load: () => import("./core").then((m) => m.saveFinanceSettings) },
  acceptPortalFigure: { label: "Accept the portal's figure for a variance", load: () => import("./core").then((m) => (_prev, data) => m.acceptPortalFigure(String(data.get("varianceId") ?? ""))) },
});
