import { DataList, type Row } from "@/components/data-list";
import { BuildingIcon, ClipboardIcon } from "@/components/icons";
import { Tabs } from "@/components/tabs";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Callout } from "@/components/ui/feedback";
import { PageHeader } from "@/components/ui/page-header";
import { daysBetween } from "@/lib/requisition/types";
import { storedDay } from "@/lib/dates";
import { formatDate } from "@/lib/format";
import { documentStates, stateCounts } from "@/lib/suppliers/documents";
import { APPLICATION_KIND_LABEL, DOCUMENT_STATE_LABEL, ERP_NOT_SYNCED, QUEUE_STATE_LABEL, QUEUE_STATE_TONE, SUPPLIER_STATUS_LABEL, SUPPLIER_STATUS_TONE } from "@/lib/suppliers/labels";
import { documentFacts, listSuppliers, loadSupplierConfig } from "@/lib/suppliers/repo";
import { isOpen, queueState, type QueueState } from "@/lib/suppliers/review";
import type { ApplicationKind, SupplierStatus } from "@/lib/suppliers/types";

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
export default async function SuppliersPage(props: { searchParams: Promise<{ tab?: string }> }) {
  const { tab } = await props.searchParams;
  const data = await listSuppliers();
  if (!data) {
    return <PageHeader title="Suppliers" subtitle="The supplier register." />;
  }
  const { org, suppliers } = data;
  const cfg = await loadSupplierConfig(org.id);
  const today = org.today;

  // ------------------------------------------------------------------ the register
  const register: Row[] = suppliers.map((s) => {
    const status = s.status as SupplierStatus;
    const states = today ? documentStates(cfg.typeFacts, s.documents.map(documentFacts), today) : [];
    const counts = stateCounts(states);
    const issues = (["MISSING", "EXPIRED", "NOT_IN_ORDER", "NOT_CHECKED", "NOT_YET_VALID"] as const).filter((k) => counts[k]);
    const open = s.applications.find(isOpen);
    return {
      id: s.id,
      views: [...(status === "REGISTERED" ? ["registered"] : []), ...(status === "APPLICANT" ? ["applicants"] : []), ...(status === "REGISTERED" && !s.erpVendorCode ? ["unsynced"] : []), ...(issues.length ? ["attention"] : [])],
      search: [s.registeredName, s.reference, s.registrationNo, SUPPLIER_STATUS_LABEL[status].en].join(" "),
      sortKeys: { supplier: s.registeredName },
      cells: {
        supplier: { kind: "link", text: s.registeredName, href: `/suppliers/${s.id}`, sub: `${s.reference} · ${s.registrationNo}` },
        status: { kind: "badge", text: SUPPLIER_STATUS_LABEL[status].en, tone: TONE[SUPPLIER_STATUS_TONE[status]] },
        documents: {
          kind: "chips",
          items: !today
            ? [{ text: "Not judged: the organisation's time zone is not set", tone: "warn" as const }]
            : issues.length
              ? issues.map((k) => ({ text: `${counts[k]} ${DOCUMENT_STATE_LABEL[k].en.toLowerCase()}`, tone: k === "NOT_CHECKED" || k === "NOT_YET_VALID" ? ("warn" as const) : ("err" as const) }))
              : [{ text: states.length ? "In order" : "None lodged", tone: states.length ? ("ok" as const) : ("warn" as const) }],
        },
        where: {
          kind: "chips",
          items: [
            ...(open ? [{ text: `${APPLICATION_KIND_LABEL[open.kind as ApplicationKind].en}: ${QUEUE_STATE_LABEL[queueState({ ...open, resubmitBy: day(open.resubmitBy) }, today)].en.toLowerCase()}`, tone: "brand" as const }] : []),
            ...(status === "REGISTERED" ? [s.erpVendorCode ? { text: `Vendor code ${s.erpVendorCode}`, tone: "ok" as const } : { text: ERP_NOT_SYNCED.en, tone: "warn" as const }] : []),
          ],
        },
      },
    };
  });

  // ------------------------------------------------------------------ the applications queue
  const queue: Row[] = suppliers.flatMap((s) =>
    s.applications
      .filter((a) => isOpen(a))
      .map((a) => {
        const st: QueueState = queueState({ ...a, resubmitBy: day(a.resubmitBy) }, today);
        const received = storedDay(a.receivedOn);
        const age = today ? daysBetween(received, today) : null;
        return {
          id: a.id,
          views: [st === "WITH_APPROVAL" ? "approval" : st === "LAPSED" ? "lapsed" : st === "RESUBMISSION_REQUESTED" ? "resubmission" : "received"],
          search: [s.registeredName, s.reference, APPLICATION_KIND_LABEL[a.kind as ApplicationKind].en, QUEUE_STATE_LABEL[st].en].join(" "),
          sortKeys: { received },
          cells: {
            supplier: { kind: "link", text: s.registeredName, href: `/suppliers/${s.id}?tab=applications`, sub: `${s.reference} · ${APPLICATION_KIND_LABEL[a.kind as ApplicationKind].en}` },
            received: { kind: "stack", title: formatDate(received), sub: age == null ? "Days not counted: no time zone" : age === 0 ? "Today" : `${plural(age, "day", "days")} ago` },
            state: { kind: "badge", text: QUEUE_STATE_LABEL[st].en, tone: TONE[QUEUE_STATE_TONE[st]] },
            deadline: { kind: "text", text: a.resubmitBy && a.status === "RESUBMISSION_REQUESTED" ? `Resubmit by ${formatDate(day(a.resubmitBy))}` : "—", dim: !a.resubmitBy },
          },
        };
      }),
  );
  // Oldest first: the order a queue is worked in.
  queue.sort((a, b) => String(a.sortKeys?.received ?? "").localeCompare(String(b.sortKeys?.received ?? "")));
  const registered = suppliers.filter((s) => s.status === "REGISTERED").length;
  const unsynced = suppliers.filter((s) => s.status === "REGISTERED" && !s.erpVendorCode).length;
  const attention = register.filter((r) => r.views?.includes("attention")).length;

  const tabs = [
    {
      id: "register",
      label: "Register",
      icon: <BuildingIcon size={15} />,
      count: suppliers.length,
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
              { id: "unsynced", label: ERP_NOT_SYNCED.en },
            ]}
            rowAction={{ label: "Open", hrefTemplate: "/suppliers/{id}" }}
            rowOpens
            stackBelow="xl"
            columns={[
              { key: "supplier", label: "Supplier", sortable: true, mobile: "primary" },
              { key: "status", label: "Status", width: "200px", sortable: true, mobile: "meta" },
              { key: "documents", label: "Documents", width: "200px", mobile: "meta" },
              { key: "where", label: "Where it stands", width: "250px", mobile: "meta" },
            ]}
            rows={register}
          />
        </Card>
      ),
    },
    {
      id: "applications",
      label: "Applications",
      icon: <ClipboardIcon size={15} />,
      count: queue.length,
      panel: (
        <Card className="overflow-hidden">
          <CardHeader icon={<ClipboardIcon size={17} />} title="Applications awaiting a decision" subtitle="Open applications, oldest first. The days since it was received are a count, not a judgement: no service level is set." divided={false} />
          <DataList
            flat
            selectable={false}
            exportName="supplier-applications"
            searchPlaceholder="Search by supplier"
            emptyTitle="Nothing awaiting a decision"
            emptyBody="An application recorded from paper appears here until it is decided."
            views={[
              { id: "received", label: "Received" },
              { id: "approval", label: "With approval" },
              { id: "resubmission", label: "Resubmission requested" },
              { id: "lapsed", label: "Lapsed: record the lapse" },
            ]}
            columns={[
              { key: "supplier", label: "Supplier", mobile: "primary" },
              { key: "received", label: "Received", width: "170px", sortable: true, mobile: "meta" },
              { key: "state", label: "Where it stands", width: "220px", mobile: "meta" },
              { key: "deadline", label: "Deadline", width: "190px", hideBelow: "md", mobile: "meta" },
            ]}
            rows={queue}
          />
        </Card>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title="Suppliers"
        subtitle="Suppliers recorded from paper applications, their documents and decisions."
        meta={[plural(registered, "registered", "registered"), plural(queue.length, "application awaiting a decision", "applications awaiting a decision"), plural(attention, "with documents to see to", "with documents to see to"), `${unsynced} ${ERP_NOT_SYNCED.en.toLowerCase()}`]}
        actions={<ButtonLink href="/suppliers/new" size="sm" variant="primary">Record a paper application</ButtonLink>}
      />
      <div className="mb-6 flex flex-col gap-3">
        <Callout tone="info" title="Not here yet">
          Contractor performance reports and the grade they give arrive with contractor performance (6.16). Self-registration, online purchase of documents and bids by the suppliers themselves arrive with the vendor portal, once vendors can sign in (6.15b). Until then every supplier is recorded here by an officer from its paper application.
        </Callout>
      </div>
      <Tabs initial={tab} label="Suppliers" tabs={tabs} />
    </>
  );
}
