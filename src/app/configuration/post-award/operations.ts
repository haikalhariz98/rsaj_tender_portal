import { defineOperations } from "../_editors/define";

export const postAwardOperations = defineOperations("post-award", "Post-award", {
  savePostAwardPolicy: { label: "Save the post-award policy", load: () => import("./core").then((m) => m.savePostAwardPolicy) },
  savePaymentPolicy: { label: "Save the interim payment controls", load: () => import("./core").then((m) => m.savePaymentPolicy) },
  saveKindSetting: { label: "Save the form and routing sheet of a certificate kind", load: () => import("./core").then((m) => m.saveKindSetting) },
  saveClockRule: { label: "Save a contract clock", load: () => import("./core").then((m) => m.saveClockRule) },
  saveContractorPortalSigning: { label: "Save whether a contractor's portal account may sign", load: () => import("./core").then((m) => m.saveContractorPortalSigning) },
  saveVariationPolicy: { label: "Save the variation controls", load: () => import("./core").then((m) => m.saveVariationPolicy) },
});
