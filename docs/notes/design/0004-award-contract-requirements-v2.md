# 0004 — Award and Contract Requirements v2 (GN, MN, C, P, V) mapped and planned

Status: build design, written 2026-10-15 by the solution architect. It is built from the product owner's rulings AC-0 to AC-35 (§4,
verbatim). Wave G code is built (see "Wave G status, 2026-10-17" below). The rest is not built yet. Wave G and wave C may start once sealed online bids (Sourcing waves 3b and 3c) are committed.
Wave P is **held** (AC-7) and wave V follows it (AC-35).

**Sources:**
- **Binding:** `docs/requirements/Award_and_Contract_Requirements_v2.docx` ("Award and Contract Requirements, Round 2", BA draft, 14 Oct
  2026). Its text is in `docs/requirements/award-contract-v2-media/Award_and_Contract_Requirements_v2.txt`, and its Figures 1–7 are in
  `docs/requirements/award-contract-v2-media/unz/word/media/`. In this note "the document" means that file.
- **Background:**
  - `docs/notes/drafts/contracts-projects-requirements-2026-10-14.md`, the developer's draft. It was **not** approved, and AC-3 overrides
    its read-only Securities list.
  - The spec, `docs/requirements/RSAJ-Portal-Requirements-Specification.md`.
  - ADR 0007, ADR 0011 and ADR 0034.

**Order of authority** (AC-0): the document, then the spec, then earlier rulings, then the honest default. The document supersedes only
what it names. A spec Must that it does not name stays binding.

## Wave G status, 2026-10-17

Code committed on branch `build-all-modules`, commits `8fc9529f` (G2) to `8a4e4575` (review fixes). **Wave G stays open.** The AC-8
measurement and every browser check were not run (see "Sign-in times" below). Status words: **Built** means code and automated tests are
committed. **Unconfirmed** means the "Done when" browser check is still owed.

| Item | Status | What is still owed |
| --- | --- | --- |
| GN-01 Faster sign-in (AC-8, AC-9) | Built (a) one navigation (`8fc9529f`), (b) parallel dashboard reads, (c) parallel SULIT gates, (d) slim shell count with an equality test. Unconfirmed. | The before and after times. The one-request count. |
| GN-02 Back to the dashboard (AC-10) | Built (`d4510357`). Unconfirmed. | /account no-scroll check in a browser. |
| GN-03 Dashboard cards (AC-11, AC-12) | Built (`59f3cff4`). Unconfirmed. | Card equals badge, click opens My approvals, `/` snapshot diff. |
| GN-04 Side-menu counts (AC-13) | Built (`26f27e95`, badges re-read after each navigation in `721327d2`). Unconfirmed. | Both badges update after a decision and after reading a notice. |
| GN-05 Simplify the Inbox (AC-14) | Built (`d4510357`). Unconfirmed. | /inbox snapshot check. |
| MN-01 Securities menu removed (AC-15) | Built (`3f4f3348`). Unconfirmed. | Menu absent, old URL lands on the view, view and tab at 1280 and 1600. |
| MN-02 Documents menu removed, submissions bridge (AC-16) | Built (`4d22a535`, `721327d2`, `8a4e4575`). Unconfirmed. | Old notice, new notice and answering from the Submissions tab, in a browser. |

### Sign-in times (AC-8)

| | Median | p95 | Requests after the action |
| --- | --- | --- | --- |
| Before (G1 baseline) | not measured | not measured | not measured |
| After (G10) | not measured | not measured | not measured |

Target: 2.0 s median and 3.0 s p95. **No number exists, so nothing here claims the target is met.** The reasons, from the decisions log
(G1, G10, 2026-10-17):
- the scratch database `perolehan_native_check` has no demo organisation and no officer with a worklist;
- the demo data is only in `perolehan`, and signing in there writes sessions, which is forbidden;
- no browser or network driver is installed to time press-to-painted or count `?_rsc=` requests.

To close: either authorise a scratch copy of the demo organisation and a browser driver, or run the 20-run set (one discarded warm-up) on
`next build && next start` and record the numbers in the decisions log. The baseline needs the commit before `8fc9529f`.

### Differences from this design, as built

- Contract submissions are shown to the S.O. even for a restricted exercise (AC-18, AC-19). The first G9 build hid them. Fixed in `721327d2`.
- The organisation-wide securities view still leaves out restricted exercises the reader is not named on (FR-MTD-007), while the contract's own
  Securities tab shows them. Open product-owner question, in the backlog.
- The Contracts card hint reads "n awarding (on Awards, until a contract is formed)" until wave C. Logged as interim.

## 0. Who answered section 5

- No answer comes from the founder or from CPD.
- All eight are the **product owner's adoption for the founder** (AC-0). Log them that way, the same pattern as 0003 G6.
- The questions that only RSAJ or CPD can answer are in §8, each with the default the rulings already set.

## 1. Who, the task, and how it goes wrong

- **Who:**
  - CPD officers, who award, issue, chase the return, lodge securities and form the contract;
  - the S.O. office and its delegates, who supervise on site;
  - the contractor's people, in the portal;
  - every staff user, through the dashboard, the side menu and the inbox.
- **The task:** the journey in the document's §3. A requisition is approved; sourcing runs (Round 1); then the contract's five stages:
  Award, Before signing, Signing, Project, Close-out (parked).
- **How it goes wrong today:**
  - The award and the contract are two pages, two lists and two menus. The bond is lodged on the award (`awards/[id]/page.tsx:1198`)
    although it is the contract's record (ADR 0007 D2).
  - The dashboard's "Awaiting a decision" (organisation-wide) disagrees with My approvals (personal).
  - The side menu badge sits on Dashboard and counts restricted matters.
  - Sign-in renders the root layout two to three times.

## 2. Per-item map

**Legend.**
- **Size:** S < 1 day, M 1–3 days, L about a week, XL more than that.
- **Schema:** whether the item needs a migration.
- **Risks:** what must not regress.

Every "change" below is the **ruled** change. Where an option was considered in mapping and rejected by the rulings, the ruling wins and the
rejected option is named.

### GN-01 — Faster sign-in (AC-8, AC-9) · M · no schema
- **Today:**
  - `AuthForm` (`src/components/auth/auth-form.tsx:97-99`) calls `router.replace('/')` **and** `router.refresh()` after an action that
    set a cookie. The layout and `/` therefore render two to three times.
  - Each layout render runs `staffCounts`, which runs the full `loadWorklist` (`src/app/_auth/worklist.ts:22`,
    `src/lib/approvals/load.ts:29-75`), and `loadShell`, which runs an organisation-wide count.
  - `loadDashboard` (`src/lib/dashboard.ts:62-183`) makes about 12 sequential awaits, including every `committeeDecision` with its votes
    (`:69-80`) and `organisationTimeZone` twice.
  - The three SULIT gates (`src/app/page.tsx:74-76`) run in series, and each writes `SulitAccessEvent` rows.
  - scrypt takes about 167 ms (`password.ts:14`). It is not the main cost.
- **Change:**
  1. Measure per AC-8.
  2. (a) Make sign-in one navigation.
  3. (b) Run `loadDashboard`'s reads in parallel and slim them.
  4. (c) Run the SULIT gates in parallel.
  5. (d) Use a slimmer shell count **only** with an equality test.
  6. (e) Leave scrypt unchanged.
- **Files:** `src/components/auth/auth-form.tsx`, `src/app/sign-in/actions.ts`, `src/app/layout.tsx`, `src/lib/shell.ts`,
  `src/app/_auth/worklist.ts`, `src/lib/approvals/load.ts`, `src/app/page.tsx`, `src/lib/dashboard.ts`, `src/app/_auth/sulit.ts`.
  Read, not changed: `src/lib/auth/{identity,password,hash-pool,session-store,account-view}.ts`.
- **Risks:**
  - `AuthForm` is shared with redeem-code (`/sign-in?password=set`) and with the password change.
  - `sign-in-actions-scan.test.ts` and `auth-reach.test.ts` must keep their intent.
  - `replacingToken` must not change.
  - `SignInNotices` (O-2) must stay.
  - FR-MTD-007 filters and NFR-AUD-004 (log before show) must hold.

### GN-02 — "Back to the dashboard" at the top (AC-10) · S · no schema
- **Today:** a `ButtonLink` at the foot of `src/app/account/page.tsx:118-122`.
- **Change:**
  - Move it into `PageHeader actions`, as a secondary or ghost `ButtonLink`.
  - Add a `BackIcon` (arrow-left) to `src/components/icons.tsx`.
  - Remove the bottom copy.
- **Files:** `src/app/account/page.tsx`, `src/components/icons.tsx`.
- **Risks:** none material. `/account` is not in the text-snapshot `ROUTES`.

### GN-03 — Dashboard cards (AC-11, AC-12) · M · no schema
- **Today:** the four `Stat` cards in `src/app/page.tsx`.
  - "Awaiting a decision" is `queue + requisitions`, organisation-wide (`dashboard.ts:124-148`).
  - "Value approved" (`committedSen` plus a SULIT gate) and "Votes outstanding".
  - The subtitle reads "`n` items are awaiting a decision".
- **Change:**
  - The card becomes personal: **"Awaiting my decision"**, equal to the My approvals badge (`waitingForCount(myStepsOf(...))` from
    `requestWorklist`), linking to `/approvals?tab=mine`.
  - Remove Value approved, Votes outstanding, their gate and their sums.
  - Add three pipeline cards: Requisitions, Sourcing and Contracts. The Contracts card uses `caseStage` and `caseVisibility`, which are
    built in wave G (§5).
  - Remove the subtitle. Keep the meta.
  - Remove "Documents awaiting my review" from "On the way".
- **Files:**
  - `src/app/page.tsx`, `src/lib/dashboard.ts` and `src/lib/dashboard-sums.ts`;
  - new `src/lib/dashboard/pipeline.ts` and `src/lib/contract/case-stage.ts`;
  - `src/lib/contract/case-visibility.ts`.
- **Risks:**
  - The `/` text snapshot changes.
  - Check `compare-screen` for the prototype stat labels: add `DECIDED_ABSENT` entries citing GN-03.
  - `dashboard-sums.test.ts` loses the removed helpers.
  - Any scan expecting the value-approved SULIT event must be updated, citing GN-03.

### GN-04 — Side-menu counts (AC-13) · S · no schema
- **Today:** `loadShell` (`src/lib/shell.ts:51-61`) puts an organisation-wide pending `committeeDecision` count on `/`. It is not
  filtered for restricted exercises, so it **leaks** FR-MTD-007. The `/approvals` and `/inbox` badges already exist
  (`_auth/worklist.ts:22-31`). Approvals actions revalidate only `result.paths` (`approvals/actions.ts:296`).
- **Change:**
  - Remove the `/` count and its query.
  - Add `revalidatePath('/', 'layout')` to every act that changes a person's steps (decide, send back, recall, delegate, escalate). These
    live in the approvals, requisitions, awards, certificates and variations actions.
  - Also revalidate where a notice is read: `inbox/actions.ts` already does; `/inbox/[id]` must be added.
- **Files:** `src/lib/shell.ts`, `src/app/layout.tsx`, `src/app/_auth/worklist.ts`, `src/components/shell/sidebar.tsx`, `src/app/approvals/actions.ts`, `src/app/inbox/actions.ts`, `src/app/inbox/[id]/page.tsx`, `src/app/requisitions/actions.ts`, `src/app/awards/actions.ts`, and the certificate and variation actions under `src/app/projects/[id]/`.
- **Risks:**
  - `auth-reach.test.ts` names `loadShell`.
  - More layout re-renders: do the GN-01 (d) work first.

### GN-05 — Simplify the Inbox (AC-14) · S · no schema
- **Today:** `src/app/inbox/page.tsx:53` has "Open my steps", and `:55-57` has the Delivery `Callout`.
- **Change:**
  - Remove both.
  - Add one subtitle clause: "Notices appear here only; they are not emailed."
  - Keep `NOTICE_DELIVERY_STATEMENT` (`lib/inbox/kinds.ts:43`) for its other users.
  - Update the page's doc comment (lines 20-24) to cite AC-14.
- **Files:** `src/app/inbox/page.tsx`.
- **Risks:** the `/inbox` text snapshot changes, and unused imports will fail lint.

### MN-01 — Remove the Securities menu (AC-3, AC-15) · S/M · no schema
- **Today:**
  - `src/app/securities/page.tsx` reads `listRegister`, `REGISTER_PAGE` and `RegisterView` (`src/lib/award/repo.ts:526-565`).
  - The contract's `SecuritiesPanel` (`projects/[id]/page.tsx:289-340`) is read-only, with no expiry chips.
- **Change.** A dashboard card instead of the view was considered and rejected (AC-15).
  - Remove the nav item (`src/lib/nav.ts:55`).
  - `/securities` becomes `redirect('/projects?view=securities')`. It is temporary, because the target moves in wave C.
  - The Contracts list gains the view **"Securities expiring or not verified"**, built on `listRegister`'s queries and counts, with the
    hidden-exercise filter and the expiry chips. Its rows open the contract's securities.
  - The contract panel gains:
    - the `expiryAlert` chips;
    - a "Lodged, not verified" marker;
    - the "Reminders at N days" line.
  - Remove `revalidatePath('/securities')` (`awards/actions.ts:97`, `projects/[id]/actions.ts:105`) and the `ROUTES` entry. Add
    `/projects?view=securities`.
  - Keep the `compare-screen` `/^Securities$/` allowlist.
- **Files:** `src/lib/nav.ts`, `src/app/securities/page.tsx`, `src/lib/award/repo.ts` (`listRegister`), `src/app/awards/actions.ts`, `src/app/projects/[id]/actions.ts`, `src/app/projects/[id]/page.tsx`, `src/app/projects/page.tsx`, `scripts/text-snapshot.mjs`.
- **Risks:** `listRegister` survives, re-homed. The redirect must not skip the list's own guard.

### MN-02 — Remove the Documents menu (AC-4, AC-16) · M · no schema
- **Today:** `src/app/documents/page.tsx` has four tabs: Library, Distribution, Routing sheets and Review queue. The folder also holds
  the document store's actions (`actions.ts`), `review-actions.ts` and `review-editors.tsx`, which are used across the app. Stored
  `StaffNotice.href` values are `/documents?tab=review` (`lib/inbox/notices.ts:183`) and are immutable.
- **Change:**
  - Remove the nav item (`nav.ts:73`) and **only** `page.tsx`. The page is replaced by a no-DB `permanentRedirect`:
    - `?tab=review` goes to `/projects?view=submissions`;
    - anything else goes to `/projects`.
  - **The bridge ships in the same wave:**
    - a **Submissions** tab on each contract, using `loadReviewQueue` filtered by `contractId` (a new optional argument) and the same
      `AnswerDrawer`;
    - the **"Submissions waiting"** list view with an overdue count.
  - New notices link to `/projects/{contractId}?tab=submissions`. Their body wording changes for new rows only.
  - The contract's Documents tab gains "n copies not sent" and "n routing sheets open (m past target)", with links.
  - The `read.ts:249` fallback for an ownerless document becomes `/configuration/documents`.
  - Remove `revalidatePath('/documents')` in `configuration/post-award/core.ts:251` (gated, see §5) and in `review-actions.ts:85`.
  - Update the `data-list-width.test.ts:52` list and the snapshot `ROUTES`.
