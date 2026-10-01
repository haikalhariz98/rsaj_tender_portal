/**
 * Demo documents (plan platform-document-store.md §9). Invented throughout; every file is
 * generated here — one-page PDFs reading "DEMO — invented document, not a real record"
 * and a small drawn PNG. Nothing comes from a client's documents.
 *
 * - Classes: demo_dc1 Internal (assumed), demo_dc2 SULIT, demo_dc3 classification unset
 *   (set where the classes are created, in demo.ts). Upload rules PDF/PNG/JPEG, 20 MB,
 *   ASSUMED — only where the organisation has none of its own.
 * - Signed minutes on one minuted sitting the requisition gate cites (another is left
 *   outstanding); dossier evidence on demo_sx2 with a withdrawn v1 and a live v2 (demo_sx7
 *   is left without, so BD-4's block stays visible); the acceptance-page scan on the
 *   accepted demo award; the absent holder's signed recommendation on demo_dg3; one SULIT
 *   document (listed, never served); one legal hold; one staged upload not yet filed.
 *
 * The wipe removes access events, holds, attachments, versions and documents, then only
 * the blobs no version left behind still references. It refuses, listing them, when a
 * record that is not demo data points at a demo document, or a document that is not demo
 * data is attached to a demo record (unless --remove-dependents, which takes those
 * attachments off and keeps the documents: bytes are never deleted for the demo).
 */

import { createHash } from "node:crypto";

import type { PrismaClient } from "../src/generated/prisma/client";
import { attached, detached, documentCreated, filed, holdPlaced, repinned, versionCreated, versionWithdrawn } from "../src/lib/documents/audit-view";
import { PURPOSE_LABEL } from "../src/lib/documents/labels";
import type { AttachmentPurpose, SecurityClass } from "../src/lib/documents/types";
import { initialsLogo } from "../src/lib/organisation/png";

type Db = PrismaClient;
const P = "demo_";
const day = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
const at = (iso: string) => new Date(`${iso}:00.000Z`);
const sha = (b: Uint8Array) => createHash("sha256").update(b).digest("hex");

export const DEMO_POLICY_ID = `${P}docpolicy`;
const DEMO_POLICY = { allowedMediaTypes: ["application/pdf", "image/png", "image/jpeg"], maxBytes: 20n * 1024n * 1024n };

// ------------------------------------------------------------------ the bytes

/// A one-page A4 PDF in Helvetica (WinAnsiEncoding: the em dash is byte 0x97), its
/// cross-reference offsets taken from the bytes as written.
export function demoPdf(lines: readonly string[]): Buffer {
  const esc = (s: string) => s.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)").replace(/—/g, "\x97");
  const body = [
    `BT /F1 18 Tf 56 770 Td (${esc("DEMO — invented document, not a real record")}) Tj ET`,
    ...lines.map((l, i) => `BT /F1 12 Tf 56 ${730 - i * 20} Td (${esc(l)}) Tj ET`),
  ].join("\n");
  const content = Buffer.from(body, "latin1");
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    null,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>",
  ];
  const parts: Buffer[] = [Buffer.from("%PDF-1.4\n%\xe2\xe3\xcf\xd3\n", "latin1")];
  const offsets: number[] = [];
  let length = parts[0].length;
  objects.forEach((o, i) => {
    offsets.push(length);
    const obj = o == null
      ? Buffer.concat([Buffer.from(`${i + 1} 0 obj\n<< /Length ${content.length} >>\nstream\n`, "latin1"), content, Buffer.from("\nendstream\nendobj\n", "latin1")])
      : Buffer.from(`${i + 1} 0 obj\n${o}\nendobj\n`, "latin1");
    parts.push(obj);
    length += obj.length;
  });
  const xref = `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map((x) => `${String(x).padStart(10, "0")} 00000 n \n`).join("")}`;
  parts.push(Buffer.from(`${xref}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${length}\n%%EOF\n`, "latin1"));
  return Buffer.concat(parts);
}

/// A small drawn PNG: two letters on a colour, as the demo logo is drawn.
export const demoPng = () => initialsLogo("SR", [120, 53, 15], 96);

