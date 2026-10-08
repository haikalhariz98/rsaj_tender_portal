/**
 * Where a supplier's registration stands for the signed-in wizard (Phase 4b). Pure.
 *
 * The wizard is for a supplier the office has accepted (an APPLICANT with a portal account) whose registration is not yet with the office. A registration is in the office's hands as soon
 * as an application of it exists: one the supplier sent (the draft is then frozen), or one an officer recorded from paper or from an online application accepted before the wizard (there
 * is no draft to fill in then, and the office finishes it). Online resubmission after a request from the office arrives with Company (4c, FR-VND-007).
 */

import type { SupplierStatus } from "@/lib/suppliers/types";

export type WizardState =
  /// The supplier may fill in and send its registration.
  | "OPEN"
  /// The supplier has sent it: the draft is frozen and the office has it.
  | "SENT"
  /// An application exists that the office recorded (paper, or an online application accepted before the wizard): the office holds it, and the wizard has nothing to add.
  | "WITH_OFFICE"
  | "REGISTERED"
  | "REJECTED";

export function wizardState(f: { supplierStatus: SupplierStatus; draftSent: boolean; applications: number }): WizardState {
  if (f.supplierStatus === "REGISTERED") return "REGISTERED";
  if (f.supplierStatus === "REJECTED") return "REJECTED";
  if (f.draftSent) return "SENT";
  if (f.applications > 0) return "WITH_OFFICE";
  return "OPEN";
}

export interface WizardWords {
  title: string;
  body: string;
}

/// What a supplier is told where the wizard is not open to it.
export function wizardClosedWords(state: Exclude<WizardState, "OPEN">): WizardWords {
  switch (state) {
    case "SENT":
      return { title: "Sent to the procurement office", body: "You have sent your registration. The office is checking it, and what it decides is told on your account page. Nothing here can be changed now." };
    case "WITH_OFFICE":
      return { title: "The procurement office has your application", body: "The office recorded your application itself, so there is nothing for you to fill in here. Where it stands is on your account page, and the office will ask you for anything it needs." };
    case "REGISTERED":
      return { title: "You are registered", body: "Your registration is approved. Your account page shows where it stands." };
    case "REJECTED":
      return { title: "Your registration was not approved", body: "Your account page shows the reasons the procurement office gave." };
  }
}
