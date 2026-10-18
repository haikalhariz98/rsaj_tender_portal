# 0040 — The staff screens' language layer

**Status:** Accepted for the AC-63 N1 scope. Q1–Q7 open, defaults taken. Written on 2026-10-19 from the N1 build plan
(`docs/notes/plans/backlog-n1.md` §2–§3). The product owner's scope is the decisions-log line "2026-10-19 · Product owner (for the
founder), AC-63 N1". The open questions Q1–Q7 are logged in the decisions log as product-owner questions, each with the default this
record takes. If an answer differs from its default, this record is amended before the slice that depends on it is built.

**RSAJ's review of the Malay remains the go-live gate.** This record makes the staff screens switchable. It does not make the Malay final.

## Context

NFR-LNG-001 (M) asks for "a full internationalisation layer ... for every user-interface label, message, validation text and
notification, selectable per user and switchable without loss of context". Its acceptance: "A user switching language mid-task sees the
whole interface in the selected language and loses no entered data."

What was true at the time:
- **One pair shape already exists.** `Words { en; ms }` and `w(en, ms)` in `src/lib/contract/labels.ts`, held by about 145 files under
  `src/lib`. Screens render `.en`. Rulings 20ab and log 1936 forbid a second shape.
- **Other bilingual sources** exist and stay as they are: `src/lib/labels.json` with `matterLabel`, `Person.jobTitleMs`, and the
  supplier portal's own tables. `Bi` (`src/components/ui/bilingual.tsx`) renders both languages at once.
- **The shell, the shared components, the Dashboard, the Inbox and the Contracts screens are English only**, and so are dates: English
  month names and "(UTC — time zone not set)" in `src/lib/format.ts`.
- **Stored notice text** (`StaffNotice.title`, `body`) is English, written once when a notice is raised. It is a record, not a label.
- **Drawers are modal** (ruling 20bt). The top bar cannot be reached while a drawer form is open.
- **`refresh()`** from `next/cache` (Next 16), called in a Server Action, refreshes the router in place. Client state survives as long as
  tree positions and keys do not change.
- `StaffAccount` has no language column.

## Decision

