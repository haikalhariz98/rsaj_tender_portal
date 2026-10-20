/**
 * Demo data for the online sealed bids (wave 3b step 18; ADR 0036; rulings 12c, 12d, 20z). Invented throughout. Written ONLY inside `demo:load` on a fresh database (ruling
 * 12c, G2): nothing here is an add-on mode, and on a database that already holds the demonstration the loader writes nothing and says which settings are not set.
 *
 * Configuration (a customer sets its own through Configuration, by two people; the demonstration writes it directly, audited as the loader, and says so):
 *  - the window policy's channel: ONLINE, only where `channelSettingFaults` allows it (the deployment allows demonstration bids), else PAPER with the reason in words;
 *  - the organisation's bid sealing mode: DEMONSTRATION; the shortest unseal passphrase: 12; the rules each returned tender part is uploaded under, with the three opening-check
 *    parts of ruling 23; and the document class a finalised online bid is filed under (class SULIT).
 *  - every exercise the earlier demos authored is pinned PAPER explicitly (12d, G1): they keep the paper paths they were authored with, and the channel is set only after.
 *
 * The one online exercise, DEMONSTRATION: its requisition approved, then the product's own create act (`createExercise`, which takes ONLINE from the window policy, G1, with
 * no demonstration exception), 6.2 and 6.4 as `demo-window.ts` does them, the opening officers named, their shares set and the key made, the company estimate lodged sealed
 * (beneath `lodgeEstimate`, as below), the window published by the product's own `publishWindow` (which freezes the mode, the rules and the key), and then the suppliers' submissions.
 *
 * Beneath the signed acts. A share and a submission are signature-class acts: they are made in a person's own session with the password asked again, and they are
 * attributed SIGNED. The loader is not a person and holds no session, and the demonstration must never carry a signature nobody made (`demo-additive.db.test.ts` holds
 * `SIGNED` at zero). So the officers' shares, the suppliers' parts and submissions and the estimate's sealed lodgement are written here, in the order the product's own writes make them, with the same sealing
 * code (`makeOfficerKey`, `makeKeyIfComplete`, `sealFile`, `sealSubmission`) and the same judges, as the loader's own rows: audited as the demo loader and attributed
 * RECORDED_ON_BEHALF with the demonstration's reason. The keys are real: the passphrases printed in the demonstration guide open them. Logged as a product-owner question.
 *
 * Time. The database's own clock decides in time or late, and the closing of a published exercise is not changed. So the exercise closes a few minutes after its bids are made
 * (the closing is chosen when the pack is submitted, as the approval's own date rules judge it), two suppliers' bids are made in time (one replaced),
 * the loader then waits for the database's clock to pass the closing, and a third supplier's bid is received late.
 */

import { randomUUID } from "node:crypto";

import type { PrismaClient } from "../src/generated/prisma/client";
import { diffFields } from "../src/lib/audit/diff";
import { attributionFaults, attributionRow, type AttributionRequest } from "../src/lib/auth/attribution";
import { receiptDigest } from "../src/lib/bids/online/receipt";
import { submitFaults } from "../src/lib/bids/online/submission";
import { storedScan, uploadGateFaults } from "../src/lib/bids/online/parts";
import type { BidPartRule, Declaration } from "../src/lib/bids/online/types";
import { loadDoorFacts } from "../src/lib/bids/online/upload-store";
import { lockEnvelopeRows } from "../src/lib/bids/lock";
import { dayToDate, instantAt, todayIn } from "../src/lib/dates";
import { blobStore, sha256Hex } from "../src/lib/documents/store";
import { formatOrgDateTime } from "../src/lib/format";
import { ACT_LABEL } from "../src/lib/labels";
import { parseSen, senToDecimalString } from "../src/lib/money";
import { lockExerciseSide } from "../src/lib/portal/bids/lock";
import { sealingDeployment, sealingPepper } from "../src/lib/integration/sealing-deployment";
import { passphraseFaults } from "../src/lib/sealing/ceremony";
import { sealSubmission } from "../src/lib/sealing/bid-seal";
import { makeOfficerKey } from "../src/lib/sealing/ceremony-seal";
import { sealFile } from "../src/lib/sealing/file-seal";
import { pepperForWrapFault, shareFaults } from "../src/lib/sealing/share";
import { loadCeremony, makeKeyIfComplete } from "../src/lib/sealing/store";
import { channelSettingFaults, onlineSubmissionAllowed } from "../src/lib/sealing/switch";
import { closingAfter, DEMO_UNSEAL_PASSPHRASES, onlineDemoDecision, unsetOnlineSettings, type OnlineSettingsFacts } from "../src/lib/demo/online-demo";
import { closingFaults } from "../src/lib/window/dates";
import { windowFindingText } from "../src/lib/window/labels";
import { loadCalendar, loadWindowPolicy } from "../src/lib/window/repo";

import { DEMO_ATTRIBUTION_REASON } from "./demo-attribution";
import { DEMO_ACTOR } from "./demo-actor";
import { act, seedActIds } from "./demo-acts";
import type { Add } from "./demo-tender-docs";
import { BIG } from "./demo-window";

/// Minutes between the load and the exercise's closing. The load must make its two in-time bids inside it, so a slow machine raises it (DEMO_ONLINE_CLOSING_MINUTES, 2 to 20). It is judged for the closing calendar
/// before any online write, and it is the one number both the check and the closing use.
const CLOSING_MARGIN_MINUTES = (() => {
  const n = Number(process.env.DEMO_ONLINE_CLOSING_MINUTES);
  return Number.isInteger(n) && n >= 2 && n <= 20 ? n : 4;
})();

type Db = PrismaClient;
const P = "demo_";

/// The online exercise's own ids (a range no earlier demo module uses; `demo-additive.db.test.ts` and the guide name them).
export const ONLINE_EXERCISE_TITLE = "Treated water pipeline renewal, Demo Hills (online sealed bids)";
const RQ = `${P}rq60`;
const REQ_ROUTE = `${P}ai162`;
const TENDERING_ROUTE = `${P}ai163`;
const MOVEMENT = `${P}bm81`;
const PACK = `${P}tpk40`;
const WINDOW = `${P}win40`;
const SX_NO = 40;
const ORG_CODE = process.env.ORGANISATION_CODE ?? "ORG";
const ESTIMATE = `${P}est${SX_NO}`;
const VALUE = "380000.00";
/// The document class a finalised online bid file is filed under, and the rules a returned tender part is uploaded under.
const BID_FILE_CLASS = `${P}dc4`;
const PASSPHRASE_MIN = 12;
const MAX_BYTES = "10485760";

const CLERK = { id: `${P}p4`, name: "Daniel Anak Jelani" };
const HOD_CP = { id: `${P}p3`, name: "Chen Wei Ling" };

/// The RM250,000-and-above requisition band: an open tender is available there (the quotation band proposes a quotation below it).
const BAND = BIG;

/// The three bidders (two in time, one late) and what they declare. Their portal accounts are the demonstration's own (`npm run demo:accounts` gives them the demonstration password).
export const ONLINE_BIDDERS = [
  { key: "paip", supplierId: `${P}vnd2`, party: `${P}pty40`, sale: `${P}sale40`, receiptNo: "FR/26/004601", main: { price: "371500.00", period: 9 }, replacement: { price: "368900.00", period: 9 } },
  { key: "contoh", supplierId: `${P}vnd1`, party: `${P}pty41`, sale: `${P}sale41`, receiptNo: "FR/26/004602", main: { price: "376400.00", period: 8 }, alternative: { price: "365200.00", period: 7 } },
  { key: "contractor", supplierId: `${P}ctr13`, party: `${P}pty42`, sale: `${P}sale42`, receiptNo: "FR/26/004603", main: { price: "379200.00", period: 8 } },
] as const;

const fail = (what: string): never => {
  throw new Error(`Demo online: ${what}.`);
};

