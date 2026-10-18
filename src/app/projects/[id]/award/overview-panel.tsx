import { through, type Sulit } from "@/lib/auth/sulit-access";
import Link from "next/link";
import { AwardIcon, FileIcon, SlidersIcon } from "@/components/icons";
import { Badge, Chip, SulitValue } from "@/components/ui/badge";
import { recommendationDifferences } from "@/lib/evaluation/award-gate";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Callout } from "@/components/ui/feedback";
import { ProvenanceBadge } from "@/components/ui/provenance";
import { KeyValues } from "@/components/ui/stat";
import { CONTRACT_YEAR_WORDS, contractYearReading } from "@/lib/contract/issue-year";
import { type AwardEvaluation } from "@/lib/award/evaluate";
import { INDENT_READING } from "@/lib/award/indent";
import { awardFindingText, COMMITMENT_KIND_LABEL, CONTRACT_STATUS_LABEL, INSTRUMENT_LABEL, INSURANCE_KIND_LABEL, NON_COMMENCEMENT_LABEL, periodText, WC_BASIS_LABEL } from "@/lib/award/labels";
import { type LoadedAward } from "@/lib/award/repo";
import type { InstrumentKind } from "@/lib/award/types";
import { formatDate } from "@/lib/format";
import { type AwardStanding } from "@/lib/suppliers/award-standing";
import { boundaryShown } from "@/lib/method/boundary-reading";
import { boundarySentence, REGIME_LABEL } from "@/lib/method/labels";
import type { Regime } from "@/lib/method/types";
import { formatMoney, senFromDecimal } from "@/lib/money";
import { awardSumsOf } from "@/lib/award/gate-read";
import { governingSum, INSURED_KINDS } from "@/lib/award/insurance-terms";
import { AWARD_TERM_WORDS, type AwardTerm } from "@/lib/contract/award-correction";
import { money, pct, NOT_SET, notSet, day, AgainstTender, FromRecommendation, GoverningSum, tenderInsurance } from "./shared";

