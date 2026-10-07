# 0020 — Identity: separate staff and vendor stores behind one façade (not built)

**Superseded by ADR 0034** (`0034-sign-in-sessions-authorisation-and-tenant-isolation.md`, D1 to D3), marked 2026-10-07 in Phase 1d of the sign-in programme under ruling O-3. The text below is kept as written.

**Status (as written):** Proposed (written at 6.15a step 0, 2026-10-02, under `docs/notes/plans/phase3-6-rulings.md` §6.15 condition (1):
docs only — no `User` model, no `SupplierAccount`, no stub). Building it needs the founder to lift "Never build sign-in"
(founder's end-of-build list, item 13). Plan: `docs/notes/plans/6.15-supplier-register.md` §0.1 option A.

## Context

Sign-in is ruled a go-live condition for any customer (decisions log, Phase 1). It is also what the deferred controls wait on:
maker-checker on configuration (NFR-USE-004, NFR-SEC-004), restricting SULIT reads (NFR-SEC-001, 002), the authenticated halves of
6.7's authorisations and 6.8's scoring, and the whole vendor portal (6.15b) and electronic box (6.15c). NFR-SEC-005 and INT-14 say
vendors authenticate against an identity store separate from staff. The customer's corporate directory is not decided (D5-like).
ADR 0019 already keeps a supplier's people off `Person` so that this can land without a reshape.

## Proposed decision

1. **Two stores, one façade.** An `IdentityProvider` interface with a staff adapter (the corporate directory once chosen) and a
   vendor adapter (the portal's own store, or an external one), never one table for both.
2. **Staff:** a `User` (sign-in account) maps one-to-one to a `Person` (identity, unchanged). `Person` stays the subject of every
   "recorded on behalf of" attribution, which then becomes "signed by".
3. **Vendors:** a `SupplierAccount` maps to a `SupplierContact` (ADR 0019), and through it to one `Supplier`. A vendor session
   sees only its own supplier's records (FR-VND-013: never another vendor's identity, price, score or documents).
4. **Sessions and step-up:** MFA for approvers; re-authentication at approve, sign and unseal (NFR-SEC-006).
5. **Review:** security-critical; external review before go-live.

## Consequences

- When accepted, `recorded on behalf of, not signed` becomes an attribution; maker-checker attaches at "issue" (AGENTS.md); the
  "Not restricted until sign-in" chips become restrictions.
- Until accepted, nothing in the code refers to `User`, `SupplierAccount` or a session: the 6.15a register is staff-recorded
  (ADR 0019) and no page pretends to know who is signed in.