- **Files:** `src/lib/nav.ts`, `src/app/documents/page.tsx`, `src/app/documents/review-actions.ts`, `src/lib/portal/projects/review-store.ts`, `src/lib/inbox/notices.ts`, `src/lib/documents/read.ts`, `src/app/configuration/post-award/core.ts`, `src/app/projects/[id]/page.tsx`, `src/app/projects/[id]/documents-panel.tsx`, `src/app/projects/page.tsx`, `src/components/data-list-width.test.ts`, `scripts/text-snapshot.mjs`.
- **Risks:**
  - Deleting the folder would break every attachment panel.
  - The supplier `/documents` in `supplier-reach.test.ts:346` is a false positive.
  - The FR-CRT-011 (S) alias search is dropped. It is logged as partly met.

### C-1 — One case list (AC-17, AC-18) · M · no schema
- **Today:** `/awards` (`listAwards`, `repo.ts:471`, hidden filter) and `/projects` (`listContracts`, `contract/load.ts:313`, Contract
  rows only, no hidden filter). The two are separate.
- **Change:**
  - Remove Awards from the nav (`nav.ts:48`).
  - Add `listCases`: `Award` LEFT JOIN `Contract`, DRAFT included, paged and counted in the database, ordered by award `createdAt` desc
    then id.
  - Views:
    - the five stages, from `caseStage(award, contract, commencement)`;
    - "Cancelled or terminated";
    - In Delay and Commenced pending approval;
    - the wave G views (securities, submissions).
  - Carry the awards-list chips (awaiting approval, to issue, awaiting return, no commitment number, indent expired, securities to
    verify).
  - Apply `caseVisibility` to lists and counts.
- **Files:**
  - `src/app/projects/page.tsx`, and `src/lib/contract/load.ts` (`listContracts` becomes `listCases`);
  - `src/lib/award/repo.ts`, `src/lib/contract/labels.ts`;
  - `projects-list.test.ts`, `surface.test.ts` and the regexes in `evaluation/sealed.test.ts:49` and `opening/sealed.test.ts:63`.
- **Risks:**
  - The In Delay set and `DERIVE_CAP` are judged over contract ids: they need re-keying to awards.
  - Pre-contract rows have no number, so they need a stable sort.
  - Counting rules must live in one place, shared with GN-03.

### C-2 — The case page (AC-19) · XL · no schema
- **Today:**
  - `awards/[id]/page.tsx` is 1477 lines, with 10 tabs, `exerciseIsHidden` and the award SULIT gates.
  - `projects/[id]/page.tsx` has 10 tabs, needs a Contract row (`loadContract`) and has no hidden check.
- **Change:**
  - `/projects/[id]` resolves a Contract first, then an Award:
    - an award with a contract → `redirect` to the contract URL, keeping the query;
    - an award without one → render the Award stage only, skipping every contract-only reader.
  - Extract the award panels into `src/app/projects/[id]/award/*`.
  - Draw a step bar with the shared `Stepper`, extended (§6.2). Stages run in parallel.
  - The default step is the earliest one with something to do.
  - Each step has a "What's next" line and one main button.
  - Tabs are mapped to stages as AC-19 says.
  - Close-out is parked.
  - Each panel keeps its own SULIT gate.
  - The start form moves to `/projects/new?exercise=`.
- **Files:**
  - `src/app/projects/[id]/page.tsx`, the new `award/*` panels, and `src/lib/contract/case-steps.ts` (new, pure);
  - `src/lib/contract/case-load.ts` (new resolver);
  - `src/components/ui/stepper.tsx` and `src/lib/ui/steps.ts`;
  - `src/app/awards/actions.ts` (refresh paths, and the `createAward` redirect at `:313`);
  - `act-status-scan.test.ts:330-337`, `lock-order.test.ts:375-376,488` and `certificate-scan.test.ts:703` (re-pointed, citing C-3).
- **Risks:**
  - SULIT cross-over between award fields (FR-EVL-014) and contract fields.
  - A crash on a missing contract.
  - Server work growing, against GN-01. Each step loads lazily.
  - Source scans pin text in `awards/[id]/page.tsx`.
- **Architect's fill (§8, F-1).** AC-19 does not map the contract's **Overview** tab. It becomes the first tab of the **Project**
  stage, because it summarises supervision, payments and variations. The case header carries the number, the sum and the phase.

### C-3 — Rules that must stay (AC-20) · S · no schema
- **Today:** the rules are enforced in:
  - `lib/award/gate.ts` (`:214`, `:231-246`) and `status.ts:25-47`;
  - `distribution.ts`, `stage-two.ts`, `return-acceptance.ts`, `indent.ts` and `commencement.ts`;
  - `contract-number.ts`;
  - `issueAward` (`awards/actions.ts:751-801`), which is the only creator of Contract rows.
- **Change:**
  - No rule changes. The actions stay in `awards/actions.ts`.
  - Add one regression test per Must, driving the action as posted from the case page's drawers.
  - The demo seed moves to 14 and 7 days (`prisma/demo-award.ts:134`), unless a test pins 10 and 5. If one does, the builder states why.
- **Files:** `src/lib/award/{gate,status,evaluate,distribution,stage-two,return-acceptance,indent,commencement,contract-number}.ts` (read, not changed); `src/app/awards/actions.ts` (`issueAward` 751, `recordDespatch` 864, `recordReturn` 902, `recordCommencement` 997, `cancelAward` 1024; not moved); `prisma/demo-award.ts:134`; new regression tests beside the existing award tests.
- **Risks:**
  - Moving `awards/actions.ts` breaks `act-slots.ts:171,184,375` and `record-operations.ts:30`. It does not move.
  - The full list of Musts kept is in AC-20.

### C-4 — Bond and insurance on the contract (AC-21) · M · no schema
- **Today:**
  - The acts are `lodgeSecurity`, `reviewSecurity`, `lodgePolicy` and `reviewPolicy` (`awards/actions.ts:1119-1295`), run through
    `withLockedAwardFor`.
  - The UI is `SecuritiesPanel` on `awards/[id]/page.tsx:1198-1324`.
- **Change.** Moving the acts to `projects/[id]/actions.ts` was considered and **rejected** (AC-21). Instead:
  - The acts stay.
  - The lodge and review drawers and the chips move to the **Before signing** stage. The forms still post the award id.
  - The bond decision and the insurance terms stay in the Award stage. Before signing shows them read-only.
  - A summary in the Project stage reaches the same panel for advance-payment guarantees and retention bonds.
- **Files:** `src/app/awards/[id]/page.tsx:1198-1324` (panel moved), `src/app/awards/editors.tsx` (drawers reused), `src/app/projects/[id]/page.tsx:148,293-345`, `src/app/awards/actions.ts:95-100` (refresh paths only), `src/lib/award/repo.ts` (`awardHistory`), `src/lib/contract/load.ts` (`contractHistory`).
- **Risks:**
  - `refresh()` (`awards/actions.ts:95-100`) must revalidate the case path.
  - `awardHistory` and `contractHistory` must both still show the register rows.

### C-5 — Regret letters stay in Sourcing (AC-22) · S · no schema
- **Today:** the notices tab on the award (`awards/[id]/page.tsx:362-363`), `non-award-panel.tsx`, `non-award-actions.ts` and
  `non-award-drawer.tsx`.
- **Change:**
  - Move all three files to `src/app/sourcing/[id]/`.
  - Add a "Notices to unsuccessful tenderers" section on the exercise's Award tab, for the live award (ISSUED or ACCEPTED).
  - Show notices under cancelled awards read-only, as an earlier record.
  - `issueNonAwardNotice` keeps `withLockedAwardFor`. Its `revalidatePath` becomes `/sourcing/{exerciseId}`.
  - Check whether `act-slots.ts:208` names the file path.
- **Files:** `src/app/awards/[id]/non-award-{panel,actions,drawer}.tsx` → `src/app/sourcing/[id]/`, `src/app/awards/[id]/page.tsx:362-363`, `src/app/sourcing/[id]/page.tsx` (AwardTab 803-880), `src/lib/portal/bids/non-award-store.ts`, `src/lib/auth/act-slots.ts:208`.
- **Risks:**
  - `sourcing/[id]/page.tsx` belongs to the sealed-bids builder: this waits.
  - Visibility must match today's: `exerciseIsHidden` plus SULIT on reasons.

### C-6 — Old links keep working (AC-23) · M · no schema
- **Today:** about 30 code sites build `/awards/...` (inventory below). `StaffNotice.href` rows hold them permanently (immutable apart
  from `readAt`). `src/proxy.ts` and `next.config.ts` have no redirects.
- **Change:**
  - `/awards`, `/awards/[id]` and `/awards/new` become guarded server redirects:
    1. `requireStaff`;
    2. the organisation lookup;
    3. `caseVisibility` (404 exactly as today);
    4. `redirect()`, which is temporary.
  - `?tab` is mapped by `awardTabToCase` (§6.1). `notices` goes to the exercise.
  - The print views keep their URLs; only their back links change.
  - Every link site goes through `caseHref`.
  - `/configuration/awards` is untouched.
- **Files:** `src/app/awards/page.tsx`, `src/app/awards/[id]/page.tsx`, `src/app/awards/new/page.tsx`, `src/app/awards/[id]/print/[kind]/page.tsx` (back link), new `src/lib/contract/links.ts`, plus every link and revalidate site in the inventory below.
- **The link inventory** (C9 converts each to `caseHref`, or removes it if revalidate-only):
  - **Visible links:**
    - nav `src/lib/nav.ts:48`;
    - `src/app/awards/page.tsx:57,105`, `src/app/awards/[id]/page.tsx:395,980,1000`, `src/app/awards/[id]/print/[kind]/page.tsx:55`,
      `src/app/awards/new/page.tsx:46,94`;
    - `src/app/sourcing/[id]/page.tsx:833,842,858,871`;
    - `src/app/projects/[id]/page.tsx:162,258,298`;
    - `src/app/securities/page.tsx:55,70` (gone after MN-01);
    - `src/app/suppliers/[id]/standing-panels.tsx:168,386`;
    - `src/app/page.tsx:43`.
  - **Persisted or cross-module hrefs:**
    - `src/app/awards/actions.ts:313` (`createAward`) and `:575` (recall notice href);
    - `src/lib/approvals/load.ts:97`, `src/lib/committee/waiting-load.ts:171`;
    - `src/lib/certificate/register.ts:132`;
    - `src/lib/documents/targets.ts:56` (and `targets.test.ts:67`).
  - **Revalidate-only:**
    - `src/app/awards/actions.ts:96-98`, `src/app/awards/[id]/routing-actions.ts:41`, `src/app/awards/[id]/non-award-actions.ts:41`;
    - `src/app/projects/[id]/actions.ts:106`, `src/app/approvals/actions.ts:286`, `src/app/committees/actions.ts:213`;
    - `src/app/suppliers/link-actions.ts:144`, `src/app/sourcing/[id]/bids/actions.ts:408`;
    - `src/app/configuration/awards/core.ts:42` [after stage B];
    - `src/lib/documents/owners.ts:94,110,239,260`.
  - **Tests and scripts:** `scripts/text-snapshot.mjs:45-46,88,92`, `src/components/shell/crumbs.test.ts:102-104`,
    `src/lib/portal/surface.test.ts:28`.
- **Risks:**
  - A redirect that leaks restricted awards. Today the award page returns 404 to an unnamed reader of a restricted exercise **before
    and after issue**. So `/awards/**` returns 404 unless `caseVisibility` is `WHOLE`. It never forwards a `CONTRACT_STAGES_ONLY` reader
    to the contract (AC-23: "404 exactly as today").
  - The text-snapshot crawl.
  - `crumbs.test.ts:102-104` and `surface.test.ts:28`.
  - Dead `revalidatePath('/awards…')` calls: remove them.

### P-1 — Kick-off meeting (AC-24) · M · schema · HELD
- **Today:** there is no contract meeting. The closest records are:
  - `IntegrityBriefing` (`schema.prisma:9636`, one per contract, after the fact);
  - `SiteMeeting` (In Delay only);
  - `SiteEvent` (pre-award).
- **Change:**
  - New `ProjectMeeting` and `ProjectMeetingAttendance` (§6.3).
  - Minutes are an attachment, with the new purpose `PROJECT_MEETING_MINUTES`.
  - Scheduling opens at EXECUTED (a new act-status row).
  - Kick-off only.
  - The act needs the S.O. office or an in-scope delegate (FR-SUP-004).
  - The officer records attendance.
  - The FR-CON-010 briefing is written by the meeting only if it is missing.
- **Files:** `prisma/schema.prisma` and a migration; `src/app/projects/[id]/{page,actions}.ts(x)`; `src/lib/contract/{sign,act-status}.ts`; `src/lib/documents/{owners,owner-facts,attach,types,labels,demo-wipe-plan}.ts`; `src/app/supplier/projects/[id]/{page,panels}.tsx`; `src/lib/portal/projects/{workspace-store,types}.ts`; `src/lib/auth/act-slots.ts`; `prisma/demo-supervision.ts`.
- **Risks:**
  - The `DocumentAttachment` one-owner and purpose CHECKs are replaced whole.
  - The demo-wipe plan must learn the new owner.

### P-2 — Teams (AC-25) · L · schema · HELD
- **Today:**
  - No per-contract membership exists.
  - On the contractor side, every active account of the awardee sees every contract (`portal/projects/visibility.ts:17-19`).
  - The S.O. is an office (`ContractSoAssignment`, `soOfficeOn`). Delegates are `SoDelegation` rows.
- **Change:**
  - New `ContractTeamMember` and `ContractTeamRequest`.
  - Derived staff Leads (S.O. holders and acting holders) and derived Reviewers or Viewers (delegates by scope).
  - A granted-only oversight permission. Administrators are refused.
  - A backfill makes each active awardee account a contractor Lead.
  - Membership gates **the exchange only**.
- **Files:** `prisma/schema.prisma` and a migration with the backfill; `src/lib/portal/projects/{visibility,context-store,list-store,submission-store,workspace-store}.ts`; `src/app/projects/[id]/{page,supervision-panels,supervision-actions}.tsx`; `src/lib/auth/{supplier-administration,act-slots,permissions}.ts`; `src/app/suppliers/actions.ts`; `src/app/_auth/supplier-reach.test.ts`; `src/lib/inbox/kinds.ts`; `prisma/demo-my-projects.ts`, `prisma/demo-supervision.ts`.
- **Risks:**
  - Narrowing contractor visibility without the backfill.
  - Locking out Finance, Legal or approvers if the gate leaks beyond the exchange.
  - `SupplierContact` is SULIT.
  - D6 identity check on account opening.
  - `supplier-reach.test.ts`.

### P-3 — Submit, review, approve (AC-26) · XL · schema · HELD
- **Today:** `ContractorSubmission` (`schema:12879`) is text only, with six kinds and one answer. The answer is given by
  `review-actions.ts:34-89`, guarded by `updateMany`.
- **Change:**
  - New `ProjectSubmission`, `ProjectSubmissionRevision` and `ProjectSubmissionComment` (§6.3), with files as attachments.
  - Rejected is final. There is no withdrawal.
  - Revisions are lettered A..Z, AA…
  - The answer seen by the contractor comes only from an S.O. holder or an in-scope delegate, checked at the act.
  - Internal comments are allowed.
  - Higher approval is a type setting. For the work programme it is Principal S.O.'s Rep after S.O. Rep scrutiny (FR-SUP-006). The
    document's "the S.O. approves" loses to the spec.
  - Staff may record a paper revision on the contractor's behalf.
