# 0001 — Where the workspace switcher belongs

The top bar is crowded and the internal/supplier switcher is the largest thing in it that
is not the page you are on. This note says where it goes, what it becomes, and when it
should be deleted.

## Who is doing this, how often

Almost nobody, almost never.

A procurement executive works in the internal workspace all day and has no business in
the supplier portal. A site engineer bidding for work has no business in the internal
one. The two navigations share no item and no screen means the same thing on both sides.
This is not a view of the same records — it is two applications.

The switcher's real audience today is **the people evaluating the product**: UAT
reviewers, the customer's steering group, whoever is being shown both halves in one
sitting. It exists because there is no authentication yet, so there is no other way to
reach the supplier side. That is the whole job to be done: *let a reviewer get to the
other portal, and never let a working user mistake which one they are in.*

Once sign-in exists, a staff user who opens the supplier side is not "switching view" —
they are impersonating a supplier. That needs a permission and an audit entry, and it
belongs on the supplier's own record ("Suppliers → Acme Sdn Bhd → View their portal"),
not in the application chrome. The global switcher has a deletion date.

## What goes wrong today

At the user's viewport (~1300px) the prototype is not merely being crowded — it is
already failing its own stated intent. The CSS carries the comment
`/* persona switch — always visible in the top bar */`, and then, twenty lines later:

```css
@media (max-width:1400px){ .personasw__l{display:none} }   /* "Viewing as" disappears */
@media (max-width:1120px){ .personasw__t{display:none} }   /* the labels disappear */
```

Below 1400px the only word identifying those two pills as a mode switch is gone, leaving
an organisation name and "Supplier" sitting in the top bar looking like ordinary
navigation. Below 1120px they are two unlabelled icons. The control is legible at the
width it was drawn at and nowhere else.

There is a second problem the crowding hides. `.personasw` is a **segmented control** —
the same shape as `.segmented`, which the design system uses for filtering one set of
records ("All / Open / Closed"). A segmented control says *these are views of the same
thing*. Two applications with disjoint navigation are not views of the same thing. The
shape is lying about what the control does.

## Recommendation

**Move the switcher to the head of the sidebar, as a menu opened from a chevron in
`.sb-brand`. Delete it from the top bar.**

The sidebar brand block already renders which workspace you are in — it says "Supplier
portal" or the organisation's name. Right now the same fact is stated twice, in two
places, and at 1300px neither of them is labelled. Merge them: one block says where you
are, and is how you leave.

Three reasons, in order of weight:

1. **Co-location.** Switching workspace replaces the sidebar. Put the control at the top
   of the thing it changes, not diagonally opposite it.
2. **It is not a property of the person.** There is no signed-in person today, and after
   auth the equivalent action is impersonation of a *named supplier*, scoped to a record.
   Chrome that hangs off identity would have to be unpicked; the brand block would not.
3. **Discoverability for the audience that actually uses it.** Top-left of the sidebar is
   where Slack, Linear, Notion, Xero and Vercel all put a workspace switcher. A UAT
   reviewer looking for "the other portal" looks there.

This is a deliberate deviation from the approved prototype, and it is worth it: the
prototype's own media queries destroy the control's affordance at the width the customer
is reviewing it on, so "matching the prototype" at 1300px means shipping two unlabelled
pills. Fidelity to the intent beats fidelity to the markup.

### The control stays symmetric today, and stops being symmetric at the auth gate

A supplier seeing a chevron that offers them the staff workspace is exactly the leak the
product's principles forbid, so it is worth saying plainly why it is right anyway *today*
and wrong the moment sign-in exists.

Today there are no supplier users. Everyone on `/supplier` is a reviewer who arrived by
switching, and a reviewer who cannot get back is stranded — the control must appear on
both sides or it is a one-way door. The asymmetry is not something the interface should
try to fake with a flag; it is what authentication delivers for free. When a real supplier
account exists, the switcher does not render for them at all, because the same boolean that
removes it for staff ("authentication is not configured") is false, and the staff route is
not theirs to see. Until then, symmetric, and labelled as scaffolding in the popover's own
closing line.

### DOM, in existing classes

`src/components/shell/sidebar.tsx`, brand block. No new CSS.

