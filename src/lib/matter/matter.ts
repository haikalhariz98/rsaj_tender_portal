/**
 * A post-award matter decided on an approval route (6.13 Part B run 1b; ADR 0029; plan B5 `matter/matter.ts`;
 * BD-613-73, BD-613-117, BD-613-121). Pure.
 *
 * - Each kind reads one family of the act × status table (`MATTER_FAMILY`, exhaustive) and routes on its own matrix
 *   domain (`MATTER_DOMAIN`): the matrix rows are the customer's (Rule 1), so no approver is here.
 * - What a kind is routed on (`MATTER_ROUTED_ON`): the EOT on the cause of its financial impact (a condition, never a
 *   value, FR-EOT-007), the waiver on the exact ratio waived ÷ LAD amount (FR-LAD-009), the rest on a value (the period
 *   extension's only where it has one: FR-EOT-012 has no band).
 * - Sending (`sendFaults`): a first send takes its reference from the `contract_matter` series (none: refused, naming
 *   it); a closed matter, a route waiting and an approved matter refuse.
 * - The approval of record (`approvalOfRecord`): only an APPROVED latest route. The route hook writes it.
 * - BD-613-121 (`matterSigning`): a certificate approved on a contract matter signs only once that matter is approved.
 */

import type { ContractAct } from "@/lib/contract/act-status";
import type { CertificateKind } from "@/lib/certificate/types";
import type { Sen } from "@/lib/money";
import type { ExactRatio } from "@/lib/percent-band";
import type { Finding } from "@/lib/method/types";

export const CONTRACT_MATTER_KINDS = ["EOT", "PERIOD_EXTENSION", "LAD_WAIVER", "TERMINATION", "NOMINATED_INCREASE", "NOMINATION", "LOSS_EXPENSE"] as const;
export type ContractMatterKind = (typeof CONTRACT_MATTER_KINDS)[number];

/// The family of the one act × status table each kind's acts read (its record, its route, its committee matters).
export const MATTER_FAMILY = {
  EOT: "EOT",
  PERIOD_EXTENSION: "PERIOD_EXTENSION",
  LAD_WAIVER: "LAD_WAIVER",
  TERMINATION: "TERMINATION_CASE",
  NOMINATED_INCREASE: "NOMINATED_INCREASE",
  NOMINATION: "NOMINATED",
  LOSS_EXPENSE: "LOSS_EXPENSE",
} as const satisfies Record<ContractMatterKind, ContractAct>;

/// The matrix domains (BD-613-117; BD-613-133: the period extension's is the plan's `contract_period_extension`).
export const EOT_DOMAIN = "eot";
export const PERIOD_EXTENSION_DOMAIN = "contract_period_extension";
export const LAD_WAIVER_DOMAIN = "lad_waiver";
export const TERMINATION_DOMAIN = "termination";
export const NOMINATED_INCREASE_DOMAIN = "nominated_increase";
export const NOMINATION_DOMAIN = "nomination";
export const LOSS_EXPENSE_DOMAIN = "loss_expense";

export const MATTER_DOMAIN = {
  EOT: EOT_DOMAIN,
  PERIOD_EXTENSION: PERIOD_EXTENSION_DOMAIN,
  LAD_WAIVER: LAD_WAIVER_DOMAIN,
  TERMINATION: TERMINATION_DOMAIN,
  NOMINATED_INCREASE: NOMINATED_INCREASE_DOMAIN,
  NOMINATION: NOMINATION_DOMAIN,
  LOSS_EXPENSE: LOSS_EXPENSE_DOMAIN,
} as const satisfies Record<ContractMatterKind, string>;

/// Every contract-matter domain: tabled only from its matter (RECORD_TABLED_DOMAINS, BD-613-117).
export const CONTRACT_MATTER_DOMAINS: readonly string[] = Object.values(MATTER_DOMAIN);