- **Files:** `prisma/schema.prisma` and a migration (tables, write-once triggers, attachment CHECKs); new `src/lib/project-docs/**`; `src/lib/documents/{owners,owner-facts,attach,types,labels,entitlement}.ts`; `src/lib/documents/service.ts` (reused); `src/app/projects/[id]/` (new panels and actions); `src/app/supplier/projects/[id]/{page,panels}.tsx` and new upload, submit and file routes; `src/lib/auth/act-slots.ts`, `act-wiring-scan.test.ts`; `src/lib/supervision/load.ts` (`soOfficeOn`, reused).
- **Risks:**
  - Concurrent answers.
  - Lock order: contract, then submission, then document.
  - The `storeUpload` 60 s transaction on multi-file sends.
  - CAD formats in `media.ts`, to verify.
  - Act-slot wiring.

### P-4 — Register and targets (AC-27) · L · schema · HELD
- **Today:** there is no project document type. `ContractorSubmissionSetting` sets the service level per kind.
- **Change:**
  - New `ProjectDocumentType`, as configuration through the two-person path.
  - A per-contract register reader, with its filters as WHERE clauses.
  - Calendar days, labelled ASSUMED.
  - The target is snapshotted per revision. The clock runs only while the submission waits on RSAJ.
  - A type cannot be issued with its target or its higher-approval setting unset.
  - The cross-contract view is the "Submissions waiting" view with "Assigned to me".
- **Files:** `prisma/schema.prisma` and a migration; a new editor under `src/app/configuration/`; `src/lib/auth/configuration-change-words.ts` and the policy kinds; new `src/lib/project-docs/register.ts`; `src/app/projects/[id]/page.tsx`; `src/app/projects/page.tsx` (the view); `src/app/supplier/projects/[id]/panels.tsx`.
- **Risks:** configuration files conflict with the sealed-bids builder. Overdue is judged in the organisation's time zone.

### P-5 — Notices (AC-28) · L · schema · HELD
- **Today:** `StaffNotice` has a closed kind list mirrored by a CHECK, and only `readAt` may change. The supplier bell is off
  (`topbar.tsx:299-302`).
- **Change:**
  - New `SupplierNotice`, for Part 2 kinds only.
  - A portal inbox, and the bell turned on.
  - New staff kinds.
  - Recipients per AC-28.
  - Overdue is written when the register is read, with `occurrence` set to the due day.
- **Files:** `prisma/schema.prisma` and a migration (table, kind CHECKs, readAt-only trigger); `src/lib/inbox/{kinds,notices,store}.ts`; new `src/lib/portal/inbox/**` and `src/app/supplier/inbox/**`; `src/components/shell/topbar.tsx`; `src/lib/portal/nav.ts`; `src/app/supplier/page.tsx`.
- **Risks:**
  - `kinds.ts` and the CHECK change together.
  - No SULIT figures or other contractors' names in a notice.
  - Flood bounds.

### P-6 — Kept and traceable (AC-29) · M · schema · HELD
- **Today:** ADR 0011 gives immutable versions, `DocumentAccessEvent` with the supplier actor, media sniffing, policy limits and
  `NOT_SCANNED`.
- **Change:**
  - Two new owner keys.
  - A contractor read rule: only files the contractor submitted, or files sent to it.
  - A contractor download route.
  - A per-contract upload bound, refused while unset.
  - Retention from the type's class.
  - "Not scanned" shown.
- **Files:** `src/lib/documents/{owners,owner-facts,entitlement,access,media,limits,demo-wipe-plan}.ts`; `src/lib/contract/load.ts` (`contractHistory`); a new file route under `src/app/supplier/projects/`; `prisma/schema.prisma` and a migration.
- **Risks:** widening SULIT (it must not widen), and OD-4.

### P-7 — The six kinds move in (AC-30) · L · schema · HELD
- **Today:** `ContractorSubmissionKind` (`schema:12839`) and `KIND_SHAPE`. The statutory declaration has a password step-up and
  `contractorSigningFaultOf`.
- **Change:**
  - The six become system types with their own answer sets:
    - delay notice and declaration: ACKNOWLEDGE only;
    - claim, materials and defects rectified: TAKEN_UP or RETURNED;
    - work programme: the four answers plus higher approval.
  - The structured fields, the step-up and the server-stamped "sent on" stay.
  - Legacy rows are kept read-only and are **not migrated**. Migrating them was considered and rejected.
  - The bridge (MN-02) retires.
- **Files:** `prisma/schema.prisma` and a migration (system types only; no data migration); `src/lib/portal/projects/{submission,submission-store,review-store,workspace-store,labels,types}.ts`; `src/app/supplier/projects/submit/route.ts`; `src/app/supplier/projects/[id]/{controls,panels}.tsx`; `src/app/documents/review-{actions,editors}.ts(x)`; `src/lib/inbox/notices.ts`; `src/lib/auth/act-slots.ts`; `prisma/demo-my-projects.ts`.
- **Risks:**
  - The claim day drives the `InterimValuation` CLAIM trigger.
  - The FR-EOT-001 time limit.
  - `ActAttribution` keeps resolving because the rows stay.

### V-1 — PO number and online return (AC-5, AC-31) · M · schema
- **Today:**
  - The commitment number is typed by an officer (`awards/actions.ts:718-737`).
  - The return is on paper, with scans (`stage-two.ts:108-111`, OD-5).
  - The portal overview does not show the commitment number.
- **Change:**
  - Show `erpCommitmentNo` and its kind on the case and in the portal, when recorded.
  - Add an **online return**. The signing-authority account, with a password step-up:
    - uploads the signed letter, the declaration and the authorisation (or the acceptance page), with witness and stamp;
    - types in the page's fields.
  - The return completes only when an officer verifies the scans.
  - Add `AwardQuery`, for comments and questions. There is no accept-with-changes and no online decline. A query does not pause the
    14 days.
  - Click-only acceptance sits behind an unset switch.
- **Files:** `prisma/schema.prisma` and a migration; `src/lib/award/{stage-two,return-acceptance,evaluate,indent,commencement}.ts`; the case page's Award stage panels; `src/lib/portal/projects/{workspace-store,signing-store}.ts`; new routes under `src/app/supplier/projects/`; `src/lib/auth/act-slots.ts`; `src/lib/inbox/kinds.ts`.
- **Risks:**
  - The FR-AWD-003/008 hybrid rule.
  - The indent and commencement clocks read the acceptance day.

### V-2 — RFQ and bidding (AC-32) · S · no schema
- **Change:**
  - None beyond waves 3b and 3c.
  - Record a log entry "covered" only once 3c lands.
  - Online quotations use the sealed path when the exercise is pinned online (G1).
  - There is no unsealed RFQ (FR-BID-001).
- **Files:** `docs/notes/decisions-log.md` (the log line only, once 3c lands).

### V-3 — Supply invoicing (AC-6, AC-33) · L · schema · design only this round
- **Today:**
  - Works are paid on certificates and `FinancePayment` (one per certificate).
  - Supply has no Delivery Order or invoice model.
  - `ContractType.interimPaymentRule` is free text.
- **Change:**
  - Deferred to Part 3's design.
  - It must reconcile BD-613-128: any typed payment route is nullable and shown as unset.
  - A supply claim is recorded and shown only. Goods received is recorded in the ERP. Payment status is entered by hand.
- **Files:** Named in Part 3's design: `prisma/schema.prisma`, `src/lib/method/{types,labels,fixture}.ts`, the contract-types editor, a new supply-claim store, `src/app/projects/[id]/payment-panels.tsx`, `src/lib/portal/projects/workspace-store.ts`, `src/app/supplier/projects/[id]/panels.tsx`, `src/lib/documents/{owners,types}.ts`, `prisma/demo-payment.ts`.

## 3. What is removed, and what must keep working

- **Redirects, kept permanently:**

  | From | To | Kind |
  | --- | --- | --- |
  | `/awards`, `/awards/[id]`, `/awards/new` | the case | guarded, temporary |
  | `/securities` | `/projects?view=securities` | temporary |
  | `/documents` | `/projects?view=submissions` (`?tab=review`), else `/projects` | permanent |

- **Comparators.**
  - `scripts/compare-screen.mjs` `DECIDED_ABSENT` gets one entry per removed card or panel, each citing its item:
    - Value approved and Votes outstanding (GN-03);
    - Open my steps and Delivery (GN-05);
    - the Securities and Documents screens (MN-01, MN-02);
    - the Awards list (C-1).
- **Text snapshots.**
  - Take one before and after each wave of `/`, `/inbox`, `/projects` with every `view=`, a pre-issue case, an issued case and a
    signed case.
  - Diff them: no field, warning or provenance tag may drop unless an item names it.
- **Scans** are re-pointed and never weakened. Each change carries a comment citing its item (AC-20).

## 4. Rulings

Verbatim from the product owner (for the founder), 2026-10-14.

**Award and Contract Requirements v2: product-owner rulings for the founder, 2026-10-14**

The six spec Musts the document would otherwise break are each given a compliant reading. Those readings are in AC-31 to AC-34, and the most important ones are AC-15 and AC-33.

### AC-0. Authority and standing
- **Order of authority** (design note 0003 §6): the document first, then the spec, then earlier rulings, then the honest default.
- The document overrides only what it names. A spec Must it does not name stays binding.
- **Status of the document.** It is a BA draft "for confirmation". Its §5 recommendations are adopted here by the product owner for the founder. Neither the founder nor CPD has answered them, so log them that way (the same pattern as 0003 G6).
- **Build order** (doc §6):
  1. Sealed bids, waves 3b and 3c.
  2. GN-01 to GN-05, MN-01, MN-02.
  3. Part 1.
  4. Part 2 (held, see AC-7).
  5. Part 3.
- **Files the sealed-bids builder is changing.** `src/lib/nav.ts`, `src/app/configuration/**`, the policy and configuration-words files, and `src/app/sourcing/[id]/page.tsx` are not edited until stage B is committed.

### Section 5 decisions
- **AC-1 (Decision 1): merge Awards into Contracts. Yes.**
  - Screens merge. Award and Contract records stay as they are, 1:1 (ADR 0007).
  - `issueAward` stays the only place a Contract row is created (FR-CON-002).
  - No schema change in Part 1.
- **AC-2 (Decision 2): naming.**
  - The menu says **Contracts**. The workspace stage and tab is **Project**.
  - URLs stay `/projects/**` this round. A URL rename would mean a second set of permanent redirects for no benefit.
  - Codes never appear on screen.
- **AC-3 (Decision 3): Securities. Remove the menu (MN-01).**
  - The 14 Oct draft that kept a read-only register was the developer's draft, marked "not approved for building". It was never a ruling, so nothing is overturned.
  - However, FR-AWD-012 (M) says "expiry alerts fire at configurable intervals", and nothing is emailed (INT-09). If the menu simply goes, an expiry only surfaces when someone opens each contract, which fails the intent of that Must.
  - So MN-01 must include an organisation-wide **"Securities expiring or not verified"** view on the Contracts list (AC-15). It is not optional.
- **AC-4 (Decision 4): letters, routing sheets and templates.**
  - Generated letters and certificates stay on their case. Award letters go to the Award stage; certificates to the contract's Documents tab.
  - Regret letters stay on the sourcing exercise (C-5).
  - Routing sheets stay on their certificate (`?tab=routing`). The pre-award sheet goes to the Award stage.
  - Templates and routing-sheet types are already in Configuration, so nothing moves there.
  - The organisation-wide Library search is dropped (AC-16).
- **AC-5 (Decision 5): purchase orders (V-1). Yes, with the compliant reading in AC-31.**
  - Show the PO or indent number from D365.
  - The contractor can accept and query online. "Accept with changes" is not offered; changes go through a variation (FR-CON-004).
  - The online return does not replace the wet signature, witness or stamp until RSAJ rules on electronic signature.
- **AC-6 (Decision 6): invoicing (V-3). Yes, in direction.**
  - Works and services are paid on certified claims; supply on a Delivery Order plus invoice.
  - Payment stays in D365 (§7.4, scope register row 39).
  - The detailed design waits for Part 3 (AC-35).
- **AC-7 (Decision 7): CPD sign-off on Part 2. Yes, the Part 2 build is held.**
  - Meanwhile, these are built: GN-01 to GN-05, MN-01, MN-02 (including the submissions bridge in AC-16) and Part 1.
  - Part 2 is designed only: an ADR and a plan, with no migrations and no code.
  - The C-2 Project stage holds today's tabs until then.
  - Part 2's build starts only when the founder records, in the decisions log, **CPD's written sign-off of P-1 to P-7 as [NET-NEW]**. Scope register row 26 recommends exactly this: "Recommend RSAJ sign-off as [NET-NEW]". The record should give the signer's name, the date and the document version.
  - **What the founder must obtain from CPD:**
    - the sign-off itself;
    - calendar or working days for review targets (AC-27);
    - whether contractors may receive SULIT documents through the exchange (AC-29);
    - the first document types, with their targets, higher approver and answer set (AC-26, AC-27, AC-30);
    - who on the RSAJ side approves requests to add contractor members (AC-25).
- **AC-8 (Decision 8): sign-in target.**
  - **Target:** from pressing **Sign in** to the dashboard's header and stat cards painted:
    - **2.0 s or less at the median;**
    - **3.0 s or less at the 95th percentile.** That is NFR-PRF-001's ceiling, which is a Must and cannot be loosened.
  - **How it is measured:**
    - on `next build && next start` against the demo database;
    - after one discarded warm-up sign-in following each server start;
    - 20 consecutive sign-ins, using the demo officer with the longest worklist;
    - Chrome DevTools Performance or Network, unthrottled, from a machine on the office network (localhost if that is the only server);
    - one 20-run set under the "Fast 4G" preset is reported but not judged.
  - **Structural check:** exactly one server navigation after the action, with no duplicate `?_rsc=` requests.
  - **Excluded:** the first sign-in on `next dev` after a restart, because that time is Turbopack compiling, not the product. Report that number to the founder separately, because it is what he actually sees.
  - The load test at an agreed concurrency stays a go-live test (NFR-PRF-001). RSAJ must give the concurrency.
  - Record the before and after numbers per phase in the log.

### General fixes
- **AC-9 (GN-01): measure first, then fix in the mapper's order.**
  - **(a) One navigation.** Either call `redirect` inside the action or drop `router.refresh()`. In both cases:
    - redeem-code and password-change keep their current destinations;
    - `sign-in-actions-scan` and `auth-reach` keep their intent;
    - session-fixation handling (`replacingToken`) does not change;
    - `SignInNotices` stays on the landing dashboard. Since the founder's change of 2026-10-08 it carries ruling O-2's control.
  - **(b) `loadDashboard`.** Run its independent reads together, read the time zone once, and stop loading every decision with its votes. The hidden-exercise filters stay (FR-MTD-007).
  - **(c) SULIT gates.** Run them in parallel; they still log before any value is shown (NFR-AUD-004).
  - **(d) Shell count.** A slimmer count is allowed only with a test proving it equals `waitingForCount(myStepsOf(…))` on the same fixtures. Otherwise keep the shared `requestWorklist` reading.
  - **(e) scrypt.** No change (ADR 0034 D3).
- **AC-10 (GN-02): "Back to the dashboard".**
  - It goes into `PageHeader` `actions`, as a secondary or ghost `ButtonLink` with a back-arrow icon added to `icons.tsx`.
  - The bottom copy is removed; there is one link only.
  - It is the header-action pattern already used by the dashboard and inbox.
