/**
 * The organisation this deployment serves.
 *
 * Single-tenant for now: one deployment, one customer. Every configuration table
 * already carries `organisationId`, so serving several from one deployment is a
 * matter of resolving this from the request rather than a schema change. That
 * resolution arrives with authentication.
 */
export const ORGANISATION_CODE = process.env.ORGANISATION_CODE ?? "RSAJ";
export const ORGANISATION_NAME = process.env.ORGANISATION_NAME ?? "Ranhill SAJ";
