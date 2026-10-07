/**
 * The issued report as a reader may see it (Phase 3b, FR-EVL-014 and the custody of the company estimate, FR-EST-008).
 *
 * The report is frozen when it is issued and never recomputed, and what it froze includes figures worked out from the company estimate: the saving, each
 * bid's difference from the estimate (Annex B), and the rendered text, into which the template merged the saving. A reader the evaluation is open to is not
 * thereby in the estimate's custody, so those parts are judged apart. The text is a rendered string with its figures already in it, and the figures are
 * formatted twice over (to two places in the text, to four in the structured copy), so no pattern can be trusted to find every one of them: where the
 * report states a saving, the text is withheld whole from a reader outside the estimate's custody rather than cut. Pure.
 */

import type { ReportSnapshot } from "./report";

export const ESTIMATE_WITHHELD_WORDS = "Worked out from the company estimate, which is read only by its preparer and the offices that hold its copies and audit it.";

export interface ReportForReader {
  report: ReportSnapshot;
  /// Set where a part was held back because it is worked out from the estimate: the reason, in words. Null where nothing was.
  estimateWithheld: string | null;
}

const annexBody = (r: ReportSnapshot, key: string): unknown => r.annexes.find((a) => a.key === key)?.body;
const scheduleBenchmark = (body: unknown): { companyEstimate?: unknown } | null => {
  const b = body && typeof body === "object" && !Array.isArray(body) ? (body as { benchmark?: unknown }).benchmark : null;
  return b && typeof b === "object" ? (b as { companyEstimate?: unknown }) : null;
};

/// Whether the frozen report carries a figure worked out from the company estimate, or the estimate itself (Annex C is the opening's schedule as frozen, and
/// its benchmark holds the estimate once disclosed).
export function statesEstimateFigures(r: ReportSnapshot): boolean {
  const b = annexBody(r, "B");
  const vs = Array.isArray(b) && (b as { vsEstimate?: unknown }[]).some((x) => x.vsEstimate != null && typeof x.vsEstimate === "object");
  return r.saving.state === "STATED" || vs || typeof scheduleBenchmark(annexBody(r, "C"))?.companyEstimate === "string";
}

/// The report with the parts worked out from the estimate held back, unless the reader is in its custody (`estimateOpen`).
export function reportForReader(r: ReportSnapshot, estimateOpen: boolean): ReportForReader {
  if (estimateOpen || !statesEstimateFigures(r)) return { report: r, estimateWithheld: null };
  const annexes = r.annexes.map((a) => {
    if (a.key === "C" && scheduleBenchmark(a.body)) return { ...a, body: { ...(a.body as Record<string, unknown>), benchmark: undefined } };
    if (a.key !== "B" || !Array.isArray(a.body)) return a;
    return { ...a, body: (a.body as Record<string, unknown>[]).map((x) => ({ ...x, vsEstimate: typeof x.vsEstimate === "object" && x.vsEstimate !== null ? "Withheld" : x.vsEstimate })) };
  });
  return {
    report: {
      ...r,
      annexes,
      saving: { state: "NO_ESTIMATE", amount: null, percent: null },
      text: { ...r.text, body: "" },
    },
    estimateWithheld: ESTIMATE_WITHHELD_WORDS,
  };
}
