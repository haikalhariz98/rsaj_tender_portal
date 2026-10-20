# 0006 — The supplier portal's front door: sign-in and register as one landing

Status: proposal by the UX lead, 2026-10-20. Not yet ruled. Bound by 0005 (minimal words), English only, desktop only
(1280 to 1920 wide).

**The founder (2026-10-20)**, on the staff copy's `/supplier/sign-in`, which shows a yellow warning and one link: "is this the
current standard practice? first it look weird and not attractive enough for user to register. Maybe add some graphic or
animation something like in the example." His example is an "Online Registration" landing: a short headline, a line, two
buttons, and a large isometric illustration of a form being submitted.

## 1. The short answer

- **No, today's page is not standard.** The screenshot is the staff copy. Suppliers never see that warning, because the public
  copy shows a form. But both copies draw sign-in as a plain page inside the sidebar, with nothing that says what the portal is
  for or why a company would join.
- **Yes, a split landing is a common current pattern.** Brand and illustration sit on one side and the form on the other. Our
  own staff sign-in already does it. The supplier door should match the officers' door in quality and differ in tone.
- **Registration belongs on the supplier sign-in page.** SAP Business Network's supplier login page carries a "Register Now"
  entry beside the sign-in. (Checked 2026-10-20 against SAP's support FAQ. Coupa's supplier portal documentation describes its
  sign-in flow but not its layout, so this note cites no layout from it.)

## 2. Who, how often, what goes wrong

| Who | How often | Arrives from | Needs |
| --- | --- | --- | --- |
| Returning supplier contact | A few times a month, often from a site office | The top bar's "Sign in" | Sign-in name and password, then straight on. |
| New company | Once | An advert, an opportunity page or the home page | To see in five seconds that it can join online, then a clear button. |
| Accepted but not activated | Once | The activation code the office handed over | The "I have an activation code" path. |
| Officer on the staff copy | Occasionally | The "Supplier portal" workspace | To know this is not where suppliers sign in, and a way to the real one. |

**What goes wrong today:**
- The page looks like an internal settings screen (a title, a card and a sentence), so a new company sees no reason to register.
- "Not registered yet? Apply to join the supplier register." is a text link under the card, the smallest thing on the page.
- On the staff copy, 25 words of yellow warning describe the deployment instead of offering the way out.

## 3. Recommendation

One frame, `SignInScreen`, gets a **supplier variant**, and draws four portal pages:
- `/supplier/sign-in`
- `/supplier/register`
- `/supplier/activate`
- `/supplier/reset`

It draws them on **both** copies. Only the right-hand side differs between copies:
- **Public copy:** the form.
- **Staff copy:** a card that sends the officer to the public portal.

The founder reviews on the staff copy (localhost:3000). A landing that existed only on the public copy would look to him as if
nothing had changed.

The left panel is **light**: a soft brand-50 to white wash, with indigo ink. The staff panel is dark (brand-900, white type over a
shaded photograph). There are three reasons for the difference:
- The illustration reads on light.
- The organisation's ordinary logo reads on light without the halo the staff panel needs.
- The two doors stay recognisably different, which helps an officer who has both open.

### 3.1 Frame and shell

- **Shell.** `AppShell` already drops the sidebar for `isSignInPath`. Add a sibling, `isPortalLandingPath`, in
  `src/lib/auth/routes.ts`, listing the four literal paths above. The shell returns the bare children for it on both copies.
- **The layout grid** is the staff one, `lg:grid-cols-[48fr_52fr]`, so the two doors line up.
  - Register uses `lg:grid-cols-[40fr_60fr]`. Its form has two-column field grids and needs about 720 px.
  - On register, the left panel is `sticky top-0 h-dvh` and the form column scrolls.
- **Ways out.** A stranger must never hit a dead end.
  - The logo (or the portal name, without a logo) links to `/supplier`.
  - The right column's top edge carries two quiet text links: **Opportunities** and **Results**.
  - On register the second link is **Sign in**.
- **Footer.** Reuse the staff footer: © year, organisation name, and the Privacy, Terms and Help Desk links already configured
  for the staff sign-in. Those links belong to the organisation, not to a door.

### 3.2 Left panel (all four pages, both copies)

From top to bottom:

