import { DataList, type Row } from "@/components/data-list";
import { BellIcon, BuildingIcon, ClipboardIcon, ClockIcon, GlobeIcon, ShieldIcon } from "@/components/icons";
import { Badge, Chip } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/feedback";
import { Tabs } from "@/components/tabs";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardFooter, CardHeader } from "@/components/ui/card";
import { Callout } from "@/components/ui/feedback";
import { PageHeader } from "@/components/ui/page-header";
import { loadRegistrationForm } from "@/lib/portal/apply-repo";
import { flagWords } from "@/lib/portal/queue";
import { loadPortalQueue } from "@/lib/portal/queue-repo";
import { daysBetween } from "@/lib/requisition/types";
import { storedDay } from "@/lib/dates";
import { addDays } from "@/lib/securities/period";
import { formatDate } from "@/lib/format";
import { routeState } from "@/lib/suppliers/blacklist";
import { documentStates, stateCounts } from "@/lib/suppliers/documents";
import { expiryBand, reminderDue, startsOn, worstBand, type ExpiryBand } from "@/lib/suppliers/expiry";
import { APPLICATION_KIND_LABEL, blacklistEndWords, CHANNEL_LABEL, eventReasonWords, renewalUpcomingWords, DOCUMENT_STATE_LABEL, ERP_NOT_SYNCED, EXPIRY_BAND_LABEL, EXPIRY_BAND_TONE, QUEUE_STATE_LABEL, QUEUE_STATE_TONE, REMINDER_NOT_SENT, REQUEST_KIND_LABEL, standingTone, standingWords, SUPPLIER_STATUS_LABEL, SUPPLIER_STATUS_TONE } from "@/lib/suppliers/labels";
import { db } from "@/lib/db";
import { answeredOnTimeIds, documentFacts, listSuppliers, loadSupplierConfig, supplierOrg, SUPPLIERS_PAGE } from "@/lib/suppliers/repo";
import { queueState, type QueueState } from "@/lib/suppliers/review";
import { standing } from "@/lib/suppliers/standing";
import { standingEventFacts } from "@/lib/suppliers/standing-repo";
import type { ApplicationKind, SupplierStatus } from "@/lib/suppliers/types";
import { permissionGate, requireStaff } from "@/app/_auth/actor";
import { loadBoard } from "@/lib/portal/projects/announcement-store";
import { CATEGORY_TONE, CATEGORY_WORDS } from "@/lib/portal/projects/announcements";

import { PinDrawer, PublishDrawer, WithdrawDrawer } from "./announcement-editors";

export const dynamic = "force-dynamic";

const TONE = { ok: "ok", warn: "warn", err: "err", info: "info", neutral: undefined, brand: "brand" } as const;
const day = (d: Date | null) => (d ? storedDay(d) : null);
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/**
 * The staff-side supplier register (6.15a, ADR 0019): suppliers recorded by an officer from their paper
 * applications, their documents and their applications awaiting a decision. The vendor's own workspace
 * waits for sign-in (6.15b); performance waits for 6.16 — each said in its own words, never shown as
 * if it were here (condition 3).
 */
