/**
 * Demo documents (plan platform-document-store.md §9). Invented throughout; every file is
 * generated here — one-page PDFs reading "DEMO — invented document, not a real record"
 * and a small drawn PNG. Nothing comes from a client's documents.
 *
 * - Every dossier or scope document is attached AFTER its exercise was determined (8 Sep): the
 *   exercise recorded "not attached" on that day, and a screen that says so since then is only
 *   honest if the attachment really came later. No recorded act is dated after the load day.
 * - Classes: demo_dc1 Internal (assumed), demo_dc2 SULIT, demo_dc3 classification unset
 *   (set where the classes are created, in demo.ts). Upload rules PDF/PNG/JPEG, 20 MB,
 *   ASSUMED — only where the organisation has none of its own.
 * - Signed minutes on one minuted sitting the requisition gate cites (another is left
 *   outstanding); dossier evidence on demo_sx2 with a withdrawn v1 and a live v2 (demo_sx7
 *   is left without, so BD-4's block stays visible); the acceptance-page scan on the
 *   accepted demo award; the absent holder's signed recommendation on demo_dg3; one SULIT
 *   document (listed, never served); one legal hold; one staged upload not yet filed.
 *
 * Nothing removes them (Phase 1d): a stored version is never deleted (OD-9, now a trigger), and the
 * demo's wipe is retired. `src/lib/documents/demo-wipe-plan.ts`, which planned that wipe, is kept
 * with its tests as the record of how it judged a document, and has no caller.
 */

import { createHash } from "node:crypto";

import type { PrismaClient } from "../src/generated/prisma/client";
import { attached, detached, documentCreated, filed, holdPlaced, repinAudit, versionCreated, versionWithdrawn } from "../src/lib/documents/audit-view";
import { PURPOSE_LABEL } from "../src/lib/documents/labels";
import { DOCX_TYPE, XLSX_TYPE } from "../src/lib/documents/media";
import type { AttachmentPurpose, SecurityClass } from "../src/lib/documents/types";
import { initialsLogo } from "../src/lib/organisation/png";
import { bqImportAudit } from "../src/lib/scope/audit-view";
import { sx15BillCsv } from "./demo-scope";
import { DEMO_ACTOR } from "./demo-actor";

type Db = PrismaClient;
const P = "demo_";
const day = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
const at = (iso: string) => new Date(`${iso}:00.000Z`);
const sha = (b: Uint8Array) => createHash("sha256").update(b).digest("hex");

export const DEMO_POLICY_ID = `${P}docpolicy`;
const DEMO_POLICY = { allowedMediaTypes: ["application/pdf", "image/png", "image/jpeg", "text/csv", XLSX_TYPE, DOCX_TYPE], maxBytes: 20n * 1024n * 1024n };

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

export interface DemoVersion {
  id: string;
  n: number;
  bytes: Buffer;
  mediaType: string;
  filename: string;
  receivedOn: string | null;
  storedAt: string;
  withdrawn?: { at: string; reason: string };
}

export interface DemoDoc {
  id: string;
  title: string;
  classId: string;
  className: string;
  classification: SecurityClass | null;
  createdAt: string;
  versions: DemoVersion[];
  attachments: { id: string; purpose: AttachmentPurpose; owner: { meetingId?: string; exerciseId?: string; awardId?: string; delegationId?: string; specificationPanelId?: string; bqVersionId?: string; tenderPackPartId?: string; addendumId?: string; bidWithdrawalId?: string; validityExtensionId?: string; openingId?: string; evaluationId?: string; evaluationMeetingId?: string; evaluationBidderId?: string; supplierDocumentId?: string; supplierApplicationId?: string; registrationDraftDocumentId?: string; creditorProfileId?: string; contractId?: string; variationInstructionId?: string; projectDocumentVersionId?: string }; ownerLabel: string; versionId: string; at: string; detached?: { at: string; reason: string; replacedBy?: string } }[];
  hold?: { id: string; reason: string; at: string; personId: string; personName: string };
  /// The staged-for mark the upload route gave it (a project file: STAGED_FOR_PROJECT_DOCUMENT).
  stagedFor?: string;
}

