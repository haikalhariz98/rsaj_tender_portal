/**
 * Certificate core demo (6.14 increment 1). Invented throughout, ASSUMED; no RSAJ form, order, list, target or
 * figure (X-10 d, OD-5 A). The certificates 6.13 raises arrive with 6.13's demo; these show the core's own
 * screens on demo_con3 (executed 30 Sep 2026), each act judged by the product's own rules before its rows are
 * written (X-10 c), nothing dated after the load day (X-10 a).
 *
 * - Forms: demo_dt30 (an interim-style certificate, bilingual: recommending officer, authorising officer who
 *   dates it, the contractor who may refuse, a witness; the original and three copies, and the guarantor's
 *   only with a live bond), demo_dt31 (a letter of delegation: one authorising block), demo_dt32 (a variation
 *   order). Blocks demo_hsb*, rows demo_hfd*.
 * - Routing sheet types: demo_hrt1 (interim, 21 days printed, its two stages printing 10 and 7: both shown),
 *   demo_hrt2 (variation by quotation, 14 days up to 20% and 42 above, the edge in the band it closes),
 *   demo_hrt3 (the pre-award sheet over an award's route, 21 days). Checks demo_hrc*, targets demo_htg*.
 * - Certificates on demo_con3: demo_hct1 issued (an override in draft, a refused route and its resubmission
 *   side by side, four signatures, copies with one acknowledgement outstanding and the guarantor's left out
 *   for want of a bond); demo_hct2 on its routing sheet at exactly 20.00% (two weeks); demo_hct3 a draft
 *   letter going straight to signing; demo_hct4 being signed (first block recorded, form pinned);
 *   demo_hct5 void before issue. Signatures demo_hsg*, copies demo_hcp*, checks demo_hck*, overrides
 *   demo_hov*, frozen texts demo_hcd*, trail demo_hau*.
 * - The certificates' approval routes (demo_hri*, steps demo_hrs*) are invented trails, not routed by the
 *   engine (6.13 opens real ones on its own domains): recorded as not checked against the matrix.
 * - demo_aw5's pre-award routing sheet (demo_hrw1) on demo_hrt3, with its two checks, over its appointment
 *   route as 6.11's demo recorded it.
 * - Ids: the demo_h three-letter sub-prefixes above and demo_dt30–32, grepped free (6.5 holds demo_hd and
 *   demo_hol); the wipe matches each sub-prefix exactly.
 */

import type { PrismaClient } from "../src/generated/prisma/client";

type Db = PrismaClient;
const P = "demo_";
const day = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
/// An instant written as UTC (10:00 in Kuala Lumpur is 02:00 UTC).
const at = (iso: string) => new Date(`${iso}:00.000Z`);

function fail(what: string, faults: readonly { code: string }[]) {
  if (faults.length) throw new Error(`Demo certificate act refused (${what}): ${faults.map((f) => f.code).join(", ")}`);
}

const BODY_EN = [
  "{{organisation.name}}",
  "{{certificate.kind}} {{certificate.sequence}} · {{certificate.number}}",
  "Contract {{contract.number}}: {{contract.title}}. Contractor: {{contractor.name}}. Contract sum {{contract.sum}}; Contract Date {{contract.date}}.",
  "The sum shown in the valuation attached is certified as due to the contractor under the contract (demo text, invented).",
  "Dated {{certificate.date}}.",
].join("\n\n");
const BODY_MS = [
  "{{organisation.name}}",
  "{{certificate.kind}} {{certificate.sequence}} · {{certificate.number}}",
  "Kontrak {{contract.number}}: {{contract.title}}. Kontraktor: {{contractor.name}}. Harga kontrak {{contract.sum}}; Tarikh Kontrak {{contract.date}}.",
  "Jumlah dalam penilaian yang dilampirkan diperakui kena dibayar kepada kontraktor di bawah kontrak (teks demo, rekaan).",
  "Bertarikh {{certificate.date}}.",
].join("\n\n");
const LETTER_EN = ["{{organisation.name}}", "Letter of delegation under contract {{contract.number}} ({{contract.title}}) with {{contractor.name}}.", "The powers named in the schedule are delegated as it states (demo text, invented).", "Dated {{certificate.date}}."].join("\n\n");
const VO_EN = ["{{organisation.name}}", "{{certificate.kind}} · {{certificate.number}}", "Contract {{contract.number}} with {{contractor.name}}: the variation described in the schedule is ordered (demo text, invented).", "Dated {{certificate.date}}."].join("\n\n");

// ------------------------------------------------------------------ configuration

