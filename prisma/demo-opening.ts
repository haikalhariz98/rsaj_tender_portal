/**
 * Demo data for 6.7: bid opening (plan §6, as ruled: X-4, X-10). Invented throughout; every
 * configured value is ASSUMED and none is a customer's figure, word or source (X-10 d). Every row
 * passes the checks of its act, judged by the product's own functions on the rows as they stand when
 * it is written (X-10 c), through the same context the actions read (`openingContext`); every act is
 * dated relative to the load day on its working days, never after now (X-10 a, b). The load reads
 * each opening back and refuses if one is not what it says.
 *
 * - Configuration (dated W(16)): people demo_p13–15 with their units; the Tender Opening Committee
 *   demo_c6 (seats demo_m60–62), an opening panel of two, excluding the Northern Region (the
 *   requesting region) and the units under it; the open tender method's bids opened by it, and a bid
 *   with no live purchase carried and reported to the committee (OD-4 A: REPORT, ASSUMED, a question
 *   to the customer); the opening policy demo_opol1 (the tenderers invited counted as purchasers;
 *   Grand Summary words in English and Malay). All ASSUMED.
 * - demo_sx16 (closed W(1) 15:00, box locked 15:05): the main opening demo_op1 the same afternoon:
 *   panel demo_p13 and demo_p14, both present; two authorisations open the box; four envelopes in
 *   time opened (demo_env1 Contoh, demo_env2 Sampel, demo_env3 and demo_env5 by bidders named at
 *   opening, who bought no documents); initials, the checklist (Sampel's registration form absent:
 *   reported, the method reports an incomplete bid), verdicts (all carried; the two with no live
 *   purchase reported), signatures, two pages, finalised — the estimate disclosed, its paper copy
 *   not in the box (a finding, explained) — and the signed scan demo_doc100 attached. The exercise
 *   is Opened. The late demo_env4, admitted at demo_mt13 (demo_d42), is opened at the supplementary
 *   opening demo_op2 (bidder named at opening, no purchase: carried, reported), finalised, scan
 *   demo_doc101.
 * - demo_sx20 (closed W(2)): the opening demo_op3 started W(1): the box opened on two
 *   authorisations, one envelope found in it registered (demo_env10, in time by the lock), then
 *   adjourned; resumed, one authorisation recorded, adjourned again (that authorisation lapses).
 */

import type { PrismaClient } from "../src/generated/prisma/client";
import { diffFields } from "../src/lib/audit/diff";
import { BID_ENTITY, envelopeFields, statusField } from "../src/lib/bids/audit-view";
import { lockedAtOrAfterClosing } from "../src/lib/bids/box";
import { dayIn, dayToDate, instantAt, storedDay, todayIn } from "../src/lib/dates";
import { formatDate } from "../src/lib/format";
import { parseSen, senToDecimalString, type Sen } from "../src/lib/money";
import { calendarOf, FIRMS } from "./demo-window";
import { demoPdf, writeDemoDocs } from "./demo-documents";
import { DEMO_ACTOR } from "./demo-actor";
import { demoOrgId } from "./demo-org";

type Db = PrismaClient;
const P = "demo_";
const demoRef = { startsWith: P };
const SX = (n: number) => `DEMO/SX/${String(n).padStart(4, "0")}/2026`;
export const OPENING_EXERCISES = [`${P}sx16`, `${P}sx20`] as const;
const CHAIR = { id: `${P}p13`, name: "Jamilah Ismail" };
const MEMBER = { id: `${P}p14`, name: "Kumar Selvam" };
const CLERK = { id: `${P}p4`, name: "Daniel Anak Jelani" };
const HOD_CP = { id: `${P}p3`, name: "Chen Wei Ling" };
const OPENING_COMMITTEE = { id: `${P}c6`, code: "OPENING_CTTE", nameEn: "Tender Opening Committee" };

type Entry = { id: string; organisationId: string; entity: string; entityId: string; entityLabel: string; action: "CREATE" | "UPDATE" | "DELETE"; at: Date; changes: object[]; reason: string; unattributed: boolean };
type Add = (entity: string, entityId: string, entityLabel: string, action: Entry["action"], when: Date, changes: object[], reason?: string) => void;

function refuse(what: string, fs: readonly { code: string; level: string }[]) {
  const b = fs.filter((f) => f.level === "block");
  if (b.length) throw new Error(`Demo 6.7 ${what} refused: ${b.map((f) => f.code).join(", ")}`);
}

// ------------------------------------------------------------------ configuration

/**
 * The opening's configuration, as Configuration › Users, Committees and Invitation save it, dated
 * W(16): read live when each opening starts, and frozen on it.
 */
