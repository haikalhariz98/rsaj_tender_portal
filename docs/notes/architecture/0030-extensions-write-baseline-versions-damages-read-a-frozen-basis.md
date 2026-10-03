# 0030 — Extensions write baseline versions; damages read a frozen basis

**Status:** Accepted (product owner's go with changes, 2026-10-04: decisions log "6.13 Part B · step 0 go WITH CHANGES",
BD-613-75, 89; 613A-C2). Written at 6.13 Part B run 0; built in run 1b. Amends ADR 0021 as its Amendment 2 (below).
Plan: `docs/notes/plans/6.13-post-award-lifecycle.md` Part B, B2 (613A-C2), B5 `lad/*`, B6's conflict table.

## Context

Part A records the damages decision on the Certificate of Non-Completion (OD-A1 A): the decision freezes the rate and
the date for completion it was made under, and each interim certificate charges damages from it. Part A also recorded the
entitlement determination on that decision (613A-C2), because extension-of-time records did not exist. Part B brings the
EOT certificate and the contract period extension, which move the date for completion after damages may already have
been charged on issued certificates, and the LAD waiver, whose approver is picked by the ratio waived ÷ the LAD amount.

An issued certificate is never rewritten (ADR 0008, ADR 0022).

## Decision

1. **An extension is a baseline version.** An issued EOT certificate writes a baseline version with reason
   EXTENSION_OF_TIME and the new date for completion of its scope; an issued contract period agreement writes
   PERIOD_EXTENSION. Both go through 6.12's version writer (ADR 0021 Amendment 2 adds the two reasons).
2. **The damages decision is superseded for later certificates only.** A live decision whose frozen date for completion
   is earlier than the new one is superseded. A later valuation **whose day is past the new date** is refused
   NON_COMPLETION_SUPERSEDED, naming the EOT certificate, until a replacement decision is recorded. Where the valuation day
   is on or before the new date, no replacement is asked for: the superseded decision closes with the extension, its
   reason recorded (BD-613-89).
3. **Damages charged for extended days are returned by a computed credit.** `LAD_CREDIT` on the next certificate: per rate
   segment of each issued damages line, the days inside the extension × that segment's rate. The line's ± rounding is never
   returned; a credit is never keyed and returns a segment once (BD-613-89).
4. **Credits plus waivers never exceed the damages charged** on a line (BD-613-75).
5. **A waiver's LAD amount is frozen when it is sent.** If the basis moves after that (a credit, a supersession, an
   occupation's confirmed rate), applying the waiver is refused LAD_BASIS_MOVED and the waiver is re-sent, because the
   ratio picks the approver (FR-LAD-009).
6. **A certificate freezes the basis it charged under.** An interim's `judgedUnder.lad` names the decision, segments,
   credits and waivers it read; an issue whose basis moved since raise is refused LAD_BASIS_MOVED, naming what moved.

## Consequences

- Issued certificates stay as issued; every correction is a later line with its source named.
- Every pair that moves the basis (EOT issue, waiver, occupation rate, practical completion) against an interim in
  progress is refused at the interim's issue, in either order (plan B6).
- Rules out: re-rating an issued line, keying a credit, returning a rounding, and applying a waiver approved on an old
  amount.

## ADR 0021 Amendment 2

Recorded in ADR 0021's own Amendments section (2026-10-04): the two version reasons EXTENSION_OF_TIME and
PERIOD_EXTENSION, each written only by its certificate's issue hook through the one version writer.
