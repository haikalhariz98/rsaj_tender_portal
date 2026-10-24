import { DataList, type Row, type ServerMode } from "@/components/data-list";
import { serverMode } from "@/components/server-list";
import { BellIcon, BuildingIcon, ClipboardIcon, ClockIcon, GlobeIcon, ShieldIcon } from "@/components/icons";
import { Badge, Chip } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/feedback";
import { Tabs } from "@/components/tabs";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardFooter, CardHeader } from "@/components/ui/card";
import { Callout } from "@/components/ui/feedback";
import { PageHeader } from "@/components/ui/page-header";
import { StatusCounts } from "@/components/ui/status-counts";
import { loadRegisterSettings } from "@/lib/portal/apply-repo";
import { flagWords } from "@/lib/portal/queue";
import { loadPortalQueue } from "@/lib/portal/queue-repo";
import { daysFrom } from "@/lib/dates";
import { addDays } from "@/lib/securities/period";
import { formatDate } from "@/lib/format";
import { routeState } from "@/lib/suppliers/blacklist";
import { reminderDue, startsOn, type ExpiryBand } from "@/lib/suppliers/expiry";
import { blacklistEndWords, eventReasonWords, renewalUpcomingWords, ERP_NOT_SYNCED, EXPIRY_BAND_LABEL, EXPIRY_BAND_TONE, REMINDER_NOT_SENT, REQUEST_KIND_LABEL, standingTone, standingWords } from "@/lib/suppliers/labels";
import { db } from "@/lib/db";
import { APPLICATION_VIEWS, answeredOnTimeIds, documentsToSeeToIds, listSuppliers, loadSupplierConfig, supplierOrg, SUPPLIER_VIEWS, SUPPLIERS_PAGE } from "@/lib/suppliers/repo";
import { LIST_EXPORT_MAX_ROWS, listHref, parseListQuery, sortKeys, type ListQuery } from "@/lib/list-query";
import { permissionGate, requireStaff } from "@/app/_auth/actor";
import { BOARD_PAGE, loadBoard } from "@/lib/portal/projects/announcement-store";
import { CATEGORY_TONE, CATEGORY_WORDS } from "@/lib/portal/projects/announcements";

import { PinDrawer, PublishDrawer, WithdrawDrawer } from "./announcement-editors";
import { readSuppliers } from "./readings";
import { buildApplicationRows, buildRegisterRows } from "./rows";

export const dynamic = "force-dynamic";
export const metadata = { title: "Suppliers" };

const TONE = { ok: "ok", warn: "warn", err: "err", info: "info", neutral: undefined, brand: "brand" } as const;
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/**
 * The staff-side supplier register (6.15a, ADR 0019): suppliers recorded by an officer from their paper
 * applications, their documents and their applications awaiting a decision. The vendor's own workspace
 * waits for sign-in (6.15b); performance waits for 6.16 — each said in its own words, never shown as
 * if it were here (condition 3).
 */
