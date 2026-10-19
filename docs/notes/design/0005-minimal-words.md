# 0005 — Minimal words: the writing standard and the sweep

Status: the writing standard. Written 2026-10-19 by the UX lead. It is **binding on every staff and supplier screen** and on any
change that adds text to them.

**Ruling handle:** cite this note as **"0005, founder 2026-10-19"** when a test, comparator entry or snapshot changes because
text was cut. The founder said, on 2026-10-19: "my problem is with the design there are a lot of unnecessary wording and explanation.
I want the design to be clean and minimise words as much as possible."

**English only** (founder, 2026-10-19). Every word this note asks for is plain English. The sweep adds no Malay. It does not
extend or delete the ADR 0040 language layer, and it leaves the existing Malay slots in the `Words` pairs alone. Where a pair is
shortened, only its English side changes.

**Supersedes:** part of `founder-feedback-2026-10-01.md` §2. The 90-character `SUBTITLE_LIMIT` and its automatic cut stay, but only
as a safety net for dynamic text. A literal subtitle is now held to the word budget below, not to 90 characters.

---

## 1. The job to be done

**Staff** open a record to do one thing: decide, sign, record or send. They work in the product all day. They learned the rules
in their first week, and every sentence that re-explains a rule is a sentence they skip, hundreds of times a day. What they need on
the surface is:
- the state;
- the figure;
- what is waiting on them;
- whether anything is wrong.

**Suppliers** use the portal a few times a month, often from a site office. They need exactly one clear instruction about what
to do next. They do not need a description of how the portal works.

**What goes wrong today.** The product has been honest by writing sentences. Every gap, rule, assumption and refusal got a
paragraph explaining itself. Each paragraph was right on its own. Added up, they bury the one fact the user came for:
- An editor drawer opens with 60 to 100 words before its first field.
- An empty list explains the whole lifecycle of the thing that is not there yet.
- An info callout narrates what happens after the next three steps.

The honesty has to stay, as AGENTS.md "gaps stay honest" requires. It moves out of sentences and into **labels, figures and
popovers**.

## 2. What the inventory found

The full numbers are in the appendix. In short:
- **About 95,000 words** of static source text are on the working screens: 44k written inline in `src/app` and `src/components`,
  and 51k in the `src/lib/**` label and word catalogues.
- The two biggest offenders are not the elements anyone thinks of as text:
  - **Editor drawer intros** (`RecordEditor` `description`): 502 strings, 13,000 words, 378 of them over 15 words, the longest
    101.
  - **Card subtitles** (`CardHeader` `subtitle`): 385 strings, 6,400 words, 316 of them over 8 words.
- **Callouts:** 513 in total, 178 of them over 15 words. 196 are `info`, `ok` or `neutral`, which means they ask nothing of the
  user.
