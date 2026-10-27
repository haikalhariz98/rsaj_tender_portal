import { defineOperations } from "../_editors/define";

export const performanceOperations = defineOperations("performance", "Performance forms", {
  retireForm: { label: "Retire a contractor performance form", load: () => import("./core").then((m) => m.retireForm) },
});