- **AC-11 (GN-03): the "Awaiting a decision" card.**
  - It becomes **personal**: the same number as the My approvals badge, from the same reading (`myStepsOf` / `waitingForCount`). It links to `/approvals?tab=mine`.
  - Label it "Awaiting my decision".
  - Reason: GN-04's done-when ("each count matches the page it opens") and the Phase 3c ruling (one reading for both).
  - Committee votes are still not counted. A committee's step is nobody's personal step (3c). If that ever changes, the page and the count change together.
  - Remove the Value approved and Votes outstanding cards, and their SULIT gate and sums. No Must requires them.
  - Remove the subtitle line; keep the meta.
  - Remove the "Documents awaiting my review" promise from the "On the way" card, because Part 2 is held (AGENTS.md: nothing looks finished that is not).
- **AC-12 (GN-03): the pipeline cards.**
  - There are three: **Requisitions**, **Sourcing**, **Contracts** (one card, because C-1 merges awards into contracts).
  - The status sets and stage function are pure, in `src/lib` with tests. The Contracts card uses the same `caseStage` as the C-1 list, so each item is counted in exactly one place.
  - **Requisitions:** ENDORSED, REGISTERED, BUDGET_CHECKED, OVER_BUDGET, PENDING_APPROVAL, APPROVED, RETURNED, RECALLED.
    - Drafts are not counted, because they have not been raised.
    - SOURCING and PARTIALLY_FULFILLED count only under Sourcing.
    - The ended statuses are excluded.
    - Hint: "n approved, waiting for sourcing · n back with the requester".
  - **Sourcing:** exercises not CANCELLED that have no live (non-cancelled) award. Hidden exercises are filtered out. The hint keeps `phaseSummary`.
  - **Contracts:** cases in Awarding, Signing or On site (AC-17). Completed and Closed are left out. The hint gives the split by stage. The restricted rule in AC-18 applies.
  - All counts are database count queries.
- **AC-13 (GN-04): the side-menu counts.**
  - Remove the `/` count and its query from `loadShell`. This also closes its FR-MTD-007 leak: it counted restricted matters.
  - My approvals and Inbox keep today's readings.
  - No badge when the count is zero, as today. The 3c ruling stands: committee votes and barred steps are not counted, and an administrator who holds no office sees none.
  - Every act that changes a person's steps, or marks a notice read (including on opening `/inbox/[id]`), refreshes the layout with `revalidatePath('/', 'layout')`. Check this in a browser.
- **AC-14 (GN-05): the Inbox.**
  - Remove "Open my steps" and the Delivery Callout.
  - Keep the header, its counts and "Mark all as read".
  - This replaces the 2026-10-06 rule (log line 1515) and Phase 3c's "every screen" clause, **for `/inbox` only**.
  - The fact that notices are not sent stays as one short clause in the subtitle (for example "Notices appear here only; they are not emailed."), because a notice must not look delivered when it was not (AGENTS.md, gaps stay honest).
  - `NOTICE_DELIVERY_STATEMENT` stays on its other screens.

### Menu clean-up
- **AC-15 (MN-01): remove the Securities menu.**
  - Remove the nav item.
  - `/securities` becomes a redirect to the Contracts list's **"Securities expiring or not verified"** view. That view is built on `listRegister`'s queries and counts, with the hidden-exercise filter, and shows expiry chips. Rows open the contract's securities.
  - The contract's securities panel gains:
    - `expiryAlert` chips;
    - a "lodged, not verified" marker;
    - the "Reminders at N days" line, so the configured intervals stay visible.
  - Reason: FR-AWD-012 (M).
- **AC-16 (MN-02): remove the Documents menu.**
  - Remove the nav item and **only** `src/app/documents/page.tsx`. `actions.ts`, `review-actions.ts` and `review-editors.tsx` stay.
  - `/documents` redirects **permanently**, because `StaffNotice.href` rows cannot be changed:
    - `?tab=review` goes to the Contracts list's "Submissions waiting" view;
    - everything else goes to `/projects`.
  - **The bridge ships with MN-02, not after it:** a **Submissions** tab in each contract's Project stage, using `loadReviewQueue` filtered by contract and the same `AnswerDrawer`, plus the "Submissions waiting" view (with an overdue count) on the Contracts list.
    - Reason: FR-SUP-006 and 009 (M) flows need somewhere to be answered, and while Part 2 is held this bridge may be permanent.
    - New notices link to the contract's tab.
    - These counts do not join My approvals: a submission is not an approval step.
  - The contract's Documents tab gains "n copies not sent" and "n routing sheets open (m past target)" with links. Reason: FR-CRT-006 and 008 are kept per item.
  - **Documents that belong to no contract** stay where they are:
    - sourcing files on the exercise;
    - regret letters on the exercise;
    - supplier documents on the supplier;
    - received-not-filed uploads and legal holds in Configuration › Documents.
  - The `read.ts` fallback for an ownerless document points to `/configuration/documents`.
  - BD-614-30 and 31 are superseded where they place things on `/documents`. Their duties survive as above.
  - Losing the Library's alias search leaves FR-CRT-011 (S) partly met. Logged.

### Part 1
- **AC-17 (C-1): the case list.**
  - One list built from `Award` LEFT JOIN `Contract`; each Award is one case. DRAFT awards are included ("from the moment an award is started"), visible as the Awards list is today.
  - Paging and counts run in the database. Sort is by award `createdAt` descending, then by id.
  - `caseStage(award, contract, commencement)` is pure and tested:
    - **Awarding:** until the award is ACCEPTED. An ISSUED award stays here even while preparation runs.
    - **Signing:** from ACCEPTED to before ACTIVE.
    - **On site:** ACTIVE and its derived stages. **For a work indent, "On site" also begins when commencement is recorded**, because the contract code has no indent branch and possession may never be written.
    - **Completed:** PRACTICALLY_COMPLETE, MAKING_GOOD_COMPLETE, FINAL_CERTIFICATE_ISSUED.
    - **Closed:** CLOSED.
  - A sixth view, **"Cancelled or terminated"**, sits outside the five stages. It covers awards cancelled before issue, contracts CANCELLED (the number kept as a gap) and contracts TERMINATED, each with its badge.
  - The list carries the awards list's useful chips and keeps the In Delay and Commenced-pending-approval views.
  - Whether an indent case goes through contract formation at all is a question for RSAJ (it relates to OQ-11). The bar does not invent an exemption.
- **AC-18 (FR-MTD-007 on merged cases): keep today's split exactly, as one pure `caseVisibility` rule.** This is reversible.
  - **Before issue,** a case from a restricted exercise is hidden from anyone not named on it: left out of lists and counts, 404 by id, and the refusal logged.
  - **After issue,** its Award stage stays refused and logged, while its contract stages stay visible as Contracts are today.
  - The rule is enforced before the C-6 redirect, and in every act that moves.
  - Whether a contract formed from a restricted exercise is itself restricted (the open point in `repo.ts:137` and ADR 0034) goes to RSAJ.
- **AC-19 (C-2): the case page.**
  - It is `/projects/[id]`. The resolver tries a Contract (by id and organisation), then an Award:
    - if the award has a contract, redirect to the contract's URL, keeping the query parameters;
    - if not, render the Award stage only, and skip every contract-only reader.
  - Sub-routes stay keyed by contract id.
  - **The step bar** uses the shared `Stepper` (extend it if needed). Each step shows its own state (done, in progress, waiting or parked), derived from the existing gates. Stages may run in parallel (FR-CON-008: "preparation may continue while the gate is red").
  - The step opened by default is the earliest one with something to do. Each step has a "What's next" line and one main button, taken from the existing gates and header actions.
  - **Tab mapping:**
    - **Award:** overview, approval, letter, distribution, return, routing sheet.
    - **Before signing:** conditions, securities and insurance.
    - **Signing:** formation, baseline.
    - **Project:** team, site, payments, variations, documents, submissions.
    - **History:** at case level.
  - **Close-out** is greyed out with "Parked until after go-live" and no button. Records already made stay readable where they are.
  - **SULIT and loading:** each panel keeps its own gates: the award gates for award panels, `contract` for contract panels. Each step loads its own data.
  - **Start the award** stays on the exercise. Its form moves to `/projects/new?exercise=`, and `createAward` lands on the case.
  - **Indent cases:** the main button is "Record commencement" when `commencementState` says it is due.
- **AC-20 (C-3): the rules that must stay.**
  - No rule changes.
  - The C-3 table is a minimum. Every Must enforced today on either page stays: FR-AWD-001 to 009 and 012 to 014, FR-CON-001 to 014, FR-EVL-014, FR-MTD-007, NFR-AUD-004.
  - Scan tests are re-pointed only, never weakened, and each change cites C-3.
  - FR-AWD-001 is enforced as the configured route plus a committee step. Unchanged, not reopened.
  - 14 days and 7 days stay `AwardPolicy` configuration.
    - The demo seed moves to 14 and 7 (spec-stated) unless a test pins 10 and 5; if one does, say why.
    - RSAJ's own values go in through Configuration's two-person path.
  - **FR-AWD-006's "alert to both the user department and C&P" (M) is shown on screen only today.** C-3 does not keep it, because it was never met.
    - Logged as a carried gap.
    - A staff notice for indent expiry or late commencement is a small staff-side item after Part 1. It does not wait for CPD. It is written when the case is read (the STEP_ESCALATED precedent), and its recipients are ruled in that design.
- **AC-21 (C-4): bond and insurance on the contract.**
  - Only **lodging and verifying** move to Before signing. The bond decision, its basis and percentage, the sums insured and the WC basis stay as award terms in the Award stage, because they are printed in the letter. Before signing shows them read-only.
  - **The acts stay in `src/app/awards/actions.ts`** (mapper's option b). That keeps `withLockedAwardFor`'s FR-MTD-007 refusal, the lock order, act-slots and record-operations unchanged. Only the screens move.
  - Lodging only after issue is accepted (ADR 0007). A bond taken before the letter would be a question for RSAJ.
  - The panel stays reachable in later stages, for advance-payment guarantees and retention bonds, from a Project-stage summary.
  - Expiry reminders are shown, not sent (AC-15).
- **AC-22 (C-5): regret letters.**
  - A "Notices to unsuccessful tenderers" section on the exercise's Award tab, for the live award (ISSUED or ACCEPTED). Notices may still be issued only once the award stands.
  - Notices under cancelled awards are shown read-only as an earlier record.
  - Same locks and gates as today (`exerciseIsHidden` plus SULIT).
  - FR-AWD-011 belongs on the exercise when it is built; it is not in this round.
  - This waits until sealed bids are committed.
- **AC-23 (C-6): old links.**
  - `/awards/**` become server redirects that run `requireStaff`, then the organisation lookup and the restricted check, and 404 exactly as today.
  - They use `redirect()` (temporary), because the target depends on the record's state.
  - `?tab` maps to stage and tab. `notices` goes to the exercise.
  - A link without a tab opens the case's default step.
  - An old link to a cancelled award opens its own case.
  - `/awards/new` goes to `/projects/new`.
  - The print views stay at their URLs; only their back links change.
  - Every code link goes through one helper, `caseHref`.
  - The redirects are kept permanently, because of `StaffNotice` rows.
  - `/configuration/awards` is untouched.

### Part 2 design rulings (subject to AC-7)
- **AC-24 (P-1): the kick-off meeting.**
  - Scheduling opens at EXECUTED (the RSAJ signature, FR-CON-009). It is a new act-status row, ruled here.
  - Kick-off only; routine progress meetings are not built.
  - Scheduling and recording are communication with the contractor, so they need the S.O. office or a delegate whose scope includes contractor communication (FR-SUP-004).
  - Attendance is recorded by the officer. There is no online RSVP and no contractor acknowledgement of the minutes.
  - An online link is plain text, with no calendar.
  - The FR-CON-010 briefing can still be recorded at signing, and stays so. The meeting may record it only if it is not yet recorded. `briefingMissing` is not weakened.
- **AC-25 (P-2): teams.**
  - "Only team members" covers **the Part 2 exchange (meetings, submissions, register, files) only**. If it covered the whole case page, it would lock out Finance, Legal, C&P and approvers (FR-CON-006, FR-FIN, FR-APR).
  - **Staff members.** The S.O. office holders and acting holders are derived Leads. In-force delegates are derived Reviewers or Viewers, according to their scope. Other staff are stored members.
  - Oversight is a new granted-only permission that is undecided by default. Administrators are refused.
  - **Contractor members.** The first contractor Lead is set by staff who hold `supplierAccounts.manage`. At go-live, a backfill makes each active awardee account a Lead.
  - **Adding contractor people.** A request is approved by `supplierAccounts.manage`, with the ADR 0034 D6 identity check kept. A contractor Lead may remove members from the team but cannot disable accounts.
  - Submitter does not grant signing authority (`authorisedToSignForContractor` and the organisation switch still apply).
  - A person who works for two suppliers needs two accounts. Accepted.
- **AC-26 (P-3): the review flow.**
  - **Answers:**
    - Approved with comments closes the review.
    - Rejected is final; the contractor raises a new number.
    - Contractors cannot withdraw a revision.
    - Revisions are lettered Z, then AA, from a pure, tested function.
  - **Reviewers.** One per submission, assigned by the S.O. or the staff Lead.
    - **The answer the contractor sees must come from an S.O. office holder or an in-scope delegate, checked at the moment of the act (FR-SUP-004, M).**
    - Other Reviewers comment or recommend only.
    - Internal comments are allowed and never shown in the portal.
  - **Higher approval** is a setting on the document type. For the work programme it follows FR-SUP-006 (M): scrutiny by the S.O. Representative, then approval by the Principal S.O.'s Representative. **The spec wins over the document's "the S.O. approves".**
  - The final answer replaces the recommendation.
  - Staff may record a revision received on paper, marked as recorded on the contractor's behalf (the spec's hybrid model, line 4654).
  - Reviewers may attach marked-up files.
  - The exchange opens at EXECUTED.
  - Whether an approved work programme becomes the `WorkProgramme` record in the same act is settled in the Part 2 ADR. The rule is one source of truth.
- **AC-27 (P-4): the register and review targets.**
  - Calendar days, labelled ASSUMED, until CPD answers.
  - The target is snapshotted on each revision when it is sent. The clock runs only while the submission waits on RSAJ. "Overdue" means late on RSAJ's side only.
  - A type must set its target (a number, or an explicit "no target") and its higher-approval setting before it can be issued through the two-person path. So an unset value never reaches a submission, and a contractual notice is never refused.
  - No per-contract override.
  - The cross-contract view is the "Submissions waiting" list view (AC-16) with an "assigned to me" filter.
  - No export.
- **AC-28 (P-5): notices.**
  - **Recipients:**
    - submitted: the assigned reviewer, or else the S.O. holders;
    - passed on: the higher approver's holders;
    - answered: the contractor Lead and the submitter;
    - RSAJ sent a document: all contractor members;
    - acknowledged: the sender;
    - overdue: the reviewer and the staff Lead, once per due day.
  - Overdue is written when the register is read (the STEP_ESCALATED precedent). A real scheduler is a go-live item.
  - A `SupplierNotice` table carries Part 2 kinds only. Pre-award supplier notices are out.
  - Read state is per account.
  - Retention follows NFR-RET, which RSAJ has not set.
- **AC-29 (P-6): files and SULIT.**
  - A contractor member may read files they submitted, or files RSAJ deliberately sent them, logged with the supplier as the actor.
  - Nothing internal reaches the contractor. Otherwise SULIT is unchanged.
  - Uploads are logged by audit CREATE rows; downloads by `DocumentAccessEvent`.
  - Virus scanning stays a go-live condition, as OD-4 already sets it. Until then staff download as attachment only, and the screen says "not scanned".
  - Contractors do not see the access log.
  - Retention comes from the type's document class.
  - A per-contract bound is required. If unset, contractor uploads are refused, and the screen says the setting is unset.
