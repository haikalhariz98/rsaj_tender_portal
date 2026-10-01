import Link from "next/link";
import type { ReactNode } from "react";

import { HistoryButton } from "@/components/history-drawer";
import { ClockIcon, FileIcon, SlidersIcon } from "@/components/icons";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Callout, EmptyState } from "@/components/ui/feedback";
import { PageHeader } from "@/components/ui/page-header";
import { ProvenanceBadge } from "@/components/ui/provenance";
import { KeyValues } from "@/components/ui/stat";
import { ActionsCol, CellStack, RowActions, Table, Td, Th, THead, Tr } from "@/components/ui/table";
import { db } from "@/lib/db";
import { REGIME_LABEL } from "@/lib/method/labels";
import { ORGANISATION_CODE } from "@/lib/org";
import { senToDecimalString, parseSen } from "@/lib/money";
import { invitationConfig } from "@/lib/window/read";

import { CalendarDrawer, ChannelDrawer, EditWindowPolicy, FloorDrawer, HolidayDrawer, ImportYearDrawer, RemoveFloorDrawer, RemoveHolidayDrawer, RetireCalendarDrawer, RetireChannelDrawer, YearDrawer } from "./editors";

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
  const c = await invitationConfig();
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
  const org = await db.organisation.findUnique({ where: { code: ORGANISATION_CODE }, select: { id: true } });
  const [row, rawChannels, rawFloors, rawCalendars] = org
    ? await Promise.all([
        db.windowPolicy.findUnique({ where: { organisationId: org.id } }),
        db.publicationChannel.findMany({ where: { organisationId: org.id } }),
        db.documentFeeFloor.findMany({ where: { organisationId: org.id } }),
        db.holidayCalendar.findMany({ where: { organisationId: org.id }, include: { holidays: { select: { id: true, day: true } }, years: { select: { id: true } } } }),
      ])
    : [null, [], [], []];
  const p = c.policy.values;
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
    attendance: rule("Mandatory attendance"),
  };

  return (
    <>
      <PageHeader
        title="Invitation controls"
        badge={c.notSet > 0 ? <Badge tone="warn" dot>{`${c.notSet} not set`}</Badge> : <Badge tone="ok" dot>Everything set</Badge>}
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
                setting("Days between the last day of sale and the closing", <Setting value={days(p.purchaseCutoffDays)} unset={UNSET.cutoff} source={p.dateRulesProvenance} />),
                setting("Where the date rules are written", p.dateRuleSource || "No source is cited: the messages that refuse a date cite none"),
                setting("Default closing time", <Setting value={r.time.value} unset={UNSET.time} source={p.closingTimeProvenance} />),
                setting("The advertisement day", <Setting value={r.day.value} unset={UNSET.dayRule} source={p.dayRuleProvenance} />),
                setting("Holiday calendar", <Setting value={named(c.calendars, p.calendarId)?.name ?? "Not set"} unset={UNSET.calendar} />),
                setting("Mandatory attendance at a briefing", <Setting value={r.attendance.value} unset={UNSET.attendance} source={p.attendanceProvenance} />),
                setting("Template for the published notice", <Setting value={c.policy.templates.notice} unset={UNSET.template} />),
                setting("Template for a letter of invitation", <Setting value={c.policy.templates.invitation} unset={UNSET.template} />),
                setting("Template for an addendum", <Setting value={c.policy.templates.addendum} unset={UNSET.template} />),
              ]}
            />
            {row?.notes && <p className="mt-4 text-[13px] break-words whitespace-pre-line text-ink-2">{row.notes}</p>}
            <p className="mt-4 text-[12.5px] text-ink-3">The templates&apos; wording is written under <Link href="/configuration/templates">Templates</Link>.</p>
          </CardBody>
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
                        <span className="min-w-0 flex-1 text-ink-2">{y.complete.startsWith("Maintained") ? y.source ?? "No source recorded" : y.complete}</span>
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
