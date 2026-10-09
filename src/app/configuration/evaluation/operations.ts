import { defineOperations } from "../_editors/define";

export const evaluationOperations = defineOperations("evaluation", "Evaluation models", {
  retireModel: { label: "Retire an evaluation model version", load: () => import("./core").then((m) => m.retireModel) },
  saveAspect: { label: "Save an evaluation aspect", load: () => import("./core").then((m) => m.saveAspect) },
  retireAspect: { label: "Retire an evaluation aspect", load: () => import("./core").then((m) => m.retireAspect) },
  saveEvaluationPolicy: { label: "Save the evaluation policy", load: () => import("./core").then((m) => m.saveEvaluationPolicy) },
  saveBasisRoute: { label: "Save the evaluation route of a contract basis", load: () => import("./core").then((m) => m.saveBasisRoute) },
  saveMethodModel: { label: "Save the evaluation model a method suggests", load: () => import("./core").then((m) => m.saveMethodModel) },
});