export interface OnlineDemoResult {
  online: boolean;
  words: string[];
  reference: string | null;
}

type Trail = { id: string; organisationId: string; entity: string; entityId: string; entityLabel: string; action: "CREATE" | "UPDATE" | "DELETE"; at: Date; changes: object[]; reason: string; unattributed: boolean }[];

/// What a re-run says: the settings that are not set, in words. Reads only.
export async function onlineDemoUnsetWords(db: Db, organisationId: string): Promise<string[]> {
  const wp = await db.windowPolicy.findUnique({ where: { organisationId }, select: { documentSaleMode: true, submissionChannel: true } });
  const bs = await db.bidSealingPolicy.findUnique({ where: { organisationId }, select: { onlineSubmission: true } });
  const sp = await db.securityPolicy.findUnique({ where: { organisationId }, select: { sealingPassphraseMinLength: true } });
  const ds = await db.documentStorePolicy.findUnique({ where: { organisationId }, select: { onlineBidFileClassId: true } });
  const facts: OnlineSettingsFacts = {
    documentSaleMode: wp?.documentSaleMode ?? null,
    submissionChannel: wp?.submissionChannel ?? null,
    onlineSubmission: bs?.onlineSubmission ?? null,
    sealingPassphraseMinLength: sp?.sealingPassphraseMinLength ?? null,
    onlineBidFileClassSet: !!ds?.onlineBidFileClassId,
  };
  return unsetOnlineSettings(facts);
}

const CHANNEL_WORDS = { PAPER: "On paper, in a sealed envelope", ONLINE: "Online, sealed in the portal" } as const;

