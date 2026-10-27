/**
 * What History and the audit export show as a trail row's record (carry 612-C2, ruled at 6.13 planning: one
 * product-wide wording fix, AGENTS.md rule 5). An entry's label is stored when it is written and never
 * rewritten. Some writers once built part of it by lowercasing a stored code ("check sor adjustment",
 * "reconciliation tender table document", "· performance bond", "· workmens compensation policy", "original:
 * contract"); those stored labels are read here, when read, through the same label maps the writers now use, so
 * the screen and the export say "check: Schedule of Rates adjustment checked". A code fragment the maps do not
 * cover shows as the record type's name, never as the code. Labels written in words pass through unchanged.
 *
 * Writers take their labels from these maps (`*_ENTITY_LABEL` helpers below); a source scan
 * (`entity-labels.test.ts`) fails on an audit writer that builds a label from a code. Every new entity
 * registers its record type's name in `RECORD_TYPE_WORDS`. Pure.
 */

import { INSURANCE_KIND_LABEL, SECURITY_KIND_LABEL } from "@/lib/award/labels";
import { CHECK_WORDS, COMPARISON_WORDS, CUSTODY_KIND_WORDS, w, type Words } from "@/lib/contract/labels";
import type { CustodyItemKind, FormationCheckKind, ReconciliationComparison } from "@/lib/contract/types";
import { ACCOUNT_STATUS_WORDS } from "@/lib/auth/words";
import { STAFF_LANGUAGE_VALUE_WORDS } from "@/lib/i18n/language";
import { DOCUMENT_STATE_LABEL } from "@/lib/suppliers/labels";

/// A record type's name, for a stored label whose code fragment no map covers. Every entity whose label
/// carries a mapped part, and every 6.13 entity, is registered here (the scan checks 6.13's are).
export const RECORD_TYPE_WORDS: Readonly<Record<string, Words>> = {
  ContractReconciliation: w("Reconciliation"),
  BackdateConfirmation: w("Back-dating confirmed"),
  ExerciseOpeningOfficer: w("Opening officer"),
  FormationCheck: w("Formation check"),
  CustodyItem: w("Original in custody"),
  SecurityInstrument: w("Security"),
  InsurancePolicy: w("Insurance policy"),
  AwardTermCorrection: w("Award's recorded terms corrected"),
  EstimateEvent: w("Company estimate event"),
  // 6.13 Part A: supervising the contract.
  PostAwardPolicy: w("Post-award policy"),
  ContractSoAssignment: w("Superintending Officer"),
  SoDelegation: w("Delegation to a representative"),
  Possession: w("Possession of site"),
  WorkProgramme: w("Work programme"),
  ProgressRecord: w("Progress"),
  SiteDiaryEntry: w("Site diary"),
  DiaryEndorsement: w("Site diary endorsed"),
  SiteMeeting: w("Special site meeting"),
  ComplianceObservation: w("Compliance observation"),
  ProgrammeDirection: w("Direction on the programme"),
  PendingDeduction: w("Deduction awaiting a certificate"),
  EarlyActionDecision: w("Early action"),
  ContractParty: w("Nominated party or assignee"),
  SiteRecordsHandover: w("Site records handed over"),
  // 6.13 Part A step 3: interim payment and the damages chain.
  CertificateKindSetting: w("Certificate form and routing sheet"),
  ContractClockRule: w("Contract clock"),
  PaymentCalendar: w("Valuation calendar"),
  OpeningPosition: w("Opening position"),
  InterimValuation: w("Interim valuation"),
  MaterialLine: w("Materials on site"),
  PartyLine: w("Nominated party or assignee on a valuation"),
  ValuationDeduction: w("Deduction on a valuation"),
  RetentionRelease: w("Retention released"),
  AdvancePayment: w("Advance payment"),
  FinancePayment: w("Paid by Finance"),
  LadWarning: w("Warning of liquidated damages"),
  NonCompletion: w("Non-completion decision"),
  ApprovalInstance: w("Approval route"),
  ApprovalStep: w("Approval step"),
  // 6.13 Part A step 4: variations and the adjustment of the contract sum.
  Variation: w("Variation"),
  CommitteeDecision: w("Matter tabled at a committee"),
  VariationInstruction: w("The S.O.'s instruction"),
  VariationMeasurement: w("Measured item"),
  DayworkRecord: w("Daywork"),
  VariationCertificate: w("Variation Order Certificate"),
  SumAdjustment: w("Adjustment of the contract sum"),
  // Phase 2 close-out stage A: time and damages.
  ContractMatter: w("Contract matter"),
  DelayNotice: w("Delay notice"),
  EotClaim: w("Extension-of-time claim"),
  EotReason: w("Reason for an extension"),
  ExtensionOfTime: w("Extension of time"),
  LossExpenseClaim: w("Loss and expense"),
  PeriodExtension: w("Extension of the contract period"),
  PeriodAgreement: w("Contract period agreement"),
  LadWaiver: w("Waiver of damages"),
  ContractBaseline: w("Baseline version"),
};