export type RoutedOn = "COND" | "RATIO" | "VALUE" | "VALUE_IF_ANY";
export const MATTER_ROUTED_ON = {
  EOT: "COND",
  PERIOD_EXTENSION: "VALUE_IF_ANY",
  LAD_WAIVER: "RATIO",
  TERMINATION: "VALUE_IF_ANY",
  NOMINATED_INCREASE: "VALUE",
  NOMINATION: "VALUE",
  LOSS_EXPENSE: "VALUE",
} as const satisfies Record<ContractMatterKind, RoutedOn>;

export interface MatterRoute {
  id: string;
  status: string;
}

/// A matter as its rules read it (routes oldest first).
export interface MatterFacts {
  kind: ContractMatterKind;
  reference: string | null;
  closed: { reason: string } | null;
  /// Whether the `contract_matter` numbering series is set (read only where the matter has no reference yet).
  seriesSet: boolean;
  routes: readonly MatterRoute[];
  approvedRouteId: string | null;
}

export interface SendQuery {
  value: Sen | null;
  ratio: ExactRatio | null;
  cond: string | null;
}

/// Why the matter may not be sent for approval now (empty: it may).
export function sendFaults(m: MatterFacts, q: SendQuery): Finding[] {
  const out: Finding[] = [];
  const f = (code: string, data: Record<string, string | number | null> = {}) => out.push({ code, level: "block", data });
  if (m.closed) f("MATTER_CLOSED", { reason: m.closed.reason });
  const latest = m.routes.at(-1) ?? null;
  if (latest?.status === "PENDING") f("ROUTE_WAITING");
  if (latest?.status === "APPROVED") f("ALREADY_APPROVED");
  if (out.length) return out;
  if (!m.reference && !m.seriesSet) f("MATTER_SERIES_NOT_SET");
  const on = MATTER_ROUTED_ON[m.kind];
  if (on === "COND" && !q.cond) f("COND_REQUIRED");
  if (on === "VALUE" && (q.value == null || q.value < 0n)) f("VALUE_REQUIRED");
  if (on === "RATIO" && (!q.ratio || q.ratio.den <= 0n || q.ratio.num <= 0n)) f("RATIO_REQUIRED");
  return out;
}

/// The approval of record: the latest route, where it is APPROVED. Null otherwise.
export function approvalOfRecord(routes: readonly MatterRoute[]): string | null {
  const latest = routes.at(-1);
  return latest?.status === "APPROVED" ? latest.id : null;
}

/// Approved: open, and its written approval of record is the latest route, approved.
export const matterApproved = (m: MatterFacts): boolean => !m.closed && m.approvedRouteId != null && approvalOfRecord(m.routes) === m.approvedRouteId;

/// The certificate kinds approved on a contract matter, each with the matter kind that approves it.
export const MATTER_SIGNED_KINDS = ["EOT", "CONTRACT_PERIOD_AGREEMENT", "TERMINATION"] as const satisfies readonly CertificateKind[];
const SIGNED_BY: Readonly<Record<(typeof MATTER_SIGNED_KINDS)[number], ContractMatterKind>> = { EOT: "EOT", CONTRACT_PERIOD_AGREEMENT: "PERIOD_EXTENSION", TERMINATION: "TERMINATION" };

/**
 * BD-613-121: the matter's answer for a certificate approved on a contract matter (it replaces the run 1a refusal that
 * failed closed). `facts` is the matter of the record the certificate is the certificate of; null where none is found
 * (a termination before run 4). Every other kind: nothing (not this hook's).
 */
export function matterSigning(kind: CertificateKind, facts: MatterFacts | null): Finding[] {
  const by = (SIGNED_BY as Partial<Record<CertificateKind, ContractMatterKind>>)[kind];
  if (!by) return [];
  if (!facts || facts.kind !== by || !matterApproved(facts)) return [{ code: "MATTER_NOT_APPROVED", level: "block", data: { kind } }];
  return [];
}
