/**
 * Supervision demo (6.13 Part A run 1, 4b). Invented throughout, ASSUMED; no RSAJ figure, office or form (the In
 * Delay percentage here is 75, invented, never the customer's).
 *
 * - Configuration: two Superintending Officer rows on the demo matrix (demo_rule60 up to RM300,000,
 *   demo_rule61 above it, by the contract's value, both following the boundary switch); two delegation forms, a letter (demo_dt33) and
 *   its notification (demo_dt34), each signed by the S.O. (blocks demo_ysb*, recipients demo_yfd*); the
 *   post-award controls (demo_ypa1: In Delay below 75% of the plan, the S.O.'s re-resolution left unset, the
 *   conventional letters set and the design-and-build ones not; only where the organisation has none of its
 *   own); demo_con3's contract type uses the conventional letters.
 * - demo_con3 (stamped 1 Oct 2026; its S.O. resolved by the employer's signature, demo_yso_con3): a Principal
 *   Representative delegated on 1 Oct, its letter pair open as drafts (demo_ydl1, certificates demo_yct1–2);
 *   possession on 2 Oct (demo_ypo1), with its POSSESSION baseline version (demo_ybl_con3, sections
 *   demo_ysn*), the contract active; programme revision 1 submitted, scrutinised and approved (demo_ypg1,
 *   points demo_ypp*); progress on 2 Oct below the line (demo_ypr1), so the contract is In Delay; a special
 *   meeting (demo_ymt1); the day's diary, the officer's attestation recorded and the agent's awaited
 *   (demo_ysd1), endorsed on a visit (demo_yen1); a safety observation (demo_yob1); a direction on the
 *   programme awaiting its revision (demo_ydi1); a nominated sub-contractor (demo_ypt1). The delegation's scope
 *   rows are demo_yds*.
 * - Every act is judged by the product's own rule before its rows are written (X-10 c); nothing is dated after
 *   the load day (X-10 a). Trail demo_yau*.
 * - Ids: the demo_y family above, demo_rule60–61, demo_dt33–34, grepped free; the wipe matches each exactly.
 */

import type { PrismaClient } from "../src/generated/prisma/client";

type Db = PrismaClient;
const P = "demo_";
const day = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
const at = (iso: string) => new Date(`${iso}:00.000Z`);
const CON = `${P}con3`;

function fail(what: string, faults: readonly { code: string }[]) {
  if (faults.length) throw new Error(`Demo supervision act refused (${what}): ${faults.map((f) => f.code).join(", ")}`);
}

const LETTER_EN = ["{{organisation.name}}", "Letter of delegation under contract {{contract.number}} ({{contract.title}}) with {{contractor.name}}.", "The Superintending Officer delegates to the representative named the powers in the schedule (demo text, invented).", "Dated {{certificate.date}}."].join("\n\n");
const NOTICE_EN = ["{{organisation.name}}", "Notification of delegation under contract {{contract.number}} to {{contractor.name}}.", "The contractor is notified of the representative named and the powers delegated (demo text, invented).", "Dated {{certificate.date}}."].join("\n\n");

