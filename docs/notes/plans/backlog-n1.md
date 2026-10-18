# N1 — Malay on screen, first slice (NFR-LNG-001): build plan

**Status (2026-10-19): ready to build.** Written by the solution architect for backlog item N1 (design note 0004, AC-63 item 1; the
product owner's scope is the decisions-log line "2026-10-19 · Product owner (for the founder), AC-63 N1"). This plan declares contracts;
the signatures in §3 are what the builders write, not code that exists. Nothing here needs the founder, CPD, RSAJ or an outside service.
**RSAJ's review of the Malay remains the go-live gate**: this slice makes the staff screens switchable; it does not make the Malay final.

**Spec.** NFR-LNG-001 (M): "a full internationalisation layer ... for every user-interface label, message, validation text and
notification, selectable per user and switchable without loss of context." Acceptance: "A user switching language mid-task sees the
whole interface in the selected language and loses no entered data."

## 1. What exists today

- **The pair shape.** `Words { en; ms }` and `w(en, ms)` in `src/lib/contract/labels.ts`. About 145 files under `src/lib` hold `Words`;
  screens render `.en`. Rulings 20ab and log 1936 forbid a second shape: this layer is built over `Words`, not beside it.
- **Other bilingual sources.** `src/lib/labels.json` + `matterLabel(code, language)` in `src/lib/labels.ts`; `Person.jobTitleMs`;
  the supplier-portal tables (`src/lib/portal/labels.ts`, `registration/words.ts`, `registration-status.ts`), which stay as they are.
- **`Bi`** (`src/components/ui/bilingual.tsx`) renders both languages at once: the supplier side's pattern, and the right piece for the
  "not yet in Bahasa Malaysia" callout below.
- **Words already paired for this slice:** `CASE_STAGE_WORDS`, `CASE_ENDED_WORDS`, `standingWords`, `awardChips`
  (`src/lib/contract/case-list-words.ts`), `CONTRACT_STATUS_WORDS`, `PHASE_WORDS` (`src/lib/contract/labels.ts`).
- **English only today:** `STAFF_NAV` labels (`src/lib/nav.ts`, `label: string`); the shell (`src/components/shell/app-shell.tsx`,
  `sidebar.tsx`, `topbar.tsx`, `user-menu.tsx`, `record-crumb.tsx`); shared components' own words (`src/components/data-list.tsx`,
  `src/components/tabs.tsx`, `src/components/ui/*`); the Dashboard (`src/app/page.tsx`, `src/lib/dashboard.ts`,
  `src/lib/dashboard/*.ts`); the Inbox (`src/app/inbox/page.tsx`, `STAFF_NOTICE_KIND_LABEL` in `src/lib/inbox/kinds.ts`); the Contracts
  list (`src/app/projects/page.tsx`) and case page (`src/app/projects/[id]/page.tsx` and its `*-panels.tsx`, `hidden-note.tsx`,
  `adjustment-refused.tsx`, `employer-signing-note.tsx`); dates (`formatDate`, `formatOrgDay`, `formatOrgDateTime` in
  `src/lib/format.ts`: English month names and "(UTC — time zone not set)").
- **Stored notice text.** `StaffNotice.title` / `body` are English sentences composed when the notice is raised
  (`src/lib/inbox/notices.ts`). They are records, not labels.
- **Who is signed in.** `StaffActor` (`src/lib/auth/types.ts`), built by `src/lib/auth/session-store.ts` and `src/app/_auth/loader.ts`,
  read by `currentStaffOrNull` (`src/app/_auth/actor.ts`). The root layout (`src/app/layout.tsx`) renders `<html lang="en">`,
  `ActorProvider` and `AppShell`. `StaffAccount` (`prisma/schema.prisma`) has no language column.
- **Drawers are modal.** Ruling 20bt (`src/components/ui/dialog-focus.ts`): an open drawer is `aria-modal`, Tab cycles inside it and the
  scrim closes it. **The top bar cannot be reached while a drawer form is open.**