- **Empty states:** 162 of 192 have a body sentence over 6 words. The longest is 60.
- **Page subtitles:** 57 of 81 literal ones are over 8 words. Most restate the title ("Every change, its before and after,
  recorded in the same act as the change" under *Audit trail*).
- **Fact chips already exist and are under-used.** Only 7 screens use the `PageHeader` `info` popover. `ProvenanceBadge` already
  says Stated, Observed, Assumed or Not set in one word, but most screens still also write the sentence.
- **Codes on screen.** Eleven strings show a spec or ruling code, such as "(6.16)", "(B2)", "(D4)", "(FR-EVL-003)" or
  "NFR-SEC-005". This already breaks AGENTS.md rule 5. These are the first removals.

**The six patterns to cut, in order of volume:**

| Pattern | Strings | Words | Example (abridged) |
| --- | --- | --- | --- |
| Gap and provenance sentences | 447 | 8,800 | "No documented procedure states who may have an advance, how much, or how it is recouped (B2): eligibility and the percentage are not checked…" |
| Process narration ("once…", "until…", "after this…") | 202 | 4,800 | "Nothing on it changes after this. Each bid's declared price and completion period are unsealed and written in this step…" |
| Rule and policy explanations | 153 | 2,800 | "Whether a contractor's own portal account may sign its block on a Variation Order Certificate…" |
| The product describing itself ("this page", "the portal", "simulator") | 58 | 1,700 | "Nothing is e-mailed to you: this page tells you when the office has checked what you sent…" |
| Repeated notes: the same sentence in 2 or more files | 41 | — | "Changes made through the portal appear here. Records loaded directly have no trail." (3 files) |
| Subtitles restating the title | 57 of 81 | — | *Sign-in settings*: "How long a session lasts, when an account is locked, and how long a password must be." |

The "why this is disabled" essay is rarer than expected. `Blocked` reasons are mostly within budget (4 of 79 are over 12 words).
The long refusals sit in editor intros and callouts that explain in advance why an action might be refused.

## 3. The standard

### 3.1 Word budgets

These are hard limits. Hyphenated words and figures count as one word, and an interpolated value counts as one word. The limit
applies to the longest branch of a conditional.

| Element | Component | Budget | Rule |
| --- | --- | --- | --- |
| Page title | `PageHeader` `title` | 1–4 | A noun: the object or list. Never a sentence. |
| Page subtitle | `PageHeader` `subtitle` | **none**, or 8 at most | Only when it carries a **fact** the title does not, such as "Draft · issued version 3 in force". Never a description of the screen. |
| Page explanation | `PageHeader` `info` | 40 | What the screen covers and what it does not. Off the surface, inside the popover. |
| Header facts | `PageHeader` `meta` | 1–4 each | Value-first: "RM 1.2m", "Closes 3 Nov". |
| Card or section subtitle | `CardHeader` `subtitle`, `Section` `description` | **none**, or 6 at most | A count or a state ("3 awaiting you"). Detail goes to `LeadWithMore`. |
| Drawer or editor intro | `RecordEditor` `description`, `DrawerHeader` `subtitle` | **none**, or 15 at most | Only the consequence the user must know before pressing: "Cannot be undone." "Sends to all 14 buyers." |
| Field label | `Field` `label` | 1–4 | |
| Field hint | `Field` `hint` | 8 | The format or unit ("DD/MM/YYYY", "Per cent of contract sum"). Never the rule behind the field. |
| Placeholder | | 0–4 | An example value only. |
| Button | `Button`, `ButtonLink` | **1–3** | A verb and an object ("Issue", "Send for approval"). |
| Table header | `DataList` column | **1–3** | |
| Table or list note | text under a list | **none**, or 8 at most | |
| Badge or chip | `Badge`, `Chip` | 1–2 | A state word: Draft, Overdue, Assumed, Not set, SULIT, Demo. |
| Empty state | `EmptyState` `title` | **6** at most, with no body | "No addenda issued". Where there is a next step, it is the `action` button, not a sentence. |
| Refusal | `Blocked` `reason`, route-handler refusal, fault text | **12** | What blocks it, then who or what clears it: "Needs a second administrator. Ask another administrator to issue." |
| Callout | `Callout` | **15**, title included | Only `warn` or `err`, and only when the user **must act** or **something is wrong**. See §3.4. |
| Confirmation question | confirm dialog | 12 | The consequence, not the procedure. |
| Stepper step | `Stepper` | 1–3 for the label, no description | The current step's state goes in a chip. |
| Success notice | `Callout tone="ok"` after the user's own action | 8 | "Sent to the committee." Then it goes away. |
| Supplier next step (portal only) | one line per screen | 12 | Always visible. See §3.6. |

**No paragraph anywhere on a working screen.** A paragraph is any block of text over 20 words, or over its element's budget, whichever is smaller. The budgets decide, not the sentence count: "Needs a second administrator. Ask another administrator to issue." is a refusal, not a paragraph.
The only exceptions are the texts in §3.7, where the user is reading the text itself and not being told about the screen.

### 3.2 How to write within the budget

1. **Lead with the state or the figure.** Write "Not set" rather than "This has not been set by the organisation".
2. **Never narrate the process.** Delete "once this is issued…", "until the committee…" and "after this…". The stepper and the
   next button already show what comes next.
3. **Never describe the screen or the product.** Delete "this page shows", "the portal", "here you can".
4. **Never cite a source on screen.** Clause numbers, spec IDs, ruling numbers and letter-number codes ("B2", "6.16") are
   configuration keys. Where the user must see a source, they see its label, and only inside a popover.
5. **One idea per string.** If a sentence has a colon or a semicolon, it is usually two strings, and one of them belongs in the
   popover.
6. **Say a thing once per screen.** A note that repeats across cards becomes one header fact or one chip.
7. **Plain words.** Write "Sent back" rather than "Returned for amendment", and "Not checked" rather than "Eligibility is not
   validated".

### 3.3 Where explanations go

An explanation is never simply deleted when it carries a fact the user may need. It moves to one of the places below. **These are
the only places it may move to.**

1. **The page's information popover**, `PageHeader` `info`, built on `MoreText` variant `note`. This holds what the screen covers,
   what it does not, and the rule behind it. One per screen, 40 words at most.
2. **The inline information button**, `MoreText` or `LeadWithMore`, beside the element it explains. This holds the detail behind
   one chip, figure or field, 40 words at most. It is already keyboard-reachable, opens on a tap or click, and is read once by a
   screen reader.
3. **Nowhere.** If an explanation does not change what the user does on this screen, it goes into the product documentation or
   is deleted. Most process narration and rule restatement falls here.

**Not a help drawer.** A per-screen help drawer would be a new pattern, and it would collect the very paragraphs this note
removes. If a popover needs more than 40 words, the text belongs in documentation.

**Not a native `title=`.** A keyboard user cannot reach a native tooltip. `ProvenanceBadge` currently explains itself through
`Badge title=…`. The shared-components step of the sweep (§5, step 0) gives it a `MoreText` popover. Every new chip that carries
an explanation uses the same popover.

### 3.4 Callouts

The callout is the loudest element on a screen, so it is reserved for the two cases that justify it.

- **`warn`:** the user must act, or the action they are about to take has a consequence they cannot see. Examples: "Draft. Not
  routing anything until issued." with the action [Issue]; "Bid security expires in 5 days." with the action [Extend].
- **`err`:** something is wrong now. Examples: "Quorum not met. 2 of 3 members present."; "Sign-in refused: trail not writable.
  Contact the operator."
- **`info`, `ok` and `neutral` callouts are retired from working screens.** Each one becomes one of the following:
  - a header fact or chip, when it states a state, such as "Restricted", "Demo", "Read-only" or "Issued 3 Oct";
  - a popover, when it explains;
  - nothing, when it narrates.

  The one exception is the brief `ok` notice after the user's own action (§3.1).
- **Only one callout per screen region.** Where two would show, the more serious one shows, and the other becomes a chip.

### 3.5 Honesty with fewer words

AGENTS.md requires that gaps stay honest and that an assumption is never shown as if it were a rule. That still holds. **The
signal stays on the surface, and the sentence moves into the popover.**

| Today (a sentence) | Becomes (a chip, with the detail in a popover) |
| --- | --- |
| "No documented procedure states who may have an advance… eligibility and the percentage are not checked." | Chip **Not checked**. Popover: "No procedure sets who may have an advance or how much." |
| "The funder's rules have not been supplied, so nothing is routed by them…" | Chip **Not set** beside the funder route. Popover: "Routed by the organisation's limits until the funder's rules are added." |
| "This exercise is hidden from everyone else: it is left out of the lists, the counts…" (121 words) | Header chip **Restricted**. Popover: "Visible only to the people named on it." |
| "Not judged: the organisation's time zone is not set" (3 places) | Chip **Not set** on the value. The organisation settings page has one `warn` callout: "Time zone not set. Dates cannot be judged." |
| "A supplier … pays on the demonstration payment simulator… never a final…" | Chip **Demo** on every simulated payment. Popover: "Simulated. No money moves." |

**The fixed chip words.** The provenance words are **Stated**, **Observed** and **Assumed**. The gap words are **Not set**, **Not
checked**, **Not scanned** and **Not judged**. The classification words are **SULIT** and **Restricted**, and the demonstration
word is **Demo**. A screen does not invent a synonym for any of them. A rule with no source shows **Not set**, never a blank and
never a zero, as the quorum example in AGENTS.md requires.

**Refusals still say who can act** (design principle). The 12 words are spent in this order: what blocks it first, then who or
what clears it. Write "Only the secretariat can table matters", not "Matters are tabled by a holder of the Secretariat office".

### 3.6 The supplier portal

The portal has the same budgets, with three differences:
- **One visible next step per screen, of 12 words at most**, as plain text above the primary action, for example "Upload your
  bank statement, then press Send." A supplier who visits twice a month will not hover to find out what to do. The next step is
  never hidden in a popover.
- **No hover-only fact that changes what the supplier must do.** Popovers may hold the background only.
- **Plain words before office words.** Write "The office sent it back", not "REJECTED".

The density allowed on staff screens, such as fact rows, chips and compact lists, does not carry over to the portal.

### 3.7 What must stay on the surface

These items are required by a client-spec Must or by a ruling. They are **shortened, never removed**. The list may only grow
through a product-owner ruling.

| What | Source | How it survives |
| --- | --- | --- |
| SULIT marks on classified values and pages | Spec (SULIT classification), `sulit-marks.tsx` | The **SULIT** chip and mark stay as they are. Any sentence around them goes. |
| Cumulative approved variation value and per cent on every variation and certificate | Spec FR (cumulative variation, "shall display") | A header fact, for example "Varied RM 0.4m · 6.2%". |
| Builder's Works Value threshold on the certificate screen | Spec ("displayed on the certificate screen") | A header fact. |
| Expiry date of the exercise | Spec ("computed and displayed") | A header fact, with an **Expired** chip when it applies. |
| Weather-claim three-year guidance | Spec ("the three-year guidance is displayed") | A field hint of 8 words or fewer, for example "Evidence covering the last three years." |
| Nominated sub-contract rule | Spec ("displayed on the sub-contract record") | One line of 12 words or fewer on the record. |
| Last known integration position and its age | Spec | A fact with its age ("As of 2 h ago"), and a `warn` chip when it is stale. |
| Receipt digest in full, and what to compare it with | Ruling 0003 20s (sealed bids, My Bids after the opening) | The digest stays in full. The instruction is cut to "Compare with your receipt." |
| "Must be re-tendered" when the opening cannot proceed | Ruling 0003 (ruling 21) | An `err` callout of 15 words or fewer. |
| "Not scanned" on unscanned files | Ruling 0004 (OD-4) | A chip. |
| "Setting not set" on a refused contractor upload or SULIT send | Ruling 0004 | A refusal of 12 words or fewer, naming the setting's label. |
| Simulated payment | Honesty while there is no real payment provider | The **Demo** chip on the pay page and on every sale. It is never removed. |
| Declarations the supplier signs: registration declaration, PDPA personal-data notice, GIRO authorisation, false-declaration warning, bidder's declaration | Spec and statute | **Verbatim.** The supplier is agreeing to this text, so it is content, not explanation. Show it in a bordered reading block before the consent checkbox. It is the one place a paragraph is allowed. |
| Issued-document text (letters, certificates, print views) | Frozen at issue (0004) | Out of scope. A printed instrument is a document, not a screen. |
| Audit trail entries | Domain | Out of scope for cutting. The entries are the record. Only the list's own subtitle and empty state are subject to the budget. |

## 4. Review, tests and measurement

**Tests.** The sweep will touch strings pinned by the `*words.test.ts` and `labels.test.ts` files,
`effective-text.scan.test.ts`, `component-hints.test.ts`, the `ALLOWED_EXTRA` and `DECIDED_FIELDS` lists in the comparators, and
`check-ui.mjs`. Each change cites "0005, founder 2026-10-19". An updated test asserts **either the shortened text or the presence
of the popover holding the detail**. It never simply drops the assertion. A test that pins a meaning, such as "a refusal names
who can act" or "an unset quorum says Not set", keeps pinning that meaning.

**What a `text-snapshot.mjs` diff may drop.** Run the snapshot before and after each area and diff the two runs. A reviewer may
accept a removed line only if it is **explanation**. The following must survive the diff, either on the surface or in a popover
that is present in the DOM:
- every field and its value;
- every warning and error;
- every provenance or gap chip;
- every SULIT mark;
- every figure;
- the "who can do it" part of every refusal.

**Lint.** `check-ui.mjs` gains literal-text checks, which fail on:
- a literal `PageHeader` subtitle over 8 words;
- a literal `CardHeader` subtitle over 6 words;
- a literal `RecordEditor` description over 15 words;
- an `EmptyState` with children;
- a `Callout` with a tone other than `warn`, `err` or `ok`;
- a literal callout over 15 words;
- a spec or ruling code pattern in a rendered string.

A rule is added only when the area it covers has been swept, so the lint never fails on work not yet done.

**Measurement.** The founder was promised a before-and-after count. The browser check counts **visible words only**:
- It counts the text of elements that render.
- It excludes `.sr-only`, `aria-hidden` duplicates and closed popovers, because `PageHeader` and `MoreText` keep the full text
  in the DOM for screen readers. A plain `innerText` count would hide the gain.
- It takes full-page screenshots at desktop width (1440) on the main screen of each area, before and after.

## 5. The sweep, by area, in order

Each step is committed separately and reviewed against §4 before the next starts.

The targets below are the share of static words to remove. They are a guide, not a quota. The real test is that nothing needed
for a decision was lost.

0. **Shared components and the shell.**
   - `ProvenanceBadge` moves from `title=` to a `MoreText` popover.
   - Add a small shared `InfoChip`: a `Badge` with a `MoreText` beside it, so a chip with detail is one component and not
     per-screen glue. This extends the shared pieces, as AGENTS.md requires.
   - Shorten the `components` and `shell` catalogues.
   - `EmptyState` loses its body slot for new uses. Existing bodies are cut area by area.
   - Add the first `check-ui.mjs` rule, for codes on screen, and remove the 11 codes found (appendix A.4).
1. **Dashboard, Inbox and Account.** These are small (about 1,200 words together), but they are the first screens anyone sees.
   - Cut the subtitles.
   - Make the empty states titles only.
   - Make the account session notes one line each.
2. **Contracts list and the case page** (`/projects`, `/projects/[id]` and all its tabs, plus the certificate and variation
   pages). Target: about 50% of 19,000 words.
   - **Payments** is the worst screen in the product (6,400 words). Its advance-payment and LAD gap sentences ("B1", "B2")
     become **Not checked** and **Assumed** chips.
   - **Variations** and **Supervision** drawer intros are cut to the consequence only.
   - The certificate page's routing-sheet empty states (60 and 44 words) become "Not sent for approval yet".
   - Keep: cumulative variation, BWV threshold, the SULIT marks.
3. **Sourcing exercise, all tabs except opening and evaluation** (header and overview, Scope, Window, Documents, Bids, the
   appendix, and the list, new and edit pages). Target: about 50% of 20,000 words.
   - The **restricted-exercise** callout (121 words) becomes a **Restricted** chip with a popover.
   - The sale section's simulator paragraph becomes a **Demo** chip.
   - The key-custody editors on the Scope tab (69 to 95 words) are cut to the passphrase consequence only, of 15 words or
     fewer, with the rest in a popover. They are security-critical, so they are reviewed line by line against ruling 0003.
4. **Opening and evaluation** (the Opening tab and print, the Evaluation tab, the proposal and the report). Grouped as the founder
   was told. Target: about 45% of 9,000 words.
   - The unseal confirmation (78 words) becomes "Unseals every bid and freezes the schedule. Cannot be undone."
   - Restricted-exercise and SULIT gates are unchanged in behaviour. Only their words change.
5. **Requisitions, committees and My approvals.**
   - The requisition record's commitment callout (103 words) becomes a header fact: "Committed RM X on 3 Oct".
   - The committee sitting empty states become state titles.
   - The approval-route "chain" notes become chips.
6. **Suppliers** (the list, the record, new, and online applications).
   - The list's 133-word callout about contractor performance ("6.16") goes. Performance is not built, so nothing is said about
     it.
   - The record's creditor and registration empty states (54 and 56 words) become state titles with one chip.
7. **Configuration** (all sections).
   - Every section subtitle goes, and the screen's purpose moves into the `info` popover.
   - Each "draft, then issue" explanation (approval matrix, evaluation models and others) becomes a **Draft** badge, plus one
     `warn` callout of 15 words or fewer where nothing routes until the draft is issued.
   - Stored Malay names stay as they are. That is a pending product-owner question from the English-only work, not a word cut.
8. **The supplier portal** (home, opportunities, results, bids and pay, company, registration, projects, account and the data
   download).
   - Apply §3.6: one visible next step, and no hover-only instruction.
   - The company page's 213-word documents block becomes a list with a state chip per document, plus one next-step line.
   - Declarations stay verbatim (§3.7).

## 6. The alternative I rejected

**Collapse rather than cut**: keep every sentence, but behind "Show details" toggles, automatic truncation or a help drawer on
every screen. This extends what `SUBTITLE_LIMIT` does today to every element.

It is cheaper, because no wording needs review and no test changes. I rejected it for three reasons:
- **It moves the clutter rather than removing it.** Every card would gain a toggle, which is a control the user has to read and
  decide about. The founder asked for fewer words, not for words that are folded away.
- **Truncation cuts at a character count, not at a meaning.** "Sign-in is refused until the operator…" would cut exactly before
  the part that says who can act.
- **It keeps the writing habit.** Authors would go on writing paragraphs because the component hides them. A budget changes what
  gets written.

Popovers survive in this design only as the single, named home for an explanation that carries a fact (§3.3).

I also rejected a **"help mode" switch** that shows the explanations on demand. It is a setting nobody finds, and a screen
whose meaning depends on a mode is not self-explaining.

## 7. What to test with real users before committing to the whole sweep

Run these after steps 0 to 2, on the case page and one sourcing tab.

1. **Can a procurement executive still tell an assumed rule from a stated one?** Show the Payments tab with the **Assumed** and
   **Not checked** chips and ask "Which of these limits is in your policy?" Pass: they answer correctly without opening a
   popover, or they open it unprompted.
2. **Does a refusal still say who can act?** Give an approver a blocked action. Pass: they name the person or office to go to
   within 10 seconds.
3. **Do the drawer intros still stop an irreversible mistake?** Ask an opening officer to unseal with the 10-word confirmation.
   Pass: they can say what cannot be undone.
4. **Does a supplier still know what to do next?** Give a first-time supplier the company documents page on a laptop. Pass: they
   upload and send without asking, and without hovering anything.
5. **Is the popover found at all?** Watch whether staff open the information buttons in the first week. If nobody ever does,
   much of what moved there can go to "nowhere" (§3.3).

---

## Appendix A. The inventory, 2026-10-19

**Method.** A static scan with the TypeScript compiler over `src/app/**`, `src/components/**` and the label, word and catalogue
modules in `src/lib/**`. The test files were excluded. It collects:
- the string and JSX text of `PageHeader`, `CardHeader`, `Section`, `RecordEditor` and `DrawerHeader` subtitles and descriptions;
- `Callout` and `EmptyState` content;
- `<p>` text;
- field hints, placeholders and `Blocked` reasons;
- every lib string of 3 words or more.

The counts are **static source words with every state summed**, not the words visible at one time. A screen with ten mutually
exclusive states counts all ten. Lib words are attributed to the screen whose module uses them. Some Malay slots in
`payment/labels.ts` and `variation/labels.ts` repeat the English, so those two figures are inflated by a few per cent. The browser
count (§4) is the visible measure.

### A.1 By element

| Element | Strings | Words | Over budget |
| --- | --- | --- | --- |
| Lib catalogue strings (labels, faults, notes) | 4,583 | 50,844 | 1,039 over 15 words, 172 over 30 |
| Drawer and editor intros (`RecordEditor` `description`) | 502 | 13,046 | 378 over 15 |
| Card subtitles | 385 | 6,440 | 316 over 8 |
| `<p>` paragraphs | 299 | 3,950 | 105 over 15 |
| Callouts (all tones) | 513 | 7,768 | 178 over 15; 196 are info, ok or neutral |
| Empty-state bodies | 192 | ~3,100 | 162 over 6 (with no body allowed, all of them) |
| Page subtitles (literal) | 81 | 807 | 57 over 8 |
| Field hints | 87 | 754 | 35 over 8 |
| Refusal reasons (`Blocked`) | 79 | 496 | 4 over 12 |

### A.2 The 40 worst screens

Static words, inline and catalogue. The second figure is the number of strings over 15 words.

| # | Screen | Words | Long |
| --- | --- | --- | --- |
| 1 | Contract case: Payments tab | 6,441 | 125 |
| 2 | Sourcing: Scope tab, including key custody | 5,721 | 128 |
| 3 | Sourcing: Opening tab | 4,821 | 119 |
| 4 | Sourcing: Window tab (sale, briefing, addenda) | 4,590 | 103 |
| 5 | Suppliers: list, new, online applications | 4,402 | 70 |
| 6 | Sourcing: Documents tab | 4,241 | 108 |
| 7 | Sourcing: Evaluation tab and report | 4,136 | 89 |
| 8 | Awards: list and award record | 3,660 | 97 |
| 9 | Supplier portal: bids and payment | 3,552 | 87 |
| 10 | Contract case: Variations tab | 3,520 | 67 |
| 11 | Contract case: Supervision tab | 3,306 | 63 |
| 12 | Configuration: tender documents | 3,291 | 82 |
| 13 | Configuration: scope, awards, post-award, budget, reference data | 3,173 | 62 |
| 14 | Contract case: overview, formation, documents | 2,873 | 51 |
| 15 | Sourcing: list, new and edit (method) | 2,651 | 69 |
| 16 | Configuration: numbering, audit, changes, routing sheets, documents and others | 2,450 | 45 |
| 17 | Supplier record | 2,194 | 54 |
| 18 | Supplier portal: home, opportunities, results, account | 2,032 | 34 |
| 19 | Sourcing: Bids tab | 1,951 | 43 |
| 20 | Committee sitting | 1,898 | 44 |
| 21 | Requisitions: list and new | 1,831 | 33 |
| 22 | Supplier portal: projects | 1,695 | 33 |
| 23 | My approvals and routing | 1,674 | 39 |
| 24 | Certificate page | 1,618 | 25 |
| 25 | Supplier portal: company | 1,602 | 32 |
| 26 | Sourcing: exercise header, overview, appendix | 1,424 | 25 |
| 27 | Supplier portal: registration | 1,400 | 34 |
| 28 | Contract case: Award tab | 1,207 | 29 |
| 29 | Requisition record | 1,076 | 22 |
| 30 | Configuration: accounts, users, sign-in settings | 1,069 | 21 |
| 31 | Configuration: approval matrix | 1,034 | 19 |
| 32 | Shared components and shell | 974 | 12 |
| 33 | Configuration: evaluation models | 952 | 20 |
| 34 | Configuration: suppliers | 909 | 22 |
| 35 | Configuration: invitation | 877 | 25 |
| 36 | Configuration: templates | 784 | 18 |
| 37 | Configuration: committees | 632 | 14 |
| 38 | Configuration: organisation | 631 | 18 |
| 39 | Variation page | 619 | 14 |
| 40 | Account and sign-in | 573 | 8 |

Below 40: Dashboard 425, Contracts list 259, Committees list 219, Inbox 209.

### A.3 The longest single strings

| Words | Where | Kind |
| --- | --- | --- |
| 213 | `supplier/company/panels.tsx` | Documents block |
| 133 | `suppliers/page.tsx` | Info callout (contractor performance, "6.16") |
| 121 | `sourcing/[id]/page.tsx` | Restricted-exercise callout |
| 104 | `configuration/audit/page.tsx` | Info callout on export digests |
| 103 | `requisitions/[id]/page.tsx` | Commitment callout |
| 101 | `projects/[id]/payment-editors.tsx` | LAD drawer intro |
| 97 | `configuration/accounts/page.tsx` | Trail-writable callout |
| 95, 91, 69 | `sourcing/[id]/scope/key-editors.tsx` | Key-custody drawer intros |
| 92 | `configuration/post-award/editors.tsx` | Drawer intro |
| 84 | `sourcing/[id]/window/sale-section.tsx` | Simulator callout |
| 78 | `sourcing/[id]/opening/editors.tsx` | Unseal confirmation |
| 60 | `projects/[id]/certificates/[certId]/page.tsx` | Empty state |

### A.4 Codes on screen (remove in step 0)

| File | Code |
| --- | --- |
| `app/configuration/evaluation/editors.tsx:351` | FR-EVL-003 |
| `app/projects/new/award-form.tsx:55` | 6.7 |
| `app/projects/[id]/editors.tsx:275` | D4 |
| `app/projects/[id]/payment-editors.tsx:164`, `:272` | B1, B2 |
| `app/projects/[id]/payment-panels.tsx:405`, `:588` | B1, B2 |
| `app/sourcing/[id]/non-award-panel.tsx:31` | D7 |
| `app/suppliers/page.tsx:482` | 6.16 |
| `lib/auth/words.ts:49` | NFR-SEC-005 (verify that it is rendered) |
| `lib/award/gate-words.ts:41` | D4 |

### A.5 Notes repeated across files (say once)

There are 41 sentences of 8 words or more that appear in two or more files. The most repeated are:
- "Changes made through the portal appear here. Records loaded directly have no trail." (3 files)
- The "nobody is on record as having made this draft… adopting it makes you its maker" note (3 files)
- "The portal's forms are closed: the person who runs the portal has not set its form key…" (3 files)
- "Not judged: the organisation's time zone is not set" (3 files)
- "Chain beneath the approver: an office no longer configured" (3 files)

Each becomes one chip or one shared string.
