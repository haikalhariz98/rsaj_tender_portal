# Founder feedback, 2026-10-01: activity feed, subtitles, organisation details, dropdowns

Design proposal for the four founder directions (decisions log, top "founder" entry). Nothing here is built. Each item: job, recommendation, spec, states, rejected alternative, test.

## 1. Dashboard "Recent activity" without votes

**Job.** An officer opens the dashboard to see which matters moved and pick up what now waits on them. Today the feed answers "how did each member vote?", which nobody asked and the founder has ruled must not be broadcast.

**Recommendation.** Build the feed from `AuditEntry`, not `Vote`. The trail has no semantic actions (only `CREATE | UPDATE | DELETE`, entity and field changes), so an event is a rule on entity + action + field transition. Rules live in a pure, tested classifier `src/lib/dashboard/activity.ts` → `activityLine(entry): Line | null` (rule 3). `loadDashboard` reads the newest 60 allowlisted entries (index `(organisationId, at)` exists), classifies, drops nulls, **collapses**, keeps 8. Delete the `votes.flatMap` feed in `src/lib/dashboard.ts`.

**Included** (subject first; status codes go through a label map, never to the screen):

| Match | Line |
| --- | --- |
| Requisition CREATE | "{ref} raised", or "{ref} received from the finance system" when the reason says so |
| Requisition status → ENDORSED · REGISTERED · OVER_BUDGET | "{ref} endorsed" · "registered" · "is over budget" |
| Requisition → PENDING_APPROVAL (not from REJECTED) · APPROVED · REJECTED | "sent for approval" · "approved" · "rejected: {reason}" |
| Requisition REJECTED → DRAFT · REJECTED → PENDING_APPROVAL | "sent back to whoever raised it" · "returned to an earlier step" |
| Requisition → RECALLED · CANCELLED · CLOSED | "recalled" · "cancelled" · "closed" |
| ApprovalStep UPDATE with `escalation` · decision → DONE / REJECTED | "{ref}: {office} step passed to {actingOffice}" · "{office} decided" / "{office} rejected" |
| SourcingExercise CREATE · → DOCUMENTS_IN_PREPARATION · → CANCELLED | "Exercise {ref} opened for {req}" · "moved into preparation" · "cancelled" |
| Meeting CREATE · → IN_PROGRESS · MINUTED · CANCELLED | "{committee} sitting scheduled for {day}" · "started" · "minuted" · "cancelled" |
| CommitteeDecision CREATE · outcome set | "{subject} tabled at {committee}" · "{subject}: carried / not carried / deferred" |
| Award CREATE · → PENDING_APPROVAL · APPROVED · ISSUED · ACCEPTED · CANCELLED · `commencedOn` set | "Award {ref} opened" · "sent for approval" · "approved" · "issued" · "accepted" · "cancelled" · "work commenced {day}" |

**Excluded.** `Vote` (CREATE and UPDATE: the ruling). `DecisionRecusal` (names a member against a matter; as sensitive as a vote). `MeetingAttendance`. `ApprovalInstance` (always written in the same act as an owner row, so it would duplicate a line; name approval is covered by its `ApprovalStep` rows). Child rows: endorsements, budget checks, gates, split checks, budget movements, exercise scope/taxonomy/answers/participants, contract, case handover, distribution, award documents, returns, conditions, securities. Edits that change no status. All configuration entities (Configuration › Audit trail covers them). The outcome line shows the outcome only, never the `presentVoters`, `recusedCount` or voting rule the row also carries.

**Collapse one act into one line.** One act writes several rows about one owner:
- a rejection writes the step's REJECTED, the requisition's →REJECTED, then →DRAFT, CLOSED or PENDING_APPROVAL;
- a final approval writes the step's DONE and the requisition or award →APPROVED;
- a refused name writes the step and the exercise →CANCELLED.

Group rows by owner and `at`. `at` is `DEFAULT CURRENT_TIMESTAMP`, which Postgres fixes at the start of the transaction. Confirm Prisma leaves the default to the database; if it does not, group within a 2-second window instead. The terminal state wins and carries the step's office: "{ref} rejected at {office} and sent back to whoever raised it", "{ref} approved at {office}". This lives in the same pure module, with a test for each of the three shapes above.