- **Refresh.** Next 16 `refresh()` from `next/cache`, callable only inside a Server Action, refreshes the client router in place
  (`node_modules/next/dist/docs/01-app/03-api-reference/04-functions/refresh.md`). Client state survives a refresh as long as the tree
  position and keys do not change.
- **DOM tests.** `// @vitest-environment jsdom` with `createRoot` + `act` (`src/components/auth/auth-form.test.ts`). `vitest.config.mts`
  includes `src/**/*.test.ts` only, so DOM tests are `.ts` files using `createElement`.
- **Latest migration:** `20261110000000_staff_notices_indent_and_commencement`. Latest ADR: 0039.

## 2. The target

1. A pure layer in `src/lib/i18n` that takes a `Words` object and a language and returns the string. **No string-key lookup exists**
   (no `t("nav.dashboard")`), so a key cannot reach a screen by construction. A `Words` with a blank `ms` renders its English. A pinned
   test lists every such word in the registered catalogues.
2. `StaffAccount.uiLanguage`: nullable. Null means never chosen. It reads as English, as today, and the user menu says "English, the
   default: not chosen".
3. A switch (English / Bahasa Malaysia) in the top bar **and in the shared drawer's header** (because a drawer is modal, see §5 Q3). It
   posts to a Server Action that saves the choice with its audit row and calls `refresh()`. No redirect, and nothing is keyed on the
   language, so a half-filled drawer keeps its values.
4. Converted: the shell, the shared components' own words, the Dashboard, the Inbox, and the Contracts list and case page (header,
   step bar, tabs, panel headings, and the refusals the page renders).
5. Every Malay pair drafted in this slice sits in a catalogue marked `DRAFTED_NOT_REVIEWED`. Existing pairs that are registered are
   marked `CARRIED_NOT_REVIEWED`. Neither is reviewed by the customer, and the registry can print both lists for RSAJ.
6. Every staff screen has a coverage state: `CONVERTED`, `PARTLY` or `NOT_CONVERTED` (the three-state honesty of provenance). A scan
   proves every staff `page.tsx` has a state. With Malay chosen, `AppShell` shows a `Callout` through `Bi` on a `PARTLY` or
   `NOT_CONVERTED` screen, saying in both languages that the screen, or parts of it, is not yet in Bahasa Malaysia.

## 3. Contracts

```ts
// src/lib/i18n/language.ts
export const LANGUAGES = ["en", "ms"] as const;
export type Language = (typeof LANGUAGES)[number];
/** As stored: null = never chosen (reads English, and says so). */
export type LanguageChoice = Language | null;
/** Hand validation (no schema library). Anything but exactly "en" or "ms" is refused. */
export function parseLanguageChoice(raw: FormDataEntryValue | null): { ok: true; value: Language } | { ok: false };
export function effectiveLanguage(choice: LanguageChoice | undefined): Language; // null | undefined -> "en"
/** Each language's own name, the same in both settings (a proper name, not a translated word). */
export const LANGUAGE_NAMES: Readonly<Record<Language, string>>; // { en: "English", ms: "Bahasa Malaysia" }
export function toStored(l: Language): "EN" | "MS";
export function fromStored(v: "EN" | "MS" | null): LanguageChoice;

// src/lib/i18n/say.ts
export function say(words: Words, lang: Language): string; // ms blank or whitespace -> en. Never "", never a key
export function enOnly(en: string): Words;                // { en, ms: "" }: the explicit "no Malay yet", which the pinned test lists
export function hasMalay(words: Words): boolean;
/** A sentence with values: a template per language, the values substituted. Placeholders are {name}. A missing value throws in tests. */
export function sayWith(words: Words, lang: Language, values: Readonly<Record<string, string>>): string;

// src/lib/i18n/registry.ts
export type Review = "DRAFTED_NOT_REVIEWED" | "CARRIED_NOT_REVIEWED";
export interface Catalogue { readonly name: string; readonly review: Review; readonly words: Readonly<Record<string, Words>> }
export const CONVERTED_CATALOGUES: readonly Catalogue[];  // every catalogue a converted screen renders
export function untranslated(cats: readonly Catalogue[]): { catalogue: string; key: string; en: string }[];
export function forReview(cats: readonly Catalogue[]): { catalogue: string; review: Review; key: string; en: string; ms: string }[];

// src/lib/i18n/coverage.ts
export type Coverage = "CONVERTED" | "PARTLY" | "NOT_CONVERTED";
/** Route patterns as the app folder names them, "/" separators: "/", "/inbox", "/projects", "/projects/[id]". */
export const SCREEN_COVERAGE: Readonly<Record<string, Exclude<Coverage, "NOT_CONVERTED">>>;
export const NOT_YET_CONVERTED: readonly string[]; // every other staff route pattern, pinned and sorted
export function routePatternOf(pathname: string, patterns: readonly string[]): string | null; // static segments beat [param]
export function coverageOf(pathname: string): Coverage; // unknown path -> NOT_CONVERTED (conservative)
export const NOT_CONVERTED_NOTICE: Words; // "This screen is not yet in Bahasa Malaysia." / its Malay
export const PARTLY_NOTICE: Words;        // "Parts of this screen are not yet in Bahasa Malaysia." / its Malay

// src/lib/format.ts: an optional trailing parameter, default "en", so no existing caller changes
formatDate(value, lang?: Language); formatOrgDay(instant, timeZone, lang?: Language); formatOrgDateTime(instant, timeZone, lang?: Language);
// Malay month abbreviations and the zone-unset note come from a DRAFTED catalogue `dates`
```

