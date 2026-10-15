import { defineOperations } from "../_editors/define";

export const bidSealingOperations = defineOperations("bidSealing", "Bid sealing", {
  saveBidSealingPolicy: { label: "Save the bid sealing policy", kind: "BID_SEALING_POLICY", administratorMay: false, load: () => import("./core").then((m) => m.saveBidSealingPolicy) },
});
