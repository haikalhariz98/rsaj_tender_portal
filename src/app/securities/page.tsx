import { DataList, type Row } from "@/components/data-list";
import { ShieldIcon } from "@/components/icons";
import { Card, CardFooter, CardHeader } from "@/components/ui/card";
import { Callout } from "@/components/ui/feedback";
import { PageHeader } from "@/components/ui/page-header";
import { INSURANCE_KIND_LABEL, REGISTER_STATUS_LABEL, REGISTER_STATUS_TONE, SECURITY_KIND_LABEL } from "@/lib/award/labels";
import { listRegister, REGISTER_PAGE, type RegisterView } from "@/lib/award/repo";
import { ButtonLink } from "@/components/ui/button";
import { issuerStanding } from "@/lib/securities/bond";
import { storedDay } from "@/lib/dates";
import { formatDate } from "@/lib/format";
import { expiryAlert } from "@/lib/securities/expiry";

export const dynamic = "force-dynamic";

/**
 * The securities and insurance register across contracts (FR-AWD-012, 013). Expiry
 * alerts come from the notification rule's offsets and are shown, not sent.
 */
const VIEWS: { id: RegisterView; label: string }[] = [
  { id: "all", label: "All" },
  { id: "expiring", label: "Expiring or expired" },
  { id: "unverified", label: "Lodged, not verified" },
];

