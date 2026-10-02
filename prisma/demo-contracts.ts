/**
 * Contract formation demo (6.12). Invented throughout, ASSUMED; no RSAJ figure, office or list.
 *
 * - Configuration: a "Demo Legal Office" unit (demo_ku1), the contract controls (demo_kpo1: that office,
 *   the demo contract-agreement signatory rows, a stamp, a front-loading ratio of 1.5), the Contract
 *   Document's parts for both demo bases (demo_kdp*), four controlled-copy recipients (demo_kre*), one
 *   only where a consulting engineer is engaged. Rows on the demo matrix name who signs the agreement
 *   (demo_rule14, demo_rule15). Only where the organisation has no contract controls of its own.
 * - The three contracts numbered at issue (6.11's demo) are formed on and after the day each was issued,
 *   and nothing is dated after the load day (X-10 a):
 *   - demo_con3 (the accepted indent, its gate met): prepared, reconciled, checked, its baseline keyed
 *     where nothing stated a value and confirmed, endorsed at the first iteration, signed by both sides,
 *     executed (Contract Date 30 Sep 2026), stamped, distributed and its originals in custody.
 *   - demo_con2 (the issued indent, nothing lodged): legally endorsed and awaiting its conditions
 *     precedent (the derived phase), its baseline a draft.
 *   - demo_con1 (the Letter of Acceptance): returned by the legal office once, with comments.
 * - Every act is judged by the product's own rule before its rows are written (X-10 c): the start, each
 *   check, each submission and decision, both signatures (the RSAJ one through `signingFacts`, the act's
 *   own reading), stamping, each copy and movement; any refusal stops the load naming it.
 * - Ids: the demo_k family (kpo, kdp, kre, ku, kap, kro, kam, kch, kar, krt, klr, ksg, kib, kbl, ksn,
 *   kio, kst, kmv, kdoc, kau), never a prefix another module wipes; demo_rule14–15.
 */

import { createHash } from "node:crypto";

import type { PrismaClient } from "../src/generated/prisma/client";
import { demoPdf, writeDemoDocs, type DemoDoc } from "./demo-documents";

type Db = PrismaClient;
const P = "demo_";
const day = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
/// An instant, written as UTC (10:00 in Kuala Lumpur is 02:00 UTC).
const at = (iso: string) => new Date(`${iso}:00.000Z`);
const sha = (b: Uint8Array) => createHash("sha256").update(b).digest("hex");

function fail(what: string, faults: readonly { code: string }[]) {
  if (faults.length) throw new Error(`Demo contract act refused (${what}): ${faults.map((f) => f.code).join(", ")}`);
}

// ------------------------------------------------------------------ configuration

export async function configureContractsDemo(db: Db, organisationId: string) {
  if (await db.contractPolicy.findUnique({ where: { organisationId } })) {
    console.log("Contract controls already exist for this organisation: the demo's are not loaded, and neither are its contracts' formation records.");
    return false;
  }
  await db.orgUnit.create({ data: { id: `${P}ku1`, organisationId, code: "DEMO-LEGAL", nameEn: "Demo Legal Office", nameMs: "Pejabat Undang-undang Demo", kind: "DEPARTMENT", parentCode: "GRP", provenance: "ASSUMED", sortOrder: 9, effectiveFrom: day("2024-01-01") } });
  // Who signs the contract agreement: invented edges on the demo limits, on the demo's own condition.
  const sig = { authorityMatrixId: `${P}mx1`, domain: "award_signatory", cond: "demo_contract_agreement" };
  await db.authorityRule.createMany({
    data: [
      { id: `${P}rule14`, ...sig, ruleKey: "demo.signatory.agreement.1", maxValue: "300000", followsBoundarySwitch: true, labelEn: "Contract agreement, up to RM300,000", approverCode: "DEPT_HEAD", clause: "DEMO 6.3(a)", sortOrder: 14 },
      { id: `${P}rule15`, ...sig, ruleKey: "demo.signatory.agreement.2", minValue: "300000", followsBoundarySwitch: true, labelEn: "Contract agreement, above RM300,000", approverCode: "CEO", nonDelegable: true, clause: "DEMO 6.3(b)", sortOrder: 15 },
    ],
  });
  await db.contractPolicy.create({
    data: {
      id: `${P}kpo1`, organisationId, legalOfficeCode: "DEMO-LEGAL", frontLoadingRatio: "1.5", controlledCopyStampEn: "CONTROLLED COPY (demo)", controlledCopyStampMs: "SALINAN TERKAWAL (demo)", signatoryCond: "demo_contract_agreement",
      provenance: "ASSUMED", notes: "Invented for the demo. A customer sets its own legal office, signatory rows, stamp and ratio.",
    },
  });
  const part = (n: number, basis: string, printed: string, labelEn: string, labelMs: string) => ({ id: `${P}kdp${n}`, organisationId, contractBasisCode: basis, code: `demo_part_${basis}_${printed}`, printedNumber: printed, labelEn, labelMs, provenance: "ASSUMED" as const, sortOrder: Number(printed) * 10 });
  await db.contractDocumentPart.createMany({
    data: [
      part(1, "bq", "1", "Form of agreement", "Borang perjanjian"),
      part(2, "bq", "2", "Letter of Acceptance", "Surat Setuju Terima"),
      part(3, "bq", "3", "Conditions of contract and its Appendix", "Syarat kontrak dan Lampirannya"),
      part(4, "bq", "4", "Bills of quantities", "Senarai kuantiti"),
      part(5, "bq", "5", "Drawings", "Lukisan"),
      part(6, "ds", "1", "Form of agreement", "Borang perjanjian"),
      part(7, "ds", "2", "Letter of Acceptance", "Surat Setuju Terima"),
      part(8, "ds", "3", "Conditions of contract and its Appendix", "Syarat kontrak dan Lampirannya"),
      part(9, "ds", "4", "Specification and schedule of rates", "Spesifikasi dan jadual kadar"),
      part(10, "ds", "5", "Drawings", "Lukisan"),
    ],
  });
  await db.controlledCopyRecipient.createMany({
    data: [
      { id: `${P}kre1`, organisationId, code: "demo_contracts_office", nameEn: "Contracts office (demo)", nameMs: "Pejabat kontrak (demo)", copyForm: "One original with drawings and a PDF", mandatory: true, provenance: "ASSUMED", sortOrder: 1 },
      { id: `${P}kre2`, organisationId, code: "demo_contractor", nameEn: "The contractor", nameMs: "Kontraktor", copyForm: "One copy with drawings", mandatory: true, provenance: "ASSUMED", sortOrder: 2 },
      { id: `${P}kre3`, organisationId, code: "demo_site_rep", nameEn: "Site representative (demo)", nameMs: "Wakil tapak (demo)", copyForm: "A PDF", mandatory: true, provenance: "ASSUMED", sortOrder: 3 },
      { id: `${P}kre4`, organisationId, code: "demo_consultant", nameEn: "Consulting engineer (demo)", nameMs: "Jurutera perunding (demo)", copyForm: "One copy with drawings", mandatory: true, onlyWithConsultingEngineer: true, provenance: "ASSUMED", sortOrder: 4 },
    ],
  });
  return true;
}

