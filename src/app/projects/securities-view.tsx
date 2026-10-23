import { DataList, type Row } from "@/components/data-list";
import { ShieldIcon } from "@/components/icons";
import { Card, CardFooter, CardHeader } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { REGISTER_STATUS_TONE } from "@/lib/award/labels";
import { INSURANCE_KIND_WORDS, REGISTER_STATUS_WORDS, CASES_LIST_WORDS, SECURITIES_VIEW_WORDS as V, SECURITY_KIND_WORDS } from "@/lib/contract/case-page-words";
import type { Words } from "@/lib/contract/labels";
import type { Language } from "@/lib/i18n/language";
import { say, sayWith } from "@/lib/i18n/say";
import { listRegister, REGISTER_PAGE, type RegisterView } from "@/lib/award/repo";
import { ButtonLink } from "@/components/ui/button";
import { issuerStanding } from "@/lib/securities/bond";
import { storedDay } from "@/lib/dates";
import { formatDate } from "@/lib/format";
import { expiryAlert, expiryChip, remindersText } from "@/lib/securities/expiry";
import type { StaffActor } from "@/lib/auth/types";

/**
 * "Securities expiring or not verified" (FR-AWD-012, 013; AC-15): the securities and insurance policies lodged on contracts,
 * across the organisation, as a view of the Contracts list. Expiry alerts come from the notification rule's offsets and are
 * shown, not sent. Every instrument is listed for every reader once its contract exists (AC-45): a reader not named on a restricted exercise sees the contract's register cells and nothing of the tender.
 */
const VIEWS: { id: RegisterView; label: Words }[] = [
  { id: "attention", label: V.viewAttention },
  { id: "expiring", label: V.viewExpiring },
  { id: "unverified", label: V.viewUnverified },
  { id: "all", label: V.viewAll },
];