export default async function SecuritiesPage({ searchParams }: { searchParams: Promise<{ page?: string; view?: string }> }) {
  const sp = await searchParams;
  const view = (VIEWS.find((v) => v.id === sp.view)?.id ?? "all") as RegisterView;
  const requested = Math.max(0, Number.parseInt(sp.page ?? "0", 10) || 0);
  const { org, securities, policies, order, config, total, page, counts } = await listRegister(requested, view);
  const pages = Math.max(1, Math.ceil(total / REGISTER_PAGE));
  const href = (v: RegisterView, p = 0) => `/securities?${new URLSearchParams({ ...(v !== "all" ? { view: v } : {}), ...(p ? { page: String(p) } : {}) }).toString()}`.replace(/\?$/, "");
  const today = org?.today ?? null;
  const offsets = config?.expiryOffsets ?? [];
  const alertOf = (d: Date | null) => (today ? expiryAlert(d ? storedDay(d) : null, offsets, today) : null);
  const chip = (a: ReturnType<typeof alertOf>) =>
    !a ? [] : a.state === "EXPIRED" ? [{ text: `Expired ${a.daysAgo} days ago`, tone: "err" as const }] : a.state === "DUE" ? [{ text: `Expires in ${a.daysLeft} days`, tone: "warn" as const }] : a.state === "NO_EXPIRY" ? [{ text: "No expiry recorded", tone: "warn" as const }] : [];
  // Where the issuer stood on the approved list when it was lodged (the checks' own rule), and since.
  const onList = (i: { retiredOn: Date | null } | null, lodgedOn: Date) => {
    const at = issuerStanding(i, storedDay(lodgedOn));
    if (at === "NOT_ON_LIST") return "Not on the approved list";
    if (at === "RETIRED") return "Retired from the list before it was lodged";
    return i?.retiredOn ? `On the list when lodged; retired ${formatDate(i.retiredOn)}` : "On the approved list";
  };
  const unsorted: Row[] = [
    ...securities.map((s) => {
      const a = s.status === "REJECTED" ? null : alertOf(s.expiresOn);
      return {
        id: s.id,
        search: [SECURITY_KIND_LABEL[s.kind], s.contract.number, s.contract.award.awardeeName, s.issuer?.name ?? s.issuerNameAsWritten, s.instrumentRef].join(" "),
        sortKeys: { value: Number(s.value.toString()), expiry: s.expiresOn?.getTime() ?? Number.MIN_SAFE_INTEGER },
        cells: {
          what: { kind: "link" as const, text: SECURITY_KIND_LABEL[s.kind], href: `/awards/${s.contract.award.id}?tab=securities`, sub: `${s.contract.award.awardeeName} · contract ${s.contract.number}` },
          issuer: { kind: "stack" as const, title: s.issuer?.name ?? (s.issuerNameAsWritten || "Issuer not recorded"), sub: onList(s.issuer, s.lodgedOn) },
          value: { kind: "money" as const, value: Number(s.value.toString()) },
          expiry: { kind: "text" as const, text: s.expiresOn ? formatDate(s.expiresOn) : "Not recorded", dim: !s.expiresOn },
          status: { kind: "chips" as const, items: [{ text: REGISTER_STATUS_LABEL[s.status], tone: REGISTER_STATUS_TONE[s.status] }, ...chip(a)] },
        },
      };
    }),
    ...policies.map((p) => {
      const a = p.status === "REJECTED" ? null : alertOf(p.periodEnd);
      return {
        id: p.id,
        search: [INSURANCE_KIND_LABEL[p.kind], p.contract.number, p.contract.award.awardeeName, p.issuer?.name ?? p.issuerNameAsWritten, p.policyNo].join(" "),
        sortKeys: { value: Number(p.sumInsured.toString()), expiry: p.periodEnd.getTime() },
        cells: {
          what: { kind: "link" as const, text: INSURANCE_KIND_LABEL[p.kind], href: `/awards/${p.contract.award.id}?tab=securities`, sub: `${p.contract.award.awardeeName} · contract ${p.contract.number}` },
          issuer: { kind: "stack" as const, title: p.issuer?.name ?? (p.issuerNameAsWritten || "Insurer not recorded"), sub: onList(p.issuer, p.lodgedOn) },
          value: { kind: "money" as const, value: Number(p.sumInsured.toString()) },
          expiry: { kind: "text" as const, text: formatDate(p.periodEnd) },
          status: { kind: "chips" as const, items: [{ text: REGISTER_STATUS_LABEL[p.status], tone: REGISTER_STATUS_TONE[p.status] }, ...chip(a)] },
        },
      };
    }),
  ];
  // In the database's order: live first, then long expired, then rejected; soonest to expire first.
  const byId = new Map(unsorted.map((r) => [r.id, r]));
  const rows = order.map((o) => byId.get(o.id)).filter((r): r is Row => !!r);
  return (
    <>
      <PageHeader title="Securities" subtitle="Bonds, guarantees and insurance policies lodged on contracts, and when each runs out." meta={[`${counts.unverified} lodged, not verified`, `${counts.expiring} expiring or expired`, offsets.length ? `Reminders at ${offsets.join(", ")} days` : "No expiry reminders set"]} />
      <Callout tone="info" className="mb-6" title="Shown here, not sent">
        Expiry reminders are worked out from the notification rule for expiring securities and shown on this register. Nothing is sent from the portal in this phase.
      </Callout>
      <Card className="overflow-hidden">
        <CardHeader icon={<ShieldIcon size={17} />} title="The register" subtitle="Live ones first, soonest to expire first; then those long expired, then those rejected. Each is lodged and verified on its award's Securities tab."
          actions={
            <span className="flex flex-wrap gap-1.5">
              {VIEWS.map((v) => (
                <ButtonLink key={v.id} href={href(v.id)} size="sm" variant={v.id === view ? "secondary" : "ghost"} aria-current={v.id === view ? "page" : undefined}>
                  {`${v.label} (${counts[v.id]})`}
                </ButtonLink>
              ))}
            </span>
          }
          divided={false}
        />
        <DataList
          flat
          selectable={false}
          exportName="securities"
          searchPlaceholder="Search by contract, awardee or issuer"
          emptyTitle={view === "all" ? "Nothing lodged yet" : "Nothing in this view"}
          emptyBody="Securities and policies are lodged on an award once its instrument is issued."
          columns={[
            { key: "what", label: "Security", sortable: false, mobile: "primary" },
            { key: "issuer", label: "Issuer", width: "22%", hideBelow: "xl" },
            { key: "value", label: "Value", width: "132px", numeric: true, sortable: true, mobile: "meta" },
            { key: "expiry", label: "Expires", width: "128px", sortable: true, mobile: "meta" },
            { key: "status", label: "Status", width: "200px", mobile: "meta" },
          ]}
          rows={rows}
        />
        {total > 0 && (
          <CardFooter className="flex flex-wrap items-center justify-between gap-2 text-[12.5px] text-ink-3">
            <span>
              Showing {page * REGISTER_PAGE + 1}–{page * REGISTER_PAGE + rows.length} of {total}
            </span>
            {pages > 1 && (
              <span className="flex gap-2">
                {page > 0 && <ButtonLink href={href(view, page - 1)} size="sm" variant="ghost">Previous</ButtonLink>}
                {page + 1 < pages && <ButtonLink href={href(view, page + 1)} size="sm" variant="ghost">Next</ButtonLink>}
              </span>
            )}
          </CardFooter>
        )}
      </Card>
    </>
  );
}
