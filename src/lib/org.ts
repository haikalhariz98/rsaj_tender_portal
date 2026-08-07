/**
 * The organisation this deployment serves.
 *
 * Single-tenant for now: one deployment, one customer. Every configuration table
 * already carries `organisationId`, so serving several from one deployment is a
 * matter of resolving this from the request rather than a schema change. That
 * resolution arrives with authentication.
 */
export const ORGANISATION_CODE = process.env.ORGANISATION_CODE ?? "ORG";
export const ORGANISATION_NAME = process.env.ORGANISATION_NAME ?? "Your organisation";

/// Shown under the name in the sidebar. Blank is fine.
export const ORGANISATION_STRAPLINE = process.env.ORGANISATION_STRAPLINE ?? "Procurement";