- **AC-30 (P-7): moving the six contractor submissions in.**
  - The six kinds become system types with their own answer sets:
    - delay notice and statutory declaration: acknowledge only (FR-EOT-001 time limit; a declaration is not "approved");
    - claims, materials and defects rectified: taken up or returned;
    - work programme: the four answers plus higher approval.
  - The structured fields, the declaration's password step-up and signing checks, and the server-stamped "sent on" day all stay.
  - Existing `ContractorSubmission` rows stay as a read-only earlier record. They are not migrated, so `ActAttribution` rows keep resolving.

### Part 3
- **AC-31 (V-1): online acceptance.**
  - **"Replaces the paper acceptance" would break FR-AWD-008 (M) and FR-AWD-003 (M).** The spec (line 4654) says no SOP authorises electronic signature, and requires the hybrid: the wet signature captured as a scan.
  - **Compliant reading: an online return.**
    - The account with signing authority, after re-entering its password, uploads the signed letter, the declaration and the Surat Pewakilan Kuasa (or the indent's acceptance page), with witness and stamp, and types in the page's fields.
    - The return is complete only when an officer verifies the scans (OD-5).
  - Acceptance with no scans sits behind an unset organisation switch until CPD and Legal rule on electronic signature.
  - The contractor accepts the LoA or indent, not the ERP PO.
  - The PO number is shown when recorded; it is not a precondition.
  - A query does not pause the indent's 14 days.
  - There is no online decline.
- **AC-32 (V-2): RFQ and bidding.**
  - Waves 3b and 3c are the vehicle. Not recorded as "covered" until 3c lands.
  - Online quotations use the same sealed path when the exercise is pinned to online (G1).
  - A lighter unsealed RFQ is not built (FR-BID-001, M).
- **AC-33 (V-3): supply invoicing.**
  - Deferred to Part 3's design.
  - It must reconcile with BD-613-128 (ContractType is not split piecemeal). A typed payment route would be nullable and shown as unset.
  - A supply claim is recorded and shown only: no matching, no approval, payment status entered by hand.
  - Goods received is recorded in the ERP.
  - The contractor sees certificates only once issued, as today.

### Cross-checks
- **AC-34. The six places where the document would break a spec Must, with the compliant reading for each:**
  - V-1 vs FR-AWD-003/008 (AC-31);
  - P-2/P-3 reviewers vs FR-SUP-004 (AC-26);
  - P-3 "S.O. approves" vs FR-SUP-006 (AC-26);
  - P-2 "only team members" vs the Finance, Legal and approval Musts (AC-25);
  - MN-01 vs FR-AWD-012 (AC-15);
  - MN-02 vs FR-SUP-006/009 (AC-16).
- **Points that are not breaches:**
  - C-3 does not keep FR-AWD-006's alert, which was never met; logged (AC-20).
  - The merge forces an FR-MTD-007 ruling (AC-18).
  - FR-CON-010 is an S; the briefing record stays (AC-24).
  - FR-CRT-011 is an S; its search is dropped and logged (AC-16).
- **AC-35. Sequencing.**
  - Part 3 starts after Part 2, or after CPD declines Part 2.
  - Each part is designed, built, reviewed for code and security, then fixed.

**Decisions-log lines**
- 2026-10-14 · Product owner (for the founder): Award and Contract v2 (BA draft, 14 Oct) adopted. Order: document, then spec, then earlier rulings, then honest default. The document supersedes only what it names; unnamed spec Musts stay binding. Its §5 recommendations are the product owner's adoption for the founder, not answers from the founder or CPD (AC-0).
- 2026-10-14 · Product owner (for the founder): Award and Contract v2 D1: Awards merges into Contracts as screens only; records stay 1:1; issueAward is the only Contract creator (FR-CON-002, ADR 0007). D2: the menu says Contracts, the workspace is Project, URLs stay /projects (AC-1, AC-2).
- 2026-10-14 · Product owner (for the founder): Award and Contract v2 D3/MN-01: the Securities menu goes, superseding the developer's unapproved 14 Oct draft. /securities redirects to a Contracts-list "Securities expiring or not verified" view, with hidden-exercise filter and expiry chips. The contract panel shows the chips, the "not verified" marker and the reminder days. Required by FR-AWD-012 (M) (AC-3, AC-15).
- 2026-10-14 · Product owner (for the founder): Award and Contract v2 D4/MN-02: only documents/page.tsx goes, and /documents redirects permanently (StaffNotice hrefs cannot change). The per-contract Submissions tab and the "Submissions waiting" list view ship with MN-02 (FR-SUP-006/009). Copies-not-sent and routing-sheet counts move to the contract's Documents tab. Unowned documents stay where they live. BD-614-30/31 are superseded for placement. FR-CRT-011 (S) alias search is dropped and partly met (AC-4, AC-16).
- 2026-10-14 · Product owner (for the founder): Award and Contract v2 D5/V-1: online return, not click-only acceptance. The signing-authority account, with the password asked again, uploads the signed scans and types the acceptance-page fields; the return completes on officer verification (OD-5). Click-only acceptance sits behind an unset switch pending a CPD and Legal e-signature ruling (FR-AWD-003/008 M, spec hybrid rule). No accept-with-changes (FR-CON-004) (AC-5, AC-31).
- 2026-10-14 · Product owner (for the founder): Award and Contract v2 D6/V-3: works and services on certified claims, supply on DO plus invoice, recorded and shown only. Payment stays in D365. The design waits for Part 3 and must reconcile BD-613-128 (AC-6, AC-33).
- 2026-10-14 · Product owner (for the founder): Award and Contract v2 D7: Part 2 build HELD until the founder records CPD's written [NET-NEW] sign-off of P-1 to P-7 (scope register row 26), with the policy answers in AC-7. Meanwhile GN, MN and Part 1 are built, Part 2 is designed only (no migrations), and the Project stage holds today's tabs (AC-7).
- 2026-10-14 · Product owner (for the founder): Award and Contract v2 D8/GN-01: sign-in target ≤2.0 s median and ≤3.0 s p95 (NFR-PRF-001) from pressing Sign in to the dashboard header and cards painted. Measured on next build/start, warm, 20 runs, unthrottled office network, with Fast 4G reported only. Exactly one navigation after the action. Cold next dev is excluded but reported. scrypt unchanged (ADR 0034 D3). Fix order a–d as AC-9. SignInNotices stays (O-2, founder 2026-10-08) (AC-8, AC-9).
- 2026-10-14 · Product owner (for the founder): Award and Contract v2 GN-02: "Back to the dashboard" moves into the PageHeader actions; one copy only (AC-10).
- 2026-10-14 · Product owner (for the founder): Award and Contract v2 GN-03: the decision card is personal, using the My approvals reading, labelled "Awaiting my decision", linking to /approvals?tab=mine. Committee votes are not counted (3c). Value approved, Votes outstanding, the subtitle and the Part 2 promise in "On the way" are removed. Pipeline cards: Requisitions (ENDORSED to APPROVED plus RETURNED and RECALLED, no drafts), Sourcing (not cancelled, no live award), Contracts (Awarding, Signing and On site through the shared caseStage) (AC-11, AC-12).
- 2026-10-14 · Product owner (for the founder): Award and Contract v2 GN-04: the / badge and its count query are removed, which also closes an FR-MTD-007 leak. The My approvals and Inbox readings are unchanged. Every step-changing or notice-reading act revalidates the layout, checked in a browser (AC-13).
- 2026-10-14 · Product owner (for the founder): Award and Contract v2 GN-05: "Open my steps" and the Delivery box leave /inbox. The INT-09 fact stays as one subtitle clause. This supersedes the 2026-10-06 and Phase 3c every-screen statement for /inbox only (AC-14).
- 2026-10-14 · Product owner (for the founder): Award and Contract v2 C-1: one case list from Award LEFT JOIN Contract, drafts included. caseStage is pure and tested: Awarding until ACCEPTED; Signing until ACTIVE; On site at ACTIVE or, for a work indent, at recorded commencement; Completed; Closed. Plus a "Cancelled or terminated" view. Whether indents go through formation is a question to RSAJ (AC-17).
- 2026-10-14 · Product owner (for the founder): Award and Contract v2 FR-MTD-007 on merged cases: today's split is kept in one reversible caseVisibility rule. A restricted case is hidden before issue; after issue its Award stage is refused and logged while its contract stages stay as today. Enforced before the C-6 redirects. Whether the contract itself is restricted goes to RSAJ (AC-18).
- 2026-10-14 · Product owner (for the founder): Award and Contract v2 C-2: the case page is /projects/[id] (contract, else award, and redirect once a contract exists). The shared Stepper shows parallel step states derived from the existing gates. Tabs are mapped to stages, Close-out is parked, each panel keeps its own SULIT gate, and Start the award stays on the exercise with its form at /projects/new (AC-19).
- 2026-10-14 · Product owner (for the founder): Award and Contract v2 C-3: no rule changes. The table is a minimum and every enforced Must stays. Scans are re-pointed, not weakened. Demo uses 14/7 days. FR-AWD-006's "alert to both" (M) is a carried gap: shown only, never sent. A staff notice comes after Part 1 and is not held by D7 (AC-20).
- 2026-10-14 · Product owner (for the founder): Award and Contract v2 C-4: only lodging and verifying move to Before signing. Bond and insurance terms stay award terms. The acts stay in awards/actions.ts (withLockedAwardFor keeps FR-MTD-007, lock order and act-slots). The panel stays reachable later (AC-21).
- 2026-10-14 · Product owner (for the founder): Award and Contract v2 C-5: regret letters move to the exercise's Award tab for the live award, with earlier ones read-only and the same gates. FR-AWD-011 lives there when built. Waits until sealed bids are committed (AC-22).
- 2026-10-14 · Product owner (for the founder): Award and Contract v2 C-6: /awards/** become guarded server redirects (requireStaff, restricted check, 404 as today, temporary redirect) with tab mapping, a caseHref helper and print views kept. Kept permanently for StaffNotice rows (AC-23).
- 2026-10-14 · Product owner (for the founder): Award and Contract v2 Part 2 design rulings (held for CPD): P-1 opens at EXECUTED, kick-off only; FR-CON-010 stays at signing, with the meeting recording it only if missing. P-2 membership gates the exchange only; S.O. holders are derived Leads; request approval by supplierAccounts.manage with D6 kept. P-3 answers to the contractor only from the S.O. or an in-scope delegate (FR-SUP-004 M); work-programme higher approval per FR-SUP-006 (Principal S.O.'s Rep; spec wins). P-4 calendar days ASSUMED, target snapshotted, type settings required before issue. P-5 recipients as AC-28. P-6 contractor reads only its own and sent files. P-7 per-kind answer sets, legacy rows kept read-only (AC-24 to AC-30).
- 2026-10-14 · Product owner (for the founder): Award and Contract v2 V-2: waves 3b and 3c are the vehicle; not "covered" until 3c lands; no unsealed RFQ (FR-BID-001) (AC-32).
- 2026-10-14 · Product owner (for the founder): Award and Contract v2 sequencing: sealed bids 3b and 3c, then GN/MN, then Part 1, then Part 2 (after CPD), then Part 3. nav.ts, configuration files and sourcing/[id]/page.tsx wait until stage B is committed (AC-0, AC-35).

## 5. Wave plan

**Entry for every wave:**
- Sealed online bids (waves 3b and 3c) are committed.
- Steps marked **[after stage B]** touch files the sealed-bids builder holds (AC-0): `src/lib/nav.ts`, `src/app/configuration/**`, the
  policy and configuration-words files, and `src/app/sourcing/[id]/page.tsx`. They are not started while that work is uncommitted.

**Exit for every wave:**
1. `npm run typecheck`, `npm run lint` and `npm test` pass, including the db tests.
2. The text snapshots are taken before and after and diffed (§3).
3. The ui-guidelines-reviewer compares each changed screen with its siblings.
4. The code-reviewer and the security-auditor review.
5. A fix round.
6. The decisions log records the wave.

### Wave G — general fixes and menu clean-up (11 steps, G1–G11)

**G1. devops-engineer + test-engineer: the baseline measurement (AC-8).**
- Measure on `next build && next start` against the demo database:
  - one discarded warm-up;
  - 20 sign-ins as the demo officer with the longest worklist;
  - unthrottled, plus one Fast 4G set.
- Count the `?_rsc=` requests after the action.
- Time each phase with temporary `console.time` or Prisma `$on('query')`: `authenticateStaff`, layout (`loadShell`, `staffCounts`),
  `loadDashboard`, and the SULIT gates.
- Also record the cold first sign-in on `next dev`, reported but not judged.
- The probes are removed before commit.
- **Done when** the median, p95, request count and per-phase query counts and times are written into the step's hand-over, for the
  decisions-log entry.

**G2. frontend-engineer: one navigation after sign-in (AC-9a).**
- In `auth-form.tsx`, drop `router.refresh()` after `router.replace(href)`. The preferred alternative is
  `redirect(AFTER_SIGN_IN)` inside `signInAction` after the cookie, if the scans allow it.
- Redeem-code (`/sign-in?password=set`) and password-change keep their destinations.
- **Done when** the network panel shows exactly one server navigation, and `sign-in-actions-scan.test.ts` and `auth-reach.test.ts`
  pass unchanged in intent.
- **Tests:** a unit or scan test that `AuthForm` makes one navigation call per success.

**G3. domain-engineer: the pure pipeline and case rules (AC-12, AC-17, AC-18), built here for GN-03 and reused by wave C.**
- Write §6.1 `case-stage.ts`, `case-visibility.ts` and `src/lib/dashboard/pipeline.ts` (`REQUISITION_PIPELINE`,
  `requisitionPipelineSplit`, `sourcingInPipeline`).
- **Done when** each function has its tests:
  - every `AwardStatus` × `ContractStatus` pair;
  - an indent with commencement recorded and no possession → ON_SITE;
  - ISSUED with preparation started → AWARDING;
  - each of the three ended kinds;
  - `caseVisibility` across restricted or not, named or not, and before or after issue.

**G4. api-engineer: `loadDashboard`, the SULIT gates and the dashboard counts (AC-9b, AC-9c, AC-11, AC-12).**
- In `src/lib/dashboard.ts`:
  - run independent reads in one `Promise.all`;
  - read `organisationTimeZone` once;
  - delete the every-decision-with-votes read and `committedSen`, `decidedCount` and `votesOutstanding`.
- Add `pipelineCounts(actor)`. It returns `{ requisitions: { total, approvedWaiting, backWithRequester }, sourcing: { total, phases },
  contracts: { total, awarding, signing, onSite } }`, from database count and `groupBy` queries only.
  - It uses `hiddenExercises` for sourcing.
  - It uses the `caseVisibility` WHERE fragment for contracts, which is `caseVisibilityWhere`, the database twin of G3's rule. A test
    proves the two agree on fixtures.
- The SULIT gates in `page.tsx` run in parallel, and the total gate is removed.
- **Done when** the db tests prove the counts against fixtures, including a restricted exercise left out. The per-phase query count from
  G1 has dropped.

**G5. frontend-engineer: the dashboard screen (GN-03).**
- The cards are:
  - "Awaiting my decision" → `/approvals?tab=mine`. Its number is the **same request-cached reading** the layout already makes
    (`requestWorklist`'s `cache()`, or G6's proven slim count), never a second worklist load, so GN-03 does not add back the cost
    GN-01 removes;
  - Requisitions → `/requisitions`;
  - Sourcing → `/sourcing`;
  - Contracts → `/projects`.
- Each card has its hint. A zero card shows "0" with a hint saying none are in the pipeline, not a blank.
- Remove the subtitle and "Documents awaiting my review".
- Add `compare-screen` `DECIDED_ABSENT` entries citing GN-03.
- **Done when:**
  - the card number equals the My approvals badge in the browser;
  - clicking opens My approvals;
  - the `/` snapshot diff shows only the ruled changes.

**G6. api-engineer: the shell counts (AC-9d, AC-13).**
- Remove the `/` count and its query from `loadShell`, and drop the `counts` option if nothing else uses it.
- A slimmer `/approvals` count is allowed only with a db test proving it equals `waitingForCount(myStepsOf(…))` on the worklist fixtures.
  Otherwise keep `requestWorklist`.
- Add `revalidatePath('/', 'layout')`:
  - in every act that decides, sends back, recalls, delegates or escalates a step: approvals, requisitions, awards, certificates and
    variations;
  - on opening `/inbox/[id]`, where the notice is marked read.
- **Done when:**
  - `auth-reach.test.ts` passes;
  - a scan test lists the step-changing actions and asserts each revalidates the layout;
  - a browser check shows both badges update after a decision and after reading a notice.

**G7. frontend-engineer: GN-02 and GN-05.**
- Add `BackIcon` in `icons.tsx`. Move the account link into `PageHeader actions` and remove the bottom copy.
- In `/inbox`, remove the actions prop and the Delivery `Callout`. Add the subtitle clause and update the doc comment.
- **Done when** lint is clean, the `/inbox` snapshot diff shows only these, and `/account` shows the link without scrolling.

**G8. frontend-engineer + api-engineer [after stage B]: MN-01 (AC-15).**
- Remove `nav.ts:55`.
- `src/app/securities/page.tsx` → `redirect('/projects?view=securities')`.
- `projects/page.tsx` gains the "Securities expiring or not verified" view, on `listRegister` and its counts with the hidden filter,
  showing expiry chips. Each row opens `/projects/{contractId}?tab=securities`.
- The contract `SecuritiesPanel` gains:
  - `expiryAlert` chips;
  - a "Lodged, not verified" marker;
  - "Reminders at N days" from the rule's offsets. With no offsets configured it reads "Expiry reminders are not set", never 0 days.
- Remove the two `revalidatePath('/securities')` calls and update the snapshot `ROUTES`.
- **Done when:**
  - there is no Securities menu;
  - the old URL lands on the view;
  - a restricted exercise's security is absent from the view for an unnamed officer (db test);
  - the chips match the award page's for the same instrument.

**G9. api-engineer + frontend-engineer [after stage B: `configuration/post-award/core.ts`, `nav.ts`]: MN-02 and the bridge (AC-16).**
- `loadReviewQueue` and `reviewCounts` take an optional `contractId`.
- The contract page gains a **Submissions** tab, using the same `AnswerDrawer` and `answerContractorSubmission`.
- `projects/page.tsx` gains the "Submissions waiting" view, with the overdue count. With no organisation time zone, the count says
  overdue is not judged, as `reviewCounts` does today; it never shows 0.
- `documents/page.tsx` becomes a no-DB `permanentRedirect`: `?tab=review` → `/projects?view=submissions`, else `/projects`.
- `contractorSubmissionNotices` (`lib/inbox/notices.ts:183`) links new rows to `/projects/{contractId}?tab=submissions`, and its body
  wording changes.
- The Documents tab gains the copies-not-sent count and the routing-sheets-open (past target) count, with links.
- `read.ts:249` falls back to `/configuration/documents`.
- Remove the two `revalidatePath('/documents')` calls and `nav.ts:73`.
- Update `data-list-width.test.ts` and the snapshot `ROUTES`.
- **Done when:**
  - a contractor submission is answered from the contract's tab;
  - an old `/documents?tab=review` notice link lands on the view;
  - `src/app/documents/actions.ts` consumers are untouched (their scans pass);
  - `supplier-reach.test.ts:346` is unaffected.

**G10. devops-engineer + test-engineer: the after measurement (AC-8).**
- Repeat G1 exactly.
- **Done when** the median is at most 2.0 s, p95 is at most 3.0 s, and there is exactly one navigation. If the target is missed, the
  per-phase numbers name the next cost, and the wave does not close.

**G11. code-reviewer + security-auditor, then a fix round.**
- The security-auditor checks:
  - the `/` badge leak is closed;
  - the new views filter restricted exercises;
  - SULIT gates still log before showing;
  - the redirects confirm nothing.

### Wave C — Awards into Contracts (14 steps, C0–C13; C13 follows Part 1)

ADR 0037 (§7) is proposed in C0 and accepted before C2.

**C0. solution-architect: ADR 0037 and the §6.1–6.2 contracts reviewed against the code as it stands after wave G.**
- **Done when** the ADR is accepted and the contracts are frozen.
- **Status, 2026-10-18.**
  - The contracts are frozen (§6.1, §6.2).
  - ADR 0037 is written and **Proposed**. The product owner's acceptance is owed before C2. It is asked in the decisions log, with
    F0-1 to F0-11.

**C1. domain-engineer: the case contracts and rules (§6.1).**
- Add `case-steps.ts` (`caseSteps`, `defaultCaseStep`), `case-tabs.ts` (`CASE_TABS`, `awardTabToCase`) and `links.ts` (`caseHref`).
- **Done when** they are tested:
  - parallel states (Before signing and Signing both in progress);
  - an indent whose main button is "Record commencement" when `commencementState` is due;
  - a pre-issue case offers no contract stage action;
  - every award tab id maps;
  - the default step for an unknown tab is the earliest with something to do;
  - for `CONTRACT_STAGES_ONLY`, no Award-stage action and no `LODGE_SECURITY` or `VERIFY_SECURITY` is offered (Before signing is
    read-only, as today's contract tab is).
- **Status, 2026-10-18.** Built and tested (`case-steps.test.ts`, `case-tabs.test.ts`, `links.test.ts`). The gaps the state table
  leaves, the redacted step words and the additive exports are logged in the decisions log (C1 lines).

**C2. design-system-engineer: extend `Stepper` (§6.2).**
- Add a `parked` state, optional per-step `href`, and a `selected` key, rendered as `aria-current="step"` on the selected step only.
  Several steps may be `current`.
- **Done when** the existing five users render unchanged (snapshot), and a test covers parked, selected and linked steps.

**C3. api-engineer: `loadCase` and `listCases` (§6.1).**
- `src/lib/contract/case-load.ts` resolves a contract, or else an award, within the organisation (`resolveCase`). Under the C0 freeze
  (F0-7), `loadCase`, which adds the logged visibility check, lives in `src/app/_auth/case.ts`.
- `listCases` runs `Award` LEFT JOIN `Contract`, with the views:
  - the five stages;
  - `ended`;
  - `delay` and `commenced`, re-keyed to awards;
  - `securities` and `submissions`, from wave G.
- It keeps the awards chips and counts, with `caseVisibilityWhere`, and is ordered by award `createdAt` desc then id.
- **Done when** the db tests prove:
  - paging is stable across pre- and post-contract rows;
  - view counts equal the dashboard's Contracts split (one counting rule);
  - restricted cases are absent before issue for an unnamed officer;
  - after issue, a restricted case's row for an unnamed officer carries only the columns `listContracts` shows today: no awards-list
    chips and no award facts;
  - the re-keyed In Delay set equals today's on fixtures.

**C4. frontend-engineer: extract the award panels.**
- Move `OverviewPanel`, `ApprovalPanel`, `InstrumentPanel`, `DistributionPanel`, `ReturnPanel`, `ConditionsPanel`, `SecuritiesPanel`,
  the routing-sheet panel and `HistoryPanel` from `awards/[id]/page.tsx` into `src/app/projects/[id]/award/*.tsx`, unchanged.
  `awards/[id]/page.tsx` imports them.
- Re-point `act-status-scan.test.ts:330-337` and `lock-order.test.ts:375-376,488`, with comments citing C-3.
- **Done when** the `/awards/{id}` text snapshot is identical before and after, for every tab.

**C5. frontend-engineer: the case page (AC-19).**
- `/projects/[id]`:
  - `loadCase`;
  - redirect award→contract, keeping the query;
  - `caseVisibility` before anything renders.
- The step bar comes from `caseSteps`, with the `?stage=&tab=&section=` params and the stage→tab mapping (§6.1, with F-1).
- The Award stage uses the award gates (`sulitExerciseGate` 'exercise' or 'evaluation'). The contract stages use `sulitGate` 'contract'.
- Each stage loads only its own readers. A pre-issue case runs no contract-only reader.
- Close-out is parked.
- The "What's next" line and the main button come from the existing fault lists and header actions.
- **Done when:**
  - a pre-issue award, an issued award, a signed contract, an indent and a cancelled case each render the right default step;
  - the SULIT fields of each panel are refused under the other gate (a test);
  - a restricted case is 404 before issue, and after issue its Award stage is refused and logged while the contract stages show;
  - for that reader the case-level History holds contract rows only (no `awardHistory` rows).

**C6. frontend-engineer: Before signing (AC-21).**
- The lodge and review drawers (`awards/editors.tsx`) and the chips render in Before signing. They still post the award id to the
  unchanged acts.
- The bond decision and insurance terms show read-only.
- The Project stage has a securities summary that opens the same panel.
- `refresh()` (`awards/actions.ts:95-100`) revalidates the case paths.
- **Done when** a bond is lodged and verified from the case page, and the signature gate reads it. Both histories show the rows.

**C7. frontend-engineer + api-engineer [after stage B: `sourcing/[id]/page.tsx`]: start the award (AC-19).**
- `src/app/projects/new/page.tsx` takes `?exercise=` and uses the moved `award-form.tsx`.
- `createAward` (`awards/actions.ts:313`) redirects to `caseHref`.
- The exercise's Start button (`sourcing/[id]/page.tsx:858`) links to it.
- **Done when** "Start the award" lands on the new case's Award stage.

**C8. frontend-engineer [after stage B: `sourcing/[id]/page.tsx`]: regret letters to the exercise (AC-22).**
- Move the three `non-award-*` files to `src/app/sourcing/[id]/`, with the section on the Award tab for the live award.
- Earlier notices are read-only.
- `revalidatePath` points at `/sourcing/{exerciseId}`.
- **Done when** a notice is issued from the exercise, a cancelled award's notices show read-only, and a hidden exercise refuses as today.

**C9. api-engineer [after stage B: `nav.ts`]: the case list and old links (AC-17, AC-23).**
- `projects/page.tsx` renders `listCases`, and Awards leaves the nav.
- `/awards`, `/awards/[id]` and `/awards/new` become guarded redirects (§6.1 `awardTabToCase`).
- Every link site in the C-6 inventory uses `caseHref`, including the persisted-notice writers at `approvals/load.ts:97`,
  `committee/waiting-load.ts:171`, `awards/actions.ts:575`, `certificate/register.ts:132` and `documents/targets.ts:56`.
- The print views keep their URLs, with new back links.
- Remove the dead `revalidatePath('/awards…')` calls.
- Update `text-snapshot.mjs`, `crumbs.test.ts` and `surface.test.ts`.
- **Done when:**
  - a scan finds no `"/awards/` literal outside the redirect pages, the print pages and `/configuration/awards`;
  - a db test walks every `?tab` value;
  - a hidden award's old link returns 404 and writes the refusal, **both before and after issue**. `/awards/**` redirects only when
    `caseVisibility` is `WHOLE`, so an unnamed reader is never forwarded to the contract from an old award link.

**C10. data-migration-engineer: the demo seed (AC-20).**
- In `prisma/demo-award.ts:134`, set `indentValidityDays` to 14 and `commencementGraceDays` to 7. If a test pins 10/5, keep it and say
  why.
- Seed cases in every stage, including an indent past commencement and a cancelled one.
- **Done when** `npm run db:reset` produces each stage once in the demo.

**C11. test-engineer: the rules and the walk (AC-20).**
- One regression test per Must listed in AC-20, driving the action as posted from the case page:
  - FR-AWD-001: issue refused unapproved;
  - FR-AWD-004: a copy logged per despatch;
  - FR-AWD-003/008: accepted only on a complete return with scans;
  - FR-AWD-006: indent expiry blocks issue;
  - FR-AWD-009: late commencement shown;
  - FR-CON-002: the number at issue, and `issueAward` the only creator;
  - plus FR-AWD-002/005/012-014, FR-CON-001 and FR-EVL-014.
- **The demo walk, Part 1 slice.** On one page: start an award, approve it, issue the letter, record the return, lodge the bond on the
  contract, prepare, legal, sign, stamp, possession. That reaches "Active on site".
- **Access checks proved here:**
  - every old `/awards` link opens the right stage;
  - SULIT award fields stay behind their gates.
- **Done when** all of these pass in CI and the walk runs in a browser.

**C12. code-reviewer + security-auditor, then a fix round.**
- The security-auditor checks `caseVisibility` at:
  - the resolver;
  - the redirects;
  - the list and its counts;
  - every moved act.
- It also checks the SULIT cross-over.

**C13. data-modeler + api-engineer: FR-AWD-006/009 staff notices (AC-20). After Part 1; not held by AC-7.**
- New `StaffNotice` kinds `INDENT_EXPIRED` and `COMMENCEMENT_LATE`. This is a migration replacing `StaffNotice_kind_known`, and
  `kinds.ts` changes in step.
- The notice is written when the case is read (the STEP_ESCALATED precedent), with `occurrence` set to the expiry day or the due day.
- The recipients are those of §8 F-4, once ruled.
- **Done when:**
  - reading an expired indent case twice writes one notice per recipient;
  - a restricted case's notice is hidden as other exercise notices are;
  - the kinds source test passes.

### Wave P — Project workspace (8 steps, P0–P7; HELD: P0 now, P1–P7 after CPD sign-off)

**Entry gate for P1 onward.** The founder has recorded, in the decisions log, CPD's written sign-off of P-1 to P-7 as [NET-NEW], with
the signer's name, the date and the document version, together with the AC-7 policy answers. Until then only P0 runs: no migrations
and no code (AC-7). The C-2 Project stage holds today's tabs and the MN-02 bridge.

**P0. solution-architect (now): ADRs 0038 and 0039, and the Part 2 build plan with the §6.3 contracts as declarations in the plan only.**
- **Done when** the product-owner reviews both ADRs as "proposed, held".

**P1. data-modeler, then api-engineer: teams and access (P-2, AC-25).**
- Add `ContractTeamMember`, `ContractTeamRequest` and the oversight permission.
- The backfill migration makes each active awardee account a contractor Lead.
- `contractTeamAccess` (pure) and `exchangeReach` (the reader) cover derived Leads, Reviewers and Viewers.
- The portal stores (`context-store`, `list-store` and each exchange `*-store`) take membership **for the exchange only**. Today's
  contract visibility for diary, certificates and payments is unchanged.
- The request → approve act (`supplierAccounts.manage`, D6 kept) runs under the supplier, then the contract lock.
- **Done when** these are db-tested:
  - backfill parity, where every account sees what it saw;
  - a removed member loses the exchange at once;
  - Finance, Legal and approvers keep the case page;
  - an administrator is refused the exchange.

**P2. data-modeler, then domain-engineer and api-engineer: document types and the register (P-4, AC-27) [configuration files].**
- Add `ProjectDocumentType` with its two-person editor. It is refused at issue while the target or the higher-approval setting is unset.
- Add `ProjectExchangePolicy.perContractMaxBytes`.
- The register reader filters in the database.
- `revisionLetter` and `submissionState` are pure.
- **Done when** they are tested:
  - the overdue clock runs only while the submission waits on RSAJ;
  - the target snapshot survives a type edit;
  - Z → AA.

**P3. data-modeler, then api-engineer and frontend-engineer: submit, review, answer (P-3, P-6, AC-26, AC-29).**
- Add `ProjectSubmission`, `ProjectSubmissionRevision` and `ProjectSubmissionComment`, with write-once triggers and the two new
  attachment owner keys (CHECKs replaced whole).
- The portal adds upload, submit and file routes. Staff get the Project-stage tab, answer authority (`recorderFaultToday`
  `CONTRACTOR_COMMUNICATION`), higher approval, internal comments, marked-up files and paper-on-behalf.
- The contractor read rule and download logging.
- **Done when:**
  - two concurrent answers result in one;
  - a non-S.O. Reviewer's answer is refused for the contractor (recommendation only);
  - a contractor cannot read an internal comment or file;
  - another contractor gets a 404;
  - an upload over the per-contract bound is refused, and refused while the bound is unset.

**P4. data-modeler, then api-engineer and frontend-engineer: notices (P-5, AC-28).**
- Add `SupplierNotice`, with a readAt-only trigger and a kind CHECK.
- Add `/supplier/inbox` and turn on the bell.
- Add the staff kinds, with recipients per AC-28.
- Overdue is written when the register is read, once per due day.
- **Done when** each event writes exactly its ruled recipients, and no notice carries a SULIT figure or another contractor's name.

**P5. data-modeler, then api-engineer and frontend-engineer: the kick-off meeting (P-1, AC-24).**
- Add `ProjectMeeting` and `ProjectMeetingAttendance`, and the new act-status row (opens at EXECUTED).
- Add the minutes purpose.
- The FR-CON-010 briefing is written only if missing.
- **Done when** scheduling before EXECUTED is refused, the second briefing write is skipped, and `briefingMissing` is unchanged.

**P6. domain-engineer + api-engineer: the six kinds as system types (P-7, AC-30).**
- The six become system types with their per-kind answer sets.
- The claim and material details, the declaration step-up and the signing checks stay, and "sent on" is stamped by the server.
- The legacy `ContractorSubmission` rows show read-only.
- Retire the bridge: `sendSubmission`, `answerContractorSubmission` and the Submissions view now read the register.
- The overview counts and the payments claims list are rewired.
- **Done when** `projects.db.test.ts` and `handlers.test.ts` are rewritten to the register, and old `ActAttribution` rows still resolve.

**P7. test-engineer, then code-reviewer + security-auditor, then a fix round.**
- **The Part 2 demo slice:** sign, then hold the kick-off; a contractor submits a drawing; the reviewer answers "Revise and resubmit";
  Revision B is approved; every notice is seen.
- **Access checks:**
  - a contractor never sees another contractor's contract;
  - staff outside the contract team never see the workspace;
  - SULIT files stay protected.

### Wave V — PO acceptance and Supply invoices (5 steps, V0–V4; after wave P, or after CPD declines Part 2, AC-35)

**V0. solution-architect: ADR 0040 (online award return) and the Part 3 supply-claim design.**
- The supply-claim design reconciles BD-613-128, and leads to an ADR only when the design is ruled.
- **Done when** the product owner rules the supply design.

**V1. frontend-engineer: show the commitment number.**
- Show `erpCommitmentNo` and its kind on the case and in the portal overview (`workspace-store.ts:47`), when recorded.
- **Done when** both views show it, and it is absent (with words) when it is not recorded.

**V2. data-modeler, then api-engineer and frontend-engineer: the online return and queries (AC-31).**
- Add `AwardOnlineReturn` and `AwardQuery` (§6.4).
- Portal upload of the instrument's scans, with the typed page fields and the password step-up. Only the signing-authority account
  (`authorisedToSignForContractor` and `contractorPortalSigning`) may do this.
- An officer verifies the scans, which completes the return through the existing `acceptOnCompleteReturn`.
- The click-only switch `AwardPolicy.clickOnlyAcceptance` is nullable and unset; unset refuses.
- **Done when:**
  - an online return without officer verification leaves the award ISSUED;
  - a query does not move the 14-day clock;
  - another supplier's account gets a 404.

**V3. integration-engineer + api-engineer: the supply claim, built only if V0's design is ruled for this round.**
- Otherwise the wave records it as deferred.

**V4. test-engineer, then the reviews and the fix round, then the decisions log.**
- **The full end-to-end demo check from the document:** start an award from a tender, approve it, issue the letter, the contractor
  accepts online (online return, verified), lodge the bond on the contract, sign, hold the kick-off, submit a drawing, revise it, approve
  it, and see every notice.
- **All four access checks.**
- **V-2:** a log line "covered by waves 3b and 3c" once 3c is committed (AC-32).

## 6. Contracts and data-model sketches

### 6.1 Wave C (and G3): no schema change (AC-1)

**Frozen in C0, 2026-10-18,** against the code after wave G (`2537beaf`), with ADR 0037 (proposed, not yet accepted). The changes
from the sketch are listed below. Each is ADR 0037's F0 point, logged in the decisions log as a product-owner question.
- **Real type names (F0-1).**
  - `InstrumentKind`, not `AwardInstrumentKind`;
  - `Finding`, not `Fault`;
  - `ReturnType<typeof readinessGate>`, not `ReadinessGate`;
  - `CaseFacts` takes today's outputs, not `AwardFacts`.
- **Buttons as today (F0-2).** Each main button comes from today's own drawer condition, and "Record commencement" is offered on today's
  header condition, on the Project step.
- **Award ids (F0-3).** Under CONTRACT_STAGES_ONLY an award id is 404 and logged on `/projects/[id]`.
- **Before signing (F0-4).** Two rows are added to the surface table.
- **Stage-less tabs (F0-5).** `caseTabToStep` is added.
- **Ended cases (F0-6).** `defaultCaseStep` takes the standing.
- **The split (F0-7).** `resolveCase` (lib) is separated from `loadCase` (app).
- **Standalone views (F0-8).** `CaseRowView` and `parseCaseListView`; securities and submissions stay their own views.
- **Shared cap (F0-9).** `DERIVE_CAP` moves to lib.
- **Signing (F0-11).** The action table.

```ts
// src/lib/contract/case-stage.ts (G3)
export type CaseStage = "AWARDING" | "SIGNING" | "ON_SITE" | "COMPLETED" | "CLOSED";
export type CaseEnded = "CANCELLED_BEFORE_ISSUE" | "CONTRACT_CANCELLED" | "TERMINATED";
export interface CaseStageInput {
  award: { status: AwardStatus; instrumentKind: InstrumentKind };
  contract: { status: ContractStatus } | null;
  commencement: { commencedOn: string | null };   // Award.commencedOn as an organisation day
}
export type CaseStanding = { kind: "LIVE"; stage: CaseStage } | { kind: "ENDED"; ended: CaseEnded };
export function caseStage(input: CaseStageInput): CaseStanding;
// Precedence, first match wins (AC-17):
//  1. ENDED: award CANCELLED with no contract; contract CANCELLED; contract TERMINATED.
//  2. CLOSED: contract CLOSED.
//  3. COMPLETED: contract PRACTICALLY_COMPLETE | MAKING_GOOD_COMPLETE | FINAL_CERTIFICATE_ISSUED.
//  4. ON_SITE: contract ACTIVE; or instrumentKind WORK_INDENT with commencedOn set (whatever the contract status).
//  5. AWARDING: award not ACCEPTED (DRAFT..ISSUED), whatever the contract status (preparation may already run).
//  6. SIGNING: everything else (award ACCEPTED, contract NUMBER_ALLOCATED..STAMPED).
export const CASE_STAGE_WHERE: Record<CaseStage | "ENDED", Prisma.AwardWhereInput>;   // the db twin; a test proves agreement

// src/lib/contract/case-visibility.ts (G3), reversible (AC-18)
export interface CaseVisibilityInput { restricted: boolean; actorNamed: boolean; system: boolean; issued: boolean /* a Contract row exists */ }
export type CaseVisibility = "WHOLE" | "CONTRACT_STAGES_ONLY" | "HIDDEN";
export function caseVisibility(i: CaseVisibilityInput): CaseVisibility;
export function caseVisibilityWhere(hiddenExerciseIds: readonly string[]): Prisma.AwardWhereInput;   // for lists and counts
// What each value does on each surface (ADR 0037; tests in C1, C3, C5 and C9):
// | Surface                  | WHOLE         | CONTRACT_STAGES_ONLY                                                            | HIDDEN        |
// | listCases row / counts   | full row      | listed; only the columns listContracts shows today, no award chips or facts     | absent        |
// | /projects/[id]           | every stage   | Award stage refused and logged; contract stages render                          | 404, logged   |
// | Before signing           | acts offered  | read-only; caseSteps offers no LODGE_SECURITY / VERIFY_SECURITY (the acts sit  | —             |
// |                          |               | behind withLockedAwardFor, which refuses today)                                 |               |
// | Before signing ›         | rendered,     | not rendered (it reads LoadedAward); the restricted note in its place (F0-4)    | —             |
// |   conditions             | acts offered  |                                                                                 |               |
// | Before signing ›         | award register| the contract's register exactly as its Securities tab today                     | —             |
// |   securities             | + drawers, and| (projects/[id]/page.tsx:299), recordWcCheck still offered (a contract act under |               |
// |                          | the wages chk | staffForAct); no lodge or verify (F0-4)                                         |               |
// | /projects/[awardId]      | render, or    | 404, logged; never redirected (F0-3)                                            | 404, logged   |
// |                          | redirect      |                                                                                 |               |
// | Case-level History       | award+contract| contract rows only; award rows (awardHistory) dropped                           | —             |
// | /awards/** redirects     | redirect      | 404, logged (today's award page refuses before and after issue)                 | 404, logged   |
// | Dashboard Contracts card | counted       | counted (as Contracts are today)                                                | not counted   |

