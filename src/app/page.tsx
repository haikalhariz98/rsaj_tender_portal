import { hiddenExercises } from "@/app/_auth/sulit";
import { AwardIcon, CalendarIcon, ClockIcon, FilesIcon, GlobeIcon, PlusIcon, SparkleIcon, UserIcon, UsersIcon } from "@/components/icons";
import { Dot } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/feedback";
import { PageHeader } from "@/components/ui/page-header";
import { Stat } from "@/components/ui/stat";
import Link from "next/link";
import type { ActivityKind } from "@/lib/dashboard/activity";
import type { Words } from "@/lib/contract/labels";
import { phaseSummary, statusBreakdown } from "@/lib/method/phase";
import { loadDashboard, myCommitteeCodes, officeNames } from "@/lib/dashboard";
import { needsYou, nonZeroParts, waitedLabel } from "@/lib/dashboard/home";
import { requestWorklist } from "@/app/_auth/worklist";
import { myStepsOf } from "@/lib/approvals/queue";
import { formatDate, formatOrgDay } from "@/lib/format";
import { greetingAt } from "@/lib/dates";
import { organisationTimeZone } from "@/lib/org-time";
import { requireStaff } from "@/app/_auth/actor";
import { ENGLISH } from "@/lib/i18n/language";
import { DASHBOARD_WORDS as D } from "@/lib/i18n/catalogues/dashboard";
import { say, sayWith } from "@/lib/i18n/say";
import { SignInNotices } from "@/components/auth/sign-in-notices";
import { loadAccountView } from "@/lib/auth/account-view";
import { caseHref } from "@/lib/contract/links";

export const metadata = { title: "Home" };
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

