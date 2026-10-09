import { defineOperations } from "../_editors/define";

export const templatesGlossaryOperations = defineOperations("templates-glossary", "Glossary", {
  saveCorrection: { label: "Save a text correction", load: () => import("./glossary-core").then((m) => m.saveCorrection) },
  removeCorrection: { label: "Remove a text correction", load: () => import("./glossary-core").then((m) => m.removeCorrection) },
  saveTerm: { label: "Save a glossary term", load: () => import("./glossary-core").then((m) => m.saveTerm) },
  removeTerm: { label: "Remove a glossary term", load: () => import("./glossary-core").then((m) => m.removeTerm) },
});
