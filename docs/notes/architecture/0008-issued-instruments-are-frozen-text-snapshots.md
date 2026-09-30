# 0008 — Issued instruments are frozen text snapshots of configured templates

**Status:** accepted — product-owner rulings 2026-09-30 (decisions log, "· 6.11 ·", instrument text); plan `docs/notes/plans/6.11-award.md`

## Context

FR-AWD-003 and FR-AWD-007 require the portal to generate the Letter of Acceptance with its declaration, and the appointment letter in
the right variant. NFR-GEN-003/004 require a generated document to be reproducible and to say what it was generated from. There is no
document engine, no document storage and no e-signature in Phase 1, and no customer's letter wording may ship (AGENTS.md).

## Decision

1. A template's body is configuration on `DocumentTemplate`: `bodyMs` and `bodyEn` as plain text with whitelisted `{{field}}` merge
   fields, `primaryLanguage`, and `bodyVersion`, bumped on every audited edit of a body. Bodies ship empty; an empty body refuses issue.
2. Rendering is a pure function (`src/lib/award/merge.ts`): an unknown field is reported and never printed raw; an empty field is
   reported as missing and refuses issue. Output is plain paragraphs rendered through React text nodes.
3. Before issue, the print route renders live with a "Draft — not issued" watermark. On issue each document is frozen into
   `AwardDocument`: the template's identity, form code, revision and body version, the language, every merge value, the rendered text
   and `frozenAt`. From then on the print route renders only that row, never today's configuration; a later template edit cannot
   change an issued instrument.
4. The issued print carries no draft watermark and states its fidelity: it is the portal's text of the issued instrument, not the
   controlled printed form. The officer prints it, has it signed on paper and records the return.

## Consequences

- The same principle as `decisionRecord()`: what was issued is read from what was frozen.
- Form fidelity, paging, tick-box conventions and bilingual label pairs wait for the Phase 4e certificate engine; PDF, e-signature and
  attaching returns wait for document storage.
- Ruled out: HTML or markup stored in templates; rendering an issued instrument from live configuration; a letter wording shipped as a default.
