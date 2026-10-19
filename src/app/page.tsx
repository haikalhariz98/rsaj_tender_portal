import { hiddenExercises, sulitGates, sulitMatterAmounts } from "@/app/_auth/sulit";
import { sulitCell } from "@/components/sulit-cell";
import {
  AwardIcon,
  CalendarIcon,
  ClockIcon,
  FilesIcon,
  GlobeIcon,
  PlusIcon,
  SparkleIcon,
  ToolsIcon,
  UserIcon,
  UsersIcon,
} from "@/components/icons";
import { DataList } from "@/components/data-list";
import { Badge, Dot } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/feedback";
import { LeadWithMore } from "@/components/ui/more-text";
import { PageHeader } from "@/components/ui/page-header";
import { Stat } from "@/components/ui/stat";
import Link from "next/link";
import type { ActivityKind } from "@/lib/dashboard/activity";
import type { Words } from "@/lib/contract/labels";
import { phaseSummary, statusBreakdown } from "@/lib/method/phase";
import { loadDashboard } from "@/lib/dashboard";
import { requestWorklist } from "@/app/_auth/worklist";
import { myStepsOf, waitingForCount } from "@/lib/approvals/queue";
import { formatDate, formatOrgDay } from "@/lib/format";
import { matterLabel } from "@/lib/labels";
import { greetingAt } from "@/lib/dates";
import { organisationTimeZone } from "@/lib/org-time";
import { requireStaff } from "@/app/_auth/actor";
import { ENGLISH } from "@/lib/i18n/language";
import { DASHBOARD_WORDS as D, WAITING_RULE_WORDS } from "@/lib/i18n/catalogues/dashboard";
import { say, sayWith } from "@/lib/i18n/say";
import { SignInNotices } from "@/components/auth/sign-in-notices";
import { loadAccountView } from "@/lib/auth/account-view";
import { caseHref } from "@/lib/contract/links";

export const dynamic = "force-dynamic";

/// Where each kind of line links, and the icon that tells the kinds apart at a glance.
const ACTIVITY_HREF = {
  requisition: (id: string) => `/requisitions/${id}`,
  award: (id: string) => caseHref({ awardId: id, contractId: null }),
  exercise: (id: string) => `/sourcing/${id}`,
  sitting: (id: string) => `/committees/${id}`,
};
const ACTIVITY_ICON: Record<ActivityKind, React.ReactNode> = {
  requisition: <FilesIcon size={15} />,
  approval: <ClockIcon size={15} />,
  exercise: <GlobeIcon size={15} />,
  sitting: <CalendarIcon size={15} />,
  matter: <UsersIcon size={15} />,
  award: <AwardIcon size={15} />,
};

/// Modules the dashboard will report on once they exist. Listed rather than drawn as
/// empty cards: three blank panels read as a broken screen, one honest list does not.
const COMING = [
  {
    icon: <ToolsIcon size={17} />,
    title: D.projectHealth,
  },
];