```
nav.sidebar                          (position:sticky → already an anchor for .popover)
├── div.sb-brand
│   ├── span.sb-mark                 GavelIcon, unchanged
│   ├── div.sb-brandtext.grow        + .grow: pushes the chevron to the right edge and
│   │   ├── div.sb-name.trunc          gives the text min-width:0
│   │   └── div.sb-sub.trunc
│   └── button.iconbtn               ChevronDown, aria-haspopup="menu", aria-expanded
├── div.popover                      rendered only when open; see anchoring below
├── div.sb-nav                       unchanged
└── div.sb-foot                      unchanged
```

`.sb-brand` has `padding:0 14px 0 16px` — the asymmetry is already sized for a control on
the right edge, the same way `.sb-foot` seats its `.iconbtn`. Nothing needs restyling.

The popover is a **sibling of `.sb-brand`, not a child of the button**. `.sidebar` is
`position:sticky`, which is a containing block for absolutely positioned descendants, so
`.popover` anchors to the rail with no wrapper and no new class:

```
style={{ top: "calc(var(--topbar) + 4px)", left: 12, right: 12 }}
```

It is out of flow, so it does not disturb the flex column. `.sidebar` has `z-index:40`
against the top bar's `35`, so the popover paints above the top bar — verify this rather
than trust it, because a menu rendering *under* the top bar is the obvious failure mode.

Contents, all existing classes:

```
div.popover role="menu"
├── div.menu__t              "Viewing as"          ← recovers the label the breakpoint kills
├── button.menu__i           role="menuitemradio", aria-checked when workspace === "internal"
│                            BuildingIcon · {organisation}
│                            second line, .xs.dim: "Procurement staff — the full record"
├── button.menu__i           role="menuitemradio", aria-checked when workspace === "supplier"
│                            UserIcon · "Supplier portal"
│                            second line, .xs.dim: "What a bidder sees"
├── div.menu__sep
└── (note)                   .xs.faint — "Sign-in has not been built yet, so either side
                             opens for anyone."
```

The role must be `menuitemradio`, not `menuitem`. `aria-checked` is not permitted on a
plain button or on `role="menuitem"`, and these two are mutually exclusive choices — which
is precisely what `menuitemradio` means. The existing selector
`.menu__i[aria-checked="true"]` (design-system.css:1032) fires either way, so the correct
semantic costs nothing and needs no new class.

Each item calls `router.push(STAFF_NAV[0].items[0].href)` / `SUPPLIER_NAV[0].items[0].href`
exactly as the current buttons do — **switching still navigates, and the workspace stays a
property of the URL.** Nothing about `workspaceFor` or the `/supplier` prefix changes.

Opening, dismissal and focus follow the prototype's own `SplitButton` (in the bundle at
`docs/prototype/RSAJ-Tender-Portal.html`, line 2429): an outside-click hook that closes on
a pointer-down anywhere else, `role="menu"` on the popover, and the item handler closing
*before* it navigates. Two things that component does not do and this one must: **Escape
closes**, and **focus returns to the chevron** when it does. The sidebar is the first thing
in the tab order, so dropping focus to the document there strands a keyboard user above the
whole navigation.

Gate the chevron on a single condition — "authentication is not configured" — so that
when auth lands, the chevron and popover disappear and `.sb-brand` reverts to today's
markup. Deleting this should be one boolean, not an excavation.

### Behaviour at the narrow breakpoints

This is where the current control degrades worst, so it is the point of the change.

| Width | Today | After |
| --- | --- | --- |
| ≥1400px | "Viewing as" + two labelled pills | Brand names the workspace; popover header says "Viewing as" |
| 1120–1400px | **Label gone** — two unlabelled pills reading as nav | Unchanged from ≥1400px. The rail is still 264px, so the workspace name is fully legible |
| ≤1120px | Pills become bare icons | Still unchanged — the rail has not moved |
| ≤960px | Pills are icons; rail also breaks (below) | Degraded but usable; see below |

**≤960px lands on a pre-existing bug.** `@media (max-width:960px)` sets
`.sidebar{width:var(--rail-collapsed)}` — 68px — but nothing ever sets
`data-collapsed="true"`, and every collapsed rule is keyed on that attribute. So the rail
narrows while the brand text, nav labels and badges keep rendering. The collapse button in
`.sb-foot` that would set the attribute is `disabled`.

