# 0022 — A certificate is one generic record that domain records point to

**Status:** Accepted (product owner's go, 2026-10-01: `docs/notes/plans/phase3-6-rulings.md` §6.14, OD-1 A, OD-2 A and
conditions; written at 6.14 increment 1, 2026-10-03). Plan: `docs/notes/plans/6.14-certificates.md` §2.1 (the same
interface text is the 6.13 plan's §0.2).

## Context

The forms library has about thirty instruments: interim and advance payment certificates, variation orders, the
delegation letter pair, the certificate of non-completion and the LAD warning, and Part B's extension of time,
practical completion, making good defects, termination and the final certificate. Every one has the same life: figures
computed from the contract, an approval route, signature blocks in a printed order, a date that is the day of the
authorising signature, a number, a frozen text and a distribution list. Their content differs: each is computed by its
own rules, which are 6.13's.

Built kind by kind, each module would grow its own signature order, date rule, numbering and distribution, and the
printed order or the date rule would end up differing between two certificates that the forms say work the same way.
The workbooks also show what goes wrong with figures nobody freezes: two broken totals and manually keyed carry-forwards
(FR-CRT-003).

## Decision

1. **One `Certificate` row per certificate, of a closed `CertificateKind`.** Each 6.13 record that is a certificate
   (a valuation, a variation order, a delegation) holds `certificateId @unique` and owns its content and rules; the
   certificate owns the shared life. Increment 1 ships 6.13 Part A's ten kinds; each later kind arrives in its own
   migration before use (X-6).
2. **Figures are frozen as decimal strings.** The owning module computes them with its pure function and hands them in
   as lines and totals (`computedSnapshot`). A total names the lines it adds and takes away and is recomputed from them
   every time it is read, so it always balances and is never overridden. A line may be overridden only in DRAFT, with a
   justification and a named Person; both figures are kept and shown (FR-CRT-003, rulings condition).
3. **Life:** DRAFT → IN_ROUTING (a routing sheet type, ADR 0023) or straight to SIGNING (no route) → SIGNING → ISSUED;
   VOID only before ISSUED, with a reason. An issued certificate is corrected only by a later certificate.
4. **The form is pinned at the first signature (OD-2 A).** The template's identity, its text, its signature blocks and
   its distribution list are copied into `templateRevision` when the first block is recorded, and never move again. A
   form with anything undecided (a block's delegation answer, no list, no text, an unknown merge field) is refused at
   that moment, so nothing undecided is ever pinned.
5. **Signatures in printed order (FR-CRT-004).** A block is recorded only once every earlier block is. Who may sign a
   block is its office rule's: a named office from the roster, the contract's supervision (6.13) for the
   Superintending Officer's blocks, or a named outsider on the day they signed the paper. Recorded on behalf of, not
   signed (no sign-in).
6. **The date is the authorising block's act (FR-CRT-005).** The day of the act of the block marked
   `datesCertificate`; never a form field. A correction (as 6.12 OD-1 A) moves it to an earlier day with a reason.
7. **The last signature issues it.** Under the contract's lock it allocates the number from the `certificate` series
   and the per-contract `sequence` of its kind, freezes the text in each language (`CertificateDocument`, ADR 0008),
   resolves the pinned distribution list into addressed copies (`IssuedCopy`, owner the certificate) and freezes what
   it was judged under (`issueSnapshot`).
8. **The baseline version is pinned (ADR 0021 §3).** A certificate reads the contract's baseline through
   `baselineFor` once, when it is opened, and keeps `baselineId`.
9. **One lock order.** Every certificate write runs inside `withLockedContract` and then locks the certificate row:
   Requisition → Exercise → Award → Contract → Certificate → domain row → Supplier last.

## Consequences

- Each 6.13 module writes only its content and calls the shared helpers in `src/lib/certificate/write.ts` inside its
  own transaction; signature order, date, numbering and distribution cannot differ between kinds.
- FR-PAY-014 and FR-FIN-005 read `sequence` ("interim certificate 3"); a voided draft never had one, so voiding leaves
  no gap.
- A later revision of a form never alters a certificate already signing; a gap in a form stops the first signature
  rather than freezing into a certificate with no exit.
- Rules out: a certificate table per kind, a keyed certificate date, a total stored as a figure of its own, and an
  override after the draft.
