# Decisions log

Decisions taken on the founder's behalf by the product-owner agent during the autonomous
build (`docs/notes/autonomous-build.md`). Newest first. Each entry: date · module ·
decision · reason · spec ID.

## Where the build stopped

_Not started yet._

## Decisions

- 2026-09-30 · setup · The RSAJ documents (`docs/requirements/`, `docs/prototype/`) are
  gitignored and were NOT committed by Claude; adding them to this branch is the founder's
  own action. If they are absent, build from `docs/prototype/spec/` if present and from
  AGENTS.md, and record every place the spec was needed but unavailable.
