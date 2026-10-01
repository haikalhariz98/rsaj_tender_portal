import { DataList, type Row } from "@/components/data-list";
import { ShieldIcon } from "@/components/icons";
import { Card, CardFooter, CardHeader } from "@/components/ui/card";
import { Callout } from "@/components/ui/feedback";
import { PageHeader } from "@/components/ui/page-header";
import { INSURANCE_KIND_LABEL, REGISTER_STATUS_LABEL, REGISTER_STATUS_TONE, SECURITY_KIND_LABEL } from "@/lib/award/labels";
import { listRegister, REGISTER_PAGE } from "@/lib/award/repo";
import { storedDay } from "@/lib/dates";
import { formatDate } from "@/lib/format";
import { expiryAlert } from "@/lib/securities/expiry";

export const dynamic = "force-dynamic";

/**
 * The securities and insurance register across contracts (FR-AWD-012, 013). Expiry
 * alerts come from the notification rule's offsets and are shown, not sent.
 */
export default async function SecuritiesPage() {
  const { org, securities, policies, config, total, counts } = await listRegister();
  const today = org?.today ?? null;
  const offsets = config?.expiryOffsets ?? [];
  const alertOf = (d: Date | null) => (today ? expiryAlert(d ? storedDay(d) : null, offsets, today) : null);
  const chip = (a: ReturnType<typeof alertOf>) =>
    !a ? [] : a.state === "EXPIRED" ? [{ text: `Expired ${a.daysAgo} days ago`, tone: "err" as const }] : a.state === "DUE" ? [{ text: `Expires in ${a.daysLeft} days`, tone: "warn" as const }] : a.state === "NO_EXPIRY" ? [{ text: "No expiry recorded", tone: "warn" as const }] : [];
  // The approved list as it stood when it was lodged: an issuer retired since is said so.
  const onList = (i: { retiredOn: Date | null } | null, lodgedOn: Date) =>
    !i ? "Not on the approved list" : i.retiredOn == null ? "On the approved list" : i.retiredOn > lodgedOn ? `On the list when lodged; retired ${formatDate(i.retiredOn)}` : "Retired from the list before it was lodged";
  const unsorted: Row[] = [
    ...securities.map((s) => {
      const a = s.status === "REJECTED" ? null : alertOf(s.expiresOn);
      return {
        id: s.id,
        views: [...(s.status === "LODGED" ? ["unverified"] : []), ...(a && (a.state === "DUE" || a.state === "EXPIRED" || a.state === "NO_EXPIRY") ? ["expiring"] : [])],
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
        views: [...(p.status === "LODGED" ? ["unverified"] : []), ...(a && (a.state === "DUE" || a.state === "EXPIRED") ? ["expiring"] : [])],
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
  // Soonest to expire first, across both kinds; no expiry recorded comes first, needing attention.
  const rows = unsorted.sort((a, b) => Number(a.sortKeys?.expiry ?? 0) - Number(b.sortKeys?.expiry ?? 0)).slice(0, REGISTER_PAGE);
  return (
    <>
      <PageHeader title="Securities" subtitle="Bonds, guarantees and insurance policies lodged on contracts, and when each runs out." meta={[`${counts.unverified} lodged, not verified`, `${counts.expiring} expiring or expired`, offsets.length ? `Reminders at ${offsets.join(", ")} days` : "No expiry reminders set"]} />
      <Callout tone="info" className="mb-6" title="Shown here, not sent">
        Expiry reminders are worked out from the notification rule for expiring securities and shown on this register. Nothing is sent from the portal in this phase.
      </Callout>
      <Card className="overflow-hidden">
        <CardHeader icon={<ShieldIcon size={17} />} title="The register" subtitle="Soonest to expire first. Each is lodged and verified on its award's Securities tab." divided={false} />
        <DataList
          flat
          selectable={false}
          exportName="securities"
          searchPlaceholder="Search by contract, awardee or issuer"
          emptyTitle="Nothing lodged yet"
          emptyBody="Securities and policies are lodged on an award once its instrument is issued."
          views={[
            { id: "expiring", label: "Expiring" },
            { id: "unverified", label: "Not verified" },
          ]}
          columns={[
            { key: "what", label: "Security", sortable: false, mobile: "primary" },
            { key: "issuer", label: "Issuer", width: "22%", hideBelow: "xl" },
            { key: "value", label: "Value", width: "132px", numeric: true, sortable: true, mobile: "meta" },
            { key: "expiry", label: "Expires", width: "128px", sortable: true, mobile: "meta" },
            { key: "status", label: "Status", width: "200px", mobile: "meta" },
          ]}
          rows={rows}
        />
        {total > rows.length && <CardFooter className="text-[12.5px] text-ink-3">Showing the {rows.length} soonest to expire of {total}.</CardFooter>}
      </Card>
    </>
  );
}
