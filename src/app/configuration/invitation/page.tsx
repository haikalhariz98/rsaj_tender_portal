import Link from "next/link";
import type { ReactNode } from "react";

import { HistoryButton } from "@/components/history-drawer";
import { ClockIcon, FileIcon, SlidersIcon } from "@/components/icons";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Callout, EmptyState } from "@/components/ui/feedback";
import { PageHeader } from "@/components/ui/page-header";
import { RULE_LABEL } from "@/lib/window/labels";
import { ProvenanceBadge } from "@/components/ui/provenance";
import { KeyValues } from "@/components/ui/stat";
import { ActionsCol, CellStack, RowActions, Table, Td, Th, THead, Tr } from "@/components/ui/table";
import { db } from "@/lib/db";
import { REGIME_LABEL } from "@/lib/method/labels";
import { senToDecimalString, parseSen } from "@/lib/money";
import { invitationConfig } from "@/lib/window/read";
import { BID_RULE_UNSET, BID_RULES_APPLY_TEXT, bidRulesNotSet, invitationBadge } from "@/lib/bids/config";
import { OPENING_RULE_UNSET, OPENING_RULES_APPLY_TEXT, openingPolicyNotSet, openingRulesNotSet } from "@/lib/opening/config";
import { PRODUCT_SUMMARY_LABELS } from "@/lib/opening/grand-summary";
import { saleModeWords } from "@/lib/window/sale-mode";
import { INVITED_READING_LABEL, UNPURCHASED_LABEL } from "@/lib/opening/labels";

import { CalendarDrawer, ChannelDrawer, EditMethodBidRule, EditMethodOpeningRule, EditOpeningPolicy, EditWindowPolicy, FloorDrawer, HolidayDrawer, ImportYearDrawer, RemoveFloorDrawer, RemoveHolidayDrawer, RetireCalendarDrawer, RetireChannelDrawer, YearDrawer } from "./editors";
import { requireStaff } from "@/app/_auth/actor";
import { simulatorAllowedByDeployment } from "@/lib/integration/payment-deployment";

export const dynamic = "force-dynamic";

/// What a setting leaves undecided while it is unset: said beside "Not set", never a zero.
const UNSET = {
  min: "No minimum window is set, so no exercise can be published.",
  target: "No target is set, so a short window is not warned about.",
  margin: "No margin is set: a late newspaper is not warned about.",
  cutoff: "No cut-off is set, so the last day of sale cannot be checked.",
  time: "No closing time is set, so no closing can be recorded as on time.",
  dayRule: "Which publication day is the advertisement day is undecided, so no advertised exercise can be published.",
  calendar: "No calendar is chosen, so a closing cannot be checked against weekends and public holidays.",
  attendance: "No event may be made mandatory, and no sale is refused for missing one.",
  template: "Its text cannot be produced, so the act that needs it is held back.",
} as const;

function Setting({ value, unset, source }: { value: string; unset: string; source?: string | null }) {
  if (value.startsWith("Not set")) {
    return (
      <span className="flex flex-col items-start gap-1.5">
        <Badge tone="warn">Not set</Badge>
        <span className="text-[12.5px] text-ink-3">{unset}</span>
      </span>
    );
  }
  return (
    <span className="flex flex-col items-start gap-1.5">
      <span className="break-words">{value}</span>
      {source !== undefined && <ProvenanceBadge value={source} />}
    </span>
  );
}

const tri = (v: boolean | null | undefined) => (v === true ? "yes" : v === false ? "no" : "unset");
const days = (n: number | null | undefined) => (n == null ? "Not set" : `${n} day${n === 1 ? "" : "s"}`);