export async function loadOnlineDemo(db: Db, organisationId: string): Promise<OnlineDemoResult> {
  const { calendarOf, CHANNELS, COMPLETE_APPENDIX, FIRMS: _FIRMS, TENDER_FEE_BASIS, tenderWindow, scopeReady, Acts } = await import("./demo-window");
  void _FIRMS;
  const { answer, conditionsFor, confirm, decide, enterAppendix, markAllReady, moveIntoPreparation, startPack, submit } = await import("./demo-tender-docs");
  const { answers } = await import("./demo-bids");
  const { demoPdf, writeDemoDocs } = await import("./demo-documents");
  const { issueReference } = await import("../src/lib/numbering/issue");

  const org = await db.organisation.findUniqueOrThrow({ where: { id: organisationId }, select: { timeZone: true } });
  const tz = org.timeZone ?? fail("the organisation's time zone is not set");
  const L = todayIn(new Date(), tz)!;
  const { W } = calendarOf(L);
  const T = (d: string, hhmm: string) => instantAt(d, hhmm, tz)!;
  const iso = (x: Date) => x.toISOString().slice(0, 16);

  const trail: Trail = [];
  let n = 0;
  const entry: Add = (entity, entityId, entityLabel, action, when, changes, reason = "") => trail.push({ id: `${P}olau${++n}`, organisationId, entity, entityId, entityLabel, action, at: when, changes, reason, ...DEMO_ACTOR });
  const flush = async () => {
    if (trail.length) await db.auditEntry.createMany({ data: trail.splice(0) as never });
  };

  // ---- can it be made online? Every reason it cannot is listed, and nothing online is begun.
  const store = blobStore();
  const pepper = sealingPepper();
  // The closing is minutes after the load, on the load day: the product's own closing rule must allow that day (no weekend, no public holiday, a year the calendar maintains), judged now for
  // the closing as it would be and for one twenty-five minutes on (the steps in between take minutes, and a load near midnight must not publish on the wrong side of it). Never restated here.
  const windowPolicy = await loadWindowPolicy(organisationId, db as never);
  const calendar = await loadCalendar(windowPolicy.calendarId, db as never);
  const closingDayFaults = [CLOSING_MARGIN_MINUTES, CLOSING_MARGIN_MINUTES + 21].flatMap((minutes) => {
    const closingAt = closingAfter(new Date(), minutes, tz).instant;
    return closingFaults({ closingAt, advertisementDay: W(12), closingTimeReason: "Demonstration", timeZone: tz, policy: windowPolicy, calendar, today: null, purchaseCloseDay: W(3) })
      .filter((f) => f.level === "block" && ["CLOSING_ON_WEEKEND", "PUBLIC_HOLIDAY", "CALENDAR_NOT_MAINTAINED", "CALENDAR_NOT_SET", "WEEKEND_NOT_SET"].includes(f.code))
      .map((f) => windowFindingText(f));
  });
  const heldMode = (await db.bidSealingPolicy.findUnique({ where: { organisationId }, select: { onlineSubmission: true } }))?.onlineSubmission ?? null;
  const heldMinimum = (await db.securityPolicy.findUnique({ where: { organisationId }, select: { sealingPassphraseMinLength: true } }))?.sealingPassphraseMinLength ?? null;
  const decision = onlineDemoDecision({
    channelFaults: channelSettingFaults("ONLINE", onlineSubmissionAllowed("DEMONSTRATION", sealingDeployment(), "PUBLISH")),
    blobStoreReady: !("fault" in store),
    pepperFault: pepperForWrapFault("DEMONSTRATION", pepper.status),
    closingDayFaults: [...new Set(closingDayFaults)],
    existingMode: heldMode,
    passphraseMinLength: heldMinimum,
  });

  const now0 = new Date();
  // ---- the authored exercises, pinned PAPER explicitly before the channel is set (12d, G1). None is left unset.
  const authored = await db.sourcingExercise.findMany({ where: { organisationId }, select: { id: true, reference: true, submissionChannel: true }, orderBy: { reference: "asc" } });
  for (const ex of authored) {
    if (ex.submissionChannel === "PAPER") continue;
    if (ex.submissionChannel !== null) fail(`${ex.reference} is already ${ex.submissionChannel}: the authored exercises are paper`);
    await db.sourcingExercise.update({ where: { id: ex.id }, data: { submissionChannel: "PAPER" } });
    entry("SourcingExercise", ex.id, `${ex.reference} · How bids are submitted`, "UPDATE", now0, diffFields({ howBidsAreSubmitted: "Not set" }, { howBidsAreSubmitted: CHANNEL_WORDS.PAPER }), "The exercise was authored on paper: pinned explicitly, never left unset (ruling 12d).");
  }
  if ((await db.sourcingExercise.count({ where: { organisationId, NOT: { submissionChannel: "PAPER" } } })) !== 0) fail("an authored exercise is not pinned on paper");

  const policy = await db.windowPolicy.findUnique({ where: { organisationId }, select: { id: true, submissionChannel: true } });
  if (!policy) return fail("the window policy is not loaded");
  const setChannel = async (to: "PAPER" | "ONLINE", reason: string) => {
    if (policy!.submissionChannel === to) return;
    await db.windowPolicy.update({ where: { id: policy!.id }, data: { submissionChannel: to } });
    entry("WindowPolicy", policy!.id, "Invitation controls · policy", "UPDATE", now0, diffFields({ howBidsAreSubmitted: policy!.submissionChannel ? CHANNEL_WORDS[policy!.submissionChannel] : "Not set" }, { howBidsAreSubmitted: CHANNEL_WORDS[to] }), reason);
    policy!.submissionChannel = to;
  };

  if (!decision.online) {
    // Nothing is left half made: the channel reads PAPER, no online row exists, and the words say what is missing.
    await setChannel("PAPER", "The online demonstration could not be made, so exercises made now are on paper: " + decision.reasons.join(" "));
    await flush();
    console.log("Online sealed bids: the channel is set to PAPER and no online exercise was made.");
    for (const r of decision.reasons) console.log(`  ${r}`);
    return { online: false, words: decision.reasons, reference: null };
  }

  // ---- configuration, written directly by the demonstration (ruling 12c), audited as the loader
  const cfgAt = T(W(17), "08:00");
  const existing = await db.bidSealingPolicy.findUnique({ where: { organisationId }, select: { id: true, onlineSubmission: true } });
  if (existing && existing.onlineSubmission === null) {
    await db.bidSealingPolicy.update({ where: { id: existing.id }, data: { onlineSubmission: "DEMONSTRATION", provenance: "ASSUMED" } });
    entry("BidSealingPolicy", existing.id, "Bid sealing policy", "UPDATE", cfgAt, diffFields({ onlineSubmission: "Not set" }, { onlineSubmission: "Demonstration: bids taken online are for trying the system, not for real tenders" }), "Demonstration mode for the demonstration database.");
  } else if (!existing) {
    const created = await db.bidSealingPolicy.create({ data: { id: `${P}bsp1`, organisationId, onlineSubmission: "DEMONSTRATION", provenance: "ASSUMED", notes: "Demonstration mode for the demonstration database. Invented, not a recommendation." } });
    entry("BidSealingPolicy", created.id, "Bid sealing policy", "CREATE", cfgAt, diffFields(null, { onlineSubmission: "Demonstration: bids taken online are for trying the system, not for real tenders", whereItComesFrom: "Assumed" }));
  }
  const security = await db.securityPolicy.findUnique({ where: { organisationId }, select: { id: true, sealingPassphraseMinLength: true } });
  if (security) {
    // A row made before the load (the administrator's bootstrap asks for the sign-in settings): the minimum is filled only where it is not set, as `demo:accounts` fills the others.
    if (security.sealingPassphraseMinLength === null) {
      await db.securityPolicy.update({ where: { id: security.id }, data: { sealingPassphraseMinLength: PASSPHRASE_MIN } });
      entry("SecurityPolicy", security.id, "Security settings", "UPDATE", cfgAt, diffFields({ sealingPassphraseMinLength: null }, { sealingPassphraseMinLength: PASSPHRASE_MIN }), "A sample for the demonstration, filled where it was not set.");
    }
  } else {
    const created = await db.securityPolicy.create({ data: { id: `${P}secpol1`, organisationId, sealingPassphraseMinLength: PASSPHRASE_MIN } });
    entry("SecurityPolicy", created.id, "Security settings", "CREATE", cfgAt, diffFields(null, { sealingPassphraseMinLength: PASSPHRASE_MIN }), "A sample for the demonstration. The sign-in settings are filled by npm run demo:accounts where they are unset.");
  }
  // The rules each returned tender part is uploaded under; the three opening-check parts of ruling 23 are the form of tender, the summary and rates and the bidder's declaration.
  const OPENING_CHECK = new Set(["FORM_OF_TENDER", "SUMMARY_AND_RATES", "DECLARATION"]);
  const parts = await db.tenderDocumentPart.findMany({ where: { organisationId, returnedByBidder: true, retiredOn: null }, select: { id: true, labelEn: true, role: true, packKind: true, bidAcceptedMediaTypes: true, bidMaxBytes: true, openingCheck: true } });
  for (const p of parts) {
    // Rules that are already set are left as they are.
    if (p.bidAcceptedMediaTypes.length > 0 || p.bidMaxBytes !== null || p.openingCheck !== null) continue;
    const check = OPENING_CHECK.has(p.role);
    await db.tenderDocumentPart.update({ where: { id: p.id }, data: { bidAcceptedMediaTypes: ["application/pdf"], bidMaxBytes: BigInt(MAX_BYTES), openingCheck: check, openingCheckProvenance: "ASSUMED" } });
    entry("TenderDocumentPart", p.id, `Tender document part · ${p.labelEn}`, "UPDATE", cfgAt, diffFields({ uploadedAs: null, largestFile: null, checkedAtTheOpening: "Not set" }, { uploadedAs: "PDF", largestFile: "10 MB", checkedAtTheOpening: check ? "Yes" : "No" }), "Demonstration upload rules and opening check (invented, ruling 23).");
  }
  const dsp = await db.documentStorePolicy.findUnique({ where: { organisationId }, select: { id: true, onlineBidFileClassId: true } });
  if (!dsp) return fail("the document store's upload rules are not loaded");
  // The class a finalised online bid is filed under: set only where it is not set already.
  if (dsp.onlineBidFileClassId === null) {
    const cls = await db.documentClass.create({ data: { id: BID_FILE_CLASS, organisationId, code: "demo_online_bid_files", nameEn: "Online bid files", nameMs: "Fail bid dalam talian", classification: "SULIT" } });
    entry("DocumentClass", cls.id, "Document class · Online bid files", "CREATE", cfgAt, diffFields(null, { nameEn: "Online bid files", classification: "SULIT" }));
    await db.documentStorePolicy.update({ where: { id: dsp.id }, data: { onlineBidFileClassId: cls.id } });
    entry("DocumentStorePolicy", dsp.id, "Upload rules", "UPDATE", cfgAt, diffFields({ onlineBidFilesFiledUnder: null }, { onlineBidFilesFiledUnder: "Online bid files" }));
  }
  // The channel, last: the product's own rule has judged it above (the deployment allows demonstration bids), and the authored exercises are already pinned.
  await setChannel("ONLINE", "The organisation's channel for the online demonstration, set as the editor sets it: judged by channelSettingFaults (ruling 13).");
  await flush();

  // The acts below continue every demo id series after what the database holds.
  await seedActIds(db);
  const unset = await db.clauseText.findMany({ where: { organisationId, mandatoryInAgreements: null, retiredOn: null } });
  if (unset.length) fail(`the clause "${unset[0].titleEn}" has "every agreement carries it" not set`);

  // Documents continue after the highest number any earlier module wrote, whatever it is (read, never typed: each earlier module counts from a number of its own).
  let doc = 1 + (await db.document.findMany({ where: { id: { startsWith: `${P}doc` } }, select: { id: true } })).reduce((m, d) => Math.max(m, Number(d.id.slice(`${P}doc`.length)) || 0), 0);
  const nextDoc = () => `${P}doc${doc++}`;
  const docs = async (ds: Parameters<typeof writeDemoDocs>[2]) => {
    if (!ds.length) return;
    const e = await writeDemoDocs(db, organisationId, ds, `${P}oldoc${ds[0].id.slice(P.length)}au`, HOD_CP);
    await e.flush();
  };

  // ---- the requisition, approved on the RM40,000 to RM250,000 band
  const raised = W(16);
  const decidedOn = BAND.chain.map(() => W(15));
  const approvedOn = W(15);
  const reqRef = await db.$transaction((tx) => issueReference(tx as never, organisationId, "requisition", dayToDate(raised)));
  {
    const movements = await db.budgetMovement.findMany({ where: { budgetCodeId: `${P}bcode8` } });
    const original = movements.filter((m) => m.kind === "ORIGINAL").reduce((a, m) => a + parseSen(m.amount.toString()), 0n);
    const balance = original - movements.filter((m) => m.kind === "COMMITMENT" && !m.releasedOn).reduce((a, m) => a + parseSen(m.amount.toString()), 0n);
    if (balance < parseSen(VALUE)) fail("the budget code has no room for the requisition");
    const fmt = (x: bigint) => senToDecimalString(x);
    await db.requisition.create({
      data: {
        id: RQ, organisationId, reference: reqRef, origin: "PORTAL", erpRequisitionNo: "XR2026000471", erpNoteNo: "RN/2026/0471", erpRefSource: "MANUAL", erpRefRecordedAt: dayToDate(raised),
        requestingUnitCode: "NTH", sectionUnitCode: "NTH-MNT", requestingPersonId: `${P}p11`, title: ONLINE_EXERCISE_TITLE, justification: "The treated water pipeline has leaked at four joints this year and the lining has failed over a long reach.", needStatement: "Renew the pipeline's joints and relining over the failed reach.",
        costCentreCode: "CC-200", accountCode: "7400400", budgetCodeId: `${P}bcode8`, siteCode: "NTH-WKS", placeOfDelivery: "Demo Hills network", dateRequired: dayToDate(W(-90)),
        estimatedValue: VALUE, raisedOn: dayToDate(raised), fundingRouteCode: "capex", fundingSupersedesAuthority: false, sourcingPermitted: true, fundingPosture: "PROCURES", status: "APPROVED", commitmentMovementId: MOVEMENT, gatesDeterminedOn: T(approvedOn, "16:00"), gateRequired: false, gateRequiredProvenance: "ASSUMED",
        lines: { create: [{ id: `${RQ}l1`, lineNo: 1, description: ONLINE_EXERCISE_TITLE, estimatedAmount: VALUE }] },
      },
    });
    await db.requisitionEndorsement.createMany({ data: [{ id: `${P}en60a`, requisitionId: RQ, tier: "SECTION", unitCode: "NTH-MNT", personId: `${P}p10`, endorsedOn: dayToDate(raised) }, { id: `${P}en60b`, requisitionId: RQ, tier: "DEPARTMENT", unitCode: "NTH", personId: `${P}p9`, endorsedOn: dayToDate(raised) }] });
    await db.requisitionBudgetCheck.create({ data: { id: `${P}bk60`, requisitionId: RQ, checkedAt: dayToDate(raised), asAt: dayToDate(raised), source: "PORTAL_LEDGER", budgetCodeId: `${P}bcode8`, budgetCodeCode: "CAP26-044", requestedAmount: VALUE, actualBudget: fmt(original), balanceAsAt: fmt(balance), approvedAccount: fmt(original - balance), approvedAccountProvenance: "ASSUMED", projectedBalance: fmt(balance - parseSen(VALUE)), verdict: "WITHIN" } });
    await db.requisitionSplitCheck.create({ data: { id: `${P}sp60`, requisitionId: RQ, checkedAt: dayToDate(raised), state: "CLEAR", windowDays: 45, matchOn: ["unit", "accountCode"], aggregateAcrossYear: false, policyProvenance: "ASSUMED", relatedRequisitionIds: [], relatedReferences: [] } });
    await db.budgetMovement.create({ data: { id: MOVEMENT, budgetCodeId: `${P}bcode8`, kind: "COMMITMENT", amount: VALUE, occurredOn: dayToDate(approvedOn), reference: reqRef, description: ONLINE_EXERCISE_TITLE } });
    const hours = ["10:00", "11:00", "14:00", "15:00"];
    await db.approvalInstance.create({
      data: {
        id: REQ_ROUTE, organisationId, matterKind: "REQUISITION", requisitionId: RQ, domain: "requisition", value: VALUE, authorityMatrixId: `${P}mx1`, matrixLabel: "Demo limits, issue 1", ruleKey: BAND.key, ruleLabel: BAND.label, ruleClause: BAND.clause,
        boundaryValue: "300000", boundaryInclusive: true, ruleFollowsBoundarySwitch: false, boundaryOperator: null, fundingRouteCode: "capex", budgetCheckId: `${P}bk60`, budgetVerdict: "WITHIN", availabilityCheck: "blocking", splitCheckId: `${P}sp60`, splitState: "CLEAR",
        checkedAgainstMatrix: true, status: "APPROVED", openedAt: dayToDate(raised), closedAt: T(approvedOn, "16:00"), commitOnApproval: true, routeCommitsBudget: true, createdAt: T(raised, "11:00"),
        steps: { create: BAND.chain.map(([roleCode, roleLabel, a, pid, name], i) => ({ id: `${P}rs60_${i + 1}`, sequence: i + 1, roleCode, roleLabel, act: a, nonDelegable: a === "MR", sourceRuleKey: BAND.key, decision: "DONE" as const, decidedByPersonId: `${P}${pid}`, decidedByName: name, decidedOn: dayToDate(decidedOn[i]), recordedAt: T(decidedOn[i], hours[i]) })) },
      },
    });
    const label = `${reqRef} · ${ONLINE_EXERCISE_TITLE}`;
    entry("Requisition", RQ, label, "CREATE", T(raised, "09:00"), diffFields(null, { reference: reqRef, title: ONLINE_EXERCISE_TITLE, requestingUnitCode: "NTH", estimatedValue: VALUE, status: "DRAFT" }));
    entry("Requisition", RQ, label, "UPDATE", T(raised, "10:00"), diffFields({ status: "DRAFT" }, { status: "ENDORSED" }));
    entry("ApprovalInstance", REQ_ROUTE, `${reqRef} · approval route`, "CREATE", T(raised, "11:00"), diffFields(null, { matrix: "Demo limits, issue 1", rule: BAND.label, route: BAND.chain.map(([, roleLabel, a]) => `${roleLabel} (${ACT_LABEL[a]?.toLowerCase() ?? "acts"})`).join(" → ") }));
    BAND.chain.forEach(([, roleLabel, , , name], i) => entry("ApprovalStep", `${P}rs60_${i + 1}`, `${reqRef} · ${roleLabel}`, "UPDATE", T(decidedOn[i], hours[i]), diffFields({ decision: "PENDING" }, { decision: "DONE", decidedBy: name, decidedOn: dayToDate(decidedOn[i]), recordedOnBehalf: "not signed" })));
    entry("Requisition", RQ, label, "UPDATE", T(approvedOn, "16:00"), diffFields({ status: "PENDING_APPROVAL" }, { status: "APPROVED" }));
  }
  await flush();

  // ---- the exercise, by the product's own create act: it takes the organisation's channel (ONLINE) and sale mode, as G1 says, with no demonstration exception.
  const A = await import("../src/app/sourcing/actions");
  await act(`${W(15)}T16:30`, "the online exercise opened", A.createExercise, {
    requisitionId: RQ, title: ONLINE_EXERCISE_TITLE, estimatedValue: VALUE, sourcingMethodCode: "open_tender", contractBasisCode: "ds", overriddenByPersonId: `${P}p11`,
    scope: JSON.stringify([{ kind: "MEASURED_CONSTRUCTION", amount: VALUE, description: ONLINE_EXERCISE_TITLE }]),
  });
  const made = await db.sourcingExercise.findFirstOrThrow({ where: { requisitionId: RQ }, select: { id: true, reference: true, submissionChannel: true, saleMode: true } });
  const sx = made.id;
  const ref = made.reference;
  if (made.submissionChannel !== "ONLINE") fail(`${ref} did not take the channel ONLINE from the window policy (${made.submissionChannel ?? "not set"})`);

  // ---- the opening officers (the first holders of the opening committee's seats, as many as its panel size says, none an administrator: as `demo-officers.ts` names them), then their shares and the key
  const { loadOpeningRoster, rosterFindings } = await import("../src/lib/opening/roster-store");
  const todayName = todayIn(new Date(), tz)!;
  const rosterOf = async () => {
    const e = await db.sourcingExercise.findUniqueOrThrow({ where: { id: sx }, select: { id: true, sourcingMethodCode: true, openingRosterRequired: true } });
    return loadOpeningRoster(e, { id: organisationId, code: ORG_CODE, today: todayName }, db);
  };
  {
    const before = await rosterOf();
    const size = before.committee?.panelSize ?? fail(`${ref}'s method names no opening committee with a panel size`);
    const administrators = new Set((await db.staffAccount.findMany({ where: { organisationId, isAdministrator: true }, select: { personId: true } })).map((a) => a.personId));
    const chosen = before.input.seats.filter((x) => !administrators.has(x.personId)).slice(0, size);
    const namedAt = T(W(15), "17:00");
    for (const [i, p] of chosen.entries()) {
      const id = `${P}oo${60 + i}`;
      await db.exerciseOpeningOfficer.create({ data: { id, organisationId, exerciseId: sx, personId: p.personId, committeeMemberId: p.committeeMemberId, seatLabelSnapshot: p.seatLabel, namedAt, namedByPersonId: `${P}p11` } });
      const who = await db.person.findUniqueOrThrow({ where: { id: p.personId }, select: { name: true } });
      entry("ExerciseOpeningOfficer", id, `${ref} · Opening officer · ${who.name}`, "CREATE", namedAt, diffFields(null, { officer: who.name, seat: p.seatLabel, committee: before.committee!.nameEn }));
    }
    const faults = rosterFindings(await rosterOf()).filter((f) => f.level === "block");
    if (faults.length) fail(`the opening officers on ${ref} fail the roster's own rules (${faults.map((f) => f.code).join(", ")})`);
  }
  await flush();
  const roster = await db.exerciseOpeningOfficer.findMany({ where: { exerciseId: sx, endedAt: null }, orderBy: [{ namedAt: "asc" }, { id: "asc" }], select: { id: true, personId: true, seatLabelSnapshot: true, person: { select: { name: true } } } });
  if (roster.length < 2) fail(`${ref} has ${roster.length} opening officers: two are needed to make the key`);
  if (roster.length > DEMO_UNSEAL_PASSPHRASES.length) fail(`${ref} has ${roster.length} opening officers: the demonstration holds ${DEMO_UNSEAL_PASSPHRASES.length} passphrases`);
  const shares = await writeShares(db, organisationId, sx, ref, roster, T(W(14), "09:00"), entry);

  // ---- 6.2: the panel verified; the estimate prepared and then lodged sealed, now that the key exists. Written beneath lodgeEstimate by lodgeEstimateSealed, which restates that act's sealing and its order (a direct write, recorded as a product-owner question, not the act itself)
  const scopeOn = W(14);
  await scopeReady(db, organisationId, tz, sx, ref, SX_NO, scopeOn, T, nextDoc, docs as never, entry, VALUE, "DRAFT");
  await moveIntoPreparation(db, organisationId, sx, scopeOn, { report: "works" }, entry);
  await flush();
  await lodgeEstimateSealed(db, organisationId, sx, ref, T(scopeOn, "11:00"), entry);
  await flush();

  // ---- 6.4: the tender documents, then the approval for tendering, its closing a few minutes after the bids are made
  const packOn = W(13);
  await startPack(db, organisationId, { id: PACK, exerciseId: sx, versionNo: 1, at: T(packOn, "08:30") }, entry);
  const uploadParts = await db.tenderPackPart.findMany({ where: { packId: PACK, source: "UPLOAD" }, orderBy: { sortOrder: "asc" } });
  await docs(uploadParts.map((p, i) => {
    const did = nextDoc();
    const t = `${p.labelSnapshot}, ${ref}`;
    const when = iso(T(packOn, `08:${String(40 + i).padStart(2, "0")}`));
    return { id: did, title: t, classId: `${P}dc1`, className: "Contract documents", classification: "INTERNAL" as const, createdAt: when, versions: [{ id: `${did}v1`, n: 1, bytes: demoPdf([t, "Tender document part (demo)."]), mediaType: "application/pdf", filename: `${t.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.pdf`, receivedOn: packOn, storedAt: when }], attachments: [{ id: `${did}a1`, purpose: "TENDER_PART" as const, owner: { tenderPackPartId: p.id }, ownerLabel: `${ref} · Tender pack v1 · part ${p.printedNumber}, ${p.labelSnapshot}`, versionId: `${did}v1`, at: when }] };
  }));
  await enterAppendix(db, organisationId, PACK, ref, COMPLETE_APPENDIX, T(packOn, "09:00"), entry);
  await conditionsFor(db, organisationId, sx, ref, [{ body: "demo_companies", group: 1 }, { body: "demo_contractors", qualifiers: "grade D4, category civil works", group: 2 }], T(packOn, "09:10"), entry);
  await answer(db, organisationId, sx, ref, { restrictedTender: false, regulatedActivity: true, regulatorPermitCode: "class_2" }, T(packOn, "09:20"), entry);
  await confirm(db, organisationId, PACK, ref, "NO_AMBIGUITY", CLERK.id, packOn, T(packOn, "09:30"), entry, L);
  await confirm(db, organisationId, PACK, ref, "DRAWINGS_COORDINATED", `${P}p10`, packOn, T(packOn, "09:35"), entry, L);
  await markAllReady(db, organisationId, PACK, ref, T(packOn, "10:00"), entry);
  const advertised = W(12);
  // The closing: a few minutes after now, to the minute, in the organisation's zone. The bids and the wait for it happen in this one run.
  const closing = closingAfter(new Date(), CLOSING_MARGIN_MINUTES, tz);
  const dates = { startOn: advertised, closingDay: closing.day };
  await submit(db, organisationId, { packId: PACK, routeId: TENDERING_ROUTE, at: T(packOn, "11:00"), startOn: dates.startOn, closingDay: dates.closingDay, closingTime: closing.time }, entry);
  await decide(db, organisationId, { packId: PACK, decision: "DONE", personId: HOD_CP.id, decidedOn: advertised, at: T(advertised, "09:00"), reason: "", dates: { ...dates, closingTime: closing.time } }, entry);

  // ---- 6.5: the window, the publications, and the publication itself, by the product's own act (it freezes the mode, the rules and the key)
  const acts = new Acts(db, organisationId, tz, entry);
  const windowInput = { ...tenderWindow(advertised, W(3)), submissionPlace: "Online, sealed, through the supplier portal (a demonstration, not for real tenders)", closingTimeReason: "The demonstration closes a few minutes after its bids are made, so that a late bid can be shown." };
  await acts.saveWindow(sx, WINDOW, windowInput, T(advertised, "09:30"));
  await acts.feeLines(sx, SX_NO, TENDER_FEE_BASIS, T(advertised, "09:40"));
  await answers(db, organisationId, entry, sx, ref, { days: 90, provenance: "ASSUMED", alternativesPermitted: true, reason: "" }, T(advertised, "09:45"));
  const channelRef: Record<string, string> = { [`${P}pch1`]: "Demo Daily, page 9", [`${P}pch2`]: "Head office notice board, ground floor", [`${P}pch3`]: `https://www.demo.invalid/tenders/${ref.replace(/\//g, "-")}` };
  for (const [i, c] of CHANNELS.entries()) await acts.publication(sx, `${P}pub40_${i + 1}`, c.id, advertised, channelRef[c.id] ?? fail(`no reference for channel ${c.id}`), T(advertised, `10:0${i}`));
  await acts.chooseModel(sx, T(advertised, "10:40"));
  await flush();
  const Wn = await import("../src/app/sourcing/[id]/window/actions");
  await act(`${advertised}T11:00`, "the online exercise published", Wn.publishWindow, { exerciseId: sx });
  const published = await db.sourcingExercise.findUniqueOrThrow({ where: { id: sx } });
  if (published.status !== "ADVERTISED" || published.onlineSubmissionMode !== "DEMONSTRATION" || !published.publishedKeyFingerprint) fail(`${ref} was not published online as a demonstration`);
  const closingAt = published.closingAt ?? fail(`${ref} has no closing`);

  // ---- the suppliers buy the documents (the sale is what lets them bid), then bid
  for (const [i, b] of ONLINE_BIDDERS.entries()) {
    const s = await db.supplier.findUniqueOrThrow({ where: { id: b.supplierId }, select: { registeredName: true, registrationNo: true, registeredAddress: true, companyEmail: true, status: true } });
    if (s.status !== "REGISTERED") fail(`${s.registeredName} is not registered`);
    await db.exerciseParty.create({ data: { id: b.party, organisationId, exerciseId: sx, source: "PURCHASER", name: s.registeredName, registrationNo: s.registrationNo, address: s.registeredAddress, email: s.companyEmail, vendorId: b.supplierId, createdAt: T(W(11 - i), "09:50") } });
    entry("ExerciseParty", b.party, `${ref} · Contractor ${s.registeredName}`, "CREATE", T(W(11 - i), "09:50"), diffFields(null, { source: "Purchaser", name: s.registeredName, registrationNo: s.registrationNo, linkedToTheRegister: "yes" }));
    await acts.sale(sx, b.sale, { partyId: b.party, receiptNo: b.receiptNo, collectedBy: "Demo representative", paymentMethod: "Bank draft" }, T(W(11 - i), "10:00"));
  }
  await flush();

  const bids = new Bidding(db, organisationId, tz, sx, ref, entry, demoPdf);
  const paip = ONLINE_BIDDERS[0];
  const first = await bids.submit(paip.supplierId, "BID", { price: paip.main.price, completionPeriod: paip.main.period, completionUnit: "MONTHS" });
  const replaced = await bids.submit(paip.supplierId, "BID", { price: paip.replacement.price, completionPeriod: paip.replacement.period, completionUnit: "MONTHS" }, { replaces: first });
  const contoh = ONLINE_BIDDERS[1];
  const contohMain = await bids.submit(contoh.supplierId, "BID", { price: contoh.main.price, completionPeriod: contoh.main.period, completionUnit: "MONTHS" });
  // 20bp: the same in-time supplier also lodges an alternative to its bid, through the same submit and the same judges (`submitFaults`: the window permits alternatives, the parent is its own standing bid).
  await bids.submit(contoh.supplierId, "ALTERNATIVE", { price: contoh.alternative.price, completionPeriod: contoh.alternative.period, completionUnit: "MONTHS" }, { parent: contohMain });
  void replaced;

  // ---- the closing passes by the database's own clock; the third supplier's bid is received late (taken until the main opening starts, 20b)
  await waitUntilPast(db, closingAt);
  const late = ONLINE_BIDDERS[2];
  await bids.submit(late.supplierId, "BID", { price: late.main.price, completionPeriod: late.main.period, completionUnit: "MONTHS" });
  await flush();
  // Read back as the database judged them: two standing in time and one late, never the other way round (a load too slow to make the first two before the closing stops here).
  const standing = (await db.onlineBid.findMany({ where: { exerciseId: sx, status: "SUBMITTED" }, select: { envelope: { select: { late: true } } } })).map((b) => b.envelope);
  if (standing.length !== 4 || standing.filter((e) => e.late).length !== 1) fail(`${ref} reads ${standing.length} standing bids and ${standing.filter((e) => e.late).length} late, not 4 (one an alternative) and 1: the load was too slow for the closing`);
  if (trail.some((x) => x.at > new Date())) fail("an act is dated after now (X-10 a)");

  const words = [
    `Online sealed bids: ${ref} is the demonstration's online exercise (a demonstration, not for real tenders). Two suppliers bid in time (one replaced its bid), one of them also lodges an alternative, and one bid is received late, so Received shows 3 standing in time, one of them an alternative, plus 1 late.`,
    `The opening officers' unseal passphrases (invented): ${roster.map((r, i) => `${r.person.name}: "${DEMO_UNSEAL_PASSPHRASES[i]}"`).join("; ")}. Sign in as each officer (npm run demo:accounts) and use the passphrase with the sign-in password.`,
  ];
  for (const x of words) console.log(x);
  void shares;
  return { online: true, words, reference: ref };
}