**Catalogues.** New words go in new catalogue files, each exporting a `Catalogue` with `review: "DRAFTED_NOT_REVIEWED"`:
`src/lib/i18n/catalogues/shell.ts`, `components.ts`, `dates.ts`, `dashboard.ts`, `inbox.ts`, `src/lib/contract/case-page-words.ts`.
Existing pairs (`case-list-words.ts`, `CONTRACT_STATUS_WORDS`, `PHASE_WORDS`) are registered as `CARRIED_NOT_REVIEWED` by reference;
they are not moved. A catalogue's keys are property names in code. They are never rendered, because `say` takes the `Words`, not the key.

**Schema (new migration `20261111000000_staff_ui_language`, nothing else in it):**

```prisma
enum UiLanguage { EN MS }
model StaffAccount { /* ... */
  /// The language this person chose for the staff screens (NFR-LNG-001). Null: never chosen, which reads English and says so.
  uiLanguage UiLanguage?
}
```

It creates the type and adds a nullable column. No backfill, and no existing row changes.

**Request plumbing.**
- `StaffActor` gains `uiLanguage?: LanguageChoice`. It is optional, so the ~30 fixtures that build an actor stay valid, and absent reads
  as unset. `session-store.ts` selects it.
- `src/app/_auth/language.ts`: `currentLanguage = cache(async (): Promise<{ choice: LanguageChoice; language: Language }>)`. With no
  staff session it returns `{ choice: null, language: "en" }`.
- `src/lib/auth/account-store.ts`: `setStaffLanguage(actor: StaffActor, next: Language): Promise<void>`. In one transaction it updates
  `StaffAccount.uiLanguage` and writes an `AuditEntry` (`entity "StaffAccount"`, `action UPDATE`, `changes [{ field: "uiLanguage",
  before, after }]`, actor from `toAuditActor`). The same value twice is a no-op with no row.
- `src/app/_auth/language-action.ts` (`"use server"`): `setLanguageAction(data: FormData): Promise<{ ok: true } | { ok: false;
  message: Words }>`. It calls `requireStaff({ on: "throw" })`, `parseLanguageChoice(data.get("language"))`, `setStaffLanguage`, then
  `refresh()` from `next/cache`. No permission is needed, because it is the person's own setting. It never redirects.
- Client: `src/components/i18n/language-context.tsx` exports `LanguageProvider({ language, choice, canSwitch })`, `useLanguage()` and
  `useSay(): (w: Words) => string`. It is mounted in `src/app/layout.tsx` beside `ActorProvider`. `<html lang>` follows `language`.
  Server components call `currentLanguage()`; client components call `useLanguage()`.