1. **Logo:** the organisation's ordinary logo, at the staff sizing rule (`showsNameBesideLogo`). Without a logo, the
   organisation's display name in bold.
2. **Headline:** configured. With none set, the product's neutral words **"Supplier portal"**. That is a product label like
   "Sign in", not customer text. 36 to 44 px, extrabold, `text-balance`, ink colour.
3. **One line:** configured, at most 120 characters. With none set, nothing is drawn: no stand-in sentence.
4. **Three highlights:** configured, each with an icon from the shared set. Each is drawn as a 48 px brand-100 circle with a
   brand-700 glyph and a label of at most 40 characters underneath. Only the highlights that are set are drawn. With none set,
   the row is not drawn.
5. **Illustration:** fills the lower half of the panel, at most 460 px wide, with a fixed aspect ratio (no layout shift). If the
   organisation has uploaded its own supplier image, that image is drawn instead (§3.6).

The panel holds no button, so the page keeps one primary action, which is in the right column.

### 3.3 Right column: sign-in (public copy)

- **Card:** the staff card (`rounded-[28px] p-9 shadow-pop`), titled **Sign in**, with no subtitle.
  - If the URL has `?password=set`: the existing ok callout.
  - Sign-in name, then Password, with reveal. Unchanged.
  - **Sign in**: the one filled primary.
  - Two links, centred and stacked: **I have an activation code**, then **I have a reset code**.
  - One line: "Forgot your password? Ask the office for a reset code."
  - The padlock line: "Every sign-in is recorded."
- **Under the card, at the card's width:**
  - A label, "New supplier?"
  - A large, full-width secondary button, **Register as a supplier**, with the building icon, linking to `/supplier/register`.

**Why Register is secondary, not a second filled button.** Most visits to `/supplier/sign-in` are returning suppliers. Enter
and the eye should both go to Sign in. A new company has usually come from `/supplier` home, which already leads with a
Register card. Here, Register stands out by its size and position, and the panel beside it makes the case for joining.

**Today's activation button becomes a link.** Once Register is on the page, three large buttons would compete. The person with an
activation code is looking for exactly those words, so a link is enough.

### 3.4 Right column: staff copy (sign-in, activate and reset)

Today's warning callout is replaced by one card, in the same position as the form card:

- **Globe icon tile:** brand-50, the same tile as the home cards.
- **Title:** "Suppliers sign in on the public portal"
- **With the public address set:**
  - No line. The title and the button say it.
  - Button, primary: **Open supplier portal**, with an external-link icon. It opens `<public address>` plus the same path
    (`/supplier/sign-in`, `/supplier/activate` or `/supplier/reset`) in a new tab (`rel="noopener noreferrer"`).
- **With the public address not set:**
  - Line: "Public portal address not set."
  - For a person who may edit Organisation settings, a link: **Set it**, to the Organisation screen's supplier portal card.
  - For anyone else: "An administrator sets it in Configuration." This follows "the system explains itself": who can fix it.