export async function configureCertificatesDemo(db: Db, organisationId: string) {
  const base = { organisationId, provenance: "ASSUMED" as const, documentClassId: `${P}dc2`, bodyVersion: 1 };
  await db.documentTemplate.createMany({
    data: [
      { id: `${P}dt30`, ...base, code: "demo_interim_certificate", nameEn: "Demo interim certificate", nameMs: "Perakuan interim demo", formCode: "DEMO-C-01", revisionDate: day("2025-06-01"), bilingual: true, bodyEn: BODY_EN, bodyMs: BODY_MS, primaryLanguage: "MS", sortOrder: 30 },
      { id: `${P}dt31`, ...base, code: "demo_delegation_letter", nameEn: "Demo letter of delegation", nameMs: "Surat perwakilan kuasa demo", formCode: "DEMO-C-02", revisionDate: day("2025-06-01"), bodyEn: LETTER_EN, sortOrder: 31 },
      { id: `${P}dt32`, ...base, code: "demo_variation_order", nameEn: "Demo variation order", nameMs: "Arahan perubahan kerja demo", formCode: "DEMO-C-03", revisionDate: day("2025-06-01"), bodyEn: VO_EN, sortOrder: 32 },
    ],
  });
  type BlockIn = Omit<Parameters<typeof db.formSignatureBlock.create>[0]["data"] & { blockOrder: number }, "id" | "organisationId" | "templateId" | "template" | "organisation">;
  const block = (n: number, templateId: string, b: BlockIn) => ({ id: `${P}hsb${n}`, organisationId, templateId, provenance: "ASSUMED" as const, notes: "Invented for the demo.", ...b });
  await db.formSignatureBlock.createMany({
    data: [
      block(1, `${P}dt30`, { blockOrder: 1, blockKind: "RECOMMENDING", labelEn: "Recommended by", labelMs: "Disyorkan oleh", officeRule: "NAMED_OFFICE", officeCode: "HOD_CP", delegable: true, carriesDecision: true }),
      block(2, `${P}dt30`, { blockOrder: 2, blockKind: "AUTHORISING", labelEn: "Certified by", labelMs: "Diperakui oleh", officeRule: "NAMED_OFFICE", officeCode: "FD", delegable: false, datesCertificate: true }),
      block(3, `${P}dt30`, { blockOrder: 3, blockKind: "CONTRACTOR", labelEn: "Received by the contractor", labelMs: "Diterima oleh kontraktor", officeRule: "CONTRACTOR", delegable: true, refusalAllowed: true }),
      block(4, `${P}dt30`, { blockOrder: 4, blockKind: "WITNESS", labelEn: "Witnessed by", labelMs: "Disaksikan oleh", officeRule: "WITNESS", delegable: true }),
      block(5, `${P}dt31`, { blockOrder: 1, blockKind: "AUTHORISING", labelEn: "Delegated by", labelMs: "Diwakilkan oleh", officeRule: "NAMED_OFFICE", officeCode: "CEO", delegable: false, datesCertificate: true }),
      block(6, `${P}dt32`, { blockOrder: 1, blockKind: "RECOMMENDING", labelEn: "Recommended by", labelMs: "Disyorkan oleh", officeRule: "NAMED_OFFICE", officeCode: "HOD_CP", delegable: true, carriesDecision: true }),
      block(7, `${P}dt32`, { blockOrder: 2, blockKind: "AUTHORISING", labelEn: "Ordered by", labelMs: "Diarahkan oleh", officeRule: "NAMED_OFFICE", officeCode: "CEO", delegable: false, datesCertificate: true }),
    ],
  });
  type RowIn = { recipientCode: string; labelEn: string; labelMs: string; mandatory: boolean; ackRequired: boolean; condition: "NONE" | "GUARANTOR_EXISTS" | "CONSULTANT_ENGAGED"; isOriginal: boolean; sortOrder: number };
  const row = (n: number, templateId: string, r: RowIn) => ({ id: `${P}hfd${n}`, organisationId, templateId, provenance: "ASSUMED" as const, notes: "Invented for the demo.", ...r });
  const standard = (from: number, templateId: string) => [
    row(from, templateId, { recipientCode: "demo_contractor", labelEn: "The contractor (original)", labelMs: "Kontraktor (asal)", mandatory: true, ackRequired: true, condition: "NONE", isOriginal: true, sortOrder: 1 }),
    row(from + 1, templateId, { recipientCode: "demo_finance", labelEn: "Accounts and finance (demo)", labelMs: "Akaun dan kewangan (demo)", mandatory: true, ackRequired: true, condition: "NONE", isOriginal: false, sortOrder: 2 }),
    row(from + 2, templateId, { recipientCode: "demo_file", labelEn: "Contract file (demo)", labelMs: "Fail kontrak (demo)", mandatory: true, ackRequired: false, condition: "NONE", isOriginal: false, sortOrder: 3 }),
    row(from + 3, templateId, { recipientCode: "demo_department", labelEn: "The implementing department (demo)", labelMs: "Jabatan pelaksana (demo)", mandatory: false, ackRequired: false, condition: "NONE", isOriginal: false, sortOrder: 4 }),
    row(from + 4, templateId, { recipientCode: "demo_guarantor", labelEn: "The guarantor", labelMs: "Penjamin", mandatory: true, ackRequired: true, condition: "GUARANTOR_EXISTS", isOriginal: false, sortOrder: 5 }),
  ];
  await db.formDistribution.createMany({
    data: [
      ...standard(1, `${P}dt30`),
      row(6, `${P}dt31`, { recipientCode: "demo_delegate", labelEn: "The delegate (original)", labelMs: "Penerima perwakilan (asal)", mandatory: true, ackRequired: true, condition: "NONE", isOriginal: true, sortOrder: 1 }),
      row(7, `${P}dt31`, { recipientCode: "demo_file", labelEn: "Contract file (demo)", labelMs: "Fail kontrak (demo)", mandatory: true, ackRequired: false, condition: "NONE", isOriginal: false, sortOrder: 2 }),
      ...standard(8, `${P}dt32`),
    ],
  });
  await db.routingSheetType.createMany({
    data: [
      { id: `${P}hrt1`, organisationId, code: "demo_interim_sheet", labelEn: "Demo interim certificate routing sheet", labelMs: "Helaian penghalaan perakuan interim demo", subject: "CERTIFICATE", certificateKind: "INTERIM_PAYMENT", templateId: null, upperEdgeInclusive: null, provenance: "ASSUMED", notes: "Invented: 21 days printed as the total, its stages printing 10 and 7 (both shown).", sortOrder: 1 },
      { id: `${P}hrt2`, organisationId, code: "demo_variation_quotation_sheet", labelEn: "Demo variation routing sheet (quotation)", labelMs: "Helaian penghalaan perubahan kerja demo (sebut harga)", subject: "CERTIFICATE", certificateKind: "VARIATION", upperEdgeInclusive: true, provenance: "ASSUMED", notes: "Invented bands: two weeks up to 20%, six weeks above; a value on the edge falls in the band it closes (assumed).", sortOrder: 2 },
      { id: `${P}hrt3`, organisationId, code: "demo_pre_award_sheet", labelEn: "Demo pre-award routing sheet", labelMs: "Helaian penghalaan pra-award demo", subject: "AWARD", certificateKind: null, upperEdgeInclusive: null, provenance: "ASSUMED", notes: "Invented: 21 days.", sortOrder: 3 },
    ],
  });
  await db.routingCheckDef.createMany({
    data: [
      { id: `${P}hrc1`, organisationId, typeId: `${P}hrt1`, order: 1, kind: "CHECKED", labelEn: "Checked by the section", labelMs: "Disemak oleh seksyen", officeCode: "SEC_PRE", targetDays: 10 },
      { id: `${P}hrc2`, organisationId, typeId: `${P}hrt1`, order: 2, kind: "VERIFIED", labelEn: "Verified by contracts", labelMs: "Disahkan oleh kontrak", officeCode: "HOD_CP", targetDays: 7 },
      { id: `${P}hrc3`, organisationId, typeId: `${P}hrt2`, order: 1, kind: "CHECKED", labelEn: "Checked by the section", labelMs: "Disemak oleh seksyen", officeCode: "SEC_PRE", targetDays: null },
      { id: `${P}hrc4`, organisationId, typeId: `${P}hrt2`, order: 2, kind: "VERIFIED", labelEn: "Verified by contracts", labelMs: "Disahkan oleh kontrak", officeCode: "HOD_CP", targetDays: null },
      { id: `${P}hrc5`, organisationId, typeId: `${P}hrt3`, order: 1, kind: "CHECKED", labelEn: "Proposal checked by the section", labelMs: "Kertas disemak oleh seksyen", officeCode: "SEC_PRE", targetDays: null },
      { id: `${P}hrc6`, organisationId, typeId: `${P}hrt3`, order: 2, kind: "VERIFIED", labelEn: "Proposal verified by contracts", labelMs: "Kertas disahkan oleh kontrak", officeCode: "HOD_CP", targetDays: null },
    ],
  });
  await db.routingTarget.createMany({
    data: [
      { id: `${P}htg1`, organisationId, typeId: `${P}hrt1`, targetDays: 21, provenance: "ASSUMED", notes: "Invented." },
      { id: `${P}htg2`, organisationId, typeId: `${P}hrt2`, pctMax: "20", targetDays: 14, provenance: "ASSUMED", notes: "Invented." },
      { id: `${P}htg3`, organisationId, typeId: `${P}hrt2`, pctMin: "20", targetDays: 42, provenance: "ASSUMED", notes: "Invented." },
      { id: `${P}htg4`, organisationId, typeId: `${P}hrt3`, targetDays: 21, provenance: "ASSUMED", notes: "Invented." },
    ],
  });
}