// ------------------------------------------------------------------ formation

interface Ctx {
  db: Db;
  organisationId: string;
  audit: { id: string; organisationId: string; entity: string; entityId: string; entityLabel: string; action: "CREATE" | "UPDATE" | "DELETE"; at: Date; changes: object[]; reason: string; unattributed: boolean }[];
}

export async function loadContractsDemo(db: Db, organisationId: string) {
  const { diffFields } = await import("../src/lib/audit/diff");
  const { maskIc } = await import("../src/lib/award/mask");
  const { buildBaseline, baselineFaults, changedFields, derive, enteredFaults } = await import("../src/lib/contract/baseline");
  const { applicableChecks, completeFaults, formationFaults, reconciliationFaults, amendmentFaults } = await import("../src/lib/contract/formation");
  const { formationSnapshot, startFaults } = await import("../src/lib/contract/preparation");
  const { submitFaults, decideFaults } = await import("../src/lib/contract/legal");
  const { contractorSignFaults, stampFaults, briefingFaults } = await import("../src/lib/contract/sign");
  const { issueFaults, acknowledgeFaults } = await import("../src/lib/contract/copies");
  const { movementFaults, registerFaults } = await import("../src/lib/contract/custody");
  const { confirmFaults } = await import("../src/lib/contract/versions");
  const { contractLabel, loadContract } = await import("../src/lib/contract/repo");
  const { baselineInputsOf, contractGate, inputsToJson, rowOf, sectionRows } = await import("../src/lib/contract/load");
  const { signingFacts } = await import("../src/lib/contract/judge");
  const { executedSnapshot } = await import("../src/lib/contract/executed-snapshot");
  const { parseSen, senToDecimalString } = await import("../src/lib/money");

  const c: Ctx = { db, organisationId, audit: [] };
  let n = 0;
  const audit = (entity: string, entityId: string, label: string, action: "CREATE" | "UPDATE" | "DELETE", when: string, changes: object[], reason = "") => c.audit.push({ id: `${P}kau${++n}`, organisationId, entity, entityId, entityLabel: label, action, at: at(when), changes, reason, unattributed: true });
  const ON_BEHALF = "recorded on behalf of, not signed";
  const people = { daniel: { id: `${P}p4`, name: "Daniel Anak Jelani" }, chen: { id: `${P}p3`, name: "Chen Wei Ling" }, imran: { id: `${P}p9`, name: "Imran Hakim" } };
  const policy = (await db.contractPolicy.findUnique({ where: { organisationId } }))!;
  const recipients = await db.controlledCopyRecipient.findMany({ where: { organisationId, retiredOn: null }, orderBy: { sortOrder: "asc" } });
  const bases = await db.contractBasis.findMany({ where: { organisationId } });
  const internal = { classId: `${P}dc1`, className: "Contract documents", classification: "INTERNAL" as const };
  let docN = 0;
  /// A document attached to a contract at the instant given (UTC), written at once: later acts read it.
  const doc = async (contractId: string, ownerLabel: string, title: string, purpose: DemoDoc["attachments"][number]["purpose"], when: string, lines: string[]) => {
    const k = ++docN;
    const bytes = demoPdf(lines);
    const d: DemoDoc = { id: `${P}kdoc${k}`, title, ...internal, createdAt: when, versions: [{ id: `${P}kdoc${k}v1`, n: 1, bytes, mediaType: "application/pdf", filename: `${title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.pdf`, receivedOn: when.slice(0, 10), storedAt: when }], attachments: [{ id: `${P}kdoc${k}a1`, purpose, owner: { contractId }, ownerLabel, versionId: `${P}kdoc${k}v1`, at: when }] };
    const entry = await writeDemoDocs(db, organisationId, [d], `${P}kdocau${k}_`, people.chen);
    await entry.flush();
    return { versionId: `${P}kdoc${k}v1`, documentId: `${P}kdoc${k}`, title, versionNo: 1, sha256: sha(bytes) };
  };

  /// One contract's formation, act by act, each judged before it is written.
  async function form(id: string, plan: {
    startedAt: string;
    reconciled: { on: string; outcomes: ("MATCHES" | "AMENDED")[]; amendment?: { description: string; contractor: string } };
    checks: { on: string; corrections: { item: string; description: string; tendered: string; corrected: string; reason: string }[]; rates: { item: string; description: string; tendered: string; estimate: string; provisional?: boolean }[]; frontNote: string; otherNote: string };
    entered: Record<string, { value: unknown; provenance: "STATED" | "OBSERVED" | "ASSUMED"; note: string }>;
    confirmAt?: string;
    legal: { sentAt: string; decisions: { decision: "ENDORSED" | "RETURNED"; on: string; comments: string; commentsDoc?: boolean; resendAt?: string }[] };
  }) {
    const l0 = (await loadContract(id))!;
    const label = contractLabel({ number: l0.contract.number, award: { awardeeName: l0.award.awardeeName } });
    const basis = bases.find((b) => b.code === l0.ex.contractBasisCode)!;
    const parts = await db.contractDocumentPart.findMany({ where: { organisationId, contractBasisCode: basis.code, retiredOn: null }, orderBy: [{ sortOrder: "asc" }] });
    const startedOn = plan.startedAt.slice(0, 10);
    fail(`${id} start`, startFaults({ status: "NUMBER_ALLOCATED", awardStatus: l0.award.status, today: startedOn, basis: { code: basis.code, name: basis.nameEn, requiresBq: basis.requiresBq }, parts: parts.length, policy: { legalOfficeCode: policy.legalOfficeCode, legalOfficeKnown: true, signatoryCond: policy.signatoryCond, controlledCopyStampEn: policy.controlledCopyStampEn }, recipients: recipients.length }));
    const snap = formationSnapshot({
      startedOn,
      policy: { legalOfficeCode: policy.legalOfficeCode!, legalOfficeLabel: "Demo Legal Office", frontLoadingRatio: policy.frontLoadingRatio?.toString() ?? null, stampEn: policy.controlledCopyStampEn!, stampMs: policy.controlledCopyStampMs, signatoryCond: policy.signatoryCond!, provenance: "ASSUMED" },
      basis: { code: basis.code, name: basis.nameEn, requiresBq: basis.requiresBq! },
      recipients: recipients.map((r) => ({ id: r.id, name: r.nameEn, nameMs: r.nameMs, copyForm: r.copyForm, mandatory: r.mandatory, onlyWithConsultingEngineer: r.onlyWithConsultingEngineer, provenance: r.provenance })),
    });
    const k = id.replace(P, "");
    await db.contract.update({ where: { id }, data: { status: "IN_PREPARATION", preparationStartedAt: at(plan.startedAt), formationSnapshot: snap as never } });
    audit("Contract", id, label, "UPDATE", plan.startedAt, diffFields({ status: "NUMBER_ALLOCATED" }, { status: "IN_PREPARATION", legalOffice: snap.policy.legalOfficeLabel, frontLoadingRatio: snap.policy.frontLoadingRatio, basis: snap.basis.name, parts: parts.length, checks: snap.checks.length, copyRecipients: recipients.length }));
    for (const [i, p] of parts.entries()) await db.contractAssemblyPart.create({ data: { id: `${P}kap_${k}_${i + 1}`, organisationId, contractId: id, partCode: p.code, labelSnapshot: p.labelEn, labelMsSnapshot: p.labelMs, printedNumber: p.printedNumber, sortOrder: p.sortOrder } });
    const checks = applicableChecks(basis.requiresBq)!;
    for (const kind of checks) await db.formationCheck.create({ data: { id: `${P}kch_${k}_${kind.toLowerCase()}`, organisationId, contractId: id, kind, ratioSnapshot: kind === "FRONT_LOADING" ? snap.policy.frontLoadingRatio : null } });

    // The baseline's draft, from what the award, the Appendix and the bill state.
    const inputs = await baselineInputsOf(l0);
    const draft0 = buildBaseline(inputs);
    const blId = `${P}kbl_${k}_draft`;
    await db.contractBaseline.create({ data: { id: blId, organisationId, contractId: id, ...rowOf(draft0), entered: {}, snapshot: { inputs: inputsToJson(inputs), builtOn: startedOn } } });
    audit("ContractBaseline", blId, `${label} · baseline draft`, "CREATE", plan.startedAt, diffFields(null, { built: startedOn, appendix: inputs.appendix ? `pack version ${inputs.appendix.packVersion}` : "none frozen", bill: inputs.bq ? `version ${inputs.bq.versionNo}` : "none pinned" }));

    // Reconciliation: the three comparisons, the addenda as they stood, an amendment signed by both.
    const reconOn = plan.reconciled.on;
    const comparisons = ["TENDER_DOCUMENT", "TENDER_TABLE_DOCUMENT", "DRAWINGS"] as const;
    for (const [i, cmp] of comparisons.entries()) {
      const outcome = plan.reconciled.outcomes[i];
      const rid = `${P}kro_${k}_${i + 1}`;
      await db.contractReconciliation.create({ data: { id: rid, organisationId, contractId: id, comparison: cmp, outcome, addendaSnapshot: [], checkedByPersonId: people.daniel.id, checkedOn: day(reconOn.slice(0, 10)), recordedAt: at(reconOn) } });
      audit("ContractReconciliation", rid, `${label} · reconciliation ${cmp.toLowerCase().replace(/_/g, " ")}`, "CREATE", reconOn, diffFields(null, { outcome, checkedBy: people.daniel.name, checkedOn: day(reconOn.slice(0, 10)), addendaListed: 0, recordedOnBehalf: ON_BEHALF }));
      if (outcome === "AMENDED" && plan.reconciled.amendment) {
        const a = plan.reconciled.amendment;
        fail(`${id} amendment`, amendmentFaults({ description: a.description, contractorSignatoryName: a.contractor, contractorSignedOn: reconOn.slice(0, 10), officerSignedOn: reconOn.slice(0, 10) }, reconOn.slice(0, 10)));
        await db.reconciliationAmendment.create({ data: { id: `${P}kam_${k}_1`, organisationId, reconciliationId: rid, description: a.description, contractorSignatoryName: a.contractor, contractorSignedOn: day(reconOn.slice(0, 10)), officerPersonId: people.daniel.id, officerSignedOn: day(reconOn.slice(0, 10)), recordedAt: at(reconOn) } });
        audit("ReconciliationAmendment", `${P}kam_${k}_1`, `${label} · reconciliation amendment`, "CREATE", reconOn, diffFields(null, { description: a.description, contractorSignatory: a.contractor, contractorSignedOn: day(reconOn.slice(0, 10)), officer: people.daniel.name, officerSignedOn: day(reconOn.slice(0, 10)), recordedOnBehalf: ON_BEHALF }));
      }
    }
    const recFacts = comparisons.map((cmp, i) => ({ comparison: cmp, outcome: plan.reconciled.outcomes[i], amendments: plan.reconciled.outcomes[i] === "AMENDED" ? [{ contractorSignatoryName: "x", contractorSignedOn: reconOn.slice(0, 10), officerSignedOn: reconOn.slice(0, 10) }] : [] }));
    fail(`${id} reconciliation`, reconciliationFaults(recFacts));

    // The checks, each with its lines, completed on its day.
    const chOn = plan.checks.on;
    for (const [i, x] of plan.checks.corrections.entries()) {
      const cid = `${P}kar_${k}_${i + 1}`;
      await db.arithmeticCorrection.create({ data: { id: cid, organisationId, checkId: `${P}kch_${k}_arithmetic`, itemRef: x.item, description: x.description, tendered: x.tendered, corrected: x.corrected, reason: x.reason, recordedAt: at(chOn) } });
      audit("ArithmeticCorrection", cid, `${label} · correction ${x.item}`, "CREATE", chOn, diffFields(null, { itemRef: x.item, tenderedLineAmount: x.tendered, correctedLineAmount: x.corrected, reason: x.reason }));
    }
    for (const [i, x] of plan.checks.rates.entries()) {
      const rid = `${P}krt_${k}_${i + 1}`;
      await db.rateComparison.create({ data: { id: rid, organisationId, checkId: `${P}kch_${k}_front_loading`, itemRef: x.item, description: x.description, provisional: !!x.provisional, tenderedRate: x.tendered, estimateRate: x.estimate, recordedAt: at(chOn) } });
      audit("RateComparison", rid, `${label} · rate ${x.item}`, "CREATE", chOn, diffFields(null, { itemRef: x.item, provisional: !!x.provisional, tenderedRate: x.tendered }));
    }
    const rates = plan.checks.rates.map((x) => ({ itemRef: x.item, tenderedRate: parseSen(x.tendered), estimateRate: parseSen(x.estimate), provisional: !!x.provisional }));
    for (const kind of checks) {
      const note = kind === "FRONT_LOADING" ? plan.checks.frontNote : plan.checks.otherNote;
      fail(`${id} check ${kind}`, completeFaults({ kind, applicable: checks, completedOn: null, on: chOn.slice(0, 10), today: chOn.slice(0, 10), preparationOn: startedOn, note, rates, ratio: snap.policy.frontLoadingRatio }));
      const cid = `${P}kch_${k}_${kind.toLowerCase()}`;
      await db.formationCheck.update({ where: { id: cid }, data: { completedByPersonId: people.daniel.id, completedOn: day(chOn.slice(0, 10)), completedAt: at(chOn), note } });
      audit("FormationCheck", cid, `${label} · check ${kind.toLowerCase().replace(/_/g, " ")}`, "UPDATE", chOn, diffFields({ completedOn: null }, { completedOn: day(chOn.slice(0, 10)), completedBy: people.daniel.name, recordedOnBehalf: ON_BEHALF }));
    }
    fail(`${id} formation`, formationFaults({ parts: parts.map((p) => ({ label: p.labelEn, state: "READY", cancelledStatement: "" })), reconciliations: recFacts, applicable: checks, checks: checks.map((kind) => ({ kind, completedOn: chOn.slice(0, 10) })) }));

    // What nothing else stated, keyed at baseline with the provenance the officer chose (OD-5 A).
    const enteredValues = Object.fromEntries(Object.entries(plan.entered).map(([g, v]) => [g, v.value]));
    fail(`${id} entered`, enteredFaults(inputs, enteredValues, plan.entered));
    const draft = buildBaseline(inputs, enteredValues);
    const enteredJson = JSON.parse(JSON.stringify(plan.entered, (_, v) => (typeof v === "bigint" ? `sen:${v.toString()}` : v)));
    await db.contractBaseline.update({ where: { id: blId }, data: { ...rowOf(draft), entered: enteredJson } });
    for (const [i, s] of sectionRows(draft, organisationId).entries()) await db.contractSection.create({ data: { id: `${P}ksn_${k}_d${i + 1}`, ...s, baselineId: blId } });
    if (Object.keys(plan.entered).length) audit("ContractBaseline", blId, `${label} · baseline draft`, "UPDATE", chOn, diffFields({}, { entered: Object.keys(plan.entered).join(", "), source: "entered at baseline, not from a tender Appendix", changed: changedFields(draft0, draft).join(", ") }));

    // Confirmed before the first valuation, once the readiness gate holds (OD-2 A).
    let versions = 0;
    const writeVersion = async (v: typeof draft, reason: "CONFIRMED" | "EXECUTED", when: string, from: string) => {
      versions++;
      const vid = `${P}kbl_${k}_v${versions}`;
      const d = derive(v, inputs.interimPolicy);
      await db.contractBaseline.create({ data: { id: vid, organisationId, contractId: id, version: versions, reason, recordedAt: at(when), recordedOn: day(when.slice(0, 10)), ...rowOf(d), entered: enteredJson, snapshot: { inputs: inputsToJson(inputs), builtOn: startedOn, from } } });
      for (const [i, s] of sectionRows(d, organisationId).entries()) await db.contractSection.create({ data: { id: `${P}ksn_${k}_v${versions}_${i + 1}`, ...s, baselineId: vid } });
      audit("ContractBaseline", vid, `${label} · baseline version ${versions}`, "CREATE", when, diffFields(null, { version: versions, reason, changed: reason === "CONFIRMED" ? "all" : "contractDate" }));
      return d;
    };
    const blockers = baselineFaults(draft, { defectsLiabilityApplies: inputs.type.defectsLiabilityApplies }, inputs.band, inputs.award).filter((f) => f.level === "block");
    if (plan.confirmAt) {
      const gate = await contractGate(l0);
      fail(`${id} confirm`, confirmFaults({ status: "IN_PREPARATION", hasDraft: true, versions: 0, gateReady: gate.ready, baselineBlocks: blockers.length }));
      await writeVersion(draft, "CONFIRMED", plan.confirmAt, "draft");
    }

    // Legal review: each iteration pins what went, decided on its day; a return goes back by resubmission.
    let sent = plan.legal.sentAt;
    let iteration = 0;
    let status: "IN_PREPARATION" | "RETURNED_FOR_AMENDMENT" | "PENDING_LEGAL_ENDORSEMENT" | "LEGALLY_ENDORSED" = "IN_PREPARATION";
    for (const d of plan.legal.decisions) {
      iteration++;
      const pin = await doc(id, label, `Contract Document for legal review, iteration ${iteration}, ${l0.contract.number}`, "LEGAL_SUBMISSION", sent, [`Contract Document for legal review (demo) — ${l0.contract.number}`, "Conditions of contract, the signed Letter of Acceptance and the bill or schedule.", `Iteration ${iteration}.`]);
      fail(`${id} submit ${iteration}`, submitFaults({ status, officeCode: snap.policy.legalOfficeCode, submissionDocuments: 1, formationFaults: 0, reviews: [] }));
      const lid = `${P}klr_${k}_${iteration}`;
      await db.legalReview.create({ data: { id: lid, organisationId, contractId: id, iteration, officeCode: snap.policy.legalOfficeCode, officeLabel: snap.policy.legalOfficeLabel, submittedAt: at(sent), submittedOn: day(sent.slice(0, 10)), submittedByPersonId: people.daniel.id, pinnedVersions: [pin] } });
      audit("LegalReview", lid, `${label} · legal review ${iteration}`, "CREATE", sent, diffFields(null, { iteration, office: snap.policy.legalOfficeLabel, sentBy: people.daniel.name, documents: `${pin.title} v1` }));
      audit("Contract", id, label, "UPDATE", sent, diffFields({ status }, { status: "PENDING_LEGAL_ENDORSEMENT" }));
      status = "PENDING_LEGAL_ENDORSEMENT";
      if (d.commentsDoc) await doc(id, label, `Legal office's comments, iteration ${iteration}, ${l0.contract.number}`, "LEGAL_COMMENTS", d.on, [`Legal office's comments (demo) — ${l0.contract.number}`, d.comments]);
      fail(`${id} decide ${iteration}`, decideFaults({ open: { iteration, decision: null, submittedOn: sent.slice(0, 10), decidedOn: null }, decision: d.decision, comments: d.comments, commentsAttached: !!d.commentsDoc, decidedOn: d.on.slice(0, 10), today: d.on.slice(0, 10) }));
      await db.legalReview.update({ where: { id: lid }, data: { decision: d.decision, decidedOn: day(d.on.slice(0, 10)), decidedAt: at(d.on), reviewerPersonId: people.chen.id, comments: d.comments } });
      const to = d.decision === "ENDORSED" ? "LEGALLY_ENDORSED" : "RETURNED_FOR_AMENDMENT";
      audit("LegalReview", lid, `${label} · legal review ${iteration}`, "UPDATE", d.on, diffFields({ decision: null }, { decision: d.decision, decidedOn: day(d.on.slice(0, 10)), decidedBy: people.chen.name, comments: d.comments, recordedOnBehalf: ON_BEHALF }));
      audit("Contract", id, label, "UPDATE", d.on, diffFields({ status }, { status: to }));
      status = to;
      if (d.resendAt) sent = d.resendAt;
    }
    await db.contract.update({ where: { id }, data: { status } });
    return { label, inputs, draft, writeVersion, number: l0.contract.number, enteredJson };
  }

  // ---------------------------------------------------------------- demo_con3: executed, stamped, distributed

  const con3 = await form(`${P}con3`, {
    startedAt: "2026-09-24T02:00",
    reconciled: { on: "2026-09-25T02:30", outcomes: ["MATCHES", "MATCHES", "MATCHES"] },
    checks: {
      on: "2026-09-25T06:00",
      corrections: [{ item: "2.1", description: "Valve chamber covers", tendered: "1250.00", corrected: "1205.00", reason: "Quantity times rate extended wrongly on the priced schedule." }],
      rates: [
        { item: "1.1", description: "Mobilisation", tendered: "900.00", estimate: "400.00" },
        { item: "3.2", description: "Excavation in rock", tendered: "150.00", estimate: "120.00", provisional: true },
      ],
      frontNote: "Mobilisation above the ratio: the contractor's breakdown was checked and accepted; no adjustment.",
      otherNote: "",
    },
    entered: {
      sums: { value: { pc: parseSen("0.00"), ps: parseSen("2000.00") }, provenance: "ASSUMED", note: "From the priced indent schedule: no prime cost sum, one provisional sum (demo)." },
      subsequentInterim: { value: parseSen("1000.00"), provenance: "ASSUMED", note: "Invented for the demo." },
      sectional: { value: { applies: false, sections: [] }, provenance: "ASSUMED", note: "One section only (demo)." },
    },
    confirmAt: "2026-09-26T03:00",
    legal: { sentAt: "2026-09-26T06:00", decisions: [{ decision: "ENDORSED", on: "2026-09-29T02:00", comments: "" }] },
  });
  {
    const id = `${P}con3`;
    const label = con3.label;
    // The company resolution, then the contractor's signature with its witness.
    await doc(id, label, `Company resolution, Contoh Supplies Enterprise`, "COMPANY_RESOLUTION", "2026-09-29T03:00", ["Proof of signing authority (demo)", "Contoh Supplies Enterprise", "The proprietor signs for the firm."]);
    const l = (await loadContract(id))!;
    const gate = await contractGate(l);
    const signatory = { name: "Lim Ah Seng", icNumber: "750101-01-1234" };
    const witness = { name: "Nur Aina binti Hassan", icNumber: "880202-02-2345" };
    fail("con3 contractor", contractorSignFaults({ status: "LEGALLY_ENDORSED", gate, resolutionLive: true, alreadySigned: false, signatory, witness, signedOn: "2026-09-29", today: "2026-09-29", endorsedOn: "2026-09-29" }));
    await db.contractSignature.createMany({
      data: [
        { id: `${P}ksg_con3_c`, organisationId, contractId: id, party: "CONTRACTOR", name: signatory.name, icNumber: signatory.icNumber, capacity: "Proprietor", signedOn: day("2026-09-29"), recordedAt: at("2026-09-29T06:00") },
        { id: `${P}ksg_con3_w`, organisationId, contractId: id, party: "WITNESS", name: witness.name, icNumber: witness.icNumber, signedOn: day("2026-09-29"), recordedAt: at("2026-09-29T06:00") },
      ],
    });
    audit("ContractSignature", `${P}ksg_con3_c`, `${label} · contractor's signature`, "CREATE", "2026-09-29T06:00", diffFields(null, { party: "CONTRACTOR", name: signatory.name, icNumber: maskIc(signatory.icNumber), capacity: "Proprietor", signedOn: day("2026-09-29"), recordedOnBehalf: ON_BEHALF }));
    audit("ContractSignature", `${P}ksg_con3_w`, `${label} · witness`, "CREATE", "2026-09-29T06:00", diffFields(null, { party: "WITNESS", name: witness.name, icNumber: maskIc(witness.icNumber), signedOn: day("2026-09-29"), recordedOnBehalf: ON_BEHALF }));

    // The RSAJ signature, judged by the act's own reading on 30 Sep: the Contract Date is that day.
    const contractDate = "2026-09-30";
    const signedAt = "2026-09-30T02:00";
    const s = await signingFacts((await loadContract(id))!, people.imran.id, contractDate);
    fail("con3 RSAJ signature", s.faults);
    if (!s.signatory?.ok || !s.person) throw new Error("con3: the signatory did not resolve");
    await db.contractSignature.create({ data: { id: `${P}ksg_con3_r`, organisationId, contractId: id, party: "RSAJ", personId: s.person.id, name: s.person.name, signedOn: day(contractDate), recordedAt: at(signedAt), roleCode: s.signatory.roleCode, roleLabel: s.signatory.roleLabel, ruleKey: s.signatory.ruleKey, ruleLabel: s.signatory.ruleLabel, delegationId: s.delegationId } });
    const snapshot = executedSnapshot({ contractDate, readySince: s.readySince, contractorSignedOn: "2026-09-29", witnessSignedOn: "2026-09-29", gate: s.gate.items, legal: [{ iteration: 1, decision: "ENDORSED", decidedOn: "2026-09-29", office: "Demo Legal Office" }], signatory: { rule: s.signatory.ruleLabel, clause: s.signatory.clause, office: s.signatory.roleLabel, delegated: !!s.delegationId }, checks: ["ARITHMETIC", "FRONT_LOADING", "RATE_UNIFORMITY"].map((kind) => ({ kind, completedOn: "2026-09-25" })), formation: (await db.contract.findUnique({ where: { id }, select: { formationSnapshot: true } }))!.formationSnapshot });
    await db.contract.update({ where: { id }, data: { status: "EXECUTED", contractDate: day(contractDate), contractDateRecordedAt: at(signedAt), executedSnapshot: snapshot as never } });
    await con3.writeVersion({ ...con3.draft, contractDate }, "EXECUTED", signedAt, "version 1");
    audit("ContractSignature", `${P}ksg_con3_r`, `${label} · signed for the employer`, "CREATE", signedAt, diffFields(null, { party: "RSAJ", signedBy: s.person.name, office: s.signatory.roleLabel, rule: s.signatory.ruleLabel, delegated: s.delegationId ? "yes" : "no", recordedOnBehalf: ON_BEHALF }));
    audit("Contract", id, label, "UPDATE", signedAt, diffFields({ status: "LEGALLY_ENDORSED", contractDate: null }, { status: "EXECUTED", contractDate, contractDateSource: "the day of the recorded signature act" }));

    // The Integrity Pact briefing at signing.
    fail("con3 briefing", briefingFaults({ status: "EXECUTED", exists: false, participants: 2, attendees: 1, heldOn: contractDate, today: contractDate }));
    await db.integrityBriefing.create({ data: { id: `${P}kib_con3`, organisationId, contractId: id, heldOn: day(contractDate), participantIds: [people.imran.id, people.daniel.id], participantNames: [people.imran.name, people.daniel.name], contractorAttendees: [signatory.name], note: "The action on a breach of the anti-corruption clause was explained (demo).", recordedAt: at("2026-09-30T03:00") } });
    audit("IntegrityBriefing", `${P}kib_con3`, `${label} · integrity briefing`, "CREATE", "2026-09-30T03:00", diffFields(null, { heldOn: day(contractDate), participants: `${people.imran.name}, ${people.daniel.name}`, contractorAttendees: signatory.name, recordedOnBehalf: ON_BEHALF }));

    // Stamped at LHDN the next day; the signed contract and the certificate attached.
    const stampedOn = "2026-10-01";
    fail("con3 stamping", stampFaults({ status: "EXECUTED", stampedOn, reference: "DEMO-STAMP-2026-0001", contractDate, today: stampedOn }));
    await doc(id, label, `Signed Contract Document, ${con3.number}`, "SIGNED_CONTRACT", "2026-09-30T06:00", ["Signed Contract Document (demo)", con3.number, "Signed by both sides and witnessed."]);
    await doc(id, label, `Stamping certificate, ${con3.number}`, "STAMPING_CERTIFICATE", "2026-10-01T03:00", ["Stamping certificate (demo)", con3.number, "Reference DEMO-STAMP-2026-0001."]);
    await db.contract.update({ where: { id }, data: { status: "STAMPED", stampedOn: day(stampedOn), stampingRef: "DEMO-STAMP-2026-0001", stampedAt: at("2026-10-01T03:00"), consultingEngineer: false } });
    audit("Contract", id, label, "UPDATE", "2026-10-01T03:00", diffFields({ status: "EXECUTED" }, { status: "STAMPED", stampedOn: day(stampedOn), stampingRef: "DEMO-STAMP-2026-0001" }));
    audit("Contract", id, label, "UPDATE", "2026-10-01T03:05", diffFields({ consultingEngineer: null }, { consultingEngineer: false }));

    // Controlled copies to the three recipients that apply (no consulting engineer), one acknowledged.
    const list = recipients.filter((r) => !r.onlyWithConsultingEngineer);
    const copies: { id: string; copyNo: number; recipientId: string | null; despatchedOn: string | null; acknowledgedOn: string | null; recalledOn: string | null; reissuedAs: string | null }[] = [];
    const stampText = `${policy.controlledCopyStampEn} / ${policy.controlledCopyStampMs}`;
    for (const [i, r] of list.entries()) {
      fail(`con3 copy ${i + 1}`, issueFaults({ status: "STAMPED", stampText: policy.controlledCopyStampEn, consultingEngineer: false, recipientId: r.id, recipients: list.map((x) => ({ id: x.id, name: x.nameEn, mandatory: x.mandatory, onlyWithConsultingEngineer: x.onlyWithConsultingEngineer })), copies, despatchedOn: stampedOn, contractDate, today: stampedOn }));
      const cid = `${P}kio_con3_${i + 1}`;
      const addressedTo = r.id === `${P}kre2` ? "Contoh Supplies Enterprise, 5 Contoh Road, Demo North" : r.nameEn;
      await db.issuedCopy.create({ data: { id: cid, organisationId, contractId: id, copyNo: i + 1, recipientId: r.id, recipientName: r.nameEn, copyForm: r.copyForm, addressedTo, stampText, method: "BY_HAND", despatchedOn: day(stampedOn), recordedAt: at("2026-10-01T05:00") } });
      audit("IssuedCopy", cid, `${label} · controlled copy ${i + 1}`, "CREATE", "2026-10-01T05:00", diffFields(null, { copyNo: i + 1, recipient: r.nameEn, addressedTo, stamp: stampText, method: "BY_HAND", despatchedOn: day(stampedOn) }));
      copies.push({ id: cid, copyNo: i + 1, recipientId: r.id, despatchedOn: stampedOn, acknowledgedOn: null, recalledOn: null, reissuedAs: null });
    }
    fail("con3 acknowledgement", acknowledgeFaults(copies[0], stampedOn, stampedOn));
    await db.issuedCopy.update({ where: { id: copies[0].id }, data: { acknowledgedOn: day(stampedOn) } });
    audit("IssuedCopy", copies[0].id, `${label} · controlled copy 1`, "UPDATE", "2026-10-01T07:00", diffFields({ acknowledgedOn: null }, { acknowledgedOn: day(stampedOn) }));

    // Custody: the signed contract and the liability policy, the contract out for copying and back.
    fail("con3 custody", registerFaults({ kind: "CONTRACT", executed: true, location: "Contract & Procurement strongroom (demo)", onContract: true, registered: false }));
    await db.custodyItem.create({ data: { id: `${P}kst_con3_1`, organisationId, contractId: id, kind: "CONTRACT", location: "Contract & Procurement strongroom (demo)", custodianPersonId: people.chen.id, recordedAt: at("2026-10-01T04:00") } });
    audit("CustodyItem", `${P}kst_con3_1`, `${label} · original: contract`, "CREATE", "2026-10-01T04:00", diffFields(null, { kind: "CONTRACT", location: "Contract & Procurement strongroom (demo)", custodian: people.chen.name }));
    const pl = l.contract.policies.find((p) => p.kind === "PUBLIC_LIABILITY")!;
    await db.custodyItem.create({ data: { id: `${P}kst_con3_2`, organisationId, contractId: id, kind: "POLICY", policyId: pl.id, location: "Contract & Procurement strongroom (demo)", custodianPersonId: people.chen.id, recordedAt: at("2026-10-01T04:00") } });
    audit("CustodyItem", `${P}kst_con3_2`, `${label} · original: policy`, "CREATE", "2026-10-01T04:00", diffFields(null, { kind: "POLICY", location: "Contract & Procurement strongroom (demo)", custodian: people.chen.name }));
    fail("con3 out", movementFaults([], "OUT", stampedOn, stampedOn));
    await db.custodyMovement.create({ data: { id: `${P}kmv_con3_1`, organisationId, itemId: `${P}kst_con3_1`, direction: "OUT", personId: people.daniel.id, on: day(stampedOn), purpose: "Copies made for distribution", recordedAt: at("2026-10-01T04:30") } });
    fail("con3 in", movementFaults([{ direction: "OUT", personId: people.daniel.id, personName: people.daniel.name, on: stampedOn }], "IN", stampedOn, stampedOn));
    await db.custodyMovement.create({ data: { id: `${P}kmv_con3_2`, organisationId, itemId: `${P}kst_con3_1`, direction: "IN", personId: people.daniel.id, on: day(stampedOn), purpose: "Returned after copying", recordedAt: at("2026-10-01T06:30") } });
    audit("CustodyMovement", `${P}kmv_con3_1`, `${label} · original checked out`, "CREATE", "2026-10-01T04:30", diffFields(null, { direction: "OUT", person: people.daniel.name, on: day(stampedOn), purpose: "Copies made for distribution", now: "OUT" }));
    audit("CustodyMovement", `${P}kmv_con3_2`, `${label} · original checked in`, "CREATE", "2026-10-01T06:30", diffFields(null, { direction: "IN", person: people.daniel.name, on: day(stampedOn), purpose: "Returned after copying", now: "IN" }));
  }

  // ---------------------------------------------------------------- demo_con2: endorsed, awaiting its conditions

  await form(`${P}con2`, {
    startedAt: "2026-09-24T03:00",
    reconciled: { on: "2026-09-25T03:00", outcomes: ["MATCHES", "MATCHES", "MATCHES"] },
    checks: { on: "2026-09-25T07:00", corrections: [], rates: [{ item: "1.4", description: "Meter chamber", tendered: "820.00", estimate: "700.00" }], frontNote: "", otherNote: "" },
    entered: { sums: { value: { pc: parseSen("0.00"), ps: parseSen("10000.00") }, provenance: "ASSUMED", note: "From the indent's priced schedule (demo)." } },
    legal: { sentAt: "2026-09-25T08:00", decisions: [{ decision: "ENDORSED", on: "2026-09-28T02:00", comments: "" }] },
  });
  await doc(`${P}con2`, (await labelOf(`${P}con2`)), "Company resolution, Demo Meter Services Sdn Bhd", "COMPANY_RESOLUTION", "2026-09-28T04:00", ["Board resolution (demo)", "Demo Meter Services Sdn Bhd", "A director signs for the company."]);

  // ---------------------------------------------------------------- demo_con1: returned once by the legal office

  await form(`${P}con1`, {
    startedAt: "2026-09-25T02:00",
    reconciled: { on: "2026-09-25T06:00", outcomes: ["MATCHES", "AMENDED", "MATCHES"], amendment: { description: "The completion period in the Tender Table Document restated as 24 months, as accepted.", contractor: "Tan Ah Kow" } },
    checks: { on: "2026-09-26T02:00", corrections: [], rates: [{ item: "4.2", description: "Reservoir lining", tendered: "185.00", estimate: "160.00" }], frontNote: "", otherNote: "No arithmetical error found." },
    entered: {},
    legal: {
      sentAt: "2026-09-26T05:00",
      decisions: [{ decision: "RETURNED", on: "2026-09-29T07:00", comments: "Clause 4.2 of the conditions to say the stamp duty is borne by the contractor. Resubmit with the clause amended.", commentsDoc: true }],
    },
  });
  await doc(`${P}con1`, (await labelOf(`${P}con1`)), "Signed reconciliation record, DEMO/KP/T/004/2026", "RECONCILIATION", "2026-09-26T01:00", ["Reconciliation record (demo)", "DEMO/KP/T/004/2026", "One amendment, signed by both sides."]);

  async function labelOf(id: string) {
    const x = (await db.contract.findUnique({ where: { id }, select: { number: true, award: { select: { awardeeName: true } } } }))!;
    return contractLabel({ number: x.number, award: { awardeeName: x.award.awardeeName } });
  }

  await db.auditEntry.createMany({ data: c.audit as never });
  void senToDecimalString;
}

