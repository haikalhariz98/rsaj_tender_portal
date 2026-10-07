# Draft 0034 — AGENTS.md, autonomous-build.md and the identity ADRs after sign-in

**Status: DRAFT, held for the founder. Nothing here is applied.** Written in Phase 1d of the sign-in programme (2026-10-07) under
ruling O-3 (decisions log, 2026-10-06: "O-3 sent back, not approved"). AGENTS.md is loaded through CLAUDE.md and governs the agents
themselves, so neither a script nor an agent message can authorise changing it; only the founder's ruling on **this text** can. Until
then builders work under standing rule 1 of `docs/notes/plans/signin-programme.md` (the founder's override of 2026-10-06), and AGENTS.md
and `docs/notes/autonomous-build.md` stay exactly as they are.

Each proposed row below says which phase makes it true. A row whose phase has not landed must not be applied before it lands: the text
would then claim something the product does not do. As of this draft, Phases 0 and 1a–1d are built; Phases 2–5 are not.

Applied already, because they only record rulings already made (O-3): ADR 0020 marked "superseded by 0034" (Phase 1d). Not applied:
ADR 0019's "recorded by an officer" line (amended when Phase 4a lands; until then it is still true) and the founder's acceptance
documents, which get a dated note only (Phase 1d) and are never rewritten.

---

## 1. AGENTS.md — "This is a product" section

**Current:** "`organisationId` is on every configuration table, so a second customer is a seed rather than a migration. There is no tenant
isolation middleware yet; it arrives with authentication."

**Proposed (true from Phase 1c):** "`organisationId` is on every configuration table. Every load and write by id names the signed-in
person's organisation, held by `src/lib/auth/tenant-scan.test.ts` and the cross-organisation suite (`src/lib/auth/tenant.db.test.ts`).
The supported deployment is **one organisation per database** until that suite covers every action; there is no row-level security
(ADR 0034 D10, as amended). A second customer is a second database, seeded."

## 2. AGENTS.md — "Platform decisions already made" table

| Row | Current | Proposed | True from |
| --- | --- | --- | --- |
| Auth | "No auth, no `User` model yet. Deliberate. `Person` is identity, separate from sign-in. Do not stub auth." | "Sign-in is local credentials behind the identity façade (ADR 0034). `Person` stays identity; `StaffAccount` is how a person signs in, never who they are. Sessions are database rows behind an opaque token in a `__Host-`, HttpOnly, Secure, **Lax** cookie, and every POST passes the Origin/Sec-Fetch guard. There is **no `assurance` field** and no step-up window: the password is asked again at every signature-class act. Every entry point asks who is signed in first (`src/app/_auth/auth-reach.test.ts`)." | 1a (accounts, sessions, cookie), 1b (guard everywhere), Phase 2 (password at each act) |
| Second factor | (no row) | "**Not built, and NFR-SEC-005 is not met.** The founder put the second sign-in factor out of scope until his own go-ahead (2026-10-06). Risk R-1 is accepted for the build and internal acceptance runs only (O-2); going live without it is a go-live condition that needs the founder's go-ahead and the customer's written acceptance. The directory half of NFR-SEC-005 (INT-14) is not met either. When authorised, the factor attaches at the password re-entry step (`IdentityProvider.confirmPassword`). Do not add it, or an `assurance` field, without that go-ahead." | now (states a gap) |
| Maker-checker | "Maker-checker deferred until sign-in … Do not fake a second approval." | "A configuration change needs a second person: the maker proposes, a different signed-in person decides (`ConfigurationChange`). Core editors from Phase 2c, every remaining editor from Phase 5. **Do not fake a second approval:** the checker is a different signed-in account, never a second click by the first, and never inferred from who is on record. Issuing the approval matrix is where the checker attaches; an issuer who edited the draft cannot issue it." | 2c (core), 5 (all). Until 5, the current row's interim controls stay for the editors not yet covered. |
| Delegation line rules | "Delegation line-management rules deferred … `faultsIn` enforces everything else and says so." | "FR-APR-011's line rules (grantor is the jobholder's superior, delegate a line subordinate) are enforced from reporting lines held as configuration; a grant by someone with no recorded line is refused and says which line is unset." | 3c. Until 3c the current row stands. |
| Audit trail | (no row) | "Every audit row names its actor (ADR 0034 D11). The trail is append-only **in the database**: triggers refuse UPDATE, DELETE and TRUNCATE on `AuditEntry` and `SignInEvent` for every login including the owner, with no bypass; the running app connects as `perolehan_app`, which holds none of the three on the trail; an organisation with a trail cannot be deleted. Demo loaders are additive and `demo:wipe` is retired." | 1b (actor), 1d (triggers, role, additive demo) |
| Sign-in addresses (O-1) | (no row) | "The source address and user agent of a sign-in live in `SignInEventDetail`, apart from the permanent `SignInEvent`. Its trigger refuses every UPDATE, and refuses a DELETE unless the row is older than `SecurityPolicy.signInDetailRetentionDays`; **unset means refuse**: every delete is refused and the screen says the addresses are kept. The setting is at least the address-throttle window. The app's login cannot delete them; an operator purge (command line, no scheduler, after Phase 2c) removes expired rows and writes one SYSTEM audit row with the cutoff and the count. `AuditEntry.sourceAddress` stays permanent (NFR-AUD-001) until NFR-RET-001's schedule; legal hold (NFR-RET-002) is not built and the setting's screen says so." | 1a (split), 1d (trigger, grants), after 2c (purge) |

Unchanged and kept word for word: Next.js 16 + Prisma 7 + Postgres 17; standalone system of record behind a façade.

## 3. AGENTS.md — "Rules that are not negotiable"

Kept as they are, with one addition to rule 1's spirit made explicit:

- **Unset means refuse.** Every security and policy setting the programme adds is a nullable column with no default. Unset, the act it
  governs is refused and the screen names what is unset (sign-in with no session limits, a code with no validity, a retention period with
  none set). Never ship a default that reads as the customer's choice.

## 4. `docs/notes/autonomous-build.md` — the "Never" section

**Current:** "Push, open pull requests, deploy, or contact any outside service. Delete or reset the database. Build sign-in, tenancy or
maker-checker (deferred — see AGENTS.md). Weaken or delete an existing test to make something pass. Hard-code anything RSAJ-specific."

**Proposed (narrowed, not deleted):** "Push, open pull requests, deploy, or contact any outside service. Delete or reset the database.
Build a second sign-in factor, or an `assurance` field, without the founder's own go-ahead. Fake a second approval, or let a trigger on
the trail be bypassed by any role. Weaken or delete an existing test to make something pass. Hard-code anything RSAJ-specific."

Sign-in, tenancy and maker-checker leave the list because the founder authorised them (2026-10-06); everything else on it stays.

## 5. ADR 0020 (identity: separate staff and vendor stores)

Applied in Phase 1d: its status line now reads "Superseded by ADR 0034". Its decision (separate stores behind one façade) is carried
into ADR 0034 D1–D3; nothing in 0020 is rewritten.

## 6. ADR 0019 (the supplier register is staff-recorded)

Line to amend **when Phase 4a lands, not before**: decision 1, "An officer records a supplier from its paper application". Proposed:
"An officer records a supplier from its paper application, **or the supplier applies through its own portal account (Phase 4a, ADR 0034
D2)**; either way the register's standing is derived, and a supplier is never a Person." Until 4a, every supplier is recorded by an
officer and the line is true as written.

## 7. The founder's acceptance documents

Not rewritten (O-3). Each gets a dated note under the item, added in Phase 1d:

- `docs/notes/phase1-acceptance.md` §6 item 10 (sign-in as a go-live condition).
- `docs/notes/phase3-acceptance.md` founder condition 3 (sign-in and the §13.5 departure).

The note says the founder authorised the sign-in programme on 2026-10-06, which phases are built, and that NFR-SEC-005 (second factor)
is still not met and remains a go-live condition.

## 8. What the founder is asked to rule on

1. Sections 1 to 4 as a whole, or row by row. Each row is applied only once its phase has landed.
2. Whether the "Second factor" row should sit in AGENTS.md at all, or only in ADR 0034 and the go-live list.