export async function SecuritiesView({ actor, sv, pageParam, lang = "en" }: { actor: StaffActor; sv: string | undefined; pageParam: string | undefined; lang?: Language }) {
  const t = (words: Words) => say(words, lang);
  const view = (VIEWS.find((v) => v.id === sv)?.id ?? "attention") as RegisterView;
  const requested = Math.max(0, Number.parseInt(pageParam ?? "0", 10) || 0);
  const { org, securities, policies, order, config, total, page, counts } = await listRegister(actor.organisationId, requested, view);
  const pages = Math.max(1, Math.ceil(total / REGISTER_PAGE));
  const href = (v: RegisterView, p = 0) => `/projects?${new URLSearchParams({ view: "securities", ...(v !== "attention" ? { sv: v } : {}), ...(p ? { page: String(p) } : {}) }).toString()}`;
  const today = org?.today ?? null;
  const offsets = config?.expiryOffsets ?? [];
  const alertOf = (d: Date | null) => (today ? expiryAlert(d ? storedDay(d) : null, offsets, today) : null);
  const chip = (a: ReturnType<typeof alertOf>) => {
    const c = expiryChip(a, lang);
    return c ? [c] : [];
  };
  // Where the issuer stood on the approved list when it was lodged (the checks' own rule), and since.
  const onList = (i: { retiredOn: Date | null } | null, lodgedOn: Date) => {
    const at = issuerStanding(i, storedDay(lodgedOn));
    if (at === "NOT_ON_LIST") return t(V.notOnList);
    if (at === "RETIRED") return t(V.retiredBefore);
    return i?.retiredOn ? sayWith(V.onListRetired, lang, { date: formatDate(i.retiredOn, lang) }) : t(V.onList);
  };
  const unsorted: Row[] = [
    ...securities.map((s) => {
      const a = s.status === "REJECTED" ? null : alertOf(s.expiresOn);
      return {
        id: s.id,
        search: [t(SECURITY_KIND_WORDS[s.kind]), s.contract.number, s.contract.award.awardeeName, s.issuer?.name ?? s.issuerNameAsWritten, s.instrumentRef].join(" "),
        sortKeys: { value: Number(s.value.toString()), expiry: s.expiresOn?.getTime() ?? Number.MIN_SAFE_INTEGER },
        cells: {
          what: { kind: "link" as const, text: t(SECURITY_KIND_WORDS[s.kind]), href: `/projects/${s.contract.id}?tab=securities`, sub: sayWith(V.awardeeAndContract, lang, { awardee: s.contract.award.awardeeName, number: s.contract.number }) },
          issuer: { kind: "stack" as const, title: s.issuer?.name ?? (s.issuerNameAsWritten || t(V.issuerNotRecorded)), sub: onList(s.issuer, s.lodgedOn) },
          value: { kind: "money" as const, value: Number(s.value.toString()) },
          expiry: { kind: "text" as const, text: s.expiresOn ? formatDate(s.expiresOn, lang) : t(V.notRecorded), dim: !s.expiresOn },
          status: { kind: "chips" as const, items: [{ text: t(REGISTER_STATUS_WORDS[s.status]), tone: REGISTER_STATUS_TONE[s.status] }, ...chip(a)] },
        },
      };
    }),
    ...policies.map((p) => {
      const a = p.status === "REJECTED" ? null : alertOf(p.periodEnd);
      return {
        id: p.id,
        search: [t(INSURANCE_KIND_WORDS[p.kind]), p.contract.number, p.contract.award.awardeeName, p.issuer?.name ?? p.issuerNameAsWritten, p.policyNo].join(" "),
        sortKeys: { value: Number(p.sumInsured.toString()), expiry: p.periodEnd.getTime() },
        cells: {
          what: { kind: "link" as const, text: t(INSURANCE_KIND_WORDS[p.kind]), href: `/projects/${p.contract.id}?tab=securities`, sub: sayWith(V.awardeeAndContract, lang, { awardee: p.contract.award.awardeeName, number: p.contract.number }) },
          issuer: { kind: "stack" as const, title: p.issuer?.name ?? (p.issuerNameAsWritten || t(V.insurerNotRecorded)), sub: onList(p.issuer, p.lodgedOn) },
          value: { kind: "money" as const, value: Number(p.sumInsured.toString()) },
          expiry: { kind: "text" as const, text: formatDate(p.periodEnd, lang) },
          status: { kind: "chips" as const, items: [{ text: t(REGISTER_STATUS_WORDS[p.status]), tone: REGISTER_STATUS_TONE[p.status] }, ...chip(a)] },
        },
      };
    }),
  ];
  // In the database's order: live first, then long expired, then rejected; soonest to expire first.
  const byId = new Map(unsorted.map((r) => [r.id, r]));
  const rows = order.map((o) => byId.get(o.id)).filter((r): r is Row => !!r);
  return (
    <>
      <PageHeader title={t(V.title)} meta={[sayWith(V.nLodgedNotVerified, lang, { count: String(counts.unverified) }), sayWith(V.nExpiring, lang, { count: String(counts.expiring) }), remindersText(offsets, lang)] } />
      <Card className="overflow-hidden">
        <CardHeader icon={<ShieldIcon size={17} />} title={t(V.cardTitle)} subtitle={t(V.cardSubtitle)}
          divided={false}
        />
        <div className="flex flex-wrap gap-1.5 px-5 pb-3 sm:px-6">
          <ButtonLink href="/projects" size="sm" variant="secondary">{t(CASES_LIST_WORDS.allContracts)}</ButtonLink>
          {VIEWS.map((v) => (
            <ButtonLink key={v.id} href={href(v.id)} size="sm" variant={v.id === view ? "secondary" : "ghost"} aria-current={v.id === view ? "page" : undefined}>
              {sayWith(CASES_LIST_WORDS.viewCount, lang, { label: t(v.label), count: String(counts[v.id]) })}
            </ButtonLink>
          ))}
        </div>
        <DataList
          flat
          selectable={false}
          exportName="securities-expiring-or-not-verified"
          searchPlaceholder={t(V.search)}
          emptyTitle={t(view === "all" ? V.nothingLodgedYet : V.nothingInView)}
          columns={[
            { key: "what", label: t(V.colSecurity), sortable: false, mobile: "primary" },
            { key: "issuer", label: t(V.colIssuer), width: "22%", hideBelow: "xl" },
            { key: "value", label: t(V.colValue), width: "132px", numeric: true, sortable: true, mobile: "meta" },
            { key: "expiry", label: t(V.colExpires), width: "128px", sortable: true, mobile: "meta" },
            { key: "status", label: t(V.colStatus), width: "200px", mobile: "meta" },
          ]}
          rows={rows}
        />
        {total > 0 && (
          <CardFooter className="flex flex-wrap items-center justify-between gap-2 text-[12.5px] text-ink-3">
            <span>
              {sayWith(V.showing, lang, { from: String(page * REGISTER_PAGE + 1), to: String(page * REGISTER_PAGE + rows.length), total: String(total) })}
            </span>
            {pages > 1 && (
              <span className="flex gap-2">
                {page > 0 && <ButtonLink href={href(view, page - 1)} size="sm" variant="ghost">{t(CASES_LIST_WORDS.previous)}</ButtonLink>}
                {page + 1 < pages && <ButtonLink href={href(view, page + 1)} size="sm" variant="ghost">{t(CASES_LIST_WORDS.next)}</ButtonLink>}
              </span>
            )}
          </CardFooter>
        )}
      </Card>
    </>
  );
}
