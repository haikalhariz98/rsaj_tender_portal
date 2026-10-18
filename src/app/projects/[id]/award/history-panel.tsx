import { Say } from "@/components/i18n/language-context";
import { COMPONENT_WORDS } from "@/lib/i18n/catalogues/components";
import { historyEntityLabel } from "@/lib/audit/entity-labels";
import { DOCUMENT_ENTITY_LABEL } from "@/lib/documents/audit-view";
import { ClockIcon } from "@/components/icons";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/feedback";
import { fieldLabel, foldPeriodChanges } from "@/lib/audit/diff";
import { AWARD_STATUS_LABEL, BOND_BASIS_LABEL, COMMITMENT_KIND_LABEL, CONTRACT_STATUS_LABEL, DELIVERY_LABEL, INSTRUMENT_LABEL, INSURANCE_KIND_LABEL, LANGUAGE_LABEL, REGISTER_STATUS_LABEL, SECURITY_FORM_LABEL, SECURITY_KIND_LABEL, WC_BASIS_LABEL } from "@/lib/award/labels";
import { awardHistory } from "@/lib/award/repo";
import { formatDate, formatOrgDay } from "@/lib/format";
import { formatMoney, parseSen } from "@/lib/money";
import { DECISION_LABEL } from "@/lib/requisition/labels";
import { pct } from "./shared";

// ------------------------------------------------------------------- history

const ENTITY_LABEL: Record<string, string> = {
  // Attachments and the documents behind them (document store).
  ...DOCUMENT_ENTITY_LABEL,
  Award: "Award",
  ApprovalInstance: "Approval route",
  ApprovalStep: "Approval step",
  Contract: "Contract",
  CaseOwnershipEvent: "Handover",
  AwardDistribution: "Copy",
  AwardDocument: "Document",
  AwardReturn: "Return",
  AwardCondition: "Condition",
  SecurityInstrument: "Security",
  InsurancePolicy: "Insurance policy",
  // 6.14: the pre-award routing sheet and its checks.
  AwardRoutingSheet: "Routing sheet",
  RoutingCheck: "Routing check",
};
const ACTION_LABEL = { CREATE: "Created", UPDATE: "Changed", DELETE: "Removed" } as const;
const FIELD_NAME: Record<string, string> = {
  awardeeName: "Awardee",
  awardeeRegistrationNo: "Registration number",
  awardeeAddress: "Address",
  awardedValue: "Awarded value",
  completionPeriod: "Completion period",
  instrumentKind: "Instrument",
  instrument: "Instrument",
  startDate: "Start date",
  regulatedActivity: "Regulated activity",
  bondRequired: "Bond required",
  bondNotRequiredReason: "Why no bond",
  bondBasis: "Bond basis",
  bondPercent: "Bond percentage",
  bondBasisAmount: "One-year value or stated amount",
  bondValidityExtraMonths: "Months past completion",
  bondBasisProvenance: "Where the bond decision came from",
  termsProvenance: "Where the terms came from",
  ladAmount: "Liquidated damages",
  retentionPercent: "Retention",
  retentionCapPercent: "Retention limit",
  dlpMonths: "Defects liability, months",
  wcBasis: "Workmen's compensation basis",
  worksSumInsured: "Works insurance, sum insured",
  liabilitySumInsured: "Public liability insurance, sum insured",
  wcSumInsured: "Workmen's compensation insurance, sum insured",
  ladDiffersReason: "Why the liquidated damages differ from the tender Appendix",
  dlpDiffersReason: "Why the defects liability period differs from the tender Appendix",
  regulatedDiffersReason: "Why the regulated-activity answer differs from the tender's",
  worksInsuredDiffersReason: "Why the works sum insured differs from the tender Appendix",
  liabilityInsuredDiffersReason: "Why the public liability sum insured differs from the tender Appendix",
  wcInsuredDiffersReason: "Why the workmen's compensation sum insured differs from the tender Appendix",
  termsFrom: "Terms opened from",
  erpCommitmentNo: "Commitment number",
  erpCommitmentKind: "It is",
  indentReceivedOn: "Indent received",
  icNumber: "Identity card number",
  yearReading: "Year in the number",
  from: "From",
  to: "To",
  numberSource: "Numbered from",
  numberedOn: "Numbered on",
  contractSum: "Contract sum",
  textVersion: "Text version",
  formCode: "Form",
  frozen: "Text fixed",
  recordedOnBehalf: "Recorded",
  classificationLockedAt: "Classification locked",
};
const MONEY_FIELDS = new Set(["awardedValue", "bondBasisAmount", "ladAmount", "value", "sumInsured", "contractSum", "requiredValue", "appendixAmount", "requiredLimit", "worksSumInsured", "liabilitySumInsured", "wcSumInsured"]);
/// A status reads by what it is the status of: a route is "Approved", an award "Approved, not issued".
const STATUS_TEXT: Record<string, Record<string, string>> = {
  Award: AWARD_STATUS_LABEL,
  ApprovalInstance: { PENDING: "In progress", APPROVED: "Approved", REJECTED: "Refused", RECALLED: "Withdrawn" },
  SecurityInstrument: REGISTER_STATUS_LABEL,
  InsurancePolicy: REGISTER_STATUS_LABEL,
  Contract: CONTRACT_STATUS_LABEL,
};
const ENUM_TEXT: Record<string, Record<string, string>> = {
  instrumentKind: INSTRUMENT_LABEL,
  instrument: INSTRUMENT_LABEL,
  completionUnit: { DAYS: "Days", WEEKS: "Weeks", MONTHS: "Months" },
  bondBasis: BOND_BASIS_LABEL,
  wcBasis: WC_BASIS_LABEL,
  erpCommitmentKind: COMMITMENT_KIND_LABEL,
  method: DELIVERY_LABEL,
  decision: DECISION_LABEL,
  kind: { ...SECURITY_KIND_LABEL, ...INSURANCE_KIND_LABEL },
  form: SECURITY_FORM_LABEL,
  numberSource: { SERIES: "The contract type's series", INDENT_NUMBER: "The indent's own number" },
  language: LANGUAGE_LABEL,
  bondBasisProvenance: { STATED: "Stated", OBSERVED: "Observed", ASSUMED: "Assumed" },
  termsProvenance: { STATED: "Stated", OBSERVED: "Observed", ASSUMED: "Assumed" },
};

