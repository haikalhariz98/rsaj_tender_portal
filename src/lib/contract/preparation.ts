/**
 * Starting to prepare the contract (6.12, ADR 0021 §5): the move from "number allocated" into
 * preparation freezes what formation will be judged under — the legal office, the front-loading ratio,
 * the controlled-copy stamp and recipients, the signatory condition, the basis's checks and its document
 * parts — and builds the baseline's draft. Every one of them is the customer's setting; one that formation
 * cannot do without refuses the start, naming the setting, so no contract is ever left holding an unset
 * rule it cannot leave. The front-loading ratio may be unset: the check is then the officer's judgement.
 */

import { applicableChecks } from "./formation";
import type { ContractStatus, Finding, FormationCheckKind, Provenance } from "./types";

export type StartFault =
  | "NOT_NUMBER_ALLOCATED"
  | "AWARD_NOT_LIVE"
  | "NO_TIME_ZONE"
  | "BASIS_NOT_SET"
  | "BASIS_BQ_NOT_SET"
  | "NO_DOCUMENT_PARTS"
  | "LEGAL_OFFICE_NOT_SET"
  | "LEGAL_OFFICE_UNKNOWN"
  | "SIGNATORY_COND_NOT_SET"
  | "STAMP_NOT_SET"
  | "NO_COPY_RECIPIENTS";

export interface StartInputs {
  status: ContractStatus;
  awardStatus: string;
  today: string | null;
  basis: { code: string | null; name: string | null; requiresBq: boolean | null };
  parts: number;
  policy: { legalOfficeCode: string | null; legalOfficeKnown: boolean; signatoryCond: string | null; controlledCopyStampEn: string | null };
  recipients: number;
}

/// Why preparation may not start; each names the setting (Configuration › Contracts, or the basis).
export function startFaults(i: StartInputs): Finding<StartFault>[] {
  const out: Finding<StartFault>[] = [];
  if (i.status !== "NUMBER_ALLOCATED") out.push({ code: "NOT_NUMBER_ALLOCATED", level: "block" });
  if (!["ISSUED", "ACCEPTED"].includes(i.awardStatus)) out.push({ code: "AWARD_NOT_LIVE", level: "block" });
  if (!i.today) out.push({ code: "NO_TIME_ZONE", level: "block" });
  if (!i.basis.code) out.push({ code: "BASIS_NOT_SET", level: "block" });
  else if (i.basis.requiresBq == null) out.push({ code: "BASIS_BQ_NOT_SET", level: "block", data: { basis: i.basis.name } });
  if (i.basis.code && i.parts === 0) out.push({ code: "NO_DOCUMENT_PARTS", level: "block", data: { basis: i.basis.name } });
  if (!i.policy.legalOfficeCode) out.push({ code: "LEGAL_OFFICE_NOT_SET", level: "block" });
  else if (!i.policy.legalOfficeKnown) out.push({ code: "LEGAL_OFFICE_UNKNOWN", level: "block" });
  if (!i.policy.signatoryCond) out.push({ code: "SIGNATORY_COND_NOT_SET", level: "block" });
  if (!i.policy.controlledCopyStampEn?.trim()) out.push({ code: "STAMP_NOT_SET", level: "block" });
  if (i.recipients === 0) out.push({ code: "NO_COPY_RECIPIENTS", level: "block" });
  return out;
}

export interface FrozenRecipient {
  id: string;
  name: string;
  nameMs: string | null;
  copyForm: string;
  mandatory: boolean;
  onlyWithConsultingEngineer: boolean;
  provenance: Provenance;
}

/// What formation is judged under, frozen at the start (`Contract.formationSnapshot`). Rendered from, never re-read live.
export interface FormationSnapshot {
  v: 1;
  startedOn: string;
  policy: {
    legalOfficeCode: string;
    legalOfficeLabel: string;
    frontLoadingRatio: string | null;
    stampEn: string;
    stampMs: string | null;
    signatoryCond: string;
    provenance: Provenance | null;
  };
  basis: { code: string; name: string; requiresBq: boolean };
  checks: FormationCheckKind[];
  recipients: FrozenRecipient[];
}

export function formationSnapshot(i: { startedOn: string; policy: FormationSnapshot["policy"]; basis: FormationSnapshot["basis"]; recipients: FrozenRecipient[] }): FormationSnapshot {
  return { v: 1, startedOn: i.startedOn, policy: i.policy, basis: i.basis, checks: applicableChecks(i.basis.requiresBq) ?? [], recipients: i.recipients };
}

/// The frozen snapshot, or null where the contract has none (not yet in preparation) or it is not one this code wrote.
export function readFormationSnapshot(json: unknown): FormationSnapshot | null {
  if (!json || typeof json !== "object") return null;
  const s = json as Partial<FormationSnapshot>;
  if (s.v !== 1 || !s.policy || !s.basis || !Array.isArray(s.checks) || !Array.isArray(s.recipients) || typeof s.startedOn !== "string") return null;
  return s as FormationSnapshot;
}