// ------------------------------------------------------------------ certificates

export async function loadCertificatesDemo(db: Db, organisationId: string) {
  const { diffFields } = await import("../src/lib/audit/diff");
  const { loadContract, contractLabel } = await import("../src/lib/contract/repo");
  const { baselineFor } = await import("../src/lib/contract/baseline");
  const { storedDay } = await import("../src/lib/dates");
  const { snapshotFaults } = await import("../src/lib/certificate/snapshot");
  const { applyOverrides, overrideFaults } = await import("../src/lib/certificate/override");
  const { templateNow, routingTypeNow, officeHolders, blockOf } = await import("../src/lib/certificate/repo");
  const { pinRefusals, pinRevision } = await import("../src/lib/certificate/revision");
  const { freezeRoutingType, typeFaults, routingSheet, receivedFaults, checkFaults } = await import("../src/lib/certificate/routing-sheet");
  const { signFaults, allSigned } = await import("../src/lib/certificate/signature");
  const { copiesFor, despatchFaults, acknowledgeFaults } = await import("../src/lib/certificate/distribution");
  const { certificateFieldValues, mergeFields } = await import("../src/lib/certificate/fields");
  const { renderIssue } = await import("../src/lib/certificate/issue");
  const { certificateTransition } = await import("../src/lib/certificate/status");
  const { nextSequence } = await import("../src/lib/certificate/sequence");
  const { KIND_WORDS, STATUS_WORDS } = await import("../src/lib/certificate/labels");
  const { issueReference } = await import("../src/lib/numbering/issue");
  const { fieldsNamed } = await import("../src/lib/templates/merge");
  const { awardSheetOf } = await import("../src/lib/certificate/award-sheet");
  const { loadAward } = await import("../src/lib/award/repo");
  const { ORGANISATION_NAME } = await import("../src/lib/org");
  const { parseSen, senToDecimalString } = await import("../src/lib/money");
  void blockOf;

  const audits: { id: string; organisationId: string; entity: string; entityId: string; entityLabel: string; action: "CREATE" | "UPDATE" | "DELETE"; at: Date; changes: object[]; reason: string; unattributed: boolean }[] = [];
  let n = 0;
  const audit = (entity: string, entityId: string, label: string, action: "CREATE" | "UPDATE", when: string, changes: object[], reason = "") => audits.push({ id: `${P}hau${++n}`, organisationId, entity, entityId, entityLabel: label, action, at: at(when), changes, reason, unattributed: true });
  const ON_BEHALF = "recorded on behalf of, not signed";
  const people = { aisyah: { id: `${P}p1`, name: "Aisyah Rahman", isActive: true }, bala: { id: `${P}p2`, name: "Bala Krishnan", isActive: true }, chen: { id: `${P}p3`, name: "Chen Wei Ling", isActive: true }, eng: { id: `${P}p5`, name: "Eng Siew Mei", isActive: true } };

  const l = (await loadContract(`${P}con3`))!;
  const contract = contractLabel({ number: l.contract.number, award: { awardeeName: l.award.awardeeName } });
  const versions = l.contract.baselines.filter((b) => b.version != null).map((b) => ({ ...b, recordedOn: b.recordedOn ? storedDay(b.recordedOn) : null }));
  const label = (kind: keyof typeof KIND_WORDS, number: string | null = null) => `${contract} · ${KIND_WORDS[kind].en}${number ? ` ${number}` : ""}`;
  const v2 = baselineFor(versions, "2026-09-30")!;
  if (v2.reason !== "EXECUTED") throw new Error("demo_con3 has no executed baseline on 30 Sep");

  type Kind = keyof typeof KIND_WORDS;
  interface Plan {
    id: string;
    kind: Kind;
    templateId: string | null;
    routingTypeId: string | null;
    openedAt: string;
    computed: Parameters<typeof snapshotFaults>[0] | null;
  }
  /// Open a draft as `openCertificate` would: the baseline in force that day, figures and type judged.
  async function open(p: Plan) {
    const on = p.openedAt.slice(0, 10);
    const b = baselineFor(versions, on)!;
    if (p.computed) fail(`${p.id} figures`, snapshotFaults(p.computed));
    if (p.routingTypeId) fail(`${p.id} routing type`, typeFaults(await routingTypeNow(p.routingTypeId), "CERTIFICATE", p.kind, on));
    await db.certificate.create({ data: { id: p.id, organisationId, contractId: l.contract.id, kind: p.kind, templateId: p.templateId, routingTypeId: p.routingTypeId, baselineId: b.id, computedSnapshot: (p.computed ?? undefined) as never, openedAt: at(p.openedAt), openedOn: day(on) } });
    audit("Certificate", p.id, label(p.kind), "CREATE", p.openedAt, diffFields(null, { certificate: KIND_WORDS[p.kind].en, stage: STATUS_WORDS.DRAFT.en, baselineVersion: `version ${b.version}`, figures: p.computed ? p.computed.rule.en : "none", routed: p.routingTypeId ? "yes" : "no" }));
  }
  const move = async (id: string, kind: Kind, from: string, to: string, when: string, extra: Record<string, unknown> = {}, words: Record<string, unknown> = {}) => {
    const t = certificateTransition(from as never, to as never);
    if (t) throw new Error(`demo ${id}: ${from} → ${to} refused (${t})`);
    await db.certificate.update({ where: { id }, data: { status: to as never, ...extra } });
    audit("Certificate", id, label(kind), "UPDATE", when, diffFields({ stage: STATUS_WORDS[from as never as keyof typeof STATUS_WORDS].en }, { stage: STATUS_WORDS[to as never as keyof typeof STATUS_WORDS].en, ...words }));
  };

  // ------------------------------------------------ demo_hct1: an interim certificate, issued
  const interim = {
    version: 1 as const,
    computedOn: "2026-09-30",
    rule: { en: "Demo valuation: retention on work executed only (invented)", ms: "Penilaian demo: wang tahanan atas kerja sahaja (rekaan)" },
    lines: [
      { key: "workExecuted", labelEn: "Work executed", labelMs: "Kerja yang dilaksanakan", type: "MONEY" as const, value: "12000.00", overridable: true },
      { key: "retention", labelEn: "Less retention (5% of work executed)", labelMs: "Tolak wang tahanan (5% kerja)", type: "MONEY" as const, value: "600.00", overridable: false },
      { key: "materialsOnSite", labelEn: "Materials on site", labelMs: "Bahan di tapak", type: "MONEY" as const, value: "1500.00", overridable: true },
      { key: "previouslyCertified", labelEn: "Less previously certified", labelMs: "Tolak yang telah diperakui", type: "MONEY" as const, value: "0.00", overridable: false },
    ],
    totals: [
      { key: "grossValuation", labelEn: "Gross valuation", labelMs: "Nilai kasar", terms: [{ key: "workExecuted", sign: 1 as const }, { key: "materialsOnSite", sign: 1 as const }] },
      { key: "netValuation", labelEn: "Net valuation", labelMs: "Nilai bersih", terms: [{ key: "grossValuation", sign: 1 as const }, { key: "retention", sign: -1 as const }] },
      { key: "amountDue", labelEn: "Amount due", labelMs: "Amaun kena dibayar", terms: [{ key: "netValuation", sign: 1 as const }, { key: "previouslyCertified", sign: -1 as const }] },
    ],
    routingRatio: null,
  };
  const c1 = `${P}hct1`;
  await open({ id: c1, kind: "INTERIM_PAYMENT", templateId: `${P}dt30`, routingTypeId: `${P}hrt1`, openedAt: "2026-09-30T03:00", computed: interim });
  // An override in draft, with its justification and the officer it is recorded for.
  {
    const r = overrideFaults({ status: "DRAFT", snapshot: interim, current: applyOverrides(interim, []), fieldKey: "materialsOnSite", value: "1350.00", justification: "Two deliveries were not yet on site at the valuation (demo)", personKnown: true });
    fail("hct1 override", r.faults);
    await db.certificateOverride.create({ data: { id: `${P}hov1`, organisationId, certificateId: c1, fieldKey: "materialsOnSite", computed: r.computed!, overridden: r.normalised!, justification: "Two deliveries were not yet on site at the valuation (demo)", personId: people.chen.id, personName: people.chen.name, recordedAt: at("2026-09-30T04:00") } });
    audit("CertificateOverride", `${P}hov1`, `${label("INTERIM_PAYMENT")} · Materials on site`, "CREATE", "2026-09-30T04:00", diffFields(null, { figure: "Materials on site", certificateComputedAmount: "RM1,500.00", certificateOverrideAmount: "RM1,350.00", recordedFor: people.chen.name, recordedOnBehalf: ON_BEHALF }), "Two deliveries were not yet on site at the valuation (demo)");
  }
  // Sent for routing: the type frozen; DATE (1) the same day.
  const t1 = freezeRoutingType((await routingTypeNow(`${P}hrt1`))!, "2026-09-30");
  await move(c1, "INTERIM_PAYMENT", "DRAFT", "IN_ROUTING", "2026-09-30T05:00", { routingSnapshot: t1 as never }, { routingSheet: t1.labelEn, checks: t1.checks.map((x) => x.labelEn).join(", "), figures: "frozen as computed" });
  fail("hct1 DATE (1)", receivedFaults(true, "2026-09-30", "2026-09-30", null, { firstOpenedOn: null, firstDecidedOn: null }));
  await db.certificate.update({ where: { id: c1 }, data: { routingReceivedOn: day("2026-09-30"), routingReceivedRecordedAt: at("2026-09-30T05:05") } });
  audit("Certificate", c1, label("INTERIM_PAYMENT"), "UPDATE", "2026-09-30T05:05", diffFields({ receivedOn: null }, { receivedOn: "2026-09-30" }));

  type RouteSpec = { id: string; openedOn: string; createdAt: string; status: "APPROVED" | "REJECTED" | "PENDING"; supersedes: string | null; steps: { seq: number; roleCode: string; roleLabel: string; act: "R" | "A"; person: { id: string; name: string } | null; decision: "DONE" | "REJECTED" | "PENDING"; on: string | null; reason?: string }[] };
  const routes: RouteSpec[] = [];
  /// An invented route trail (6.13 opens real ones): each step judged in order, by the office's holder on its day.
  async function route(certId: string, kind: Kind, r: RouteSpec, value: string) {
    for (const s of r.steps) if (s.person && s.on) {
      const h = await officeHolders(l, s.roleCode, s.on);
      if (!h.holderIds.includes(s.person.id)) throw new Error(`demo ${r.id}: ${s.person.name} does not hold ${s.roleCode} on ${s.on}`);
    }
    await db.approvalInstance.create({
      data: {
        id: r.id, organisationId, matterKind: "CERTIFICATE", certificateId: certId, domain: "demo_certificate", value, checkedAgainstMatrix: false, warnings: [], status: r.status, openedAt: day(r.openedOn), createdAt: at(r.createdAt), closedAt: r.status === "PENDING" ? null : at(`${r.steps.at(-1)!.on ?? r.openedOn}T09:00`), supersedesInstanceId: r.supersedes,
        steps: { create: r.steps.map((s) => ({ id: `${r.id.replace("hri", "hrs")}_${s.seq}`, sequence: s.seq, roleCode: s.roleCode, roleLabel: s.roleLabel, act: s.act, decision: s.decision, decidedByPersonId: s.person?.id ?? null, decidedByName: s.person?.name ?? null, decidedOn: s.on ? day(s.on) : null, reason: s.reason ?? "", recordedAt: s.on ? at(`${s.on}T08:00`) : null })) },
      },
    });
    audit("ApprovalInstance", r.id, `${label(kind)} · approval route`, "CREATE", `${r.openedOn}T06:00`, diffFields(null, { route: r.steps.map((s) => s.roleLabel).join(" → "), routedOn: "An invented demo trail, not routed by the approval matrix" }));
    routes.push(r);
  }
  const sheetOf1 = async () => {
    const c = (await db.certificate.findUnique({ where: { id: c1 }, include: { approvalInstances: { include: { steps: true } }, routingChecks: true } }))!;
    const { routesOf, checksOf } = await import("../src/lib/certificate/repo");
    return routingSheet({ type: t1, receivedOn: "2026-09-30", routes: routesOf(c.approvalInstances), checks: checksOf(c.routingChecks), ratio: null, today: "2026-10-02" });
  };
  let ck = 0;
  async function check(certId: string, kind: Kind, defOrder: number, person: { id: string; name: string; isActive: boolean }, on: string, note = "") {
    const sheet = await sheetOf1();
    const def = sheet.current.checks.find((x) => x.def.order === defOrder)!.def;
    const h = await officeHolders(l, def.officeCode!, on);
    fail(`${certId} check ${defOrder}`, checkFaults({ open: true, sheet, defOrder, person, holders: { holderIds: h.holderIds, delegateIds: h.delegates.map((d) => d.personId) }, on, today: on }));
    const id = `${P}hck${++ck}`;
    await db.routingCheck.create({ data: { id, organisationId, certificateId: certId, iteration: sheet.current.n, defOrder, kind: def.kind, label: def.labelEn, personId: person.id, personName: person.name, on: day(on), note, recordedAt: at(`${on}T06:30`) } });
    audit("RoutingCheck", id, `${label(kind)} · ${def.labelEn}`, "CREATE", `${on}T06:30`, diffFields(null, { check: def.labelEn, round: sheet.current.n, by: person.name, on, note: note || null, recordedOnBehalf: ON_BEHALF }));
  }
  // The first round: checked and verified, then refused by the certifying officer for re-measurement.
  await check(c1, "INTERIM_PAYMENT", 1, people.eng, "2026-09-30");
  await check(c1, "INTERIM_PAYMENT", 2, people.chen, "2026-09-30");
  await route(c1, "INTERIM_PAYMENT", { id: `${P}hri1`, openedOn: "2026-09-30", createdAt: "2026-09-30T06:00", status: "REJECTED", supersedes: null, steps: [{ seq: 1, roleCode: "HOD_CP", roleLabel: "Head of Contract & Procurement", act: "R", person: people.chen, decision: "DONE", on: "2026-10-01" }, { seq: 2, roleCode: "FD", roleLabel: "Finance Director", act: "A", person: people.bala, decision: "REJECTED", on: "2026-10-01", reason: "Materials to be re-checked against the delivery orders (demo)." }] }, "12750.00");
  // Resubmitted: a successor route (ADR 0009), the checks recorded again, then approved.
  await route(c1, "INTERIM_PAYMENT", { id: `${P}hri2`, openedOn: "2026-10-01", createdAt: "2026-10-01T06:00", status: "APPROVED", supersedes: `${P}hri1`, steps: [{ seq: 1, roleCode: "HOD_CP", roleLabel: "Head of Contract & Procurement", act: "R", person: people.chen, decision: "DONE", on: "2026-10-02" }, { seq: 2, roleCode: "FD", roleLabel: "Finance Director", act: "A", person: people.bala, decision: "DONE", on: "2026-10-02" }] }, "12750.00");
  await check(c1, "INTERIM_PAYMENT", 1, people.eng, "2026-10-01", "Resubmitted with the delivery orders");
  await check(c1, "INTERIM_PAYMENT", 2, people.chen, "2026-10-01");
  {
    const s = await sheetOf1();
    if (s.routeState !== "APPROVED" || !s.checksDone || !s.date1) throw new Error("demo hct1: not ready for signing");
    if (s.iterations.length !== 2 || s.verdict.state !== "MET") throw new Error(`demo hct1: expected two rounds within the target, read ${s.iterations.length} / ${s.verdict.state}`);
  }
  await move(c1, "INTERIM_PAYMENT", "IN_ROUTING", "SIGNING", "2026-10-02T03:00");

  /// The day a certificate's route was approved, read as the act reads it (its frozen sheet over its routes); null without a sheet.
  async function approvedOnOf(certId: string, on: string): Promise<string | null> {
    const c = await db.certificate.findUniqueOrThrow({ where: { id: certId }, include: { approvalInstances: { include: { steps: true } }, routingChecks: true } });
    const { readRoutingSnapshot } = await import("../src/lib/certificate/routing-sheet");
    const { routesOf, checksOf } = await import("../src/lib/certificate/repo");
    const type = readRoutingSnapshot(c.routingSnapshot);
    return type ? routingSheet({ type, receivedOn: c.routingReceivedOn ? storedDay(c.routingReceivedOn) : null, routes: routesOf(c.approvalInstances), checks: checksOf(c.routingChecks), ratio: null, today: on }).date2 : null;
  }
  /// Record the blocks of a form in order, each judged as the signature act judges it; the last issues.
  async function sign(certId: string, kind: Kind, templateId: string, plan: { order: number; person?: { id: string; name: string; isActive: boolean }; name?: string; ic?: string; on: string; decision?: "SUPPORTED" | "NOT_SUPPORTED"; refused?: string }[], computed: typeof interim | null, issue: { despatch: { code: string; method: "BY_HAND" | "REGISTERED_POST" | "COLLECTION"; on: string; ack?: string }[] } | null) {
    const form = (await templateNow(templateId))!;
    const cert = (await db.certificate.findUniqueOrThrow({ where: { id: certId }, include: { baseline: true, overrides: true } }))!;
    const { pinContextOf } = await import("../src/lib/certificate/write");
    fail(`${certId} pin`, pinRefusals(form, mergeFields(kind), fieldsNamed, pinContextOf(cert)));
    const rev = pinRevision(form, plan[0].on);
    await db.certificate.update({ where: { id: certId }, data: { templateRevision: rev as never, pinnedAt: at(`${plan[0].on}T04:00`) } });
    const signed: { blockOrder: number; personId: string | null; name: string; signedOn: string; refused: boolean; decision: "SUPPORTED" | "NOT_SUPPORTED" | null }[] = [];
    let date: string | null = null;
    for (const [i, s] of plan.entries()) {
      const b = rev.blocks.find((x) => x.blockOrder === s.order)!;
      const holders = b.officeRule === "NAMED_OFFICE" ? await officeHolders(l, b.officeCode!, s.on) : null;
      const r = signFaults(rev.blocks, signed, { blockOrder: s.order, name: s.name ?? "", icNumber: s.ic ?? "", signedOn: s.person ? null : s.on, refused: !!s.refused, refusalNote: s.refused ?? "", decision: s.decision ?? null, decisionCap: null }, { status: "SIGNING", today: s.on, person: s.person ?? null, holders, valueBearing: !!computed, openedOn: storedDay((await db.certificate.findUniqueOrThrow({ where: { id: certId }, select: { openedOn: true } })).openedOn), approvedOn: await approvedOnOf(certId, s.on) });
      fail(`${certId} block ${s.order}`, r.faults);
      const id = `${certId.replace("hct", "hsg")}_${s.order}`;
      const { maskIc } = await import("../src/lib/award/mask");
      await db.certificateSignature.create({ data: { id, organisationId, certificateId: certId, blockOrder: b.blockOrder, blockKind: b.blockKind, blockLabel: b.labelEn, personId: s.person?.id ?? null, name: s.person?.name ?? s.name!, officeCode: b.officeCode, officeLabel: b.officeCode === "HOD_CP" ? "Head of Contract & Procurement" : b.officeCode === "FD" ? "Finance Director" : b.officeCode === "CEO" ? "Chief Executive" : null, delegationId: r.delegationId, icMasked: s.ic ? maskIc(s.ic) : null, decision: s.decision ?? null, refused: !!s.refused, refusalNote: s.refused ?? "", signedOn: day(r.signedOn!), recordedAt: at(`${s.on}T0${4 + i}:00`) } });
      audit("CertificateSignature", id, `${label(kind)} · ${b.labelEn}`, "CREATE", `${s.on}T0${4 + i}:00`, diffFields(null, { block: b.labelEn, signedBy: s.person?.name ?? s.name, answer: s.decision === "SUPPORTED" ? "Supported" : null, refusedToSign: s.refused ? "yes" : null, signedOn: r.signedOn, datesTheCertificate: b.datesCertificate ? "yes" : null, formPinned: i === 0 ? `${rev.nameEn} (${rev.formCode}), form version ${rev.bodyVersion}` : null, recordedOnBehalf: ON_BEHALF }));
      signed.push({ blockOrder: b.blockOrder, personId: s.person?.id ?? null, name: s.person?.name ?? s.name!, signedOn: r.signedOn!, refused: !!s.refused, decision: s.decision ?? null });
      if (b.datesCertificate) {
        date = r.signedOn!;
        await db.certificate.update({ where: { id: certId }, data: { certificateDate: day(date) } });
      }
    }
    if (!issue) return;
    if (!allSigned(rev.blocks, signed)) throw new Error(`demo ${certId}: blocks left unsigned`);
    const on = plan.at(-1)!.on;
    const plan2 = copiesFor(rev.distribution, { liveBond: null, consultingEngineer: l.contract.consultingEngineer });
    fail(`${certId} copies`, plan2.faults);
    const number = await issueReference(db as never, organisationId, "certificate", day(on));
    const issued = await db.certificate.findMany({ where: { contractId: l.contract.id, status: "ISSUED" }, select: { kind: true, sequence: true } });
    const sequence = nextSequence(issued, kind);
    const overrides = await db.certificateOverride.findMany({ where: { certificateId: certId } });
    const figures = computed ? applyOverrides(computed, overrides) : { lines: [], totals: [], overridden: false };
    const values = (lang: "EN" | "MS") => certificateFieldValues({ lang, organisationName: ORGANISATION_NAME, contract: { number: l.contract.number, title: l.ex.title, contractorName: l.award.awardeeName }, baseline: { contractSum: v2.contractSum.toString(), contractDate: v2.contractDate ? storedDay(v2.contractDate) : null, completionPeriod: v2.completionPeriod, completionUnit: v2.completionUnit }, certificate: { kind, number, sequence, date }, figures });
    const r = renderIssue(rev, kind, values);
    fail(`${certId} issue`, r.faults);
    for (const [i, t] of r.texts.entries()) await db.certificateDocument.create({ data: { id: `${certId.replace("hct", "hcd")}_${i + 1}`, organisationId, certificateId: certId, templateId: rev.templateId, templateCode: rev.code, templateName: rev.nameEn, templateFormCode: rev.formCode, templateRevisionDate: rev.revisionDate ? day(rev.revisionDate) : null, templateBodyVersion: rev.bodyVersion, language: t.language, fields: values(t.language), renderedText: t.text, frozenAt: at(`${on}T09:00`) } });
    for (const cp of plan2.copies) {
      const d = issue.despatch.find((x) => x.code === cp.distributionCode);
      const facts = { mandatory: cp.mandatory, ackRequired: cp.ackRequired, despatchedOn: null as string | null, acknowledgedOn: null as string | null };
      if (d) {
        fail(`${certId} copy ${cp.copyNo}`, despatchFaults(facts, d.on, d.on, on));
        facts.despatchedOn = d.on;
        if (d.ack) fail(`${certId} copy ${cp.copyNo} ack`, acknowledgeFaults(facts, d.ack, d.ack));
      }
      const id = `${certId.replace("hct", "hcp")}_${cp.copyNo}`;
      await db.issuedCopy.create({ data: { id, organisationId, certificateId: certId, copyNo: cp.copyNo, recipientName: cp.recipientName, addressedTo: cp.addressedTo, stampText: "", recordedAt: at(`${on}T09:00`), distributionCode: cp.distributionCode, mandatory: cp.mandatory, ackRequired: cp.ackRequired, isOriginal: cp.isOriginal, method: d?.method ?? null, despatchedOn: d ? day(d.on) : null, acknowledgedOn: d?.ack ? day(d.ack) : null } });
      if (d) audit("IssuedCopy", id, `${label(kind, number)} · copy ${cp.copyNo}`, "UPDATE", `${d.on}T09:30`, diffFields({ sentOn: null }, { sentBy: d.method === "BY_HAND" ? "By hand" : d.method === "REGISTERED_POST" ? "Registered post" : "Collected", sentOn: d.on, to: cp.addressedTo }));
      if (d?.ack) audit("IssuedCopy", id, `${label(kind, number)} · copy ${cp.copyNo}`, "UPDATE", `${d.ack}T02:00`, diffFields({ acknowledgedOn: null }, { acknowledgedOn: d.ack }));
    }
    const snapshot = { issuedOn: on, number, sequence, certificateDate: date, form: { name: rev.nameEn, formCode: rev.formCode, revisionDate: rev.revisionDate, bodyVersion: rev.bodyVersion, pinnedOn: rev.pinnedOn }, baseline: { version: v2.version, reason: v2.reason }, figures: { overridden: figures.overridden, lines: figures.lines.map((x) => ({ key: x.key, value: x.value, computed: (x as { computed?: string | null }).computed ?? x.value })), totals: figures.totals.map((x) => ({ key: x.key, value: x.value, computed: x.computed })) }, copies: plan2.copies.map((p) => ({ copyNo: p.copyNo, recipient: p.recipientName, addressedTo: p.addressedTo, mandatory: p.mandatory, ackRequired: p.ackRequired, isOriginal: p.isOriginal })), skipped: plan2.skipped };
    await move(certId, kind, "SIGNING", "ISSUED", `${on}T09:00`, { number, sequence, issuedAt: at(`${on}T09:00`), issueSnapshot: snapshot as never }, { number, ordinal: `${KIND_WORDS[kind].en} ${sequence} on this contract`, certificateDate: date, copies: plan2.copies.length, notSent: plan2.skipped.map((s) => s.recipientName).join(", ") || null });
  }
  await sign(c1, "INTERIM_PAYMENT", `${P}dt30`, [
    { order: 1, person: people.chen, on: "2026-10-02", decision: "SUPPORTED" },
    { order: 2, person: people.bala, on: "2026-10-02" },
    { order: 3, name: "Demo Contractor's signatory", ic: "800101-01-1234", on: "2026-10-02" },
    { order: 4, name: "Demo witness", on: "2026-10-02" },
  ], interim, { despatch: [{ code: "demo_contractor", method: "BY_HAND", on: "2026-10-02", ack: "2026-10-02" }, { code: "demo_finance", method: "BY_HAND", on: "2026-10-02" }, { code: "demo_file", method: "BY_HAND", on: "2026-10-02" }] });

  // ------------------------------------------------ demo_hct2: a variation on its sheet at exactly 20.00%
  const c2 = `${P}hct2`;
  const vo = {
    version: 1 as const,
    computedOn: "2026-10-02",
    rule: { en: "Demo variation valuation (invented)", ms: "Penilaian perubahan kerja demo (rekaan)" },
    lines: [{ key: "variationValue", labelEn: "Value of the variation", labelMs: "Nilai perubahan kerja", type: "MONEY" as const, value: "7200.00", overridable: false }],
    totals: [],
    routingRatio: { num: "7200.00", den: senToDecimalString(parseSen(v2.contractSum.toString())), labelEn: "The variation against the contract sum", labelMs: "Perubahan kerja berbanding harga kontrak" },
  };
  await open({ id: c2, kind: "VARIATION", templateId: `${P}dt32`, routingTypeId: `${P}hrt2`, openedAt: "2026-10-02T02:00", computed: vo });
  const t2 = freezeRoutingType((await routingTypeNow(`${P}hrt2`))!, "2026-10-02");
  await move(c2, "VARIATION", "DRAFT", "IN_ROUTING", "2026-10-02T02:30", { routingSnapshot: t2 as never }, { routingSheet: t2.labelEn, checks: t2.checks.map((x) => x.labelEn).join(", "), figures: "frozen as computed" });
  await db.certificate.update({ where: { id: c2 }, data: { routingReceivedOn: day("2026-10-02"), routingReceivedRecordedAt: at("2026-10-02T02:35") } });
  audit("Certificate", c2, label("VARIATION"), "UPDATE", "2026-10-02T02:35", diffFields({ receivedOn: null }, { receivedOn: "2026-10-02" }));
  {
    const s = routingSheet({ type: t2, receivedOn: "2026-10-02", routes: [], checks: [], ratio: { num: 720000n, den: parseSen(v2.contractSum.toString()) }, today: "2026-10-02" });
    if (s.target.state !== "SET" || s.target.days !== 14) throw new Error("demo hct2: 20.00% should read two weeks");
    const h = await officeHolders(l, "SEC_PRE", "2026-10-02");
    fail("hct2 check 1", checkFaults({ open: true, sheet: s, defOrder: 1, person: people.eng, holders: { holderIds: h.holderIds, delegateIds: [] }, on: "2026-10-02", today: "2026-10-02" }));
    await db.routingCheck.create({ data: { id: `${P}hck${++ck}`, organisationId, certificateId: c2, iteration: 1, defOrder: 1, kind: "CHECKED", label: t2.checks[0].labelEn, personId: people.eng.id, personName: people.eng.name, on: day("2026-10-02"), recordedAt: at("2026-10-02T03:00") } });
    audit("RoutingCheck", `${P}hck${ck}`, `${label("VARIATION")} · ${t2.checks[0].labelEn}`, "CREATE", "2026-10-02T03:00", diffFields(null, { check: t2.checks[0].labelEn, round: 1, by: people.eng.name, on: "2026-10-02", recordedOnBehalf: ON_BEHALF }));
  }

  // ------------------------------------------------ demo_hct3: a letter, a draft going straight to signing
  await open({ id: `${P}hct3`, kind: "DELEGATION_LETTER", templateId: `${P}dt31`, routingTypeId: null, openedAt: "2026-10-02T04:00", computed: null });

  // ------------------------------------------------ demo_hct4: an advance payment certificate being signed
  const c4 = `${P}hct4`;
  const advance = { ...interim, computedOn: "2026-10-01", rule: { en: "Demo advance (invented; no advance procedure is documented)", ms: "Pendahuluan demo (rekaan)" }, lines: [{ key: "advance", labelEn: "Advance", labelMs: "Pendahuluan", type: "MONEY" as const, value: "3600.00", overridable: false }], totals: [] };
  await open({ id: c4, kind: "ADVANCE_PAYMENT", templateId: `${P}dt30`, routingTypeId: null, openedAt: "2026-10-01T02:00", computed: advance as never });
  // 614-C1 (6.13 Part A step 1): a money-bearing kind is signed only on an approved route, whatever its routing
  // type; this one has no routing sheet, so its route is approved before it goes to signing.
  await route(c4, "ADVANCE_PAYMENT", { id: `${P}hri3`, openedOn: "2026-10-01", createdAt: "2026-10-01T02:30", status: "APPROVED", supersedes: null, steps: [{ seq: 1, roleCode: "HOD_CP", roleLabel: "Head of Contract & Procurement", act: "R", person: people.chen, decision: "DONE", on: "2026-10-01" }, { seq: 2, roleCode: "FD", roleLabel: "Finance Director", act: "A", person: people.bala, decision: "DONE", on: "2026-10-01" }] }, "3600.00");
  {
    const { draftSigningFaults } = await import("../src/lib/certificate/kinds");
    fail("hct4 to signing", draftSigningFaults("ADVANCE_PAYMENT", "APPROVED"));
  }
  await move(c4, "ADVANCE_PAYMENT", "DRAFT", "SIGNING", "2026-10-01T03:00");
  await sign(c4, "ADVANCE_PAYMENT", `${P}dt30`, [{ order: 1, person: people.chen, on: "2026-10-02", decision: "SUPPORTED" }], advance as never, null);

  // ------------------------------------------------ demo_hct5: a draft voided before issue
  await open({ id: `${P}hct5`, kind: "SUM_ADJUSTMENT", templateId: null, routingTypeId: null, openedAt: "2026-10-01T05:00", computed: null });
  await move(`${P}hct5`, "SUM_ADJUSTMENT", "DRAFT", "VOID", "2026-10-01T06:00", { voidReason: "Raised on the wrong contract (demo).", voidedAt: at("2026-10-01T06:00") });

  // ------------------------------------------------ demo_aw5's pre-award routing sheet
  {
    const aw = (await loadAward(`${P}aw5`))!;
    const type = freezeRoutingType((await routingTypeNow(`${P}hrt3`))!, "2026-08-24");
    fail("aw5 sheet type", typeFaults(await routingTypeNow(`${P}hrt3`), "AWARD", null, "2026-08-24"));
    {
      // The received day is judged as the act judges it: not after the appointment route opened or decided (R-5).
      const { routeBounds } = await import("../src/lib/certificate/routing-sheet");
      const { routesOf } = await import("../src/lib/certificate/repo");
      fail("aw5 received", receivedFaults(true, "2026-08-24", "2026-08-24", null, routeBounds(routesOf(aw.award.approvalInstances.filter((i) => i.domain === "appointment")))));
    }
    await db.awardRoutingSheet.create({ data: { id: `${P}hrw1`, organisationId, awardId: aw.award.id, typeId: `${P}hrt3`, typeSnapshot: type as never, startedAt: at("2026-08-24T02:00"), receivedOn: day("2026-08-24"), receivedRecordedAt: at("2026-08-24T02:00") } });
    const awLabel = `${aw.award.reference} · routing sheet`;
    audit("AwardRoutingSheet", `${P}hrw1`, awLabel, "CREATE", "2026-08-24T02:00", diffFields(null, { routingSheet: type.labelEn, checks: type.checks.map((c) => c.labelEn).join(", "), frozenOn: "2026-08-24", receivedOn: "2026-08-24" }));
    for (const [i, c] of [{ order: 1, person: people.eng, on: "2026-09-07" }, { order: 2, person: people.chen, on: "2026-09-08" }].entries()) {
      const rows = { sheet: { id: `${P}hrw1`, typeSnapshot: type, receivedOn: day("2026-08-24") }, checks: await db.routingCheck.findMany({ where: { awardId: aw.award.id } }) };
      const sheet = awardSheetOf(aw, rows, c.on)!;
      const def = sheet.current.checks.find((x) => x.def.order === c.order)!.def;
      const h = await officeHolders(l, def.officeCode!, c.on);
      fail(`aw5 check ${c.order}`, checkFaults({ open: true, sheet, defOrder: c.order, person: c.person, holders: { holderIds: h.holderIds, delegateIds: [] }, on: c.on, today: c.on }));
      await db.routingCheck.create({ data: { id: `${P}hck${++ck}`, organisationId, awardId: aw.award.id, iteration: 1, defOrder: c.order, kind: def.kind, label: def.labelEn, personId: c.person.id, personName: c.person.name, on: day(c.on), recordedAt: at(`${c.on}T0${3 + i}:00`) } });
      audit("RoutingCheck", `${P}hck${ck}`, `${awLabel} · ${def.labelEn}`, "CREATE", `${c.on}T0${3 + i}:00`, diffFields(null, { check: def.labelEn, round: 1, by: c.person.name, on: c.on, recordedOnBehalf: ON_BEHALF }));
    }
  }

  await db.auditEntry.createMany({ data: audits as never });
}

