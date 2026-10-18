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
import { expiryAlert, expiryChip, remindersText } from "@/lib/securities/expiry";
import { hiddenExercises } from "@/app/_auth/sulit";
import type { StaffActor } from "@/lib/auth/types";

/**
 * "Securities expiring or not verified" (FR-AWD-012, 013; AC-15): the securities and insurance policies lodged on contracts,
 * across the organisation, as a view of the Contracts list. Expiry alerts come from the notification rule's offsets and are
 * shown, not sent. Instruments of a restricted exercise the reader is not named on are left out (FR-MTD-007).
 */
const VIEWS: { id: RegisterView; label: string }[] = [
  { id: "attention", label: "Expiring or not verified" },
  { id: "expiring", label: "Expiring or expired" },
  { id: "unverified", label: "Lodged, not verified" },
  { id: "all", label: "All lodged" },
];

export async function SecuritiesView({ actor, sv, pageParam }: { actor: StaffActor; sv: string | undefined; pageParam: string | undefined }) {
  const view = (VIEWS.find((v) => v.id === sv)?.id ?? "attention") as RegisterView;
  const requested = Math.max(0, Number.parseInt(pageParam ?? "0", 10) || 0);
  const { org, securities, policies, order, config, total, page, counts } = await listRegister(actor.organisationId, requested, view, await hiddenExercises(actor));
  const pages = Math.max(1, Math.ceil(total / REGISTER_PAGE));
  const href = (v: RegisterView, p = 0) => `/projects?${new URLSearchParams({ view: "securities", ...(v !== "attention" ? { sv: v } : {}), ...(p ? { page: String(p) } : {}) }).toString()}`;
  const today = org?.today ?? null;
  const offsets = config?.expiryOffsets ?? [];
  const alertOf = (d: Date | null) => (today ? expiryAlert(d ? storedDay(d) : null, offsets, today) : null);
  const chip = (a: ReturnType<typeof alertOf>) => {
    const c = expiryChip(a);
    return c ? [c] : [];
  };
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
          what: { kind: "link" as const, text: SECURITY_KIND_LABEL[s.kind], href: `/projects/${s.contract.id}?tab=securities`, sub: `${s.contract.award.awardeeName} · contract ${s.contract.number}` },
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
          what: { kind: "link" as const, text: INSURANCE_KIND_LABEL[p.kind], href: `/projects/${p.contract.id}?tab=securities`, sub: `${p.contract.award.awardeeName} · contract ${p.contract.number}` },
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
      <PageHeader title="Contracts" subtitle="Contracts after award: formed, signed, stamped and distributed, on a fixed baseline." meta={[`${counts.unverified} lodged, not verified`, `${counts.expiring} expiring or expired`, remindersText(offsets)]} />
      <Callout tone="info" className="mb-6" title="Shown here, not sent">
        Expiry reminders are worked out from the notification rule for expiring securities and shown on this register. Nothing is sent from the portal in this phase.
      </Callout>
      <Card className="overflow-hidden">
        <CardHeader icon={<ShieldIcon size={17} />} title="Securities expiring or not verified" subtitle={`Live ones first, soonest to expire first; then those long expired, then those rejected. ${counts.unverified} lodged, not verified; ${counts.expiring} expiring or expired. ${remindersText(offsets)}. Each is lodged and verified under Before signing, in the contract's securities and insurance panel.`}
          actions={
            <span className="flex flex-wrap gap-1.5">
              <ButtonLink href="/projects" size="sm" variant="secondary">All contracts</ButtonLink>
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
          exportName="securities-expiring-or-not-verified"
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