- `src/components/shell/language-switch.tsx`: two pressed-state buttons from the shared `Button` (or `Toggle`), each named in its own
  language. It is rendered only where `canSwitch` (a staff session, not `portalOnly`).

## 4. Steps

### Step 1. The i18n layer, the registry and the coverage scan (domain-engineer)

- **Write:** `src/lib/i18n/language.ts`, `say.ts`, `registry.ts`, `coverage.ts` as in §3. `coverage.ts` starts with
  `SCREEN_COVERAGE = { "/": "CONVERTED", "/inbox": "PARTLY", "/projects": "CONVERTED", "/projects/[id]": "PARTLY" }` and
  `NOT_YET_CONVERTED` = every other staff route. Also the `dates` catalogue and the `lang` parameter in `src/lib/format.ts`.
- **Docs, in the same commit:**
  - File ADR 0040 `docs/notes/architecture/0040-staff-screen-language-layer.md` from §2–§3 of this plan, status Accepted under AC-63 N1.
  - Log §5's questions in `docs/notes/decisions-log.md` as product-owner questions, each with its conservative default.
- **Tests:**
  - `say` falls back on a blank or whitespace `ms` and never returns "".
  - `sayWith` substitutes, and throws on a missing value.
  - `parseLanguageChoice` refuses "", "EN", "fr" and null.
  - `effectiveLanguage(null)` is "en".
  - `routePatternOf` prefers static segments.
  - `coverageOf` returns NOT_CONVERTED for an unknown path.
  - The Malay date for a fixed instant, and the English one unchanged.
  - **The scan (`coverage.scan.test.ts`):**
    - It walks `src/app/**/page.tsx`, excluding `src/app/supplier/**` (a later slice), `src/app/api/**` and any `_`-prefixed folder.
    - It strips `(group)` segments and maps each file to its route pattern, with **every path normalised to `/` before comparing**
      (the N4 lesson).
    - It asserts the walked set equals `keys(SCREEN_COVERAGE) ∪ NOT_YET_CONVERTED`, the two are disjoint, and `NOT_YET_CONVERTED` is
      sorted and pinned.
- **Done when:** `npx vitest run src/lib/i18n src/lib/format.test.ts` passes on Windows; `npm run check` passes; the ADR and the log lines
  are committed with the code.

### Step 2. The stored choice and the switch action (data-modeler, then api-engineer)

- **Migration.** Add `UiLanguage` and `StaffAccount.uiLanguage` to `prisma/schema.prisma`. Write
  `prisma/migrations/20261111000000_staff_ui_language/migration.sql` from `npx prisma migrate diff --from-config-datasource --to-schema
  prisma/schema.prisma --script`, with no `;` inside a comment.
- **Apply.** Apply to `perolehan_native_check` first, then to `perolehan`, and confirm the diff is empty. Then `npx prisma generate`.
  - Check `scripts/db-roles.ts`: the app role must be able to UPDATE the new column (grants are table-level today; confirm it).
  - **The founder's dev server needs a restart** to load the new client. Report it; do not restart it.
- **Plumbing.**
  - `StaffActor.uiLanguage`, selected in `src/lib/auth/session-store.ts` (and `src/app/_auth/loader.ts` if it builds the actor).
  - `currentLanguage`, `setStaffLanguage` and `setLanguageAction` as in §3.
- **Tests:**
  - Unit: the action refuses a bad value with a `Words` message and never redirects (mock `next/cache`'s `refresh`, assert it was called
    once on success and not on refusal).
  - `npm run test:db`, `src/lib/auth/language.db.test.ts`:
    - The column starts null.
    - A choice writes one `AuditEntry` with before null and after "MS", in the same transaction.
    - Choosing the same value again writes nothing.
    - A second account's row is untouched.