// src/lib/dashboard/pipeline.ts (G3, built): CASE_PIPELINE, casePipelineWhere. listCases' stage counts use the same
// CASE_STAGE_WHERE fragments joined to caseVisibilityWhere by AND, so the list's Awarding + Signing + On site equals the card.

// src/lib/contract/case-steps.ts (C1). Pure. It never adds a gate (F0-2, AC-20): it orders the facts the page already computes
// and turns them into a state, a "next" line and at most one action per step.
export type CaseStepKey = "award" | "before-signing" | "signing" | "project" | "close-out";
export type CaseStepState = "done" | "in-progress" | "waiting" | "parked";
export type CaseAction =
  | "SEND_FOR_APPROVAL" | "ISSUE" | "RECORD_DESPATCH" | "RECORD_RETURN" | "RECORD_COMMENCEMENT"
  | "LODGE_SECURITY" | "VERIFY_SECURITY" | "START_PREPARATION" | "SUBMIT_TO_LEGAL"
  | "RECORD_SIGNATURE" | "RECORD_STAMPING" | "RECORD_POSSESSION";
/// The acts that run through withLockedAwardFor: never offered under CONTRACT_STAGES_ONLY.
export const AWARD_ACTS: readonly CaseAction[] = ["SEND_FOR_APPROVAL", "ISSUE", "RECORD_DESPATCH", "RECORD_RETURN", "RECORD_COMMENCEMENT", "LODGE_SECURITY", "VERIFY_SECURITY"];
export interface CaseStep { key: CaseStepKey; state: CaseStepState; next: string /* label words, never a code */; action: CaseAction | null }