export async function loadDocuments(db: Db, organisationId: string) {
  // Upload rules, only where the organisation has none of its own (OD-3: demo values ASSUMED).
  if (!(await db.documentStorePolicy.findUnique({ where: { organisationId } }))) {
    // The Project workspace's files go to the Internal class (contractors download them, so never SULIT or unclassified).
    await db.documentStorePolicy.create({ data: { id: DEMO_POLICY_ID, organisationId, ...DEMO_POLICY, projectDocumentClassId: `${P}dc1`, provenance: "ASSUMED", notes: "Demo upload rules: PDF, PNG, JPEG and CSV up to 20 MB. Invented, not a recommendation." } });
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
      id: `${P}doc2`, title: "Distributor's letter of sole authority", ...internal, createdAt: "2026-09-09T09:00",
      versions: [
        { id: `${P}doc2v1`, n: 1, bytes: demoPdf(["Distributor's letter of sole authority — page 1 of 2", "Dosing controllers (demo)"]), mediaType: "application/pdf", filename: "sole-authority-letter.pdf", receivedOn: "2026-08-12", storedAt: "2026-09-09T09:00", withdrawn: { at: "2026-09-10T11:30", reason: "The scan was missing its second page." } },
        { id: `${P}doc2v2`, n: 2, bytes: demoPdf(["Distributor's letter of sole authority — pages 1 and 2", "Dosing controllers (demo)", "Rescanned with both pages."]), mediaType: "application/pdf", filename: "sole-authority-letter-complete.pdf", receivedOn: "2026-08-12", storedAt: "2026-09-10T11:20" },
      ],
      attachments: [
        { id: `${P}doc2a1`, purpose: "DOSSIER_EVIDENCE", owner: { exerciseId: `${P}sx2` }, ownerLabel: "DEMO/SX/0002/2026", versionId: `${P}doc2v1`, at: "2026-09-09T09:05", detached: { at: "2026-09-10T11:25", reason: "Replaced by version 2: Rescanned with both pages.", replacedBy: `${P}doc2a2` } },
        { id: `${P}doc2a2`, purpose: "DOSSIER_EVIDENCE", owner: { exerciseId: `${P}sx2` }, ownerLabel: "DEMO/SX/0002/2026", versionId: `${P}doc2v2`, at: "2026-09-10T11:25" },
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
      id: `${P}doc5`, title: "Coordination meeting scope and cost note", classId: `${P}dc2`, className: "Certificates", classification: "SULIT", createdAt: "2026-09-09T16:00",
      versions: [{ id: `${P}doc5v1`, n: 1, bytes: demoPdf(["Coordination meeting scope and cost note (demo, SULIT)", "Burst trunk main, upper zone", "Listed, never opened in the portal before sign-in."]), mediaType: "application/pdf", filename: "scope-and-cost-note.pdf", receivedOn: "2026-09-02", storedAt: "2026-09-09T16:00" }],
      attachments: [{ id: `${P}doc5a1`, purpose: "COORDINATION_SCOPE", owner: { exerciseId: `${P}sx4` }, ownerLabel: "DEMO/SX/0004/2026", versionId: `${P}doc5v1`, at: "2026-09-09T16:05" }],
    },
    // 6.2 Q-1: each verified panel's signed form, SULIT, attached on the day it was verified.
    ...(["0001", "0005"] as const).map((ref, i) => ({
      id: `${P}doc${7 + i}`, title: `Signed specification panel form, DEMO/SX/${ref}/2026`, classId: `${P}dc2`, className: "Certificates", classification: "SULIT" as const, createdAt: i === 0 ? "2026-09-14T15:30" : "2026-09-22T15:30",
      versions: [{ id: `${P}doc${7 + i}v1`, n: 1, bytes: demoPdf([`Specification panel form (demo, SULIT) — DEMO/SX/${ref}/2026`, "Prepared, checked and approved for issue, signed on paper.", "Listed, never opened in the portal before sign-in."]), mediaType: "application/pdf", filename: `panel-form-${ref}.pdf`, receivedOn: i === 0 ? "2026-09-14" : "2026-09-22", storedAt: i === 0 ? "2026-09-14T15:30" : "2026-09-22T15:30" }],
      attachments: [{ id: `${P}doc${7 + i}a1`, purpose: "SPEC_PANEL_FORM" as const, owner: { specificationPanelId: `${P}spp${i === 0 ? 1 : 5}` }, ownerLabel: `DEMO/SX/${ref}/2026 · Specification panel`, versionId: `${P}doc${7 + i}v1`, at: i === 0 ? "2026-09-14T15:35" : "2026-09-22T15:35" }],
    })),
    // 6.4 (X-10 c): sx15's panel form, so its tender documents can go for approval honestly.
    {
      id: `${P}doc10`, title: "Signed specification panel form, DEMO/SX/0015/2026", classId: `${P}dc2`, className: "Certificates", classification: "SULIT" as const, createdAt: "2026-09-27T15:30",
      versions: [{ id: `${P}doc10v1`, n: 1, bytes: demoPdf(["Specification panel form (demo, SULIT) — DEMO/SX/0015/2026", "Prepared, checked and approved for issue, signed on paper.", "Listed, never opened in the portal before sign-in."]), mediaType: "application/pdf", filename: "panel-form-0015.pdf", receivedOn: "2026-09-27", storedAt: "2026-09-27T15:30" }],
      attachments: [{ id: `${P}doc10a1`, purpose: "SPEC_PANEL_FORM" as const, owner: { specificationPanelId: `${P}spp15` }, ownerLabel: "DEMO/SX/0015/2026 · Specification panel", versionId: `${P}doc10v1`, at: "2026-09-27T15:35" }],
    },
    // 6.2 Q-3: the bill sx15's version 1 was imported from, kept as received (INTERNAL, the officer's choice).
    {
      id: `${P}doc9`, title: "Bill of quantities from the tank's manufacturer, DEMO/SX/0015/2026", ...internal, createdAt: "2026-09-25T09:30",
      versions: [{ id: `${P}doc9v1`, n: 1, bytes: Buffer.from(await sx15BillCsv(), "utf8"), mediaType: "text/csv", filename: "frp-tank-repair-bill.csv", receivedOn: "2026-09-24", storedAt: "2026-09-25T09:30" }],
      attachments: [{ id: `${P}doc9a1`, purpose: "BQ_IMPORT_SOURCE", owner: { bqVersionId: `${P}bqv4` }, ownerLabel: "DEMO/SX/0015/2026 · Bill of quantities v1", versionId: `${P}doc9v1`, at: "2026-09-25T09:35" }],
    },
    {
      id: `${P}doc6`, title: "Contractor's covering letter", classId: `${P}dc3`, className: "Correspondence", classification: null, createdAt: "2026-09-29T10:30",
      versions: [{ id: `${P}doc6v1`, n: 1, bytes: demoPdf(["Contractor's covering letter (demo)", "Received, not yet filed against any record."]), mediaType: "application/pdf", filename: "covering-letter.pdf", receivedOn: "2026-09-29", storedAt: "2026-09-29T10:30" }],
      attachments: [],
    },
  ];

  const entry = await writeDemoDocs(db, organisationId, docs, `${P}docau`, recorder);
  // The import that attached doc9 also recorded what it added on the bill (importBqCsv).
  {
    const d = docs.find((x) => x.id === `${P}doc9`)!;
    const v = d.versions[0];
    const { parseBqCsv } = await import("../src/lib/scope/csv");
    const parsed = parseBqCsv(v.bytes.toString("utf8"));
    entry("BqVersion", `${P}bqv4`, "DEMO/SX/0015/2026 · Bill of quantities v1", "UPDATE", "2026-09-25T09:35",
      bqImportAudit({ file: v.filename, documentTitle: d.title, versionNo: 1, sha256: sha(v.bytes), sections: parsed.sections.length, lines: parsed.lineCount, replacedLines: 0, mismatches: parsed.keyedMismatches.length, priced: parsed.priced }));
  }
  await entry.flush();

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

/**
 * Write demo documents as the store's acts would have: each version's bytes, the document,
 * its versions, attachments (and re-pins, detachments, withdrawals, holds), each with the
 * trail its act writes. Audit rows are numbered `${auditPrefix}n`; `entry` adds more and
 * `flush` writes them. Shared with the 6.4 demo (tender pack parts' files).
 */
export async function writeDemoDocs(db: Db, organisationId: string, docs: readonly DemoDoc[], auditPrefix: string, recorder: { id: string; name: string } | { supplierAccountId: string; name: string }) {
  const audit: { id: string; organisationId: string; entity: string; entityId: string; entityLabel: string; action: "CREATE" | "UPDATE"; at: Date; changes: object[]; reason: string; unattributed: boolean }[] = [];
  let n = 0;
  const entry = (entity: string, entityId: string, entityLabel: string, action: "CREATE" | "UPDATE", when: string, changes: object[], reason = "") =>
    audit.push({ id: `${auditPrefix}${++n}`, organisationId, entity, entityId, entityLabel, action, at: at(when), changes, reason, ...DEMO_ACTOR });

  for (const d of docs) {
    for (const v of d.versions) {
      await db.blobContent.createMany({ data: [{ organisationId, sha256: sha(v.bytes), byteSize: BigInt(v.bytes.length), bytes: new Uint8Array(v.bytes), storedAt: at(v.storedAt) }], skipDuplicates: true });
    }
    const filedAt = d.attachments.length ? at(d.attachments[0].at) : null;
    await db.document.create({
      data: {
        id: d.id, organisationId, title: d.title, documentClassId: d.classId, classificationSnapshot: d.classification,
        retentionSnapshot: await retentionOfClass(db, d.classId),
        status: filedAt ? "FILED" : "STAGED", createdAt: at(d.createdAt), filedAt, stagedFor: d.stagedFor ?? null,
      },
    });
    entry("Document", d.id, `Document · ${d.title}`, "CREATE", d.createdAt, documentCreated({ title: d.title, className: d.className, classification: d.classification, status: "STAGED" }));
    for (const v of d.versions) {
      await db.documentVersion.create({
        data: {
          id: v.id, organisationId, documentId: d.id, versionNo: v.n, sha256: sha(v.bytes), byteSize: BigInt(v.bytes.length), mediaType: v.mediaType, originalFilename: v.filename,
          receivedOn: v.receivedOn ? day(v.receivedOn) : null, ...("supplierAccountId" in recorder ? { recordedBySupplierAccountId: recorder.supplierAccountId } : { recordedByPersonId: recorder.id }), storedAt: at(v.storedAt),
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
        // As attachNewVersion writes it: the old attachment closed, the new one opened, each under its own id.
        const why = a.detached.reason.replace(/^Replaced by version \d+: /, "");
        for (const e of repinAudit({ purpose: a.purpose, title: d.title, owner: a.ownerLabel, reason: why, from: { attachmentId: a.id, versionNo: v.n }, to: { attachmentId: next.id, versionNo: nv.n, sha256: sha(nv.bytes) } })) {
          entry("DocumentAttachment", e.entityId, label, e.action, a.detached.at, e.changes, why);
        }
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
  const flush = async () => {
    await db.auditEntry.createMany({ data: audit as never });
    audit.length = 0;
  };
  return Object.assign(entry, { flush });
}

async function retentionOfClass(db: Db, classId: string) {
  const c = await db.documentClass.findUniqueOrThrow({ where: { id: classId } });
  return { retentionMonths: c.retentionMonths, retentionTrigger: c.retentionTrigger, disposalMethod: c.disposalMethod, disposalAuthorityRoleCode: c.disposalAuthorityRoleCode, className: c.nameEn, provenance: c.provenance };
}