// ------------------------------------------------------------------ load

interface DemoVersion {
  id: string;
  n: number;
  bytes: Buffer;
  mediaType: string;
  filename: string;
  receivedOn: string | null;
  storedAt: string;
  withdrawn?: { at: string; reason: string };
}

interface DemoDoc {
  id: string;
  title: string;
  classId: string;
  className: string;
  classification: SecurityClass | null;
  createdAt: string;
  versions: DemoVersion[];
  attachments: { id: string; purpose: AttachmentPurpose; owner: { meetingId?: string; exerciseId?: string; awardId?: string; delegationId?: string }; ownerLabel: string; versionId: string; at: string; detached?: { at: string; reason: string; replacedBy?: string } }[];
  hold?: { id: string; reason: string; at: string; personId: string; personName: string };
}

export async function loadDocuments(db: Db, organisationId: string) {
  // Upload rules, only where the organisation has none of its own (OD-3: demo values ASSUMED).
  if (!(await db.documentStorePolicy.findUnique({ where: { organisationId } }))) {
    await db.documentStorePolicy.create({ data: { id: DEMO_POLICY_ID, organisationId, ...DEMO_POLICY, provenance: "ASSUMED", notes: "Demo upload rules: PDF, PNG and JPEG up to 20 MB. Invented, not a recommendation." } });
  }

  const recorder = { id: `${P}p3`, name: "Chen Wei Ling" };
  const internal = { classId: `${P}dc1`, className: "Contract documents", classification: "INTERNAL" as const };
  const docs: DemoDoc[] = [
    {
      id: `${P}doc1`, title: "Signed minutes, Capital Works Committee, DEMO/CWC/1/2026", ...internal, createdAt: "2026-09-08T10:15",
      versions: [{ id: `${P}doc1v1`, n: 1, bytes: demoPdf(["Signed minutes — DEMO/CWC/1/2026", "Capital Works Committee (demo)", "Signed by the chair and the secretary on paper."]), mediaType: "application/pdf", filename: "CWC-1-2026 signed minutes.pdf", receivedOn: "2026-09-08", storedAt: "2026-09-08T10:15" }],
      attachments: [{ id: `${P}doc1a1`, purpose: "SIGNED_MINUTES", owner: { meetingId: `${P}mt8` }, ownerLabel: "DEMO/CWC/1/2026", versionId: `${P}doc1v1`, at: "2026-09-08T10:20" }],
    },
    {
      id: `${P}doc2`, title: "Distributor's letter of sole authority", ...internal, createdAt: "2026-09-03T09:00",
      versions: [
        { id: `${P}doc2v1`, n: 1, bytes: demoPdf(["Distributor's letter of sole authority — page 1 of 2", "Dosing controllers (demo)"]), mediaType: "application/pdf", filename: "sole-authority-letter.pdf", receivedOn: "2026-08-12", storedAt: "2026-09-03T09:00", withdrawn: { at: "2026-09-04T11:30", reason: "The scan was missing its second page." } },
        { id: `${P}doc2v2`, n: 2, bytes: demoPdf(["Distributor's letter of sole authority — pages 1 and 2", "Dosing controllers (demo)", "Rescanned with both pages."]), mediaType: "application/pdf", filename: "sole-authority-letter-complete.pdf", receivedOn: "2026-08-12", storedAt: "2026-09-04T11:20" },
      ],
      attachments: [
        { id: `${P}doc2a1`, purpose: "DOSSIER_EVIDENCE", owner: { exerciseId: `${P}sx2` }, ownerLabel: "DEMO/SX/0002/2026", versionId: `${P}doc2v1`, at: "2026-09-03T09:05", detached: { at: "2026-09-04T11:25", reason: "Replaced by version 2: Rescanned with both pages.", replacedBy: `${P}doc2a2` } },
        { id: `${P}doc2a2`, purpose: "DOSSIER_EVIDENCE", owner: { exerciseId: `${P}sx2` }, ownerLabel: "DEMO/SX/0002/2026", versionId: `${P}doc2v2`, at: "2026-09-04T11:25" },
      ],
      hold: { id: `${P}doc2h1`, reason: "Internal audit query on direct appointments (invented for the demo).", at: "2026-09-25T15:00", personId: `${P}p3`, personName: "Chen Wei Ling" },
    },
    {
      id: `${P}doc3`, title: "Signed acceptance page, Contoh Supplies Enterprise", ...internal, createdAt: "2026-09-21T14:00",
      versions: [{ id: `${P}doc3v1`, n: 1, bytes: demoPdf(["Signed acceptance page — appointment letter (demo)", "Contoh Supplies Enterprise", "Signed, stamped and witnessed on paper."]), mediaType: "application/pdf", filename: "acceptance-page-signed.pdf", receivedOn: "2026-09-21", storedAt: "2026-09-21T14:00" }],
      attachments: [{ id: `${P}doc3a1`, purpose: "ACCEPTANCE_PAGE", owner: { awardId: `${P}aw5` }, ownerLabel: "DEMO/AWD/0005/2026", versionId: `${P}doc3v1`, at: "2026-09-21T14:05" }],
    },
    {
      id: `${P}doc4`, title: "Section Head's signed recommendation to re-delegate", ...internal, createdAt: "2026-09-26T08:40",
      versions: [{ id: `${P}doc4v1`, n: 1, bytes: demoPng(), mediaType: "image/png", filename: "recommendation-photo.png", receivedOn: "2026-09-25", storedAt: "2026-09-26T08:40" }],
      attachments: [{ id: `${P}doc4a1`, purpose: "HOLDER_RECOMMENDATION", owner: { delegationId: `${P}dg3` }, ownerLabel: "Delegation · Eng Siew Mei to Daniel Anak Jelani", versionId: `${P}doc4v1`, at: "2026-09-26T08:45" }],
    },
    {
      id: `${P}doc5`, title: "Coordination meeting scope and cost note", classId: `${P}dc2`, className: "Certificates", classification: "SULIT", createdAt: "2026-09-03T16:00",
      versions: [{ id: `${P}doc5v1`, n: 1, bytes: demoPdf(["Coordination meeting scope and cost note (demo, SULIT)", "Burst trunk main, upper zone", "Listed, never opened in the portal before sign-in."]), mediaType: "application/pdf", filename: "scope-and-cost-note.pdf", receivedOn: "2026-09-02", storedAt: "2026-09-03T16:00" }],
      attachments: [{ id: `${P}doc5a1`, purpose: "COORDINATION_SCOPE", owner: { exerciseId: `${P}sx4` }, ownerLabel: "DEMO/SX/0004/2026", versionId: `${P}doc5v1`, at: "2026-09-03T16:05" }],
    },
    {
      id: `${P}doc6`, title: "Contractor's covering letter", classId: `${P}dc3`, className: "Correspondence", classification: null, createdAt: "2026-09-29T10:30",
      versions: [{ id: `${P}doc6v1`, n: 1, bytes: demoPdf(["Contractor's covering letter (demo)", "Received, not yet filed against any record."]), mediaType: "application/pdf", filename: "covering-letter.pdf", receivedOn: "2026-09-29", storedAt: "2026-09-29T10:30" }],
      attachments: [],
    },
  ];

  const audit: { id: string; organisationId: string; entity: string; entityId: string; entityLabel: string; action: "CREATE" | "UPDATE"; at: Date; changes: object[]; reason: string; unattributed: boolean }[] = [];
  let n = 0;
  const entry = (entity: string, entityId: string, entityLabel: string, action: "CREATE" | "UPDATE", when: string, changes: object[], reason = "") =>
    audit.push({ id: `${P}docau${++n}`, organisationId, entity, entityId, entityLabel, action, at: at(when), changes, reason, unattributed: true });

  for (const d of docs) {
    for (const v of d.versions) {
      await db.blobContent.createMany({ data: [{ organisationId, sha256: sha(v.bytes), byteSize: BigInt(v.bytes.length), bytes: new Uint8Array(v.bytes), storedAt: at(v.storedAt) }], skipDuplicates: true });
    }
    const filedAt = d.attachments.length ? at(d.attachments[0].at) : null;
    await db.document.create({
      data: {
        id: d.id, organisationId, title: d.title, documentClassId: d.classId, classificationSnapshot: d.classification,
        retentionSnapshot: await retentionOfClass(db, d.classId),
        status: filedAt ? "FILED" : "STAGED", createdAt: at(d.createdAt), filedAt,
      },
    });
    entry("Document", d.id, `Document · ${d.title}`, "CREATE", d.createdAt, documentCreated({ title: d.title, className: d.className, classification: d.classification, status: "STAGED" }));
    for (const v of d.versions) {
      await db.documentVersion.create({
        data: {
          id: v.id, organisationId, documentId: d.id, versionNo: v.n, sha256: sha(v.bytes), byteSize: BigInt(v.bytes.length), mediaType: v.mediaType, originalFilename: v.filename,
          receivedOn: v.receivedOn ? day(v.receivedOn) : null, recordedByPersonId: recorder.id, storedAt: at(v.storedAt),
          ...(v.withdrawn ? { withdrawnAt: at(v.withdrawn.at), withdrawnReason: v.withdrawn.reason } : {}),
        },
      });
      entry("DocumentVersion", v.id, `Document · ${d.title} · version ${v.n}`, "CREATE", v.storedAt, versionCreated({ versionNo: v.n, sha256: sha(v.bytes), byteSize: BigInt(v.bytes.length), mediaType: v.mediaType, originalFilename: v.filename, receivedOn: v.receivedOn, recordedBy: recorder.name, note: "" }));
    }
    for (const a of d.attachments) {
      const v = d.versions.find((x) => x.id === a.versionId)!;
      await db.documentAttachment.create({
        data: { id: a.id, organisationId, purpose: a.purpose, versionId: a.versionId, ...a.owner, attachedAt: at(a.at), ...(a.detached ? { detachedAt: at(a.detached.at), detachReason: a.detached.reason } : {}) },
      });
      const label = `${a.ownerLabel} · ${PURPOSE_LABEL[a.purpose]}`;
      if (a === d.attachments[0]) {
        entry("DocumentAttachment", a.id, label, "CREATE", a.at, attached({ purpose: a.purpose, title: d.title, versionNo: v.n, sha256: sha(v.bytes), owner: a.ownerLabel }));
        entry("Document", d.id, `Document · ${d.title}`, "UPDATE", a.at, filed());
      }
      if (a.detached?.replacedBy) {
        const next = d.attachments.find((x) => x.id === a.detached!.replacedBy)!;
        const nv = d.versions.find((x) => x.id === next.versionId)!;
        entry("DocumentAttachment", next.id, label, "UPDATE", a.detached.at, repinned({ purpose: a.purpose, title: d.title, fromVersion: v.n, toVersion: nv.n, toSha256: sha(nv.bytes) }), a.detached.reason.replace(/^Replaced by version \d+: /, ""));
      } else if (a.detached) {
        entry("DocumentAttachment", a.id, label, "UPDATE", a.detached.at, detached({ purpose: a.purpose, title: d.title, versionNo: v.n, reason: a.detached.reason }), a.detached.reason);
      }
    }
    for (const v of d.versions) if (v.withdrawn) entry("DocumentVersion", v.id, `Document · ${d.title} · version ${v.n}`, "UPDATE", v.withdrawn.at, versionWithdrawn({ versionNo: v.n, reason: v.withdrawn.reason }), v.withdrawn.reason);
    if (d.hold) {
      await db.legalHold.create({ data: { id: d.hold.id, organisationId, documentId: d.id, reason: d.hold.reason, placedByPersonId: d.hold.personId, placedAt: at(d.hold.at) } });
      entry("LegalHold", d.hold.id, `Document · ${d.title} · legal hold`, "CREATE", d.hold.at, holdPlaced({ reason: d.hold.reason, placedBy: d.hold.personName }), d.hold.reason);
    }
  }
  await db.auditEntry.createMany({ data: audit as never });

  // The accepted award was accepted on its scan (OD-5): the pin it was accepted on.
  await db.award.update({
    where: { id: `${P}aw5` },
    data: { returnScanSnapshot: { v: 1, purposes: ["ACCEPTANCE_PAGE"], takenOn: "2026-09-21", pins: [{ attachmentId: `${P}doc3a1`, documentId: `${P}doc3`, versionId: `${P}doc3v1`, versionNo: 1, sha256: sha(docs[2].versions[0].bytes), title: docs[2].title, purpose: "ACCEPTANCE_PAGE" }] } },
  });

  // Access, as the screens would have logged it: the minutes downloaded, the SULIT note refused.
  await db.documentAccessEvent.createMany({
    data: [
      { id: `${P}docev1`, organisationId, versionId: `${P}doc1v1`, kind: "DOWNLOADED", at: at("2026-09-09T09:00") },
      { id: `${P}docev2`, organisationId, versionId: `${P}doc5v1`, kind: "REFUSED", reasonCode: "SULIT", at: at("2026-09-10T14:30") },
      { id: `${P}docev3`, organisationId, versionId: `${P}doc2v2`, kind: "VERIFIED", at: at("2026-09-25T15:05") },
    ],
  });
}


