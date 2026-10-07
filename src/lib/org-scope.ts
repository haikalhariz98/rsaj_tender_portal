/**
 * Whose data a read or a write is for (ADR 0034 D10): the signed-in actor's organisation, never the deployment's.
 *
 * A `StaffActor` is one, so a page or an action passes its actor as it is. The few readers that need the code as well as the id (the
 * roster, the delegations and the authority matrix are looked up by code) take this; the rest take the id alone. A loader script's
 * actor is the deployment's organisation (`src/app/_auth/loader.ts`); the public pages use `src/lib/portal/deployment.ts`.
 */
export interface OrgScope {
  readonly organisationId: string;
  readonly organisationCode: string;
}

/// An organisation row as a scope: for code that has already read the organisation (a locked act's `l.org`).
export const scopeOf = (org: { id: string; code: string }): OrgScope => ({ organisationId: org.id, organisationCode: org.code });