/**
 * The company estimate lodged sealed to the exercise key, written beneath `lodgeEstimate` (plan section 1.5j; the action's own transaction, in its order). The action runs
 * only as a person (it logs the officer in the sealed access log, a foreign key to a person the loader is not), so the loader writes what it writes: the estimate LODGED, the
 * lodging event, the sealed copy by the product's own `writeSealedLodgement`, and the audit rows as the loader. The custodian is the person the event names.
 */
async function lodgeEstimateSealed(db: Db, organisationId: string, exerciseId: string, reference: string, now: Date, entry: Add) {
  const { sealedLodgementFaults } = await import("../src/lib/sealing/estimate-lodgement");
  const { writeSealedLodgement } = await import("../src/lib/scope/estimate-store");
  const { estimateEventAudit, estimateStateAudit, sealedLodgementAudit } = await import("../src/lib/scope/audit-view");
  const { ESTIMATE_STATE_LABEL } = await import("../src/lib/scope/labels");
  const ex = await db.sourcingExercise.findUniqueOrThrow({ where: { id: exerciseId } });
  if (ex.submissionChannel !== "ONLINE") fail(`${reference} is not online`);
  await db.$transaction(async (tx) => {
    const key = await tx.exerciseSealingKey.findFirstOrThrow({ where: { exerciseId, organisationId, retiredAt: null }, select: { id: true, publicKey: true } });
    const faults = sealedLodgementFaults({ liveKeyId: key.id, again: false, reason: "", personId: HOD_CP.id, lodgingOfficerId: null, closing: ex.closingAt, now }).filter((f) => f.level === "block");
    if (faults.length) fail(`the estimate's sealed lodgement would be refused (${faults.map((f) => f.code).join(", ")})`);
    const est = await tx.companyEstimate.findUniqueOrThrow({ where: { id: ESTIMATE }, select: { state: true, currentVersionNo: true } });
    if (est.state !== "DRAFT") fail(`${reference}'s estimate is ${est.state}, not being prepared`);
    await tx.companyEstimate.update({ where: { id: ESTIMATE }, data: { state: "LODGED", lodgedAt: now } });
    const eventId = `${ESTIMATE}e2`;
    await tx.estimateEvent.create({ data: { id: eventId, organisationId, estimateId: ESTIMATE, kind: "LODGED", personId: HOD_CP.id, capacity: "Custodian, Head of Contract & Procurement", versionNo: est.currentVersionNo, copyNo: 1, at: now } });
    const sealed = await writeSealedLodgement(tx as never, { organisationId, exerciseId, estimateId: ESTIMATE, versionNo: est.currentVersionNo, key: { id: key.id, publicKey: new Uint8Array(key.publicKey) }, lodgedByPersonId: HOD_CP.id, supersededReason: `Version ${est.currentVersionNo} was lodged`, now, reader: { organisationId, systemLabel: "demo seed" } });
    entry("CompanyEstimate", ESTIMATE, `${reference} · Company estimate`, "UPDATE", now, estimateStateAudit(ESTIMATE_STATE_LABEL.DRAFT, ESTIMATE_STATE_LABEL.LODGED));
    entry("EstimateEvent", eventId, `${reference} · Company estimate · lodged`, "CREATE", now, estimateEventAudit({ kind: "LODGED", personName: HOD_CP.name, capacity: "Custodian, Head of Contract & Procurement", versionNo: est.currentVersionNo, copyNo: 1 }));
    entry("SealedEstimateLodgement", sealed.lodgementId, `${reference} · Company estimate · sealed copy`, "CREATE", now, sealedLodgementAudit({ versionNo: est.currentVersionNo, lodgedByName: HOD_CP.name, superseded: sealed.superseded }));
  }, { timeout: 60_000, maxWait: 20_000 });
}