async function retentionOfClass(db: Db, classId: string) {
  const c = await db.documentClass.findUniqueOrThrow({ where: { id: classId } });
  return { retentionMonths: c.retentionMonths, retentionTrigger: c.retentionTrigger, disposalMethod: c.disposalMethod, disposalAuthorityRoleCode: c.disposalAuthorityRoleCode, className: c.nameEn, provenance: c.provenance };
}

// ------------------------------------------------------------------ wipe

const demoRef = { startsWith: P };
const onDemoOwner = { OR: [{ meetingId: demoRef }, { exerciseId: demoRef }, { awardId: demoRef }, { delegationId: demoRef }] };
/// No owner key is a demo one. Spelled out per key: in SQL a null key never matches a
/// negated LIKE, so `NOT: onDemoOwner` would silently drop exactly the real records.
const notOnDemoOwner = { AND: (["meetingId", "exerciseId", "awardId", "delegationId"] as const).map((k) => ({ OR: [{ [k]: null }, { NOT: { [k]: demoRef } }] })) };

/**
 * Whether the documents stand in the wipe's way. Checked before anything is removed.
 * Refused (listing them): an attachment on a record that is not demo data pinned to a
 * demo document, and a document that is not demo data attached to a demo record (with
 * --remove-dependents, those attachments are taken off and the documents kept).
 */
