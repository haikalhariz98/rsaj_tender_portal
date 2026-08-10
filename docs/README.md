# docs

Two kinds of thing live here, and git treats them differently.

## `notes/` — tracked

Our own reasoning: architecture decisions, research, design notes. Committed, because a
decision nobody can find was not really recorded. See the README in each subdirectory for
what belongs in it and how to write one.

## `prototype/` and `requirements/` — **gitignored**

A customer's own material: governing documents, authority manuals, approved prototypes.
Present on the machine so agents and contributors can read them, and kept out of git so a
push cannot leak them.

Nothing here is authoritative for behaviour on its own — a requirement becomes real when
it is implemented and tested. But when a screen is meant to match an approved prototype,
that prototype is the reference, and `scripts/` can render it and diff this app against
it rather than leaving the comparison to memory:

```bash
PROTOTYPE=your-prototype.html node scripts/render-prototype.mjs out screen "Configuration"
node scripts/outline.mjs out/rendered-screen.html .content 6
node scripts/compare-shell.mjs out/rendered-screen.html http://localhost:3000/
```

A prototype may inject a second stylesheet from its JavaScript; `extract-runtime-css.mjs`
recovers it. Porting only the `<style>` block leaves whole screens unstyled, which is easy
to miss because most of the page still looks right.

If more than one generation of a prototype exists, keep the superseded ones in
`prototype/archive/` and say in a note which is current. Building from the wrong generation
produces work that contradicts the code already shipped.

To commit customer material deliberately, remove the two `/docs/` lines from `.gitignore`
— and use a private remote.