export default async function InvitationControlsPage() {
  const actor = await requireStaff();
  const c = await invitationConfig(actor.organisationId);
  if (!c) {
    return (
      <>
        <PageHeader title="Invitation controls" subtitle="The rules for advertising, inviting, selling the documents and closing." />
        <Card>
          <EmptyState title="No organisation is configured">Run the setup first.</EmptyState>
        </Card>
      </>
    );
  }
  const org = await db.organisation.findUnique({ where: { code: actor.organisationCode }, select: { id: true } });
  const [row, rawChannels, rawFloors, rawCalendars, bidMethods, committees, openingPolicy] = org
    ? await Promise.all([
        db.windowPolicy.findUnique({ where: { organisationId: org.id } }),
        db.publicationChannel.findMany({ where: { organisationId: org.id } }),
        db.documentFeeFloor.findMany({ where: { organisationId: org.id } }),
        db.holidayCalendar.findMany({ where: { organisationId: org.id }, include: { holidays: { select: { id: true, day: true } }, years: { select: { id: true } } } }),
        // 6.6: the methods that receive bids (a tender or quotation pack), with their bid-receipt rules.
        db.sourcingMethod.findMany({ where: { organisationId: org.id, retiredOn: null, documentPackKind: { in: ["TENDER", "QUOTATION"] } }, orderBy: [{ sortOrder: "asc" }, { nameEn: "asc" }], select: { id: true, nameEn: true, lateAdmissionCommitteeCode: true, lateAdmissionProvenance: true, minimumBids: true, minimumBidsProvenance: true, completenessEliminates: true, completenessProvenance: true, openingCommitteeCode: true, openingCommitteeProvenance: true, unpurchasedBidConsequence: true, unpurchasedProvenance: true } }),
        db.committee.findMany({ where: { organisationId: org.id }, orderBy: { nameEn: "asc" }, select: { code: true, nameEn: true, retiredOn: true } }),
        // 6.7: the opening policy (OD-9) and the Grand Summary's words.
        db.openingPolicy.findUnique({ where: { organisationId: org.id } }),
      ])
    : [null, [], [], [], [], [], null];
  const p = c.policy.values;
  // Phase 4d: the online release of the documents is read beside the window rules, not through `WindowPolicyFacts` (no window rule reads it).
  const release = await db.windowPolicy.findUnique({ where: { organisationId: actor.organisationId }, select: { electronicDocumentRelease: true, electronicReleaseProvenance: true, documentSaleMode: true, paymentSimulatorOn: true, simulatedPaymentMethods: true } });
  const rule = (label: string) => c.policy.rules.find((r) => r.label === label)!;
  const named = <T extends { id: string }>(xs: T[], id: string | null) => xs.find((x) => x.id === id);
  const channelOptions = c.channels.filter((x) => !x.retired).map((x) => ({ value: x.id, label: x.nameEn }));
  const calendarOptions = c.calendars.filter((x) => !x.retired).map((x) => ({ value: x.id, label: x.name }));
  const templateOptions = c.templates.map((t) => ({ value: t.id, label: t.hasText ? t.name : `${t.name} (no text written yet)` }));
  const policyValues: Record<string, string> = {
    minAdvertisementDays: p.minAdvertisementDays == null ? "" : String(p.minAdvertisementDays),
    targetAdvertisementDays: p.targetAdvertisementDays == null ? "" : String(p.targetAdvertisementDays),
    newspaperWarnDays: p.newspaperWarnDays == null ? "" : String(p.newspaperWarnDays),
    purchaseCutoffDays: p.purchaseCutoffDays == null ? "" : String(p.purchaseCutoffDays),
    dateRulesProvenance: p.dateRulesProvenance ?? "",
    dateRuleSource: p.dateRuleSource,
    defaultClosingTime: p.defaultClosingTime ?? "",
    closingTimeProvenance: p.closingTimeProvenance ?? "",
    advertisementDayRule: p.advertisementDayRule ?? "",
    advertisementChannelId: p.advertisementChannelId ?? "",
    dayRuleProvenance: p.dayRuleProvenance ?? "",
    calendarId: p.calendarId ?? "",
    mandatoryAttendancePermitted: tri(p.mandatoryAttendancePermitted),
    attendanceProvenance: p.attendanceProvenance ?? "",
    electronicDocumentRelease: tri(release?.electronicDocumentRelease),
    electronicReleaseProvenance: release?.electronicReleaseProvenance ?? "",
    documentSaleMode: release?.documentSaleMode ?? "unset",
    paymentSimulatorOn: tri(release?.paymentSimulatorOn),
    paymentMethodsText: (release?.simulatedPaymentMethods ?? []).join("\n"),
    noticeTemplateId: p.noticeTemplateId ?? "",
    invitationTemplateId: p.invitationTemplateId ?? "",
    addendumTemplateId: p.addendumTemplateId ?? "",
    notes: row?.notes ?? "",
  };
  const setting = (label: string, node: ReactNode) => ({ label, value: node });
  const r = {
    min: rule("Minimum days from advertisement to closing"),
    time: rule("Default closing time"),
    day: rule("Advertisement day"),
    attendance: rule(RULE_LABEL.mandatoryAttendance),
  };

  // S-3: the bid-receipt rules are counted beside the window rules, never hidden behind an all-set badge.
  const badge = invitationBadge(c.notSet, bidRulesNotSet(bidMethods));
  // 6.7: the opening rules are said on their own cards, counted there; they never change the window's badge.
  const openingNotSet = openingRulesNotSet(bidMethods) + openingPolicyNotSet(openingPolicy);
  const liveCommittees = committees.filter((x) => x.retiredOn == null).map((x) => ({ value: x.code, label: x.nameEn }));
  const op = openingPolicy;
  const word = (en: string | null | undefined, ms: string | null | undefined) => (en ? [en, ms].filter(Boolean).join(" · ") : "Not set");

  return (
    <>
      <PageHeader
        title="Invitation controls"
        badge={<Badge tone={badge.tone} dot>{badge.text}</Badge>}
        subtitle="The rules for advertising, inviting, selling the documents and closing."
        actions={
          <>
            {row && <HistoryButton entity="WindowPolicy" entityId={row.id} label="the window rules" />}
            <EditWindowPolicy values={policyValues} channels={channelOptions} calendars={calendarOptions} templates={templateOptions} />
          </>
        }
      />
      <div className="flex flex-col gap-6">
        {c.notSet > 0 && (
          <Callout tone="warn" title={`${c.notSet} ${c.notSet === 1 ? "setting is" : "settings are"} not set`}>
            Each one that is not set holds back the act it governs, and says so where the act is asked for. Set them below.
          </Callout>
        )}

        <Card id="rules" className="scroll-mt-24">
          <CardHeader icon={<SlidersIcon size={17} />} title="The window rules" subtitle="The dates, the closing time, the advertisement day and what a notice, a letter and an addendum are written from." />
          <CardBody>
            <p className="mb-4 text-[12.5px] text-ink-3">Not set is not zero and not a guess: it says what it leaves undecided. A value set says where it came from.</p>
            <KeyValues
              columns={2}
              items={[
                setting("Minimum days from advertisement to closing", <Setting value={days(p.minAdvertisementDays)} unset={UNSET.min} source={p.dateRulesProvenance} />),
                setting("Target days from advertisement to closing", <Setting value={days(p.targetAdvertisementDays)} unset={UNSET.target} source={p.dateRulesProvenance} />),
                setting("Margin for a late newspaper", <Setting value={days(p.newspaperWarnDays)} unset={UNSET.margin} source={p.dateRulesProvenance} />),
                setting(RULE_LABEL.purchaseCutoff, <Setting value={days(p.purchaseCutoffDays)} unset={UNSET.cutoff} source={p.dateRulesProvenance} />),
                setting("Where the date rules are written", p.dateRuleSource || "No source is cited: the messages that refuse a date cite none"),
                setting("Default closing time", <Setting value={r.time.value} unset={UNSET.time} source={p.closingTimeProvenance} />),
                setting("Advertisement day", <Setting value={r.day.value} unset={UNSET.dayRule} source={p.dayRuleProvenance} />),
                setting("Holiday calendar", <Setting value={named(c.calendars, p.calendarId)?.name ?? "Not set"} unset={UNSET.calendar} />),
                setting(RULE_LABEL.mandatoryAttendance, <Setting value={r.attendance.value} unset={UNSET.attendance} source={p.attendanceProvenance} />),
                setting("Release the tender documents online after payment", <Setting value={release?.electronicDocumentRelease == null ? "Not set" : release.electronicDocumentRelease ? "Released online once an officer records the payment" : "Collected at the counter only"} unset="Not set, so documents are collected at the counter and nothing is released online." source={release?.electronicReleaseProvenance ?? null} />),
                setting("How the tender documents are sold", <Setting value={release?.documentSaleMode ? saleModeWords(release.documentSaleMode) : "Not set"} unset="Not set, so an exercise made now cannot be published until the organisation says how its documents are sold." />),
                setting("Demonstration payment simulator", <Setting value={release?.paymentSimulatorOn == null ? "Not set" : release.paymentSimulatorOn ? (simulatorAllowedByDeployment() ? "On: a demonstration, no money moves" : "On, but this copy of the system is not set up for demonstrations, so no one can pay on it and a payment already made on it releases nothing") : "Off"} unset="Not set, so a buyer cannot pay online: the office records the payment instead." />),
                setting("Payment methods the simulator offers", <Setting value={release?.simulatedPaymentMethods.length ? release.simulatedPaymentMethods.join(", ") : "Not set"} unset="None set, so the simulator offers nothing to choose from." />),
                setting("Template for the published notice", <Setting value={c.policy.templates.notice} unset={UNSET.template} />),
                setting("Template for a letter of invitation", <Setting value={c.policy.templates.invitation} unset={UNSET.template} />),
                setting("Template for an addendum", <Setting value={c.policy.templates.addendum} unset={UNSET.template} />),
              ]}
            />
            {row?.notes && <p className="mt-4 text-[13px] break-words whitespace-pre-line text-ink-2">{row.notes}</p>}
            <p className="mt-4 text-[12.5px] text-ink-3">The templates&apos; wording is written under <Link href="/configuration/templates">Templates</Link>.</p>
          </CardBody>
        </Card>

        <Card id="bids" className="scroll-mt-24 overflow-hidden">
          <CardHeader
            icon={<SlidersIcon size={17} />}
            title="Bid receipt, by sourcing method"
            subtitle={`Who decides whether a late envelope is admitted, the fewest bids each method expects, and what follows from an incomplete bid. ${BID_RULES_APPLY_TEXT} The validity alerts are a notification rule.`}
            divided={bidMethods.length === 0}
          />
          {bidMethods.length === 0 ? (
            <EmptyState title="No method takes bids">Only a method whose tender documents are a tender or a quotation receives bids. Set a method&apos;s documents under Tender documents.</EmptyState>
          ) : (
            <Table minWidth={760}>
              <colgroup>
                <col />
                <col style={{ width: 220 }} />
                <col style={{ width: 150 }} />
                <col style={{ width: 200 }} />
                <ActionsCol icons={1} labelled={1} />
              </colgroup>
              <THead>
                <Th>Method</Th>
                <Th>Late admission decided by</Th>
                <Th>Fewest bids</Th>
                <Th>An incomplete bid</Th>
                <Th className="text-right">Actions</Th>
              </THead>
              <tbody>
                {bidMethods.map((m) => (
                  <Tr key={m.id}>
                    <Td label="Method"><CellStack title={m.nameEn} /></Td>
                    <Td label="Late admission decided by"><Setting value={m.lateAdmissionCommitteeCode ? (committees.find((c) => c.code === m.lateAdmissionCommitteeCode)?.nameEn ?? "A committee no longer configured") : "Not set"} unset={BID_RULE_UNSET.committee} source={m.lateAdmissionProvenance} /></Td>
                    <Td label="Fewest bids"><Setting value={m.minimumBids == null ? "Not set" : String(m.minimumBids)} unset={BID_RULE_UNSET.minimum} source={m.minimumBidsProvenance} /></Td>
                    <Td label="An incomplete bid"><Setting value={m.completenessEliminates == null ? "Not set" : m.completenessEliminates ? "Is eliminated" : "Is reported to the committee"} unset={BID_RULE_UNSET.eliminates} source={m.completenessProvenance} /></Td>
                    <Td>
                      <RowActions>
                        <HistoryButton iconOnly entity="SourcingMethod" entityId={m.id} label={m.nameEn} />
                        <EditMethodBidRule id={m.id} name={m.nameEn} committees={committees.filter((c) => c.retiredOn == null).map((c) => ({ value: c.code, label: c.nameEn }))} values={{ lateAdmissionCommitteeCode: m.lateAdmissionCommitteeCode ?? "", lateAdmissionProvenance: m.lateAdmissionProvenance ?? "", minimumBids: m.minimumBids == null ? "" : String(m.minimumBids), minimumBidsProvenance: m.minimumBidsProvenance ?? "", completenessEliminates: tri(m.completenessEliminates), completenessProvenance: m.completenessProvenance ?? "" }} />
                      </RowActions>
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card>

        <Card id="opening" className="scroll-mt-24 overflow-hidden">
          <CardHeader
            icon={<SlidersIcon size={17} />}
            title={<span className="inline-flex flex-wrap items-center gap-2">Opening{openingNotSet > 0 && <Badge tone="warn">{openingNotSet} not set</Badge>}</span>}
            subtitle={`How the schedule counts the tenderers invited, the Grand Summary's words, and, by method, the committee that opens the bids and what follows from a bid with no live purchase. ${OPENING_RULES_APPLY_TEXT}`}
            actions={
              <span className="flex flex-wrap items-center gap-1">
                {op && <HistoryButton iconOnly entity="OpeningPolicy" entityId={op.id} label="the opening policy" />}
                <EditOpeningPolicy values={{ invitedCountReading: op?.invitedCountReading ?? "", invitedCountProvenance: op?.invitedCountProvenance ?? "", qualifiedLabelEn: op?.qualifiedLabelEn ?? "", qualifiedLabelMs: op?.qualifiedLabelMs ?? "", notQualifiedLabelEn: op?.notQualifiedLabelEn ?? "", notQualifiedLabelMs: op?.notQualifiedLabelMs ?? "", lowestLabelEn: op?.lowestLabelEn ?? "", lowestLabelMs: op?.lowestLabelMs ?? "", labelsProvenance: op?.labelsProvenance ?? "", governingSource: op?.governingSource ?? "" }} />
              </span>
            }
          />
          <CardBody className="border-b border-line/70">
            <KeyValues
              columns={2}
              items={[
                setting("The tenderers invited are", <Setting value={op?.invitedCountReading ? INVITED_READING_LABEL[op.invitedCountReading] : "Not set"} unset={OPENING_RULE_UNSET.reading} source={op?.invitedCountProvenance ?? null} />),
                setting("Where it is written", op?.governingSource || "No source is cited"),
                setting("A bid that passed", <Setting value={word(op?.qualifiedLabelEn, op?.qualifiedLabelMs)} unset={`${OPENING_RULE_UNSET.labels} "${PRODUCT_SUMMARY_LABELS.qualified}".`} source={op?.qualifiedLabelEn ? op.labelsProvenance : undefined} />),
                setting("A bid that did not pass", <Setting value={word(op?.notQualifiedLabelEn, op?.notQualifiedLabelMs)} unset={`${OPENING_RULE_UNSET.labels} "${PRODUCT_SUMMARY_LABELS.notQualified}".`} source={op?.notQualifiedLabelEn ? op.labelsProvenance : undefined} />),
                setting("The lowest qualifying offer", <Setting value={word(op?.lowestLabelEn, op?.lowestLabelMs)} unset={`${OPENING_RULE_UNSET.labels} "${PRODUCT_SUMMARY_LABELS.lowest}".`} source={op?.lowestLabelEn ? op.labelsProvenance : undefined} />),
              ]}
            />
          </CardBody>
          {bidMethods.length === 0 ? (
            <EmptyState title="No method takes bids">Only a method whose tender documents are a tender or a quotation has its bids opened.</EmptyState>
          ) : (
            <Table minWidth={720}>
              <colgroup>
                <col />
                <col style={{ width: 240 }} />
                <col style={{ width: 260 }} />
                <ActionsCol icons={1} labelled={1} />
              </colgroup>
              <THead>
                <Th>Method</Th>
                <Th>Bids opened by</Th>
                <Th>A bid with no live purchase</Th>
                <Th className="text-right">Actions</Th>
              </THead>
              <tbody>
                {bidMethods.map((m) => (
                  <Tr key={m.id}>
                    <Td label="Method"><CellStack title={m.nameEn} /></Td>
                    <Td label="Bids opened by"><Setting value={m.openingCommitteeCode ? (committees.find((x) => x.code === m.openingCommitteeCode)?.nameEn ?? "A committee no longer configured") : "Not set"} unset={OPENING_RULE_UNSET.committee} source={m.openingCommitteeProvenance} /></Td>
                    <Td label="A bid with no live purchase"><Setting value={m.unpurchasedBidConsequence ? UNPURCHASED_LABEL[m.unpurchasedBidConsequence] : "Not set"} unset={OPENING_RULE_UNSET.unpurchased} source={m.unpurchasedProvenance} /></Td>
                    <Td>
                      <RowActions>
                        <HistoryButton iconOnly entity="SourcingMethod" entityId={m.id} label={m.nameEn} />
                        <EditMethodOpeningRule id={m.id} name={m.nameEn} committees={liveCommittees} values={{ openingCommitteeCode: m.openingCommitteeCode ?? "", openingCommitteeProvenance: m.openingCommitteeProvenance ?? "", unpurchasedBidConsequence: m.unpurchasedBidConsequence ?? "", unpurchasedProvenance: m.unpurchasedProvenance ?? "" }} />
                      </RowActions>
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card>

        <Card id="channels" className="scroll-mt-24 overflow-hidden">
          <CardHeader
            icon={<FileIcon size={17} />}
            title={<span className="inline-flex items-center gap-2">Publication channels{c.channels.length > 0 && <Badge outline>{c.channels.length}</Badge>}</span>}
            subtitle="Where an advertised exercise's notice appears. It is advertised only once every required channel carries it."
            actions={<ChannelDrawer />}
            divided={c.channels.length === 0}
          />
          {c.channels.length === 0 ? (
            <EmptyState title="None configured">No exercise can be advertised until the channels are added and the required ones are named.</EmptyState>
          ) : (
            <Table minWidth={620}>
              <colgroup>
                <col />
                <col style={{ width: 170 }} />
                <col style={{ width: 110 }} />
                <ActionsCol icons={1} labelled={2} />
              </colgroup>
              <THead>
                <Th>Channel</Th>
                <Th>Required</Th>
                <Th>Source</Th>
                <Th className="text-right">Actions</Th>
              </THead>
              <tbody>
                {c.channels.map((x) => {
                  const raw = rawChannels.find((y) => y.id === x.id);
                  return (
                    <Tr key={x.id}>
                      <Td label="Channel"><CellStack title={x.nameEn} sub={[raw?.nameMs, x.governingSource, x.retired].filter(Boolean).join(" · ") || undefined} /></Td>
                      <Td label="Required">{x.required === "Not set" ? <Badge tone="warn" title="Publication is held back until this is set">Not set</Badge> : x.required}</Td>
                      <Td label="Source"><ProvenanceBadge value={x.provenance} /></Td>
                      <Td>
                        <RowActions>
                          <HistoryButton iconOnly entity="PublicationChannel" entityId={x.id} label={x.nameEn} />
                          <ChannelDrawer channel={{ id: x.id, name: x.nameEn, values: { code: x.code, nameEn: x.nameEn, nameMs: raw?.nameMs ?? "", requiredWhenAdvertised: tri(x.requiredWhenAdvertised), sortOrder: String(x.sortOrder), governingSource: x.governingSource, provenance: x.provenance, notes: raw?.notes ?? "" } }} />
                          <RetireChannelDrawer id={x.id} name={x.nameEn} retired={!!x.retired} />
                        </RowActions>
                      </Td>
                    </Tr>
                  );
                })}
              </tbody>
            </Table>
          )}
        </Card>

        <Card id="floors" className="scroll-mt-24 overflow-hidden">
          <CardHeader
            icon={<FileIcon size={17} />}
            title={<span className="inline-flex items-center gap-2">The least document fee{c.floors.length > 0 && <Badge outline>{c.floors.length}</Badge>}</span>}
            subtitle="The window's fee is refused below the least for its band. A band with none holds its publication back."
            actions={<FloorDrawer regimes={(Object.keys(REGIME_LABEL) as (keyof typeof REGIME_LABEL)[]).filter((k) => !c.floors.some((f) => f.regime === k)).map((k) => ({ value: k, label: REGIME_LABEL[k] }))} />}
            divided={c.floors.length === 0}
          />
          {c.floors.length === 0 ? (
            <EmptyState title="None configured">No fee can be judged, so no window can be published, until each band has its least fee.</EmptyState>
          ) : (
            <Table minWidth={560}>
              <colgroup>
                <col />
                <col style={{ width: 150 }} />
                <col style={{ width: 110 }} />
                <ActionsCol icons={1} labelled={2} />
              </colgroup>
              <THead>
                <Th>Band</Th>
                <Th numeric>Least fee</Th>
                <Th>Source</Th>
                <Th className="text-right">Actions</Th>
              </THead>
              <tbody>
                {c.floors.map((f) => {
                  const raw = rawFloors.find((y) => y.id === f.id);
                  return (
                    <Tr key={f.id}>
                      <Td label="Band"><CellStack title={f.band} sub={f.source ?? undefined} /></Td>
                      <Td numeric label="Least fee"><span className="font-semibold">{f.minimum}</span></Td>
                      <Td label="Source">{raw ? <ProvenanceBadge value={raw.provenance} /> : null}</Td>
                      <Td>
                        <RowActions>
                          <HistoryButton iconOnly entity="DocumentFeeFloor" entityId={f.id} label={f.band} />
                          <FloorDrawer regimes={[{ value: f.regime, label: f.band }]} floor={{ id: f.id, label: f.band, values: { regime: f.regime, minimum: raw ? senToDecimalString(parseSen(raw.minimum.toString())) : "", governingSource: raw?.governingSource ?? "", provenance: raw?.provenance ?? "", notes: raw?.notes ?? "" } }} />
                          <RemoveFloorDrawer id={f.id} label={f.band} />
                        </RowActions>
                      </Td>
                    </Tr>
                  );
                })}
              </tbody>
            </Table>
          )}
        </Card>

        <div id="calendars" className="scroll-mt-24 flex flex-col gap-6">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-[15px] font-bold text-ink">Holiday calendars</h2>
              <p className="text-[12.5px] text-ink-3">A closing may not fall on a weekend day or a public holiday. A year not maintained in full blocks a closing in it.</p>
            </div>
            <CalendarDrawer />
          </div>
          {c.calendars.length === 0 && (
            <Card>
              <EmptyState title="None configured">No closing can be checked, so no window can be published, until a calendar is added with its weekend days and each year&apos;s holidays.</EmptyState>
            </Card>
          )}
          {c.calendars.map((cal) => {
            const raw = rawCalendars.find((y) => y.id === cal.id);
            return (
              <Card key={cal.id} className="overflow-hidden">
                <CardHeader
                  icon={<ClockIcon size={17} />}
                  title={<span className="inline-flex flex-wrap items-center gap-2">{cal.name}{cal.retired && <Badge tone="neutral">{cal.retired}</Badge>}</span>}
                  actions={
                    <span className="flex flex-wrap items-center gap-1">
                      <HistoryButton iconOnly entity="HolidayCalendar" entityId={cal.id} label={cal.name} />
                      <CalendarDrawer calendar={{ id: cal.id, name: cal.name, values: { code: cal.code, name: cal.name, weekendDays: cal.weekendDays.join("\n"), weekendProvenance: raw?.weekendProvenance ?? "", governingSource: raw?.governingSource ?? "", provenance: raw?.provenance ?? "", sortOrder: String(raw?.sortOrder ?? 0), notes: raw?.notes ?? "" } }} />
                      <RetireCalendarDrawer id={cal.id} name={cal.name} retired={!!cal.retired} />
                    </span>
                  }
                />
                {cal.weekend !== "Not set" && (
                  <div className="flex flex-wrap items-center gap-2 border-b border-line/70 px-5 py-3 text-[13.5px] sm:px-6">
                    <span className="font-semibold text-ink">Weekend</span>
                    <span className="text-ink-2">{cal.weekend}</span>
                    <ProvenanceBadge value={raw?.weekendProvenance ?? null} />
                  </div>
                )}
                {cal.weekend === "Not set" && (
                  <CardBody className="border-b border-line/70">
                    <Callout tone="warn" title="Weekend days not set">A closing cannot be checked against this calendar until its weekend days are set.</Callout>
                  </CardBody>
                )}
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line/70 px-5 py-3 sm:px-6">
                  <p className="text-[13.5px] font-semibold text-ink">Years</p>
                  <span className="flex flex-wrap gap-2"><YearDrawer calendarId={cal.id} calendar={cal.name} /><ImportYearDrawer calendarId={cal.id} calendar={cal.name} /><HolidayDrawer calendarId={cal.id} calendar={cal.name} /></span>
                </div>
                {cal.years.length === 0 ? (
                  <p className="px-5 py-4 text-[13px] text-ink-3 sm:px-6">No year is recorded: a closing in any year is refused until its public holidays are listed and the year is marked complete.</p>
                ) : (
                  <ul className="divide-y divide-line/70">
                    {cal.years.map((y) => (
                      <li key={y.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-5 py-3 text-[13.5px] sm:px-6">
                        <span className="font-semibold text-ink">{y.year}</span>
                        <Badge tone={y.complete.startsWith("Maintained") ? "ok" : "warn"}>{y.complete.startsWith("Maintained") ? "Complete" : "Not complete"}</Badge>
                        <span className="order-last w-full min-w-0 text-ink-2 sm:order-none sm:w-auto sm:flex-1">{y.complete.startsWith("Maintained") ? y.source ?? "No source recorded" : y.complete}</span>
                        <ProvenanceBadge value={y.from.toUpperCase()} />
                        <HistoryButton iconOnly entity="HolidayCalendarYear" entityId={y.id} label={`${cal.name}, ${y.year}`} />
                        <YearDrawer calendarId={cal.id} calendar={cal.name} year={{ year: y.year, complete: y.complete.startsWith("Maintained"), source: y.source ?? "", provenance: y.from.toUpperCase() }} />
                      </li>
                    ))}
                  </ul>
                )}
                {cal.holidays.length > 0 && (
                  <details className="border-t border-line">
                    <summary className="cursor-pointer px-5 py-3 text-[13px] font-semibold text-ink-3 sm:px-6">{cal.holidays.length} public {cal.holidays.length === 1 ? "holiday" : "holidays"}</summary>
                    <Table minWidth={560}>
                      <colgroup>
                        <col style={{ width: 140 }} />
                        <col />
                        <col style={{ width: 110 }} />
                        <ActionsCol icons={0} labelled={1} />
                      </colgroup>
                      <THead>
                        <Th>Day</Th>
                        <Th>Holiday</Th>
                        <Th>Source</Th>
                        <Th className="text-right">Actions</Th>
                      </THead>
                      <tbody>
                        {cal.holidays.map((h) => (
                          <Tr key={h.id}>
                            <Td label="Day">{h.day}</Td>
                            <Td label="Holiday"><CellStack title={h.name} sub={[h.nameMs, h.gazette].filter(Boolean).join(" · ") || undefined} /></Td>
                            <Td label="Source"><ProvenanceBadge value={h.from.toUpperCase()} /></Td>
                            <Td><RowActions><RemoveHolidayDrawer id={h.id} name={h.name} /></RowActions></Td>
                          </Tr>
                        ))}
                      </tbody>
                    </Table>
                  </details>
                )}
              </Card>
            );
          })}
        </div>
        <p className="text-[12.5px] text-ink-3">
          Closing and publication are judged against these as they stand at the time; what a published window was judged under is kept with it. <ButtonLink href="/configuration/audit" variant="link" size="sm">See every change in the audit trail</ButtonLink>
        </p>
      </div>
    </>
  );
}