export async function documentWipeRefused(db: Db, organisationId: string, removeDependents: boolean): Promise<boolean> {
  const pointing = await db.documentAttachment.findMany({
    where: { organisationId, version: { documentId: demoRef }, ...notOnDemoOwner },
    select: { id: true, purpose: true, version: { select: { document: { select: { title: true } } } } },
  });
  const onDemo = await db.documentAttachment.findMany({
    where: { organisationId, ...onDemoOwner, NOT: { version: { documentId: demoRef } } },
    select: { id: true, purpose: true, version: { select: { document: { select: { title: true } } } } },
  });
  // Real documents and holds that name a demo person: a person is never removed under them.
  const named = await db.documentVersion.findMany({ where: { organisationId, NOT: { documentId: demoRef }, recordedByPersonId: demoRef }, select: { versionNo: true, document: { select: { title: true } } } });
  const holds = await db.legalHold.findMany({ where: { organisationId, NOT: { documentId: demoRef }, OR: [{ placedByPersonId: demoRef }, { releasedByPersonId: demoRef }] }, select: { document: { select: { title: true } } } });
  const hard = pointing.length + named.length + holds.length;
  if (hard || (onDemo.length && !removeDependents)) {
    console.error(
      [
        "Refused: these records are not demo data, but point at demo records, so the demo cannot be removed under them:",
        ...pointing.map((a) => `  an attachment (${PURPOSE_LABEL[a.purpose]}) of the demo document “${a.version.document.title}” on a record that is not demo data`),
        ...onDemo.map((a) => `  the document “${a.version.document.title}”, attached to a demo record as ${PURPOSE_LABEL[a.purpose]}`),
        ...named.map((v) => `  version ${v.versionNo} of the document “${v.document.title}”, recorded on behalf of a demo person`),
        ...holds.map((h) => `  a legal hold on the document “${h.document.title}”, placed or released by a demo person`),
        hard
          ? "Nothing was removed. A document, its versions and its holds are never removed for the demo: take the attachments off the real records, and wipe only where no real document names a demo person."
          : "Nothing was removed. Take them off first, or run the wipe again with --remove-dependents, which takes those attachments off and keeps the documents.",
      ].join("\n"),
    );
    return true;
  }
  return false;
}