/// The S.O. rows, the forms and the controls. Before the contracts load: the employer's signature resolves the S.O. from these rows.
export async function configureSupervisionDemo(db: Db, organisationId: string) {
  await db.authorityRule.createMany({
    data: [
      { id: `${P}rule60`, authorityMatrixId: `${P}mx1`, ruleKey: "demo.so.low", domain: "superintending_officer", contractValueMax: "300000", followsBoundarySwitch: true, generateCoreChain: false, coreChainReason: "The S.O. is an office, not a route: no chain (demo).", labelEn: "Superintending Officer, contracts up to RM300,000", approverCode: "HOD_CP", clause: "DEMO 6.1", sortOrder: 60 },
      { id: `${P}rule61`, authorityMatrixId: `${P}mx1`, ruleKey: "demo.so.high", domain: "superintending_officer", contractValueMin: "300000", followsBoundarySwitch: true, generateCoreChain: false, coreChainReason: "The S.O. is an office, not a route: no chain (demo).", labelEn: "Superintending Officer, contracts above RM300,000", approverCode: "FD", clause: "DEMO 6.2", sortOrder: 61 },
    ],
  });
  const base = { organisationId, provenance: "ASSUMED" as const, documentClassId: `${P}dc2`, bodyVersion: 1 };
  await db.documentTemplate.createMany({
    data: [
      { id: `${P}dt33`, ...base, code: "demo_so_delegation_letter", nameEn: "Demo letter of delegation (S.O.)", nameMs: "Surat perwakilan kuasa demo (P.P.)", formCode: "DEMO-S-01", revisionDate: day("2025-06-01"), bodyEn: LETTER_EN, sortOrder: 33 },
      { id: `${P}dt34`, ...base, code: "demo_so_delegation_notice", nameEn: "Demo notification of delegation (S.O.)", nameMs: "Pemberitahuan perwakilan kuasa demo (P.P.)", formCode: "DEMO-S-02", revisionDate: day("2025-06-01"), bodyEn: NOTICE_EN, sortOrder: 34 },
    ],
  });
  const block = (n: number, templateId: string) => ({ id: `${P}ysb${n}`, organisationId, templateId, blockOrder: 1, blockKind: "AUTHORISING" as const, labelEn: "Superintending Officer", labelMs: "Pegawai Penguasa", officeRule: "SO" as const, officeCode: null, delegable: false, datesCertificate: true, provenance: "ASSUMED" as const, notes: "Invented for the demo." });
  await db.formSignatureBlock.createMany({ data: [block(1, `${P}dt33`), block(2, `${P}dt34`)] });
  const row = (n: number, templateId: string, code: string, labelEn: string, labelMs: string, isOriginal: boolean, sortOrder: number) => ({ id: `${P}yfd${n}`, organisationId, templateId, recipientCode: code, labelEn, labelMs, mandatory: true, ackRequired: isOriginal, condition: "NONE" as const, isOriginal, sortOrder, provenance: "ASSUMED" as const, notes: "Invented for the demo." });
  await db.formDistribution.createMany({
    data: [
      row(1, `${P}dt33`, "demo_delegate", "The representative (original)", "Wakil (asal)", true, 1),
      row(2, `${P}dt33`, "demo_file", "Contract file (demo)", "Fail kontrak (demo)", false, 2),
      row(3, `${P}dt34`, "demo_contractor", "The contractor (original)", "Kontraktor (asal)", true, 1),
      row(4, `${P}dt34`, "demo_file", "Contract file (demo)", "Fail kontrak (demo)", false, 2),
    ],
  });
  // The organisation's own controls, where it has them, are left as they are.
  if (!(await db.postAwardPolicy.findUnique({ where: { organisationId } }))) {
    await db.postAwardPolicy.create({
      data: { id: `${P}ypa1`, organisationId, inDelayProgressPct: "75", inDelayProvenance: "ASSUMED", soReResolve: null, delegationLetterConventionalId: `${P}dt33`, delegationNoticeConventionalId: `${P}dt34`, delegationFormsProvenance: "ASSUMED", notes: "Invented for the demo: 75% is not any customer's figure." },
    });
  }
}

