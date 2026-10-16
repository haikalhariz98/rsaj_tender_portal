# Perolehan

Procurement and contract administration: value-banded authority limits, committee
recommendations, and an audit trail behind every decision.

**Stack:** Next.js 16 (App Router, TypeScript) · Prisma 7 · Postgres 17.

## Status

A working shell and two engines, with **no organisation's data in it**. Configure an
authority matrix and committees, and the rest of the portal builds on top.

Nothing ships with sample limits or committees on purpose: those are policy, and
shipping someone else's is how a wrong threshold reaches production. Every screen
handles the unconfigured state and says what is missing.

## Getting started

Requires Node 20+ and Docker Desktop running.

```bash
cp .env.example .env
npm install
npm run setup           # Postgres, migrations, and one empty organisation
npm run dev             # http://localhost:3000
```

Set who you are in `.env`:

```
ORGANISATION_CODE=ACME
ORGANISATION_NAME=Acme Water
ORGANISATION_STRAPLINE=Procurement
```

## What is built

### The shell

Two workspaces — internal staff and a supplier portal — with a switch in the top bar.
Navigation, breadcrumbs, page heads, cards, stat tiles and a `DataList` with search,
sort, filters, row selection, density and CSV export. Modules that do not exist yet
appear in the navigation and say plainly that they are not built.

### The authority engine

`src/lib/authority/resolve.ts` answers one question: *given a matter and a value, who
must propose, recommend and approve, and under what authority?* It is a pure function
over a matrix, so routing is testable without a database.

- Bands on the matter's value, on a percentage of contract sum, and on the parent
  contract's value — three independent families
- Most-specific rule wins; matters with no rule rank last and warn
- **Upward-reverting absence** — when a holder is absent, authority rises, never falls
- **No self-approval** — an actor who is also the approver is downgraded to
  recommender and the approval escalates
- Superintending Officer resolved from contract value
- External-funding override

### The committee engine

`src/lib/committee/quorum.ts` decides whether a sitting may lawfully record a decision.

- **Quorum has three states, not two**: met, not met, and *not set*. An unset quorum is
  not a quorum of zero, and a full room does not make an unwritten rule lawful.
- Individual votes, never one aggregate committee position
- A **mandatory recommendation requires every entitled member to vote**
- **A tie does not carry** — the system does not invent a casting vote

`npm test` runs 44 tests over both, against a synthetic fixture in
`src/lib/authority/fixture.ts` rather than any real organisation's limits.

## Provenance

Governing documents are often silent on things the system must still decide — who sits
on a committee, what its quorum is. Configuration therefore records **where a fact came
from**: `STATED` (written down), `OBSERVED` (seen in practice), `ASSUMED` (neither).
A screen that renders a written rule and an observed habit identically overstates its
own authority.

## Layout

```
prisma/
  schema.prisma        Organisation, AuthorityRole, AuthorityMatrix, AuthorityRule,
                       Committee, Meeting, CommitteeDecision, Vote
  seed.ts              Creates one empty organisation and nothing else
src/lib/authority/     The routing engine, its types, its loader and its test fixture
src/lib/committee/     Quorum and vote arithmetic
src/app/               Dashboard, Configuration, and the module placeholders
src/components/        Shell, DataList, accordion, rule chain, icons
src/app/design-system.css          Ported design system
src/app/design-system-runtime.css  Second stylesheet, extracted from the prototype
scripts/               Tooling to render a prototype and diff this app's DOM against it
```

## Scripts

| Script | What it does |
| --- | --- |
| `npm run dev` / `build` / `start` | Next dev server / production build / serve |
| `npm test` / `test:watch` | Vitest |
| `npm run lint` / `typecheck` | ESLint / `next typegen` + `tsc --noEmit` |
| `npm run setup` | `db:up` → `db:migrate` → `db:seed` |
| `npm run db:up` / `db:down` | Start (wait for healthy) / stop Postgres |
| `npm run db:reset` | **Destroys the volume**, then re-runs setup |
| `npm run db:migrate` | Prompts for a migration name — pass `--name` in scripts. Then runs `db:roles` |
| `npm run db:deploy` | `prisma migrate deploy`, then `db:roles`: the production pair |
| `npm run db:roles` | Makes or brings into line the app's own database login (`APP_DB_PASSWORD`); see below |
| `npm run test:db` | The tests that need a database, against `TEST_DATABASE_URL` only |
| `npm run demo:load` / `demo:results` | Load the invented demonstration once; add its Results fixture. Additive: nothing is ever written twice |
| `npm run demo:wipe` | Retired: refuses and explains. The trail is permanent, so a demo database is replaced, never emptied |

## The online sealed-bid demonstration

`npm run demo:load` on a fresh database also makes one online exercise (wave 3b step 18), so the screens for sealed bids have something to show. It is invented, a demonstration and not for real tenders, and it is made **only inside `demo:load` on a fresh database**: on one that already holds the demonstration the loader writes nothing and says which settings are not set.

