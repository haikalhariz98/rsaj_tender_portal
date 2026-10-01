# 0011 — Documents are content-addressed, immutable versions behind a storage façade

**Status:** accepted 2026-10-01 with rulings OD-1 to OD-9 and the scope conditions (decisions log) — see `docs/notes/plans/platform-document-store.md`. Mandated
by CO-8 (2026-10-01). Numbered 0011 because `phase1-closeout.md` claims 0009 and 0010.

## Context

Six accepted deferrals wait on somewhere to put a file: signed minutes (FR-CTE-004), dossier evidence (FR-MTD-009, BD-4: direct
appointments cannot be awarded), the coordination scope document (FR-REQ-013), the absent holder's recommendation (FR-APR-012),
and the awardee's returned documents (FR-AWD-003/008). NFR-SIG-002 requires a wet-signed scan bound to its record and impossible to
substitute silently. INT-13 makes the document repository a portal↔repository interface, and the platform rule is to integrate
behind a façade. This build may not contact any outside service, and has no sign-in, so it cannot say who is reading a document.

## Decision

1. **Storage is a façade.** `BlobStore` (`src/lib/documents/store/`) is the only code that touches bytes. This build ships a Postgres
   driver writing `bytea` to its own table inside the caller's transaction. Filesystem, S3 or Azure Blob drivers implement the same
   interface later; nothing above it changes. Large objects are not used.
2. **Content-addressed by SHA-256, per organisation.** The digest is the blob's key, the version's fingerprint and the integrity
   check: it is recomputed on every download and on Verify, and a mismatch is refused and logged.
3. **Versions are immutable.** A correction is a new version; a withdrawal is recorded with a reason; bytes are never deleted. No
   disposal run exists. Retention and disposal are computed (`retentionState`, `disposalFault`) and a legal hold blocks disposal.
4. **Attachments pin a version and use typed owner FKs.** `DocumentAttachment` names one owner through a typed nullable FK (meeting,
   exercise, award, delegation; more arrive with their modules) and a closed `AttachmentPurpose`; never a polymorphic (type, id).
   A record that was judged on evidence snapshots the pins it was judged on.
5. **Upload is two-step.** A Route Handler stores and stages a version (Server Actions cap bodies at 1 MB); the owner module's
   action attaches it under the owner's row lock, re-running the pure check on locked data, with its audit row.
6. **Classification comes from the document class and is snapshotted.** SULIT and unclassified bytes are not served until sign-in
   (OD-2); everything else is served to anyone who can reach the portal, and the screens say so.
7. **Type and size are organisation policy, unset refuses.** Types are sniffed from content, not trusted from the client. Malware
   scanning sits behind a `MalwareScanner` façade that ships unconfigured; every version reads "not scanned".

## Consequences

- Bytes, metadata and audit commit together, so a version can never exist without its trail; backups include documents.
- Database size grows with uploads; the deployment ceiling bounds a single file. Moving to object storage is a driver plus a
  copy keyed by digest, with no schema change above the façade.
- Gates that waited on evidence (`dossierFault`) pass on a live attachment; display-only deferrals become "attached" or
  "outstanding".
- Not claimed: access control, malware scanning, sealed storage (NFR-SEC-003 stays with 6.6, which must decide whether a digest
  of sealed content may be kept), database-level immutability (deferred with sign-in, as for the audit trail).
- Ruled out: storing files under client-supplied names or paths; trusting a declared media type; editing a version in place;
  deleting bytes in this build; building against any one vendor's storage API.
