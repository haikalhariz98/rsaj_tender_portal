# 0035 — Scope switches are pinned on the exercise; a tender part may be issued as an uploaded file

**Status:** Accepted for build (product-owner rulings 12 to 15 of `docs/notes/design/0003-sourcing-requirements-v2.md` section 6, 2026-10-09,
on Sourcing Requirements v2 SR-08, SR-09 and SR-11). Supersedes ADR 0008 and ADR 0013 **only where a file is uploaded to a part**: an
uploaded file replaces the merged text as the issued part. Everywhere else they stand.

## Context

The founder's Sourcing Requirements v2 removes the specification panel (SR-08), removes the on-screen bill of quantities in favour of an
uploaded Excel (SR-09), and gives every tender-document line four acts: Template, Upload, Download and Replace (SR-11).

Three things in the product depended on what is removed:

- the submit gate (`packFaults`) blocks on the panel's and the bill's findings, and `submitFaults` reads `content.bqFinalised`;
- scope approval (FR-REQ-014) is a SCOPE matter keyed to a bill version, and blocks submission wherever a method requires it, so
  with no bill it would block for ever;
- ADR 0008 and 0013 make a template part *merged text* frozen as `TenderPackDocument.renderedText`, and a part is ready only when an
  officer marks it so.

Whether a customer uses the panel or the on-screen bill is that customer's policy. A customer who has not decided must not be guessed
for, and an exercise already in flight must not have its gates rewritten by a later change of setting.

## Decision

1. **Two switches, pinned on the exercise.** `SourcingExercise.specPanelUsed` and `SourcingExercise.onScreenBillUsed` are nullable
   booleans. `null` is "not set". They are never read live from configuration after creation (ruling G1).
   - The organisation's setting is `ScopePolicy.specPanelUsed` and `ScopePolicy.onScreenBillUsed`, edited through Configuration, Scope
     by the two-person path. Neither ships set.
   - An exercise **takes the organisation's setting when it is created**. Creating is never refused: an unset setting pins "not set".
   - An exercise created before this decision was **backfilled to its present behaviour: both used**.
   - **Submission refuses in words while a switch is "not set".** The one way out is an audited act, "Take the organisation's setting",
     allowed only while the pin is not set and no pack has been submitted. It copies the current configured value; it is not a free
     choice, and it refuses in words while the organisation's setting is itself still not set. From the first submission the pins are
     frozen.
2. **The gates read the pins, not the setting.** With `specPanelUsed = false`, the panel findings leave the gate and the panel's acts
   refuse. With `onScreenBillUsed = false`, the bill findings leave the gate and the bill's acts refuse. With a pin "not set", `packFaults`
   says so (`SPEC_PANEL_SWITCH_NOT_SET`, `BILL_SWITCH_NOT_SET`). Earlier panels and bills are never deleted: they stay readable as an
   "Earlier record" section, only on an exercise that holds one.
3. **Readiness is derived, not stored.** A part is ready when its content is in order, judged by one pure function
   (`partReadiness`): an uploaded part on its first live file; a merged-text part when its merge has no missing field, or when a file is
   uploaded; the Appendix when it is complete; the on-screen bill when a bill is finalised. There is no "Mark ready" act. At submission
   the derived state is written to the part, so a frozen pack still carries the state it was frozen with and every later reader (the
   opening checklist, the table document, the supplier views) is unchanged.
4. **An uploaded file replaces the merged text as the issued part.** This is the supersession of ADR 0008 item 3 and ADR 0013 item 2,
   limited to a part that holds a live file at submission:
   - the file is pinned in the manifest by document, version number and SHA-256, as an uploaded part's already is;
   - **no text is rendered or stored** for that part, so there is no `TenderPackDocument` for it, and nothing says it is the merged text;
   - the restriction stamp (FR-DOC-009) is not printed on a file. The screen says so, as it does for an uploaded part;
   - a part with no file is issued as merged text exactly as before.