- **Under the card:** the same **Register as a supplier** button as the public copy. The registration post is open on the staff
  copy (`SUBMIT_PATH` is in the gate's open set), so the button is true there too.

### 3.5 Register, activate and reset

- **Register:** the same left panel. The right column keeps today's content: the page title, the five-step stepper, the
  "Before you start" note and the form, or the closed `EmptyState`. Only the frame changes.
  - The page header's info popover stays.
  - The left panel replaces the need for a longer subtitle. Under 0005, the subtitle should drop to the organisation's name
    alone, but that wording is another workflow's file (§10).
- **Activate and reset:** the same frame and the same card as sign-in, with their forms unchanged. On the staff copy they show
  the §3.4 card.

### 3.6 The illustration

**What it shows.** An original inline SVG in the spirit of the example, not a copy of it:
- An isometric **browser window**, not a phone. The portal is desktop only. Drawing a phone would promise a phone experience the
  product does not offer, to a user who will then try it on one.
- **In the window:**
  - A title strip with a building glyph.
  - Four form-field bars.
  - A "submit" pill.
  - A large tick badge, top right, that appears at the end of the sequence.
- **A person**, stylised and flat, with no facial features. The figure stands at the window's lower left and reaches for the pill.
- **Three floating badges** on dashed connector lines: a document, a building and a shield-tick, in circles. These are the
  meanings of the three default highlights.
- **Palette:** tokens only. `var(--color-brand-100…700)` for the window and badges, slate ink for outlines and the person's
  trousers, brand-500 for the shirt, and the ok green for the tick. No gradients beyond two-stop brand washes. No external
  fetch, no raster and no font inside the SVG.

**Where it lives.** It is artwork, not an icon, so it goes in its own server component: `src/components/auth/portal-illustration.tsx`.
`icons.tsx` stays for glyphs. The SVG is `aria-hidden="true"` and `focusable="false"`.

**Motion.** Pure CSS keyframes, with the classes in `globals.css` under a `portal-art-` prefix. No JavaScript.

| Time | What moves |
| --- | --- |
| 0 to 0.5 s | The window rises 8 px into place and fades in. |
| 0.5 to 2.3 s | The four field bars fill left to right (`scaleX` 0 to 1, origin left), 0.35 s apart. The last bar shows password dots. |
| 2.5 s | The hand presses: the pill drops 2 px and darkens from brand-600 to brand-700. |
| 2.8 to 3.6 s | The tick badge scales from 0.6 to 1, and the tick draws (`stroke-dashoffset`). |
| 0 to 4.8 s | The floating badges bob ±6 px on a 2.4 s ease-in-out, twice. |
| After 4.8 s | Everything rests. |

**Why it plays once and stops.** It plays once per page load and the whole sequence is under 5 seconds. That meets WCAG 2.2.2
(Pause, Stop, Hide) without a pause control. A loop beside a password field would distract the person typing and would need
that control.

**Built so that no motion means the finished picture.**
- The SVG's own attributes draw the **finished** state: fields filled, tick shown.
- The keyframes run *from* the empty state with `animation-fill-mode: backwards`.
- So reduced motion, CSS that fails to load, or a print all show the completed form, never an empty one.

**Reduced motion must be written in this component.** The global rule in `globals.css` stops transitions only. It has no
`animation` line. So the component carries its own rule:
`@media (prefers-reduced-motion: reduce) { .portal-art-* { animation: none } }`.
Add a test that the rule exists, as `scripts/check-ui.mjs` does for retired classes.

**The organisation's own image.** It is a supplier variant, not the staff picture:
- **Storage:** a new table, `OrganisationPortalImage`, the same shape as `OrganisationSignInImage`.
- **Writes:** through the same `inspectImage`, store and audit path, with the same limits and PNG, JPEG or WebP. **No SVG
  upload**, because an uploaded SVG can carry script.
- **Drawing:** in the illustration's slot, `object-contain` with a rounded edge, never full-bleed. With an image set, the
  illustration is not drawn.
- **Why not reuse the staff picture?**
  - The staff photo is chosen to sit full-bleed under white type on a dark panel. In a contained slot on a light panel it
    composes badly.
  - An organisation may well want the two doors to differ.
  - The staff route `/sign-in/image/<sha>` is refused on the public copy by design.
- **Route:** `GET /supplier/portal-image/<sha>`.
  - It is a new pattern in `publicAllows`, matching one fingerprint segment. HEAD is allowed, since the route logs nothing.
  - It serves **only** `OrganisationPortalImage` rows of the deployment's organisation. The staff picture and the dark logo are
    never served by it.
  - Every miss is the same 404.
  - It is open without a session on **both** copies. The staff copy's gate already treats everything `publicAllows` lists as
    open, so this one pattern serves the staff-copy landing as well. Without that, an officer who is not signed in would get the
    sign-in redirect and an empty slot.
  - It sends the sniffed `Content-Type`, `X-Content-Type-Options: nosniff` and an immutable cache.
  - `surface.test.ts` gets positive cases, and negative ones: a staff image's sha, a dark logo's sha, an extra segment, a
    trailing path.

### 3.7 Configuration

**One new card** on Configuration > Organisation, beside the three sign-in cards: **"Supplier portal"**, with the subtitle
"Shown beside supplier sign-in and register."

**New model `OrganisationPortalPage`:** one row per organisation, every column nullable, nothing seeded by the product.

| Field | Limit | Unset means |
| --- | --- | --- |
| Public portal address | 300, judged by `safeLinkHref` as the staff links are (http or https, a host, no credentials), stored as its origin | The staff-copy card says "Public portal address not set." |
| Headline | 60 | "Supplier portal" |
| One line | 120 | Not drawn |
| Highlight 1 to 3 | 40 each | Not drawn |
| Highlight 1 to 3 icon | Shared set | The neutral tick |

- **Highlight icons** share `SIGN_IN_ICONS`. Extend it with `building`, `globe` and `wallet`, which are already drawn in
  `icons.tsx`. The `Record` in `sign-in-screen.tsx` forces a drawing for each, and the staff form gains them too.
- **The image**, if any, gets its own upload, replace and remove row on the same card, with a reason required on remove, as
  the sign-in picture has.
- **Writes** follow exactly the store pattern of `sign-in-store.ts`: the organisation row lock, and before and after recorded in
  the same transaction. If the maker-checker step covers the sign-in page cards by the time this is built, it covers this card
  the same way.
- **A loader**, `loadPortalBranding(organisationId)`, mirrors `loadSignInBranding`. A read fault is logged and the frame draws
  the bare product state (the illustration and "Supplier portal"). It **never** closes sign-in.

**The demo seed only** (`prisma/demo.ts`) sets:
- headline "Supplier portal"
- line "Register, buy tender documents and follow results online."
- highlights **Register online** (building), **Buy documents** (document), **See results** (globe)
- a public address of `http://localhost:3001`

**Not "Bid online".** The demo deployment's portal still says "Submit your bid on paper", and online bids are blocked for this
customer. A highlight that promises bidding online would be the product claiming something it does not do. An organisation that
turns online bids on writes that highlight itself.

### 3.8 States

| State | Left panel | Right column |
| --- | --- | --- |
| Nothing configured, no logo | Display name, "Supplier portal", illustration | Form (public copy) or card (staff copy) |
| Fully configured with an image | Logo, words, highlights, their image | As above |
| Branding read fails | Bare product state, fault logged | Unaffected |
| Public copy: not set up, forms closed, or policy not set | Unchanged | The existing warn `Callout`, with today's words, in the form card's place. The Register button stays. |
| Signed-in supplier opens sign-in, activate or reset | — | Redirect to the account, as today |
| `?password=set` | Unchanged | Ok callout above the fields |
| Wrong password or locked | Unchanged | Today's error, word for word, from the same handler |
| Register closed (not ready, or fields missing) | Unchanged | Today's `EmptyState` and "What is missing" popover |
| Staff copy, address set or not | Unchanged | The §3.4 card |
| Long headline (60) or highlight (40) | Wraps with balance. The highlights row wraps to two lines and never truncates. | — |
| Uploaded image fails to load | Empty slot (decorative, `alt=""`) | — |
| Reduced motion | Finished picture, still | — |

## 4. What stays exactly as it is (security, ADR 0034)

- **The form.** The sign-in, activate and reset forms post to the same route handlers (`/supplier/*/submit`). The same Origin
  guard, signed form token (`PORTAL_FORM_SECRET`), bounded body, lockout and recorded attempts apply. The same error words: no
  account enumeration.
- **Suppliers sign in on the public copy only.**
  - On the staff copy the handlers still answer 404, the proxy still refuses a supplier cookie, and nothing on the staff copy
    renders the form.
  - The new card is a link, not a sign-in.
- **The public copy still refuses every server action.**
  - The landing is server-rendered with no action.
  - The illustration is static markup with CSS.
- **`publicAllows` gains exactly one pattern**, the portal image. Through the gate, the same pattern is open without a staff
  session on the staff copy. Nothing else is opened, and `/sign-in/*` stays refused on the public copy.
- **No external request at runtime.** No image, font, script or analytics from another origin. The illustration is inline. The
  font is the self-hosted `next/font` build.
- **No data on the landing** beyond the organisation's own branding. The public-copy database role (an ADR 0034 go-live
  condition) must include `OrganisationPortalPage` and `OrganisationPortalImage` in its read set.