/// demo_con3's supervision, each act judged as the act judges it.
export async function loadSupervisionDemo(db: Db, organisationId: string) {
  const { diffFields } = await import("../src/lib/audit/diff");
  const { loadContract, contractLabel } = await import("../src/lib/contract/repo");
  const { baselineRows, contractGate, frozenInputsOf, rowOf, sectionRows, valuesOf } = await import("../src/lib/contract/load");
  const { changedFields, derive, latestVersion, baselineFor } = await import("../src/lib/contract/baseline");
  const { contractTransition } = await import("../src/lib/contract/status");
  const { storedDay } = await import("../src/lib/dates");
  const { capacityFor } = await import("../src/lib/supervision/authority");
  const { delegationFaults } = await import("../src/lib/supervision/delegation");
  const { possessionFaults, startRuleReading } = await import("../src/lib/supervision/possession");
  const { submitFaults, pointFaults, scrutinyFaults, decideFaults } = await import("../src/lib/supervision/programme");
  const { progressFaults, meetingFaults, onSiteFaults, partyFaults } = await import("../src/lib/supervision/records");
  const { entryFaults, attestFaults, endorseFaults } = await import("../src/lib/supervision/diary");
  const { inDelay } = await import("../src/lib/supervision/delay");
  const { parsePercent } = await import("../src/lib/securities/money");
  const { officeHolders } = await import("../src/lib/certificate/repo");
  const { KIND_WORDS, STATUS_WORDS } = await import("../src/lib/certificate/labels");
  const { ACT_WORDS, AREA_WORDS, CAUSE_WORDS, DELEGATE_KIND_WORDS, ENDORSER_WORDS, PARTY_KIND_WORDS, PROGRAMME_DECISION_WORDS, PROGRAMME_KIND_WORDS, VARIANT_WORDS } = await import("../src/lib/supervision/labels");

  const ON_BEHALF = "recorded on behalf of, not signed";
  const audits: { id: string; organisationId: string; entity: string; entityId: string; entityLabel: string; action: "CREATE" | "UPDATE"; at: Date; changes: object[]; reason: string; unattributed: boolean }[] = [];
  let n = 0;
  const people = { aisyah: { id: `${P}p1`, name: "Aisyah Rahman", isActive: true }, chen: { id: `${P}p3`, name: "Chen Wei Ling", isActive: true }, daniel: { id: `${P}p4`, name: "Daniel Anak Jelani", isActive: true } };

  const l0 = (await loadContract(CON))!;
  if (l0.contract.status !== "STAMPED") throw new Error(`demo supervision: ${CON} is ${l0.contract.status}, not stamped`);
  const contract = contractLabel({ number: l0.contract.number, award: { awardeeName: l0.award.awardeeName } });
  const audit = (entity: string, entityId: string, suffix: string, action: "CREATE" | "UPDATE", when: string, changes: object[], reason = "") => audits.push({ id: `${P}yau${++n}`, organisationId, entity, entityId, entityLabel: `${contract} · ${suffix}`, action, at: at(when), changes, reason, unattributed: true });
  const assignment = await db.contractSoAssignment.findUniqueOrThrow({ where: { id: `${P}yso_con3` } });
  /// The S.O. office on a day, as `soOfficeOn` reads it.
  const soOffice = async (on: string) => {
    const h = await officeHolders(l0, assignment.roleCode, on);
    return { roleLabel: assignment.roleLabel, holderIds: h.holderIds, actingIds: h.delegates.map((d) => d.personId) };
  };
  const recordedFor = async (personId: string, need: Parameters<typeof capacityFor>[1], on: string) => {
    const r = capacityFor(personId, need, await soOffice(on), [], on);
    fail(`recorded for ${personId} on ${on}`, r.faults);
  };

  // ------------------------------------------------ the type's letters
  const type = await db.contractType.findFirstOrThrow({ where: { organisationId, code: l0.ex.contractTypeCode! } });
  await db.contractType.update({ where: { id: type.id }, data: { delegationVariant: "CONVENTIONAL" } });

  // ------------------------------------------------ a Principal Representative, 1 Oct: the letter pair opened as drafts
  {
    const on = "2026-10-01";
    const scope = ["DIARY", "PROGRAMME_SCRUTINY", "PROGRESS", "OBSERVATION"] as const;
    fail("delegation", delegationFaults({ kind: "PRINCIPAL", grantorId: people.chen.id, delegate: people.daniel, competencyConfirmed: true, competencyNote: "x", scope: [...scope] }, { so: await soOffice(on), delegations: [], today: on, variant: "CONVENTIONAL", typeName: type.nameEn, forms: { letter: `${P}dt33`, notice: `${P}dt34` } }));
    const versions = baselineRows(l0.contract).versions.map((b) => ({ ...b, recordedOn: b.recordedOn ? storedDay(b.recordedOn) : null }));
    const b = baselineFor(versions, on)!;
    for (const [id, kind, templateId] of [[`${P}yct1`, "DELEGATION_LETTER", `${P}dt33`], [`${P}yct2`, "DELEGATION_NOTICE", `${P}dt34`]] as const) {
      await db.certificate.create({ data: { id, organisationId, contractId: CON, kind, templateId, routingTypeId: null, baselineId: b.id, openedAt: at(`${on}T02:00`), openedOn: day(on) } });
      audit("Certificate", id, KIND_WORDS[kind].en, "CREATE", `${on}T02:00`, diffFields(null, { certificate: KIND_WORDS[kind].en, stage: STATUS_WORDS.DRAFT.en, baselineVersion: `version ${b.version}`, figures: "none", routed: "no" }));
    }
    await db.soDelegation.create({
      data: { id: `${P}ydl1`, organisationId, contractId: CON, assignmentId: assignment.id, kind: "PRINCIPAL", delegatePersonId: people.daniel.id, delegateName: people.daniel.name, grantorPersonId: people.chen.id, grantorName: people.chen.name, competencyConfirmed: true, competencyNote: "Ten years supervising pipe-laying works of this size (demo).", variant: "CONVENTIONAL", letterCertificateId: `${P}yct1`, noticeCertificateId: `${P}yct2`, recordedAt: at(`${on}T02:00`), recordedOn: day(on), scope: { create: scope.map((act, i) => ({ id: `${P}yds${i + 1}`, organisationId, act })) } },
    });
    audit("SoDelegation", `${P}ydl1`, `delegation to ${people.daniel.name}`, "CREATE", `${on}T02:00`, diffFields(null, { representative: people.daniel.name, representativeType: DELEGATE_KIND_WORDS.PRINCIPAL.en, delegatedBy: `${people.chen.name}, as ${assignment.roleLabel}`, competency: "Ten years supervising pipe-laying works of this size (demo).", scope: scope.map((a) => ACT_WORDS[a].en).join("; "), letters: VARIANT_WORDS.CONVENTIONAL.en, inForceFrom: "the letter's date, once issued", recordedOnBehalf: ON_BEHALF }));
  }

  // ------------------------------------------------ possession, 2 Oct: the POSSESSION version, the contract active
  const possessionOn = "2026-10-02";
  let completion: string | null = null;
  {
    const l = (await loadContract(CON))!;
    await recordedFor(people.chen.id, { principalOrSo: true }, possessionOn);
    const gate = await contractGate(l);
    const { versions, draft } = baselineRows(l.contract);
    fail("possession", possessionFaults({ status: l.contract.status, possessed: false, versions: versions.length, on: possessionOn, today: possessionOn, datedOn: storedDay(l.contract.contractDate!), startRequiresSecurities: type.startRequiresSecurities, typeName: type.nameEn, gate: gate.items }));
    const prior = latestVersion(versions)!;
    const inputs = frozenInputsOf(l.contract);
    const before = valuesOf(prior);
    const after = inputs ? derive({ ...before, possessionDate: possessionOn }, inputs.interimPolicy) : { ...before, possessionDate: possessionOn };
    const judgedUnder = { startOfWork: startRuleReading(type.startRequiresSecurities), type: type.nameEn, gate: gate.items.filter((g) => g.key !== "RETURNED") };
    const version = (prior.version ?? 0) + 1;
    const when = `${possessionOn}T01:00`;
    completion = after.dateForCompletion;
    await db.contractBaseline.create({ data: { id: `${P}ybl_con3`, organisationId, contractId: CON, version, reason: "POSSESSION", correctionReason: "", recordedAt: at(when), recordedOn: day(possessionOn), ...rowOf(after), entered: (prior.entered ?? {}) as never, snapshot: { ...(draft?.snapshot as object), possession: judgedUnder } as never } });
    for (const [i, s] of sectionRows(after, organisationId).entries()) await db.contractSection.create({ data: { ...s, id: `${P}ysn${i + 1}`, baselineId: `${P}ybl_con3` } });
    audit("ContractBaseline", `${P}ybl_con3`, `baseline version ${version}`, "CREATE", when, diffFields(null, { version, reason: "POSSESSION", changed: changedFields(before, after).join(", ") || "nothing" }));
    await db.possession.create({ data: { id: `${P}ypo1`, organisationId, contractId: CON, possessionOn: day(possessionOn), recordedByPersonId: people.chen.id, baselineId: `${P}ybl_con3`, judgedUnder: judgedUnder as never, note: "Site handed over at the reservoir gate (demo).", recordedAt: at(when), recordedOn: day(possessionOn) } });
    audit("Possession", `${P}ypo1`, "possession of site", "CREATE", when, diffFields(null, { possessionOn, dateForCompletion: after.dateForCompletion, recordedFor: `${people.chen.name}, as ${assignment.roleLabel}`, startOfWork: judgedUnder.startOfWork === "WITHOUT_SECURITIES" ? "this contract type starts without its securities" : "the bond and the required insurance verified", recordedOnBehalf: ON_BEHALF }), "Site handed over at the reservoir gate (demo).");
    if (contractTransition("STAMPED", "ACTIVE", { act: "POSSESSION" })) throw new Error("demo possession: STAMPED → ACTIVE refused");
    await db.contract.update({ where: { id: CON }, data: { status: "ACTIVE" } });
    audits.push({ id: `${P}yau${++n}`, organisationId, entity: "Contract", entityId: CON, entityLabel: contract, action: "UPDATE", at: at(when), changes: diffFields({ status: "STAMPED" }, { status: "ACTIVE" }), reason: "", unattributed: true });
  }

  // ------------------------------------------------ the programme: submitted and scrutinised 1–2 Oct, approved 2 Oct
  const points = [
    { day: "2026-10-02", plannedPct: "1" },
    { day: "2026-10-31", plannedPct: "40" },
    { day: "2026-11-27", plannedPct: "100" },
  ];
  {
    fail("programme submitted", [...submitFaults({ executed: true, submittedOn: "2026-10-02", today: "2026-10-02", openRevision: null }), ...pointFaults(points, possessionOn)]);
    await db.workProgramme.create({ data: { id: `${P}ypg1`, organisationId, contractId: CON, revision: 1, kind: "WORK_PROGRAMME", submittedOn: day("2026-10-02"), note: "", recordedAt: at("2026-10-02T02:00"), points: { create: points.map((p, i) => ({ id: `${P}ypp${i + 1}`, organisationId, day: day(p.day), plannedPct: p.plannedPct })) } } });
    audit("WorkProgramme", `${P}ypg1`, "programme revision 1", "CREATE", "2026-10-02T02:00", diffFields(null, { programme: PROGRAMME_KIND_WORDS.WORK_PROGRAMME.en, revision: 1, submittedOn: "2026-10-02", plannedProgress: points.map((p) => `${p.plannedPct}% by ${p.day}`).join("; ") }));
    const rev = { revision: 1, submittedOn: "2026-10-02", scrutinisedOn: null, reasonable: null, decision: null, decidedOn: null };
    await recordedFor(people.chen.id, { act: "PROGRAMME_SCRUTINY" }, "2026-10-02");
    fail("programme scrutiny", scrutinyFaults(rev, { on: "2026-10-02", today: "2026-10-02", reasonable: true, note: "" }));
    await recordedFor(people.chen.id, { principalOrSo: true }, "2026-10-02");
    fail("programme decision", decideFaults({ ...rev, scrutinisedOn: "2026-10-02", reasonable: true }, { decision: "APPROVED", on: "2026-10-02", today: "2026-10-02", note: "", points: points.length }));
    await db.workProgramme.update({ where: { id: `${P}ypg1` }, data: { scrutinisedByPersonId: people.chen.id, scrutinisedOn: day("2026-10-02"), reasonable: true, scrutinyNote: "", decision: "APPROVED", decidedByPersonId: people.chen.id, decidedOn: day("2026-10-02"), decisionNote: "", decidedAt: at("2026-10-02T04:00") } });
    audit("WorkProgramme", `${P}ypg1`, "programme revision 1", "UPDATE", "2026-10-02T03:00", diffFields({ scrutinisedOn: null }, { scrutinisedOn: "2026-10-02", scrutinisedBy: `${people.chen.name}, as ${assignment.roleLabel}`, reasonableAndRealistic: "yes", recordedOnBehalf: ON_BEHALF }));
    audit("WorkProgramme", `${P}ypg1`, "programme revision 1", "UPDATE", "2026-10-02T04:00", diffFields({ programmeDecision: null }, { programmeDecision: PROGRAMME_DECISION_WORDS.APPROVED.en, decidedOn: "2026-10-02", decidedBy: `${people.chen.name}, as ${assignment.roleLabel}`, recordedOnBehalf: ON_BEHALF }));
  }

  // ------------------------------------------------ progress on 2 Oct: 0.5% against 1% planned, below 75% of it
  {
    await recordedFor(people.chen.id, { act: "PROGRESS" }, "2026-10-02");
    fail("progress", progressFaults({ possessionOn, day: "2026-10-02", today: "2026-10-02", pct: "0.5", exists: false, earlier: null, later: null, parsed: parsePercent("0.5") }));
    await db.progressRecord.create({ data: { id: `${P}ypr1`, organisationId, contractId: CON, day: day("2026-10-02"), actualPct: "0.5", recordedByPersonId: people.chen.id, note: "Mobilisation slower than planned (demo).", recordedAt: at("2026-10-02T08:00") } });
    audit("ProgressRecord", `${P}ypr1`, "progress on 02 Oct 2026", "CREATE", "2026-10-02T08:00", diffFields(null, { day: "2026-10-02", actualProgress: "0.5%", recordedFor: `${people.chen.name}, as ${assignment.roleLabel}`, recordedOnBehalf: ON_BEHALF }), "Mobilisation slower than planned (demo).");
  }
  const reading = inDelay({ today: "2026-10-02", possessed: true, dateForCompletion: completion, programme: points, latest: { day: "2026-10-02", actualPct: "0.5" }, policyPct: "75" });
  if (reading.state !== "IN_DELAY") throw new Error(`demo supervision: expected In Delay on 2 Oct, read ${reading.state}`);

  // ------------------------------------------------ the special meeting, the diary, an observation, a direction, a party
  {
    const attendees = [people.chen.name, people.daniel.name, "Tan Ah Kow (the contractor)"];
    const minutes = "The contractor will add a second excavation crew from 5 October and report progress weekly (demo).";
    await recordedFor(people.chen.id, { soOnly: true }, "2026-10-02");
    fail("special meeting", meetingFaults({ inDelay: true, heldOn: "2026-10-02", today: "2026-10-02", minutes, attendees }));
    await db.siteMeeting.create({ data: { id: `${P}ymt1`, organisationId, contractId: CON, heldOn: day("2026-10-02"), chairPersonId: people.chen.id, attendees, minutes, inDelayReading: reading as never, recordedAt: at("2026-10-02T09:00") } });
    audit("SiteMeeting", `${P}ymt1`, "special meeting 02 Oct 2026", "CREATE", "2026-10-02T09:00", diffFields(null, { heldOn: "2026-10-02", chairedBy: people.chen.name, attendees: attendees.join("; "), calledBy: "the In Delay classification", recordedOnBehalf: ON_BEHALF }));

    const entry = "Site possessed at 09:00. Contractor's site office set up; survey of the pipe route begun from chainage 0. Two labourers, one excavator (demo).";
    await recordedFor(people.chen.id, { act: "DIARY" }, "2026-10-02");
    fail("diary", entryFaults({ possessionOn, day: "2026-10-02", today: "2026-10-02", exists: false, entry, backdatedReason: "" }));
    fail("diary attested", attestFaults({ who: "OFFICER", already: false, day: "2026-10-02", on: "2026-10-02", today: "2026-10-02", agentName: "" }));
    await db.siteDiaryEntry.create({ data: { id: `${P}ysd1`, organisationId, contractId: CON, day: day("2026-10-02"), weather: "Fine, afternoon showers", entry, officerPersonId: people.chen.id, backdatedReason: "", officerAttestedOn: day("2026-10-02"), recordedAt: at("2026-10-02T09:30"), recordedOn: day("2026-10-02") } });
    audit("SiteDiaryEntry", `${P}ysd1`, "site diary 02 Oct 2026", "CREATE", "2026-10-02T09:30", diffFields(null, { day: "2026-10-02", weather: "Fine, afternoon showers", responsibleOfficer: `${people.chen.name}, as ${assignment.roleLabel}`, writtenOn: "2026-10-02", recordedOnBehalf: ON_BEHALF }));
    audit("SiteDiaryEntry", `${P}ysd1`, "site diary 02 Oct 2026", "UPDATE", "2026-10-02T10:00", diffFields({ attestedBy: null }, { attestedBy: `${people.chen.name} (responsible officer)`, attestedOn: "2026-10-02", recordedOnBehalf: ON_BEHALF }));

    fail("endorsement", endorseFaults({ possessionOn, visitedOn: "2026-10-02", coversFrom: "2026-10-02", coversTo: "2026-10-02", today: "2026-10-02", entriesInCover: 1 }));
    await db.diaryEndorsement.create({ data: { id: `${P}yen1`, organisationId, contractId: CON, role: "SUPERIOR_OFFICER", personId: people.aisyah.id, visitedOn: day("2026-10-02"), coversFrom: day("2026-10-02"), coversTo: day("2026-10-02"), note: "", recordedAt: at("2026-10-02T10:30") } });
    audit("DiaryEndorsement", `${P}yen1`, "site diary endorsed 02 Oct 2026", "CREATE", "2026-10-02T10:30", diffFields(null, { endorsedAs: ENDORSER_WORDS.SUPERIOR_OFFICER.en, endorsedBy: people.aisyah.name, visitedOn: "2026-10-02", coversFrom: "2026-10-02", coversTo: "2026-10-02", recordedOnBehalf: ON_BEHALF }));

    const obs = "Open trench at chainage 40 left unbarricaded over lunch; the contractor's agent was told (demo).";
    await recordedFor(people.chen.id, { act: "OBSERVATION" }, "2026-10-02");
    fail("observation", onSiteFaults({ possessionOn, on: "2026-10-02", today: "2026-10-02", note: obs }));
    await db.complianceObservation.create({ data: { id: `${P}yob1`, organisationId, contractId: CON, area: "SAFETY", observedOn: day("2026-10-02"), personId: people.chen.id, note: obs, recordedAt: at("2026-10-02T11:00") } });
    audit("ComplianceObservation", `${P}yob1`, "observation 02 Oct 2026", "CREATE", "2026-10-02T11:00", diffFields(null, { about: AREA_WORDS.SAFETY.en, observedOn: "2026-10-02", observedBy: `${people.chen.name}, as ${assignment.roleLabel}`, observation: obs, recordedOnBehalf: ON_BEHALF }));

    const dir = "Review the date for completion against the slow mobilisation and submit a revised programme within 14 days (demo).";
    await recordedFor(people.chen.id, { principalOrSo: true }, "2026-10-02");
    fail("direction", onSiteFaults({ possessionOn, on: "2026-10-02", today: "2026-10-02", note: dir }));
    await db.programmeDirection.create({ data: { id: `${P}ydi1`, organisationId, contractId: CON, cause: "OTHER_DELAY", directedOn: day("2026-10-02"), personId: people.chen.id, note: dir, recordedAt: at("2026-10-02T11:30") } });
    audit("ProgrammeDirection", `${P}ydi1`, "direction 02 Oct 2026", "CREATE", "2026-10-02T11:30", diffFields(null, { calledForBy: CAUSE_WORDS.OTHER_DELAY.en, directedOn: "2026-10-02", directedBy: people.chen.name, directionGiven: dir, recordedOnBehalf: ON_BEHALF }));

    fail("party", partyFaults({ executed: true, kind: "NOMINATED_SUBCONTRACTOR", name: "Syarikat Demo Elektrik", sum: 2_500_000n, others: [] }));
    await db.contractParty.create({ data: { id: `${P}ypt1`, organisationId, contractId: CON, kind: "NOMINATED_SUBCONTRACTOR", name: "Syarikat Demo Elektrik", sum: "25000.00", directPayment: false, provenance: "ASSUMED", note: "The pump-house electrical works (demo).", recordedAt: at("2026-10-01T06:00") } });
    audit("ContractParty", `${P}ypt1`, `${PARTY_KIND_WORDS.NOMINATED_SUBCONTRACTOR.en.toLowerCase()} Syarikat Demo Elektrik`, "CREATE", "2026-10-01T06:00", diffFields(null, { partyType: PARTY_KIND_WORDS.NOMINATED_SUBCONTRACTOR.en, name: "Syarikat Demo Elektrik", partySum: "25000.00", paidDirect: "no", provenance: "ASSUMED" }), "The pump-house electrical works (demo).");
  }

  await db.auditEntry.createMany({ data: audits });
}

