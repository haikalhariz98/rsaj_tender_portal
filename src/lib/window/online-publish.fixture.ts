import { dayIn, dayPlus, dayToDate, instantAt, isoWeekday } from "@/lib/dates";
import { db } from "@/lib/db";
import { randomId } from "@/lib/test-db/auth-fixtures";

/**
 * Test-only builder for `publish-online.db.test.ts` (wave 3c step 1, rulings 20br and 20cl): an organisation of its own holding the editor-settable configuration an online
 * publication reads, and one ONLINE exercise ready to be approved for tendering (the test records the approval itself). Every name, number and text is invented for the test; none is a customer's policy, and none is ever seeded.
 *
 * It makes the test day a working day whatever day it runs. The product reads an empty weekend as "not set" and refuses to publish on it (WEEKEND_NOT_SET), so the calendar's weekend is
 * two ISO weekdays that are none of the days the test uses (today, the purchase close and the closing); the calendar has no holiday and a complete year for every year from last year to the
 * year after the closing. The closing is a month out, so no midnight crossing can matter. The test therefore holds no day check of its own.
 *
 * What it does not make: the officers' shares and the key. Those are made by the product's own ceremony act in the test (`setOfficerShare`), because that is what is being proved.
 */

export const TIME_ZONE = "Asia/Kuala_Lumpur";
const PART_CODE = "test_form_of_tender";

export interface PublishableOnline {
  organisationId: string;
  exerciseId: string;
  reference: string;
  partCode: string;
  today: string;
  closingDay: string;
  packId: string;
  /// The closing the approval will record, which the TEST records (the approving step is the only writer of the closing, and a scan holds the product to that).
  closes: Date;
}

