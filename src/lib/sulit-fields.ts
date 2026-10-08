/// Fields the organisation treats as SULIT (6.2 OD-8). Before sign-in nothing could hold one back from a reader, so a list that
/// shows one carries the `sulit: true` flag on that column, which labels it and removes the list's client export (the DataList SULIT
/// guard, NFR-SEC-002 and NFR-AUD-004). Files that must leave are built on the server and recorded (plan 6.17 §4), never downloaded
/// from a list.
///
/// Since Phase 3a (ADR 0034 D14) each entry also says WHICH RECORD decides who may read it: its `scope`. The rule that reads the
/// scope is `sulitAccess` in `src/lib/auth/sulit-access.ts`; the registry only names the scope, so a field cannot be added without
/// saying whose record it belongs to.
///
/// Entries name the property a screen reads, so a module not yet built is caught the day it arrives. Add the field here when its
/// module adds it; the source scan in `sulit-fields.test.ts` does the rest. Keep names specific: the scan matches whole words.

/// What the lock beside a SULIT value, and the lock on a SULIT column's header, say (Phase 3b): the figure is shown only to those entitled to it, and the screen promises
/// nothing about who the reader is. A column's cells are judged one by one for the reader and a list never exports them.
export const SULIT_VALUE_WORDS = "SULIT. Shown only to the people entitled to it, and every reading is logged.";
export const SULIT_COLUMN_WORDS = "SULIT. Shown to the people entitled to it and withheld from everyone else, and every reading is logged. Not exported.";

/// The record a SULIT value belongs to, for who is "named on the record" (ADR 0034 D14):
/// - `exercise`: a sourcing exercise (its estimate, the prices read at opening, the sealed company estimate);
/// - `evaluation`: an exercise's evaluation (scores, evaluated prices, who is recommended);
/// - `requisition`, `contract`, `supplier`: records that keep no list of who is named on them, so only the organisation-wide
///   permission opens them.
export const SULIT_SCOPES = ["exercise", "requisition", "contract", "supplier", "evaluation"] as const;
export type SulitScope = (typeof SULIT_SCOPES)[number];

export interface SulitField {
  /// The property name as a screen reads it.
  field: string;
  /// The record that decides who may read it.
  scope: SulitScope;
  /// What it is, for the test's failure message.
  what: string;
  /// A field a second kind of record also carries, read by the scope of the record in hand (the department estimate sits on a
  /// requisition and is copied onto its sourcing exercise).
  alsoIn?: readonly SulitScope[];
}