/// Read back after the load, through the product's own readings.
export async function checkCertificatesDemo(db: Db) {
  const { loadCertificate } = await import("../src/lib/certificate/repo");
  const { sheetOf } = await import("../src/lib/certificate/write");
  const { distributionState } = await import("../src/lib/certificate/distribution");
  const expected: Record<string, string> = { [`${P}hct1`]: "ISSUED", [`${P}hct2`]: "IN_ROUTING", [`${P}hct3`]: "DRAFT", [`${P}hct4`]: "SIGNING", [`${P}hct5`]: "VOID" };
  for (const [id, status] of Object.entries(expected)) {
    const l = await loadCertificate(id);
    if (!l || l.cert.status !== status) throw new Error(`${id}: expected ${status}, read ${l?.cert.status}`);
  }
  const c1 = (await loadCertificate(`${P}hct1`))!;
  const s = sheetOf(c1.cert, "2026-10-02")!;
  if (s.iterations.length !== 2 || s.verdict.state !== "MET") throw new Error("hct1: the resubmitted sheet does not read two rounds, met");
  const d = distributionState(c1.cert.copies.map((c) => ({ mandatory: !!c.mandatory, ackRequired: !!c.ackRequired, despatchedOn: c.despatchedOn ? "x" : null, acknowledgedOn: c.acknowledgedOn ? "x" : null })));
  if (!d.distributed || d.awaitingAck !== 1) throw new Error("hct1: expected distributed with one acknowledgement outstanding");
  const c2 = (await loadCertificate(`${P}hct2`))!;
  const s2 = sheetOf(c2.cert, "2026-10-02")!;
  if (s2.target.state !== "SET" || s2.target.days !== 14) throw new Error("hct2: 20.00% does not read two weeks");
  void db;
}