export function OverviewPanel({ sulit, l, ev, awardee, recommendation, methodName, typeName, policyLabel, validityDays, expiredRule, unitName }: { sulit: Sulit<true>; l: LoadedAward; ev: AwardEvaluation; awardee: AwardStanding | null; recommendation: { price: bigint; period: { value: number; unit: "DAYS" | "WEEKS" | "MONTHS" } | null } | null; methodName: string; typeName: string; policyLabel: string | null; validityDays: number | null; expiredRule: "ON" | "OFF" | "NONE"; unitName: (code: string | null) => string | null }) {
  const { award, ex, req } = l;
  const kind = award.instrumentKind as InstrumentKind;
  const c = award.contract;
  const handover = c?.ownershipEvents[0] ?? null;
  const indent = ev.indent;
  // 6.8 (E-9): each figure that differs from the evaluation's recommendation says so, with its reason.
  const differs = recommendation ? recommendationDifferences({ value: senFromDecimal(award.awardedValue), period: { value: award.completionPeriod, unit: award.completionUnit as "DAYS" | "WEEKS" | "MONTHS" } }, recommendation) : [];
  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader icon={<AwardIcon size={17} />} title="The award" subtitle={`${INSTRUMENT_LABEL[kind]}. The band, method and contract type are the exercise's, shown as it records them.`} />
        <CardBody>
          <KeyValues
            columns={2}
            items={[
              { label: "Exercise", value: <Link href={`/sourcing/${ex.id}`}>{`${ex.reference} · ${ex.title}`}</Link> },
              { label: "Requisition", value: <Link href={`/requisitions/${req.id}`}>{req.reference}</Link> },
              { label: "Method", value: methodName },
              { label: "Contract type", value: typeName },
              { label: "Band", value: ex.regime ? REGIME_LABEL[ex.regime as Regime] : notSet("Not determined") },
              ...(boundaryShown(ex.onBoundary, sulit.state === "GRANTED") && ex.boundaryOperator ? [{ label: "At the boundary", value: boundarySentence(ex.boundaryOperator, ex.boundaryValue?.toString() ?? null, (ex.boundaryProvenance ?? "ASSUMED") as "ASSUMED") }] : []),
              { label: "Awardee", value: <span className="flex flex-col"><span>{award.awardeeName}</span><span className="text-[12.5px] text-ink-3">{award.awardeeRegistrationNo || "Registration number not recorded"}</span></span> },
              { label: "Address", value: award.awardeeAddress || notSet("Not recorded") },
              // 6.15a (OD-9): the link to the register, made by an explicit act on the supplier's record.
              { label: "On the supplier register", value: award.vendor ? <Link href={`/suppliers/${award.vendor.id}`}>{`${award.vendor.reference} · ${award.vendor.registeredName}`}</Link> : notSet(award.awardeePartyId ? "Not linked: link the awardee party from the supplier's record" : "Not linked: link the award from the supplier's record") },
              // 6.15a fix S-3: its standing, as the register derives it today; a barred supplier is warned of, not refused.
              ...(award.vendor ? [{ label: "Standing on the register", value: awardee ? <span className="flex flex-col items-start gap-1"><Badge tone={awardee.tone} dot>{awardee.words.en}</Badge>{awardee.warning && <span className="text-[12.5px] break-words text-amber-900">{awardee.warning.en}</span>}</span> : notSet("Not read: the organisation's time zone is not set") }] : []),
              { label: "Awarded value", value: <FromRecommendation differs={differs.includes("value")} reason={award.recValueDiffersReason} recommended={recommendation ? formatMoney(recommendation.price) : null}><span className="tabular-nums">{money(award.awardedValue)}</span></FromRecommendation> },
              { label: "Exercise's estimate", value: <SulitValue of={through(sulit, money(ex.estimatedValue))} /> },
              { label: "Completion period", value: <FromRecommendation differs={differs.includes("period")} reason={award.recPeriodDiffersReason} recommended={recommendation?.period ? periodText(recommendation.period.value, recommendation.period.unit) : recommendation ? "No period stated" : null}>{periodText(award.completionPeriod, award.completionUnit)}</FromRecommendation> },
              { label: "Stated start date", value: award.startDate ? formatDate(award.startDate) : notSet() },
              { label: "Completion", value: ev.completion ? formatDate(ev.completion) : notSet("Not known until the start date is set") },
              { label: policyLabel ? `${policyLabel}?` : "The regulated activity?", value: <AgainstTender ev={ev} field="regulated" issued={award.issuedAt != null}>{award.regulatedActivity == null ? notSet("Not answered") : award.regulatedActivity ? "Yes" : "No"}</AgainstTender> },
            ]}
          />
        </CardBody>
      </Card>
      <Card>
        <CardHeader icon={<FileIcon size={17} />} title="Contract and commitment" subtitle="The contract number is given when the instrument is issued. The commitment number comes from the finance system and is typed in here." />
        <CardBody>
          <KeyValues
            columns={2}
            items={[
              {
                label: "Contract number",
                value: c ? (
                  <span className="flex flex-col items-start gap-1">
                    <span className="font-mono text-[13px]">{c.number}</span>
                    <Chip tone={c.status === "CANCELLED" ? "warn" : "ok"}>{CONTRACT_STATUS_LABEL[c.status]}</Chip>
                    {/* 6.12 S-1/S-5: the issue year from the organisation's day of issue, only for a series number. */}
                    {contractYearReading(c).seriesNumber && <span className="text-[12.5px] text-ink-3">{CONTRACT_YEAR_WORDS.series(contractYearReading(c).issueYear).en}</span>}
                    <Link href={`/projects/${c.id}`} className="text-[13px] font-semibold">Open the contract</Link>
                  </span>
                ) : "fault" in ev.contractNumber ? notSet(awardFindingText({ code: ev.contractNumber.fault, level: "block" })) : ev.contractNumber.source === "SERIES" ? "Drawn from its contract type's series on issue" : "The indent's own number, on issue",
              },
              { label: "Contract sum", value: c ? <span className="tabular-nums">{money(c.contractSum)}</span> : notSet("On issue") },
              {
                label: "Case handed over",
                value: handover ? `${formatDate(handover.on)}${handover.fromUnitCode || handover.toUnitCode ? ` · from ${unitName(handover.fromUnitCode) ?? "a section not set"} to ${unitName(handover.toUnitCode) ?? "a section not set"}` : " · sections not set"}` : notSet("On issue"),
              },
              {
                label: "Commitment number",
                value: award.erpCommitmentNo ? (
                  <span className="flex flex-col">
                    <span className="font-mono text-[13px]">{award.erpCommitmentNo}</span>
                    <span className="text-[12.5px] text-ink-3">{`${award.erpCommitmentKind ? `The ${COMMITMENT_KIND_LABEL[award.erpCommitmentKind].toLowerCase()}'s` : "The finance system's"} · typed in by an officer${ev.indentFormatOk === null ? " · no format set, so not checked" : ""}`}</span>
                  </span>
                ) : (
                  notSet("Not recorded")
                ),
              },
              ...(kind === "WORK_INDENT"
                ? [
                    {
                      label: "Indent validity",
                      value: !indent || indent.state === "NOT_RECEIVED" ? notSet("Runs from the indent's receipt") : indent.state === "NOT_SET" ? notSet("Validity not set") : award.commencedOn && day(award.commencedOn)! <= indent.expiresOn ? (
                        `Used — work commenced ${formatDate(award.commencedOn)}, before it expired on ${formatDate(indent.expiresOn)}`
                      ) : (
                        <span className="flex flex-col items-start gap-1">
                          <span>{`${indent.state === "EXPIRED" ? "Expired" : "Valid"} · expires ${formatDate(indent.expiresOn)} (${validityDays} days from receipt)`}</span>
                          <span className="text-[12.5px] text-ink-3">{INDENT_READING}{indent.state === "EXPIRED" && expiredRule !== "ON" ? (expiredRule === "OFF" ? " The notification rule is switched off, so no office is told." : " No notification rule names who is told.") : ""}</span>
                        </span>
                      ),
                    },
                    {
                      label: "Commencement",
                      value: !ev.commencement ? notSet() : ev.commencement.state === "COMMENCED" ? `Commenced ${formatDate(ev.commencement.on)}` : ev.commencement.state === "NO_START_DATE" ? notSet("No start date") : ev.commencement.state === "NOT_SET" ? notSet("Grace period not set") : ev.commencement.state === "LATE" ? <Chip tone="err">{`Not commenced by ${formatDate(ev.commencement.deadline)}`}</Chip> : `Due to start by ${formatDate(ev.commencement.deadline)}`,
                    },
                  ]
                : []),
            ]}
          />
        </CardBody>
      </Card>
      <Card>
        <CardHeader
          icon={<SlidersIcon size={17} />}
          title="The letter's terms"
          subtitle={ev.appendix ? `Opened from the tender Appendix (documents version ${ev.appendix.baseline.packVersion}). A term stated otherwise needs a reason.` : "Per award, with where they came from. Never defaulted."}
          actions={award.termsProvenance ? <ProvenanceBadge value={award.termsProvenance} /> : undefined}
        />
        <CardBody>
          {award.termCorrections.length > 0 && (
            <Callout tone="info" title="Recorded terms corrected after issue" className="mb-4">
              {`${award.termCorrections.map((x) => `${AWARD_TERM_WORDS[x.term as AwardTerm].en} corrected from ${x.beforeText} to ${x.afterText} on ${formatDate(x.recordedOn)} (${x.reason})`).join("; ")}. Each was recorded wrongly from the signed letter and corrected on the contract's Baseline tab, which wrote a new baseline version; the issued letter is unchanged and shows the terms as issued.`}
            </Callout>
          )}
          <KeyValues
            columns={2}
            items={[
              { label: "Liquidated damages", value: <AgainstTender ev={ev} field="lad" issued={award.issuedAt != null}>{award.ladAmount ? `${money(award.ladAmount)}${award.ladUnit ? ` ${award.ladUnit}` : ""}` : notSet()}</AgainstTender> },
              { label: "Workmen's compensation", value: award.wcBasis ? WC_BASIS_LABEL[award.wcBasis] : notSet("How it is calculated is not set — set it in Edit terms") },
              { label: "Retention", value: award.retentionPercent ? `${pct(award.retentionPercent)}${award.retentionCapPercent ? `, limited to ${pct(award.retentionCapPercent)} of the sum` : ""}` : ev.terms?.retentionAsked === false ? "Not asked by its terms band" : notSet() },
              { label: "Defects liability period", value: <AgainstTender ev={ev} field="dlp" issued={award.issuedAt != null}>{award.dlpMonths != null ? (award.dlpMonths === 0 && ev.appendix ? "None" : periodText(award.dlpMonths, "MONTHS")) : ev.terms?.dlpAsked === false ? "Not asked by its terms band" : notSet()}</AgainstTender> },
              { label: "Terms band", value: ex.termsBandKey ? (l.ex.bandSnapshot as { terms?: { label?: string } } | null)?.terms?.label ?? "As recorded on the exercise" : ex.termsState === "NONE_IN_REGIME" ? "Not applicable in this band" : notSet() },
              { label: "Appointment-letter variant", value: kind === "LETTER_OF_ACCEPTANCE" ? "Not applicable" : award.variantName ?? (ev.variant?.state === "SELECTED" ? ev.variant.variant.nameEn : notSet(ev.variant ? awardFindingText({ code: ev.variant.state === "NONE" ? "VARIANT_NONE" : ev.variant.state === "AMBIGUOUS" ? "VARIANT_AMBIGUOUS" : "TERMS_NOT_SET", level: "block" }) : NOT_SET)) },
              { label: "If work does not commence", value: kind === "LETTER_OF_ACCEPTANCE" ? "Not applicable" : ev.consequence ? NON_COMMENCEMENT_LABEL[ev.consequence] : notSet() },
              ...INSURED_KINDS.map((k) => ({ label: `${INSURANCE_KIND_LABEL[k]}, sum insured`, value: <GoverningSum g={governingSum(k, awardSumsOf(award)[k], ev.appendix?.baseline ?? null)} reason={{ WORKS: award.worksInsuredDiffersReason, PUBLIC_LIABILITY: award.liabilityInsuredDiffersReason, WORKMENS_COMPENSATION: award.wcInsuredDiffersReason }[k]} issued={award.issuedAt != null} /> })),
              ...(ev.appendix ? tenderInsurance(ev.appendix.baseline) : []),
            ]}
          />
        </CardBody>
      </Card>
    </div>
  );
}