export async function configureOpeningDemo(db: Db, organisationId: string) {
  const { committeePanelFaults, methodOpeningFaults, openingPolicyFaults, personUnitFault } = await import("../src/lib/opening/config");
  const org = await db.organisation.findUniqueOrThrow({ where: { id: organisationId }, select: { timeZone: true } });
  const tz = org.timeZone ?? (() => { throw new Error("Demo 6.7: the organisation's time zone is not set."); })();
  const { W } = calendarOf(todayIn(new Date(), tz)!);
  const at = instantAt(W(16), "09:30", tz)!;
  const later = (m: number) => new Date(at.getTime() + m * 60_000);
  const trail: Entry[] = [];
  let n = 0;
  const entry: Add = (entity, entityId, entityLabel, action, when, changes, reason = "") => trail.push({ id: `${P}bauoc${++n}`, organisationId, entity, entityId, entityLabel, action, at: when, changes, reason, ...DEMO_ACTOR });
  const units = (await db.orgUnit.findMany({ where: { organisationId }, select: { code: true } })).map((u) => u.code);

  const people = [
    { id: CHAIR.id, staffNo: "D013", name: CHAIR.name, email: "jamilah.ismail@demo.invalid", jobTitle: "Executive, Pre-contract", jobTitleMs: "Eksekutif, Pra-kontrak", orgUnitCode: "CP-PRE", department: "Contract & Procurement" },
    { id: MEMBER.id, staffNo: "D014", name: MEMBER.name, email: "kumar.selvam@demo.invalid", jobTitle: "Executive, Post-contract", jobTitleMs: "Eksekutif, Pasca-kontrak", orgUnitCode: "CP-POST", department: "Contract & Procurement" },
    { id: `${P}p15`, staffNo: "D015", name: "Mohd Rizal Ahmad", email: "rizal.ahmad@demo.invalid", jobTitle: "Engineer, Maintenance", jobTitleMs: "Jurutera, Penyelenggaraan", orgUnitCode: "NTH-MNT", department: "Northern Region" },
  ];
  for (const p of people) if (personUnitFault(p.orgUnitCode, units)) throw new Error(`Demo 6.7: ${p.name}'s unit is not configured.`);
  await db.person.createMany({ data: people.map((p) => ({ ...p, organisationId })) });
  for (const p of people) entry("Person", p.id, p.name, "CREATE", at, diffFields(null, { name: p.name, email: p.email, jobTitle: p.jobTitle, department: p.department, orgUnitCode: p.orgUnitCode }));

  // The committee and its seats (FR-OPN-002, FR-CTE-011).
  const panel = { panelSize: 2, panelSizeProvenance: "ASSUMED" as const, panelExclusionRule: true, panelExcludesUnitCode: "NTH", panelExclusionProvenance: "ASSUMED" as const };
  refuse("the committee's opening panel", committeePanelFaults(panel, { units }, "Invented for the demo.", true));
  await db.committee.create({
    data: {
      id: OPENING_COMMITTEE.id, organisationId, code: OPENING_COMMITTEE.code, nameEn: OPENING_COMMITTEE.nameEn, nameMs: "Jawatankuasa Pembuka Tender",
      mandate: "Opens the tenders and quotations received, reads each offer aloud and records the schedule of tenders.", governingSource: "Demo policy 7 (invented)", action: "RECOMMENDS",
      compositionProvenance: "ASSUMED", secretariatRoleCode: "HOD_CP", ...panel, notes: "Panel size and independence rule invented for the demo (ASSUMED).",
    },
  });
  const from = dayToDate(W(30));
  await db.committeeMember.createMany({
    data: [
      { id: `${P}m60`, committeeId: OPENING_COMMITTEE.id, personId: CHAIR.id, position: "CHAIRMAN", provenance: "ASSUMED", effectiveFrom: from },
      { id: `${P}m61`, committeeId: OPENING_COMMITTEE.id, personId: MEMBER.id, position: "MEMBER", provenance: "ASSUMED", effectiveFrom: from },
      { id: `${P}m62`, committeeId: OPENING_COMMITTEE.id, personId: `${P}p15`, position: "MEMBER", provenance: "ASSUMED", effectiveFrom: from },
    ],
  });
  entry("Committee", OPENING_COMMITTEE.id, OPENING_COMMITTEE.nameEn, "CREATE", later(1), diffFields(null, { name: OPENING_COMMITTEE.nameEn, mandate: "Opens the tenders and quotations received.", seats: `${CHAIR.name} (chairman), ${MEMBER.name}, Mohd Rizal Ahmad` }));
  entry("Committee", OPENING_COMMITTEE.id, OPENING_COMMITTEE.nameEn, "UPDATE", later(2), diffFields({ openingPanelMembers: "Not set", openingPanelMembersFrom: null, openingPanelExcludes: "Not set", openingPanelExclusionFrom: null }, { openingPanelMembers: 2, openingPanelMembersFrom: "Assumed", openingPanelExcludes: "Northern Region", openingPanelExclusionFrom: "Assumed" }), "Invented for the demo: an opening panel of two, independent of the requesting region.");

  // The open tender method's opening rules (OD-4, C-5).
  const committees = (await db.committee.findMany({ where: { organisationId, retiredOn: null }, select: { code: true } })).map((c) => c.code);
  const method = await db.sourcingMethod.findFirstOrThrow({ where: { organisationId, code: "open_tender" }, select: { id: true, nameEn: true } });
  const rule = { committeeCode: OPENING_COMMITTEE.code, committeeProvenance: "ASSUMED" as const, unpurchased: "REPORT" as const, unpurchasedProvenance: "ASSUMED" as const };
  refuse("the method's opening rules", methodOpeningFaults(rule, { committees }));
  await db.sourcingMethod.update({ where: { id: method.id }, data: { openingCommitteeCode: rule.committeeCode, openingCommitteeProvenance: rule.committeeProvenance, unpurchasedBidConsequence: rule.unpurchased, unpurchasedProvenance: rule.unpurchasedProvenance } });
  entry("SourcingMethod", method.id, method.nameEn, "UPDATE", later(3), diffFields({ openingCommittee: "Not set", openingCommitteeFrom: null, aBidWithNoLivePurchase: "Not set", aBidWithNoLivePurchaseFrom: null }, { openingCommittee: OPENING_COMMITTEE.nameEn, openingCommitteeFrom: "Assumed", aBidWithNoLivePurchase: "Carried, and reported to the committee", aBidWithNoLivePurchaseFrom: "Assumed" }), "Invented for the demo.");

  // The opening policy (OD-9, FR-OPN-010), unless the organisation already keeps one.
  if (!(await db.openingPolicy.findUnique({ where: { organisationId } }))) {
    const policy = { invitedCountReading: "PURCHASERS" as const, invitedCountProvenance: "ASSUMED" as const, qualifiedLabelEn: "Qualified", qualifiedLabelMs: "Layak", notQualifiedLabelEn: "Not qualified", notQualifiedLabelMs: "Tidak layak", lowestLabelEn: "Lowest qualified offer", lowestLabelMs: "Tawaran layak terendah", labelsProvenance: "ASSUMED" as const };
    refuse("the opening policy", openingPolicyFaults(policy));
    await db.openingPolicy.create({ data: { id: `${P}opol1`, organisationId, ...policy, governingSource: "Demo policy 7 (invented)" } });
    entry("OpeningPolicy", `${P}opol1`, "Opening policy", "CREATE", later(4), diffFields(null, { tenderersInvitedCountedAs: "The bidders who bought the documents", countFrom: "Assumed", qualified: "Qualified", qualifiedInMalay: "Layak", notQualified: "Not qualified", notQualifiedInMalay: "Tidak layak", lowest: "Lowest qualified offer", lowestInMalay: "Tawaran layak terendah", wordsFrom: "Assumed", whereItIsWritten: "Demo policy 7 (invented)" }), "Invented for the demo.");
  }
  await db.auditEntry.createMany({ data: trail as never });
}

// ------------------------------------------------------------------ the openings

export async function loadOpeningDemo(db: Db, organisationId: string) {
  const org = await db.organisation.findUniqueOrThrow({ where: { id: organisationId }, select: { timeZone: true } });
  const tz = org.timeZone!;
  const L = todayIn(new Date(), tz)!;
  const { W } = calendarOf(L);
  const T = (d: string, hhmm: string) => instantAt(d, hhmm, tz)!;
  const sec = (at: Date, s: number) => new Date(at.getTime() + s * 1000);
  const trail: Entry[] = [];
  let n = 0;
  const entry: Add = (entity, entityId, entityLabel, action, when, changes, reason = "") => trail.push({ id: `${P}bauo${++n}`, organisationId, entity, entityId, entityLabel, action, at: when, changes, reason, ...DEMO_ACTOR });
  const acts = new OpeningActs(db, organisationId, tz, entry);
  const now = new Date();

  // ================================================================ sx16: the main opening
  const sx16 = `${P}sx16`;
  // Read whole: the closing is written only by its writers (X-2), and read here.
  const close16 = (await db.sourcingExercise.findUniqueOrThrow({ where: { id: sx16 } })).closingAt!;
  if (dayIn(close16, tz) !== W(1)) throw new Error("Demo 6.7: sx16 does not close on the working day before the load day.");
  const day16 = W(1);
  const op1 = `${P}op1`;
  await acts.start(sx16, op1, { panel: [CHAIR, MEMBER], by: CHAIR, at: T(day16, "15:10") });
  await acts.authorise(sx16, op1, CHAIR, T(day16, "15:11"));
  await acts.authorise(sx16, op1, MEMBER, sec(T(day16, "15:11"), 40));
  const offers16: { env: string; bidder: { partyId: string } | { name: string; registrationNo: string; id: string }; price: string; months: number; cls: string; status: string; at: string; absent?: string[]; verdict: "PASS" | "REJECT" }[] = [
    { env: `${P}env1`, bidder: { partyId: `${P}pty2` }, price: "612450.30", months: 12, cls: "Grade D4", status: "Active", at: "15:13", verdict: "PASS" },
    { env: `${P}env2`, bidder: { partyId: `${P}pty3` }, price: "655800.00", months: 14, cls: "Grade D4", status: "Active", at: "15:17", absent: ["REGISTRATION_BACKGROUND"], verdict: "PASS" },
    { env: `${P}env3`, bidder: { id: `${P}pty12`, name: FIRMS.rekaan.name, registrationNo: FIRMS.rekaan.registrationNo }, price: "668000.00", months: 12, cls: "Grade D4", status: "Active", at: "15:21", verdict: "PASS" },
    { env: `${P}env5`, bidder: { id: `${P}pty13`, name: "Demo Network Builders Sdn Bhd", registrationNo: "DEMO-0007-X" }, price: "640120.00", months: 13, cls: "Grade D5", status: "Active", at: "15:25", verdict: "PASS" },
  ];
  for (const [i, o] of offers16.entries()) {
    const at = T(day16, o.at);
    const bid = `${P}ob${i + 1}`;
    await acts.open(sx16, op1, { id: bid, envelopeId: o.env, bidder: o.bidder, price: o.price, months: o.months, validityDays: 120, cls: o.cls, status: o.status, at });
    await acts.initial(sx16, bid, CHAIR, sec(at, 60));
    await acts.initial(sx16, bid, MEMBER, sec(at, 75));
    await acts.answers(sx16, bid, o.absent ?? [], sec(at, 120));
    await acts.verdict(sx16, bid, o.verdict, "", CHAIR, sec(at, 150));
  }
  await acts.signature(sx16, op1, CHAIR, day16, T(day16, "15:40"));
  await acts.signature(sx16, op1, MEMBER, day16, sec(T(day16, "15:40"), 30));
  await acts.details(sx16, op1, 2, "The box was opened at 3.11 pm on the panel's two authorisations. Four envelopes in time were opened and read aloud; one late envelope was set aside, sealed, for the Tender Board. The estimate's paper copy was not found in the box.", T(day16, "15:42"));
  await acts.finalise(sx16, op1, CHAIR, { notInBox: true }, T(day16, "15:45"));
  await acts.scan(sx16, op1, `${P}doc100`, "Signed schedule of tenders", T(day16, "15:55"));
  await acts.explain(sx16, op1, HOD_CP, "The estimate's copy 1 was handed to the Head of Contract & Procurement for safekeeping when it was lodged, not placed in the box; the lodgement record shows it. Invented for the demo.", T(day16, "15:58"));

  // The late envelope admitted at demo_mt13 (W(1) 16:00): its supplementary opening.
  const op2 = `${P}op2`;
  await acts.startSupplementary(sx16, op2, { decisionId: `${P}d42`, panel: [CHAIR, MEMBER], by: CHAIR, at: T(day16, "16:30") });
  await acts.authorise(sx16, op2, CHAIR, T(day16, "16:31"));
  await acts.authorise(sx16, op2, MEMBER, sec(T(day16, "16:31"), 30));
  {
    const at = T(day16, "16:33");
    const bid = `${P}ob5`;
    await acts.open(sx16, op2, { id: bid, envelopeId: `${P}env4`, bidder: { id: `${P}pty14`, name: FIRMS.paip.name, registrationNo: FIRMS.paip.registrationNo }, price: "629900.00", months: 12, validityDays: 120, cls: "Grade D4", status: "Active", at });
    await acts.initial(sx16, bid, CHAIR, sec(at, 60));
    await acts.initial(sx16, bid, MEMBER, sec(at, 70));
    await acts.answers(sx16, bid, [], sec(at, 120));
    await acts.verdict(sx16, bid, "PASS", "", CHAIR, sec(at, 150));
  }
  await acts.signature(sx16, op2, CHAIR, day16, T(day16, "16:45"));
  await acts.signature(sx16, op2, MEMBER, day16, sec(T(day16, "16:45"), 20));
  await acts.details(sx16, op2, 1, "The envelope the Tender Board admitted was opened and read aloud, and added to the schedule as version 2.", T(day16, "16:47"));
  await acts.finalise(sx16, op2, CHAIR, null, T(day16, "16:50"));
  await acts.scan(sx16, op2, `${P}doc101`, "Signed schedule of tenders, version 2", T(day16, "16:55"));

  // ================================================================ sx20: started, adjourned twice
  const sx20 = `${P}sx20`;
  const op3 = `${P}op3`;
  const day20 = W(1);
  await acts.start(sx20, op3, { panel: [CHAIR, MEMBER], by: CHAIR, at: T(day20, "09:30") });
  await acts.authorise(sx20, op3, CHAIR, T(day20, "09:31"));
  await acts.authorise(sx20, op3, MEMBER, sec(T(day20, "09:31"), 45));
  await acts.registerBox(sx20, op3, { id: `${P}env10`, markings: `Tender ${SX(20)}, Clear water tank relining, closing ${formatDate(W(2))} 3.00 pm`, by: CLERK, at: T(day20, "09:35") });
  await acts.sitting(sx20, op3, { resume: false, reason: "The chairman was called away to a burst main; the panel adjourned before opening any envelope.", by: CHAIR, at: T(day20, "09:40") });
  await acts.sitting(sx20, op3, { resume: true, reason: "The chairman returned.", by: CHAIR, at: T(day20, "11:00") });
  await acts.authorise(sx20, op3, CHAIR, T(day20, "11:01"));
  await acts.sitting(sx20, op3, { resume: false, reason: "The second member was not available after all; adjourned to another day.", by: CHAIR, at: T(day20, "11:20") });

  if (trail.some((e) => e.at > now)) throw new Error("Demo 6.7: an act is dated after now (X-10 a).");
  await db.auditEntry.createMany({ data: trail as never });
}