/// Poll the database's own clock (`sealed_clock()`'s basis, to the second as a submission's stamp is) until it is past `instant`: the triggers judge in time or late by it, never by this process's clock. A stamp equal to the closing is in time.
async function waitUntilPast(db: Db, instant: Date): Promise<void> {
  for (;;) {
    const [row] = await db.$queryRaw<{ passed: boolean }[]>`SELECT date_trunc('second', clock_timestamp() AT TIME ZONE 'UTC') > (${instant}::timestamp) AS passed`;
    if (row.passed) return;
    await new Promise((r) => setTimeout(r, 2000));
  }
}

/// The officers' shares, written beneath the signed act (see the module's note): each officer's own key pair wrapped by their own passphrase, then the exercise key made across them
/// and split, by the product's own code. The judges of `setOfficerShare` are asked first, and the loader's rows are attributed to it.
async function writeShares(db: Db, organisationId: string, exerciseId: string, reference: string, roster: { id: string; personId: string; seatLabelSnapshot: string; person: { name: string } }[], at: Date, entry: Add) {
  const ex = await db.sourcingExercise.findUniqueOrThrow({ where: { id: exerciseId } });
  const sealing = await db.bidSealingPolicy.findUnique({ where: { organisationId }, select: { onlineSubmission: true } });
  const reading = sealingPepper();
  const pepperFault = pepperForWrapFault(sealing?.onlineSubmission ?? null, reading.status);
  if (pepperFault) fail(`the pepper refuses a share (${pepperFault})`);
  const pepperKey = reading.status === "SET" ? reading.pepper : null;
  const policy = await db.securityPolicy.findUnique({ where: { organisationId }, select: { sealingPassphraseMinLength: true } });
  const wrapped: { rosterId: string; id: string; w: Awaited<ReturnType<typeof makeOfficerKey>>; person: string; seat: string; personId: string }[] = [];
  for (const [i, r] of roster.entries()) {
    const passphrase = DEMO_UNSEAL_PASSPHRASES[i];
    const faults = passphraseFaults(passphrase, passphrase, policy?.sealingPassphraseMinLength ?? null, false);
    if (faults.length) fail(`the demonstration passphrase for ${r.person.name} is refused (${faults.join(", ")})`);
    const facts = await loadCeremony(db as never, organisationId, exerciseId);
    const refused = shareFaults({ channel: ex.submissionChannel, status: ex.status, namedOfficer: facts.roster.some((x) => x.id === r.id && x.personId === r.personId), now: at, closing: ex.closingAt, published: facts.published, hasLiveShare: facts.shareHolderRowIds.includes(r.id), submissions: facts.submissions, substitutionIncoming: false });
    if (refused.length) fail(`a share for ${r.person.name} would be refused (${refused.join(", ")})`);
    const id = `${P}okey${i + 1}`;
    wrapped.push({ rosterId: r.id, id, w: await makeOfficerKey({ organisationId, exerciseId, officerKeyId: id, rosterRowId: r.id, passphrase, pepper: pepperKey }), person: r.person.name, seat: r.seatLabelSnapshot, personId: r.personId });
  }
  let made: { keyId: string; fingerprint: string; officerCount: number } | null = null;
  await db.$transaction(async (tx) => {
    for (const [i, k] of wrapped.entries()) {
      await tx.officerExerciseKey.create({
        data: {
          id: k.id, organisationId, exerciseId, openingOfficerId: k.rosterId, personId: k.personId, publicKey: k.w.publicKey as Uint8Array<ArrayBuffer>, wrappedPrivateKey: k.w.wrappedPrivateKey as Uint8Array<ArrayBuffer>,
          kdfLog2N: k.w.kdfLog2N, kdfR: k.w.kdfR, kdfP: k.w.kdfP, kdfSalt: k.w.kdfSalt as Uint8Array<ArrayBuffer>, pepperId: k.w.pepperId, createdAt: new Date(at.getTime() + i * 60_000),
        },
      });
      entry("OfficerExerciseKey", k.id, `${reference} · Share · ${k.person}`, "CREATE", new Date(at.getTime() + i * 60_000), diffFields(null, { officer: k.person, seat: k.seat, replacedEarlierShare: "no", wrappedWithPepper: k.w.pepperId ? "yes" : "no", keyMadeNow: i === wrapped.length - 1 ? "yes" : "no" }), "Demonstration: the loader set the officer's share with the demonstration passphrase printed in the guide; nobody signed it.");
    }
    made = await makeKeyIfComplete(tx as never, organisationId, exerciseId, new Date(at.getTime() + wrapped.length * 60_000));
  }, { timeout: 120_000, maxWait: 30_000 });
  const key = made as { keyId: string; fingerprint: string; officerCount: number } | null;
  if (!key) return fail(`the key was not made for ${reference}`);
  entry("ExerciseSealingKey", key.keyId, `${reference} · Exercise key`, "CREATE", new Date(at.getTime() + wrapped.length * 60_000), diffFields(null, { keyFingerprint: key.fingerprint, officersHoldingShares: key.officerCount }));
  return key;
}