/// Each fact is today's own condition, computed by the page at the line cited (F0-1, F0-2). Nothing here is re-derived.
export interface AwardStepFacts {
  status: AwardStatus; instrumentKind: InstrumentKind;
  submitBlocks: readonly Finding[];   // ev.submitFaults at level "block" (awards/[id]/page.tsx:200)
  issueReady: boolean;                // awards/[id]/page.tsx:206: APPROVED, no issue fault, the signatory resolved
  issueFaults: readonly Finding[];    // ev.issueFaults, for the "next" words when not ready
  despatchOpen: number;               // distribution rows whose DespatchDrawer renders (awards/[id]/page.tsx:1055)
  returnOffered: boolean;             // awards/[id]/page.tsx:1110: ISSUED or ACCEPTED, and the panel's SULIT gate GRANTED
  returned: boolean;                  // instrumentReturned(kind, awardReturn): for the "next" words only, never a gate on RECORD_RETURN
  commencement: CommencementState | null;   // ev.commencement, for the "next" words only
  commencementOffered: boolean;       // awards/[id]/page.tsx:303: ISSUED or ACCEPTED, not a Letter of Acceptance, no commencedOn
}
export interface BeforeSigningFacts {
  readiness: ReturnType<typeof readinessGate> | null;   // null under CONTRACT_STAGES_ONLY (it reads the award)
  securitiesToVerify: number;         // LODGED bonds and policies; 0 under CONTRACT_STAGES_ONLY
  lodgeOffered: boolean;              // the award SecuritiesPanel's `open` (awards/[id]/page.tsx:1216); false under CONTRACT_STAGES_ONLY
}
export type SigningAct = Extract<CaseAction, "START_PREPARATION" | "SUBMIT_TO_LEGAL" | "RECORD_SIGNATURE" | "RECORD_STAMPING" | "RECORD_POSSESSION">;
export interface SigningFacts {
  status: ContractStatus;
  /// The act today's page offers for this status (ADR 0037 F0-11), with its Blocked words already rendered (contractFaultText);
  /// null where none is offered (PENDING_LEGAL_ENDORSEMENT, or the possession's office hidden).
  act: { action: SigningAct; blocker: string | null } | null;
}
export interface CaseFacts {
  visibility: Exclude<CaseVisibility, "HIDDEN">;   // the page has already answered 404 for HIDDEN
  standing: CaseStanding;                         // caseStage(...)
  award: AwardStepFacts | null;                   // null under CONTRACT_STAGES_ONLY: the award readers do not run
  beforeSigning: BeforeSigningFacts | null;       // null before issue (no Contract row; lodging only after issue, R-4)
  signing: SigningFacts | null;                   // null without a Contract row
}
export function caseSteps(f: CaseFacts): CaseStep[];   // always five steps, in CaseStepKey order
// State per step (C1 tests each line):
//  award:          done if ACCEPTED; in-progress if DRAFT..ISSUED; waiting under CONTRACT_STAGES_ONLY (its words say it is
//                  restricted). Action: DRAFT with no submitBlocks → SEND_FOR_APPROVAL; APPROVED and issueReady → ISSUE; ISSUED
//                  with despatchOpen → RECORD_DESPATCH; else ISSUED and returnOffered → RECORD_RETURN (a part-recorded
//                  return stays ISSUED, and its drawer stays offered); otherwise null, and the first blocking finding's words (or "Waiting for approval" while PENDING_APPROVAL) become `next`.
//  before-signing: waiting with no contract; done if readiness.ready or the contract is EXECUTED or later; in-progress otherwise.
//                  Action: securitiesToVerify > 0 → VERIFY_SECURITY; else lodgeOffered and the BOND or INSURANCE item NOT_MET
//                  → LODGE_SECURITY; else null, with the outstanding item's words.
//  signing:        waiting with no contract; in-progress NUMBER_ALLOCATED..STAMPED; done from ACTIVE on (and for TERMINATED).
//                  Action: signing.act when its blocker is null; else null, with the blocker as `next`.
//  project:        in-progress at ON_SITE or COMPLETED, or when award.commencementOffered (an indent before commencement);
//                  done at CLOSED; waiting otherwise. Action: RECORD_COMMENCEMENT when award.commencementOffered; else null.
//  close-out:      always parked, action null, next "Parked until after go-live" (F-3).
// Then: under CONTRACT_STAGES_ONLY every AWARD_ACTS action is null. For an ENDED standing every action is null and every
// in-progress step reads waiting.
export function defaultCaseStep(steps: CaseStep[], standing: CaseStanding): CaseStepKey;
// ENDED (F0-6): CANCELLED_BEFORE_ISSUE → "award"; CONTRACT_CANCELLED → "signing"; TERMINATED → "project".
// LIVE: the earliest step with an action; else the last in progress; else the last done; else "award".