/// The opening's acts on one exercise, each judged as its action judges it on the rows as they stand.
export class OpeningActs {
  constructor(
    private readonly db: Db,
    private readonly org: string,
    private readonly tz: string,
    private readonly entry: Add,
  ) {}

  private async ctx(exerciseId: string, at: Date) {
    const { loadExercise } = await import("../src/lib/method/repo");
    const { openingContext } = await import("../src/lib/opening/repo");
    const l = (await loadExercise(await demoOrgId(), exerciseId)) ?? (() => { throw new Error(`Demo 6.7: ${exerciseId} did not load.`); })();
    const org = { id: l.org.id, code: l.org.code, timeZone: this.tz, today: dayIn(at, this.tz) };
    return { l: { ...l, org }, c: await openingContext({ org, ex: l.ex }, this.db as never, at) };
  }
  private label(ref: string, what: string) {
    return `${ref} · ${what}`;
  }
  private async opening(exerciseId: string, openingId: string, at: Date) {
    const x = await this.ctx(exerciseId, at);
    const o = x.c.openings.find((y) => y.id === openingId) ?? (() => { throw new Error(`Demo 6.7: ${openingId} is not on ${exerciseId}.`); })();
    return { ...x, o };
  }
  private openingLabel(ref: string, o: { kind: string; sequenceNo: number }) {
    return this.label(ref, o.kind === "MAIN" ? "Opening" : `Supplementary opening ${o.sequenceNo - 1}`);
  }