export const SULIT_FIELDS: readonly SulitField[] = [
  { field: "estimatedValue", scope: "requisition", alsoIn: ["exercise"], what: "the department estimate on a requisition or a sourcing exercise" },
  // Founder, 2026-10-05: the value an open route was routed on, on the sittings page's "Waiting to be tabled" list.
  { field: "waitingValue", scope: "requisition", alsoIn: ["exercise", "contract"], what: "the value a route waiting to be tabled was routed on (a requisition's is the department estimate)" },
  { field: "companyEstimate", scope: "exercise", what: "the sealed company estimate" },
  { field: "openingPrice", scope: "exercise", what: "a price read out at bid opening" },
  { field: "openingPrices", scope: "exercise", what: "prices read out at bid opening" },
  { field: "correctedPrice", scope: "exercise", what: "a bid price after arithmetic correction" },
  { field: "correctedPrices", scope: "exercise", what: "bid prices after arithmetic correction" },
  { field: "score", scope: "evaluation", what: "an evaluation score" },
  { field: "scores", scope: "evaluation", what: "evaluation scores" },
  { field: "totalScore", scope: "evaluation", what: "an evaluation total score" },
  { field: "cprPercent", scope: "supplier", what: "a contractor performance percentage" },
  { field: "estimatePaperCopy", scope: "exercise", what: "the figure on the company estimate's paper copy, entered at finalising an opening (6.7 C-1)" },
  { field: "committedEstimate", scope: "requisition", what: "the department estimate as committed against a budget code, in a commitment's audit row (6.7 re-review: it was written as amount)" },
  { field: "letterQuote", scope: "exercise", what: "how a bidder's withdrawal letter identifies its envelope, quoted from the letter (6.6 CR-4)" },
  // 6.8 (E-3): the evaluation's figures, as its screens and its audit rows name them.
  { field: "evaluatedPrice", scope: "evaluation", what: "a bid's price as evaluated (corrected where corrected) (6.8)" },
  { field: "recommendedPrice", scope: "evaluation", what: "the price the evaluation recommends (6.8)" },
  { field: "priceBeforeRound", scope: "evaluation", what: "a bid's price before a negotiation round (6.8 FR-EVL-016)" },
  { field: "priceAfterRound", scope: "evaluation", what: "a bid's price after a negotiation round (6.8 FR-EVL-016)" },
  { field: "monthlyBalances", scope: "evaluation", what: "a bidder's three monthly balances for the minimum-capital test (6.8 FR-EVL-010)" },
  { field: "stageFigure", scope: "evaluation", what: "a bidder's figure on an evaluation stage (6.8)" },
  { field: "compositeScore", scope: "evaluation", what: "a bidder's composite figure (6.8)" },
  { field: "savingAmount", scope: "evaluation", what: "the saving against the company estimate (6.8 FR-EVL-018)" },
  { field: "communicationContent", scope: "evaluation", what: "what a written communication with a tenderer says, which may quote a price (6.8 FR-EVL-013)" },
  // 6.8 fix R-5: free text that judges or quotes a price, kept out of the audit export.
  { field: "narrative", scope: "evaluation", what: "an aspect's narrative, which judges the price against the estimate (6.8 FR-EVL-003, fix R-5)" },
  { field: "meetingMinutes", scope: "evaluation", what: "a clarification's or a negotiation's minutes, which may quote a price (6.8 FR-EVL-015, 016, fix R-5)" },
  // 6.8 Q2 (NFR-SEC-002, FR-EVL-014): who is recommended, before the Board decides. Not the bare word
  // "recommended", a boolean key elsewhere that the whole-word scan would misread.
  { field: "recommendedTenderer", scope: "evaluation", what: "the tenderer an evaluation recommends, before the Board decides (6.8 Q2)" },
  // 6.8 re-review 3: why a tenderer other than the top-ranked is recommended, which names and compares tenderers.
  { field: "rankingJustification", scope: "evaluation", what: "why the evaluation recommends a tenderer other than the top-ranked, before the Board decides (6.8 re-review 3)" },
  // 6.15 condition (2): a supplier's people, as the register records them (never a Person, ADR 0019). Not
  // restricted until sign-in; History chips them and the audit export withholds them.
  { field: "contactName", scope: "supplier", what: "a supplier contact's name (6.15 condition 2)" },
  { field: "contactDesignation", scope: "supplier", what: "a supplier contact's designation (6.15 condition 2)" },
  { field: "contactEmail", scope: "supplier", what: "a supplier contact's email (6.15 condition 2)" },
  { field: "contactPhone", scope: "supplier", what: "a supplier contact's telephone (6.15 condition 2)" },
  // 6.12 (FR-CON-005 b): the estimate's rate a tendered rate is tested against for front loading. Shown with
  // the chip on the contract's checks, never in a list, and kept out of the trail.
  { field: "estimateRate", scope: "contract", what: "the estimate's rate a tendered rate is compared with for front loading (6.12)" },
  // 6.12 review (BD-612-24, 6.8's correctedPrice precedent): an arithmetical correction's priced figures, as the
  // trail names them. Not the bare words "tendered" / "corrected", which the whole-word scan would misread.
  { field: "tenderedLineAmount", scope: "contract", what: "a bill line's figure as tendered, in an arithmetical correction at contract formation (6.12)" },
  { field: "correctedLineAmount", scope: "contract", what: "a bill line's figure as corrected, in an arithmetical correction at contract formation (6.12)" },
  // 6.12 ruling Q2 (BD-612-24): with the contract sum it gives the selected tender's corrected total (6.8's correctedPrice).
  // Not "arithmeticVariance", the function's name, which the whole-word scan would find in every caller.
  { field: "arithmeticVarianceAmount", scope: "contract", what: "the arithmetic corrections' variance against the tendered figures, in a check's completion trail (6.12 Q2)" },
  // 6.14 inc 1 fix R-7: a certificate's figures as the trail names them: an override's computed and overridden
  // figures, and the amount a recommending block supported up to. Not the bare words "computed", "overridden"
  // or "cap", which the whole-word scan would find everywhere.
  { field: "certificateComputedAmount", scope: "contract", what: "a certificate figure as computed, in an override's trail (6.14)" },
  { field: "certificateOverrideAmount", scope: "contract", what: "a certificate figure as overridden, in an override's trail (6.14)" },
  { field: "signatureSupportedUpTo", scope: "contract", what: "the amount a certificate's recommending block supported up to, in a signature's trail (6.14)" },
  // 6.13 Part B Run 1a fix round (review S4): a contract matter's amount and exact ratio, read SULIT wherever shown
  // (BD-613-73). Not "routedValue", the approval module's function and the variation order's figure.
  { field: "matterRoutedValue", scope: "contract", what: "the value a contract matter's route is resolved on (6.13 Part B)" },
  { field: "matterRatioNum", scope: "contract", what: "the numerator of the exact ratio a contract matter's route is resolved on, e.g. the damages waived (6.13 Part B)" },
  { field: "matterRatioDen", scope: "contract", what: "the denominator of the exact ratio a contract matter's route is resolved on, e.g. the damages amount (6.13 Part B)" },
  // Phase 3b (FR-EVL-020): a bidder's name on an anonymised technical scoring stage, revealed only for a criterion that needs the named contractor. Judged and logged as the evaluation is.
  { field: "bidderIdentity", scope: "evaluation", what: "a bidder's name on an anonymised technical scoring stage, revealed for a criterion that needs it (FR-EVL-020)" },
  // Phase 3b (6.2 OD-8, sign-in plan 3b): the priced bill of quantities is the department's estimate in detail, so its rates, line amounts and totals are an
  // exercise's SULIT, read by the people named on it. The bill issued to tenderers is unpriced and carries none of them.
  { field: "bqRate", scope: "exercise", what: "a bill of quantities line's rate (6.2, Phase 3b)" },
  { field: "bqAmount", scope: "exercise", what: "a bill of quantities line's amount (6.2, Phase 3b)" },
  { field: "bqTotals", scope: "exercise", what: "a bill of quantities version's total, firm value and the sums that make it up (6.2, Phase 3b)" },
  // Phase 3b: a committee matter's amount (`matter-amount.ts` says which kinds): a requisition's gate matter carries the department estimate, a contract matter its routed value,
  // and a manual matter or one not yet decided is read as SULIT. A record that keeps no list of who is named, so only the organisation-wide permission opens it.
  { field: "matterAmount", scope: "requisition", alsoIn: ["contract"], what: "a committee matter's amount, where its kind is SULIT or not decided (Phase 3b)" },
  // Phase 3b (OD-2, doc store): the bytes of a document classified SULIT. Every kind of record can hold one (an exercise's tender papers, a requisition's, a contract's statutory
  // declaration, a supplier's scan), so the field belongs to whichever record the document hangs on: it is read by the people that record's scope names.
  { field: "documentBytes", scope: "exercise", alsoIn: ["evaluation", "requisition", "contract", "supplier"], what: "the bytes of a document classified SULIT, downloaded from the record it hangs on (OD-2)" },
  // Phase 3b (FR-AWD-008, 6.11 ruling; 6.11 R20): the identity card number of the contractor's signatory, on the award's return and on the contract's signature.
  { field: "icNumber", scope: "exercise", alsoIn: ["contract"], what: "the identity card number of a contractor's signatory (FR-AWD-008, 6.11)" },
];