/**
 * Remove the demo documents and everything recorded under them, in dependency order:
 * access events, holds, attachments, versions, documents — then only the blobs no
 * remaining version references. Then the demo upload rules, if they still hold the
 * demo's values (a policy edited since is real configuration, and is kept).
 */
export async function wipeDocuments(db: Db, organisationId: string) {
  // Documents not demo data, attached to demo records: their attachments come off (the
  // refusal above allowed it only with --remove-dependents); the documents stay.
  const foreign = await db.documentAttachment.findMany({ where: { organisationId, ...onDemoOwner, NOT: { version: { documentId: demoRef } } }, select: { id: true } });
  if (foreign.length) {
    await db.documentAttachment.deleteMany({ where: { id: { in: foreign.map((a) => a.id) } } });
    await db.auditEntry.deleteMany({ where: { organisationId, entityId: { in: foreign.map((a) => a.id) } } });
    console.log(`--remove-dependents: took ${foreign.length} attachment(s) of documents that are not demo data off demo records; the documents are kept.`);
  }

  const docs = await db.document.findMany({ where: { organisationId, id: demoRef }, select: { id: true, versions: { select: { id: true, sha256: true, attachments: { select: { id: true } } } }, holds: { select: { id: true } } } });
  const docIds = docs.map((d) => d.id);
  const versions = docs.flatMap((d) => d.versions);
  const versionIds = versions.map((v) => v.id);
  const entityIds = [...docIds, ...versionIds, ...versions.flatMap((v) => v.attachments.map((a) => a.id)), ...docs.flatMap((d) => d.holds.map((h) => h.id))];

  await db.documentAccessEvent.deleteMany({ where: { OR: [{ versionId: { in: versionIds } }, { id: demoRef }] } });
  await db.legalHold.deleteMany({ where: { documentId: { in: docIds } } });
  await db.documentAttachment.deleteMany({ where: { versionId: { in: versionIds } } });
  await db.documentVersion.deleteMany({ where: { id: { in: versionIds } } });
  await db.document.deleteMany({ where: { id: { in: docIds } } });
  // Only bytes nothing else stands on: a version that is not demo data may share a digest.
  const digests = [...new Set(versions.map((v) => v.sha256))];
  const stillUsed = new Set((await db.documentVersion.findMany({ where: { organisationId, sha256: { in: digests } }, select: { sha256: true } })).map((v) => v.sha256));
  const free = digests.filter((d) => !stillUsed.has(d));
  if (free.length) await db.blobContent.deleteMany({ where: { organisationId, sha256: { in: free } } });
  if (entityIds.length) await db.auditEntry.deleteMany({ where: { organisationId, entityId: { in: entityIds } } });

  const policy = await db.documentStorePolicy.findUnique({ where: { id: DEMO_POLICY_ID } });
  if (policy) {
    const unchanged = policy.maxBytes === DEMO_POLICY.maxBytes && policy.allowedMediaTypes.join(",") === DEMO_POLICY.allowedMediaTypes.join(",");
    if (unchanged) await db.documentStorePolicy.delete({ where: { id: DEMO_POLICY_ID } });
    else {
      const kept = `policy_${Date.now().toString(36)}`;
      await db.documentStorePolicy.update({ where: { id: DEMO_POLICY_ID }, data: { id: kept } });
      await db.auditEntry.updateMany({ where: { entity: "DocumentStorePolicy", entityId: DEMO_POLICY_ID }, data: { entityId: kept } });
      console.log("The upload rules were changed after the demo loaded, so they were kept.");
    }
  }
}