  /// startOpening: the panel from the method's committee, the estimate's lead, the checklist and rules frozen.
  async start(exerciseId: string, id: string, i: { panel: { id: string; name: string }[]; by: { id: string; name: string }; at: Date }) {
    const { startFaults, estimateLeadFaults } = await import("../src/lib/opening/start");
    const { panelFaults } = await import("../src/lib/opening/panel");
    const { panelSnapshot } = await import("../src/lib/opening/repo");
    const { openingChecklist } = await import("../src/lib/opening/checklist");
    const { lockGap } = await import("../src/lib/opening/box");
    const { leadTime } = await import("../src/lib/scope/estimate");
    const { openingStartFields, OPENING_ENTITY } = await import("../src/lib/opening/audit-view");
    const { l, c } = await this.ctx(exerciseId, i.at);
    refuse(`starting ${id}`, startFaults({ status: l.ex.status, packKind: l.ex.packKindSnapshot, publishedThroughWindow: c.window?.publishedAt != null, timeZone: this.tz, phase: c.gate.phase, boxLocked: c.boxLocked, changePending: c.gate.changePending, mainExists: c.main != null, personActive: true }));
    const people = await this.db.person.findMany({ where: { id: { in: i.panel.map((p) => p.id) } }, select: { id: true, name: true, isActive: true, orgUnitCode: true } });
    const picked = i.panel.map((p) => ({ personId: p.id, name: p.name, present: true, active: people.find((x) => x.id === p.id)?.isActive ?? false, orgUnitCode: people.find((x) => x.id === p.id)?.orgUnitCode ?? null }));
    const pf = panelFaults({ committeeCode: c.method?.openingCommitteeCode ?? null, committee: c.committee ? { name: c.committee.nameEn } : null, seats: c.seats, picked, policy: { panelSize: c.committee?.panelSize ?? null, exclusionRule: c.committee?.panelExclusionRule ?? null, excludedUnitCode: c.committee?.panelExcludesUnitCode ?? null }, override: null, unitPath: c.unitPath });
    refuse(`the panel of ${id}`, pf);
    const current = c.estimate?.versions.find((v) => v.versionNo === c.estimate!.currentVersionNo) ?? null;
    const lead = leadTime(current ? storedDay(current.preparedOn) : null, l.ex.closingAt, c.scopePolicy, this.tz);
    const est = estimateLeadFaults({ requires: c.method?.requiresCompanyEstimate ?? null, estimateState: c.estimate?.state ?? null, lead, override: null, overrideRoleCode: c.scopePolicy.estimateOverrideRoleCode });
    if (!est.ok) refuse(`the estimate's lead time at ${id}`, est.faults);
    const outcome = est.ok ? est.outcome : "NOT_REQUIRED";
    const checklist = openingChecklist({ parts: (c.pack?.parts ?? []).map((p) => ({ partCode: p.partCode, label: p.labelSnapshot, role: p.role, mandatory: p.mandatory, returnedByBidder: p.returnedByBidder, sortOrder: p.sortOrder })), addenda: c.addenda });
    const { frozenRuleFaults } = await import("../src/lib/opening/start");
    refuse(`starting ${id}`, frozenRuleFaults({ completenessEliminates: c.bidRule.rule?.completenessEliminates ?? null, checklist, invitedReading: c.openingPolicy?.invitedCountReading ?? null }));
    const { openingPolicyFrozen } = await import("../src/lib/opening/repo");
    const gap = c.lockEvent && l.ex.closingAt ? lockGap(l.ex.closingAt, c.lockEvent.occurredAt) : null;
    const policy = {
      committee: { code: c.method?.openingCommitteeCode ?? null, name: c.committee?.nameEn ?? null, provenance: c.method?.openingCommitteeProvenance ?? null },
      panel: panelSnapshot(c.committee),
      completeness: { eliminates: c.bidRule.rule?.completenessEliminates ?? null, provenance: c.bidRule.rule?.completenessProvenance ?? null, source: c.bidRule.completeness },
      unpurchased: { consequence: c.method?.unpurchasedBidConsequence ?? null, provenance: c.method?.unpurchasedProvenance ?? null },
      minimumBids: { value: c.bidRule.rule?.minimumBids ?? null, provenance: c.bidRule.rule?.minimumBidsProvenance ?? null },
      alternativesPermitted: c.window?.alternativesPermitted ?? null,
      restrictedTender: l.ex.restrictedTender,
      path: c.path,
      estimate: { requires: c.method?.requiresCompanyEstimate ?? null, provenance: c.method?.requiresCompanyEstimateProvenance ?? null },
      ...openingPolicyFrozen(c.openingPolicy),
    };
    const estimateLead = { outcome, state: lead.state, lastPermittedDay: lead.lastPermittedDay ?? null, lastVersionDay: lead.lastVersionDay ?? null, leadDays: c.scopePolicy.estimateLeadDays, overrideBy: null, overrideReason: null };
    await this.db.opening.create({
      data: {
        id, organisationId: this.org, exerciseId, kind: "MAIN", sequenceNo: 1, committeeId: c.committee!.id, committeeNameSnapshot: c.committee!.nameEn,
        startedAt: i.at, startedByPersonId: i.by.id, boxLockedAt: c.lockEvent?.occurredAt ?? null, lockGapSeconds: gap?.seconds ?? null, panelSizeRequired: c.committee!.panelSize,
        estimateLead: estimateLead as never, checklistSnapshot: checklist as never, policySnapshot: policy as never, createdAt: i.at,
      },
    });
    await this.db.openingSitting.create({ data: { id: `${id}s1`, organisationId: this.org, openingId: id, sittingNo: 1, startedAt: i.at, recordedByPersonId: i.by.id } });
    for (const p of picked) {
      const seat = c.seats.find((s) => s.personId === p.personId)!;
      await this.db.openingPanelMember.create({ data: { id: `${id}pm_${p.personId.slice(P.length)}`, organisationId: this.org, openingId: id, personId: p.personId, committeeMemberId: seat.committeeMemberId || null, seatLabelSnapshot: seat.seatLabel, orgUnitCodeSnapshot: p.orgUnitCode, present: p.present } });
    }
    const independence = pf.some((f) => f.code === "EXCLUSION_RULE_NOT_SET") ? "Independence rule not set; panel not checked" : c.committee!.panelExclusionRule ? "Checked against the committee's independence rule" : "No independence rule applies";
    this.entry(OPENING_ENTITY.opening, id, this.label(l.ex.reference, "Opening"), "CREATE", i.at, diffFields(null, openingStartFields({ kind: "MAIN", committee: c.committee!.nameEn, panel: picked, startedAt: i.at, startedBy: i.by.name, panelOverride: null, independence, estimateLead: outcome === "READY" ? "In time" : outcome === "VOLUNTARY" ? "Not required; one was lodged" : "Not required", boxLockedAt: c.lockEvent?.occurredAt ?? null, lockGap: gap?.text ?? null }, this.tz)));
  }

  /// startSupplementaryOpening: one admitted late envelope, under the main opening's checklist and rules.
  async startSupplementary(exerciseId: string, id: string, i: { decisionId: string; panel: { id: string; name: string }[]; by: { id: string; name: string }; at: Date }) {
    const { supplementaryFaults } = await import("../src/lib/opening/start");
    const { panelFaults, supplementaryPanel } = await import("../src/lib/opening/panel");
    const { panelSnapshot, policyOf } = await import("../src/lib/opening/repo");
    const { openingStartFields, OPENING_ENTITY } = await import("../src/lib/opening/audit-view");
    const { l, c } = await this.ctx(exerciseId, i.at);
    const decision = await this.db.committeeDecision.findUniqueOrThrow({ where: { id: i.decisionId }, select: { id: true, matterKind: true, outcome: true, bidEnvelopeId: true, withdrawnAt: true, decisionDate: true, meeting: { select: { reference: true } } } });
    if (decision.decisionDate && storedDay(decision.decisionDate) > dayIn(i.at, this.tz)) throw new Error("Demo 6.7: the supplementary opening is dated before its admission.");
    const envelope = c.envelopes.find((e) => e.id === decision.bidEnvelopeId) ?? null;
    refuse(`starting ${id}`, supplementaryFaults({ status: l.ex.status, mainFinalised: !!c.main?.finalisedAt, decision: { matterKind: decision.matterKind ?? "", outcome: decision.outcome, bidEnvelopeId: decision.bidEnvelopeId }, alreadyOpened: c.openings.some((o) => o.admissionDecisionId === i.decisionId), envelope: envelope ? { status: envelope.status, late: envelope.late } : null, personActive: true, timeZone: this.tz }));
    const people = await this.db.person.findMany({ where: { id: { in: i.panel.map((p) => p.id) } }, select: { id: true, isActive: true, orgUnitCode: true } });
    const picked = i.panel.map((p) => ({ personId: p.id, name: p.name, present: true, active: people.find((x) => x.id === p.id)?.isActive ?? false, orgUnitCode: people.find((x) => x.id === p.id)?.orgUnitCode ?? null }));
    const main = c.main!;
    // R-3: the main opening's committee, its panel rules as they stand now.
    const sup = supplementaryPanel({ mainCommittee: c.mainCommittee, frozenCode: policyOf(main.policySnapshot).committee.code, seats: c.mainSeats, unitPath: c.unitPath });
    if ("fault" in sup) refuse(`the panel of ${id}`, [sup.fault]);
    else refuse(`the panel of ${id}`, panelFaults({ ...sup, picked, override: null }));
    const committee = c.mainCommittee!;
    const sequenceNo = c.openings.reduce((m, o) => Math.max(m, o.sequenceNo), 0) + 1;
    await this.db.opening.create({
      data: {
        id, organisationId: this.org, exerciseId, kind: "SUPPLEMENTARY", sequenceNo, committeeId: committee.id, committeeNameSnapshot: committee.nameEn, admissionDecisionId: i.decisionId,
        startedAt: i.at, startedByPersonId: i.by.id, panelSizeRequired: committee.panelSize,
        checklistSnapshot: main.checklistSnapshot as never, policySnapshot: { ...policyOf(main.policySnapshot), panel: panelSnapshot(committee) } as never, createdAt: i.at,
      },
    });
    await this.db.openingSitting.create({ data: { id: `${id}s1`, organisationId: this.org, openingId: id, sittingNo: 1, startedAt: i.at, recordedByPersonId: i.by.id } });
    for (const p of picked) {
      const seat = c.mainSeats.find((s) => s.personId === p.personId)!;
      await this.db.openingPanelMember.create({ data: { id: `${id}pm_${p.personId.slice(P.length)}`, organisationId: this.org, openingId: id, personId: p.personId, committeeMemberId: seat.committeeMemberId || null, seatLabelSnapshot: seat.seatLabel, orgUnitCodeSnapshot: p.orgUnitCode, present: p.present } });
    }
    this.entry(OPENING_ENTITY.opening, id, this.label(l.ex.reference, `Supplementary opening ${sequenceNo - 1}`), "CREATE", i.at, diffFields(null, { ...openingStartFields({ kind: "SUPPLEMENTARY", committee: committee.nameEn, panel: picked, startedAt: i.at, startedBy: i.by.name, panelOverride: null, independence: "As the committee's rule", estimateLead: "Not judged: the estimate was disclosed at the main opening", boxLockedAt: null, lockGap: null }, this.tz), admittedBy: decision.meeting.reference, envelope: envelope ? `Envelope ${envelope.sequence}` : null }));
  }

