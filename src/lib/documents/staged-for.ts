/**
 * What an uploaded file is staged for, where that decides who may stage it. A form field of the upload route (`stagedFor`).
 *
 * The one purpose so far is the scan of a delegation's signed recommendation (FR-APR-012): the delegation is the administrator's own configuration act, so an administrator account
 * may stage that file although uploading a document is otherwise a transaction it is kept apart from (NFR-SEC-004). Pure.
 */
export const STAGED_FOR_DELEGATION = "delegation-recommendation";