**Line layout.** Every row is `unattributed` with a null `actorPersonId`, so the `Avatar` goes. In its place is an icon chip by kind: `FilesIcon` requisition, `ClockIcon` approval, `GlobeIcon` exercise, `CalendarIcon` sitting, `UsersIcon` matter, `AwardIcon` award. Line 1 is subject + verb; line 2 is the title, truncated, plus a short reason; line 3 is the day via `formatOrgDay` (closes the open UTC-day follow-up). Lines name the **office, never a person**, even where a row carries `decidedBy` or `signedBy`. A named "rejected" sits too close to the named vote the founder has just removed, so whether to name people goes into his open secrecy question. Never infer an actor. Each line links to its record; `ApprovalStep` and `CommitteeDecision` rows resolve their owner (requisition, award, exercise or sitting) in one batched lookup. The card header icon becomes `ClockIcon`.

**States.** Empty: "Nothing has moved yet" / "Requisitions, sittings and awards appear here as they change." Owner gone: plain text, no link. Fewer than 8 matches: show what there is, no paging (a glance, not the trail). Left alone, but listed for the founder's open secrecy question: the "Votes outstanding" stat and "N of M voted" sub-line. They are counts, not positions.

**Rejected.** A separate `Event` table written beside each audit row: a second record of the same act that can drift from the first.

**Test.** Three officers each pick the line they would act on first. Does "{office} decided" without a name read as honest or evasive?

## 2. Long page subtitles: limit and information button

**Survey.** There are 31 `PageHeader` files. Of the literal subtitles, 18 are 90 characters or fewer; the longest are Securities 85, Committees 82 and Organisation 79. Eleven are over 90 (table below). Some are dynamic and unbounded: the requisition record ("{unit} · {section} · raised by {name}"), a sitting's `Cancelled: {reason}` (free text), the committee's Malay name. The award and exercise records are JSX with links.

**Recommendation.**
- Set the limit at **90 characters** (`SUBTITLE_LIMIT` in `page-header.tsx`). At 15px Plus Jakarta Sans this is one line at desktop width (`max-w-[70ch]`) and about two at 390px; measure at 390 before fixing it.
- **Rewrite all 11 long literals** to fit, so the cut becomes a safety net for dynamic text rather than how list screens normally look.
- Add a `scripts/check-ui.mjs` rule that fails on a literal `PageHeader` subtitle over 90.

| Screen (now) | Proposed (length) |
| --- | --- |
| Award controls (173) | "Instruments by band, their templates, who receives copies, and the letter variants." (83) |
| Requisitions (133) | "Requests to spend, raised here or received from finance, checked and routed for approval." (89) |
| New exercise (125) | "Value band, method, contract type and basis. Sourcing runs outside the portal for now." (86) |
| Awards (122) | "Awards from exercises: approval, the instrument issued, what came back, and securities." (87) |
| Approvals (120) | "Every open approval's next step, grouped by the office that decides it." (71) |
| Config › Requisitions (119) | "Endorsements, registration, where the budget check comes from, and how a split is caught." (89) |
| New requisition (114) | "Saved as a draft with its own reference; endorse, check and submit it from its record." (86) |
| Receive requisition (108) | "A requisition approved in the finance system, recorded here so later work can link to it." (89) |
| New award (104) | "Opened on an exercise in preparation; the exercise's band decides the instrument." (81) |
| Audit trail (103) | "Every change, its before and after, recorded in the same act as the change." (75) |
| Sourcing (99) | "Exercises opened on approved requisitions: value band, method, contract type and basis." (87) |

**Free text inside JSX subtitles.** `awards/[id]` and `sourcing/[id]` put `{ex.title}` (free text, unbounded) inside JSX subtitles. Move the title out of the subtitle into `meta` (`meta` facts already wrap), leaving reference + link. `sourcing/[id]/edit` (about 105 visible characters of JSX) becomes "A draft's value, method, scope, contract type and basis; bands are judged again on save." (87), with the reference moved to `eyebrow` as on other edit pages.