  /// recordAuthorisation: the second distinct present member's opens the box (the main opening) and the exercise is Opening in progress.
  async authorise(exerciseId: string, openingId: string, person: { id: string; name: string }, at: Date) {
    const { authorisationFaults, opensTheBox, unsealState } = await import("../src/lib/opening/unseal");
    const { panelOf, stateOf } = await import("../src/lib/opening/repo");
    const { authorisationFields, OPENING_ENTITY } = await import("../src/lib/opening/audit-view");
    const { moveExercise } = await import("../src/lib/method/move");
    const { l, c, o } = await this.opening(exerciseId, openingId, at);
    const state = stateOf(o, l.ex.status);
    refuse(`${person.name}'s authorisation of ${openingId}`, authorisationFaults({ state, panel: panelOf(o), auths: o.authorisations, personId: person.id, recorderId: null, now: at, closing: l.ex.closingAt, boxLocked: lockedAtOrAfterClosing(c.events, l.ex.closingAt) }));
    const id = `${openingId}a${o.authorisations.length + 1}`;
    await this.db.openingAuthorisation.create({ data: { id, organisationId: this.org, openingId, personId: person.id, sittingNo: state.sittingNo, recordedAt: at } });
    const after = unsealState(state.sittingNo, [...o.authorisations, { personId: person.id, sittingNo: state.sittingNo, recordedAt: at, lapsedAt: null }], panelOf(o));
    const opens = opensTheBox(state, after.count);
    const ol = this.openingLabel(l.ex.reference, o);
    this.entry(OPENING_ENTITY.authorisation, id, ol, "CREATE", at, diffFields(null, authorisationFields({ person: person.name, at, sittingNo: state.sittingNo, opensTheBox: opens }, this.tz)));
    if (!opens) return;
    await this.db.opening.update({ where: { id: openingId }, data: { unsealedAt: at } });
    this.entry(OPENING_ENTITY.opening, openingId, ol, "UPDATE", at, diffFields({ opened: null }, { opened: authorisationFields({ person: person.name, at, sittingNo: 1, opensTheBox: true }, this.tz).at }));
    if (o.kind !== "MAIN") return;
    const ev = `${openingId}box`;
    await this.db.boxEvent.create({ data: { id: ev, organisationId: this.org, exerciseId, kind: "UNLOCKED_FOR_OPENING", occurredAt: at, recordedAt: at, personId: person.id, note: "Opened at the opening, on the second authorisation." } });
    this.entry(BID_ENTITY.box, ev, this.label(l.ex.reference, "Tender box opened"), "CREATE", at, diffFields(null, { boxOpened: authorisationFields({ person: person.name, at, sittingNo: 1, opensTheBox: true }, this.tz).at, openedBy: `${person.name} (recorded on their behalf, not signed)` }));
    await moveExercise(this.db as never, l.ex, "OPENING_IN_PROGRESS", { today: dayIn(at, this.tz), via: "UNSEAL", authorisations: after.count });
    this.entry("SourcingExercise", exerciseId, `${l.ex.reference} · ${l.ex.title}`, "UPDATE", at, diffFields({ status: l.ex.status }, { status: "OPENING_IN_PROGRESS" }));
  }

  /// adjournOpening / resumeOpening.
  async sitting(exerciseId: string, openingId: string, i: { resume: boolean; reason: string; by: { id: string; name: string }; at: Date }) {
    const { adjournFaults, lapsedByAdjourning } = await import("../src/lib/opening/unseal");
    const { panelOf, stateOf } = await import("../src/lib/opening/repo");
    const { sittingFields, OPENING_ENTITY } = await import("../src/lib/opening/audit-view");
    const { l, o } = await this.opening(exerciseId, openingId, i.at);
    const state = stateOf(o, l.ex.status);
    refuse(`${i.resume ? "resuming" : "adjourning"} ${openingId}`, adjournFaults({ state, reason: i.reason, personActive: true, resume: i.resume }));
    const ol = this.openingLabel(l.ex.reference, o);
    if (i.resume) {
      const id = `${openingId}s${state.sittingNo + 1}`;
      await this.db.openingSitting.create({ data: { id, organisationId: this.org, openingId, sittingNo: state.sittingNo + 1, startedAt: i.at, resumeReason: i.reason, recordedByPersonId: i.by.id } });
      this.entry(OPENING_ENTITY.sitting, id, ol, "CREATE", i.at, diffFields(null, sittingFields({ sittingNo: state.sittingNo + 1, at: i.at, by: i.by.name, adjourned: false, reason: i.reason }, this.tz)), i.reason);
      return;
    }
    const s = o.sittings.find((x) => x.sittingNo === state.sittingNo)!;
    await this.db.openingSitting.update({ where: { id: s.id }, data: { adjournedAt: i.at, adjournReason: i.reason } });
    this.entry(OPENING_ENTITY.sitting, s.id, ol, "UPDATE", i.at, diffFields({ adjourned: null }, sittingFields({ sittingNo: state.sittingNo, at: i.at, by: i.by.name, adjourned: true, reason: i.reason }, this.tz)), i.reason);
    for (const id of lapsedByAdjourning(state.sittingNo, o.authorisations, panelOf(o))) {
      await this.db.openingAuthorisation.update({ where: { id }, data: { lapsedAt: i.at } });
      this.entry(OPENING_ENTITY.authorisation, id, ol, "UPDATE", i.at, diffFields({ lapsed: null }, { lapsed: "Unpaired when the sitting was adjourned: kept, does not count again" }));
    }
  }

  /// registerBoxEnvelope: in time by the lock (C-3).
  async registerBox(exerciseId: string, openingId: string, i: { id: string; markings: string; by: { id: string; name: string }; at: Date }) {
    const { boxEnvelopeJudgement, registerBoxFaults } = await import("../src/lib/opening/box");
    const { stateOf } = await import("../src/lib/opening/repo");
    const { l, c, o } = await this.opening(exerciseId, openingId, i.at);
    refuse(`registering ${i.id}`, registerBoxFaults({ state: stateOf(o, l.ex.status), anyOpened: o.bids.length > 0, kind: "BID", markings: i.markings, personActive: true, closing: l.ex.closingAt, lockedAt: c.lockEvent?.occurredAt ?? null }));
    const j = boxEnvelopeJudgement(c.lockEvent!.occurredAt, l.ex.closingAt!);
    const sequence = c.envelopes.reduce((m, e) => Math.max(m, e.sequence), 0) + 1;
    const row = await this.db.bidEnvelope.create({ data: { id: i.id, organisationId: this.org, exerciseId, sequence, kind: "BID", channel: "BOX", receivedAt: j.receivedAt, receivedSource: j.receivedSource, recordedAt: i.at, receivedByPersonId: i.by.id, markings: i.markings, late: j.late, closingAtJudged: j.closingAtJudged, recordedAfterClosing: j.recordedAfterClosing, registeredAtOpeningId: openingId, createdAt: i.at } });
    this.entry(BID_ENTITY.envelope, row.id, this.label(l.ex.reference, `Envelope ${sequence}`), "CREATE", i.at, diffFields(null, envelopeFields({ ...row, receivedBy: i.by.name, parentSequence: null }, this.tz)));
  }