This does not block the change. `.sb-brand`'s fixed content is 30 (padding) + 22 (mark) +
10 + 10 (gaps) + 34 (chevron) = 106px against a 68px rail, and neither `.sidebar` nor
`.sb-brand` sets `overflow`, so the chevron **spills past the rail edge and stays
clickable** — ugly, not unreachable. The popover then opens at its `min-width:200px` over
the content, with full labels, above the top bar. That is still better than the current
answer at that width, which is two unlabelled icons.

Log the `data-collapsed` wiring as its own defect: drive it from state, default it from
`matchMedia`, and enable that button. Then the brand becomes `.sb-mark` + chevron centred
in 68px (22 + 10 + 34 = 66px, fits) and the spill goes away.

### Width recovered in the top bar

Right-hand cluster at ~1300px, measured from the stylesheet:

```
now:    search 210 + personasw ~255 + dividers 2 + bell 34 + help 34 + EN ~22
        + user button ~200 + 10 gaps × 10  ≈  837px
after:  search 210 + dividers 2 + bell 34 + help 34 + EN ~22
        + avatar trigger 34 + 7 gaps × 10  ≈  406px
```

About **430px** returns to `.crumbs`, which is `flex:1 1 auto` and takes whatever the row
has spare. Its children only shrink when the row overflows, so this should stop
"Configuration" eliding — but note that `.crumb` also carries `max-width:230px` and
`.crumbs > .crumb:nth-child(3){flex:0 5 auto}`, meaning that crumb is deliberately made to
give up space five times faster than default. Recovering the width is necessary; confirm
it is sufficient with `scripts/render-prototype.mjs` and `scripts/compare-shell.mjs`
rather than by eye.

## The "Signed out / No user configured" control should change too

Yes — and not only because it is 200px wide and disabled.

It is currently fed by `loadShell()`, which does `db.person.findFirst({ orderBy: { name:
"asc" } })`. When there *is* a person on record, the top bar renders an arbitrary
alphabetically-first officer as though they were signed in. That is the same failure the
provenance rule exists to prevent: a screen presenting a guess in the same shape as a
fact. Rule 2 — gaps stay honest — applies to chrome as much as to the authority matrix.

Replace it with:

- **Trigger:** `button.iconbtn` containing `span.avatar.avatar--sm.avatar--muted` with a
  `UserIcon` inside. Not `disabled` — it opens a menu, so it does something. 34px instead
  of ~200px.
- **Menu:** a `.popover.popover--right` anchored to the trigger (`.iconbtn` is
  `position:relative`, so it anchors itself), containing one plain sentence: *"You are not
  signed in. Sign-in has not been built yet, so every record is open to everyone using
  this deployment."* Above it, a `.menu__t` "Organisation" and the organisation name —
  context about where you are, not a claim about who you are. `organisation` is already a
  prop on `Topbar`.
- Stop passing `shell.user` into `Topbar` at all. `loadShell` keeps the person lookup only
  if something else needs it; the chrome must not display it.

This is the system explaining itself rather than displaying a disabled placeholder that
states a fact ("Signed out") and then refuses to be clicked for the reason.

While in the same row: `search`, `bell` and `help` are all `disabled`, which suppresses
pointer events entirely — a `.tip` wrapper on a disabled button never fires, so none of
them can explain why they do nothing. Use `aria-disabled` with a no-op handler if they are
to carry a tooltip. And `EN` is a bare `<span className="xs strong dim">`, not a control at
all, sitting where a language switch would sit in a product that ships `en`/`ms` labels.
Both are separate decisions; naming them here only so they are not mistaken for working.

## What was rejected

**Keep it in the top bar, fix the label.** Restoring "Viewing as" below 1400px means
overriding the prototype's own media query — the same deviation, for less. It leaves
~255px in the most contested row of the interface, and it keeps the segmented-control
shape, which tells the user these are two views of one thing when they are two
applications. Rejected on the shape, not the width.

**Put it in the user menu.** Genuinely tempting once that menu exists — SAP Ariba puts
solution and role switching in the account menu, and `.menu__i[aria-checked]` is already
there. Rejected because the workspace is not a property of the person: there is no person
today, and after auth the equivalent action is impersonating a named supplier, which
belongs on that supplier's record with an audit entry. Putting it under identity now
builds a home it will have to be evicted from.

