# 0016 — "Sealed" in Phase 2 is an envelope register with no content; the electronic box's key model is decided with Phase 3

**Status:** Proposed with 6.6 (2026-10-02), under ruling OD-1 A and the 6.6 conditions (`docs/notes/plans/phase2-rulings.md`
§6.6, X-3, X-6, X-11; decisions log "· 6.6 ·" entries). Plan: `docs/notes/plans/6.6-bid-receipt.md`.

## Context

FR-BID-001 and NFR-SEC-003 ask that no user, an administrator included, can read a bid's price, documents or the bidder's
identity before the authorised opening; that a privileged database query returns ciphertext; that every access attempt is
logged and alerted; and that after opening only authorised users can read it. In Phase 2 the product has no sign-in
(NFR-SEC-001), no vendor identity (6.15) and no delivery channel for alerts, and the customer's procedure still receives bids
on paper: a sealed envelope goes by hand into the tender box before the closing, or arrives over the counter or by post.
Electronic submission is not authorised by the customer's procedure today (SK002 §7.7 needs amending, D6).

Three ways to answer "sealed" were weighed (plan §8 OD-1):

- **A.** Hold no bid content before opening; the register records envelopes, not offers.
- **B.** Encrypt with a key the server holds. A database query returns ciphertext, but anyone with the server's environment
  decrypts alone, so "no single administrator" fails; claiming it would overstate the control.
- **C.** Two-share sealing: an X25519 key pair per exercise, the private key wrapped under two passphrases held by two opening
  officers (scrypt, all `node:crypto`). No single administrator can decrypt from the database and the environment; but without
  sign-in nobody can say who entered each share, the server sees the shares as they are typed, a lost share needs a recovery
  path, and hand-composed cryptography needs an external review.

The product owner ruled A, with C the starting design for Phase 3 and B rejected; NFR-SEC-003 and the electronic tender box are
re-designated to Phase 3 with sign-in and D6 — a stated departure from §13.4's "electronic tender box".

## Decision

1. **The register records envelopes, never offers.** `BidEnvelope`, `BidWithdrawal`, `BoxEvent` and `ValidityExtension` hold no
   price, sum, period, score or document-content column (`src/lib/bids/sealed.test.ts` scans the schema). What a bid offers is
   written only by 6.7's opening act, on 6.7's own records. Requirement 2 ("a query returns ciphertext") holds because there is
   nothing to query, not because anything is encrypted, and the Bids received tab says exactly that.
2. **No bidder is named before opening (OD-2).** An envelope records its sequence, the server's stamp, how it came, who
   received it (recorded on their behalf, not signed) and its markings as written. `BidEnvelope.partyId` exists for 6.7 and is
   written by nothing in 6.6 (source scan); 6.7 C-10 narrows the scan to its one writer, `openEnvelope`. A withdrawal is matched
   by the markings its letter quotes; its letter is held SULIT.
3. **The server's clock alone decides lateness (OD-3 as amended).** A receipt is stamped once, at the act's entry before any
   lock is asked for, to the second (code review CR-3), and judged against the closing read under the locks, so an extension
   committed while the act waited is honoured (14:30:00 in time, 14:30:01 late; fractions dropped; the reading ASSUMED and
   shown). Withdrawals, the correction cut-off and the box's lock are stamped the same way. `sequence` stays recording order,
   allocated under the envelope lock; under contention it may differ from stamp order by up to a second, and is never
   reordered. A receipt recorded after the event keeps the officer's stated time and reason beside the stamp, shown as the
   officer's statement (the stamp labelled the server's recording time on every row, review S-1), and is never judged on it. A late envelope is recorded, counted apart and goes to the committee the method
   names; nothing deletes, rejects or sets one aside.
4. **Custody stays physical.** The box, its lock and its key remain the control. The portal records the custody acts — the box
   locked at or after the closing by a named officer (`BoxEvent` LOCKED, server-stamped), an envelope withdrawn and handed back
   unopened — and does not claim to enforce them. Box envelopes are registered at opening (OD-4, 6.7).
5. **What the register cannot claim is said on the tab:** that an electronic bid is sealed (none is accepted); that reading is
   restricted (no sign-in); alerting (no delivery: alerts are shown, not sent); that the company estimate is ciphertext (it is
   plain in the database, read only through `readSealedFigures`, ADR 0012).
6. **The electronic box's key model is decided with Phase 3 (6.15c),** starting from option C, with sign-in to attribute each
   share, a recovery path for a lost share, and an external review of the cryptography. Option B is not to be built as a
   stopgap: it would put a claim on the screen that the key arrangement cannot keep. If the estimate must be ciphertext before
   Phase 3, the choice is C, and `CompanyEstimateVersion.value` stays behind its one accessor so it can move without a reshaped
   table.

## Consequences

- Nothing priced can leak from the register before opening: it holds nothing priced. The risk moves to the paper and the
  box, where the customer's procedure already places it.
- The estimate remains the one sealed figure in the database, plain, behind one accessor; a database administrator can read it.
  The Company estimate tab and the Bids received tab both say so.
- 6.7 owns the move from envelope to offer: it registers box envelopes (channel BOX), names each bidder (`partyId`), refuses to
  open an envelope matched to a withdrawal, and judges box envelopes by the LOCKED event's server stamp (6.7 C-3).
- Phase 3's electronic box starts from this register: an electronic envelope is a `BidEnvelope` whose content is held sealed
  under the key model decided then. Nothing here needs reshaping for it.
- Two attachment owners join the document store (X-6): the withdrawal (its letter, SULIT) and the validity extension (the
  tenderer's consent); the owner CHECKs are rebuilt from the full owner list and confirmed in `pg_constraint`.
