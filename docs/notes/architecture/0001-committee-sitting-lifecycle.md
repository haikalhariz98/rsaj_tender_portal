# 0001 — A committee sitting has a four-state lifecycle and freezes when minuted

**Status:** accepted (plan `docs/notes/plans/6.10-committee-meetings.md`, rulings 2026-09-30)

## Context

A sitting's minute is a legal record. Votes, attendance and outcomes must stop changing once the
body has minuted, and a sitting that never happened must not be able to carry a matter.

## Decision

- `SCHEDULED → IN_PROGRESS | CANCELLED`, `IN_PROGRESS → MINUTED | CANCELLED`. MINUTED and
  CANCELLED are terminal (`meetingTransition`, `src/lib/committee/meeting.ts`).
- The register is taken, votes are cast and outcomes are recorded only while IN_PROGRESS.
- MINUTED needs minutes written and no PENDING matter. With no not-approved outcome configured, a
  matter voted down stays PENDING, so minuting waits (ruling 5.5).
- CANCELLED needs a reason and no CARRIED or NOT_CARRIED matter.
- Once MINUTED or CANCELLED, every action and the votes route refuse (`isFrozen`).

## Consequences

- A correction to a minuted sitting is not an edit. It will need a separate, audited amendment
  record, which is not built.
- The checker step of maker-checker, once sign-in exists, attaches at MINUTED.
