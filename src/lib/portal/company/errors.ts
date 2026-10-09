import type { CompanyFinding } from "./types";

/**
 * A Company act refused by the rules, thrown from inside the act's transaction so that nothing is written (the document store's own upload refusal is `UploadRefusal`). Carries the findings in
 * the order the rules returned them, and the status the handler answers with: 422 for something the supplier can put right, 404 for something that is not theirs.
 */
export class CompanyRefused extends Error {
  constructor(
    readonly faults: readonly CompanyFinding[],
    readonly status: 404 | 409 | 422 = 422,
  ) {
    super(faults.map((f) => f.code).join(", "));
    this.name = "CompanyRefused";
  }
}