/**
 * The suppliers' parts and submissions, written beneath the signed act in the order `submitBid` writes them (envelope, bid, parts, files to SUBMITTED, then a replaced bid
 * and its envelope), after the judges `submitFaults` and the upload gate have been asked. The loader's rows: audited as the demo loader, attributed RECORDED_ON_BEHALF to the
 * supplier's account with the demonstration's reason. Nothing here is a supplier's signature.
 */
class Bidding {
  private count = 0;
  constructor(
    private readonly db: Db,
    private readonly organisationId: string,
    private readonly tz: string,
    private readonly exerciseId: string,
    private readonly reference: string,
    private readonly entry: Add,
    private readonly pdf: (lines: readonly string[]) => Buffer,
  ) {}

  async submit(supplierId: string, kind: "BID" | "ALTERNATIVE", declaration: Declaration, o: { parent?: string; replaces?: string } = {}): Promise<string> {
    const { db, organisationId, exerciseId, reference } = this;
    const account = await db.supplierAccount.findFirstOrThrow({ where: { supplierId, organisationId }, select: { id: true } });
    const actor = { supplierId, organisationId };
    const door = await loadDoorFacts(db as never, actor, exerciseId);
    if (!door) return fail(`${supplierId} cannot see ${reference}`);
    const key = door.key ?? fail(`${reference} has no live key`);
    const gate = uploadGateFaults({ channel: door.channel, online: door.online, published: door.published, cancelled: door.cancelled, keyLive: true, fingerprintMatches: door.fingerprintMatches, saleStands: door.saleStands, invitedPath: door.invitedPath, onInviteeList: door.onInviteeList, mainOpeningStartedAt: door.mainOpeningStartedAt });
    if (gate.length) fail(`${supplierId}'s parts would be refused (${gate.join(", ")})`);
    const rules: BidPartRule[] = door.rules ?? fail(`${reference} froze no upload rules`);
    const returned = rules.filter((r) => r.returnedByBidder);
    const blob = blobStore();
    if ("fault" in blob) return fail("the document store is not set up");
    const scan = storedScan("NOT_SCANNED", door.mode ?? "DEMONSTRATION", false) ?? fail("a demonstration part is refused for its scan");

    // The parts: each sealed to the exercise key and kept as a draft.
    const files: { id: string; packPartId: string; cipherSha256: string }[] = [];
    for (const r of returned) {
      const fileId = randomUUID();
      const filename = `${r.label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.pdf`;
      const plain = new Uint8Array(this.pdf([`${r.label}, ${reference}`, `Part returned by ${supplierId} (demo, sealed).`, `Declared: ${declaration.price}`]));
      const sealed = sealFile({
        context: { organisationId, exerciseId, keyId: key.id, fileId, packPartId: r.packPartId },
        exercisePublicKey: key.publicKey,
        plain,
        meta: { v: 1, filename, mediaType: "application/pdf", plainSha256: sha256Hex(plain), plainBytes: String(plain.byteLength) },
      });
      const cipherSha256 = sha256Hex(sealed.cipher);
      await db.$transaction(async (tx) => {
        await blob.store.put(tx as never, organisationId, cipherSha256, sealed.cipher);
        await tx.onlineBidFile.create({
          data: {
            id: fileId, organisationId, exerciseId, keyId: key.id, supplierId, uploadedBySupplierAccountId: account.id, packPartId: r.packPartId, cipherSha256, cipherBytes: BigInt(sealed.cipher.byteLength),
            sealedDek: sealed.sealedDek as Uint8Array<ArrayBuffer>, sealedMeta: sealed.sealedMeta as Uint8Array<ArrayBuffer>, bodyIv: sealed.bodyIv as Uint8Array<ArrayBuffer>, scan, state: "DRAFT", uploadedAt: new Date(),
          },
        });
      }, { timeout: 60_000, maxWait: 20_000 });
      files.push({ id: fileId, packPartId: r.packPartId, cipherSha256 });
    }

    const [{ stamp }] = await db.$queryRaw<{ stamp: Date }[]>`SELECT date_trunc('second', clock_timestamp() AT TIME ZONE 'UTC') AS stamp`;
    const onlineBidId = randomUUID();
    const envelopeId = randomUUID();
    await db.$transaction(async (tx) => {
      if (!(await lockExerciseSide(tx as never, organisationId, exerciseId))) fail(`${reference} could not be locked`);
      await lockEnvelopeRows(tx as never, exerciseId);
      const mine = await tx.onlineBid.findMany({ where: { exerciseId, organisationId, supplierId }, select: { id: true, kind: true, status: true } });
      const byId = new Map(mine.map((b) => [b.id, b]));
      const window = await tx.exerciseWindow.findFirst({ where: { exerciseId, organisationId }, select: { alternativesPermitted: true } });
      const closing = door.ctx.ex.closingAt ?? fail(`${reference} has no closing`);
      const replaced = o.replaces ? byId.get(o.replaces) : null;
      const parent = o.parent ? byId.get(o.parent) : null;
      const judged = submitFaults({
        channel: door.channel, online: door.online, published: door.published, cancelled: door.cancelled, keyLive: door.fingerprintMatches, saleStands: door.saleStands, invitedPath: door.invitedPath, onInviteeList: door.onInviteeList,
        stamp, closing, mainOpeningStartedAt: door.mainOpeningStartedAt, liveMainStanding: mine.some((b) => b.kind === "BID" && b.status === "SUBMITTED"), kind,
        replaces: o.replaces ? (replaced ? { status: replaced.status, mine: true, kind: replaced.kind } : { status: "SUBMITTED", mine: false, kind }) : null,
        parent: o.parent ? (parent ? { status: parent.status, mine: true, kind: parent.kind } : null) : "NONE_NAMED",
        alternativesPermitted: window?.alternativesPermitted ?? null,
        files: files.map((f) => ({ mine: true, state: "DRAFT" as const, packPartId: f.packPartId })), rules, submissionsBySupplier: mine.length,
      });
      if (judged.faults.length) fail(`${supplierId}'s ${kind === "BID" ? "bid" : "alternative"} would be refused (${judged.faults.join(", ")})`);

      const sequence = ((await tx.bidEnvelope.aggregate({ where: { exerciseId, organisationId }, _max: { sequence: true } }))._max.sequence ?? 0) + 1;
      const sealed = sealSubmission({
        context: { organisationId, exerciseId, keyId: key.id, onlineBidId },
        exercisePublicKey: key.publicKey,
        declaration,
        manifest: { v: 1, exerciseId, onlineBidId, supplierId, supplierAccountId: account.id, kind, parentOnlineBidId: o.parent ?? null, replacesOnlineBidId: o.replaces ?? null, files: files.map((f) => ({ fileId: f.id, packPartId: f.packPartId, cipherSha256: f.cipherSha256 })) },
      });
      const digest = receiptDigest({ exerciseId, submissionNumber: mine.length + 1, receivedAt: stamp, keyFingerprint: key.fingerprint, manifestCipherSha256: sealed.manifestCipherSha256, declarationCipherSha256: sealed.declarationCipherSha256, fileCipherSha256s: files.map((f) => f.cipherSha256) });
      const envelope = await tx.bidEnvelope.create({ data: { id: envelopeId, organisationId, exerciseId, sequence, kind, channel: "ONLINE", receivedAt: stamp, receivedSource: "PORTAL", markings: "", late: judged.late, recordedAfterClosing: judged.late, closingAtJudged: closing }, select: { late: true, receivedAt: true } });
      await tx.onlineBid.create({
        data: {
          id: onlineBidId, organisationId, exerciseId, keyId: key.id, envelopeId, supplierId, submittedBySupplierAccountId: account.id, kind, parentOnlineBidId: o.parent ?? null, replacesOnlineBidId: o.replaces ?? null,
          sealedManifest: sealed.sealedManifest as Uint8Array<ArrayBuffer>, manifestDek: sealed.manifestDek as Uint8Array<ArrayBuffer>, manifestCipherSha256: sealed.manifestCipherSha256,
          sealedDeclaration: sealed.sealedDeclaration as Uint8Array<ArrayBuffer>, declarationDek: sealed.declarationDek as Uint8Array<ArrayBuffer>, declarationCipherSha256: sealed.declarationCipherSha256, receiptDigest: digest,
        },
      });
      await tx.onlineBidPart.createMany({ data: files.map((f) => ({ organisationId, onlineBidId, fileId: f.id })) });
      const taken = await tx.onlineBidFile.updateMany({ where: { id: { in: files.map((f) => f.id) }, state: "DRAFT", supplierId }, data: { state: "SUBMITTED" } });
      if (taken.count !== files.length) fail("a part was not waiting to be submitted");
      if (replaced) {
        await tx.onlineBid.update({ where: { id: replaced.id }, data: { status: "REPLACED", statusAt: envelope.receivedAt } });
        const old = await tx.onlineBid.findUniqueOrThrow({ where: { id: replaced.id }, select: { envelopeId: true } });
        await tx.bidEnvelope.update({ where: { id: old.envelopeId }, data: { status: "SUPERSEDED" } });
        await tx.onlineBid.updateMany({ where: { parentOnlineBidId: replaced.id, status: "SUBMITTED", supplierId }, data: { parentOnlineBidId: onlineBidId } });
      }
      // Attributed to the supplier's account on the loader's behalf, never signed: nobody entered a password.
      const request: AttributionRequest = {
        entity: "OnlineBid", entityId: onlineBidId, slot: "submittedBy",
        subject: { kind: "SUPPLIER_ACCOUNT", supplierAccountId: account.id }, recorder: { kind: "SYSTEM", label: DEMO_ACTOR.actorSystemLabel },
        mode: "RECORDED_ON_BEHALF", reason: DEMO_ATTRIBUTION_REASON, document: { entity: "OnlineBid", id: onlineBidId },
      };
      const faults = attributionFaults(request);
      if (faults.length) fail(`the submission's attribution is refused (${faults.map((f) => f.code).join(", ")})`);
      await tx.actAttribution.create({ data: { id: `${P}laaonline_${onlineBidId}`, organisationId, ...attributionRow(request), occurrence: 1 } });
      const at = new Date();
      await tx.auditEntry.createMany({
        data: [
          {
            id: `${P}olbid${++this.count}`, organisationId, entity: "OnlineBid", entityId: onlineBidId, entityLabel: `${reference} · online submission (sealed)`, action: "CREATE", at,
            changes: diffFields(null, {
              exercise: exerciseId, kind: kind === "BID" ? "Bid" : "Alternative bid", portalOrderOfReceipt: sequence, received: formatOrgDateTime(envelope.receivedAt, this.tz), lateness: envelope.late ? "Received after the closing" : "Received in time",
              keyId: key.id, parts: String(files.length), replaces: o.replaces ?? null, parent: o.parent ?? null, manifestCipherSha256: sealed.manifestCipherSha256, declarationCipherSha256: sealed.declarationCipherSha256, receiptDigest: digest, status: "Standing",
            }),
            reason: "Demonstration: the loader made this submission for the supplier's account; nobody signed it.", ...DEMO_ACTOR,
          },
          ...(replaced
            ? [{ id: `${P}olbid${++this.count}`, organisationId, entity: "OnlineBid", entityId: replaced.id, entityLabel: `${reference} · online submission replaced`, action: "UPDATE" as const, at, changes: diffFields({ status: "Standing" }, { status: "Replaced", replacedBy: onlineBidId }), reason: "", ...DEMO_ACTOR }]
            : []),
        ] as never,
      });
    }, { timeout: 90_000, maxWait: 20_000 });
    return onlineBidId;
  }
}