  /// openEnvelope: the next Bil., the bidder named (OD-2), the offer as read, the findings.
  async open(exerciseId: string, openingId: string, i: { id: string; envelopeId: string; bidder: { partyId: string } | { id: string; name: string; registrationNo: string }; price: string; months: number; validityDays: number; cls: string; status: string; at: Date }) {
    const { openFaults, nextListingNo, alternativeOf } = await import("../src/lib/opening/open");
    const { openFault } = await import("../src/lib/opening/withdrawals");
    const { liveSaleOf, restrictionFinding, saleFinding } = await import("../src/lib/opening/findings");
    const { policyOf, stateOf } = await import("../src/lib/opening/repo");
    const { openedBidFields, OPENING_ENTITY } = await import("../src/lib/opening/audit-view");
    const { l, c, o } = await this.opening(exerciseId, openingId, i.at);
    const e = c.envelopes.find((x) => x.id === i.envelopeId) ?? null;
    const party = "partyId" in i.bidder ? (c.parties.find((p) => p.id === (i.bidder as { partyId: string }).partyId) ?? null) : null;
    const named = "partyId" in i.bidder ? null : i.bidder;
    const price = parseSen(i.price) as Sen;
    const snap = policyOf(o.policySnapshot);
    refuse(`opening ${i.envelopeId}`, openFaults({ state: stateOf(o, l.ex.status), envelope: e ? { id: e.id, kind: e.kind, status: e.status, late: e.late } : null, withdrawn: !!(e && openFault(e.id, c.withdrawals)), admittedEnvelopeId: o.admissionDecision?.bidEnvelopeId ?? null, bidder: { partyId: party?.id ?? null, name: named?.name ?? "", registrationNo: named?.registrationNo ?? "", registrationTaken: !!named && c.parties.some((p) => p.registrationNo.trim().toLowerCase() === named.registrationNo.trim().toLowerCase()) }, price, period: { value: i.months, unit: "MONTHS" }, isAlternative: e?.kind === "ALTERNATIVE", alternativesPermitted: snap.alternativesPermitted, parent: null, timeZone: this.tz }));
    const ref = l.ex.reference;
    let bidder: { id: string; name: string };
    if (party) bidder = party;
    else {
      const row = await this.db.exerciseParty.create({ data: { id: named!.id, organisationId: this.org, exerciseId, source: "BIDDER_AT_OPENING", name: named!.name, registrationNo: named!.registrationNo, createdAt: i.at } });
      this.entry("ExerciseParty", row.id, this.label(ref, `Party · ${row.name}`), "CREATE", i.at, diffFields(null, { party: row.name, registrationNo: row.registrationNo, cameAs: "Named at opening, from its bid" }));
      bidder = row;
    }
    const sale = saleFinding(bidder.id, c.sales, snap.path, c.invitedPartyIds);
    const restriction = restrictionFinding(snap.restrictedTender, liveSaleOf(bidder.id, c.sales), c.closingDay);
    if ("fault" in restriction) refuse(`the restriction of ${i.envelopeId}`, [restriction.fault]);
    const r = restriction as { finding: "NOT_RESTRICTED" | "EVIDENCED" | "NOT_EVIDENCED" };
    const listingNo = nextListingNo(c.openings.flatMap((x) => x.bids.map((b) => b.listingNo)));
    const alternative = alternativeOf(e!.kind === "ALTERNATIVE", snap.alternativesPermitted);
    await this.db.openedBid.create({
      data: {
        id: i.id, organisationId: this.org, exerciseId, openingId, envelopeId: e!.id, listingNo, partyId: bidder.id, openedAt: i.at,
        bidderNameAsRead: bidder.name, registrationClassAsRead: i.cls, registrationStatusAsRead: i.status, priceAsRead: senToDecimalString(price), completionPeriod: i.months, completionUnit: "MONTHS", validityDaysStated: i.validityDays,
        isAlternative: e!.kind === "ALTERNATIVE", alternativeStatus: alternative, saleFinding: sale, restrictionFinding: r.finding,
      },
    });
    await this.db.bidEnvelope.update({ where: { id: e!.id }, data: { status: "OPENED", partyId: bidder.id } });
    this.entry(BID_ENTITY.envelope, e!.id, this.label(ref, `Envelope ${e!.sequence}`), "UPDATE", i.at, diffFields({ ...statusField("RECEIVED"), bidder: null }, { ...statusField("OPENED"), bidder: bidder.name }));
    this.entry(OPENING_ENTITY.bid, i.id, this.label(ref, `Offer ${listingNo}`), "CREATE", i.at, diffFields(null, openedBidFields({ listingNo, envelope: `Envelope ${e!.sequence}`, bidder: bidder.name, registrationClass: i.cls, registrationStatus: i.status, price, period: { value: i.months, unit: "MONTHS" }, validityDays: i.validityDays, alternative, parentListingNo: null, sale, restriction: r.finding, at: i.at }, this.tz)));
  }

  private async bid(exerciseId: string, bidId: string, at: Date) {
    const x = await this.ctx(exerciseId, at);
    for (const o of x.c.openings) {
      const b = o.bids.find((y) => y.id === bidId);
      if (b) return { ...x, o, b };
    }
    throw new Error(`Demo 6.7: ${bidId} is not on ${exerciseId}.`);
  }

  /// recordInitial.
  async initial(exerciseId: string, bidId: string, person: { id: string; name: string }, at: Date) {
    const { markFaults } = await import("../src/lib/opening/finalise");
    const { panelOf, stateOf } = await import("../src/lib/opening/repo");
    const { initialFields, OPENING_ENTITY } = await import("../src/lib/opening/audit-view");
    const { l, o, b } = await this.bid(exerciseId, bidId, at);
    refuse(`${person.name}'s initial on ${bidId}`, markFaults({ state: stateOf(o, l.ex.status), panel: panelOf(o), personId: person.id, already: b.initials.some((x) => x.personId === person.id), sameOpening: true }));
    const id = `${bidId}i_${person.id.slice(P.length)}`;
    await this.db.openedBidInitial.create({ data: { id, organisationId: this.org, openedBidId: bidId, personId: person.id, recordedAt: at } });
    this.entry(OPENING_ENTITY.initial, id, this.label(l.ex.reference, `Offer ${b.listingNo}`), "CREATE", at, diffFields(null, initialFields({ person: person.name, listingNo: b.listingNo, at }, this.tz)));
  }

  /// recordChecklistAnswer, for every item: PRESENT but the parts named (by role) ABSENT.
  async answers(exerciseId: string, bidId: string, absentRoles: string[], at: Date) {
    const { answerFaults, checklistFromSnapshot } = await import("../src/lib/opening/checklist");
    const { actFaults } = await import("../src/lib/opening/state");
    const { stateOf } = await import("../src/lib/opening/repo");
    const { answerFields, OPENING_ENTITY } = await import("../src/lib/opening/audit-view");
    const { l, c, o, b } = await this.bid(exerciseId, bidId, at);
    const checklist = checklistFromSnapshot(o.checklistSnapshot);
    if (checklist.notJudged.length) throw new Error(`Demo 6.7: ${bidId}'s checklist is not judged (${checklist.notJudged.join(", ")}).`);
    const roleOf = (key: string) => c.pack?.parts.find((p) => p.partCode === key)?.role ?? null;
    for (const [k, item] of checklist.items.entries()) {
      const answer = absentRoles.includes(roleOf(item.key) ?? "") ? ("ABSENT" as const) : ("PRESENT" as const);
      refuse(`answering ${item.label} for ${bidId}`, [...actFaults(stateOf(o, l.ex.status)), ...answerFaults(checklist.items, item.key, answer)]);
      const id = `${bidId}q${k + 1}`;
      const when = new Date(at.getTime() + k * 5000);
      await this.db.openingChecklistAnswer.create({ data: { id, organisationId: this.org, openedBidId: bidId, itemKey: item.key, itemLabelSnapshot: item.label, answer, recordedAt: when } });
      this.entry(OPENING_ENTITY.answer, id, this.label(l.ex.reference, `Offer ${b.listingNo}`), "CREATE", when, diffFields(null, answerFields({ item: item.label, answer })));
    }
    const missing = absentRoles.filter((r) => !checklist.items.some((it) => roleOf(it.key) === r));
    if (missing.length) throw new Error(`Demo 6.7: ${missing.join(", ")} is not on ${bidId}'s checklist.`);
  }

  /// recordVerdict, on the grounds the rules make eliminatory only.
  async verdict(exerciseId: string, bidId: string, verdict: "PASS" | "REJECT", reason: string, by: { id: string; name: string }, at: Date) {
    const { checklistFromSnapshot } = await import("../src/lib/opening/checklist");
    const { judgeBid, verdictFaults, verdictRecord } = await import("../src/lib/opening/verdict");
    const { policyOf, stateOf } = await import("../src/lib/opening/repo");
    const { verdictFields, OPENING_ENTITY } = await import("../src/lib/opening/audit-view");
    const { l, o, b } = await this.bid(exerciseId, bidId, at);
    const snap = policyOf(o.policySnapshot);
    const checklist = checklistFromSnapshot(o.checklistSnapshot);
    const answers = new Map(b.answers.map((a) => [a.itemKey, a.answer]));
    const policy = { completenessEliminates: snap.completeness.eliminates, unpurchased: snap.unpurchased.consequence };
    const facts = { saleFinding: b.saleFinding, restrictionFinding: b.restrictionFinding, isAlternative: b.isAlternative, alternativeStatus: b.alternativeStatus };
    refuse(`the verdict on ${bidId}`, verdictFaults({ state: stateOf(o, l.ex.status), sameOpening: true, bid: facts, checklist, answers, policy, verdict, reason }));
    const j = judgeBid(facts, checklist, answers, policy);
    await this.db.openedBid.update({ where: { id: bidId }, data: { verdict, verdictReason: verdict === "REJECT" ? reason : "", verdictAt: at, completeness: verdictRecord(j) as never } });
    this.entry(OPENING_ENTITY.bid, bidId, this.label(l.ex.reference, `Offer ${b.listingNo}`), "UPDATE", at, diffFields({ verdict: null, recordedBy: null }, { ...verdictFields({ verdict, reason: verdict === "REJECT" ? reason : "", grounds: j.grounds, reported: j.reported, missing: j.missing.map((m) => m.label) }), recordedBy: `${by.name} (recorded on their behalf, not signed)` }), verdict === "REJECT" ? reason : "");
  }