export default async function SuppliersPage(props: { searchParams: Promise<{ tab?: string; page?: string }> }) {
  const actor = await requireStaff();
  const { tab, page: raw } = await props.searchParams;
  const requested = Math.max(0, Number.parseInt(raw ?? "0", 10) || 0);
  const org0 = await supplierOrg(actor.organisationId);
  if (!org0) {
    return <PageHeader title="Suppliers" subtitle="The supplier register." />;
  }
  const cfg = await loadSupplierConfig(org0.id);
  const today = org0.today;
  const p = cfg.policy;
  const bands = { criticalDays: p?.criticalDays ?? null, warningDays: p?.warningDays ?? null, upcomingDays: p?.upcomingDays ?? null };
  const bandsSet = bands.criticalDays != null && bands.warningDays != null && bands.upcomingDays != null;
  // fix R-10: each list loads only what it shows; the Expiring list reaches no further than the furthest band.
  const data = await listSuppliers(actor.organisationId, requested, today, today && bandsSet ? addDays(today, bands.upcomingDays!) : null, p?.autoSuspendOnLapse ?? null);
  if (!data) {
    return <PageHeader title="Suppliers" subtitle="The supplier register." />;
  }
  const { suppliers, expiring, standing: standingSuppliers, queue: openApplications } = data;
  const [online, intake] = await Promise.all([loadPortalQueue(org0.id), loadRegistrationForm()]);
  // Phase 4e (FR-VND-014): the announcements board, read only on its tab; whether the signed-in officer may publish is the organisation's grant, said in words where it is not.
  const board = tab === "announcements" ? await loadBoard(db, org0.id, org0.timeZone, { withdrawn: true }) : null;
  const mayPublish = tab === "announcements" ? await permissionGate(actor, "announcements.publish") : null;
  // Phase 4c: which requests the supplier answered online in time, so a passed deadline reads "answered online" and not "lapsed".
  const answered = await answeredOnTimeIds(db, org0.id, [...openApplications.map((a) => a.id), ...suppliers.flatMap((s) => s.applications.map((a) => a.id))]);
  const pages = Math.max(1, Math.ceil(data.total / SUPPLIERS_PAGE));
  const typeExpires = new Map(cfg.types.map((t) => [t.id, t.expires]));

  // a2: each supplier's standing (derived, OD-7 A) and its documents' expiry bands (FR-VND-008).
  const readings = new Map(
    [...suppliers, ...expiring, ...standingSuppliers].map((s) => {
      const docs = s.documents.map(documentFacts);
      const states = today ? documentStates(cfg.typeFacts, docs, today) : [];
      const st = today ? standing({ status: s.status as SupplierStatus, registeredOn: day(s.registeredOn) }, s.standingEvents.map(standingEventFacts), states.filter((x) => x.mandatory).map((x) => ({ typeLabel: x.type.label, state: x.state })), { autoSuspendOnLapse: p?.autoSuspendOnLapse ?? null }, today) : null;
      // The band of each type's document in force (a renewal counts once verified).
      const expiring = today ? states.filter((x) => x.effective && !x.effective.notApplicable && x.effective.expiresOn && typeExpires.get(x.type.id) !== false).map((x) => ({ type: x.type.label, doc: x.effective!, pending: !!x.pending, upcoming: x.upcoming?.validFrom ?? null, ...expiryBand(x.effective!.expiresOn, today, bands) })) : [];
      return [s.id, { states, standing: st, expiring, worst: worstBand(expiring.map((e) => e.band).filter((b) => b !== "NONE")) }] as const;
    }),
  );

  // ------------------------------------------------------------------ the register
  const register: Row[] = suppliers.map((s) => {
    const status = s.status as SupplierStatus;
    const rd = readings.get(s.id)!;
    const states = rd.states;
    const counts = stateCounts(states);
    const issues = (["MISSING", "EXPIRED", "NOT_IN_ORDER", "NOT_CHECKED", "NOT_YET_VALID"] as const).filter((k) => counts[k]);
    const open = s.applications[0];
    return {
      id: s.id,
      views: [...(status === "REGISTERED" ? ["registered"] : []), ...(status === "APPLICANT" ? ["applicants"] : []), ...(rd.standing && rd.standing.standing !== "ACTIVE" && rd.standing.standing !== "NOT_REGISTERED" ? ["barred"] : []), ...(status === "REGISTERED" && !s.erpVendorCode ? ["unsynced"] : []), ...(issues.length ? ["attention"] : [])],
      search: [s.registeredName, s.reference, s.registrationNo, SUPPLIER_STATUS_LABEL[status].en].join(" "),
      sortKeys: { supplier: s.registeredName },
      cells: {
        supplier: { kind: "link", text: s.registeredName, href: `/suppliers/${s.id}`, sub: `${s.reference} · ${s.registrationNo}` },
        status: rd.standing && status === "REGISTERED" ? { kind: "chips", items: [{ text: standingWords(rd.standing).en, tone: TONE[standingTone(rd.standing)] }] } : { kind: "badge", text: SUPPLIER_STATUS_LABEL[status].en, tone: TONE[SUPPLIER_STATUS_TONE[status]] },
        documents: {
          kind: "chips",
          items: !today
            ? [{ text: "Not judged: the organisation's time zone is not set", tone: "warn" as const }]
            : [
                ...(issues.length
                  ? issues.map((k) => ({ text: `${counts[k]} ${DOCUMENT_STATE_LABEL[k].en.toLowerCase()}`, tone: k === "NOT_CHECKED" || k === "NOT_YET_VALID" ? ("warn" as const) : ("err" as const) }))
                  : [{ text: states.length ? "In order" : "None lodged", tone: states.length ? ("ok" as const) : ("warn" as const) }]),
                ...(rd.worst && rd.worst !== "EXPIRED" && rd.worst !== "NO_EXPIRY" ? [{ text: `Expiry: ${EXPIRY_BAND_LABEL[rd.worst].en.toLowerCase()}`, tone: TONE[EXPIRY_BAND_TONE[rd.worst]] }] : []),
              ],
        },
        where: {
          kind: "chips",
          items: [
            ...(open ? [{ text: `${APPLICATION_KIND_LABEL[open.kind as ApplicationKind].en}: ${QUEUE_STATE_LABEL[queueState({ ...open, resubmitBy: day(open.resubmitBy), answeredOnTime: answered.has(open.id) }, today)].en.toLowerCase()}`, tone: "brand" as const }] : []),
            ...(status === "REGISTERED" ? [s.erpVendorCode ? { text: `Vendor code ${s.erpVendorCode}`, tone: "ok" as const } : { text: ERP_NOT_SYNCED.en, tone: "warn" as const }] : []),
          ],
        },
      },
    };
  });

  // ------------------------------------------------------------------ the applications queue
  const queue: Row[] = openApplications.map((a) => {
    const s = a.supplier;
    const st: QueueState = queueState({ ...a, resubmitBy: day(a.resubmitBy), answeredOnTime: answered.has(a.id) }, today);
    const received = storedDay(a.receivedOn);
    const age = today ? daysBetween(received, today) : null;
    return {
      id: a.id,
      views: [st === "WITH_APPROVAL" ? "approval" : st === "LAPSED" ? "lapsed" : st === "RESUBMISSION_REQUESTED" ? "resubmission" : "received"],
      search: [s.registeredName, s.reference, APPLICATION_KIND_LABEL[a.kind as ApplicationKind].en, CHANNEL_LABEL[a.channel].en, QUEUE_STATE_LABEL[st].en].join(" "),
      sortKeys: { received },
      cells: {
        supplier: { kind: "link", text: s.registeredName, href: `/suppliers/${s.id}?tab=applications`, sub: `${s.reference} · ${APPLICATION_KIND_LABEL[a.kind as ApplicationKind].en} · ${CHANNEL_LABEL[a.channel].en}` },
        received: { kind: "stack", title: formatDate(received), sub: age == null ? "Days not counted: no time zone" : age === 0 ? "Today" : `${plural(age, "day", "days")} ago` },
        state: { kind: "badge", text: QUEUE_STATE_LABEL[st].en, tone: TONE[QUEUE_STATE_TONE[st]] },
        deadline: { kind: "text", text: a.resubmitBy && a.status === "RESUBMISSION_REQUESTED" ? `Resubmit by ${formatDate(day(a.resubmitBy))}` : "—", dim: !a.resubmitBy },
      },
    };
  });
  // ------------------------------------------------------------------ online applications, staged until an officer records them
  const onlineRows: Row[] = online.rows.map((a) => {
    const clash = a.flags.some((f) => f.code === "NUMBER_ON_REGISTER");
    const again = a.flags.some((f) => f.code === "NUMBER_SENT_AGAIN");
    const age = today ? daysBetween(a.receivedOn, today) : null;
    return {
      id: a.id,
      views: [...(clash ? ["clash"] : []), ...(again ? ["again"] : [])],
      search: [a.registeredName, a.reference, a.registrationNo].join(" "),
      sortKeys: { received: a.receivedOn },
      cells: {
        supplier: { kind: "link", text: a.registeredName, href: `/suppliers/online/${a.id}`, sub: `${a.reference} · ${a.registrationNo}` },
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

  // Oldest first: the order a queue is worked in.
  queue.sort((a, b) => String(a.sortKeys?.received ?? "").localeCompare(String(b.sortKeys?.received ?? "")));
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
  const paged = data.total > SUPPLIERS_PAGE;
  // Derived from the documents, so counted on the page shown; barred is counted in the database from the whole register (residual 1).
  const attention = register.filter((r) => r.views?.includes("attention")).length;
  const barredCount = data.barredCount;

  const tabs = [
    {
      id: "register",
      label: "Register",
      icon: <BuildingIcon size={15} />,
      count: data.total,
      panel: (
        <Card className="overflow-hidden">
          <CardHeader icon={<BuildingIcon size={17} />} title="The register" subtitle="Every supplier recorded, by name. Its documents are judged on the organisation's day: a renewal counts once verified." divided={false} />
          <DataList
            flat
            selectable={false}
            exportName="suppliers"
            searchPlaceholder="Search by name, reference or registration number"
            emptyTitle="No supplier recorded yet"
            emptyBody="Record one from its paper application."
            views={[
              { id: "registered", label: "Registered" },
              { id: "applicants", label: "Applicants" },
              { id: "attention", label: "Documents to see to" },
              { id: "barred", label: "Suspended or blacklisted" },
              { id: "unsynced", label: ERP_NOT_SYNCED.en },
            ]}
            rowAction={{ label: "Open", hrefTemplate: "/suppliers/{id}" }}
            rowOpens
            stackBelow="xl"
            columns={[
              { key: "supplier", label: "Supplier", sortable: true, mobile: "primary" },
              { key: "status", label: "Standing", width: "220px", mobile: "meta" },
              { key: "documents", label: "Documents", width: "200px", mobile: "meta" },
              { key: "where", label: "Status", width: "250px", mobile: "meta" },
            ]}
            rows={register}
          />
          {pages > 1 && (
            <CardFooter className="flex flex-wrap items-center justify-between gap-2 text-[12.5px] text-ink-3">
              <span>
                Suppliers {data.page * SUPPLIERS_PAGE + 1}–{Math.min(data.total, (data.page + 1) * SUPPLIERS_PAGE)} of {data.total}, by name. Search and the views look within this page.
              </span>
              <span className="flex gap-2">
                {data.page > 0 && <ButtonLink href={`/suppliers?tab=register&page=${data.page - 1}`} size="sm" variant="ghost">Previous</ButtonLink>}
                {data.page + 1 < pages && <ButtonLink href={`/suppliers?tab=register&page=${data.page + 1}`} size="sm" variant="ghost">Next</ButtonLink>}
              </span>
            </CardFooter>
          )}
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
          <CardHeader icon={<ClipboardIcon size={17} />} title="Applications awaiting a decision" subtitle="Open applications, oldest first. The days since it was received are a count, not a judgement: no service level is set." divided={false} />
          <DataList
            flat
            selectable={false}
            exportName="supplier-applications"
            searchPlaceholder="Search by supplier"
            emptyTitle="Nothing awaiting a decision"
            emptyBody="An application, recorded from paper or sent through the supplier portal, appears here until it is decided."
            views={[
              { id: "received", label: "Received" },
              { id: "approval", label: "With approval" },
              { id: "resubmission", label: "Resubmission requested" },
              { id: "lapsed", label: "Lapsed: record the lapse" },
            ]}
            columns={[
              { key: "supplier", label: "Supplier", mobile: "primary" },
              { key: "received", label: "Received", width: "170px", sortable: true, mobile: "meta" },
              { key: "state", label: "Status", width: "220px", mobile: "meta" },
              { key: "deadline", label: "Deadline", width: "190px", hideBelow: "md", mobile: "meta" },
            ]}
            rows={queue}
          />
          {data.queueTotal > queue.length && <CardFooter className="text-[12.5px] text-ink-3">Showing the oldest {queue.length} of {data.queueTotal}.</CardFooter>}
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
          {intake.ready && intake.missing.length > 0 && (
            <Callout tone="warn" title="The public form is closed" action={<ButtonLink href="/configuration/suppliers#online-applications" size="sm">Open the settings</ButtonLink>}>
              Nothing can arrive until it is set up. Still to be set: {intake.missing.map((m) => m.en).join(", ")}.
            </Callout>
          )}
          <Card className="overflow-hidden">
            <CardHeader icon={<GlobeIcon size={17} />} title="Online applications waiting" subtitle="Sent through the supplier portal and not yet on the register: none holds a registration number's place, and none is a supplier until an officer records it. Oldest first." divided={false} />
            <DataList
              flat
              selectable={false}
              exportName="online-applications"
              searchPlaceholder="Search by company, reference or registration number"
              emptyTitle="No online application is waiting"
              emptyBody="An application sent through the supplier portal appears here until an officer records the supplier from it or sets it aside."
              views={[
                { id: "clash", label: "Number on the register" },
                { id: "again", label: "Number sent more than once" },
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
            <Callout tone="warn" title="The expiry bands are not set">
              No document is banded critical, warning or upcoming until they are set under Configuration › Supplier register, Standing. Each document with an expiry is listed as “bands not set”, never as valid.
            </Callout>
          )}
          <Card className="overflow-hidden">
            <CardHeader icon={<ClockIcon size={17} />} title="Documents expiring" subtitle={`Each type's document in force, soonest first. A reminder due is shown here and never sent: nothing is sent from the portal in this phase.${cfg.reminderOffsets.length ? "" : " No reminder rule is set for document expiry (Configuration › Notifications)."}`} divided={false} />
            <DataList
              flat
              selectable={false}
              exportName="supplier-documents-expiring"
              searchPlaceholder="Search by supplier or document"
              emptyTitle="Nothing expiring"
              emptyBody="No document in force is within the bands, or expired."
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
          <CardHeader icon={<ShieldIcon size={17} />} title="Standing" subtitle="Suppliers suspended, blacklisted or with their registration cancelled; those whose lapse rule is not set; and blacklistings asked for. Standing is derived from what is recorded, never stored." divided={false} />
          <DataList
            flat
            selectable={false}
            exportName="supplier-standing"
            searchPlaceholder="Search by supplier"
            emptyTitle="Every registered supplier is active"
            emptyBody="Nothing is suspended, blacklisted or asked for."
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
              subtitle="Published to every signed-in supplier on the portal's Announcements page, pinned ones first; shown there and not sent by email. Withdrawn ones are kept here with their reason."
              actions={mayPublish.ok ? <PublishDrawer /> : undefined}
              divided={board.length > 0}
            />
            {!mayPublish.ok && (
              <div className="px-5 pt-4 sm:px-6">
                <Callout tone="neutral" title="You cannot publish">{mayPublish.message}</Callout>
              </div>
            )}
            {board.length === 0 ? (
              <EmptyState size="sm" title="Nothing published yet">An announcement marked Important, Policy or Notice appears on the supplier portal once published.</EmptyState>
            ) : (
              <ul className="divide-y divide-line/70">
                {board.map((a) => (
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
          </Card>
        ) : null,
    },
  ];

  return (
    <>
      <PageHeader
        title="Suppliers"
        subtitle="Suppliers from paper or portal applications, with their documents and decisions."
        meta={[plural(registered, "registered", "registered"), plural(data.queueTotal, "application awaiting a decision", "applications awaiting a decision"), paged ? `${attention} with documents to see to on this page` : plural(attention, "with documents to see to", "with documents to see to"), barredCount == null ? "Suspended or blacklisted: not judged, the time zone is not set" : plural(barredCount, "suspended or blacklisted", "suspended or blacklisted"), `${unsynced} ${ERP_NOT_SYNCED.en.toLowerCase()}`]}
        actions={<ButtonLink href="/suppliers/new" size="sm" variant="primary">Record a paper application</ButtonLink>}
      />
      <div className="mb-6 flex flex-col gap-3">
        <Callout tone="info" title="Not here yet">
          Contractor performance reports and the grade they give arrive with contractor performance (6.16). A company may apply to register through the public form on the supplier portal; that application waits on the Online tab, apart from the register, until an officer checks it against the certificate and records the supplier from it. The supplier then signs in and completes its registration (documents, work codes, bank details and declarations); once it sends that, it becomes an application here, marked as sent through the portal, and is not decided until the office has checked it. Online purchase of documents and bids by the suppliers themselves, and reminders and notices sent to a supplier, arrive with the vendor portal, once vendors can sign in (6.15b). Until then every reminder and notice is shown here, not sent.
        </Callout>
      </div>
      <Tabs initial={tab} label="Suppliers" tabs={tabs} />
    </>
  );
}