**Sidebar footer, near the collapse button.** `.sb-foot` is where chrome-about-chrome
lives — collapse, version, organisation strapline. A mode switch there sits below the nav
it governs, disappears off a short viewport, and is the last place anyone looks.

**Route-level only: no chrome control at all.** This is what the comparable products
actually do — Coupa's supplier portal, Jaggaer's supplier network, In-tend and Proactis
all put suppliers on a separate application with separate credentials, and no switch
exists because no account holds both roles. It is the right end state and this note
recommends arriving there. Rejected *for now* only because there is no auth, and a UAT
reviewer with no way to reach `/supplier` cannot review half the product. Scaffolding,
labelled as such, with a boolean that removes it.

## Patterns drawn on

- **Slack, Linear, Notion, Xero, Vercel** — workspace/organisation switcher at the top of
  the left rail, merged with the identity block that names the current context. Borrowed
  because the shape matches exactly: switching replaces the navigation.
- **Stripe's test/live toggle** — deliberately *not* borrowed. Stripe keeps that toggle
  persistently visible in the top chrome, and colours the whole frame, because it is a
  dangerous mode of the *same* product. Ours is not a mode; it is a different product with
  different screens. The persistent-toggle shape does not transfer.
- **GitHub** — owner/context in the top-left breadcrumb, identity in the top-right avatar,
  and the two never share a control. That separation is what this note is applying.
- **SAP Ariba** — role/solution switching in the account menu. Considered and rejected
  above, but it is the strongest counter-case and the reason the user menu got a serious
  hearing.

## What the design system does not have

In rough order of how much it matters.

1. **`.sidebar[data-collapsed="true"]` is dead styling.** The rules exist; nothing sets the
   attribute; `@media (max-width:960px)` narrows the rail anyway and the collapse button is
   `disabled`. The ≤960px rail is broken today, independent of this note.
2. **No non-interactive note line inside `.popover`.** `.menu__t` is an uppercase,
   letter-spaced section caption; setting a sentence in it would look wrong. The
   "sign-in has not been built" line and the two `.xs.dim` sub-labels have nowhere to
   live. Smallest honest addition would be a `.menu__note` (padding `6px 10px`, `.xs`,
   `--ink-4`, normal case). Until then: inline style, matching the prototype's own habit.
3. **No documented anchor for `.popover`.** It is `position:absolute` and the design
   system supplies no positioning-context class; the prototype's own components use
   `style={{position:"relative"}}` inline (see `SplitButton` in the bundle). Here we get
   away with it because `.sidebar` is sticky and `.iconbtn` is relative — but write that
   down, or the next person invents a `.pop` wrapper.
4. **`.menu__i` has no slot for a check mark or a second line.** `aria-checked` recolours
   the label and nothing else. Two-line items are unspecified; check them against
   `padding:8px 10px; align-items:center` before committing.
5. **`.sb-brand` has no hover or focus state** — it was never interactive. Using an
   `.iconbtn` for the trigger sidesteps this entirely and inherits real hover, focus and
   disabled states; the cost is a 34px target rather than the whole 264px block. If
   testing shows people try to click the block, that is a one-rule addition needing sign-off,
   not something to improvise.
6. **Disabled buttons cannot carry tooltips.** `.tip` needs pointer events; `disabled`
   suppresses them. Affects `search`, `bell`, `help` and the current user control.

## What to test before committing

- Give a UAT reviewer who has never seen the product a laptop at 1280×800 and ask them to
  "look at what a supplier sees". Time it. If they do not find it inside 30 seconds, the
  chevron alone is too quiet and the whole `.sb-brand` block needs to be the target.
- Ask three procurement executives whether they have *ever* wanted to switch mid-task. If
  the answer is no — as expected — then the control does not need to be persistent at all,
  and the route-level entry that was rejected above becomes the right answer sooner.
- Watch whether anyone reads the muted anonymous avatar as "the page failed to load" rather
  than "nobody is signed in". If they do, the trigger needs a word next to it after all,
  and 34px becomes ~90px — still less than half of today's 200px.
- Check the popover paints above the top bar in a real browser, not only in the stylesheet
  arithmetic — `.sidebar` z-index 40 against `.topbar` 35, with the popover's own 70 scoped
  inside the sidebar's stacking context.
