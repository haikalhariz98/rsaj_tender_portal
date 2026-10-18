import { actStatusBlocker } from "@/lib/contract/act-status";
import type { SigningFacts } from "@/lib/contract/case-steps";
import { contractFaultText } from "@/lib/contract/fault-text";
import type { signingFacts } from "@/lib/contract/judge";
import { reviewsOf } from "@/lib/contract/judge";
import { submitFaults } from "@/lib/contract/legal";
import { contractGate, liveOf, loadContractConfig, preparationSettings } from "@/lib/contract/load";
import { startFaults } from "@/lib/contract/preparation";
import type { LoadedContract } from "@/lib/contract/repo";
import { contractorSignFaults, stampFaults } from "@/lib/contract/sign";
import type { ContractStatus } from "@/lib/contract/types";
import { storedDay } from "@/lib/dates";
import { supervisionFaultText } from "@/lib/supervision/labels";
import { possessionFaults, soFromOf } from "@/lib/supervision/possession";
import type { Finding } from "@/lib/supervision/types";

import type { supervisionView } from "./supervision-panels";

/**
 * The words each signing act refuses with, computed once for the panel that holds the act's drawer and for the case page's
 * step bar (Award and Contract Requirements v2, C-2; ADR 0037 F0-2, F0-11). They were inline in the panels and are moved here
 * unchanged, so the bar and the panel cannot disagree about whether an act is open.
 */

type Facts = NonNullable<Awaited<ReturnType<typeof signingFacts>>>;
type Supervision = Awaited<ReturnType<typeof supervisionView>>;
const day = (d: Date | null | undefined) => (d ? storedDay(d) : null);

/// NUMBER_ALLOCATED: why the contract cannot be started yet, in words, and what starting freezes. Null in any other status.
export async function startState(l: LoadedContract, today: string | null): Promise<{ blocker: string | null; frozen: string } | null> {
  const c = l.contract;
  const status = c.status as ContractStatus;
  if (status !== "NUMBER_ALLOCATED") return null;
  const cfg = await loadContractConfig(l.org.id);
  // The same reading the start act makes, on the organisation's day (R-6); with no zone, today's settings are not judged.
  const settings = today ? preparationSettings(cfg, l.ex.contractBasisCode, today) : null;
  const basis = settings?.basis ?? null;
  const p = cfg.policy;
  const fs = startFaults({
    status,
    awardStatus: l.award.status,
    today,
    basis: { code: l.ex.contractBasisCode, name: basis?.nameEn ?? null, requiresBq: basis?.requiresBq ?? null },
    parts: settings?.parts.length ?? 0,
    policy: { legalOfficeCode: p?.legalOfficeCode ?? null, legalOfficeKnown: settings?.legalOfficeKnown ?? false, signatoryCond: p?.signatoryCond ?? null, controlledCopyStampEn: p?.controlledCopyStampEn ?? null },
    recipients: settings?.recipients.length ?? 0,
  });
  return { blocker: fs.length ? fs.map(contractFaultText).join(" ") : null, frozen: "the legal office, the front-loading ratio, the controlled-copy stamp and recipients, the signatory condition, and the basis's checks and document parts" };
}

/// IN_PREPARATION and RETURNED_FOR_AMENDMENT: what stops the contract going to the legal office, in words; null when nothing does.
export function submitLegalBlocker(l: LoadedContract, facts: Facts): string | null {
  const c = l.contract;
  const reviews = reviewsOf(c);
  const docs = liveOf(c, "LEGAL_SUBMISSION");
  const fs = submitFaults({ status: c.status as ContractStatus, officeCode: facts.form.snap?.policy.legalOfficeCode ?? null, submissionDocuments: docs.length, formationFaults: facts.form.faults.length, reviews });
  return fs.length ? fs.map(contractFaultText).join(" ") : null;
}