5. **Optional parts with nothing to issue are recorded "Not issued".** At submission an optional part with no file (and, for a
   merged-text part, no complete merge) is written as omitted with the reason "Not issued", with a History row. A mandatory part with
   nothing to issue still blocks. This reuses the existing omitted state, so no reader changes.
6. **The bill of quantities, when the on-screen bill is not used, is an uploaded part.** The part configured as the bill of quantities
   (source "the bill, unpriced") is read as an uploaded part on an exercise pinned off: derived from the pin, not rewritten on the pack, so the
   pack still says what was configured. The freeze by hash then comes from item 4. Nothing about the part changes for an exercise that uses the
   on-screen bill.
7. **Scope approval is keyed to the bill's file version** where the bill is not on screen. `CommitteeDecision.scopeFileVersionId` is a
   typed key to the `DocumentVersion` of the bill part's live file, set only on a SCOPE matter and never together with `bqVersionId`
   (CHECK). A replaced file is a new version, so an approval of the old one does not speak for the new: it lapses. A returned pack
   carries the same version, so the approval carries. Where scope approval is required and the pack has no bill part, the gate says so
   (`SCOPE_NO_BILL_PART`), naming the two ways out, both configuration: add the part, or set the method's scope approval. No block
   exists that cannot be cleared.
8. **Prime cost and provisional sums are entered at the contract baseline** (already possible; they are not parsed from the Excel). The
   nomination check (FR-MTD-012 (d)) reports "not checked: no on-screen bill" and never a pass; the Appendix's own prime cost answer is
   still checked.
9. **Template files are configuration, per configured part.** `TenderDocumentPart.templateFileVersionId` points to a
   `DocumentVersion` in the existing document store. It is set through the two-person path: the officer stages the file through the
   upload route (classification, hash and audit as for any file), the proposal carries the staged version id, and the issuing step files
   the document in the same transaction as the part it belongs to. "Per part kind" is read as the configured part (a row of Configuration,
   Tender documents), not the closed `PartRole` list, because two parts of one role can be different forms. With none set the line says
   "No template set".
10. **Uploads use the existing store and attachment rules.** The purpose is the existing `TENDER_PART`, owned by the pack's part. It was
    accepted only on an `UPLOAD` source; it is now also accepted on a merged-text part and, when the on-screen bill is not used, on the
    bill part. Never on the Appendix, which stays a form because its entries feed the contract baseline (SR-12).

11. **The store recognises a workbook and a Word document.** The store told a file's type from its own bytes and refused every ZIP, because a ZIP
    signature cannot tell a workbook from any other archive; that left the bill of quantities' Excel, and every template file, unable to be
    uploaded. A ZIP is now told to be a workbook (.xlsx) or a Word document (.docx) by the names its central directory lists, read from the end
    of the file and never unpacked: it must hold `[Content_Types].xml` and `xl/workbook.xml` (or `word/document.xml`, not both) and no macro
    project, no encryption and no ZIP64. Anything else stays refused as an archive. The two types join the known types; whether an organisation
    accepts them stays its own upload rule (Configuration, Documents), which ships unset. Legacy .xls and .doc are not recognised. This changes
    the store's contract for staff uploads only; the supplier portal's uploads still read the first bytes alone, and so still refuse a ZIP.

## Consequences

- A customer sets two policy switches once, by two people, and every new exercise follows them; an old one never changes under its
  officers. The cost is the audited "take the organisation's setting" act for exercises created while a setting was unset.
- The tender-pack readers that show a frozen part must say "issued as a file" for a part with a pinned file and no text (the print page,
  the supplier's Tender Table Document, the inspection log).
- Supplier download of released files (ruling 14) needs the document release of SR-10, which is wave 3. Until then a supplier sees the
  file named in the pack, not its bytes.
- A scope matter now has two possible typed keys. Every reader of `CommitteeDecision.bqVersion` also reads `exerciseId`, which the
  file-keyed matter carries, so a restricted exercise stays hidden through its committee matter.
- Ruled out: reading a switch live for an existing exercise; a free choice of the pin by an officer; a stub value for an unset setting;
  deleting earlier panels or bills; parsing the Excel; a second file store.