**Component spec.** `PageHeader` stays a server component.
- **What gets cut.** Only a `string` subtitle over the limit, at the last word boundary at or before 90, followed by "…" and the info button. JSX subtitles are not cut (a cut through a `<Link>` is unsafe).
- **Button.** A client island, `src/components/ui/more-text.tsx`: an `IconButton` with `InfoIcon`, 24px visible with a 44px hit area, `text-ink-3 hover:text-brand-700`. Name "Show the full description", with `aria-expanded` and `aria-controls`.
- **Popover.** `role="tooltip"`, and the button carries `aria-describedby` while it is open. Styled `bg-surface border border-line rounded-2xl shadow-pop p-3 text-[13.5px] text-ink-2 max-w-[min(36rem,calc(100vw-2rem))]`; below the subtitle, flipping above when there is no room.
- **Hover** opens after 150 ms. The popover itself is hoverable and closes 200 ms after the pointer leaves both (WCAG 1.4.13).
- **Keyboard focus** opens it; Escape closes it and keeps focus on the button.
- **Tap or click** toggles a persistent popover. It closes on a second tap, an outside tap or Escape, and hover never closes a tapped-open one. This satisfies BD-21: no text unreachable on a phone.
- **Screen readers and snapshots.** The full text is always in the DOM as an `sr-only` span and the visible cut is `aria-hidden`. Screen readers hear it once, in full, and `text-snapshot.mjs` and the comparators still see the whole subtitle.
- **Not changed.** `CardHeader` subtitles keep wrapping in full (BD-21).

**Rejected.** A CSS line clamp with "more": it cuts at a different place on every width, and BD-21 already refused clamps on phones.

**Test.** At 390px, tap the button with a thumb. In VoiceOver, check the subtitle is read once.

## 3. Configuration › Organisation: organisation details

**Job.** Reports and letters must carry the customer's identity, and the shell should look like theirs. Today the name comes from an env var (`ORGANISATION_NAME`, `src/lib/org.ts`) and the mark is a fixed gavel plus "Perolehan".

**Recommendation.** Add a first tab, **Details**, to `OrganisationScreen`, before Structure, Cost centres and Sites. It holds a `KeyValues` card and a logo card; edits open in a `RecordEditor` drawer, "Edit organisation details". The time-zone callout stays put. The fields are columns on `Organisation`: nothing is seeded, hints are examples rather than defaults, and everything except the legal name is optional.

| Column | Label | Validation | Hint |
| --- | --- | --- | --- |
| `name` (exists) | Legal name | required, 3–160 | "As registered, e.g. Syarikat Contoh Sdn. Bhd." |
| `nameMs` (exists) | Name in Malay | ≤160 | "Used on Malay documents." (BD-27) |
| `shortName` | Short name | ≤40 | "Shown at the top left and on report headers." |
| `registrationNo` | Business registration number | ≤40; letters, digits, `- ( ) /`, space | "SSM: 12 digits, e.g. 201901012345 (old form 1234567-A)." |
| `taxIdentificationNo` | Tax identification number (TIN) | ≤20, letters and digits | "LHDN TIN, e.g. C1234567890." |
| `sstRegistrationNo` | SST registration number | ≤40 | "If registered, e.g. W10-1808-32000123." |
| `addressLine1/2`, `postcode`, `city`, `state`, `country` | Registered address | 120/120/10/60/60/60 | "Postcode: 5 digits, e.g. 50450." |
| `phone` | Telephone | ≤30; digits, space, `+ - ( )` | "e.g. +60 3-1234 5678" |
| `email` | Email | `x@y.z` shape | "e.g. procurement@example.com.my" |
| `website` | Website | https URL; a bare domain gets the scheme | "e.g. https://www.example.com.my" |

- **Formats are checked loosely**, with no hard SSM or TIN pattern: the product is resold, and a statutory body may have neither number.
- **The check** is `detailsFaults()` in `src/lib/organisation/details.ts`, pure and tested.
- **Unset values** read "Not set" in `ink-4`. A report that needs a missing value names the field rather than printing a blank.