/// Why the contractor's signature cannot be recorded yet, as findings.
export function contractorSignBlock(l: LoadedContract, facts: Facts, today: string | null) {
  const c = l.contract;
  const contractor = c.signatures.find((s) => s.party === "CONTRACTOR");
  const endorsedOn = reviewsOf(c).filter((x) => x.decision === "ENDORSED").sort((a, b) => b.iteration - a.iteration)[0]?.decidedOn ?? null;
  return today ? contractorSignFaults({ status: c.status as ContractStatus, gate: facts.gate, resolutionLive: facts.inputs.resolutionLive, alreadySigned: !!contractor, signatory: { name: "-", icNumber: "000000-00-0000" }, witness: { name: "-", icNumber: "000000-00-0000" }, signedOn: today, today, endorsedOn }) : [];
}

/// Why stamping cannot be recorded yet, as findings.
export function stampBlock(l: LoadedContract, today: string | null) {
  const c = l.contract;
  return today ? stampFaults({ status: c.status as ContractStatus, stampedOn: today, reference: "-", contractDate: day(c.contractDate), today }).filter((f) => f.code !== "BEFORE_CONTRACT_DATE") : [];
}

const zone = (today: string | null) => (today ? null : "Set the organisation's time zone first.");
const say = (fs: readonly Finding[]) => (fs.length ? fs.map(supervisionFaultText).join(" ") : null);

/// STAMPED: why possession of site cannot be recorded yet, in words (null: nothing stops it). `v` is `supervisionView`'s answer.
export async function possessionBlockerOf(l: LoadedContract, v: Supervision, today: string | null): Promise<string | null> {
  const c = l.contract;
  let possessionBlocker: string | null = zone(today);
  if (!v.s.possession && today && !possessionBlocker) {
    const gate = await contractGate(l);
    possessionBlocker = say(possessionFaults({ status: c.status, possessed: false, versions: v.versions, on: today, today, datedOn: day(c.contractDate), startRequiresSecurities: v.type?.startRequiresSecurities ?? null, typeName: v.type?.nameEn ?? null, gate: gate.items, soFrom: soFromOf(v.s.soAssignments.map((a) => ({ effectiveOn: storedDay(a.effectiveOn) }))) }));
  }
  return possessionBlocker;
}

/**
 * The act today's page offers for the contract's status, with its Blocked words (ADR 0037 F0-11). `start` is given at
 * NUMBER_ALLOCATED and `possession` at STAMPED, because they are the only two that need a reader of their own.
 */
export function signingActOf(
  l: LoadedContract,
  facts: Facts | null,
  today: string | null,
  start: { blocker: string | null } | null,
  possession: { blocker: string | null; hidden: boolean } | null,
): SigningFacts["act"] {
  const c = l.contract;
  const status = c.status as ContractStatus;
  // Review S1: the family's row first, in the acts' own words.
  const shut = actStatusBlocker("FORMATION", status);
  const blocked = (action: NonNullable<SigningFacts["act"]>["action"], specific: string | null) => ({ action, blocker: shut ?? specific });
  switch (status) {
    case "NUMBER_ALLOCATED":
      return start ? blocked("START_PREPARATION", start.blocker) : null;
    case "IN_PREPARATION":
    case "RETURNED_FOR_AMENDMENT":
      return facts ? blocked("SUBMIT_TO_LEGAL", submitLegalBlocker(l, facts)) : null;
    case "LEGALLY_ENDORSED": {
      if (!facts) return null;
      // The contractor's signature first, then, once it is recorded, the employer's, which executes (SigningSection).
      const contractor = c.signatures.find((s) => s.party === "CONTRACTOR");
      const words = contractor ? facts.faults.map(contractFaultText) : contractorSignBlock(l, facts, today).map(contractFaultText);
      return blocked("RECORD_SIGNATURE", words.length ? words.join(" ") : null);
    }
    case "EXECUTED": {
      const words = stampBlock(l, today).map(contractFaultText);
      return blocked("RECORD_STAMPING", words.length ? words.join(" ") : null);
    }
    case "STAMPED":
      if (!possession || possession.hidden) return null;
      return blocked("RECORD_POSSESSION", possession.blocker);
    default:
      return null;
  }
}