export default async function SuppliersPage(props: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const actor = await requireStaff();
  const sp = await props.searchParams;
  const { tab, apage } = sp as { tab?: string; apage?: string };
  // The address holds one list's query at a time: the one for the tab showing. The other tab starts from its own default.
  const registerQ = parseListQuery((tab ?? "register") === "register" ? sp : {}, SUPPLIER_VIEWS, sortKeys("supplier"));
  const applicationsQ = parseListQuery(tab === "applications" ? sp : {}, APPLICATION_VIEWS, sortKeys("application"));
  const org0 = await supplierOrg(actor.organisationId);
  if (!org0) {
    return <PageHeader title="Suppliers" />;
  }
  const cfg = await loadSupplierConfig(org0.id);
  const today = org0.today;
  const p = cfg.policy;
  const bands = { criticalDays: p?.criticalDays ?? null, warningDays: p?.warningDays ?? null, upcomingDays: p?.upcomingDays ?? null };
  const bandsSet = bands.criticalDays != null && bands.warningDays != null && bands.upcomingDays != null;
  // fix R-10: each list loads only what it shows; the Expiring list reaches no further than the furthest band.
  // "Documents to see to" is judged over the whole register, then paged.
  const attentionIds = today ? await documentsToSeeToIds(org0.id, cfg.typeFacts, today) : undefined;
  const data = await listSuppliers(actor.organisationId, registerQ, today, today && bandsSet ? addDays(today, bands.upcomingDays!) : null, p?.autoSuspendOnLapse ?? null, { applications: applicationsQ, attentionIds });
  if (!data) {
    return <PageHeader title="Suppliers" />;
  }
  const { suppliers, expiring, standing: standingSuppliers, queue: openApplications } = data;
  // The register's readiness, from the one reader the public form and its submit route ask (ADR 0041 D9): what the Online tab says is still missing.
  const [online, intake] = await Promise.all([loadPortalQueue(org0.id), loadRegisterSettings()]);
  // Phase 4e (FR-VND-014): the announcements board, read only on its tab; whether the signed-in officer may publish is the organisation's grant, said in words where it is not.
  // 4e review fix: the register pages in the database (its own `apage`, so the supplier register's page is not moved).
  const board = tab === "announcements" ? await loadBoard(db, org0.id, org0.timeZone, { withdrawn: true, page: apage }) : null;
  const mayPublish = tab === "announcements" ? await permissionGate(actor, "announcements.publish") : null;
  // Phase 4c: which requests the supplier answered online in time, so a passed deadline reads "answered online" and not "lapsed".
  const answered = await answeredOnTimeIds(db, org0.id, [...openApplications.map((a) => a.id), ...suppliers.flatMap((s) => s.applications.map((a) => a.id))]);
  // a2: each supplier's standing (derived, OD-7 A) and its documents' expiry bands (FR-VND-008).
  const readings = readSuppliers([...suppliers, ...expiring, ...standingSuppliers], cfg, today);

  // ------------------------------------------------------------------ the register
  const register = buildRegisterRows(suppliers, { readings, answered, today }, { forExport: false });
  const queue = buildApplicationRows(openApplications, { answered, today }, { forExport: false });
  // ------------------------------------------------------------------ online applications, staged until an officer records them
  const onlineRows: Row[] = online.rows.map((a) => {
    const clash = a.flags.some((f) => f.code === "NUMBER_ON_REGISTER");
    const again = a.flags.some((f) => f.code === "NUMBER_SENT_AGAIN");
    const age = today ? daysFrom(a.receivedOn, today) : null;
    return {
      id: a.id,
      views: [...(clash ? ["clash"] : []), ...(again ? ["again"] : []), ...(a.withApproval ? ["approval"] : [])],
      search: [a.registeredName, a.reference, a.registrationNo].join(" "),
      sortKeys: { received: a.receivedOn },
      cells: {
        supplier: { kind: "link", text: a.registeredName, href: `/suppliers/online/${a.id}`, sub: `${a.reference} · ${a.registrationNo} · ${a.whole ? (a.withApproval ? "with approval" : plural(a.documents, "certificate", "certificates")) : "company details only"}` },
        received: { kind: "stack", title: formatDate(a.receivedOn), sub: age == null ? "Days not counted: no time zone" : age === 0 ? "Today" : `${plural(age, "day", "days")} ago` },
        check: {
          kind: "chips",
          items: a.flags.length
            ? a.flags.map((f) => ({ text: f.code === "NUMBER_ON_REGISTER" ? `Number held by ${f.holder.reference}` : `Number sent ${f.others + 1} times`, tone: flagWords(f).tone === "err" ? ("err" as const) : ("warn" as const) }))
            : [{ text: "No clash with the register", tone: "ok" as const }],
        },
      },
    };
  });

  // ------------------------------------------------------------------ a2: expiring (FR-VND-008), shown and never sent
  const SHOWN: readonly ExpiryBand[] = ["EXPIRED", "CRITICAL", "WARNING", "UPCOMING", "BANDS_NOT_SET"];
  const expiringRows: Row[] = expiring.flatMap((s) =>
    readings
      .get(s.id)!
      .expiring.filter((e) => SHOWN.includes(e.band))
      .map((e) => {
        const due = today ? reminderDue({ startsOn: startsOn(e.doc), expiresOn: e.doc.expiresOn }, cfg.reminderOffsets, today) : null;
        return {
          id: `${s.id}:${e.doc.id}`,
          views: [e.band === "EXPIRED" ? "expired" : e.band === "BANDS_NOT_SET" ? "unbanded" : "expiring"],
          search: [s.registeredName, s.reference, e.type].join(" "),
          sortKeys: { expires: e.doc.expiresOn ?? "" },
          cells: {
            supplier: { kind: "link", text: s.registeredName, href: `/suppliers/${s.id}?tab=documents`, sub: `${s.reference} · ${e.type}` },
            expires: { kind: "stack", title: formatDate(e.doc.expiresOn!), sub: e.daysLeft == null ? undefined : e.daysLeft < 0 ? `${plural(-e.daysLeft, "day", "days")} ago` : e.daysLeft === 0 ? "Today is its last day" : `In ${plural(e.daysLeft, "day", "days")}` },
            band: { kind: "chips", items: [{ text: EXPIRY_BAND_LABEL[e.band].en, tone: TONE[EXPIRY_BAND_TONE[e.band]] }, ...(e.pending ? [{ text: "Renewal lodged, not verified yet", tone: "info" as const }] : []), ...(e.upcoming ? [{ text: renewalUpcomingWords(e.upcoming), tone: "info" as const }] : [])] },
            reminder: due ? { kind: "chips", items: [{ text: `${REMINDER_NOT_SENT.en} (${due.offset} days before)`, tone: "warn" as const }] } : { kind: "text", text: cfg.reminderOffsets.length ? "None due" : "No reminder rule", dim: true },
          },
        };
      }),
  );
  expiringRows.sort((a, b) => String(a.sortKeys?.expires ?? "").localeCompare(String(b.sortKeys?.expires ?? "")));

  // ------------------------------------------------------------------ a2: standing (FR-VND-010)
  const standingRows: Row[] = standingSuppliers.flatMap((s) => {
    const st = readings.get(s.id)!.standing;
    const open = s.standingRequests.filter((r) => !r.event && !r.withdrawnAt && routeState(r.routes.map((x) => ({ status: x.status, openedAt: x.createdAt.toISOString() }))) !== "REJECTED");
    const lapseUnset = st?.notes.some((n) => n.code === "LAPSE_RULE_NOT_SET");
    if (!st || (st.standing === "ACTIVE" && !lapseUnset && open.length === 0) || st.standing === "NOT_REGISTERED") return [];
    const since = st.blacklist ?? st.cancellation ?? st.suspension;
    return [{
      id: s.id,
      views: [st.standing === "BLACKLISTED" ? "blacklisted" : st.standing === "SUSPENDED" || st.standing === "SUSPENDED_ON_LAPSE" ? "suspended" : lapseUnset ? "lapseUnset" : "requests"],
      search: [s.registeredName, s.reference, standingWords(st).en].join(" "),
      cells: {
        supplier: { kind: "link", text: s.registeredName, href: `/suppliers/${s.id}?tab=standing`, sub: s.reference },
        standing: { kind: "chips", items: [{ text: standingWords(st).en, tone: TONE[standingTone(st)] }] },
        since: since ? { kind: "stack", title: `Since ${formatDate(since.effectiveOn)}`, sub: since.kind === "BLACKLIST" ? blacklistEndWords(since.endsOn).en : eventReasonWords(since).en || undefined } : st.standing === "SUSPENDED_ON_LAPSE" || lapseUnset ? { kind: "text", text: st.lapsed.join(", ") } : { kind: "text", text: "—", dim: true },
        requests: open.length ? { kind: "chips", items: open.map((r) => ({ text: `${REQUEST_KIND_LABEL[r.kind].en}: ${routeState(r.routes.map((x) => ({ status: x.status, openedAt: x.createdAt.toISOString() }))) === "APPROVED" ? "approved, to record" : "with approval"}`, tone: "brand" as const })) } : { kind: "text", text: "—", dim: true },
      },
    }];
  });

  const { registered, unsynced } = data;
  // Derived from the documents and judged over the whole register; barred is counted in the database from the whole register (residual 1).
  const attention = attentionIds?.length ?? 0;
  const barredCount = data.barredCount;
  // A tab's own list: its search is a GET form to /suppliers that keeps the tab, and its links carry the tab.
  const tabMode = (id: string, q: ListQuery, o: { total: number; page: number; sortColumns: Record<string, string> }): ServerMode => {
    const over = o.total > LIST_EXPORT_MAX_ROWS;
    const m = serverMode(`/suppliers?tab=${id}`, q, { ...o, exportHref: over ? undefined : listHref(`/suppliers/export?tab=${id}`, { q: q.q, view: q.view, sort: q.sort, dir: q.dir }), exportBlocked: over ? "This view cannot be exported" : undefined });
    return { ...m, action: "/suppliers", keep: { tab: id, ...m.keep } };
  };
  const registerAt = (v: (typeof SUPPLIER_VIEWS)[number] | null) => listHref("/suppliers?tab=register", { q: registerQ.q, view: v, sort: registerQ.sort, dir: registerQ.dir, size: registerQ.size });
  const applicationsAt = (v: (typeof APPLICATION_VIEWS)[number] | null) => listHref("/suppliers?tab=applications", { q: applicationsQ.q, view: v, sort: applicationsQ.sort, dir: applicationsQ.dir, size: applicationsQ.size });
  const registerViews = [
    { id: null, label: "All" },
    { id: "registered", label: `Registered (${registered})` },
    { id: "applicants", label: `Applicants (${data.applicants})` },
    { id: "attention", label: `Documents to see to${today ? ` (${attention})` : ""}` },
    { id: "barred", label: `Suspended or blacklisted${barredCount == null ? "" : ` (${barredCount})`}` },
    { id: "unsynced", label: `${ERP_NOT_SYNCED.en} (${unsynced})` },
  ] as const;
  const applicationViews = [
    { id: null, label: "All" },
    { id: "received", label: `Received (${data.applicationCounts.received})` },
    { id: "approval", label: `With approval (${data.applicationCounts.approval})` },
    { id: "resubmission", label: `Resubmission requested (${data.applicationCounts.resubmission})` },
    { id: "lapsed", label: `Lapsed: record the lapse (${data.applicationCounts.lapsed})` },
  ] as const;

  const tabs = [
    {
      id: "register",
      label: "Register",
      icon: <BuildingIcon size={15} />,
      count: registerQ.q || registerQ.view ? undefined : data.total,
      panel: (
        <Card className="overflow-hidden">
          <CardHeader icon={<BuildingIcon size={17} />} title="The register" subtitle="Newest first" divided={false} />
          <div className="flex flex-wrap gap-1.5 px-5 pb-3 sm:px-6">
            {registerViews.map((v) => (
              <ButtonLink key={v.id ?? "all"} href={registerAt(v.id)} size="sm" variant={(registerQ.view ?? null) === v.id ? "secondary" : "ghost"} aria-current={(registerQ.view ?? null) === v.id ? "page" : undefined}>
                {v.label}
              </ButtonLink>
            ))}
          </div>
          <DataList
            flat
            selectable={false}
            exportName="suppliers"
            searchPlaceholder="Search by name, reference or registration number"
            emptyTitle="No supplier is recorded yet. Record a paper application to start."
            rowAction={{ label: "Open", hrefTemplate: "/suppliers/{id}" }}
            rowOpens
            stackBelow="xl"
            columns={[
              { key: "supplier", label: "Supplier", mobile: "primary" },
              { key: "status", label: "Standing", width: "220px", mobile: "meta" },
              { key: "documents", label: "Documents", width: "200px", mobile: "meta" },
              { key: "where", label: "Status", width: "250px", mobile: "meta" },
            ]}
            rows={register}
            server={tabMode("register", registerQ, { total: data.total, page: data.page, sortColumns: { supplier: "name" } })}
          />
        </Card>
      ),
    },
    {
      id: "applications",
      label: "Applications",
      icon: <ClipboardIcon size={15} />,
      count: data.queueTotal,
      panel: (
        <Card className="overflow-hidden">
          <CardHeader icon={<ClipboardIcon size={17} />} title="Applications awaiting a decision" subtitle="Oldest first" divided={false} />
          <div className="flex flex-wrap gap-1.5 px-5 pb-3 sm:px-6">
            {applicationViews.map((v) => (
              <ButtonLink key={v.id ?? "all"} href={applicationsAt(v.id)} size="sm" variant={(applicationsQ.view ?? null) === v.id ? "secondary" : "ghost"} aria-current={(applicationsQ.view ?? null) === v.id ? "page" : undefined}>
                {v.label}
              </ButtonLink>
            ))}
          </div>
          <DataList
            flat
            selectable={false}
            exportName="supplier-applications"
            searchPlaceholder="Search by supplier"
            emptyTitle="Nothing awaiting a decision"
            columns={[
              { key: "supplier", label: "Supplier", mobile: "primary" },
              { key: "received", label: "Received", width: "170px", mobile: "meta" },
              { key: "state", label: "Status", width: "220px", mobile: "meta" },
              { key: "deadline", label: "Deadline", width: "190px", hideBelow: "md", mobile: "meta" },
            ]}
            rows={queue}
            server={tabMode("applications", applicationsQ, { total: data.applicationsTotal, page: data.applicationsPage, sortColumns: { supplier: "name", received: "date" } })}
          />
        </Card>
      ),
    },
    {
      id: "portal",
      label: "Online",
      icon: <GlobeIcon size={15} />,
      count: online.total,
      panel: (
        <div className="flex flex-col gap-4">
          {intake && intake.missing.length > 0 && (
            <Callout tone="warn" title="Public form closed" action={<ButtonLink href="/configuration/suppliers#online-applications" size="sm">Open the settings</ButtonLink>}>
              Not set: {intake.missing.map((m) => m.en).join(", ")}.
            </Callout>
          )}
          <Card className="overflow-hidden">
            <CardHeader icon={<GlobeIcon size={17} />} title="Online applications waiting" subtitle="Oldest first" divided={false} />
            <DataList
              flat
              selectable={false}
              exportName="online-applications"
              searchPlaceholder="Search by company, reference or registration number"
              emptyTitle="No online application is waiting"
              views={[
                { id: "clash", label: "Number on the register" },
                { id: "again", label: "Number sent more than once" },
                { id: "approval", label: "With approval" },
              ]}
              rowAction={{ label: "Open", hrefTemplate: "/suppliers/online/{id}" }}
              rowOpens
              stackBelow="xl"
              columns={[
                { key: "supplier", label: "Company", mobile: "primary" },
                { key: "received", label: "Sent", width: "170px", sortable: true, mobile: "meta" },
                { key: "check", label: "Against the register", width: "260px", mobile: "meta" },
              ]}
              rows={onlineRows}
            />
            {online.total > onlineRows.length && <CardFooter className="text-[12.5px] text-ink-3">Showing the oldest {onlineRows.length} of {online.total}.</CardFooter>}
          </Card>
        </div>
      ),
    },
    {
      id: "expiring",
      label: "Expiring",
      icon: <ClockIcon size={15} />,
      count: expiringRows.filter((r) => !r.views?.includes("unbanded")).length,
      panel: (
        <div className="flex flex-col gap-4">
          {!bandsSet && (
            <Callout tone="warn" title="Expiry bands not set. Documents are not banded." />
          )}
          <Card className="overflow-hidden">
            <CardHeader icon={<ClockIcon size={17} />} title="Documents expiring" subtitle={cfg.reminderOffsets.length ? "Soonest first" : "Soonest first · no reminder rule"} divided={false} />
            <DataList
              flat
              selectable={false}
              exportName="supplier-documents-expiring"
              searchPlaceholder="Search by supplier or document"
              emptyTitle="Nothing expiring"
              views={[
                { id: "expiring", label: "Within the bands" },
                { id: "expired", label: "Expired" },
                ...(bandsSet ? [] : [{ id: "unbanded", label: "Bands not set" }]),
              ]}
              stackBelow="xl"
              columns={[
                { key: "supplier", label: "Supplier and document", mobile: "primary" },
                { key: "expires", label: "Expires", width: "170px", sortable: true, mobile: "meta" },
                { key: "band", label: "Band", width: "230px", mobile: "meta" },
                { key: "reminder", label: "Reminder", width: "250px", mobile: "meta" },
              ]}
              rows={expiringRows}
            />
            {data.expiringTotal > expiring.length && <CardFooter className="text-[12.5px] text-ink-3">{`Read from the ${expiring.length} suppliers whose documents expire soonest, of ${data.expiringTotal} with a document in force near or past its expiry.`}</CardFooter>}
          </Card>
        </div>
      ),
    },
    {
      id: "standing",
      label: "Standing",
      icon: <ShieldIcon size={15} />,
      count: standingRows.length,
      panel: (
        <Card className="overflow-hidden">
          <CardHeader icon={<ShieldIcon size={17} />} title="Standing" subtitle="Barred or cancelled" divided={false} />
          <DataList
            flat
            selectable={false}
            exportName="supplier-standing"
            searchPlaceholder="Search by supplier"
            emptyTitle="Every registered supplier is active"
            views={[
              { id: "suspended", label: "Suspended" },
              { id: "blacklisted", label: "Blacklisted" },
              { id: "lapseUnset", label: "Lapse rule not set" },
              { id: "requests", label: "Asked for" },
            ]}
            stackBelow="xl"
            columns={[
              { key: "supplier", label: "Supplier", mobile: "primary" },
              { key: "standing", label: "Standing", width: "260px", mobile: "meta" },
              { key: "since", label: "Since", width: "190px", mobile: "meta" },
              { key: "requests", label: "Asked for", width: "240px", mobile: "meta" },
            ]}
            rows={standingRows}
          />
          {data.standingTotal > standingSuppliers.length && <CardFooter className="text-[12.5px] text-ink-3">{`Showing ${standingSuppliers.length} of ${data.standingTotal} suppliers barred, with a blacklisting asked for, or with the lapse rule not set; each group by name, up to ${SUPPLIERS_PAGE}.`}</CardFooter>}
        </Card>
      ),
    },
    {
      id: "announcements",
      label: "Announcements",
      icon: <BellIcon size={15} />,
      lazy: true,
      panel:
        board && mayPublish ? (
          <Card className="overflow-hidden">
            <CardHeader
              icon={<BellIcon size={17} />}
              title="Announcements to suppliers"
              subtitle="Pinned first"
              actions={mayPublish.ok ? <PublishDrawer /> : undefined}
              divided={board.total > 0}
            />
            {!mayPublish.ok && (
              <div className="px-5 pt-4 sm:px-6">
                <Callout tone="warn" title="You cannot publish">{mayPublish.message}</Callout>
              </div>
            )}
            {board.total === 0 ? (
              <EmptyState size="sm" title="Nothing published" />
            ) : (
              <ul className="divide-y divide-line/70">
                {board.items.map((a) => (
                  <li key={a.id} className="flex flex-col gap-2 px-5 py-4 sm:flex-row sm:items-start sm:justify-between sm:px-6">
                    <span className="min-w-0">
                      <span className="flex flex-wrap items-center gap-2">
                        <Badge tone={CATEGORY_TONE[a.category] === "neutral" ? undefined : CATEGORY_TONE[a.category]}>{CATEGORY_WORDS[a.category].en}</Badge>
                        {a.pinned && <Chip tone="brand">Pinned</Chip>}
                        {a.withdrawnAt && <Chip tone="warn">{`Withdrawn ${a.withdrawnText}`}</Chip>}
                      </span>
                      <span className="block text-[14.5px] font-semibold text-ink">{a.title}</span>
                      <span className="block text-[12.5px] text-ink-3">{`Published ${a.publishedText} by ${a.publishedBy}${a.withdrawReason ? ` · withdrawn: ${a.withdrawReason}` : ""}`}</span>
                      <span className="mt-1 block text-[13.5px] break-words whitespace-pre-line text-ink-2">{a.body}</span>
                    </span>
                    {mayPublish.ok && !a.withdrawnAt && (
                      <span className="flex shrink-0 flex-wrap items-center gap-2">
                        <PinDrawer id={a.id} title={a.title} pinned={a.pinned} />
                        <WithdrawDrawer id={a.id} title={a.title} />
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            )}
            {board.total > BOARD_PAGE && (
              <CardFooter className="flex flex-wrap items-center justify-between gap-2 text-[12.5px] text-ink-3">
                <span>{`${board.page * BOARD_PAGE + 1}–${Math.min(board.total, (board.page + 1) * BOARD_PAGE)} of ${board.total}, pinned first, then newest first.`}</span>
                <span className="flex gap-2">
                  {board.page > 0 && <ButtonLink href={`/suppliers?tab=announcements&apage=${board.page}`} size="sm" variant="ghost">Previous</ButtonLink>}
                  {(board.page + 1) * BOARD_PAGE < board.total && <ButtonLink href={`/suppliers?tab=announcements&apage=${board.page + 2}`} size="sm" variant="ghost">Next</ButtonLink>}
                </span>
              </CardFooter>
            )}
          </Card>
        ) : null,
    },
  ];

  return (
    <>
      <PageHeader
        title="Suppliers"
        info={{ title: "Suppliers", text: "Register, applications, documents and standing. Reminders and notices show here." }}
        actions={<ButtonLink href="/suppliers/new" size="sm" variant="primary">Record a paper application</ButtonLink>}
      />
      <StatusCounts
        label="Where the register stands"
        className="mb-6"
        items={[
          { label: "Registered", count: registered, href: "/suppliers?tab=register&view=registered" },
          { label: "Awaiting a decision", count: data.queueTotal, href: "/suppliers?tab=applications", tone: "info" },
          { label: "With documents to see to", count: attention, href: "/suppliers?tab=register&view=attention", tone: "warn" },
          { label: "Suspended or blacklisted", count: barredCount ?? 0, href: "/suppliers?tab=standing", tone: "err" },
          { label: ERP_NOT_SYNCED.en, count: unsynced, href: "/suppliers?tab=register&view=unsynced", tone: "warn" },
        ]}
      />
      {barredCount == null && <Callout tone="warn" className="mb-6" title="Suspended and blacklisted suppliers are not judged." />}
      <Tabs initial={tab} label="Suppliers" tabs={tabs} />
    </>
  );
}
