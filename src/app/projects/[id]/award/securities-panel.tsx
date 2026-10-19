import { Say } from "@/components/i18n/language-context";
import { CASE_PANEL_TITLE_WORDS as P } from "@/lib/contract/case-page-words";
import { actStatusFault } from "@/lib/contract/act-status";
import type { ContractStatus } from "@/lib/contract/types";
import Link from "next/link";
import { ShieldIcon } from "@/components/icons";
import { Chip } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Callout, EmptyState } from "@/components/ui/feedback";
import { ProvenanceBadge } from "@/components/ui/provenance";
import { Stat } from "@/components/ui/stat";
import { type AwardEvaluation } from "@/lib/award/evaluate";
import { BOND_BASIS_LABEL, INSURANCE_KIND_LABEL, REGISTER_STATUS_LABEL, REGISTER_STATUS_TONE, SECURITY_FORM_LABEL, SECURITY_KIND_LABEL, WC_BASIS_LABEL, WC_CHECK_LABEL, tenderTermText } from "@/lib/award/labels";
import { BASELINE_FIELDS, type BaselineField } from "@/lib/award/appendix-baseline";
import { awardFacts, type LoadedAward } from "@/lib/award/repo";
import { editable } from "@/lib/award/status";
import type { AwardStatus } from "@/lib/award/types";
import { formatDate } from "@/lib/format";
import { formatMoney, senFromDecimal } from "@/lib/money";
import { derivedAnnualValue } from "@/lib/securities/bond";
import { expiryAlert, expiryChip } from "@/lib/securities/expiry";
import { applicableRequirements, derivedLimit, wcSumCheck } from "@/lib/securities/insurance";
import { EditTermsDrawer, LodgePolicyDrawer, LodgeSecurityDrawer, ReviewDrawer } from "@/app/awards/editors";
import { money, pct, day } from "./shared";