// src/lib/contract/case-tabs.ts (C1)
export const CASE_TABS: Record<Exclude<CaseStepKey, "close-out">, readonly string[]> = {
  award: ["overview", "approval", "instrument", "distribution", "return", "routing"],   // "instrument" is labelled "Letter"
  "before-signing": ["conditions", "securities"],   // securities: the award's register and the contract's, one tab (F0-4)
  signing: ["formation", "baseline"],
  project: ["overview", "team", "site", "payments", "variations", "documents", "submissions"],   // overview: F-1
};
// history is case-level: ?tab=history with no stage
/// The ten award tab ids, for /awards/[id]?tab= (C-6). "notices" goes to the exercise (AC-22); "history" is case-level.
export function awardTabToCase(tab: string | undefined): { stage?: CaseStepKey; tab?: string } | { exercise: "notices" };
/// A stage-less ?tab= on /projects/[id], as persisted links carry (F0-5): "overview" → project on a contract, award on an
/// award-only case; "securities" → before-signing; "history" → case level; any other known tab → its one stage; else null
/// (the default step). `?stage=` with a tab not in that stage opens the stage's first tab.
export function caseTabToStep(tab: string | undefined, hasContract: boolean): { stage: Exclude<CaseStepKey, "close-out">; tab: string } | { history: true } | null;

// src/lib/contract/links.ts (C1): the only builder of case URLs (AC-23)
export interface CaseRef { awardId: string; contractId: string | null }
export function caseHref(ref: CaseRef, at?: { stage?: CaseStepKey; tab?: string; section?: string }): string;
// → /projects/{contractId ?? awardId}?stage=&tab=&section= (empty parameters left out)

// src/lib/contract/case-load.ts (C3). Database only; no logging, no src/app import (F0-7).
export type ResolvedCase =
  | { kind: "CONTRACT"; contractId: string; awardId: string; exerciseId: string }
  | { kind: "AWARD_ONLY"; awardId: string; exerciseId: string }
  | { kind: "AWARD_WITH_CONTRACT"; awardId: string; contractId: string; exerciseId: string }   // an award id whose contract exists
  | { kind: "NOT_FOUND" };
export function resolveCase(organisationId: string, id: string, client?: Tx): Promise<ResolvedCase>;   // a contract id first, then an award id
export type CaseListView = Lowercase<CaseStage> | "ended" | "delay" | "commenced" | "securities" | "submissions";
export type CaseRowView = Exclude<CaseListView, "securities" | "submissions">;   // F0-8: the two wave G views stay their own readers
export function parseCaseListView(v: string | undefined): CaseListView | undefined;   // unknown → undefined ("all")
export interface CaseRow {
  awardId: string; contractId: string | null; standing: CaseStanding;
  visibility: Exclude<CaseVisibility, "HIDDEN">;
  contract: ContractListColumns | null;   // exactly the columns listContracts returns today
  award: AwardListColumns | null;         // the awards-list columns and chips; null under CONTRACT_STAGES_ONLY (AC-18)
}
export interface CasePage { rows: CaseRow[]; total: number; page: number; pageSize: number; counts: Record<CaseRowView | "all", number> }
/// `hidden` is hiddenExercises(actor), passed by the caller as casePipelineWhere's is. Ordered by award createdAt desc, then id.
export function listCases(organisationId: string, hidden: readonly string[], q: { view?: CaseRowView; page?: number }): Promise<CasePage>;
export const DERIVE_CAP: number;   // moved from src/app/projects/page.tsx:33 to src/lib/contract/load.ts (F0-9), value unchanged

// src/app/_auth/case.ts (C3): the app-layer guard beside exerciseIsHidden (F0-7)
export type LoadedCase =
  | { kind: "CONTRACT"; contractId: string; awardId: string; visibility: "WHOLE" | "CONTRACT_STAGES_ONLY" }
  | { kind: "AWARD_ONLY"; awardId: string; visibility: "WHOLE" }
  | { kind: "REDIRECT"; contractId: string }   // only when WHOLE (F0-3)
  | { kind: "NOT_FOUND" };                     // missing, HIDDEN, or an award id under CONTRACT_STAGES_ONLY; the refusal logged
/// resolveCase, then exerciseIsHidden (which logs, as the award page does today), then caseVisibility.
export function loadCase(actor: StaffActor, id: string): Promise<LoadedCase>;
```

**Routes.**
- `/projects/[id]` (the case, by contract or award id).
- `/projects/new?exercise=`.
- `/projects?view=…`.
- `/awards/**`: redirects only.
- The sub-routes stay `/projects/[contractId]/certificates/…` and `/variations/…`.

### 6.2 `Stepper` extension (C2)

**Frozen in C0, 2026-10-18 (ADR 0037 F0-10):** `selected` is optional, and its absence is today's behaviour.

```ts
// src/lib/ui/steps.ts
export type StepState = "done" | "current" | "waiting" | "rejected" | "parked";   // parked: greyed out, dashed, "parked" to a screen reader
export interface StepperStep { /* existing */ href?: string }                   // a step may be a link (the case's stage switch)
// <Stepper steps label selected?: string />
//  - selected absent: aria-current="step" on every "current" step, exactly as today, so the five users render unchanged;
//  - selected given: aria-current="step" on that step only; several steps may still be "current".
// STATE_WORDS.parked = "parked"; DOT.parked: a dashed border, greyed out.
```

`caseSteps` maps "in-progress" to `current`, "waiting" to `waiting` and "parked" to `parked`. No one-off step bar is drawn.

### 6.3 Wave P (design only; written into the Part 2 plan, no migration until the gate)

All tables carry `organisationId`. Every act writes its audit row in the same transaction. The lock order is supplier → contract →
submission → document.

| Table | Key columns | Notes |
| --- | --- | --- |
| `ContractTeamMember` | contractId, side STAFF\|CONTRACTOR, personId?, supplierAccountId?, role LEAD\|REVIEWER\|SUBMITTER\|VIEWER, addedByPersonId?, addedBySupplierAccountId?, addedAt, removedAt?, removeReason? | CHECKs: exactly one of person or account, matching side; REVIEWER staff only; SUBMITTER contractor only. Partial unique on the live (contract, person) and (contract, account). S.O. holders and delegates are **derived, not stored**. |
| `ContractTeamRequest` | contractId, requestedBySupplierAccountId, proposedName, designation, email, phone, proposedRole, status PENDING\|APPROVED\|REFUSED, decidedByPersonId?, decidedAt?, reason?, resultContactId?, resultAccountId? | Approval creates the contact, the account (`openSupplierAccount`, D6) and the member in one transaction. |
| `ProjectDocumentType` | code, nameEn, nameMs, documentClassId, reviewDays Int?, reviewTargetSet Boolean, answerSet FOUR\|TAKEN_UP_RETURNED\|ACKNOWLEDGE, higherApproval NONE\|PRINCIPAL_SO_REP\|SO_OFFICE (null = unset), allowedMediaTypes[], maxBytes?, directions[], systemKind?, sortOrder, retiredOn?, provenance | Issued through ConfigurationChange; refused while the target or higher approval is unset (AC-27). |
| `ProjectExchangePolicy` | organisationId @unique, perContractMaxBytes BigInt?, provenance | Null refuses contractor uploads, with the words "not set" (AC-29). |
| `ProjectSubmission` | contractId, seq (unique per contract; shown as SUB-0001), typeId, title, direction CONTRACTOR_TO_RSAJ\|RSAJ_TO_CONTRACTOR, intent REVIEW\|FOR_INFORMATION\|ACKNOWLEDGE, createdAt, closedAt? | Status is derived from the latest revision. |
| `ProjectSubmissionRevision` | submissionId, index, sentByPersonId?, sentBySupplierAccountId?, onBehalf Boolean, sentAt, sentOn (organisation day, server), reviewerPersonId?, reviewDays?, dueOn? (snapshot), recommendation?, recommendedByPersonId?, passedOnAt?, answer?, answeredByPersonId?, answeredAt?, answeredOn?, acknowledgedBySupplierAccountId?, acknowledgedAt?, detail Json? (P-7 typed extension) | Write-once triggers: answer and acknowledgement are set once. The letter comes from `revisionLetter(index)`. |
| `ProjectSubmissionComment` | revisionId, attachmentId?, authorPersonId?, authorSupplierAccountId?, visibility SHARED\|INTERNAL, body, at | Append-only. INTERNAL is never read by a portal store. |
| `ProjectMeeting` / `ProjectMeetingAttendance` | contractId, kind KICK_OFF, scheduledAt, place, onlineLink, agenda, status SCHEDULED\|HELD\|CANCELLED, heldOn?, cancelReason? / meetingId, side, personId?, supplierAccountId?, name?, attended Boolean? | IntegrityBriefing written only if missing (AC-24). |
| `SupplierNotice` | supplierId, recipientSupplierAccountId, kind (closed list + CHECK), subjectEntity, subjectId, occurrence, contractId?, title, body, href, raisedByPersonId?, raisedBySupplierAccountId?, raisedAt, readAt? | Same unique key as `StaffNotice`; readAt-only trigger. |
| `DocumentAttachment` | + `projectSubmissionRevisionId?`, `projectMeetingId?` | Purposes `PROJECT_SUBMISSION_FILE`, `PROJECT_REVIEW_MARKUP` and `PROJECT_MEETING_MINUTES`. One-owner and purpose CHECKs replaced whole. |

### 6.4 Wave V (design only until V0)

- `AwardOnlineReturn` has these fields:
  - awardId, instrument, submittedBySupplierAccountId, stepUpAt, submittedAt, submittedOn;
  - the typed page fields (as `AwardReturn`), with the IC number held as today;
  - attachment pins;
  - verifiedByPersonId?, verifiedAt?, refusedReason?
- `AwardQuery` has these fields: awardId, body, askedBySupplierAccountId, askedAt, answer?, answeredByPersonId?, answeredAt?
- `AwardPolicy.clickOnlyAcceptance` is a nullable Boolean, unset.

## 7. ADRs needed

**Numbering.** 0026–0028 are absent from `docs/notes/architecture/` but are claimed in the log and plans (0026 by 6.16). They are left
alone, and new numbers start at 0037.

| ADR | Title | Status when | Decides | Relation to earlier ADRs |
| --- | --- | --- | --- | --- |
| **0037** | The case page is keyed by the award until a contract exists | proposed in C0, accepted before C2 | The case is the Award, which is 1:1 with the Contract, with no Case table. `caseVisibility` per surface (§6.1 table): `/awards/**` is 404 unless WHOLE. `/projects/[id]` resolves a contract, else an award, and redirects once a contract exists. `caseStage` and `caseVisibility` (AC-18, reversible). The parallel step bar. The `?stage=&tab=` scheme and `caseHref`. The `/awards/**` guarded redirects kept permanently. | **ADR 0007 is unchanged; 0037 complements it**: issueAward stays the only creator, and the registers stay on the Contract. Where a gate is shown is a screen fact, not a 0007 decision. Builds on ADR 0034 D14 (restricted exercises), and records the per-surface table of §6.1. Nothing is superseded. |
| **0038** | Contract teams and access to the Project exchange | proposed in P0, held | Derived and stored membership; the exchange-only gate; oversight permission; the contractor request → approve path with D6 kept; the backfill. | Extends ADR 0034 (a new granted-only permission; the D6 identity check reused) and ADR 0020 (two identity stores, with a request but no self-service). |
| **0039** | Project submissions, revisions and review | proposed in P0, held | The submission and revision model; answer authority (FR-SUP-004 at the act); higher approval (FR-SUP-006); internal comments; the target snapshot and RSAJ-only clock; per-kind answer sets; legacy `ContractorSubmission` kept read-only; `SupplierNotice` (P-5); whether an approved work programme writes `WorkProgramme` in the same act (AC-26 leaves this to the ADR; proposed: yes, one act, with the register revision as the source and `WorkProgramme` pinned to it). | **Extends ADR 0011**, without superseding: new owner FKs under D4 ("more arrive with their modules"); contractor read entitlement for its own and sent files, alongside D6; a per-contract upload bound under the store policy. |
| **0040** | The award return may be lodged online | proposed in V0 | The online return as the hybrid (scans plus typed fields, officer verification under OD-5); queries; click-only acceptance behind an unset switch. | Extends the return model of the 6.11 plan; nothing superseded. |
| (unnumbered) | Supply claims and the typed payment route | Part 3 design | Only once ruled; must reconcile BD-613-128. | — |

No ADR is needed for wave G. The AC-8 measurements go in the decisions log.

## 8. Open questions

### For the founder (architect's fills; each is built to its default unless he says otherwise)

- **F-1.** The contract's **Overview** tab has no stage in AC-19.
  - *Default:* the first tab of the Project stage. The case header carries the number, the sum and the phase.
- **F-2.** `/securities` redirect kind (AC-15 does not say).
  - *Default:* temporary (`redirect`), because its target view moves into the case list in wave C. `/documents` is permanent, as ruled.
- **F-3.** The Close-out step for an already-completed contract today (PRACTICALLY_COMPLETE and later). Its records (completion,
  defects, final account) exist on the Project tabs.
  - *Default:* Close-out stays parked and greyed out. Those records stay on their current tabs under Project (AC-19: "Records already
    made stay readable where they are").
- **F-4.** Recipients of the C13 indent-expiry and late-commencement notices (AC-20 leaves them to that design). FR-AWD-006 names "the
  user department and C&P".
  - *Default:* the requisition's requester; the holders of the requesting org unit's head office; and the award's current case owner
    (`CaseOwnershipEvent`, FR-CON-001), standing for C&P.
- **F-5.** Whether wave G may start before wave 3c finishes, for its steps that touch no stage-B file (G1–G7, G10).
  - *Default:* no. AC-0's build order is followed as written.

### To obtain from RSAJ or CPD (already defaulted by the rulings; listed so the founder can ask)

- **R-1.** CPD's written [NET-NEW] sign-off of P-1 to P-7, plus the AC-7 answers: calendar or working days; SULIT to contractors; the
  first document types with targets, higher approver and answer set; who approves member requests.
  - *Default:* Part 2 held.
- **R-2.** Whether a contract formed from a restricted exercise is itself restricted (AC-18).
  - *Default:* today's split.
- **R-3.** Whether indent cases go through contract formation (AC-17, OQ-11).
  - *Default:* no exemption invented; On site begins at recorded commencement.
- **R-4.** Whether a bond is ever taken before the letter (AC-21).
  - *Default:* no; lodging after issue.
- **R-5.** Electronic signature (AC-31).
  - *Default:* the click-only switch stays unset; scans are required.
- **R-6.** The concurrency for the NFR-PRF-001 load test (AC-8).
  - *Default:* a go-live test, not run in this round.
- **R-7.** NFR-RET retention for notices (AC-28).
  - *Default:* kept; no disposal.
- **R-8.** RSAJ's own `AwardPolicy` indent and commencement days.
  - *Default:* entered through Configuration's two-person path, which needs a second account that can issue configuration.