**Logo.**
- **Accepted files.** PNG, JPEG or WebP, checked by magic bytes, up to 512 KB. That is under the 1 MB server-action body default, so the config is not raised. The cap is shown as a technical limit (OD-3 pattern), with "at least 128px tall" suggested.
- **SVG is refused.** It can carry script, and there is no sanitiser and no new dependency.
- **Storage.** A new `OrganisationLogo` table, one row per organisation: `bytes`, `mime`, `sha256`, `width`, `height`, `uploadedAt`. It stays out of the document store, because OD-4 forces attachment-only downloads and a logo must render inline.
- **Serving.** Route `/organisation/logo/[sha]` with `Cache-Control: public, max-age=31536000, immutable` and `nosniff`. A new upload gets a new URL, so nothing needs busting.
- **Audit.** Upload and removal are audited with the fingerprint, type, size and dimensions, never the bytes. Removal asks for a reason.
- **Card states.** Empty: "No logo. The product mark is shown." Preview on `surface` and on `sunken`. Refusals: "Use a PNG, JPEG or WebP image. SVG is not accepted." · "The logo is {n} KB; the limit is 512 KB." · "This file is not a readable image."

**Where it shows.**
- **Sidebar brand row** (`sidebar.tsx:128`). The logo (`max-h-9 max-w-[148px] object-contain`, alt `shortName ?? name`) replaces the gavel tile and "Perolehan". `shortName` sits beside it when the logo is narrower than 2:1. With no logo, the product mark stays.
- **Workspace switcher** shows `shortName ?? name`. The env var is only a fallback for when no organisation row exists.
- **Report and letter headers** pick the details up as each is built.
- **Issued documents** keep the details they were issued with (award documents are frozen snapshots). The tab says so in those words.

**Reflected immediately.** `loadShell()` returns `{ organisation: { name, shortName, logoSha } }`, and `layout.tsx` passes these instead of the env constants. Every save also calls `revalidatePath("/", "layout")`, which per the Next 16 docs invalidates the root layout and every page under it. The router refreshes as the action returns, so the sidebar updates without a reload. The save confirms: "Saved. The new details show across the portal now."

**Rejected.** Keeping the env vars and dropping in a static logo file: every change would need a redeploy and would go unaudited.

**Test.** Ask a customer administrator to find where to set the SST number. Check a long legal name with no short name in the sidebar at 390px.

## 4. Dropdowns: one shared `Select` matching the founder's sample

**Inventory.**
- **Shared `Select`: 17 direct uses in 8 files.** `authority-simulator` 5, `requisition-form` 3, `exercise-form` 2, budget `finance-panel` 2, `allocation-overlays` 2, `controls-panel` 1, `award-form` 1, `record-editor` 1.
- **`RecordEditor` `kind: "select"`: about 172 field definitions in 20 editor files.** All go through its one `Select`.
- **Hand-built, single-choice.** In `DataList`: the native view picker, the rows-per-page picker and the filter menus.
- **Hand-built, multi-select.** `RecordEditor` `kind: "tokens"` (7 uses) and the budget `controls-panel` role listbox. So multi-select is needed: both move onto the same popover and keep their submit encoding. Confirmed: both post one newline-joined hidden input (`record-editor.tsx:372`, `controls-panel.tsx:451`).
- **Out of scope.** There is no `<optgroup>` anywhere. The sidebar workspace switcher is a `role="menu"` of actions, not a field.

**API.** `src/components/ui/select.tsx`, re-exported from `field.tsx` so imports do not change.

```tsx
<Select id name value defaultValue onChange disabled required size="sm"|"md" aria-invalid aria-label
        label? placeholder?="Select an option" searchable?="auto: options > 7" multiple?>
  <option value="">Not set</option>
  <option value="X" disabled data-sub="second line" data-avatar="Person Name">Label</option>
</Select>
```

- **Options.** `<option>` children are read with `React.Children`, so every current usage compiles unchanged. `data-avatar` is for people lists only (the log notes that initials beside anything else read like codes).
- **Form submission, single choice.** A visually hidden native `<select name>` (`sr-only`, `tabIndex={-1}`, `aria-hidden`) is kept in sync. FormData and `required` keep working.
- **Form submission, `multiple`.** Use one `<input type="hidden" name value={chosen.join("\n")}>`, **never** `<select multiple name>`. A multiple select posts N entries under one name, and the actions read a single value, so all but the first would be lost without any error.
- **Change events.** On choose, the hidden select's `.value` is set and `new Event("change", { bubbles: true })` is dispatched. This keeps both `onChange(e => e.target.value)` and `RecordEditor`'s form-level `onChange` firing. That form-level handler drives `showWhen` (the bond fields), which is the swap's main trap; test it.
- **Clearing and odd values.** The `""` "Not set" row stays choosable, because clearing is deliberate (BD-35). Orphaned stored values still show. Disabled options are greyed with their reason, never hidden.
- **Drawer autofocus.** The selector becomes `"input:not([tabindex='-1']),[role=combobox],textarea"`.