  /// recordSignature.
  async signature(exerciseId: string, openingId: string, person: { id: string; name: string }, signedOn: string, at: Date) {
    const { markFaults } = await import("../src/lib/opening/finalise");
    const { panelOf, stateOf } = await import("../src/lib/opening/repo");
    const { signatureFields, OPENING_ENTITY } = await import("../src/lib/opening/audit-view");
    const { l, o } = await this.opening(exerciseId, openingId, at);
    refuse(`${person.name}'s signature on ${openingId}`, markFaults({ state: stateOf(o, l.ex.status), panel: panelOf(o), personId: person.id, already: o.signatures.some((s) => s.personId === person.id), sameOpening: true, signedOn: { day: signedOn, today: dayIn(at, this.tz), startDay: dayIn(o.startedAt, this.tz) } }));
    const id = `${openingId}sig_${person.id.slice(P.length)}`;
    await this.db.openingSignature.create({ data: { id, organisationId: this.org, openingId, personId: person.id, signedOn: dayToDate(signedOn), recordedAt: at } });
    this.entry(OPENING_ENTITY.signature, id, this.openingLabel(l.ex.reference, o), "CREATE", at, diffFields(null, signatureFields({ person: person.name, signedOn })));
  }

  /// recordScheduleDetails.
  async details(exerciseId: string, openingId: string, pages: number, minutes: string, at: Date) {
    const { recordFaults } = await import("../src/lib/opening/finalise");
    const { stateOf } = await import("../src/lib/opening/repo");
    const { OPENING_ENTITY } = await import("../src/lib/opening/audit-view");
    const { l, o } = await this.opening(exerciseId, openingId, at);
    refuse(`the pages of ${openingId}`, recordFaults({ state: stateOf(o, l.ex.status), pages }));
    await this.db.opening.update({ where: { id: openingId }, data: { schedulePages: pages, minutes } });
    this.entry(OPENING_ENTITY.opening, openingId, this.openingLabel(l.ex.reference, o), "UPDATE", at, diffFields({ pages: null, minutes: null }, { pages: String(pages), minutes }));
  }

  /// finaliseOpening: every check first; then the estimate disclosed and the paper copy compared, the schedule and Grand Summary frozen, the exercise Opened.
  async finalise(exerciseId: string, openingId: string, person: { id: string; name: string }, paper: { notInBox: true } | null, at: Date) {
    const { checklistFromSnapshot, unansweredItems } = await import("../src/lib/opening/checklist");
    const { finaliseFaults } = await import("../src/lib/opening/finalise");
    const { discloseAtFinalising } = await import("../src/lib/opening/estimate");
    const { grandSummary } = await import("../src/lib/opening/grand-summary");
    const { freshInitials } = await import("../src/lib/opening/initials");
    const { invitedCounts, policyOf, presentOf, stateOf, summaryLabelsOf } = await import("../src/lib/opening/repo");
    const { jadualTawaran, lateCount } = await import("../src/lib/opening/schedule");
    const { lockGap } = await import("../src/lib/opening/box");
    const { finaliseFields, OPENING_ENTITY } = await import("../src/lib/opening/audit-view");
    const { moveExercise } = await import("../src/lib/method/move");
    const { l, c, o } = await this.opening(exerciseId, openingId, at);
    const state = stateOf(o, l.ex.status);
    const snap = policyOf(o.policySnapshot);
    const checklist = checklistFromSnapshot(o.checklistSnapshot);
    const lodged = o.kind === "MAIN" && c.estimate?.state === "LODGED";
    const admitted = o.admissionDecision?.bidEnvelopeId ? c.envelopes.find((e) => e.id === o.admissionDecision!.bidEnvelopeId) : null;
    refuse(`finalising ${openingId}`, finaliseFaults({
      state,
      bids: o.bids.map((b) => ({ listingNo: b.listingNo, initials: freshInitials(b, b.initials).map((i) => i.personId), unanswered: unansweredItems(checklist.items, new Map(b.answers.map((a) => [a.itemKey, a.answer]))).length, verdict: b.verdict, unpurchased: b.saleFinding !== "LIVE_SALE" })),
      present: presentOf(o),
      signed: o.signatures.map((s) => s.personId),
      pages: o.schedulePages,
      checklist,
      withdrawals: o.kind === "MAIN" ? c.withdrawals.map((w) => ({ id: w.id, envelopeId: w.envelopeId, unmatchedFinding: w.unmatchedFinding })) : [],
      unopened: c.envelopes.filter((e) => e.kind !== "COMPANY_ESTIMATE" && !e.late && e.status === "RECEIVED").length,
      admittedOpened: admitted?.status === "OPENED",
      completenessEliminates: snap.completeness.eliminates,
      unpurchased: snap.unpurchased.consequence,
      invitedReading: snap.invited.reading,
      estimate: { required: snap.estimate.requires === true, lodged, paperAnswered: paper != null },
      personActive: true,
    }));
    const disclosed = lodged && c.estimateFacts ? await discloseAtFinalising(this.db as never, { kind: "SYSTEM", label: "demo loader" }, { organisationId: this.org, reference: l.ex.reference, facts: c.estimateFacts, at, person, paper, benchmarkLabelEn: c.scopePolicy.benchmarkLabelEn }) : null;
    const rows = c.openings.filter((x) => x.sequenceNo <= o.sequenceNo).flatMap((x) => x.bids.map((b) => ({ listingNo: b.listingNo, bidderName: b.bidderNameAsRead, registrationClass: b.registrationClassAsRead, registrationStatus: b.registrationStatusAsRead, price: parseSen(b.priceAsRead.toString()), period: b.completionPeriod != null && b.completionUnit ? { value: b.completionPeriod, unit: b.completionUnit } : null, isAlternative: b.isAlternative, parentListingNo: b.parentOpenedBid?.listingNo ?? null, openingSequence: x.sequenceNo })));
    const mainSchedule = o.kind === "SUPPLEMENTARY" ? (c.main?.scheduleSnapshot as { benchmark?: { sealed: false; label: string | null; companyEstimate: string } | { notRequired: true } } | null) : null;
    const prior = mainSchedule?.benchmark;
    const benchmark = disclosed?.benchmark ? { sealed: false as const, label: disclosed.benchmark.label, value: disclosed.benchmark.value } : prior && "companyEstimate" in prior ? { sealed: false as const, label: prior.label, value: parseSen(prior.companyEstimate) } : { notRequired: true as const };
    const gap = o.kind === "MAIN" && o.boxLockedAt && l.ex.closingAt ? lockGap(l.ex.closingAt, o.boxLockedAt) : null;
    const { schedule } = jadualTawaran({ version: o.sequenceNo, title: l.ex.title, reference: l.ex.reference, startDay: l.ex.tenderingStartOn ? storedDay(l.ex.tenderingStartOn) : null, closing: l.ex.closingAt, invited: { reading: snap.invited.reading, ...invitedCounts(c) }, lateCount: lateCount(c.envelopes), pages: o.schedulePages, rows, benchmark, lockGap: gap });
    const summary = grandSummary({ finalised: true, bids: c.openings.filter((x) => x.sequenceNo <= o.sequenceNo).flatMap((x) => x.bids.map((b) => ({ listingNo: b.listingNo, bidderName: b.bidderNameAsRead, price: parseSen(b.priceAsRead.toString()), verdict: b.verdict }))), labels: summaryLabelsOf(snap) });
    if (!("summary" in summary)) throw new Error("Demo 6.7: the Grand Summary was refused.");
    await this.db.opening.update({
      where: { id: openingId },
      data: {
        finalisedAt: at,
        scheduleSnapshot: { ...schedule, invitedReadingProvenance: snap.invited.provenance } as never,
        grandSummarySnapshot: summary.summary as never,
        faultsSnapshot: [] as never,
        estimatePaperAmount: disclosed?.paper != null ? senToDecimalString(disclosed.paper) : null,
        estimateLodgedAmount: disclosed?.check ? senToDecimalString(disclosed.lodged) : null,
        estimateCopyCheck: disclosed?.check ?? null,
      },
    });
    this.entry(OPENING_ENTITY.opening, openingId, this.openingLabel(l.ex.reference, o), "UPDATE", at, diffFields({ finalised: null }, finaliseFields({ at, by: person.name, pages: o.schedulePages!, rows: schedule.rows.length, copy: disclosed?.check ?? null, paper: disclosed?.paper ?? null, lodged: disclosed?.lodged ?? null, disclosed: !!disclosed }, this.tz)));
    if (o.kind === "MAIN") {
      await moveExercise(this.db as never, l.ex, "OPENED", { today: dayIn(at, this.tz), via: "OPENING_FINALISED", finaliseFaults: 0 });
      this.entry("SourcingExercise", exerciseId, `${l.ex.reference} · ${l.ex.title}`, "UPDATE", at, diffFields({ status: l.ex.status }, { status: "OPENED" }));
    }
  }