- **The closed reasons** from `supplierClosedReason` are unchanged for the public copy. On the staff copy, the "not public
  copy" reason stops being drawn as a callout and is drawn as the §3.4 card. The function's result is the same, so the card is
  chosen by `publicCopy === false`, not by matching its words.

## 5. Patterns drawn on

- **The split sign-in**, as our staff sign-in draws it: brand and purpose on one side, the one task on the other. It fits because
  the supplier is a stranger who needs to be told what this place is before being asked for a password.
- **Register on the sign-in page**, as SAP Business Network's supplier login does with "Register Now". A new company that
  reaches sign-in first is not sent away to find the way in.
- **One-pass hero motion**: motion that tells a short story once, then rests. It fits because the motion explains "fill in,
  submit, done", the registration promise, without words. That serves 0005.
- **"Wrong door" pages that hand over the right link**: one card with the one link, instead of a warning about being in the
  wrong place.
- **Our own staff sign-in.** The frame, the card, the footer and the highlight row are reused, not re-invented.

## 6. Rejected

- **Register as the filled primary, with Sign in secondary**, as the founder's example has it, with "More details" filled.
  - The example is a marketing page with no form.
  - Our page's frequent user is the returning supplier, and the page has a password field. Enter must submit sign-in, and the
    filled button must be the one Enter presses.
  - Register gets prominence by size and position instead.
