/// Fields the organisation treats as SULIT (6.2 OD-8) that cannot yet be held back from a
/// reader: there is no sign-in to say who is reading. A list that shows one must carry the
/// `sulit: true` flag on that column, which labels it and removes the list's client export
/// (the DataList SULIT guard, NFR-SEC-002 and NFR-AUD-004). Files that must leave are built on
/// the server and recorded (plan 6.17 §4), never downloaded from a list.
///
/// Entries name the property a screen reads, so a module not yet built is caught the day it
/// arrives. Add the field here when its module adds it; the source scan in
/// `sulit-fields.test.ts` does the rest. Keep names specific: the scan matches whole words.
export interface SulitField {
  /// The property name as a screen reads it.
  field: string;
  /// What it is, for the test's failure message.
  what: string;
}

export const SULIT_FIELDS: readonly SulitField[] = [
  { field: "estimatedValue", what: "the department estimate on a requisition or a sourcing exercise" },
  { field: "companyEstimate", what: "the sealed company estimate" },
  { field: "openingPrice", what: "a price read out at bid opening" },
  { field: "openingPrices", what: "prices read out at bid opening" },
  { field: "correctedPrice", what: "a bid price after arithmetic correction" },
  { field: "correctedPrices", what: "bid prices after arithmetic correction" },
  { field: "score", what: "an evaluation score" },
  { field: "scores", what: "evaluation scores" },
  { field: "totalScore", what: "an evaluation total score" },
  { field: "cprPercent", what: "a contractor performance percentage" },
  { field: "estimatePaperCopy", what: "the figure on the company estimate's paper copy, entered at finalising an opening (6.7 C-1)" },
  { field: "committedEstimate", what: "the department estimate as committed against a budget code, in a commitment's audit row (6.7 re-review: it was written as amount)" },
  { field: "letterQuote", what: "how a bidder's withdrawal letter identifies its envelope, quoted from the letter (6.6 CR-4)" },
  // 6.8 (E-3): the evaluation's figures, as its screens and its audit rows name them.
  { field: "evaluatedPrice", what: "a bid's price as evaluated (corrected where corrected) (6.8)" },
  { field: "recommendedPrice", what: "the price the evaluation recommends (6.8)" },
  { field: "priceBeforeRound", what: "a bid's price before a negotiation round (6.8 FR-EVL-016)" },
  { field: "priceAfterRound", what: "a bid's price after a negotiation round (6.8 FR-EVL-016)" },
  { field: "monthlyBalances", what: "a bidder's three monthly balances for the minimum-capital test (6.8 FR-EVL-010)" },
  { field: "stageFigure", what: "a bidder's figure on an evaluation stage (6.8)" },
  { field: "compositeScore", what: "a bidder's composite figure (6.8)" },
  { field: "savingAmount", what: "the saving against the company estimate (6.8 FR-EVL-018)" },
  { field: "communicationContent", what: "what a written communication with a tenderer says, which may quote a price (6.8 FR-EVL-013)" },
];

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