  /// The signed schedule's scan, attached once the opening is finalised (C-5).
  async scan(exerciseId: string, openingId: string, docId: string, title: string, at: Date) {
    const { scheduleScanFault } = await import("../src/lib/opening/finalise");
    const { liveScans } = await import("../src/lib/opening/repo");
    const { l, o } = await this.opening(exerciseId, openingId, at);
    const fault = scheduleScanFault({ finalised: o.finalisedAt != null, liveScans: liveScans(o) });
    if (fault?.code !== "SIGNED_SCHEDULE_NOT_ATTACHED") throw new Error(`Demo 6.7: ${openingId}'s scan is refused (${fault?.code ?? "already attached"}).`);
    const when = at.toISOString().slice(0, 16);
    const full = `${title}, ${l.ex.reference}`;
    const e = await writeDemoDocs(this.db, this.org, [{
      id: docId, title: full, classId: `${P}dc2`, className: "Certificates", classification: "SULIT", createdAt: when,
      versions: [{ id: `${docId}v1`, n: 1, bytes: demoPdf([`${full} (demo, SULIT)`, "The schedule of tenders the opening panel signed.", "Listed, never opened in the portal before sign-in."]), mediaType: "application/pdf", filename: "signed-schedule-of-tenders.pdf", receivedOn: dayIn(at, this.tz), storedAt: when }],
      attachments: [{ id: `${docId}a1`, purpose: "SIGNED_SCHEDULE", owner: { openingId }, ownerLabel: this.openingLabel(l.ex.reference, o), versionId: `${docId}v1`, at: when }],
    }], `${P}${docId.slice(P.length)}au`, HOD_CP);
    await e.flush();
  }

  /// recordCopyExplanation (C-1): once, never edited.
  async explain(exerciseId: string, openingId: string, person: { id: string; name: string }, explanation: string, at: Date) {
    const { explanationFaults } = await import("../src/lib/opening/estimate-copy");
    const { OPENING_ENTITY } = await import("../src/lib/opening/audit-view");
    const { l, o } = await this.opening(exerciseId, openingId, at);
    refuse(`explaining ${openingId}'s copy`, explanationFaults({ finalised: !!o.finalisedAt, check: o.estimateCopyCheck, explained: !!o.copyExplanation, text: explanation, personActive: true }));
    const id = `${openingId}x1`;
    await this.db.estimateCopyExplanation.create({ data: { id, organisationId: this.org, openingId, explanation, recordedByPersonId: person.id, recordedAt: at } });
    this.entry(OPENING_ENTITY.explanation, id, this.openingLabel(l.ex.reference, o), "CREATE", at, diffFields(null, { explanation, recordedBy: `${person.name} (recorded on their behalf, not signed)` }));
  }
}

// ------------------------------------------------------------------ the read-back (X-10 b)

export async function checkOpeningDemo(db: Db) {
  const { loadOpeningGate } = await import("../src/lib/opening/gate-read");
  const { openingGateFaults } = await import("../src/lib/opening/award-gate");
  const { openingSection, scheduleSection } = await import("../src/lib/opening/read");
  const fail = (what: string): never => {
    throw new Error(`Demo 6.7: ${what}`);
  };
  const ex = await db.sourcingExercise.findMany({ where: { id: { in: [...OPENING_EXERCISES] } }, select: { id: true, status: true } });
  // 6.8 (E-12, flagged): 6.8's demo evaluates sx16 after its openings: past the opening, Evaluated.
  if (ex.find((e) => e.id === `${P}sx16`)?.status !== "EVALUATED") fail("sx16 is not past its opening (Evaluated by 6.8's demo).");
  if (ex.find((e) => e.id === `${P}sx20`)?.status !== "OPENING_IN_PROGRESS") fail("sx20 is not Opening in progress.");
  // sx16: both openings finalised, their scans attached, the copy finding explained: the award gate is open, for a carried bidder.
  const g16 = await loadOpeningGate(`${P}sx16`);
  const faults16 = openingGateFaults(g16, `${P}pty2`).filter((f) => f.level === "block");
  if (faults16.length) fail(`sx16's openings hold its award back (${faults16.map((f) => f.code).join(", ")}).`);
  if (!openingGateFaults(g16, `${P}pty10`).some((f) => f.code === "AWARDEE_NOT_CARRIED")) fail("a party not carried at sx16's opening could be awarded on it.");
  const s16 = (await scheduleSection(await demoOrgId(), `${P}sx16`)) ?? fail("sx16's schedule did not load.");
  const main = s16.openings.find((o) => o.title === "Opening") ?? fail("sx16 has no main opening.");
  if (!main.finalised || main.rows.length !== 4 || !main.summary || !main.benchmark || main.benchmark.sealed) fail("sx16's main schedule is not frozen with four offers, its Grand Summary and the disclosed estimate.");
  if (main.copy?.check !== "NOT_IN_BOX" || !main.explanation) fail("sx16's copy finding is not recorded and explained.");
  const lowest = main.summary!.rows.filter((r) => r.lowest);
  if (lowest.length !== 1 || lowest[0].listingNo !== 1) fail("sx16's lowest qualified offer is not No. 1.");
  // OD-4 (REPORT): the offers with no live purchase are carried, and reported.
  const o16 = (await openingSection(await demoOrgId(), `${P}sx16`)) ?? fail("sx16's opening did not load.");
  const reported = o16.openings[0].offers.filter((b) => b.reported.length > 0).map((b) => b.listingNo);
  if (reported.join() !== "2,3,4") fail(`sx16's reported offers are ${reported.join()}, not 2, 3 and 4.`);
  const supp = s16.openings.find((o) => o.title !== "Opening") ?? fail("sx16 has no supplementary opening.");
  if (!supp.finalised || supp.rows.length !== 5) fail("sx16's supplementary schedule is not version 2 with five offers.");
  // sx20: adjourned, with a lapsed authorisation and the box's envelope registered by the lock.
  const o20 = (await openingSection(await demoOrgId(), `${P}sx20`)) ?? fail("sx20's opening did not load.");
  const op3 = o20.openings[0] ?? fail("sx20 has no opening.");
  if (op3.phase !== "Adjourned" || !op3.resume?.allowed) fail("sx20's opening is not adjourned, ready to resume.");
  if (!op3.authorisations.some((a) => a.includes("lapsed"))) fail("sx20's unpaired authorisation did not lapse.");
  if (!op3.envelopes.some((e) => e.source.startsWith("In the box when it was locked"))) fail("sx20 has no envelope found in the box.");
  // OD-2: only an opened envelope names a bidder.
  if (await db.bidEnvelope.count({ where: { id: demoRef, status: { not: "OPENED" }, NOT: { partyId: null } } })) fail("an envelope not opened names a party.");
  const later = await db.auditEntry.count({ where: { id: { startsWith: `${P}bauo` }, at: { gt: new Date() } } });
  if (later) fail(`${later} trail entries are dated after now (X-10 a).`);
}