- **Done when:** the migration is applied to both databases with an empty diff; `npm run check`, `npx vitest run src/lib/i18n
  src/lib/auth src/app/_auth` and `npm run test:db` pass (`holding-edit.db.test.ts` is the known scratch-data failure).

### Step 3. The shell, the shared components, the switch and the callout (frontend-engineer, design-system-engineer for `src/components/ui`)

- **Root layout.** In `src/app/layout.tsx`: `currentLanguage()`, `<html lang={language}>`, and `LanguageProvider` beside `ActorProvider`.
- **Navigation.** `NavItem.label` and `NavGroup.label` become `Words` (`src/lib/nav.ts`, through the `shell` catalogue).
  - `sidebar.tsx`, `topbar.tsx`, `user-menu.tsx` and `record-crumb.tsx` render through `useSay()`.
  - Update `config-nav.test.ts` and `crumbs.test.ts` to read `.en`, citing AC-63 N1. No assertion is dropped.
- **The switch.**
  - `LanguageSwitch` goes in `topbar.tsx`, and in the shared drawer's header (`src/components/ui/drawer.tsx`) when `canSwitch`.
  - The user menu shows the current language. When `choice` is null it shows "English, the default: not chosen", from the catalogue.
  - The job title line uses `Person.jobTitleMs` when Malay is chosen and one is recorded, else `jobTitle`.
- **Shared components' own words.** Every string a shared component writes itself goes through the `components` catalogue: empty states,
  paging, "Close", "Cancel", sort and filter labels, the history drawer's headings and "—" captions. This covers `data-list.tsx`,
  `tabs.tsx`, `src/components/ui/*` and `history-drawer.tsx`. Words passed in by a screen are the screen's.
- **The callout.** In `app-shell.tsx`, above `children`: when it is the staff side, the language is `ms` and
  `coverageOf(usePathname())` is not CONVERTED, render `Callout` with `Bi`, using `NOT_CONVERTED_NOTICE` or `PARTLY_NOTICE`.
- **Tests:**
  - **The acceptance test, `src/components/i18n/language-switch-keeps-input.test.ts` (jsdom):**
    - Mount `LanguageProvider language="en"` around the shared `Drawer` holding a `RecordEditor` with a text field, a select and a textarea.
    - Type values, then `root.render` the same tree with `language="ms"`.
    - Assert every value is unchanged, the drawer is still open, and the drawer's own words are now Malay.
  - A source scan: no `key={` expression in `src/app` or `src/components` mentions the language.
  - The callout appears for `/requisitions` with `ms`, not with `en`, and not on `/`.
  - The user menu shows the "not chosen" words for a null choice.
- **Done when:** the tests pass; `npm run check` passes (including `scripts/check-ui.mjs`); `npx vitest run src/components src/lib/i18n
  src/app/_auth` passes; the ui-guidelines-reviewer compares the top bar and a drawer with their siblings and reports no Must or Should.

### Step 4. The Dashboard, the Inbox and the Contracts screens (frontend-engineer)

- **Dashboard.** `src/app/page.tsx` and the words `src/lib/dashboard.ts` and `src/lib/dashboard/*.ts` produce. A lib function that
  returns an English string returns `Words` (or takes `lang`), and is tested.
- **Inbox (`/inbox`).**
  - The screen's own words and `STAFF_NOTICE_KIND_LABEL` become `Words`.
  - A notice's stored `title` and `body` show as written (§5 Q2). That is why `/inbox` is `PARTLY`.
- **Contracts list (`/projects`).** Every column, filter, view name, chip and empty state is converted. Dates use `formatOrgDay(..., lang)`.
- **Case page (`/projects/[id]`).**
  - Converted: the `PageHeader` (title words, status badge, facts labels and actions), the `Stepper` steps and its `label`, the tab
    names, every `CardHeader` title in the `*-panels.tsx` the page renders, and the refusals the page itself renders (`Blocked`,
    `hidden-note.tsx`, `adjustment-refused.tsx`, `employer-signing-note.tsx`).
  - Panel bodies, drawer forms and the messages Server Actions return stay English in slice 1 (§5 Q1), so the page is `PARTLY`.
  - New pairs go in `src/lib/contract/case-page-words.ts`, as `DRAFTED_NOT_REVIEWED`.
