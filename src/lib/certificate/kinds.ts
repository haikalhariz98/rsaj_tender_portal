/**
 * Which certificates must have an approved route before anyone signs them (carry 614-C1, BD-614-9, placed at
 * 6.13 Part A step 1, before step 2's first real certificate). An exhaustive map over `CertificateKind`: adding a
 * kind without deciding it is a type error, and every kind is tested.
 *
 * A money-bearing kind (one that certifies a sum or changes the contract sum: the interim and advance payment
 * certificates, the variation application, the variation order and the adjustment of the contract sum) never
 * reaches SIGNING without an APPROVED approval route, whatever its routing type: from IN_ROUTING the sheet
 * already asks it; from DRAFT, with no routing type, its latest route must be approved too. Every other kind (the
 * delegation letter and its notice, the LAD warning, the Certificate of Non-Completion, the S.O.'s instruction)
 * follows its routing type as BD-614-9 has it: with one, through the sheet; with none, straight to signing.
 * Pure.
 */

import { w, type Words } from "./labels";
import type { CertificateKind, Finding } from "./types";

/// MATTER_APPROVED (Run 1a fix round, review S5): the approval of record is a contract matter's own route, so the
/// certificate never reaches signing on its routing type alone; it is refused until the matter hook (run 1b) answers.
export type KindRouteRule = "APPROVED_ROUTE" | "BY_ROUTING_TYPE" | "MATTER_APPROVED";

export const KIND_ROUTE_RULE: Readonly<Record<CertificateKind, KindRouteRule>> = {
  DELEGATION_LETTER: "BY_ROUTING_TYPE",
  DELEGATION_NOTICE: "BY_ROUTING_TYPE",
  INTERIM_PAYMENT: "APPROVED_ROUTE",
  ADVANCE_PAYMENT: "APPROVED_ROUTE",
  LAD_WARNING: "BY_ROUTING_TYPE",
  NON_COMPLETION: "BY_ROUTING_TYPE",
  VARIATION_APPLICATION: "APPROVED_ROUTE",
  SO_INSTRUCTION: "BY_ROUTING_TYPE",
  VARIATION: "APPROVED_ROUTE",
  SUM_ADJUSTMENT: "APPROVED_ROUTE",
  // 6.13 Part B run 1a: a kind whose approval of record is a contract matter's route (EOT, the period agreement, the
  // termination) fails closed until the matter's approval is read (Run 1a fix round, review S5), never a second route; a
  // recorded Tender Board approval (the nomination letters) goes by its routing type; practical completion (OD-B17),
  // making good (OD-B10), the terminated contract's final payment and the final certificate (OD-B10, OD-B16) are routed
  // on their own domain before signing.
  EOT: "MATTER_APPROVED",
  CONTRACT_PERIOD_AGREEMENT: "MATTER_APPROVED",
  PARTIAL_OCCUPATION: "BY_ROUTING_TYPE",
  PRACTICAL_COMPLETION: "APPROVED_ROUTE",
  SCHEDULE_OF_DEFECTS: "BY_ROUTING_TYPE",
  MAKING_GOOD_DEFECTS: "APPROVED_ROUTE",
  TERMINATION_INTENT: "BY_ROUTING_TYPE",
  TERMINATION: "MATTER_APPROVED",
  TERMINATED_FINAL: "APPROVED_ROUTE",
  NOMINATION_LETTER: "BY_ROUTING_TYPE",
  FINAL: "APPROVED_ROUTE",
};

/// Whether the kind certifies money or moves the contract sum (needs an approved route before signing).
export const isMoneyBearing = (k: CertificateKind): boolean => KIND_ROUTE_RULE[k] === "APPROVED_ROUTE";

/**
 * Why a draft with no routing type may not go straight to signing: a money-bearing kind needs its latest
 * approval route approved (none opened, pending, refused or recalled all refuse).
 */
export function draftSigningFaults(kind: CertificateKind, latestRouteStatus: string | null): Finding[] {
  const matter = matterSigningFaults(kind);
  if (matter.length) return matter;
  if (!isMoneyBearing(kind) || latestRouteStatus === "APPROVED") return [];
  return [{ code: "MONEY_NEEDS_APPROVED_ROUTE", level: "block", data: { kind, route: latestRouteStatus } }];
}

/**
 * Review S5: a kind approved on a contract matter is refused at signing, from a draft and from routing alike, until the
 * matter's approval is read. No matter has a route before run 1b, whose hook replaces this refusal with the matter's
 * answer; until then it fails closed.
 */
export function matterSigningFaults(kind: CertificateKind): Finding[] {
  return KIND_ROUTE_RULE[kind] === "MATTER_APPROVED" ? [{ code: "MATTER_NOT_APPROVED", level: "block", data: { kind } }] : [];
}

export const matterFaultWords = (): Words =>
  w(
    "Needs its matter approved on its own route first.",
    "Perakuan yang diluluskan melalui perkara kontrak hanya ditandatangani selepas perkara itu diluluskan pada laluannya sendiri, dan tiada perkara yang diluluskan direkodkan untuknya: ia tidak dihantar untuk tandatangan berdasarkan jenis penghalaannya sahaja.",
  );

/// The refusal's words (also in fault-text.ts, which every certificate refusal reads).
export function kindFaultWords(f: Finding): Words {
  const r = f.data?.route;
  const state = r == null ? "none is open yet" : r === "PENDING" ? "its route is still waiting for a decision (Approvals)" : r === "REJECTED" ? "its route was refused, and goes on only on a resubmitted route" : r === "RECALLED" ? "its route was recalled before a decision" : "its route is not approved";
  return w(
    `A certificate that certifies money or changes the contract sum is signed only once its approval route is approved: ${state}. The module that raised it opens the route on the approval matrix.`,
    `Perakuan yang memperakui wang atau mengubah jumlah kontrak hanya ditandatangani selepas laluan kelulusannya diluluskan. Modul yang menaikkannya membuka laluan itu pada matriks kelulusan.`,
  );
}
