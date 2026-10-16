# 0036 — Online sealed bids: an exercise key split across the named opening officers

**Status:** Built (2026-10-16): wave 3b stages A to D, build plan steps 1 to 21. **Not live.** DEMONSTRATION works. LIVE cannot be issued until the go-live conditions in `docs/notes/backlog.md` ("Online sealed bids", 2026-10-16) are met. Q1 to Q18 are ruled (20a to 20w), and the stage A review points are ruled (20y to 20ac).

**Summary for the founder (2026-10-16).**
1. A supplier can now submit, replace and withdraw a sealed bid online. The files are encrypted on the server as they arrive. Nobody can read them, administrators included, until the opening.
2. The exercise key is split across the named opening officers. Every one of them must enter a passphrase at the opening. If one passphrase or share is lost after bids are in, the exercise is re-tendered. There is no back door.
3. Paper exercises are unchanged and stay on ADR 0016. This ADR replaces 0016 only for exercises pinned ONLINE.
4. Honest limits remain. Who bid is plain in the database (FR-BID-001's identity clause is not met against someone who can query it). The running server sees a bid while it handles it. One named officer with a database copy, the pepper and their own passphrase can read opened bids before finalising. The customer must accept these in writing before LIVE.
5. Before LIVE: an outside cryptography review, CPD's SK002/SK003 amendment, a real malware scanner, the pepper, the `SEALED_BIDS_LIVE_ALLOWED` setting, two attested host facts, the customer's written acceptance, and a Malay review by RSAJ. Seven build points are open as product-owner questions in the decisions log (2026-10-16, "NOT FIXED").

**Earlier status line.** Accepted for building (product owner, for the founder, 2026-10-13, ruling 20x), with the 20x change list applied. Revised after:
- the product owner's rulings 20a–20q (2026-10-12) and 20r–20x (2026-10-13), in `docs/notes/design/0003-sourcing-requirements-v2.md` §6,
  "Wave 3b: ADR 0036 open questions";
- the wave 3b security review (H1–H3, M1–M6, Low);
- the review and security audit of stage A (steps 1–6), and the product owner's rulings on it, 20y–20ac (2026-10-13), with 20ac's change
  list applied (2026-10-14).

It rests on rulings 11, 12a, 17c and 18–25.

- **Scope.** For exercises pinned ONLINE it **supersedes ADR 0016**. Paper exercises stay on 0016.
- **Go-live.** Nothing goes LIVE before D1's conditions are recorded (ruling 21, 20o).
- **Where the rest lives.**
  - Build plan and contracts: `docs/notes/plans/wave-3b-build-plan.md`.
  - Threats: `docs/notes/plans/signin-threat-model.md` §G.
- **Conflicts.** Where a review finding conflicted with a ruling, this ADR took a stated default and asked the product owner (Q13–Q18). Each
  is now ruled (20r–20w).

## Context

**What is required.** FR-BID-001, NFR-SEC-003 and FR-VND-013 (all M):
- nobody, administrators included, reads a bid before the authorised opening;
- a privileged query returns ciphertext;
- every access is logged.

**What came before.**
- ADR 0016 met this on paper by holding no content.
- Ruling 20 chose its option C. Option B, a server-held key, stays rejected.
- Ruling 12a puts the type check and the malware scan on the plain bytes before sealing, so the server reads every bid once as it arrives.

**What this design protects.** Bids at rest, and bids from people. It does not protect them from the running server (D13).

## Decision

**D1. Pin, mode and switch (G1, 20i, 20o).**
- **The exercise is pinned twice.**
  - `SourcingExercise.submissionChannel` (PAPER | ONLINE) is pinned at creation and taken only while unset (12e). It is frozen at
    publication and backfilled to PAPER. Unset refuses publication, in words.
  - **The organisation's channel ships unset (20z).** `WindowPolicy.submissionChannel` is set only by two people, and no migration writes
    it; unset is never read as PAPER. An exercise made while it is unset is pinned unset. It takes the organisation's setting, once issued,
    by its own act ("Take the organisation's setting", on the `takeSaleMode` pattern): only while its pin is unset, before publication, and
    on an exercise not cancelled. `CHANNEL_NOT_SET` says why and where, and shows in the publication checklist.
  - `SourcingExercise.onlineSubmissionMode` (DEMONSTRATION | LIVE) is frozen at publication beside the channel. A demonstration exercise is
    never promoted to a real one (20i).
- **The switch.** `BidSealingPolicy.onlineSubmission` (null | DEMONSTRATION | LIVE) sits on the two-person path. Null refuses, in words.
- **Issuing LIVE requires all of these:**
  - `cryptoReviewReference`;
  - `procedureAmendmentReference` (SK002/SK003);
  - `customerAcceptanceReference`, the customer's written acceptance of the honest limits, naming FR-BID-001's identity clause (20a, 20o);
  - a configured malware scanner;
  - **(20v, additions from the review):**
    - the deployment flag `SEALED_BIDS_LIVE_ALLOWED`;
    - a configured scrypt pepper (D4);
    - recorded attestations, each with who and when, for threat-model must-have 4 (the public-copy database role) and must-have 5 (no core
      dumps or swap, HTTPS, no body logging).
- **How the screen shows must-haves 4 and 5:** "attested, not checked by the portal". An attestation never reads as a verification (20o).
- **`SEALED_BIDS_LIVE_ALLOWED`** gates only issuing LIVE and publishing under it. A published LIVE exercise keeps its pin and is not stopped
  by the flag (20i).
- **DEMONSTRATION** needs `SEALED_BIDS_DEMONSTRATION_ALLOWED`, read live (20i), on the SEC-1 pattern. Every supplier screen, receipt and
  Received then says "Demonstration — not for real tenders", in English and Malay on the supplier's screens (20ab).
- **Withdrawing LIVE** refuses new publication of ONLINE exercises. Published exercises keep their pin. The switch screen lists the
  published ONLINE exercises still taking bids. An incident is handled per exercise, by a closing extension or a cancellation (20i).
- **No block that can never clear (ruling 13).** The organisation's channel cannot be set to ONLINE while online submission is not allowed.
- **The demo (12c, 12d, 20z)** writes configuration only inside `demo:load` on a fresh database. Its online exercise is made through the
  product's create act and takes its channel from the window policy (G1); there is no demonstration exception to G1.
  - The demonstration's window policy sets the channel to ONLINE **only through `channelSettingFaults`**, as the editor sets it, and the
    bid sealing mode to DEMONSTRATION.
  - The demonstration's authored exercises are pinned PAPER explicitly, never left unset, so they keep the paper paths they were authored
    with.
  - **Where the deployment does not allow demonstration bids at load,** `channelSettingFaults` refuses ONLINE. The seed then sets the
    channel to PAPER, says in words that the online demonstration needs `SEALED_BIDS_DEMONSTRATION_ALLOWED`, and skips the online acts.
  - If the flag is cleared later, a new demonstration exercise is refused at publication in words (`ONLINE_NOT_ALLOWED`). That is
    clearable, by the flag or by a two-person change of the channel (ruling 13).
  - On an already-loaded database the seed writes no configuration, and names the settings that are not set.

**D2. Construction: `node:crypto` only, no new dependency.**
- **Sealing to a public key: HPKE base mode** (RFC 9180), single-shot, with DHKEM(X25519, HKDF-SHA256), HKDF-SHA256 and AES-256-GCM.
  - Node 24 has no built-in HPKE. `hpke.ts` is composed from `diffieHellman` (X25519) and `createHmac` (LabeledExtract and LabeledExpand),
    which is why it is checked against the published vectors (step 4).
  - **Why X25519 over RSA-OAEP:** fixed 32-byte keys, no padding or parameter choices, and constant-time in OpenSSL.
- **Content: AES-256-GCM**, with a fresh 32-byte data key (DEK) and a fresh random 96-bit IV per file, metadata, manifest, declaration and
  estimate. Each key is used once.
- **AAD on every ciphertext:** `v1|purpose|organisationId|exerciseId|keyId|recordId[|partKey]`.
- **Passphrases:** scrypt, N=2^17, r=8, p=1, with a 16-byte salt. The parameters and the pepper id are stored with each wrap.
- **The split is n-of-n XOR, with n = `Committee.panelSize`** (20k). The public key is re-derived after reconstruction and compared. Paper's
  literal `=== 2` in `opensTheBox` is backlogged.

**D3. Where each secret lives.**

| Moment | Secret in plain | Held | Residual |
| --- | --- | --- | --- |
| Officer sets their share | passphrase, its derived key, officer private key | server memory, one request | server sees the passphrase |
| Last named officer sets theirs | *k* | memory: generated, split, each share sealed to one officer key, dropped | server held *k* once |
| Window open | none | DB: ciphertext, sealed DEKs, sealed shares, wrapped officer keys | dump: offline passphrase guessing (D4) |
| Supplier uploads a part | its bytes | memory, and the scanner's tmpfs (D6) | server and scanner read every bid |
| Officer authorises, not last | their share | memory, then sealed to each officer still to act (`ShareRelease`, kept in the DB; M1) | a backup holds the release (S7, S15) |
| Last officer authorises | *k* | memory: in-time manifests opened; DEKs re-sealed per officer (D10); dropped | server held *k* |
| Officer downloads a check file | officer key, DEK, file | memory, streamed | server reads the file |
| Finalising | one officer's key, the DEKs | memory; then `releasedDek` plain until each file is moved (D10) | — |
| Supplementary opening | *k* | memory, by the unseal pattern | server held *k* |

- **Officer keys are per exercise** (20d). Each roster row gets an X25519 key pair wrapped under that officer's passphrase. Setting it is the
  officer's act of "setting their share".
- **The exercise key.** The last setting creates the exercise key pair. The database stores only the public key, its fingerprint and the
  sealed shares.
- **Publish refuses unless all hold:**
  - a live key exists;
  - its share holders are exactly the live roster;
  - D1 allows online submission;
  - every returned part's rule is set (D7);
  - `alternativesPermitted` is stated (20h).
- **`publishedKeyFingerprint`** is frozen at publication and shown on the opportunity and on every receipt. Every upload checks the live
  key against it.
- **Releases are shredded once used or lapsed (C-2).** Shredding sets the column to NULL.

**D4. The officer's secret: a separate unseal passphrase.**
- **Why it is not the sign-in password.** Others reset the sign-in password by design (F7), and a share must never be reset. The sign-in
  password is also typed at every sign-in, and its hash sits in the database.
- **Rules for the passphrase:**
  - it differs from the sign-in password;
  - its minimum length is `SecurityPolicy.sealingPassphraseMinLength` (unset refuses), with a CHECK floor of 12;
  - wrong entries lock on their own counter and are logged.
- **The pepper (review; ruled 20v).** The key-encryption key is `scrypt(HMAC-SHA256(pepper, passphrase))`. The pepper is a deployment secret held
  outside the database (`SEALING_PEPPER`, with `SEALING_PEPPER_ID`).
  - It defends only against someone holding a dump.
  - **Losing it makes every exercise wrapped under it unopenable**, so its custody and its backup, apart from the database, join key loss
    (D11).
  - LIVE requires it. DEMONSTRATION may wrap without it (pepper id null). A demonstration exercise never becomes LIVE (D1), so it never needs
    a re-wrap.
  - **A missing pepper is not a wrong passphrase (20v).** Before any unwrap, the act compares the wrap's `pepperId` with the pepper the
    deployment holds. On a mismatch it is refused with its own fault (`PEPPER_NOT_HELD`), in words: this exercise was sealed under a pepper
    this deployment does not hold, and the deployment must restore it. The refusal never counts toward the officer's passphrase lockout and
    never says the passphrase is wrong.
  - **The pepper is kept, unchanged, until no opening of any exercise wrapped under it can still follow (20y, correcting 20v's condition
    2).** No opening can still follow an exercise when either:
    1. the exercise is cancelled; or
    2. its main opening is finalised, **and** every late online bid in its roll that is not withdrawn is either not admitted (its committee
       decided NOT_CARRIED) or admitted and opened at a supplementary opening that is itself finalised.
    - **Why the main finalise is not the end.** An admitted late bid is opened at a supplementary opening, which starts only once the main
      opening is finalised (`MAIN_NOT_FINALISED`). That opening is n-of-n, and its own finalise needs one officer's passphrase, so both need
      the pepper. Rotating at the main finalise would leave the bid unopenable and the award blocked for ever by `ADMITTED_UNOPENED`.
    - An admission not tabled, pending or deferred keeps the pepper. A decided one is final (`ALREADY_DECIDED`). An award implies case 2,
      because the award gate requires it, but only if the online late envelopes reach `needsAdmission` and `admittedEnvelopeIds` (plan step
      12). The award is a sign of the condition, not the condition.
    - After the finalise the mover works from `releasedDek`, which needs no pepper. A late bid never admitted stays sealed for ever.
    - **Scope:** every exercise with any officer wrap under that pepper's id. The id is the configured name with a check value of the bytes
      (`name#check`), so a wrong copy of the bytes is a different pepper. A DEMONSTRATION exercise wrapped while a pepper was configured is
      included. An exercise wrapped with no pepper is not.
    - **One pepper at a time.** The deployment holds one `SEALING_PEPPER`, so a new pepper replaces the old one. It may do so only once no
      exercise under the old one can still be opened. An exercise with no submission can be re-keyed under a new pepper: that is the remedy
      for an early loss, not a reason to rotate early.
    - **So the operator can check it,** the bid sealing screen lists, read only, the exercises that still need the pepper this deployment
      holds, from one pure rule (`pepperStillNeeded`, plan step 15). Rotating early, or losing the pepper, makes those exercises unopenable
      (D11).
- **Step-up.** Setting a share, "Check I can still unlock", authorising, signing at finalising, finalising, releasing for a substitution,
  and **every download** ask the sign-in password (`stepUp`) as well as the passphrase (review, 20n).

**D5. Submission: drafts, then a small signed submit.**
- **Upload a part.** A bounded read, with a body-read deadline and a minimum rate. Then:
  1. type recognition and scan (D6);
  2. SHA-256, compared with the browser's `contentSha256` (a multipart field);
  3. a fresh DEK; the body and the `FileMeta` (filename, media type, plain hash, plain size) sealed; the DEK HPKE-sealed;
  4. the ciphertext stored through `blobStore().put`.
- **What plaintext never reaches:** `storeUpload`, `BlobContent` and `DocumentVersion` (C-6).
- **Submit.**
  1. The bounded JSON body is read.
  2. The stamp is taken at once from the **database clock**, before the password check: `SELECT date_trunc('second', clock_timestamp())`,
     in its own statement (20aa). From here on, the database clock is "the server's clock" (FR-BID-002).
  3. `confirmSupplierPassword` runs on its own committed connection, so a wrong password still counts toward the lockout. This is the 4e
     pattern; the spent step-up moment is reused.
  4. The act's transaction takes the opening's locks (`lockEnvelopeRows`; 20b). It seals the manifest and the declaration (Harga as a
     decimal string, Tempoh Kerja and its unit), and writes the ONLINE `BidEnvelope` and the `OnlineBid`.
- **The trigger owns the stamp (H2).** It accepts `receivedAt` only within `MAX_STAMP_SKEW_SECONDS` (a product constant) before the
  database clock at **the moment of the insert**. It then sets `late` and `closingAtJudged` itself from the exercise's closing as it stands
  at insert. An extension committed while the act waited is therefore honoured (0016).
  - **The clock (20aa).** `sealed_clock()` reads `clock_timestamp()`, the moment of the act, and is declared VOLATILE. Each trigger reads it
    once, into its own variable, so both bounds come from one reading. It is not `now()`, the transaction's start: in a transaction held
    open, a bound read from it moves back with the stamp, and the skew measures nothing. Every judgement against the closing on the sealed
    tables reads it (the stamp, a replace and a withdrawal, a key retired, `LODGEMENT_CLOSED`), and a database test pins this on the live
    function definitions.
  - **The lock-wait edge.** A submit whose transaction waits on the exercise's locks for longer than the skew is refused at insert. The
    skew is not widened. The refusal is said in words (the bid was not taken; submit again; the new stamp decides whether it is late),
    writes a `SealedAccessEvent`, and counts toward no lockout.
- **Stored plain:**
  - on the envelope: sequence, stamp, late flag and status;
  - ciphertext digests and sizes;
  - the scan result;
  - the supplier link (D9).
- **Never stored plain:**
  - any plain-file hash;
  - any declaration hash;
  - filenames;
  - media types.
- **Each file belongs to one submission** (`OnlineBidPart.fileId` unique, H2). A replacement re-uploads every part, and the page says so.
- **The receipt:** sequence, stamp, key fingerprint and a receipt digest (SHA-256 over exercise, sequence, stamp and every ciphertext
  digest), plus the browser's confirmed plain hashes.
  - Its words: "Your receipt. It records what the portal told you." **Never "signed" or "proof"** (20j), in either language (20ab).

**D6. Type check and scan on plain bytes, before sealing (12a, 20o, M3).**
- **One shared recogniser** serves the staff and supplier paths (ADR 0035 item 11, reading the tail).
- **The store-wide `ScanResult` gains ERROR**, and every switch on it becomes exhaustive.
  - THREAT or ERROR refuses the file, in words, in both modes.
  - NOT_SCANNED means only "no scanner configured, under DEMONSTRATION".
- **The scanner deployment:**
  - it runs on the same host, streamed over a local socket;
  - its temporary directory is a tmpfs;
  - quarantine and copies are off.
- **No file is parsed for a figure.** Figures come only from the declared fields (rulings 20 and 24).

**D7. Withdraw, replace, late, alternatives, part rules.**
- **Withdraw and replace** are signed acts, allowed up to and including the closing second.
  - A replace marks the old bid REPLACED and its envelope SUPERSEDED, in the same act that writes the replacement. It is of the replaced
    submission's own kind: a bid replaces a bid, an alternative an alternative (`REPLACE_KIND_CHANGED`, review M1), so a replace never makes
    a second bid. A submission that names another as replaced, without that one moving to REPLACED in the same transaction, is refused at
    the commit (plan §1.4 trigger 14).
  - A withdrawal marks it WITHDRAWN, and withdraws only what it names. The screen lists the linked alternatives so the supplier can withdraw
    them in the same act. A kept alternative has its link cleared in that recorded act (20h).
  - Neither status is ever decrypted.
  - The trigger judges both moves by the act's own database stamp (bounded by the skew), and refuses one stamped after the closing (H2).
- **Late bids** are taken **until the main opening is started** (20b). For ONLINE, `openingStarted` reads the main `Opening` row.
  - After the closing, the trigger allows an insert only as `late = true`, and only while no main `Opening` exists. This is how H2's "refuse
    inserts after the closing" is read, so that FR-BID-003 holds.
  - Late bids are sealed, counted and sent to the committee.
  - **One standing bid (FR-BID-005, review S1).** A supplier with a standing bid, in time or late, may not add another (`LIVE_BID_HELD`); a
    replace is the way to change it. The door checks it under the locks, and a deferred trigger holds it at the commit (plan §1.4 trigger
    13), so the submit runs at READ COMMITTED.
- **Alternatives (20h, amending ruling 19).**
  - No main bid is needed. An alternative may name a parent, which must be the supplier's own live bid (`PARENT_NOT_YOUR_LIVE_BID`), and a
    bid, never another alternative (`PARENT_NOT_A_BID`, review S3, as paper's).
  - Where `alternativesPermitted` is false, the alternative is accepted and later recorded `OpenedBid.alternativeStatus = NOT_CONSIDERED`.
    The supplier is told before submitting.
  - Where it is null, publication refuses. `ALTERNATIVES_NOT_STATED` stays only as a defensive refusal.
  - A replace of the parent re-points the link to the replacement.
- **The parent and the manifest (M2 with 20h).**
  - The manifest seals the parent as it was at submission.
  - The unseal excludes the parent from the equality check. It requires instead that the row's current parent is reached from the sealed
    one by following `replacesOnlineBidId`, or is null after a recorded withdrawal.
  - The trigger lets `parentOnlineBidId` move only in the same transaction as the parent's own REPLACED or WITHDRAWN.
- **Part rules (ruling 19):** `bidAcceptedMediaTypes`, `bidMaxBytes` and `openingCheck` (ruling 23), configured per part, shipped unset, and
  frozen into `onlineBidRules` at publication.
- **Missing parts** are warned about, never refused (FR-BID-007).

**D8. Who may bid (17c, 20m).**
- **The sale.** The door uses `saleStands(sale, simulatorAllowed)`, the one function shared with `holdsBidStanding` and `saleFactsOf`.
- **The invitee list.** On the invited path, a supplier not on the list is refused in words. This matches the purchase's own invitee check
  (`portal/bids/checks.ts`), so it refuses nothing new.
- **At the opening,** `saleFinding` is still judged, as defence in depth.

**D9. Before the opening: Received, identity, the void guard.**
- **Received (ruling 18 as amended by 20u, 20l)** shows the count of standing submissions, and for each its **ordinal** among them (1..n by
  stamp), its stamp and its late flag.
  - It shows no sequence before the opening starts, because gaps reveal replacements and withdrawals.
  - **The words (20u):** the ordinal column says it is the order of the bids now standing, not the receipt number, and that it can change
    before the closing. The receipt number is shown once the opening starts.
  - It shows no replaced or withdrawn rows, and no name, part or size.
  - **The sequence appears from the opening's start.** The supplier's own receipt and My Bids keep showing its own sequence.
- **Identity: FR-BID-001's identity clause is NOT met against a privileged query** (20a). This is a recorded gap, not accepted.
  - The plain identity columns are `OnlineBid.supplierId` and `submittedBySupplierAccountId`, `OnlineBidFile.supplierId` and
    `uploadedBySupplierAccountId`, and `SealedAccessEvent.supplierAccountId`. `AuditEntry` and `ActAttribution` carry the account too.
  - A source scan pins that list.
  - Whether a blinded supplier link is worth its cost is a question for the outside review.
  - `sealedAuditMask` withholds the actor of online-bid entries from the staff audit and History views: until the unseal for the named
    officers, and until finalising for everyone else.
  - Before/after JSON holds only ids, statuses and ciphertext digests.
- **The void guard (H1).** Paper's `ENVELOPE_HELD` (`voidSaleFault`) never fires before the opening, because envelopes are anonymous.
  - Wave 3b keeps that true online. **No code path wires `OnlineBid` into the guard**, and a test shows the register answers the same way for
    every buyer before the opening.
  - **17b's bid clause is read as the counter void's `ENVELOPE_HELD` (20r)**, which reads no bid before the opening on either channel. Before
    the opening the 17b reversal reads no bid. A reversed buyer's sealed bid stands, and the opening judges it by `saleFinding` (no live sale)
    under the method's `unpurchasedBidConsequence`; an unset consequence blocks in words.
  - **When the 17b reversal is built (20r):**
    - its screen never says or implies that the buyer holds no bid. It says that whether this buyer has bid is not shown before the
      opening, that any bid stays sealed, and that the opening will judge it with no live sale under the method's rule;
    - the supplier's own purchase screen says the purchase was reversed. A reversed supplier can still withdraw its own bid before the
      closing;
    - the reversal joins the S21 test: before the opening it answers the same way for every buyer, with and without online submissions.
  - The review's alternative, a reversal that withdraws the bid, is rejected: the Received count would drop and reveal the bidder.

**D10. Unseal, opening check, finalising (H3 option a).**
- **The unseal.** Every named officer authorises with step-up and passphrase, under the existing rules. `BOX_NOT_LOCKED` does not apply
  online.
  - Every place in `unseal.ts` that counts to two takes n for ONLINE (20k).
  - A non-last authorisation seals the shares it holds to each officer still to act.
- **The last authorisation:**
  - reconstructs *k*;
  - opens the manifests of SUBMITTED **in-time** bids only and checks each against its row (D7 for the parent). A mismatch blocks, in words;
  - creates `OpenedBid` with `priceAsRead` NULL. A not-permitted alternative gets `alternativeStatus` NOT_CONSIDERED;
  - **re-seals each opened bid's declaration DEK, every file DEK and the estimate DEK to each named officer separately**
    (`OfficerDekGrant`, with use OPENING_CHECK or FINALISE);
  - drops *k*.
  - Late bids are never re-sealed. A supplementary opening stays n-of-n, then re-seals that bid's keys the same way.
- **Why option a.** Otherwise one officer who has seen the Grand Summary prices could force a re-tender by refusing, forgetting or being
  deactivated. Option b, a guard on deactivation, covers only deactivation. Each officer already reads each Grand Summary price after the
  unseal, so the extra exposure is small.
- **What option a changes in ruling 20 (Q15, confirmed by 20t: "both officers" and "only the mandatory documents" are still met).** After the unseal, "both officers" is held by signatures, not keys. "Only the mandatory
  documents" becomes a code rule against an officer holding a database copy.
- **After the unseal:**
  - the download route serves only OPENING_CHECK grants, to named officers only;
  - every attempt by a signed-in actor, including refusals, writes a `SealedAccessEvent`, never through `logAccess` (20w):
    - a request refused before the session check (no session, cross-site, no form token) is not an access and writes no row; it is left
      to the deployment's edge access log, if it keeps one (method, path, status, never a body);
    - of the per-account rate refusals, **only the first in each rate window writes a row**, and the rest are refused without one, so one
      signed-in account cannot fill the table (S19);
    - where the access log is described, the words are "every attempt by a signed-in person; where the rate limit refuses repeated
      attempts, the first in each window is logged". Never "every attempt is logged" without that qualification;
  - administrators are refused at every sealed entry point;
  - FINALISE grants are read only by `finaliseOnline` (scan);
  - the officer screens say every named officer is needed (20k).
- **The opening roll (H2).** `startOpening` freezes `Opening.receiptRoll`: every standing submission's sequence, receipt digest and late
  flag. There is no scheduler. Because moves stamped after the closing are refused, and an ONLINE opening cannot start until the database clock (`clock_timestamp()`, 20aa) reads `MAX_STAMP_SKEW_SECONDS` after the closing (so no in-time act is still committing), the roll taken at the start equals the in-time state at
  the closing. Each opened bid shows its receipt digest and plain hashes. *Amended 2026-10-17 (wave 3c plan, `docs/notes/plans/wave-3c-build-plan.md` question 3c-Q5, not yet ruled by the product owner; revert this sentence if it is ruled otherwise):* the receipt digest is shown from the unseal. The plain hashes are sealed in `FileMeta` until finalising, so they are shown per file only after it, from the filed version. No decryption door is added to show them earlier.
- **My Bids (20s).** From the opening's start, My Bids **shows the opened receipt digest itself, in full, and asks the supplier to compare
  it with the receipt it printed or saved when it submitted.** A server sentence "your receipt was the one opened" would compare two server
  rows, which a writer who fabricated or swapped a bid could make agree (S11). The words come from one pure function, tested for each state:
  1. in the opening's list, not yet opened (between the start and the unseal): the listed receipt digest is shown;
  2. opened: the opened receipt digest is shown, and the supplier is asked to compare it with its own receipt;
  3. in the roll as late, so not opened at the main opening: it goes to the committee (FR-BID-003), and if admitted it moves to state 2 at
     the supplementary opening;
  4. no receipt of the supplier's is in the roll: contact the organisation now, quoting the receipt. The organisation is named from
     configuration, never as a literal.
  - Replaced and withdrawn bids say they were not opened, as expected.
  - No verdict and no notice: ruling 25's "Opened; the result follows the evaluation" stays and is extended, not replaced. Nothing is sent.
    Never "verified", "signed" or "proof" (20j).
- **Before finalising commits (M5),** the finaliser's grants decrypt every opened file once to verify its GCM tag, one at a time, discarding
  the bytes. Ciphertext is immutable, so there is no gap between the check and the use.
- **Finalising.** Every named officer signs with step-up; any one of them finalises with their passphrase. The finalise transaction runs
  in this order, because the triggers depend on it:
  1. writes `priceAsRead`, `completionPeriod` and `completionUnit` — **the first moment the declared figures are plain in the database**
     (ruling 20);
  2. decrypts the estimate lodgement into `estimateLodgedAmount`;
  3. sets `Opening.finalisedAt`, which a trigger refuses while any price is NULL;
  4. writes each opened file's `releasedDek`, which a trigger allows only once `finalisedAt` is set.
- **After commit,** a bounded, idempotent mover decrypts each file into the document store under a per-file advisory lock. It writes the
  document owner link (unique `onlineBidFileId`) in the same transaction as the store. A reader of a file not yet moved triggers its move.
  `releasedDek` is shredded once its link exists.
- **The estimate.** On ONLINE, `lodgeEstimate` writes `SealedEstimateLodgement`. A trigger refuses an insert or a supersession after the
  closing (`LODGEMENT_CLOSED`).

**D11. Substitution, re-key, key loss.**
- **Substitution before the closing (ruling 11).**
  1. The incoming officer sets their share.
  2. The departing officer releases theirs (step-up and passphrase), sealed to the incoming officer.
  3. The old row is shredded.
- **What substitution does not do.** It **transfers** the share and does not revoke it: a backup taken before it still holds the departing
  officer's copy (S15). If the departing officer cannot take part, the exercise must be re-tendered.
- **Every retirement of an exercise key shreds all its shares in the same transaction**: a re-key, and a roster change before
  publication alike. Otherwise a superseded lodgement or discarded drafts would stay openable (20g's reasons).
- **Re-key (20g, 20p)** is allowed only while no submission exists and before the closing. In one transaction it:
  - shreds every share of the retired key;
  - discards the drafts under it. The supplier's own submit page says why, because no notice can be sent;
  - after publication, re-freezes `publishedKeyFingerprint` through an append-only `PublishedKeyChange`, shown on the opportunity with its
    history. A trigger allows a new or retired key after publication only with that row.
- **The estimate after a re-key.** The lodging officer re-lodges the same version by their own act. Until then `ESTIMATE_NOT_LODGED` blocks
  the start.
- **A forgotten passphrase.** Before any submission, re-key. After one, re-tender (20f).
  - There is no escrow, no administrator recovery and no single-person recovery.
  - Re-key-and-resubmit, k-of-m and the blinded supplier link go to the founder with the outside review.
- **Deactivating a share-holder.**
  - **Before the unseal** it is not refused. The screen lists the exercises it would make unopenable and requires a reason.
  - **Between the unseal and finalising** (the H3 window; option b with option a, 20t), it needs a second approver through the existing
    two-person path.
  - **Even when two people approve it, that opening can then never be finalised** (20t): the deactivated officer cannot sign, and
    substitution is refused after the closing (ruling 11). So the deactivation screen lists the openings it would leave unfinalisable and
    says they must be re-tendered, in this window as well as before the unseal. The way out is the existing cancellation, with its
    authority: the block is stated and clearable, never silent (ruling 13).
  - An officer who simply refuses to sign still blocks finalising, as at a paper opening. That is a recorded, attributable act (S14).

**D12. Schema, triggers, grants, scans.** The shapes are in the plan's §1.4.
- **New tables:**
  - `OfficerExerciseKey`
  - `ExerciseSealingKey`
  - `ExerciseKeyShare`
  - `ShareRelease` (purposes UNSEAL and SUBSTITUTION)
  - `OnlineBidFile`
  - `OnlineBid`
  - `OnlineBidPart` (`fileId` unique)
  - `OfficerDekGrant`
  - `SealedEstimateLodgement`
  - `PublishedKeyChange`
  - `SealedAccessEvent`
  - `BidSealingPolicy`
- **New values and nullable columns:**
  - `EnvelopeChannel.ONLINE`
  - `ReceiptSource.PORTAL`
  - `EnvelopeStatus.SUPERSEDED`
  - `BidEnvelope.receivedByPersonId` becomes nullable, with a CHECK: null exactly when ONLINE
  - `OpenedBid.priceAsRead` becomes nullable
  - `Opening.receiptRoll`
- **One register.** The envelope alone holds sequence, stamp, late and the closing judged; `OnlineBid` does not repeat them.
- **The envelope readers handle SUPERSEDED and an online WITHDRAWN** (which has no `BidWithdrawal`):
  - `finaliseFaults`
  - `withdrawalsResolved`
  - `bidGate`
  - `count.ts`
  - Received
- **Triggers** (`ENABLE ALWAYS`, each with its own SQLSTATE):
  - the stamp and the closing rules (D5, D7);
  - ciphertext is immutable;
  - status moves forward only;
  - the parent moves only as in D7;
  - shreds go only from set to NULL;
  - `releasedDek` goes from NULL to set only once the opening is finalising, and back to NULL only once its link exists;
  - the fingerprint and key rules (D11);
  - `LODGEMENT_CLOSED`;
  - no DELETE, and no TRUNCATE;
  - **added by the stage A hardening (migration `20261103200000`; audit 1–5 and 7, review M1 and S3, 20aa):** the channel and the bid rules
    frozen at publication; a share release checked as it is written; one standing bid per supplier per exercise, at the commit; every ONLINE
    envelope has its submission by the commit; a replacement of the replaced submission's kind, and a parent that is a bid;
  - **owed by plan step 10:** a submission naming another as replaced is refused at the commit unless that one moved to REPLACED in the
    same transaction.
- **How the triggers know their own transaction.** "Written in this transaction" is read from `xid8` columns that only a trigger writes
  (`insertedXact`, `statusXact`, `unsealedXact`, `finalisedXact`), never from a row's `xmin`, which any UPDATE resets. An UPDATE of an
  ONLINE envelope that changes nothing is refused, so a no-op cannot refresh a row's standing.
- **Names cannot be shadowed.** Every trigger function runs with `search_path = pg_catalog, public, pg_temp` and names its tables in
  `public`. As a second wall, `db:roles` revokes TEMPORARY on the database from PUBLIC and from the app's role; that revoke reaches a
  database only when `npm run db:roles` runs, and the owner keeps it.
- **Grants.** `SealedAccessEvent` and `PublishedKeyChange` are append-only. A new `SEALED_TABLES` list revokes DELETE and TRUNCATE. The
  public-copy role stays a go-live condition (log 1937).
- **`src/lib/bids/sealed.test.ts`** (SR-13 citation). The paper scans are unchanged. On the sealed tables:
  - Bytes are allowed only as `SEALED_COLUMNS` and `KEY_MATERIAL_COLUMNS`, named with reasons;
  - there is no Decimal;
  - no column is named like a price, period, filename, media type or plain value;
  - the identity columns of D9 are pinned;
  - decryption is called only from `src/lib/sealing/open.ts`.
- **`opening/sealed.test.ts`** admits `finaliseOnline` as a writer of `priceAsRead`.

**D13. The public surface, and the honest limits.**
- **Routes.** Four POST route handlers at literal paths, plus one GET page (plan §1.5). Each runs the Origin guard, then the form token,
  then the session, then a length check before reading.
- **Memory, not streaming.** Peak memory is about 2 × cap × concurrency.
- **Limits (20e) come in three layers:**
  - **rates,** per account, product constants;
  - **caps,** per supplier per exercise (drafts, submissions), product constants. They never block a withdrawal, and never remove a standing
    bid;
  - **deployment concurrency,** `BID_UPLOAD_MAX_CONCURRENT`. Inside it, each supplier may have one upload in flight. This is additive to
    20e, not a conflict. The words for BUSY say to retry, and that the submission's stamp decides lateness.
- **The honest limits:**
  - **The running server is trusted.** It reads every bid at upload, holds *k* at the D3 moments and sees every passphrase. Compromised, it
    can read those bids, keep passphrases and misreport.
  - **What sealing defeats:** dumps, backups, database and product administrators, and a compromise that ends before any passphrase is
    entered.
  - **The application role can fabricate rows.** The triggers, the trail, the opening roll and the receipt digests **detect** a fabricated
    bid. They do not prevent one. The owner role can drop triggers.
  - **The closing is enforced by the database clock and the application, not by the cryptography.** All the named officers together, with a
    database copy, could unseal early.
  - **After the unseal and before finalising, one named officer with a database copy, the deployment's pepper and their own passphrase can
    read every opened bid's declaration and files, and the lodged estimate figure** (D10, 20t). The customer's written acceptance
    (threat model §G must-have 6) names this.
  - **An administrator cannot open bids,** but before the unseal can block one by deactivating an officer.
  - **Leaks:** identity at the database level (D9), sizes, times and counts.
- **What the screens may claim.** The upload screen says "the portal checks and scans your file before sealing it, so its server reads it
  once as it arrives; it is stored only encrypted, under the opening officers' keys; independent review pending". Elsewhere: "Encrypted
  under the opening officers' keys; independent review pending". Never "cannot be read by anyone", "signed", "proof" or "identity encrypted".

## Consequences

- **Wave 3c** builds the SR-14 matrix and the SR-15 downloads on `OpenedBid` with a NULL price until finalising.
- **Paper paths are unchanged, for what exists (20z).** Every exercise that exists is backfilled PAPER and keeps its gates, and no paper act
  changes. Every online branch keys off `submissionChannel`.
- **A new exercise needs the channel set.** It takes the organisation's channel as it takes the sale mode. The organisation's channel
  ships unset, beside `documentSaleMode` on the same window policy, and is set by two people. Until it is set, publication refuses in
  words (`CHANNEL_NOT_SET`). For an organisation whose sale mode is also unset, both are set in one two-person change.
- **Every unseal and supplementary opening needs every named officer.** After the main unseal, finalising needs one officer's passphrase
  and every officer's signature.
- **A lost passphrase or pepper before the unseal, after the first submission, means re-tendering.**
- **The outside review receives:**
  - D2 with the known-answer tests;
  - D3;
  - D13's limits;
  - the recovery options (re-key-and-resubmit, k-of-m);
  - the blinded supplier link;
  - signed receipts.

## Questions

**Ruled (20a–20w).**
- Q1 → 20a: a recorded gap.
- Q2 → 20b: until the start of the opening.
- Q3 → 20c: the named officers.
- Q4 → 20d: per exercise.
- Q5 → 20e: three layers.
- Q6 → 20f: re-tender; referred to the founder.
- Q7 → 20g.
- Q8 → 20h.
- Q9 → 20i.
- Q10 → 20j: not now; backlog.
- Q11 → 20k: n-of-n.
- Q12 → 20l.
- The invitee door → 20m.
- A download passphrase every time → 20n.
- The pin and the switch → 20o.
- Q13 → 20r: before the opening the reversal reads no bid, on either channel; the reversal screen's words and the S21 test.
- Q14 → 20s: My Bids shows the opened digest itself, in four states, and asks the supplier to compare it with its own receipt.
- Q15 → 20t: option a with option b; the one-officer residual (with the pepper) is named; deactivation in the H3 window says re-tender.
- Q16 → 20u: the ordinal before the opening, with its words; amends ruling 18.
- Q17 → 20v: the LIVE additions; a pepper mismatch is its own fault, not counted; its end condition is restated by 20y.
- Q18 → 20w: signed-in attempts are logged; the first rate refusal per account per window writes a row.

**Ruled (20y–20ab), on points raised by the stage A review; 20ac lists the document changes, applied here.**
- S8, the pepper's end condition → 20y: kept until no opening of any exercise under it can still follow (D4); `pepperStillNeeded` and
  its list on the bid sealing screen.
- S9, the channel unset for existing organisations → 20z: it stays unset until two people set it; the take-the-channel act; the demo
  through `channelSettingFaults` (D1, Consequences).
- The database clock → 20aa: `clock_timestamp()`, VOLATILE, read once per trigger; the lock-wait refusal in words (D5).
- The supplier's words in Malay → 20ab: both languages through the existing `Words`, the scans cover the Malay, reviewed by the customer
  inside the NFR-LNG-001 go-live condition.

**Referred to the founder with the outside review:** re-key-and-resubmit, k-of-m, and the blinded supplier link.