/// The registered fields a kind of record carries: its own, and those it also carries. What a screen that shows several of them asks the rule about at once.
export const fieldsOfScope = (scope: SulitScope): string[] => SULIT_FIELDS.filter((f) => f.scope === scope || f.alsoIn?.includes(scope)).map((f) => f.field);

/// Whether a stored field (an audit change's field name) is a registered SULIT field: a History
/// that shows its change shows it with the SULIT chip.
export const isSulitField = (field: string): boolean => SULIT_FIELDS.some((f) => f.field === field);

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/// The registered fields a piece of source mentions as whole words.
export function sulitFieldsIn(source: string): SulitField[] {
  return SULIT_FIELDS.filter((f) => new RegExp(`(?<![\\w$])${escape(f.field)}(?![\\w$])`).test(source));
}

/// Each `<DataList …/>` element in a file with the region that feeds it: from the end of the
/// previous list (or the file's start) to the end of this element. Rows are often built just
/// above the element, so the region is what the list could show.
export function dataListRegions(source: string): { region: string; element: string; line: number }[] {
  const out: { region: string; element: string; line: number }[] = [];
  let from = 0;
  let at = source.indexOf("<DataList", from);
  while (at !== -1) {
    // The element ends at the first `/>` outside any braces.
    let depth = 0;
    let end = source.length;
    for (let i = at; i < source.length; i++) {
      const c = source[i];
      if (c === "{") depth++;
      else if (c === "}") depth--;
      else if (depth === 0 && c === "/" && source[i + 1] === ">") {
        end = i + 2;
        break;
      }
    }
    out.push({
      region: source.slice(from, end),
      element: source.slice(at, end),
      line: source.slice(0, at).split("\n").length,
    });
    from = end;
    at = source.indexOf("<DataList", from);
  }
  return out;
}

/// True when the list's region reads a registered field but no column is flagged.
export function unflaggedSulitFields(region: string): SulitField[] {
  if (/\bsulit:\s*true\b/.test(region)) return [];
  return sulitFieldsIn(region);
}