/// The record types 6.13's supervision writes to the contract's trail (each registered above).
export const SUPERVISION_ENTITIES = ["ContractSoAssignment", "SoDelegation", "Possession", "WorkProgramme", "ProgressRecord", "SiteDiaryEntry", "DiaryEndorsement", "SiteMeeting", "ComplianceObservation", "ProgrammeDirection", "PendingDeduction", "EarlyActionDecision", "ContractParty", "SiteRecordsHandover"] as const;

/// The record types 6.13's interim payment and damages chain write to the contract's trail (each registered above),
/// with a certificate's approval route and its steps (614-C4), written under the certificate's label.
export const PAYMENT_ENTITIES = ["PaymentCalendar", "OpeningPosition", "InterimValuation", "MaterialLine", "PartyLine", "ValuationDeduction", "RetentionRelease", "AdvancePayment", "FinancePayment", "LadWarning", "NonCompletion", "ApprovalInstance", "ApprovalStep", "LadWaiver"] as const;

/// Phase 2 close-out stage A: the record types the time acts and the extensions' issue write to the contract's trail (each registered above).
export const TIME_ENTITIES = ["ContractMatter", "DelayNotice", "EotClaim", "EotReason", "ExtensionOfTime", "LossExpenseClaim", "PeriodExtension", "PeriodAgreement", "LadWaiver", "ContractBaseline", "NonCompletion", "ApprovalInstance", "ApprovalStep", "CommitteeDecision"] as const;

/// The record types 6.13's variations and adjustments write to the contract's trail (each registered above), with a
/// variation's approval route and its steps and the matters tabled from it, written under the contract's label.
export const VARIATION_ENTITIES = ["Variation", "ApprovalInstance", "ApprovalStep", "CommitteeDecision", "VariationInstruction", "VariationMeasurement", "DayworkRecord", "VariationCertificate", "SumAdjustment", "ContractSoAssignment"] as const;

/// A company-estimate event as the trail names it ("Company estimate · copy retained"): the words the
/// product's writers use (6.2), by kind.
export const ESTIMATE_EVENT_TRAIL: Readonly<Record<string, string>> = {
  PREPARED: "prepared",
  AMENDED: "amended",
  LODGED: "lodged",
  RETAINED: "copy retained",
  LATE_OVERRIDE: "late, overridden",
  DISCLOSED: "disclosed",
  VOIDED: "voided",
};
export const estimateEventLabel = (kind: string) => `Company estimate · ${ESTIMATE_EVENT_TRAIL[kind] ?? RECORD_TYPE_WORDS.EstimateEvent.en}`;

// ------------------------------------------------------------------ what the writers write now

export const reconciliationLabel = (c: ReconciliationComparison) => `reconciliation: ${COMPARISON_WORDS[c].en}`;
export const formationCheckLabel = (k: FormationCheckKind) => `check: ${CHECK_WORDS[k].en}`;
export const custodyItemLabel = (k: CustodyItemKind) => `original: ${CUSTODY_KIND_WORDS[k].en}`;
export const securityLabel = (reference: string, kind: keyof typeof SECURITY_KIND_LABEL) => `${reference} · ${SECURITY_KIND_LABEL[kind]}`;
export const policyLabel = (reference: string, kind: keyof typeof INSURANCE_KIND_LABEL) => `${reference} · ${INSURANCE_KIND_LABEL[kind]} policy`;