/// Read back through the product's own readings.
export async function checkSupervisionDemo(db: Db) {
  const { loadContract } = await import("../src/lib/contract/repo");
  const { loadSupervision, delayOn } = await import("../src/lib/supervision/load");
  const { latestVersion } = await import("../src/lib/contract/baseline");
  const { baselineRows, valuesOf } = await import("../src/lib/contract/load");
  const l = (await loadContract(CON))!;
  if (l.contract.status !== "ACTIVE") throw new Error(`demo check: ${CON} is ${l.contract.status}, not active`);
  const s = await loadSupervision(CON);
  const latest = latestVersion(baselineRows(l.contract).versions)!;
  if (latest.reason !== "POSSESSION") throw new Error("demo check: the latest version is not the POSSESSION version");
  const r = delayOn(s, { today: "2026-10-02", dateForCompletion: valuesOf(latest).dateForCompletion, policyPct: "75" });
  if (r.state !== "IN_DELAY") throw new Error(`demo check: ${CON} not In Delay on 2 Oct (${r.state})`);
  if (s.soAssignments.length !== 1 || s.soDelegations.length !== 1) throw new Error("demo check: the S.O. or the delegation is missing");
  void db;
}

/// Every supervision row on the given contracts (the demo's, and any made through the screens on them).
export async function wipeSupervision(db: Db, contractIds: readonly string[]) {
  const byContract = { contractId: { in: [...contractIds] } };
  await db.soDelegationScope.deleteMany({ where: { delegation: byContract } });
  await db.soDelegation.deleteMany({ where: byContract });
  await db.contractSoAssignment.deleteMany({ where: byContract });
  await db.programmePoint.deleteMany({ where: { programme: byContract } });
  await db.workProgramme.deleteMany({ where: byContract });
  await db.programmeDirection.deleteMany({ where: byContract });
  await db.progressRecord.deleteMany({ where: byContract });
  await db.diaryEndorsement.deleteMany({ where: byContract });
  await db.siteDiaryEntry.deleteMany({ where: byContract });
  await db.siteMeeting.deleteMany({ where: byContract });
  await db.complianceObservation.deleteMany({ where: byContract });
  await db.pendingDeduction.deleteMany({ where: byContract });
  await db.earlyActionDecision.deleteMany({ where: byContract });
  await db.contractParty.deleteMany({ where: byContract });
  await db.siteRecordsHandover.deleteMany({ where: byContract });
  await db.possession.deleteMany({ where: byContract });
  await db.awardTermCorrection.deleteMany({ where: byContract });
}

/// The supervision configuration the demo created (rows by demo id; the S.O. rows go with the demo matrix).
export async function wipeSupervisionConfig(db: Db) {
  const sub = (s: string) => ({ id: { startsWith: `${P}${s}` } });
  await db.postAwardPolicy.deleteMany({ where: sub("ypa") });
  await db.formDistribution.deleteMany({ where: sub("yfd") });
  await db.formSignatureBlock.deleteMany({ where: sub("ysb") });
}
