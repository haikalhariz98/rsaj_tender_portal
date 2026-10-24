import type { Row } from "@/components/data-list";
import { REGISTER_STATUS_TONE } from "@/lib/award/labels";
import type { listRegister } from "@/lib/award/repo";
import { INSURANCE_KIND_WORDS, REGISTER_STATUS_WORDS, SECURITIES_VIEW_WORDS as V, SECURITY_KIND_WORDS } from "@/lib/contract/case-page-words";
import { storedDay } from "@/lib/dates";
import { formatDate } from "@/lib/format";
import type { Language } from "@/lib/i18n/language";
import { say, sayWith } from "@/lib/i18n/say";
import { senFromDecimal } from "@/lib/money";
import { issuerStanding } from "@/lib/securities/bond";
import { expiryAlert, expiryChip } from "@/lib/securities/expiry";
import type { Words } from "@/lib/contract/labels";

type Register = Awaited<ReturnType<typeof listRegister>>;

/**
 * The securities and insurance register's rows, in the database's order, built once for the page and for the export route (7.6). A reader not named on a restricted
 * exercise sees the contract's register cells and nothing of the tender (AC-45); the instrument's value is not SULIT, so `forExport` changes nothing here.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- no SULIT column: the export builds the same rows
export function buildSecurityRows(listed: Pick<Register, "securities" | "policies" | "order" | "config">, cx: { today: string | null; lang: Language }, _opts: { forExport: boolean }): Row[] {
  const { lang, today } = cx;
  const t = (words: Words) => say(words, lang);
  const offsets = listed.config?.expiryOffsets ?? [];
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
    ...listed.securities.map((s) => {
      const a = s.status === "REJECTED" ? null : alertOf(s.expiresOn);
      return {
        id: s.id,
        search: [t(SECURITY_KIND_WORDS[s.kind]), s.contract.number, s.contract.award.awardeeName, s.issuer?.name ?? s.issuerNameAsWritten, s.instrumentRef].join(" "),
        sortKeys: { value: Number(s.value.toString()), expiry: s.expiresOn?.getTime() ?? Number.MIN_SAFE_INTEGER },
        cells: {
          what: { kind: "link" as const, text: t(SECURITY_KIND_WORDS[s.kind]), href: `/projects/${s.contract.id}?tab=securities`, sub: sayWith(V.awardeeAndContract, lang, { awardee: s.contract.award.awardeeName, number: s.contract.number }) },
          issuer: { kind: "stack" as const, title: s.issuer?.name ?? (s.issuerNameAsWritten || t(V.issuerNotRecorded)), sub: onList(s.issuer, s.lodgedOn) },
          value: { kind: "money" as const, sen: senFromDecimal(s.value).toString() },
          expiry: { kind: "text" as const, text: s.expiresOn ? formatDate(s.expiresOn, lang) : t(V.notRecorded), dim: !s.expiresOn },
          status: { kind: "chips" as const, items: [{ text: t(REGISTER_STATUS_WORDS[s.status]), tone: REGISTER_STATUS_TONE[s.status] }, ...chip(a)] },
        },
      };
    }),
    ...listed.policies.map((p) => {
      const a = p.status === "REJECTED" ? null : alertOf(p.periodEnd);
      return {
        id: p.id,
        search: [t(INSURANCE_KIND_WORDS[p.kind]), p.contract.number, p.contract.award.awardeeName, p.issuer?.name ?? p.issuerNameAsWritten, p.policyNo].join(" "),
        sortKeys: { value: Number(p.sumInsured.toString()), expiry: p.periodEnd.getTime() },
        cells: {
          what: { kind: "link" as const, text: t(INSURANCE_KIND_WORDS[p.kind]), href: `/projects/${p.contract.id}?tab=securities`, sub: sayWith(V.awardeeAndContract, lang, { awardee: p.contract.award.awardeeName, number: p.contract.number }) },
          issuer: { kind: "stack" as const, title: p.issuer?.name ?? (p.issuerNameAsWritten || t(V.insurerNotRecorded)), sub: onList(p.issuer, p.lodgedOn) },
          value: { kind: "money" as const, sen: senFromDecimal(p.sumInsured).toString() },
          expiry: { kind: "text" as const, text: formatDate(p.periodEnd, lang) },
          status: { kind: "chips" as const, items: [{ text: t(REGISTER_STATUS_WORDS[p.status]), tone: REGISTER_STATUS_TONE[p.status] }, ...chip(a)] },
        },
      };
    }),
  ];
  // In the database's order: live first, then long expired, then rejected; soonest to expire first.
  const byId = new Map(unsorted.map((r) => [r.id, r]));
  return listed.order.map((o) => byId.get(o.id)).filter((r): r is Row => !!r);
}
