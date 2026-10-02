/**
 * The facts a contract act is judged on, read once from the rows given (inside the act's transaction,
 * on locked rows, or for the screen), so the screen and the act never say different things. The rules
 * themselves are the pure functions beside this.
 */

import type { Tx } from "@/lib/audit/record";
import { awardFacts } from "@/lib/award/repo";
import { checkSignatory, resolveSignatoryFor, type Signatory } from "@/lib/award/signatory";
import { dayOf, storedDay } from "@/lib/dates";
import { db } from "@/lib/db";
import { senFromDecimal, senToDecimalString } from "@/lib/money";
import { commitmentFault } from "@/lib/requisition/commitment";

import { baselineFaults, latestVersion, type BaselineValues } from "./baseline";
import { readySince } from "./contract-date";
import { formationFaults, type ReconciliationFacts } from "./formation";
import { endorsement } from "./legal";
import { baselineRows, contractGate, frozenInputsOf, liveOf, valuesOf } from "./load";
import { phaseOf } from "./status";
import { readFormationSnapshot } from "./preparation";
import type { LoadedContract } from "./repo";
import type { AssemblyPartState, ContractStatus, FormationCheckKind, LegalDecision, ReconciliationComparison, ReconciliationOutcome } from "./types";
import { signFaults, type SignInputs } from "./sign";

const day = (d: Date | null | undefined) => (d ? storedDay(d) : null);

/// The formation records as the pure rules read them.
export function formationOf(c: LoadedContract["contract"]) {
  const snap = readFormationSnapshot(c.formationSnapshot);
  const parts = c.assemblyParts.map((p) => ({ label: p.labelSnapshot, state: p.state as AssemblyPartState, cancelledStatement: p.cancelledStatement }));
  const reconciliations: ReconciliationFacts[] = c.reconciliations.map((r) => ({
    comparison: r.comparison as ReconciliationComparison,
    outcome: r.outcome as ReconciliationOutcome,
    amendments: r.amendments.map((a) => ({ contractorSignatoryName: a.contractorSignatoryName, contractorSignedOn: day(a.contractorSignedOn), officerSignedOn: day(a.officerSignedOn) })),
  }));
  const checks = c.checks.map((k) => ({ kind: k.kind as FormationCheckKind, completedOn: day(k.completedOn) }));
  const applicable = snap ? snap.checks : null;
  return { snap, parts, reconciliations, checks, applicable, faults: formationFaults({ parts, reconciliations, applicable, checks }) };
}

export const reviewsOf = (c: LoadedContract["contract"]) => c.legalReviews.map((r) => ({ ...r, decision: r.decision as LegalDecision | null, submittedOn: storedDay(r.submittedOn), decidedOn: day(r.decidedOn) }));

/// The values the executed version would carry: the latest version's, else the draft's.
export function currentBaseline(c: LoadedContract["contract"]): BaselineValues | null {
  const { draft, versions } = baselineRows(c);
  const latest = latestVersion(versions);
  return latest ? valuesOf(latest) : draft ? valuesOf(draft) : null;
}

/// The baseline's blocking findings, with the contract type's behaviour and the band as frozen in the draft.
export function baselineBlocks(c: LoadedContract["contract"]) {
  const b = currentBaseline(c);
  if (!b) return { values: null, findings: [], blocks: 1 };
  const inputs = frozenInputsOf(c);
  const findings = baselineFaults(b, { defectsLiabilityApplies: inputs?.type.defectsLiabilityApplies ?? null }, inputs?.band ?? null, inputs?.award);
  return { values: b, findings, blocks: findings.filter((f) => f.level === "block").length };
}

/**
 * Everything the RSAJ signature is judged on, for a named Person (or none, for the screen's list of what
 * else stands in the way). `today` is the organisation's day of the act's own server stamp.
 */
export async function signingFacts(l: LoadedContract, personId: string | null, today: string, client: Tx = db) {
  const c = l.contract;
  const status = c.status as ContractStatus;
  const gate = await contractGate(l, client);
  const form = formationOf(c);
  const f = await awardFacts(l, client);
  const sum = senFromDecimal(c.contractSum);
  const cond = form.snap?.policy.signatoryCond ?? null;
  const signatory: Signatory | null = cond && f.facts.funder ? resolveSignatoryFor(f.facts.funder.dal, { cond, value: Number(senToDecimalString(sum)) }) : null;
  const contractor = c.signatures.find((s) => s.party === "CONTRACTOR") ?? null;
  const witness = c.signatures.find((s) => s.party === "WITNESS") ?? null;
  const resolutionLive = liveOf(c, "COMPANY_RESOLUTION").length > 0;
  const reviews = reviewsOf(c);
  let signer: SignInputs["signer"] = [];
  let delegationId: string | null = null;
  let person: { id: string; name: string } | null = null;
  if (personId && signatory?.ok) {
    const p = f.roster.people.find((x) => x.id === personId) ?? null;
    person = p ? { id: p.id, name: p.name } : null;
    const check = checkSignatory(signatory, p, f.holdersOf(signatory.roleCode), { today, signedOn: today, approvedOn: null, value: sum });
    signer = check.faults;
    delegationId = check.delegationId;
  }
  const bl = baselineBlocks(c);
  const inputs: SignInputs = {
    status,
    gate,
    resolutionLive,
    contractorSignedOn: day(contractor?.signedOn),
    witnessRecorded: !!witness,
    formationFaults: form.faults.length,
    commitment: commitmentFault({ status: f.facts.requisition.status }, f.facts.requisition.route),
    signatoryCond: cond,
    signatory: signatory ? (signatory.ok ? { ok: true } : signatory) : null,
    issueInForce: f.facts.funder != null,
    signer,
    baselineBlocks: bl.blocks,
    today,
  };
  const policies = c.policies.filter((p) => p.status === "VERIFIED");
  const since = readySince([
    endorsement(reviews)?.decidedOn ?? null,
    day(l.award.awardReturn?.signedLetterReceivedOn),
    ...c.securities.filter((s) => s.status === "VERIFIED").map((s) => day(s.verifiedOn)),
    ...policies.map((p) => day(p.verifiedOn)),
    ...policies.map((p) => day(p.wcCheckedOn)),
    // An attachment's instant, read as the organisation's day (never UTC's).
    ...liveOf(c, "COMPANY_RESOLUTION").map((a) => dayOf(a.attachedAt, l.org.timeZone)),
  ]);
  return { inputs, faults: signFaults(inputs), signatory, person, delegationId, gate, form, readySince: since, phase: phaseOf(status, gate, resolutionLive), baseline: bl };
}