export default async function Dashboard() {
  const actor = await requireStaff();
  const lang = ENGLISH;
  const t = (words: Words) => say(words, lang);
  // "Awaiting my decision" is the My approvals badge's own reading: `requestWorklist` is request-cached, so the layout and this page share one load (GN-03, AC-11). Every read starts
  // together (AC-9b); `hiddenExercises` and the time zone are request-cached, so the layout, the worklist and the loader share one read each.
  const [accountView, data, timeZone, worklist] = await Promise.all([loadAccountView(actor), hiddenExercises(actor).then((hidden) => loadDashboard(actor.organisationId, hidden, new Date(), lang)), organisationTimeZone(actor.organisationId), requestWorklist(actor)]);

  if (!data) {
    return (
      <Card>
        <EmptyState title={t(D.setupTitle)} icon={<SparkleIcon size={24} />} action={<code className="font-mono text-[12.5px]">npm run setup</code>} />
      </Card>
    );
  }

  // The figures on this page are SULIT (founder, item 26): a matter's amount by what kind of matter it is, a requisition's estimate, and the total of what was approved. Each is
  // judged for the reader and logged; a figure the reader may not read is "SULIT · withheld" with the reason, in the list, the sort and the total.
  // The two gates read independently and run together; the "Value approved" total, and its gate, are gone (GN-03, AC-9c).
  const [matterGates, requisitionGates] = await Promise.all([
    sulitMatterAmounts(actor, data.queue.map((q) => ({ id: q.decisionId, label: q.subject, kind: q.matterKind, hasAmount: q.amount != null }))),
    sulitGates(actor, data.requisitions.map((q) => ({ scope: "requisition" as const, entity: "Requisition", id: q.id, label: q.reference })), ["estimatedValue"]),
  ]);
  const now = new Date();
  // Greet by the name of whoever is signed in, from their session. Nobody signed in: the greeting alone.
  const firstName = actor.personName.split(/\s+/)[0];
  const jobTitle = actor.jobTitle;
  const awaitingMe = worklist ? waitingForCount(myStepsOf(worklist.groups, actor.personId)) : 0;
  const { requisitions: reqPipe, sourcing: srcPipe, contracts: conPipe } = data.pipeline;
  // Waiting days are shown as a count, with no judgement: there is no configured
  // target to call one "aged" against until FR-APR-018's targets exist (ruling R5).

  return (
    <>
      <PageHeader
        title={firstName ? `${greetingAt(now, timeZone, lang)}, ${firstName}` : greetingAt(now, timeZone, lang)}
        meta={[
          jobTitle && (
            <>
              <UserIcon size={14} />
              {jobTitle}
            </>
          ),
          <>
            <CalendarIcon size={14} />
            {formatOrgDay(now, timeZone, lang)}
          </>,
        ]}
        actions={
          <>
            <ButtonLink href="/requisitions/new" variant="primary" icon={<PlusIcon size={16} />}>
              {t(D.newRequisition)}
            </ButtonLink>
          </>
        }
      />

      <SignInNotices view={accountView} lang={lang} />

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat
          label={t(D.awaitingMyDecision)}
          value={awaitingMe}
          tone="warn"
          icon={<ClockIcon size={17} />}
          href="/approvals?tab=mine"
          hint={t(awaitingMe > 0 ? D.stepsWaitingForYou : D.nothingWaitingForYou)}
        />
        <Stat
          label={t(D.requisitions)}
          value={reqPipe.total}
          tone="brand"
          icon={<FilesIcon size={17} />}
          href="/requisitions"
          hint={reqPipe.total === 0 ? t(D.noneInPipeline) : sayWith(D.requisitionHint, lang, { approved: String(reqPipe.approvedWaiting), back: String(reqPipe.backWithRequester) })}
        />
        <Stat
          label={t(D.sourcing)}
          value={srcPipe.total}
          tone="brand"
          icon={<GlobeIcon size={17} />}
          href="/sourcing"
          hint={
            srcPipe.total === 0 ? (
              t(D.noneInPipeline)
            ) : (
              <span title={statusBreakdown(srcPipe.phases, 0, lang)}>{phaseSummary(srcPipe.phases, lang)}</span>
            )
          }
        />
        <Stat
          label={t(D.contracts)}
          value={conPipe.total}
          tone="brand"
          icon={<AwardIcon size={17} />}
          href="/projects"
          hint={conPipe.total === 0 ? t(D.noneInPipeline) : sayWith(D.contractsHint, lang, { awarding: String(conPipe.awarding), signing: String(conPipe.signing), onSite: String(conPipe.onSite) })}
        />
      </div>

      <div className="grid grid-cols-1 items-start gap-6 2xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="flex min-w-0 flex-col gap-6">
          <Card className="overflow-hidden">
            <CardHeader
              icon={<ClockIcon size={17} />}
              title={t(D.committeeTitle)}
              subtitle={t(D.committeeSubtitle)}
              divided={false}
              actions={
                <ButtonLink href="/configuration/committees" variant="ghost" size="sm">
                  {t(D.viewAll)}
                </ButtonLink>
              }
            />
            <DataList
              flat
              exportName="committee-matters-waiting"
              searchPlaceholder={t(D.searchMatters)}
              emptyTitle={t(D.committeeEmptyTitle)}
              views={[{ id: "financial", label: t(D.financialItems) }]}
              filters={[
                { key: "type", label: t(D.type) },
                { key: "with", label: t(D.committee) },
              ]}
              rowAction={{
                label: t(D.openTheSitting),
                hrefTemplate: "/configuration/committees",
              }}
              columns={[
                { key: "item", label: t(D.item), sortable: true, mobile: "primary" },
                { key: "type", label: t(D.type), width: "140px", sortable: true, hideBelow: "lg", mobile: "meta" },
                { key: "value", label: t(D.value), width: "132px", numeric: true, sortable: true, sulit: true, mobile: "meta" },
                { key: "waiting", label: t(D.waiting), width: "104px", numeric: true, sortable: true, mobile: "meta" },
                { key: "with", label: t(D.with), width: "190px", hideBelow: "md", mobile: "meta" },
              ]}
              rows={data.queue.map((item) => ({
                id: item.decisionId,
                search: `${item.subject} ${item.matterRef ?? ""} ${item.committeeName}`,
                views: item.amount != null ? ["financial"] : [],
                sortKeys: {
                  ...(item.amount == null ? { value: -1 } : matterGates.get(item.decisionId) && matterGates.get(item.decisionId)!.state !== "GRANTED" ? {} : { value: item.amount }),
                  waiting: item.waitingDays,
                  item: item.subject,
                  type: matterLabel(item.domain, lang),
                },
                cells: {
                  item: {
                    kind: "stack",
                    title: item.subject,
                    sub: item.matterRef ?? item.meetingReference,
                    monoSub: true,
                  },
                  type: { kind: "text", text: matterLabel(item.domain, lang), dim: true },
                  value: matterGates.has(item.decisionId) ? sulitCell(matterGates.get(item.decisionId)!, () => ({ kind: "money" as const, value: item.amount }), lang) : { kind: "money", value: item.amount },
                  waiting: { kind: "badge", text: sayWith(D.daysShort, lang, { days: String(item.waitingDays) }) },
                  with: {
                    kind: "link",
                    text: item.committeeName,
                    href: `/configuration/committees/${item.committeeCode}`,
                    sub: sayWith(D.votesCast, lang, { cast: String(item.votesCast), entitled: String(item.entitled) }),
                  },
                },
              }))}
            />
          </Card>

          <Card className="overflow-hidden">
            <CardHeader
              icon={<ClockIcon size={17} />}
              title={t(D.awaitingTitle)}
              subtitle={<LeadWithMore lead={t(D.awaitingLead)} more={t(WAITING_RULE_WORDS)} />}
              divided={false}
              actions={
                <ButtonLink href="/approvals" variant="ghost" size="sm">
                  {t(D.myApprovals)}
                </ButtonLink>
              }
            />
            <DataList
              flat
              toolbar={false}
              selectable={false}
              exportName="requisitions-awaiting-approval"
              emptyTitle={t(D.awaitingEmptyTitle)}
              rowAction={{ label: t(D.open), hrefTemplate: "/requisitions/{id}" }}
              rowOpens
              columns={[
                { key: "item", label: t(D.requisition), mobile: "primary" },
                { key: "on", label: t(D.waitingOn), width: "200px", hideBelow: "md", mobile: "meta" },
                { key: "value", label: t(D.value), width: "132px", numeric: true, sulit: true, mobile: "meta" },
                { key: "waiting", label: t(D.waiting), width: "104px", numeric: true, mobile: "meta" },
              ]}
              rows={data.requisitions.map((q) => ({
                id: q.id,
                search: `${q.title} ${q.reference}`,
                cells: {
                  item: { kind: "link", text: q.title, href: `/requisitions/${q.id}`, sub: q.reference },
                  on: q.waitingOn ? { kind: "stack", title: q.waitingOn, sub: q.escalatedFrom ? sayWith(D.escalatedFrom, lang, { office: q.escalatedFrom }) : undefined } : { kind: "text", text: t(D.noStepPending), dim: true },
                  value: sulitCell(requisitionGates.get(q.id)!, () => ({ kind: "money" as const, value: q.estimatedValue }), lang),
                  waiting: { kind: "badge", text: q.waitingDays == null ? t(D.notCounted) : sayWith(D.daysShort, lang, { days: String(q.waitingDays) }) },
                },
              }))}
            />
          </Card>

          <Card tone="flat" className="border-dashed bg-surface/60">
            <CardHeader
              icon={<SparkleIcon size={17} />}
              title={t(D.onTheWay)}
            />
            <CardBody className="grid gap-5 md:grid-cols-2">
              {COMING.map((c) => (
                <div key={c.title.en} className="min-w-0">
                  <div className="flex items-center gap-2 text-ink-3">
                    {c.icon}
                    <Badge tone="warn">{t(D.notBuiltYet)}</Badge>
                  </div>
                  <div className="mt-2.5 text-[14px] font-bold text-ink">{t(c.title)}</div>
                </div>
              ))}
            </CardBody>
          </Card>
        </div>

        <aside className="flex min-w-0 flex-col gap-6">
          <Card>
            <CardHeader
              icon={<CalendarIcon size={17} />}
              title={t(D.upcomingTitle)}
            />
            {data.upcoming.length === 0 ? (
              <EmptyState size="sm" title={t(D.nothingScheduled)} />
            ) : (
              <ul className="divide-y divide-line/70 px-2 py-1.5">
                {data.upcoming.map((m) => (
                  <li key={m.id} className="flex items-center gap-3 rounded-xl px-3 py-2.5">
                    <Dot tone="brand" />
                    <div className="min-w-0 flex-1">
                      <div className="text-[13.5px] font-semibold break-words text-ink">
                        {m.committeeName}
                      </div>
                      <div className="text-[12px] break-words text-ink-3">{m.reference}</div>
                    </div>
                    <div className="shrink-0 text-right">
                      <div className="text-[12.5px] font-bold text-ink tabular-nums">
                        {m.daysAway <= 0 ? t(D.today) : sayWith(D.inDays, lang, { days: String(m.daysAway) })}
                      </div>
                      <div className="text-[12px] text-ink-4 tabular-nums">
                        {formatDate(m.meetingDate, lang)}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card>
            <CardHeader icon={<ClockIcon size={17} />} title={t(D.recentTitle)} />
            {data.activity.length === 0 ? (
              <EmptyState size="sm" title={t(D.nothingMoved)} />
            ) : (
              <ol className="px-6 py-4">
                {data.activity.map((a) => {
                  const href = a.link ? ACTIVITY_HREF[a.link.kind](a.link.id) : null;
                  return (
                    <li key={a.key} className="relative flex gap-3 pb-4 last:pb-0">
                      <span className="absolute top-8 bottom-0 left-[13px] w-px bg-line last:hidden" />
                      <span aria-hidden className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-full bg-sunken text-ink-3">
                        {ACTIVITY_ICON[a.kind]}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="text-[13.5px] font-semibold text-ink">
                          {href ? (
                            <Link href={href} className="rounded-sm hover:text-brand-700 hover:underline focus-visible:outline-2 focus-visible:outline-brand-500">
                              {a.headline}
                            </Link>
                          ) : (
                            a.headline
                          )}
                        </div>
                        {(a.title || a.reason) && (
                          <div className="truncate text-[12.5px] text-ink-3">{[a.title, a.reason].filter(Boolean).join(" · ")}</div>
                        )}
                        <div className="text-[12px] text-ink-4">{a.day}</div>
                      </div>
                    </li>
                  );
                })}
              </ol>
            )}
          </Card>
        </aside>
      </div>
    </>
  );
}