export function HistoryPanel({ entries, total, timeZone }: { entries: Awaited<ReturnType<typeof awardHistory>>["entries"]; total: number; timeZone: string | null }) {
  const read = (field: string, value: string | null, entity: string): string => {
    if (value == null || value === "") return "—";
    if (field === "status" && STATUS_TEXT[entity]?.[value]) return STATUS_TEXT[entity][value];
    if (field === "yearReading") return "The year of issue — an assumed reading, to be confirmed";
    if (ENUM_TEXT[field]?.[value]) return ENUM_TEXT[field][value];
    if (MONEY_FIELDS.has(field) && /^-?\d+(\.\d+)?$/.test(value)) return formatMoney(parseSen(value));
    if (/Percent$/.test(field) && /^\d+(\.\d+)?$/.test(value)) return pct(value)!;
    if (/^\d{4}-\d{2}-\d{2}/.test(value)) return formatDate(value);
    if (value === "true" || value === "yes") return "Yes";
    if (value === "false" || value === "no") return "No";
    if (/^[A-Z][A-Z_]+$/.test(value)) return "—";
    return value;
  };
  const shown = (field: string, ch: { before: string | null; after: string | null }, action: string) =>
    !/(Code|Key|Id)$/.test(field) && (action !== "CREATE" || (ch.after != null && ch.after !== "" && ch.after !== "false" && ch.after !== "no")) && (action !== "UPDATE" || ch.before !== ch.after);
  return (
    <Card className="overflow-hidden">
      <CardHeader
        icon={<ClockIcon size={17} />}
        title={<Say words={COMPONENT_WORDS.history} />}
        subtitle={`${total > entries.length ? `Showing the latest ${entries.length} of ${total} changes. ` : "Every change to this award and what is under it. "}Each change names who made it; any from before sign-in is not attributed. The identity card number is masked here.`}
        divided={entries.length === 0}
      />
      {entries.length === 0 ? (
        <EmptyState size="sm" title="No recorded changes">Changes made through the portal appear here.</EmptyState>
      ) : (
        <ul className="divide-y divide-line/70">
          {entries.map((e) => (
            <li key={e.id} className="flex flex-col gap-1.5 px-5 py-3 sm:px-6">
              <div className="flex flex-wrap items-center gap-2 text-[13px]">
                <Badge tone={e.action === "CREATE" ? "ok" : e.action === "DELETE" ? "err" : "info"}>{ACTION_LABEL[e.action]}</Badge>
                <span className="font-semibold text-ink">{ENTITY_LABEL[e.entity] ?? "Record"}</span>
                <span className="min-w-0 break-words text-ink-2">{historyEntityLabel(e.entity, e.entityLabel)}</span>
                <span className="flex-1" />
                <span className="text-[12px] text-ink-3">{formatOrgDay(e.at, timeZone)}</span>
              </div>
              {e.changes.length > 0 && (
                <ul className="text-[12.5px] break-words text-ink-3">
                  {foldPeriodChanges(e.changes).filter((ch) => shown(ch.field, ch, e.action)).map((ch) => (
                    <li key={ch.field}>
                      {FIELD_NAME[ch.field] ?? fieldLabel(ch.field)}: {e.action === "UPDATE" && <>{read(ch.field, ch.before, e.entity)} → </>}
                      <span className="text-ink-2">{read(ch.field, e.action === "DELETE" ? ch.before : ch.after, e.entity)}</span>
                    </li>
                  ))}
                </ul>
              )}
              {e.reason && <p className="text-[12.5px] text-ink-3">Reason: {e.reason}</p>}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