/// Read back after the load: each contract where the demo says it is, through the product's own readings.
export async function checkContractsDemo(db: Db) {
  const { loadContract } = await import("../src/lib/contract/repo");
  const { contractGate, liveOf, baselineRows } = await import("../src/lib/contract/load");
  const { phaseOf } = await import("../src/lib/contract/status");
  const { baselineFor } = await import("../src/lib/contract/baseline");
  const { storedDay } = await import("../src/lib/dates");
  const expected: Record<string, string> = { [`${P}con1`]: "RETURNED_FOR_AMENDMENT", [`${P}con2`]: "AWAITING_CONDITIONS", [`${P}con3`]: "STAMPED" };
  for (const [id, phase] of Object.entries(expected)) {
    const l = await loadContract(id);
    if (!l) throw new Error(`${id} not found`);
    const got = phaseOf(l.contract.status as never, await contractGate(l), liveOf(l.contract, "COMPANY_RESOLUTION").length > 0);
    if (got !== phase) throw new Error(`${id}: expected ${phase}, read ${got}`);
  }
  const con3 = (await loadContract(`${P}con3`))!;
  const v = baselineFor(baselineRows(con3.contract).versions.map((b) => ({ ...b, recordedOn: b.recordedOn ? storedDay(b.recordedOn) : null })), "2026-10-01");
  if (v?.version !== 2 || v.reason !== "EXECUTED") throw new Error("con3: the baseline in force on 1 Oct is not the executed version");
  void db;
}