export default async function Dashboard() {
  const actor = await requireStaff();
  const lang = ENGLISH;
  const t = (words: Words) => say(words, lang);
  // `requestWorklist` is request-cached, so the layout and this page share one load (GN-03, AC-11).
  // Nothing here shows an amount, so nothing here is SULIT; restricted exercises are left out of every read (FR-MTD-007).
  const officeCodes = actor.offices.map((o) => o.roleCode);
  const [accountView, data, timeZone, worklist, committees, roles] = await Promise.all([
    loadAccountView(actor),
    hiddenExercises(actor).then((hidden) => loadDashboard(actor.organisationId, hidden, new Date(), lang)),
    organisationTimeZone(actor.organisationId),
    requestWorklist(actor),
    myCommitteeCodes(actor.organisationId, actor.personId, officeCodes),
    officeNames(actor.organisationId, officeCodes),
  ]);

  if (!data) {
    return (
      <Card>
        <EmptyState title={t(D.setupTitle)} icon={<SparkleIcon size={24} />} action={<code className="font-mono text-[12.5px]">npm run setup</code>} />
      </Card>
    );
  }

  const now = new Date();
  const firstName = actor.personName.split(/\s+/)[0];
  // The role the person holds, by its name; the free-text job title only where they hold none.
  const role = roles.length ? roles.join(" · ") : actor.jobTitle;
  const mine = worklist ? myStepsOf(worklist.groups, actor.personId) : [];
  const rows = needsYou(mine, data.queue, committees);
  const { requisitions: reqPipe, sourcing: srcPipe, contracts: conPipe } = data.pipeline;
  // A figure of nought is a quiet tile: no coloured icon.
  const toneOf = (n: number) => (n > 0 ? "brand" : "neutral");

  return (
    <>
      <PageHeader
        title={firstName ? `${greetingAt(now, timeZone, lang)}, ${firstName}` : greetingAt(now, timeZone, lang)}
        meta={[
          role && (
            <>
              <UserIcon size={14} />
              {role}
            </>
          ),
          <>
            <CalendarIcon size={14} />
            {formatOrgDay(now, timeZone, lang)}
          </>,
        ]}
        actions={
          <ButtonLink href="/requisitions/new" variant="primary" icon={<PlusIcon size={16} />}>
            {t(D.newRequisition)}
          </ButtonLink>
        }
      />

      <SignInNotices view={accountView} lang={lang} />

      <Card className="mb-6 overflow-hidden">
        <CardHeader
          icon={<ClockIcon size={17} />}
          title="Needs you"
          divided={rows.length > 0}
          actions={
            <ButtonLink href="/approvals?tab=mine" variant="ghost" size="sm">
              {t(D.myApprovals)}
            </ButtonLink>
          }
        />
        {rows.length === 0 ? (
          <p className="px-6 pb-5 text-[14px] text-ink-2">
            Nothing needs you right now.
          </p>
        ) : (
          <ul className="divide-y divide-line/70">
            {rows.map((r) => (
              <li key={r.key} className="flex items-center gap-4 px-6 py-3.5">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[14px] font-semibold text-ink">{r.title}</div>
                  <div className="truncate text-[12.5px] text-ink-3">
                    {r.kind} · waiting on {r.waitingOn}
                  </div>
                </div>
                <span className="shrink-0 text-[12.5px] text-ink-3 tabular-nums">{waitedLabel(r.days)}</span>
                <ButtonLink href={r.href} variant="secondary" size="sm">
                  {r.action}
                </ButtonLink>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <Stat
          label="Requisitions"
          value={reqPipe.total}
          tone={toneOf(reqPipe.total)}
          icon={<FilesIcon size={17} />}
          href="/requisitions"
          hint={nonZeroParts([[reqPipe.approvedWaiting, "approved"], [reqPipe.backWithRequester, "sent back"]])}
        />
        <Stat
          label="Tenders & quotations"
          value={srcPipe.total}
          tone={toneOf(srcPipe.total)}
          icon={<GlobeIcon size={17} />}
          href="/sourcing"
          hint={srcPipe.total > 0 ? <span title={statusBreakdown(srcPipe.phases, 0, lang)}>{phaseSummary(srcPipe.phases, lang)}</span> : undefined}
        />
        <Stat
          label="Projects"
          value={conPipe.total}
          tone={toneOf(conPipe.total)}
          icon={<AwardIcon size={17} />}
          href="/projects"
          hint={nonZeroParts([[conPipe.awarding, "awarding"], [conPipe.signing, "signing"], [conPipe.onSite, "on site"]])}
        />
      </div>

      <div className="grid grid-cols-1 items-start gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader icon={<ClockIcon size={17} />} title={t(D.recentTitle)} />
          {data.activity.length === 0 ? (
            <EmptyState size="sm" title={t(D.nothingMoved)} />
          ) : (
            <ol className="px-6 py-4">
              {data.activity.map((a) => {
                const href = a.link ? ACTIVITY_HREF[a.link.kind](a.link.id) : null;
                return (
                  <li key={a.key} className="flex gap-3 pb-4 last:pb-0">
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
                      <div className="truncate text-[12.5px] text-ink-3">{[a.reason, a.day].filter(Boolean).join(" · ")}</div>
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
        </Card>

        {data.upcoming.length === 0 ? (
          <Card>
            <CardHeader icon={<CalendarIcon size={17} />} title={t(D.upcomingTitle)} />
            <EmptyState size="sm" title="No sittings scheduled" />
          </Card>
        ) : (
          <Card>
            <CardHeader icon={<CalendarIcon size={17} />} title={t(D.upcomingTitle)} />
            <ul className="divide-y divide-line/70 px-2 py-1.5">
              {data.upcoming.map((m) => (
                <li key={m.id} className="flex items-center gap-3 rounded-xl px-3 py-2.5">
                  <Dot tone="brand" />
                  <div className="min-w-0 flex-1 text-[13.5px] font-semibold wrap-break-word text-ink">{m.committeeName}</div>
                  <div className="shrink-0 text-right">
                    <div className="text-[12.5px] font-bold text-ink tabular-nums">{m.daysAway <= 0 ? t(D.today) : sayWith(D.inDays, lang, { days: String(m.daysAway) })}</div>
                    <div className="text-[12px] text-ink-4 tabular-nums">{formatDate(m.meetingDate, lang)}</div>
                  </div>
                </li>
              ))}
            </ul>
          </Card>
        )}
      </div>
    </>
  );
}