/// The certificates of the contracts given, children first, and their award sheets; rows only (their trail goes with the contract's label).
export async function wipeCertificates(db: Db, contractIds: readonly string[]) {
  if (!contractIds.length) return;
  const byContract = { certificate: { contractId: { in: [...contractIds] } } };
  await db.issuedCopy.deleteMany({ where: byContract });
  await db.certificateDocument.deleteMany({ where: byContract });
  await db.certificateSignature.deleteMany({ where: byContract });
  await db.certificateOverride.deleteMany({ where: byContract });
  await db.routingCheck.deleteMany({ where: byContract });
  // A resubmitted route points at the route it continues.
  await db.approvalStep.updateMany({ where: { instance: byContract, NOT: { carriedFromStepId: null } }, data: { carriedFromStepId: null } });
  await db.approvalInstance.updateMany({ where: { ...byContract, NOT: { supersedesInstanceId: null } }, data: { supersedesInstanceId: null } });
  await db.approvalStep.deleteMany({ where: { instance: byContract } });
  await db.approvalInstance.deleteMany({ where: byContract });
  await db.certificate.deleteMany({ where: { contractId: { in: [...contractIds] } } });
}

/// The award's routing sheets and their checks, for the awards given.
export async function wipeAwardRoutingSheets(db: Db, awardIds: readonly string[]) {
  if (!awardIds.length) return;
  await db.routingCheck.deleteMany({ where: { awardId: { in: [...awardIds] } } });
  await db.awardRoutingSheet.deleteMany({ where: { awardId: { in: [...awardIds] } } });
}

/// The demo's certificate configuration (rows by demo id), once nothing stands on it.
export async function wipeCertificatesConfig(db: Db) {
  const sub = (s: string) => ({ id: { startsWith: `${P}${s}` } });
  await db.routingTarget.deleteMany({ where: sub("htg") });
  await db.routingCheckDef.deleteMany({ where: sub("hrc") });
  await db.routingSheetType.deleteMany({ where: sub("hrt") });
  await db.formDistribution.deleteMany({ where: sub("hfd") });
  await db.formSignatureBlock.deleteMany({ where: sub("hsb") });
  await db.auditEntry.deleteMany({ where: { id: { startsWith: `${P}hau` } } });
}