- **Register** each new and carried catalogue in `CONVERTED_CATALOGUES`.
- **Tests:**
  - The untranslated pin: `untranslated(CONVERTED_CATALOGUES)` equals a pinned list, expected empty. Any entry is a deliberate
    `enOnly`, named.
  - No `en` or `ms` in any registered catalogue matches `/_|^[A-Z][A-Z0-9]+$/` (codes never on screen).
  - Every new catalogue is `DRAFTED_NOT_REVIEWED`.
  - The existing `case-list-words.test.ts` still passes.
- **Done when:** `npm run check` passes; `npx vitest run src/lib/i18n src/lib/contract src/lib/inbox src/lib/dashboard src/app/projects
  src/components` passes; the ui-guidelines-reviewer compares the four screens with their siblings in both languages.

### Step 5. Proof, the record and the Linux suite (test-engineer)

- **The snapshot.**
  - If a scratch login exists, on a scratch server and a scratch database made by `demo:load` (never `perolehan`, never signing in
    against it):
    - Choose Malay and run `scripts/text-snapshot.mjs` over `/`, `/inbox`, `/projects` and one `/projects/[id]` per stage.
    - Assert that no English word remains except names, data, stored notice text (Q2), `LANGUAGE_NAMES`, the `Bi` callout's English
      line, and on the case page the regions §5 Q1 leaves English.
  - If no scratch login exists (it is blocked today, AC-63), log the snapshot as owed with that reason.
- **The backlog.** Rewrite the NFR-LNG-001 row in `docs/notes/backlog.md`. It must say:
  - what slice 1 covers, and that the case page and Inbox are partly converted;
  - what is next: the remaining staff screens per `NOT_YET_CONVERTED`, the case page's panel bodies and action messages, Malay notice
    text, and the supplier portal;
  - that **RSAJ's review of the Malay remains the go-live gate**, with `forReview(CONVERTED_CATALOGUES)` as the list RSAJ reads.
- **Done when:** `NODE_OPTIONS=--max-old-space-size=14000 npm run check` passes; `powershell -NoProfile -File scripts/test-linux.ps1`
  passes; `npm run test:db` passes (bar the known case); the backlog row and the log lines are committed.

## 5. Questions for the product owner (step 1 logs each, with the default taken)

- **Q1. The case page is partly converted.** The scope converts its header, step bar, tabs, panel headings and refusals, but its panel
  bodies, drawer forms and action messages are many more words.
  - Default: the page is `PARTLY`, the callout says "parts of this screen", and the snapshot covers only the converted regions.
  - Saying "no English" over the whole page would overstate it.
- **Q2. Stored notice text.** `StaffNotice.title` and `body` are written once, in English, when the notice is raised.
  - Default: shown as written, and `/inbox` is `PARTLY`.
  - Malay notices need a Malay copy stored at write time, which is a later slice. Old notices are never rewritten.
- **Q3. The switch inside a drawer.** Drawers are modal (ruling 20bt), so the top bar cannot be reached mid-form, and pressing the scrim
  closes the drawer.
  - Default: the same switch also sits in the shared drawer's header.
  - This is the only reading under which "switching mid-task loses no entered data" can be met.
- **Q4. Dates are words.** Month names and "(time zone not set)" are interface words, not data.
  - Default: Malay on converted screens, through `format.ts`'s optional `lang`, drafted and unreviewed.
- **Q5. The choice is audited.** It is a personal setting, but every state change is auditable.
  - Default: one `AuditEntry` per actual change. No step-up, no permission, no maker-checker.
- **Q6. Before sign-in there is no choice.**
  - Default: sign-in and welcome screens stay English and are listed in `NOT_YET_CONVERTED`.
  - The callout cannot show there, because there is no session.
- **Q7. Language names.** Each option is named in its own language ("English", "Bahasa Malaysia") in both settings.