/// The formation records of the contracts given, children first, and the trail written under their labels.
export async function wipeContractFormation(db: Db, organisationId: string, contracts: readonly { id: string; number: string }[]) {
  if (!contracts.length) return;
  const byContract = { contractId: { in: contracts.map((c) => c.id) } };
  await db.custodyMovement.deleteMany({ where: { item: byContract } });
  await db.custodyItem.deleteMany({ where: byContract });
  await db.issuedCopy.updateMany({ where: { ...byContract, NOT: { reissueOfId: null } }, data: { reissueOfId: null } });
  await db.issuedCopy.deleteMany({ where: byContract });
  await db.integrityBriefing.deleteMany({ where: byContract });
  await db.contractSignature.deleteMany({ where: byContract });
  await db.legalReview.deleteMany({ where: byContract });
  await db.rateComparison.deleteMany({ where: { check: byContract } });
  await db.arithmeticCorrection.deleteMany({ where: { check: byContract } });
  await db.formationCheck.deleteMany({ where: byContract });
  await db.reconciliationAmendment.deleteMany({ where: { reconciliation: byContract } });
  await db.contractReconciliation.deleteMany({ where: byContract });
  await db.contractAssemblyPart.deleteMany({ where: byContract });
  await db.contractSection.deleteMany({ where: { baseline: byContract } });
  await db.contractBaseline.deleteMany({ where: byContract });
  await db.auditEntry.deleteMany({ where: { organisationId, OR: contracts.map((c) => ({ entityLabel: { startsWith: `Contract ${c.number} ·` } })) } });
}

/// The contract configuration the demo created (rows by demo id; the signatory rows go with the demo matrix).
export async function wipeContractsConfig(db: Db) {
  const demo = { id: { startsWith: P } };
  await db.controlledCopyRecipient.deleteMany({ where: demo });
  await db.contractDocumentPart.deleteMany({ where: demo });
  await db.contractPolicy.deleteMany({ where: demo });
}
