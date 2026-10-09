import { defineOperations } from "../_editors/define";

export const committeesOperations = defineOperations("committees", "Committees", {
  saveCommittee: { label: "Save a committee", load: () => import("./core").then((m) => m.saveCommittee) },
  saveMember: { label: "Save a seat on a committee", load: () => import("./core").then((m) => m.saveMember) },
  vacateSeat: { label: "Vacate a seat on a committee", load: () => import("./core").then((m) => m.vacateSeat) },
  saveNotApprovedOutcome: { label: "Save what a matter not carried does next", load: () => import("./core").then((m) => m.saveNotApprovedOutcome) },
  retireNotApprovedOutcome: { label: "Retire what a matter not carried does next", load: () => import("./core").then((m) => m.retireNotApprovedOutcome) },
  saveCommitteePanel: { kind: "OPENING_PANEL_SIZE", label: "Change the opening panel of a committee", load: () => import("./core").then((m) => m.saveCommitteePanel) },
  saveCommitteeQuorum: { kind: "QUORUM_CHANGE", label: "Change the quorum of a committee", load: () => import("./core").then((m) => m.saveCommitteeQuorum) },
});
