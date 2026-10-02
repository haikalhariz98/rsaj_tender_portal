/**
 * Demo data for 64-C4 (6.4 Q-1 B, BD-64-40): an award whose terms open from the frozen tender
 * Appendix, with one justified difference. Invented throughout; the figures and the reason are
 * ASSUMED, none is a customer's (X-10 d).
 *
 * - demo_aw7 on demo_sx16 (open tender; its documents approved in 6.4's demo with the Appendix
 *   frozen at 0.05% of the contract sum a day, 12 months' defects liability, a 10% works uplift,
 *   and the regulated activity answered yes; its window closed in 6.5's demo). Opened for an
 *   invented RM612,450.30 through the checks the open act runs (the exercise open for an award,
 *   no other live award, the instrument set, the value faults, the award series), its terms
 *   pre-filled by `prefill`: RM306.23 per day (0.05% of the awarded sum, half up), 12 months, yes.
 *   Then the terms are saved with the defects liability period at 18 months and its reason, judged
 *   by `reasonsOnSave` as the terms act judges it. A draft: nothing is sent for approval.
 *
 * Every act is dated on the load day, before now and after sx16's closing (X-10 a). The wipe needs
 * nothing new: `wipeAwards` removes every award on a demo exercise with its trail.
 */

import type { PrismaClient } from "../src/generated/prisma/client";

const P = "demo_";
export const APPENDIX_AWARD = `${P}aw7`;
const EXERCISE = `${P}sx16`;
const VALUE = "612450.30";
const DLP_STATED = 18;
const REASON = "Invented for the demo: the tenderer offered an 18-month defects liability period at tender clarification, and the evaluation accepted it.";

type Db = PrismaClient;

