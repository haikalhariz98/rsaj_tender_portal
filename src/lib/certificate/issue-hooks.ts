/**
 * One issue-hook map for the post-award kinds whose issue writes something of their own (ADR 0047 D2; plan
 * closeout-plan.md CO-2). `recordSignature`'s issue asks a kind's `refusal` beside the payment and variation refusals,
 * and runs its `after` beside the variation's, in the same transaction: a refusal from either rolls the issue back.
 * Payment and variation keep their own hooks.
 *
 * Stage A (time) has the EOT certificate and the contract period agreement. Practical completion, the Schedule of
 * Defects and the certificate of making good defects join in stage B, the final certificate in stage C. A hook that
 * writes the contract's status goes through `contractTransition` with the writer `STATUS_WRITTEN_BY` names, and is first
 * refused WORK_WOULD_BE_STRANDED (`strandedFaults`) while any open item belongs to a family that `ACT_STATUS` refuses in
 * the status it writes.
 */

import type { Tx } from "@/lib/audit/record";
import type { AuditActor } from "@/lib/auth/types";
import { ACT_STATUS, certificateAct, type ContractAct } from "@/lib/contract/act-status";
import type { LoadedContract } from "@/lib/contract/repo";
import type { ContractStatus } from "@/lib/contract/types";
import { MATTER_FAMILY, type ContractMatterKind } from "@/lib/matter/matter";
import { eotAtIssue, eotIssueRefusal, periodAtIssue, periodIssueRefusal } from "@/lib/time/at-issue";

import type { CertificateKind, Finding } from "./types";

export interface IssueHook {
  /// Before issue, on the locked rows: words that refuse it (the basis moved), or null.
  refusal(tx: Tx, l: LoadedContract, cert: { id: string; kind: string }): Promise<string | null>;
  /// After the issue's own writes (`number` is the reference just allocated): words that roll it back, or null.
  after(tx: Tx, actor: AuditActor, l: LoadedContract, cert: { id: string; kind: string }, number: string, now: Date, today: string): Promise<string | null>;
}

export const KIND_ISSUE_HOOK: Readonly<Partial<Record<CertificateKind, IssueHook>>> = {
  EOT: { refusal: eotIssueRefusal, after: eotAtIssue },
  CONTRACT_PERIOD_AGREEMENT: { refusal: periodIssueRefusal, after: periodAtIssue },
};

/// An item of work still open on the contract, with the family of the act that would finish it.
export interface OpenItem {
  label: string;
  family: ContractAct;
}

/// A contract matter whose route is pending or not yet sent: finished by its kind's family.
export const openMatter = (kind: ContractMatterKind, label: string): OpenItem => ({ label, family: MATTER_FAMILY[kind] });
/// A certificate in DRAFT, IN_ROUTING or SIGNING: finished by its kind's pre-issue family.
export const openCertificate = (kind: CertificateKind, label: string): OpenItem => ({ label, family: certificateAct(kind, "PRE_ISSUE") });
/// An EOT claim not yet determined.
export const openClaim = (label: string): OpenItem => ({ label, family: "EOT" });

/// WORK_WOULD_BE_STRANDED, naming each open item whose family the act × status table refuses in the status the issue
/// writes (read from the table itself, never a list by hand). Empty: nothing would be left that no act can finish.
export function strandedFaults(open: readonly OpenItem[], writes: ContractStatus): Finding[] {
  const stranded = open.filter((o) => ACT_STATUS[o.family][writes] === "REFUSED").map((o) => o.label);
  return stranded.length ? [{ code: "WORK_WOULD_BE_STRANDED", level: "block", data: { items: stranded.join("; ") } }] : [];
}
