/**
 * Who the demo's hand-written trail rows say wrote them (Phase 1b, ADR 0034 D11): the demo loader, as a system actor, never a person and never a blank.
 * A row written through the product's own acts is already attributed this way (`installLoader` in `demo-acts.ts`); these are the rows the loaders write
 * straight into `AuditEntry` to show a history older than the demo's own clock. They satisfy `AuditEntry_actor_matches_kind`: a system actor names what ran.
 */
export const DEMO_ACTOR = { unattributed: false as boolean, actorKind: "SYSTEM" as const, actorSystemLabel: "demo loader" };