**Visuals.** Existing tokens only.
- **Field.** `rounded-control border-line-2 bg-surface`, height 40 (32 at `sm`), with a 16px `ChevronDown` in `ink-3` that rotates 180° while open.
- **Label.** Always notched into the border: `absolute -top-2 left-3 px-1 bg-surface text-[12px] font-semibold text-ink-2`. It never animates, because the placeholder (`ink-4`) fills the box.
- **Focus.** `border-brand-500 ring-4 ring-brand-500/15`, and the label turns `brand-700`.
- **Popover.** `bg-surface rounded-2xl border border-line shadow-pop p-1.5`, at least as wide as the field.
- **Search** (top of the popover). `h-9 rounded-xl bg-sunken pl-9` with `SearchIcon` in `ink-4` and the placeholder "Search".
- **List.** `max-h-72 overflow-y-auto`, with a slim scrollbar `[scrollbar-width:thin] [scrollbar-color:var(--color-line-2)_transparent]`.
- **Rows.** `rounded-xl px-3 py-2 text-[13.5px]`. The active row is `bg-sunken`; the selected row is `font-semibold text-brand-800` with a `CheckIcon`.
- **Placement.** `popover="manual"` (top layer) with script positioning that flips above when there is no room below, so drawer bodies do not clip it.

**Keyboard and ARIA** (APG select-only combobox; the editable variant when searchable).
- **Roles.** The trigger is `role="combobox"` with `aria-expanded`, `aria-controls`, `aria-labelledby` and `aria-activedescendant`. The list is `role="listbox"` (`aria-multiselectable` when multiple); rows are `role="option"` with `aria-selected` and `aria-disabled`.
- **Opening.** Enter, Space, ↓ or Alt+↓. While closed, typing jumps to the matching option, as a native select does.
- **Moving.** ↑/↓ move, and Home/End jump.
- **Choosing.** Enter chooses and closes; with `multiple` it toggles and stays open. Escape closes and restores the value. Tab chooses and moves on.
- **Search.** When shown, focus moves into it and typing filters; arrow keys still move the active row.
- **No matches.** A row that is not an option reads "No matches for '{q}'", and a polite live region announces "{n} options".

**States.**
- **Disabled:** `bg-sunken text-ink-3`, `cursor-not-allowed`, never opens.
- **Invalid:** a `rose-400` border and rose label; the `Field` error stays below.
- **No options:** "Nothing to choose yet", and the caller's hint says where to configure them.
- **Loading:** no state needed, because options are always server-rendered.

**At 390px.**
- **Width.** The field's width, at least 16rem, capped at `100vw - 2rem`.
- **Height.** `max-h-[min(18rem,50dvh)]`.
- **Touch.** Rows are at least 44px tall on `pointer: coarse`. Search is not autofocused there, because the keyboard would cover the list.

**Field and toolbars.** `Field` passes `label` and `htmlFor` to its child through context, and a `Select` draws the label in the notch. `Field` then **does not render its own `<label>`**, so no form shows the label twice. The control's `aria-labelledby` points at the notched label.

**Open question for the founder.** The direction named dropdowns only, but a notched select beside inputs labelled above breaks the "siblings match" rule. I recommend one design-system commit that notches every `Field` control, sibling-checked across all forms.

`DataList` toolbars use the same popover with a compact chip trigger (`sm`, `aria-label`, no notched label).

**Rejected.** Styling the native `<select>`: its open list cannot be styled or searched, and the sample needs both.

**Test.**
- Fill the requisition form with the keyboard only.
- Check the bond fields still toggle through `showWhen`.
- Use VoiceOver on iOS and TalkBack.
- Pick one person from 40 at 390px.