- **It needs the deployment to allow demonstration bids.** Set `SEALED_BIDS_DEMONSTRATION_ALLOWED=true` in `.env` before loading (see `.env.example`). Without it the load still completes, but the organisation's channel is set to paper, no online exercise is made, and the load prints in words that the flag is what is missing. It also needs a working day: the exercise closes minutes after the load, on the load day, and the organisation's calendar refuses a closing on a weekend or a public holiday, so a load on one of those (or within minutes of midnight) falls back to paper in the same way, and says so.
- **What it makes.** The organisation's channel set to online and its bid sealing mode to demonstration (both audited as the demo loader); every exercise the earlier demos authored pinned to paper; one open tender made by the product's own create act, with two opening officers named, their shares set and the exercise key made, the company estimate lodged sealed, and the window published. Two suppliers then bid in time (one replaces its bid) and a third bid is received late, so **Received shows two standing and one late**. The window permits alternatives, so one can be lodged from the supplier portal.
- **Waiting.** The exercise closes a few minutes after its bids are made, so the load pauses for about four minutes while the database's own clock passes the closing; that is what makes the last bid late. It is the only pause.
- **Signing in.** `DEMO_ACCOUNT_PASSWORD=... npm run demo:accounts` gives the demonstration's people accounts, the two opening officers among them, and the suppliers' accounts (`demo.supplier6`, `demo.supplier7` and `demo.ctr13` bid; each waits for activation). The load prints the officers' names and their **unseal passphrases**, which are invented and are these, in the order the officers are named: `demo unseal passphrase one, 2026` and `demo unseal passphrase two, 2026`. An officer needs the sign-in password and their own passphrase together to unseal, and the passphrase must never be the sign-in password.
- **If the deployment holds a sealing pepper** (`SEALING_PEPPER`), the officers' keys are wrapped with it, as they would be live, and the exercise is in the pepper list's scope: keep the pepper while it stands.
- **What is not signed.** The officers' shares and the suppliers' submissions are written by the loader, in the order the product writes them and with its own sealing code, and are attributed to the demo loader on the person's or the supplier's behalf, never as a signature: nobody entered a password for them. The keys are real, and the passphrases above open them.
- **Proof.** `src/lib/demo/demo-additive.db.test.ts` loads two throwaway databases (flag set, flag unset), then runs the officers' unseal and one officer's finalise on the first (`scripts/online-demo-harness.ts`, through `vitest.demo-harness.config.mts`). Neither ever touches `DATABASE_URL`.

## Design fidelity tooling

`scripts/` can run an HTML prototype in jsdom, print its rendered structure, and diff
this app's DOM against it — so "does it match" is a measurement rather than an opinion.

```bash
PROTOTYPE=your-prototype.html node scripts/render-prototype.mjs out screen "Configuration"
node scripts/outline.mjs out/rendered-screen.html .content 6
node scripts/compare-shell.mjs out/rendered-screen.html http://localhost:3000/
```

A prototype may inject a second stylesheet from its JavaScript; `extract-runtime-css.mjs`
pulls that out. Porting only the `<style>` block leaves screens unstyled.

## Putting the supplier portal on a public address

Staff screens ask for a staff sign-in, but a copy that strangers can reach should not serve them at
all. The supplier portal (`/supplier`) is meant for strangers, so it must be served by its own copy of the
product, started with `PORTAL_SURFACE=public`: that copy answers only the portal's pages and the
one registration POST, and gives a 404 to everything else. The officers' copy is started without
it and stays on the officers' network. Both read the same database. `src/proxy.ts` is the
boundary and `src/lib/portal/surface.ts` holds its rules, with tests.

The public registration form stays closed until the organisation has set its numbering series for
online applications, the notice about personal details (English and Malay) and both limits, under
Configuration, Supplier register. It does not defend itself against a determined flood: per-address
limits and a challenge belong at the edge in front of the public copy.

## Running in production

Sign-in (ADR 0034) assumes all of the following. None is optional.

- **HTTPS, end to end to the browser.** The session cookies are `__Host-`, Secure, HttpOnly and
  SameSite=Lax; over plain HTTP a browser drops them and nobody can sign in.
- **The app's own database login.** Set `APP_DB_PASSWORD`, run `npm run db:deploy` (migrations as
  the owner, then `db:roles`), point `DATABASE_URL` at `perolehan_app` and `MIGRATE_DATABASE_URL`
  at the owner, and restart. Run `db:roles` again after **every** `migrate deploy`: a table a
  migration adds is writable by the app until it does. `db:deploy` does this for you, and a
  migration job needs only the owner's login: with `APP_DB_PASSWORD` unset, `db:roles` leaves an
  existing role's login and password alone and only brings its grants into line. A production
  copy connected as the owner or a superuser, or as a login that can still change the trail,
  refuses every sign-in. The trail's triggers refuse changes for every login regardless; the
  role is the second wall.
- **A stable `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY`**, the same on every copy, or every open form
  breaks at a redeploy.
- **`TRUSTED_PROXY_HOPS`**, set to exactly the number of reverse proxies that append to
  `X-Forwarded-For`, and only behind them. Unset, addresses are not recorded and the address
  throttle is off (per-account lockout still holds).
- **`SERVER_ACTION_ALLOWED_ORIGINS`** naming the public host, when a proxy rewrites the host.
- **Strip `x-middleware-subrequest`** from every incoming request at the reverse proxy.
- No second sign-in factor exists (NFR-SEC-005 is not met). Going live without one needs the
  founder's go-ahead and the customer's written acceptance.

## Notes for a second customer

`organisationId` is on every configuration table, and every load and write by id names the
signed-in person's organisation. The supported deployment is one organisation per database
(ADR 0034 D10): a second customer is a second database, seeded.

## Renaming

`perolehan` appears in the directory name, `package.json`, `compose.yaml` (`name:`,
which pins the Docker volume) and `.env`. Run `docker compose down -v` **before**
changing them, or the old volume is orphaned.
