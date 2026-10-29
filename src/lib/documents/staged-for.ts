/**
 * What an uploaded file is staged for, where that decides who may stage it. A form field of the upload route (`stagedFor`).
 *
 * The one purpose so far is the scan of a delegation's signed recommendation (FR-APR-012): the delegation is the administrator's own configuration act, so an administrator account
 * may stage that file although uploading a document is otherwise a transaction it is kept apart from (NFR-SEC-004). Pure.
 */
export const STAGED_FOR_DELEGATION = "delegation-recommendation";

/**
 * SR-11 (ruling 14): a template file for a configured tender document part. Setting it is a configuration act, proposed by whoever holds the permission to draft configuration and decided by a
 * second person, so an administrator account that holds that permission may stage the file, as for a delegation's recommendation. The file is stored unattached; filing it to the part is the issuing step.
 */
export const STAGED_FOR_TEMPLATE_FILE = "tender-part-template";

/**
 * ADR 0042 D8 (plan step 2): a file of a Project workspace document's version. Staged first, outside any contract lock, by the staff upload route or the
 * portal's project upload route, in the configured project class; the act that creates the version then pins it (`stagedFileFaults`,
 * src/lib/project-docs/bounds.ts), and refuses a file staged for anything else, or by anyone else.
 */
export const STAGED_FOR_PROJECT_DOCUMENT = "project-document";

/**
 * Workspace 3a (W-8): a file of a work item. Staged first, outside any contract lock, by the staff upload route; the work act that attaches it then pins it
 * under the contract's lock and the item's, and refuses a file staged for anything else, or by anyone else.
 */
export const STAGED_FOR_WORK_ITEM = "work-item";

/**
 * Review S7: whether a document may be a configured part's template file. Any version of the organisation used to be accepted; now only a document the upload route staged for this
 * purpose, which no record holds, and never a SULIT one (every officer downloads a template file, on every exercise, restricted or not). Words for the officer, or null. Pure.
 */
export function templateFileRefusal(doc: { stagedFor: string | null; classification: string | null; attachments: number }): string | null {
  if (doc.stagedFor !== STAGED_FOR_TEMPLATE_FILE) return "That file was not uploaded as a template file. Upload it from this form.";
  if (doc.classification === "SULIT") return "A SULIT file cannot be a template file: officers on every exercise download it. Choose a class that is not SULIT.";
  if (doc.attachments > 0) return "That file is already attached to a record, so it cannot also be a template file. Upload it again from this form.";
  return null;
}

/**
 * ADR 0045 D1: a wet-signed scan of an award return, staged by the contractor's signing-authority account in the award return class (which is SULIT), outside any lock. The
 * lodge then pins it to the online return (`stagedReturnFileFaults`, src/lib/award/online-return.ts), and refuses a file staged for anything else, or by any other account.
 */
export const STAGED_FOR_AWARD_RETURN = "award-return";