export async function buildPublishableOnline(now: Date = new Date()): Promise<PublishableOnline> {
  const today = dayIn(now, TIME_ZONE);
  const closingDay = dayPlus(today, 30);
  const closes = instantAt(closingDay, "14:30", TIME_ZONE)!;
  const tag = randomId();
  const org = await db.organisation.create({ data: { code: `OP_${tag}`, name: `Online publish ${tag}`, timeZone: TIME_ZONE } });
  const organisationId = org.id;

  // Calendar: a weekend that falls on none of the days used, no holiday, every year to be read complete.
  const used = new Set([today, dayPlus(today, 20), closingDay].map(isoWeekday));
  const weekendDays = [1, 2, 3, 4, 5, 6, 7].filter((n) => !used.has(n)).slice(-2);
  const calendar = await db.holidayCalendar.create({ data: { organisationId, code: "cal", name: "Test calendar", weekendDays, weekendProvenance: "ASSUMED", provenance: "ASSUMED" } });
  for (let year = Number(today.slice(0, 4)) - 1; year <= Number(closingDay.slice(0, 4)) + 1; year++) {
    await db.holidayCalendarYear.create({ data: { organisationId, calendarId: calendar.id, year, complete: true, source: "test", provenance: "ASSUMED" } });
  }

  // The notice template, the publication channel, the evaluation model and the contract basis that names its route.
  const notice = await db.documentTemplate.create({
    data: {
      organisationId,
      code: "notice",
      nameEn: "Test notice",
      bodyEn:
        "{{organisation.name}}\n\nNOTICE: {{exercise.title}} ({{exercise.reference}}), advertised {{window.advertisedOn}}.\n\nRegistrations: {{eligibility.registration}}, valid {{eligibility.window}}.\n\nInspect at {{window.inspectionPlace}}, buy at {{window.purchasePlace}}, {{window.inspectionHours}}, from {{window.purchaseFrom}} to {{window.purchaseClose}}. Fee {{window.fee}} by {{window.feePaymentMethods}}.\n\nBriefing: {{window.briefing}}. Site visit: {{window.siteVisit}}.\n\nDelivered to {{window.submissionPlace}} by {{window.closing}}.",
      primaryLanguage: "EN",
      bodyVersion: 1,
    },
  });
  const channel = await db.publicationChannel.create({ data: { organisationId, code: "ch1", nameEn: "Test gazette", requiredWhenAdvertised: true, provenance: "ASSUMED" } });
  const model = await db.evaluationModel.create({ data: { organisationId, code: "model", version: 1, nameEn: "Test model", route: "TRADITIONAL", status: "ISSUED", issuedAt: now, contentSnapshot: { v: 1 }, provenance: "ASSUMED" } });
  await db.contractBasis.create({ data: { organisationId, code: "basis", nameEn: "Test basis", evaluationRoute: "TRADITIONAL", evaluationRouteProvenance: "ASSUMED" } });
  await db.sourcingMethod.create({
    data: {
      organisationId,
      code: "open",
      nameEn: "Test open method",
      availableInTender: true,
      requiresAdvertisement: true,
      invitesNamedSuppliers: false,
      documentPackKind: "TENDER",
      defaultEvaluationModelCode: "model",
      minimumBids: 1,
      minimumBidsProvenance: "ASSUMED",
      completenessEliminates: false,
      completenessProvenance: "ASSUMED",
    },
  });
  await db.tenderDocumentPart.create({
    data: { organisationId, code: PART_CODE, packKind: "TENDER", printedNumber: "1", sortOrder: 1, labelEn: "Form of tender", role: "FORM_OF_TENDER", content: "STANDARD", source: "UPLOAD", mandatory: true, returnedByBidder: true, returnedByBidderProvenance: "ASSUMED", bidAcceptedMediaTypes: ["application/pdf"], bidMaxBytes: BigInt(5_000_000), openingCheck: true, openingCheckProvenance: "ASSUMED", provenance: "ASSUMED" },
  });

  // The organisation's rules: window policy (every rule given), the sealing switch for a demonstration deployment, the channel pinned ONLINE and counter sales.
  await db.documentFeeFloor.create({ data: { organisationId, regime: "tender", minimum: "10.00", provenance: "ASSUMED" } });
  await db.windowPolicy.create({
    data: {
      organisationId,
      minAdvertisementDays: 7,
      targetAdvertisementDays: 14,
      newspaperWarnDays: 2,
      purchaseCutoffDays: 1,
      dateRulesProvenance: "ASSUMED",
      defaultClosingTime: "14:30",
      closingTimeProvenance: "ASSUMED",
      advertisementDayRule: "LATEST_REQUIRED_CHANNEL",
      dayRuleProvenance: "ASSUMED",
      calendarId: calendar.id,
      mandatoryAttendancePermitted: false,
      attendanceProvenance: "ASSUMED",
      documentSaleMode: "COUNTER",
      submissionChannel: "ONLINE",
      noticeTemplateId: notice.id,
      dateRuleSource: "test",
    },
  });
  await db.bidSealingPolicy.create({ data: { organisationId, onlineSubmission: "DEMONSTRATION", provenance: "ASSUMED" } });

  // The requisition, the exercise approved for tendering with its approved pack, the registration it needs, and the window with a recorded publication.
  const requester = await db.person.create({ data: { organisationId, name: `Requester ${tag}` } });
  const requisition = await db.requisition.create({
    data: { organisationId, reference: `OP/REQ/${tag}`, requestingUnitCode: "D", requestingPersonId: requester.id, title: "R", justification: "t", needStatement: "t", costCentreCode: "C", accountCode: "A", placeOfDelivery: "x", dateRequired: dayToDate(dayPlus(today, 200)), estimatedValue: "1000.00", raisedOn: dayToDate(today) },
  });
  const reference = `OP/EX/${tag}`;
  const exercise = await db.sourcingExercise.create({
    data: {
      organisationId,
      reference,
      requisitionId: requisition.id,
      title: "Online sealed bids",
      estimatedValue: "1000.00",
      sourcingMethodCode: "open",
      status: "DOCUMENTS_IN_PREPARATION",
      packKindSnapshot: "TENDER",
      contractBasisCode: "basis",
      evaluationModelId: model.id,
      restrictedTender: false,
      regime: "tender",
      saleMode: "COUNTER",
      submissionChannel: "ONLINE",
    },
  });
  const pack = await db.tenderPack.create({
    data: { organisationId, exerciseId: exercise.id, versionNo: 1, status: "DRAFT", packKind: "TENDER", contractBasisCode: "basis", compositionSnapshot: {} },
  });
  await db.tenderPackPart.create({
    data: { organisationId, packId: pack.id, partCode: PART_CODE, printedNumber: "1", sortOrder: 1, labelSnapshot: "Form of tender", role: "FORM_OF_TENDER", content: "STANDARD", source: "UPLOAD", mandatory: true, returnedByBidder: true, returnedByBidderProvenance: "ASSUMED", state: "READY" },
  });
  await db.exerciseRegistrationRequirement.create({ data: { organisationId, exerciseId: exercise.id, bodyCode: "body", bodyLabelSnapshot: "Test registration body", qualifiers: "any grade" } });
  const window = await db.exerciseWindow.create({
    data: {
      organisationId,
      exerciseId: exercise.id,
      path: "ADVERTISED",
      inspectionPlace: "Test office",
      purchasePlace: "Test counter",
      inspectionHours: "09:00 to 16:00",
      purchaseFromDay: dayToDate(today),
      purchaseCloseDay: dayToDate(dayPlus(today, 20)),
      feeAmount: "50.00",
      feePaymentMethods: "cash",
      submissionPlace: "Online, through the supplier portal",
      bidValidityDays: 90,
      bidValidityProvenance: "ASSUMED",
      alternativesPermitted: false,
    },
  });
  const recorder = await db.person.create({ data: { organisationId, name: `Recorder ${tag}` } });
  await db.publicationRecord.create({ data: { organisationId, windowId: window.id, channelId: channel.id, channelName: channel.nameEn, publishedOn: dayToDate(today), reference: "page 1", recordedByPersonId: recorder.id } });

  return { organisationId, exerciseId: exercise.id, reference, partCode: PART_CODE, packId: pack.id, today, closingDay, closes };
}
