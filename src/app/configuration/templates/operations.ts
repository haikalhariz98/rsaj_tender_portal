import { defineOperations } from "../_editors/define";

export const templatesOperations = defineOperations("templates", "Templates", {
  saveTemplate: { label: "Save a template", load: () => import("./core").then((m) => m.saveTemplate) },
});