- **Put the landing on `/supplier` home and keep sign-in plain.** Home already has its own job: open opportunities and results
  for everyone. Turning it into a hero would push the tender list a screen down for the many visitors who came for it. The
  founder pointed at sign-in.
- **Reuse the staff sign-in picture and words.**
  - The staff words are written for officers ("Welcome to…").
  - The staff picture is composed for a dark full-bleed panel.
  - Serving it would open a staff path on the public copy.
- **A Lottie or JavaScript animation.** It would be a runtime dependency and a larger payload, and harder to stop under reduced
  motion. CSS on inline SVG does the same in a few hundred bytes.
- **A looping animation.** It would need a pause control under WCAG 2.2.2 and would distract the person typing.

## 7. Design-system finding

`SignInScreen` gains a `variant: "staff" | "portal"`, rather than a second frame:
- The panel colour.
- Logo treatment: no halo on light.
- An illustration slot in place of the full-bleed picture.
- The register column width.

The highlight row, the card, the footer and the grid stay shared, so the two doors cannot drift apart.

## 8. Word budgets (0005 §3.1)

Every literal string this note adds is within budget:
- The staff card title is 7 words.
- "Public portal address not set." is 5 words, a state.
- "An administrator sets it in Configuration." is 6 words, under the 12-word refusal budget, and it names who clears it.
- "Forgot your password? Ask the office for a reset code." is 10 words, under the 12-word supplier next step.
- "Every sign-in is recorded." is 4 words.
- "Open supplier portal" is 3 words, within the button budget. The brief's "Open the supplier portal" would be 4.
- "Register as a supplier" is 4, one over the button budget. It is kept because it is already the label of the sidebar item and
  the home page's card, and the same action should read the same everywhere. If the product owner holds the button budget
  strictly, the label becomes "Register" on all three at once, never on this page alone.

The configured headline, line and highlights are customer text, held by their character limits.

## 9. Test with real users before committing

1. **Five-second test** with three or four small contractors, not officers. Show the public landing, then hide it. Ask "What can
   you do here?" and "How would you join?" Pass: they name registering, and they find the Register button without help.
2. **Activation path.** Give a tester an activation code on paper and open the sign-in page. Do they find "I have an activation
   code" now that it is a link, not a button? If more than one in four hesitate, restore the button and move "I have a reset
   code" under the card.
3. **Motion.** Does anyone start typing during the 5-second sequence and find it distracting? Is the finished picture alone,
   under reduced motion, still read as "registration is online"?
4. **The figure.** Is the stylised person read as neutral by the customer's suppliers? It is cheap to change before build and
   expensive after the founder signs it off.
5. **Staff copy.** Ask an officer what the card means and where the button goes. Pass: "to the portal suppliers use".

## 10. Not in this note

- The subtitle and labels of the register page live in `src/lib/portal/labels.ts`, which another workflow is editing. Shortening
  them to 0005's budget is a follow-up for after that work lands.
- Reusing the public address elsewhere, such as the activation hand-over slip or notices, is worth doing once it exists. It is
  not designed here.