// ------------------------------------------------------------------ what History reads

/// A code's legacy fragment ("TENDER_TABLE_DOCUMENT" → "tender table document") back to the map's label.
function fromFragment(fragment: string, map: Readonly<Record<string, string>>): string | null {
  const code = fragment.trim().toUpperCase().replace(/ /g, "_");
  return Object.prototype.hasOwnProperty.call(map, code) ? map[code] : null;
}
const en = (m: Readonly<Record<string, Words>>): Record<string, string> => Object.fromEntries(Object.entries(m).map(([k, v]) => [k, v.en]));

interface Legacy {
  /// The stored label's tail as a lowercased code once wrote it: (prefix, fragment, suffix).
  re: RegExp;
  map: Readonly<Record<string, string>>;
  /// The tail rewritten through the map, as the writers now write it.
  words: (label: string) => string;
}

const LEGACY: Readonly<Record<string, Legacy>> = {
  ContractReconciliation: { re: /^(.*?)reconciliation ([a-z ]+)()$/, map: en(COMPARISON_WORDS), words: (x) => `reconciliation: ${x}` },
  FormationCheck: { re: /^(.*?)check ([a-z ]+)()$/, map: en(CHECK_WORDS), words: (x) => `check: ${x}` },
  CustodyItem: { re: /^(.*?)original: ([a-z ]+)()$/, map: en(CUSTODY_KIND_WORDS), words: (x) => `original: ${x}` },
  SecurityInstrument: { re: /^(.*· )([a-z ]+)()$/, map: SECURITY_KIND_LABEL, words: (x) => x },
  InsurancePolicy: { re: /^(.*· )([a-z ]+)( policy)$/, map: INSURANCE_KIND_LABEL, words: (x) => `${x} policy` },
  EstimateEvent: { re: /^(.*Company estimate · )([a-z ,]+)()$/, map: ESTIMATE_EVENT_TRAIL, words: (x) => x },
};

/// Fragments already in a map's words (the product's own wording) pass through as they are.
const isWords = (fragment: string, map: Readonly<Record<string, string>>) => Object.values(map).includes(fragment);

/**
 * The record a trail row names, as History and the export show it. A legacy label's code fragment is read
 * through its map; one the map does not cover becomes the record type's name. Anything else is as stored.
 */
export function historyEntityLabel(entity: string, stored: string): string {
  const l = LEGACY[entity];
  if (!l) return stored;
  const m = l.re.exec(stored);
  if (!m) return stored;
  if (isWords(m[2], l.map)) return stored;
  const label = fromFragment(m[2], l.map);
  if (label) return `${m[1]}${l.words(label)}`;
  return `${m[1]}${RECORD_TYPE_WORDS[entity]?.en ?? "Record"}`;
}

/**
 * A trail value an older writer built from a code, read through the label map (612-C2): a supplier approval's
 * "judged under" list, "<document type>: <state as a lowercased code>; …". Anything else is as stored.
 */
export function historyValueWords(entity: string, field: string, value: string | null): string | null {
  // Phase 1b: a sign-in account's standing is stored as its code and read in words, as History reads it.
  if (value != null && entity === "StaffAccount" && field === "status") return ACCOUNT_STATUS_WORDS[value] ?? value;
  // N1: the stored display language is "EN" or "MS", read as the language's own name.
  if (value != null && entity === "StaffAccount" && field === "uiLanguage") return STAFF_LANGUAGE_VALUE_WORDS[value] ?? value;
  if (value == null || entity !== "ApplicationDecision" || field !== "judgedUnder") return value;
  const states = en(DOCUMENT_STATE_LABEL);
  return value
    .split("; ")
    .map((part) => {
      const at = part.lastIndexOf(": ");
      if (at < 0) return part;
      const tail = part.slice(at + 2);
      if (!/^[a-z ]+$/.test(tail)) return part;
      const label = fromFragment(tail, states);
      return `${part.slice(0, at)}: ${label ?? "State not recorded in words"}`;
    })
    .join("; ");
}
