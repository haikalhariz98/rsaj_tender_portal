/**
 * Routing a payment certificate on the approval matrix (6.13 Part A step 3: FR-PAY-016, FR-PAY-001; OD-A6 as ruled).
 *
 * The interim certificate routes on the matrix's `payment` rows by the figure the organisation chose (OD-A6:
 * the payment recommended on this certificate, or the gross value this period); unset refuses the submission naming
 * the setting, never a default. The advance payment routes on the `advance_payment` rows at its amount, the
 * non-completion certificate on `non_completion` at the contract sum. The contract's value is passed too, so a row
 * banded on it is read, and the sourcing method's key, so the tender and quotation rows stay apart. Which office
 * decides at which value is the customer's matrix (Rule 1): RM100,000 and RM500,000 are rows, never code. A
 * resolution with an error, or a chain with a committee's step (a certificate is not tabled at a sitting until a
 * module gives the committee a certificate's key), is refused, naming why. Pure.
 */

import type { Matrix, Resolution, ResolutionWarning } from "@/lib/authority/types";
import { resolveUnderFunder, type FunderContext } from "@/lib/method/approval";
import { amountOf, senToDecimalString, type Sen } from "@/lib/money";
import type { CertificateKind } from "@/lib/certificate/types";

import type { Finding, PaymentRouteFigure } from "./types";

/// The matrix domain each certificate kind routes on (an exhaustive map; null: the kind opens no route here).
export const KIND_ROUTE_DOMAIN: Readonly<Record<CertificateKind, string | null>> = {
  DELEGATION_LETTER: null,
  DELEGATION_NOTICE: null,
  INTERIM_PAYMENT: "payment",
  ADVANCE_PAYMENT: "advance_payment",
  LAD_WARNING: null,
  NON_COMPLETION: "non_completion",
  // Step 4: the application and the order are approved on the variation's own routes (its page), the instruction
  // goes by its routing type; the adjustment of the contract sum routes here, on the configured gap rule (FR-PAD-006).
  VARIATION_APPLICATION: null,
  SO_INSTRUCTION: null,
  VARIATION: null,
  SUM_ADJUSTMENT: "sum_adjustment",
};

export type RouteFigure = { state: "SET"; figure: PaymentRouteFigure; value: Sen } | { state: "NOT_SET" } | { state: "NOT_COMPUTED" };

/// The interim certificate's route figure, from its figures as they stand (overrides included).
export function interimRouteFigure(choice: PaymentRouteFigure | null, figures: { recommended: Sen | null; grossThisPeriod: Sen | null }): RouteFigure {
  if (choice == null) return { state: "NOT_SET" };
  const value = choice === "RECOMMENDED" ? figures.recommended : figures.grossThisPeriod;
  return value == null ? { state: "NOT_COMPUTED" } : { state: "SET", figure: choice, value };
}

export interface CertificateRouteQuery {
  domain: string;
  value: Sen;
  contractValue: Sen;
  /// The sourcing method's authority key (as the S.O. and every engine caller read it).
  method: string | null;
  contractTypeCode: string | null;
  /// Offices whose holders are all away on the day: the engine reverts upward (FR-APR-010).
  absentRoleCodes?: readonly string[];
}

export type CertificateRoute = { ok: true; resolution: Resolution; source: "DAL" | "OVERRIDE"; overrideIssue: { id: string; label: string } | null; warnings: ResolutionWarning[] } | { ok: false; faults: Finding[] };

/// On the organisation's own matrix (the tests' form): no funder supersedes it.
export function resolveCertificateRoute(matrix: Matrix, q: CertificateRouteQuery, matrixLabel: string): CertificateRoute {
  return resolveCertificateRouteUnder({ dal: matrix, override: null, supersedes: false }, q, matrixLabel, () => false);
}

/**
 * Under the requisition's funding route (a funder's rule set supersedes where it has a rule, as 6.1 partitions it),
 * with the absence rule, and the self-approval rule applied to whoever sends it: where the sender holds the
 * approving office, the engine escalates it (`actorRoleCode`), as the appointment's route does.
 */
export function resolveCertificateRouteUnder(ctx: FunderContext, q: CertificateRouteQuery, matrixLabel: string, senderHolds: (roleCode: string) => boolean): CertificateRoute {
  // The money to the engine through the one bridge (ruling C6): it turns it straight back into sen to compare.
  const query = { domain: q.domain, method: q.method, contractTypeCode: q.contractTypeCode, value: amountOf(senToDecimalString(q.value)), contractValue: amountOf(senToDecimalString(q.contractValue)), absentRoleCodes: [...(q.absentRoleCodes ?? [])] };
  let r = resolveUnderFunder(ctx, query);
  const approver = r.resolution.approverCode;
  if (approver && senderHolds(approver)) r = resolveUnderFunder(ctx, { ...query, actorRoleCode: approver });
  const res = r.resolution;
  const errors = r.warnings.filter((w) => w.level === "err");
  if (!res.rule || errors.length || res.chain.length === 0) return { ok: false, faults: [{ code: "ROUTE_UNRESOLVED", level: "block", data: { matrix: matrixLabel, domain: q.domain, why: errors.map((e) => e.messageEn).join(" ") || null } }] };
  if (res.chain.some((s) => s.committeeCode)) return { ok: false, faults: [{ code: "ROUTE_HAS_COMMITTEE", level: "block", data: { matrix: matrixLabel, rule: res.rule.labelEn } }] };
  return { ok: true, resolution: res, source: r.source, overrideIssue: r.overrideIssue, warnings: r.warnings };
}