**D1. A pure layer over `Words`, with no string-key lookup.** `src/lib/i18n`:
- `language.ts`: `LANGUAGES = ["en", "ms"]`, `Language`, `LanguageChoice = Language | null`, `parseLanguageChoice` (hand validation:
  anything but exactly "en" or "ms" is refused), `effectiveLanguage` (null or undefined reads "en"), `LANGUAGE_NAMES` (each language
  named in its own language), `toStored` and `fromStored` (the `UiLanguage` enum's `EN` / `MS`).
- `say.ts`: `say(words, lang)` takes a `Words` and returns the string. A blank or whitespace `ms` renders the English. The result is
  never "" and never a key: a pair with blank English is refused with a typed error naming the rule. `enOnly(en)` is the explicit "no
  Malay yet". `hasMalay(words)`. `sayWith(words, lang, values)` fills `{name}` placeholders in one pass and throws on a missing value.
- There is no `t("nav.dashboard")`. A key cannot reach a screen by construction, because `say` takes the pair, not its name.

**D2. Catalogues and their review state.** `registry.ts`:
- A `Catalogue` is `{ name, review, words }`, where `review` is `DRAFTED_NOT_REVIEWED` (a Malay pair drafted in this slice) or
  `CARRIED_NOT_REVIEWED` (an existing pair registered by reference, not moved). Neither is reviewed by the customer.
- New words go in new catalogue files: `src/lib/i18n/catalogues/shell.ts`, `components.ts`, `dates.ts`, `dashboard.ts`, `inbox.ts`, and
  `src/lib/contract/case-page-words.ts`. Existing pairs (`case-list-words.ts`, `CONTRACT_STATUS_WORDS`, `PHASE_WORDS`) are carried.
- `CONVERTED_CATALOGUES` lists every catalogue a converted screen renders. `untranslated(cats)` lists every pair with no Malay, and a
  pinned test holds that list. `forReview(cats)` is the list RSAJ reads.

**D3. Every staff screen has a coverage state.** `coverage.ts`:
- `CONVERTED`, `PARTLY` or `NOT_CONVERTED`: the three-state honesty of provenance.
- `SCREEN_COVERAGE` holds the converted screens by route pattern: `/` and `/projects` converted, `/inbox` and `/projects/[id]` partly.
- `NOT_YET_CONVERTED` is every other staff route pattern, pinned and sorted.
- `routePatternOf` resolves a pathname to a pattern, a static segment beating a parameter.
- `coverageOf` reads an unknown path as `NOT_CONVERTED`.
- A scan proves every staff `page.tsx` (not the supplier portal, the api, a private folder, or the three old award addresses AC-23
  keeps, which only redirect and render nothing) is in exactly one list.
- With Malay chosen, `AppShell` shows a `Callout` through `Bi` on a `PARTLY` or `NOT_CONVERTED` screen, saying in both languages that
  the screen, or parts of it, is not yet in Bahasa Malaysia (`PARTLY_NOTICE`, `NOT_CONVERTED_NOTICE`).

**D4. Dates are words.** `formatDate`, `formatOrgDay` and `formatOrgDateTime` take an optional trailing `lang`, English by default, so
no existing caller changes. Month abbreviations and the zone-unset note come from the drafted `dates` catalogue (Q4).

**D5. The choice is stored per person, nullable.** A new migration adds `enum UiLanguage { EN MS }` and `StaffAccount.uiLanguage
UiLanguage?`, with no backfill. Null means never chosen. It reads English, as today, and the user menu says "English, the default: not
chosen".

**D6. Request plumbing.**
- `StaffActor.uiLanguage?: LanguageChoice` is optional, so existing fixtures stay valid, and absent reads as unset.
- `currentLanguage()` (`src/app/_auth/language.ts`, cached per request) returns `{ choice, language }`. With no staff session it is
  `{ choice: null, language: "en" }`.
- `setStaffLanguage(actor, next)` updates the column and writes one `AuditEntry` (`StaffAccount`, `UPDATE`, `uiLanguage` before and
  after) in one transaction. The same value twice writes nothing (Q5).
- `setLanguageAction(data)` is a Server Action. It requires a staff session, parses the value, saves it and calls `refresh()`. It
  needs no permission, because it is the person's own setting, and it never redirects.
- `LanguageProvider`, `useLanguage()` and `useSay()` serve client components. Server components call `currentLanguage()`. `<html lang>`
  follows the language.

**D7. The switch never touches a form.** `LanguageSwitch` is two pressed-state buttons, each named in its own language (Q7), in the top
bar and in the shared `DrawerHeader` (Q3). They are `type="button"` and call the action inside `startTransition`. They are never a
submit button, a `formAction` or a `<form>`: the drawer's header is drawn inside the drawer's `<form>`, so a submit button would submit
it, a nested form is invalid, and React 19 resets a form's uncontrolled fields after a successful form action. Nothing is keyed on the
language, so a half-filled drawer keeps its values across the refresh.

**D8. The first slice converts** the shell, the shared components' own words, the Dashboard, the Inbox (not stored notice text, Q2),
the Contracts list, and the case page's header, step bar, tabs, panel headings and refusals (Q1). Supplier portal screens are a later
slice. Sign-in and welcome stay English (Q6).

## Open questions, defaults taken

- **Q1.** The case page is partly converted. Default: `PARTLY`, the callout says "parts of this screen", and the snapshot covers only the
  converted regions.
- **Q2.** Stored notice text shows as written, and `/inbox` is `PARTLY`. Malay notices need a Malay copy stored at write time, in a later
  slice. Old notices are never rewritten.
- **Q3.** The switch also sits in the shared `DrawerHeader`, as `type="button"` controls. This is the only reading under which switching
  mid-task can keep entered data, because a drawer is modal.
- **Q4.** Month names and "(time zone not set)" are interface words. Malay on converted screens, drafted and unreviewed.
- **Q5.** One `AuditEntry` per actual change. No step-up, no permission, no maker-checker.
- **Q6.** Sign-in and welcome stay English and are listed in `NOT_YET_CONVERTED`. The callout cannot show there, because there is no
  session.
- **Q7.** Each option is named in its own language ("English", "Bahasa Malaysia") in both settings.

## Consequences

- **Easy:** converting a screen is mechanical. Its words become `Words` in a catalogue, it renders through `say`, and it moves from
  `NOT_YET_CONVERTED` to `SCREEN_COVERAGE`. The scan fails if a new staff screen is added without a state.
- **Easy:** RSAJ's review has one list, `forReview(CONVERTED_CATALOGUES)`, and a word with no Malay is named by a test rather than
  rendered blank.
- **Hard:** the converted surface is a fraction of the staff screens. Until the rest move, a Malay reader sees the callout on most
  screens, which is the honest state, not a defect.
- **Hard:** composed sentences in `src/lib` that return English strings must change to return `Words` (or take `lang`) as their screens
  are converted.
- **Rules out:** a string-key lookup, a second pair shape, and keying any component on the language.
- **Rules out:** rewriting stored records (notice text) on a language change.

## As built in step 3 (the shell and the switch)

- The root layout reads `currentLanguage()`, sets `<html lang>` and mounts `LanguageProvider` beside `ActorProvider`. The server action that saves the
  choice is handed to the provider as a prop, as `signOut` is to `AppShell`, so no component imports the server and a drawer tests without a database.
  With no action handed in the provider offers no switch.
- `LanguageSwitch` is the shared `Toggle` (`type="button"` controls) calling the action inside `startTransition`. It sits in the top bar and in
  `DrawerHeader`, on its own row under the drawer's title. It has no `<form>`, no `formAction` and no submit button, because `RecordEditor` draws
  `DrawerHeader` inside its own form. The fixed "EN" mark is gone.
- Navigation labels, group names and breadcrumb labels are `Words` (catalogue `shell`). Shared components' own words are the `components` catalogue.
  Both are registered as `DRAFTED_NOT_REVIEWED`. Words that need a value use `{name}` placeholders through `sayWith`.
- With Malay chosen, `AppShell` shows a `Callout` through `Bi` on a staff screen whose `coverageOf(pathname)` is not `CONVERTED`.
- Proof: `language-switch-keeps-input.test.ts` opens a real `RecordEditor`, types into a text field, a select and a textarea, clicks the switch in the
  drawer's header, and asserts the values, the open drawer and the same form element survive, nothing was submitted, and the drawer's words are Malay.
  A source scan holds that no `key={...}` mentions the language.