export async function loadAppendixAward(db: Db) {
  const { regimeFor } = await import("../src/lib/authority/resolve");
  const { BASELINE_FIELDS, baselineOf, differences, prefill, REASON_COLUMN, reasonsOnSave } = await import("../src/lib/award/appendix-baseline");
  const { appointmentRoute } = await import("../src/lib/award/appointment");
  const { awardAuditCreate, awardAuditPair } = await import("../src/lib/award/audit-view");
  const { exerciseOpenForAward } = await import("../src/lib/award/gate");
  const { awardValueFaults, instrumentFor } = await import("../src/lib/award/instrument");
  const { frozenTenderOf, loadAwardPolicy } = await import("../src/lib/award/repo");
  const { LIVE_STATUSES } = await import("../src/lib/award/status");
  const { dayToDate } = await import("../src/lib/dates");
  const { approvedRouteOf, evaluationContext, loadExercise } = await import("../src/lib/method/repo");
  const { parseSen, senFromDecimal, senToDecimalString } = await import("../src/lib/money");
  const { issueReference } = await import("../src/lib/numbering/issue");
  const { readWindowGate } = await import("../src/lib/window/repo");
  const fail = (what: string): never => {
    throw new Error(`Demo 64-C4: ${what}`);
  };

  const l = (await loadExercise(EXERCISE)) ?? fail("sx16 is not loaded.");
  const { org, ex, req } = l;
  if (!org.today) fail("the organisation's time zone is not set.");
  const now = new Date();
  const openedAt = new Date(now.getTime() - 90 * 60_000);
  const savedAt = new Date(now.getTime() - 60 * 60_000);
  if (!ex.closingAt || ex.closingAt >= openedAt) fail("sx16 did not close before the award is opened.");

  // The open act's checks (createAward), on the rows as they stand.
  const gate = await readWindowGate(ex, org.timeZone);
  if (!exerciseOpenForAward(ex.status, ex.packKindSnapshot, gate)) fail("sx16 is not open for an award.");
  if (await db.award.findFirst({ where: { exerciseId: ex.id, status: { in: [...LIVE_STATUSES] } } })) fail("sx16 already has a live award.");
  const chosen = instrumentFor(ex.regime, await loadAwardPolicy(org.id));
  const instrument = "kind" in chosen ? chosen : fail(`no instrument for the exercise's band (${chosen.fault}).`);
  const { cfg, ctx } = await evaluationContext(org, req, ex);
  if (!ctx) fail("no approval matrix is in force.");
  const value = parseSen(VALUE);
  const method = cfg.config.methods.find((m) => m.code === ex.sourcingMethodCode) ?? null;
  const route = appointmentRoute(ctx!.funder, method, Number(senToDecimalString(value)), { absentRoleCodes: [], requesterHolds: () => false });
  const siblings = await db.award.findMany({ where: { exercise: { requisitionId: req.id }, status: { in: [...LIVE_STATUSES] } }, select: { awardedValue: true } });
  const blocks = awardValueFaults({
    value,
    estimate: senFromDecimal(ex.estimatedValue),
    exerciseRegime: ex.regime,
    exerciseRuleKey: ex.appointmentRuleKey,
    exerciseRuleLabel: null,
    freshRegime: regimeFor(Number(senToDecimalString(value)), ctx!.funder.dal.policy),
    freshRuleKey: route.ruleKey,
    freshRuleLabel: route.ruleLabel,
    approvedValue: approvedRouteOf({ approvalInstances: req.approvalInstances })?.value ?? null,
    otherAwards: siblings.map((s) => senFromDecimal(s.awardedValue)),
  }).filter((f) => f.level === "block");
  if (blocks.length) fail(`the awarded value is refused (${blocks.map((b) => b.code).join(", ")}).`);

  // The frozen tender, and the terms it opens with.
  const tender = (await frozenTenderOf(ex.id, org.timeZone)) ?? fail("sx16 has no frozen Appendix.");
  const baseline = baselineOf(tender, value);
  const filled = prefill(baseline);
  if (filled.ladAmount == null || filled.dlpMonths == null || filled.regulatedActivity == null) fail("the Appendix does not state damages, defects liability and the regulated answer.");

  const reference = await db.$transaction((tx) => issueReference(tx, org.id, "award", dayToDate(org.today!)));
  const label = `${reference} · Demo Network Builders Sdn Bhd`;
  const row = await db.award.create({
    data: {
      id: APPENDIX_AWARD, organisationId: org.id, reference, exerciseId: ex.id, instrumentKind: instrument.kind,
      awardeeName: "Demo Network Builders Sdn Bhd", awardeeRegistrationNo: "DEMO-0007-X", awardeeAddress: "7 Demo Road, Demo North",
      awardedValue: senToDecimalString(value), completionPeriod: 12, completionUnit: "MONTHS",
      ladAmount: senToDecimalString(filled.ladAmount!), ladUnit: filled.ladUnit!, dlpMonths: filled.dlpMonths, regulatedActivity: filled.regulatedActivity,
      createdAt: openedAt,
    },
  });

  // The terms act: the defects liability period stated otherwise, with its reason.
  const after = { dlpMonths: DLP_STATED, termsProvenance: "ASSUMED" as const };
  const stated = { ladAmount: filled.ladAmount!, ladUnit: filled.ladUnit!, dlpMonths: DLP_STATED, regulatedActivity: filled.regulatedActivity! };
  const { reasons, missing } = reasonsOnSave(baseline, stated, new Set(BASELINE_FIELDS), { dlp: REASON }, {});
  if (missing.length) fail(`the terms save would be refused (${missing.join(", ")}).`);
  const reasonCols = Object.fromEntries(BASELINE_FIELDS.map((f) => [REASON_COLUMN[f], reasons[f]]));
  const saved = await db.award.update({ where: { id: APPENDIX_AWARD }, data: { ...after, ...reasonCols, updatedAt: savedAt } });
  const diffs = differences(baseline, stated, reasons);
  if (diffs.length !== 1 || diffs[0].field !== "dlp" || !diffs[0].reason) fail("the award does not show exactly one justified difference.");

  await db.auditEntry.createMany({
    data: [
      { id: `${APPENDIX_AWARD}_au1`, organisationId: org.id, entity: "Award", entityId: row.id, entityLabel: label, action: "CREATE", at: openedAt, changes: awardAuditCreate(row, { exercise: ex.reference, instrument: instrument.kind, termsFrom: `the tender Appendix, documents version ${tender.packVersion}` }) as never, reason: "", unattributed: true },
      { id: `${APPENDIX_AWARD}_au2`, organisationId: org.id, entity: "Award", entityId: row.id, entityLabel: label, action: "UPDATE", at: savedAt, changes: awardAuditPair(row, saved) as never, reason: "", unattributed: true },
    ],
  });
}

/**
 * Read back as the product reads it: the award opens on a frozen Appendix, the damages are the
 * percentage at the awarded sum, exactly one term differs and it carries its reason, so nothing
 * about the Appendix stands in the way of its issue.
 */
export async function checkAppendixAward() {
  const { evaluateAward } = await import("../src/lib/award/evaluate");
  const { awardFacts, loadAward } = await import("../src/lib/award/repo");
  const { parseSen } = await import("../src/lib/money");
  const fail = (what: string): never => {
    throw new Error(`Demo 64-C4: ${what}`);
  };
  const l = (await loadAward(APPENDIX_AWARD)) ?? fail("demo_aw7 did not load.");
  const ev = evaluateAward((await awardFacts(l)).facts);
  if (!ev.appendix) fail("demo_aw7 reads no frozen Appendix.");
  if (ev.appendix!.baseline.lad?.sen !== parseSen("306.23")) fail("demo_aw7's damages are not 0.05% of the awarded sum (RM306.23).");
  const d = ev.appendix!.differences;
  if (d.length !== 1 || d[0].field !== "dlp" || !d[0].reason) fail("demo_aw7 does not show one justified difference.");
  if (ev.issueFaults.some((f) => f.code === "APPENDIX_DIFFERENCE_UNEXPLAINED")) fail("demo_aw7's difference would refuse issue.");
  if (ev.submitFaults.some((f) => f.level === "block" && ["EXERCISE_WINDOW_NOT_CLOSED", "WINDOW_CHANGE_PENDING", "NOT_DRAFT"].includes(f.code))) fail("demo_aw7 could not go for approval on its exercise.");
}