export function SecuritiesPanel({
  l,
  ev,
  f,
  requirements,
  people,
  today,
  termsValues,
  termsReadOnly = false,
}: {
  l: LoadedAward;
  ev: AwardEvaluation;
  f: Awaited<ReturnType<typeof awardFacts>>;
  requirements: ReturnType<typeof applicableRequirements>;
  people: { value: string; label: string }[];
  today: string | null;
  termsValues: Record<string, string | boolean | null>;
  /// Before signing (AC-21): the bond decision and the insurance terms are the Award stage's, printed in the letter, so they are shown and not edited here.
  termsReadOnly?: boolean;
}) {
  const { award } = l;
  const c = award.contract;
  // Review S3: the register's acts ask FORMATION's row (cancelled, terminated and closed keep it as it was).
  const open = !!c && !actStatusFault("FORMATION", c.status as ContractStatus);
  const issuers = f.config.issuers.filter((i) => i.retiredOn == null).map((i) => ({ value: i.id, label: i.name }));
  const months = award.completionUnit === "MONTHS" ? award.completionPeriod : null;
  const derived = derivedAnnualValue(senFromDecimal(award.awardedValue), months);
  const pl = derivedLimit(f.config.bands, senFromDecimal(award.awardedValue), today ? new Date(`${today}T00:00:00Z`) : undefined);
  const offsets = f.config.expiryOffsets;
  const alert = (d: Date | null) => {
    if (!today) return null;
    const c = expiryChip(expiryAlert(day(d), offsets, today));
    return c ? <Chip tone={c.tone}>{c.text}</Chip> : null;
  };
  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader icon={<ShieldIcon size={17} />} title={<Say words={P.performanceBond} />} actions={!termsReadOnly && editable(award.status as AwardStatus).terms ? <EditTermsDrawer id={award.id} values={termsValues} regulatedLabel={f.config.policy.regulatedActivityLabel} asked={{ retention: ev.terms?.retentionAsked ?? null, dlp: ev.terms?.dlpAsked ?? null }} label="Edit bond" tender={ev.appendix ? Object.fromEntries(BASELINE_FIELDS.map((k) => [k, tenderTermText(k, ev.appendix!.baseline)])) as Record<BaselineField, string | null> : null} /> : undefined} />
        <CardBody className="flex flex-col gap-5">
          {termsReadOnly && <p className="text-[13px] text-ink-3">Read-only here. Set on the Award stage.</p>}
          {ev.appendix && <p className="text-[13px] text-ink-2">The tender Appendix states no bond terms.</p>}
          {award.bondRequired == null ? (
            <Callout tone="warn" title="Bond requirement not decided" />
          ) : award.bondRequired === false ? (
            <p className="flex flex-wrap items-center gap-2 text-[13.5px] text-ink-2"><span className="font-semibold text-ink">No bond required.</span> {award.bondNotRequiredReason || "Reason not recorded."} {award.bondBasisProvenance && <ProvenanceBadge value={award.bondBasisProvenance} />}</p>
          ) : ev.requiredBond.state === "NOT_SET" ? (
            <Callout tone="warn" title="Bond basis not set. Choose a basis and a percentage." />
          ) : null}
          {award.bondRequired !== false && (
          <div className="grid gap-4 md:grid-cols-3">
            <Stat variant="inset" size="sm" tone="neutral" label="Required amount" value={ev.requiredBond.state === "SET" ? formatMoney(ev.requiredBond.amount) : null} hint={award.bondBasis ? `${BOND_BASIS_LABEL[award.bondBasis]}${award.bondPercent ? `, ${pct(award.bondPercent)}` : ""}` : "Basis not set"} />
            <Stat variant="inset" size="sm" tone="neutral" label="One-year value, as entered" value={award.bondBasisAmount && award.bondBasis === "ANNUAL_VALUE" ? money(award.bondBasisAmount) : null} hint={derived ? `Derived from the sum and period: ${formatMoney(derived)}. For comparison only.` : "No derived figure."} />
            <Stat variant="inset" size="sm" tone="neutral" label="Must run until" value={ev.bondUntil ? formatDate(ev.bondUntil) : null} hint={award.bondValidityExtraMonths != null ? `Completion plus ${award.bondValidityExtraMonths} months.` : "Months past completion not set."} />
          </div>
          )}
          {award.bondBasisProvenance && award.bondRequired && (
            <p className="text-[12.5px] text-ink-3">
              Where the basis came from: <ProvenanceBadge value={award.bondBasisProvenance} /> {award.bondBasisNote}
            </p>
          )}
        </CardBody>
      </Card>

      <Card className="overflow-hidden">
        <CardHeader icon={<ShieldIcon size={17} />} title={<Say words={P.securitiesLodged} />} subtitle={c ? `Contract ${c.number}. ${offsets.length ? `Reminders at ${offsets.join(", ")} days.` : "No notification rule. Nobody is told."}` : undefined} actions={open ? <LodgeSecurityDrawer id={award.id} issuers={issuers} today={today} /> : undefined} divided={(c?.securities.length ?? 0) > 0} />
        {!c || c.securities.length === 0 ? (
          <EmptyState size="sm" title={c ? "None lodged" : "Lodge after issue"} />
        ) : (
          <ul className="divide-y divide-line/70">
            {c.securities.map((s) => (
              <li key={s.id} className="flex flex-col gap-2 px-5 py-3.5 sm:flex-row sm:items-center sm:justify-between sm:px-6">
                <span className="min-w-0">
                  <span className="block text-[13.5px] font-semibold break-words text-ink">{`${SECURITY_KIND_LABEL[s.kind]} · ${SECURITY_FORM_LABEL[s.form]} · ${money(s.value)}`}</span>
                  <span className="block text-[12.5px] break-words text-ink-3">
                    {[s.issuer?.name ?? `${s.issuerNameAsWritten || "Issuer"} (not on the approved list)`, s.instrumentRef || null, s.expiresOn ? `expires ${formatDate(s.expiresOn)}` : "no expiry recorded", s.status === "REJECTED" ? `rejected: ${s.rejectedReason}` : s.verifiedBy ? `checked by ${s.verifiedBy.name}, ${formatDate(s.verifiedOn)}` : null].filter(Boolean).join(" · ")}
                  </span>
                </span>
                <span className="flex shrink-0 flex-wrap items-center gap-2">
                  {s.status !== "REJECTED" && alert(s.expiresOn)}
                  <Chip tone={REGISTER_STATUS_TONE[s.status]}>{REGISTER_STATUS_LABEL[s.status]}</Chip>
                  {open && s.status === "LODGED" && <ReviewDrawer id={award.id} targetId={s.id} kind="security" name={SECURITY_KIND_LABEL[s.kind]} people={people} today={today} />}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card className="overflow-hidden">
        <CardHeader
          icon={<ShieldIcon size={17} />}
          title={<Say words={P.insurance} />}
          subtitle={requirements.length ? `Required: ${requirements.map((r) => r.nameEn).join(", ")}.${requirements.some((r) => r.kind === "WORKMENS_COMPENSATION") ? ` Workmen's compensation: ${award.wcBasis ? WC_BASIS_LABEL[award.wcBasis].toLowerCase() : "not set"}.` : ""}` : "No insurance requirements configured."}
          actions={open ? <LodgePolicyDrawer id={award.id} issuers={issuers} today={today} tenderUplift={ev.appendix?.baseline.insurance.worksUplift ? formatMoney(ev.appendix.baseline.insurance.worksUplift.sen) : null} /> : undefined}
          divided={(c?.policies.length ?? 0) > 0 || true}
        />
        <CardBody className="flex flex-col gap-2 border-b border-line">
          <p className="text-[13px] text-ink-2">
            Public liability limit from the bands:{" "}
            {pl.state === "SET" ? <span className="font-semibold text-ink">{formatMoney(pl.limit)}</span> : pl.state === "NOT_SET" ? <span className="text-ink-4">bands not set</span> : pl.state === "NO_BAND" ? <span className="text-rose-700">price falls between bands</span> : <span className="text-rose-700">price falls in two bands</span>}
            {pl.state !== "SET" && (
              <>
                {" "}
                <Link href="/configuration/awards">Award controls</Link>
              </>
            )}
          </p>
        </CardBody>
        {!c || c.policies.length === 0 ? (
          <EmptyState size="sm" title={c ? "None lodged" : "Lodge after issue"} />
        ) : (
          <ul className="divide-y divide-line/70">
            {c.policies.map((p) => (
              <li key={p.id} className="flex flex-col gap-2 px-5 py-3.5 sm:flex-row sm:items-center sm:justify-between sm:px-6">
                <span className="min-w-0">
                  <span className="block text-[13.5px] font-semibold break-words text-ink">{`${INSURANCE_KIND_LABEL[p.kind]}${p.substitutesFor ? ` in place of the ${INSURANCE_KIND_LABEL[p.substitutesFor].toLowerCase()}` : ""} · ${money(p.sumInsured)}`}</span>
                  <span className="block text-[12.5px] break-words text-ink-3">
                    {[p.issuer?.name ?? `${p.issuerNameAsWritten || "Insurer"} (not on the approved list)`, p.policyNo || null, `${formatDate(p.periodStart)} to ${formatDate(p.periodEnd)}`, p.kind === "WORKMENS_COMPENSATION" ? WC_CHECK_LABEL[wcSumCheck(award.wcBasis)].toLowerCase() : null, p.kind === "WORKMENS_COMPENSATION" && p.wcCheckedOn ? `wages check recorded ${formatDate(p.wcCheckedOn)}, not judged` : null, p.status === "REJECTED" ? `rejected: ${p.rejectedReason}` : p.verifiedBy ? `checked by ${p.verifiedBy.name}, ${formatDate(p.verifiedOn)}` : null].filter(Boolean).join(" · ")}
                  </span>
                </span>
                <span className="flex shrink-0 flex-wrap items-center gap-2">
                  {p.status !== "REJECTED" && alert(p.periodEnd)}
                  <Chip tone={REGISTER_STATUS_TONE[p.status]}>{REGISTER_STATUS_LABEL[p.status]}</Chip>
                  {open && p.status === "LODGED" && <ReviewDrawer id={award.id} targetId={p.id} kind="policy" name={INSURANCE_KIND_LABEL[p.kind]} people={people} today={today} />}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
