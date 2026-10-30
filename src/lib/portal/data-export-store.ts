import { createHash } from "node:crypto";

import { db } from "@/lib/db";
import { writeAudit, type Tx } from "@/lib/audit/record";
import { OWN_RECORD, writeSupplierSulitEvent } from "@/lib/auth/creditor-access-store";
import type { SupplierActor } from "@/lib/auth/types";
import { loadOwnBidReceipts } from "@/lib/bids/online/my-bids-store";
import { dayIn, dayToDate } from "@/lib/dates";
import { formatDate } from "@/lib/format";
import { auditActorOf } from "@/lib/portal/bids/signup-store";
import { loadBidContext } from "@/lib/portal/bids/context-store";
import { loadBankTab } from "@/lib/portal/company/company-store";
import { STANDING_AWARD } from "@/lib/portal/projects/visibility";
import { loadDocumentFactsMany } from "@/lib/project-docs/facts";
import { standingView } from "@/lib/portal/company/standing-view";
import { loadRegistrationSettings } from "@/lib/portal/registration/context-store";
import { SUPPLIER_ENTITY } from "@/lib/suppliers/audit-view";
import { CONTACT_FIELDS } from "@/lib/suppliers/contact-fields";
import { buildSupplierExport, exportAuditChanges, exportFileName, exportJson, exportSectionCounts, type ExportLists, type KickOffMeetingSource, type ProjectDocumentSource, type SupplierExport, type SupplierExportSource, type WorkItemSource } from "@/lib/suppliers/data-export";
import { inColumns } from "@/lib/suppliers/data-export-fields";
import { standingOf } from "@/lib/suppliers/standing-repo";
import { inOrder } from "@/lib/series";

/**
 * A signed-in supplier's export of its own data (N2, the PDPA right of access, ruling 1875(8); plan docs/notes/plans/backlog-n2.md step 2). Every read names the SESSION's supplier and
 * organisation (`actor`) and nothing a request carries. Rows are selected through the export's allow-list (`inColumns`), so an OUT column is never read; the pure selector cuts every row to its
 * IN columns again (`pickIn`).
 *
 * One transaction: the reads, the SULIT access events (the bank tab's versions as `loadBankTab` writes them, and the contacts), the export row and its audit row (CREATE, on the supplier's
 * History as "<reference> · Data export", its changes the form, the section counts and the digest, never a value). If any part fails, none is recorded.
 *
 * No standing gate (ruling 1875(3)): a rejected, suspended or blacklisted supplier may sign in to read, and the export is a read.
 *
 * What it reuses rather than restates: the bank tab's set and its SULIT events (`loadBankTab`), the standing reading (`standingOf`, `standingView`), what an exercise a supplier may see is
 * (`loadBidContext`, the restricted-exercise visibility), and the bid receipts' reader (`loadOwnBidReceipts`, the one store allowed to read the online bid tables by supplier). The other
 * reads repeat the scoping of the readers they mirror (named at each) but select the allow-list's columns, because those readers return screen views, not rows.
 */

const TX = { timeout: 30_000, maxWait: 10_000 } as const;

export interface SupplierDataExportResult {
  export: SupplierExport;
  /// The file's text (`exportJson`). The FILE form's digest is SHA-256 of exactly these bytes as UTF-8.
  json: string;
  fileName: string;
  /// Every file version the export lists (a document's, a bank statement's): the printable page may give each a fresh tokened link, and no other.
  liveLinks: Map<string, true>;
}

const LIST_KINDS = { entityType: "ENTITY_TYPE", country: "COUNTRY", state: "STATE", bumiputeraClaim: "BUMIPUTERA_STATUS", bank: "BANK", bankAccountType: "ACCOUNT_TYPE" } as const;

/// A list's values by code, as their English names.
function listsOf(values: readonly { list: string; code: string; nameEn: string }[]): ExportLists {
  const of = (kind: string): Record<string, string> => Object.fromEntries(values.filter((v) => v.list === kind).map((v) => [v.code, v.nameEn]));
  return Object.fromEntries(Object.entries(LIST_KINDS).map(([key, kind]) => [key, of(kind)])) as unknown as ExportLists;
}

const exerciseName = (ex: { reference: string; title: string }) => `${ex.title} (${ex.reference})`;

/// The supplier's own declarations and agreements, as the export reads them: those signed on one of its applications, and (ADR 0041 D6) those agreed with the online application one was
/// approved from. The columns the export may show, and two keys read to word a row (agreed, not signed), never written.
export function ownDeclarationRows(tx: Tx, organisationId: string, supplierId: string) {
  return tx.registrationDeclaration.findMany({ where: { organisationId, OR: [{ application: { supplierId } }, { portalApplication: { supplierApplication: { supplierId } } }] }, orderBy: [{ signedAt: "asc" }, { kind: "asc" }], select: { ...inColumns("RegistrationDeclaration"), portalApplicationId: true, signedBySupplierAccountId: true } });
}

/**
 * The kick-off meeting of each contract the supplier holds (ADR 0042 D10, PW-19), scoped by the contract as `readProjectDocuments` is. Every attendance row is read, with the
 * contact's name of the account it names only where that account is this supplier's own; `buildSupplierExport` lets only those rows through.
 */
export async function readKickOffMeetings(tx: Tx, actor: Pick<SupplierActor, "supplierId" | "organisationId">): Promise<KickOffMeetingSource[]> {
  const meetings = await tx.kickOffMeeting.findMany({
    where: { organisationId: actor.organisationId, contract: { award: { vendorId: actor.supplierId, status: { in: [...STANDING_AWARD] } } } },
    orderBy: [{ meetsAt: "asc" }, { id: "asc" }],
    select: {
      ...inColumns("KickOffMeeting"),
      contract: { select: { number: true, award: { select: { exercise: { select: { title: true } } } } } },
      attendance: { orderBy: { id: "asc" }, select: { ...inColumns("KickOffAttendance"), supplierAccount: { select: { supplierId: true, contact: { select: { name: true } } } } } },
    },
  });
  return meetings.map(({ contract, attendance, ...row }) => ({
    row,
    contractLabel: `${contract.number} · ${contract.award.exercise.title}`,
    attendance: attendance.map(({ supplierAccount, ...a }) => ({ row: a, ownAccountName: supplierAccount && supplierAccount.supplierId === actor.supplierId ? supplierAccount.contact.name : null })),
  }));
}

/**
 * The work items the supplier's own accounts raised from the portal, and the replies they wrote (workspace 3b, ADR 0049 D2). Scoped by those account columns, never by the
 * contract: an item is read only if one of the supplier's accounts raised it or replied on it, and of its comments only those replies (a contractor's comment is never internal,
 * by CHECK; `internal: false` is said again here). Shared items only: an item the contractor raised or wrote on is shared by CHECK and trigger, so this narrows nothing real.
 */
export async function readWorkItems(tx: Tx, actor: Pick<SupplierActor, "supplierId" | "organisationId">): Promise<WorkItemSource[]> {
  const own = { supplierId: actor.supplierId };
  const items = await tx.workItem.findMany({
    where: { organisationId: actor.organisationId, sharedAt: { not: null }, OR: [{ raisedBySupplierAccount: own }, { comments: { some: { supplierAccount: own, internal: false } } }] },
    orderBy: [{ recordedAt: "asc" }, { id: "asc" }],
    select: {
      ...inColumns("WorkItem"),
      raisedBySupplierAccount: { select: { supplierId: true } },
      contract: { select: { number: true, award: { select: { exercise: { select: { title: true } } } } } },
      comments: { where: { supplierAccount: own, internal: false }, orderBy: [{ recordedAt: "asc" }, { id: "asc" }], select: inColumns("WorkItemComment") },
    },
  });
  return items.map(({ contract, raisedBySupplierAccount, comments, ...row }) => ({
    row,
    contractLabel: `${contract.number} · ${contract.award.exercise.title}`,
    raisedByOwnAccount: raisedBySupplierAccount?.supplierId === actor.supplierId,
    replies: comments,
  }));
}

/**
 * The Project workspace documents on the contracts the supplier holds (PW-19): every document, with all its versions, files, decisions and requests, and the facts the contractor's reading is
 * made from. Scoped by the contract (its award names this supplier and stands: `supplierHoldsContract`'s one rule), never by "rows that name an account", so a document the contractor never
 * wrote is in the read; what the contractor may not see is dropped by `buildSupplierExport` (PW-28), which is where that is decided and tested. The names are the organisation's, or the
 * contractor's own colleague's: never an officer's.
 */
export async function readProjectDocuments(tx: Tx, actor: Pick<SupplierActor, "supplierId" | "organisationId">, orgName: string): Promise<ProjectDocumentSource[]> {
  const contracts = await tx.contract.findMany({
    where: { organisationId: actor.organisationId, award: { vendorId: actor.supplierId, status: { in: [...STANDING_AWARD] } } },
    orderBy: [{ numberedOn: "desc" }, { number: "asc" }],
    select: { id: true, number: true, award: { select: { exercise: { select: { title: true } } } } },
  });
  if (contracts.length === 0) return [];
  const label = new Map(contracts.map((c) => [c.id, `${c.number} · ${c.award.exercise.title}`]));
  const docs = await tx.projectDocument.findMany({
    where: { organisationId: actor.organisationId, contractId: { in: contracts.map((c) => c.id) } },
    orderBy: [{ contractId: "asc" }, { createdAt: "asc" }, { id: "asc" }],
    select: {
      ...inColumns("ProjectDocument"),
      id: true,
      contractId: true,
      versions: {
        orderBy: { number: "asc" },
        select: {
          ...inColumns("ProjectDocumentVersion"),
          id: true,
          uploadedByPersonId: true,
          uploadedBySupplierAccount: { select: { contact: { select: { name: true } } } },
          files: { where: { detachedAt: null, version: { withdrawnAt: null } }, orderBy: { attachedAt: "asc" }, select: { id: true, version: { select: inColumns("DocumentVersion") } } },
          decisions: { orderBy: [{ decidedAt: "asc" }, { id: "asc" }], select: inColumns("ProjectDocumentDecision") },
        },
      },
      requests: {
        orderBy: [{ requestedAt: "asc" }, { id: "asc" }],
        select: { ...inColumns("ProjectDocumentRequest"), requestedByPersonId: true, requestedBySupplierAccount: { select: { contact: { select: { name: true } } } }, answeredBy: { select: { id: true } } },
      },
    },
  });
  const facts = await loadDocumentFactsMany(tx, docs.map((d) => d.id));
  return docs.flatMap((d) => {
    const f = facts.get(d.id);
    if (!f) return [];
    return [
      {
        row: d,
        facts: f,
        contractLabel: label.get(d.contractId) ?? "",
        versions: d.versions.map((v) => ({
          id: v.id,
          row: v,
          sentBy: v.uploadedByPersonId ? orgName : (v.uploadedBySupplierAccount?.contact.name ?? ""),
          files: v.files.map((a) => ({ attachmentId: a.id, version: a.version })),
          decisions: v.decisions,
        })),
        requests: d.requests.map((r) => ({ row: r, by: r.requestedByPersonId ? orgName : (r.requestedBySupplierAccount?.contact.name ?? ""), answeredByVersionId: r.answeredBy?.id ?? null })),
      },
    ];
  });
}

export async function exportSupplierData(actor: SupplierActor, form: "FILE" | "PAGE", now: Date = new Date()): Promise<SupplierDataExportResult | null> {
  return db.$transaction(async (tx) => {
    const own = { organisationId: actor.organisationId, supplierId: actor.supplierId };
    const settings = await loadRegistrationSettings(tx, actor.organisationId);
    const supplier = await tx.supplier.findFirst({ where: { id: actor.supplierId, organisationId: actor.organisationId }, select: inColumns("Supplier") });
    if (!settings || !supplier) return null;
    const reference = String(supplier.reference ?? "");

    const [lists, contacts, declarations, documents, standingChanges, applications] = await inOrder(
      () => tx.supplierListValue.findMany({ where: { organisationId: actor.organisationId, list: { in: Object.values(LIST_KINDS) } }, select: { list: true, code: true, nameEn: true } }),
      // As `loadContactsSummary`: the contacts not retired, the primary first.
      () => tx.supplierContact.findMany({ where: { ...own, retiredOn: null }, orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }], select: { ...inColumns("SupplierContact"), account: { select: { ...inColumns("SupplierAccount"), id: true } } } }),
      // As `loadDeclarationsSummary`: every declaration signed on one of the supplier's applications, and (ADR 0041 D6) every agreement made with the online application one was approved from.
      // Two keys are read to word the row (agreed, not signed), never written.
      () => ownDeclarationRows(tx, actor.organisationId, actor.supplierId),
      // As `loadDocumentsTab` and `companyDocument`: every document of the supplier, with its codes and its live files (attached, not withdrawn).
      () => tx.supplierDocument.findMany({
        where: own,
        orderBy: [{ lodgedOn: "asc" }, { id: "asc" }],
        select: {
          ...inColumns("SupplierDocument"),
          values: { orderBy: { codeSnapshot: "asc" }, select: inColumns("SupplierDocumentValue") },
          attachments: { where: { purpose: "SUPPLIER_DOCUMENT", detachedAt: null, version: { withdrawnAt: null } }, select: { version: { select: inColumns("DocumentVersion") } } },
        },
      }),
      // Conservative reading (decisions log 2026-10-19): only what stands today, as the portal's standing reading does. A withdrawn change, or one not yet in effect, is left out; with no organisation day nothing is.
      () => settings.org.today ? tx.standingEvent.findMany({ where: { ...own, withdrawnAt: null, effectiveOn: { lte: dayToDate(settings.org.today) } }, orderBy: [{ effectiveOn: "asc" }, { recordedAt: "asc" }], select: inColumns("StandingEvent") }) : Promise.resolve([]),
      // As `loadRegistrationStatus` (which reads outside this transaction): the supplier's applications, newest first, each with its outcomes and the items asked for.
      () => tx.supplierApplication.findMany({
        where: own,
        orderBy: [{ receivedOn: "desc" }, { createdAt: "desc" }],
        select: {
          ...inColumns("SupplierApplication"),
          decisions: { orderBy: { decidedAt: "desc" }, select: { ...inColumns("ApplicationDecision"), items: { orderBy: { id: "asc" }, select: inColumns("ResubmissionItem") } } },
        },
      }));

    // A supplier reading its own contacts: granted as its own record, and logged (NFR-AUD-004), as the staff page logs the same fields.
    if (contacts.length > 0) await writeSupplierSulitEvent(tx, actor, { scope: "supplier", entity: "Supplier", entityId: actor.supplierId, entityLabel: reference, fields: [...CONTACT_FIELDS], decision: OWN_RECORD });

    // The bank tab's set (in force, waiting, not in order), with its SULIT event per version, written by the bank tab's own reader; then those versions' rows through the allow-list.
    const bankTab = await loadBankTab(tx, actor);
    const bankIds = bankTab.versions.map((v) => v.row.id);
    const bank = bankIds.length
      ? await tx.creditorProfile.findMany({
          where: { ...own, id: { in: bankIds } },
          orderBy: { version: "desc" },
          select: { ...inColumns("CreditorProfile"), attachments: { where: { purpose: "SUPPLIER_BANK_STATEMENT", detachedAt: null, version: { withdrawnAt: null } }, select: { version: { select: inColumns("DocumentVersion") } } } },
        })
      : [];

    const today = settings.org.today;
    const standing = today ? await standingOf(actor.supplierId, actor.organisationId, today, tx) : null;

    // Purchases and downloads, and the online bid receipts, grouped by exercise. An exercise the supplier may not see today (the restricted-exercise visibility) is left out whole, as the
    // portal answers it "not found".
    const [purchases, downloads, receipts] = await inOrder(
      () => tx.documentPurchase.findMany({ where: own, orderBy: { createdAt: "asc" }, select: { ...inColumns("DocumentPurchase"), window: { select: { exerciseId: true } }, attempts: { orderBy: { attemptNo: "asc" }, select: inColumns("PaymentAttempt") } } }),
      () => tx.purchaseDownload.findMany({ where: own, orderBy: { downloadedAt: "asc" }, select: { ...inColumns("PurchaseDownload"), window: { select: { exerciseId: true } } } }),
      () => loadOwnBidReceipts(tx, actor));
    const exerciseIds = [...new Set([...purchases.map((p) => p.window.exerciseId), ...downloads.map((d) => d.window.exerciseId), ...receipts.map((r) => r.exerciseId)])];
    const seen = new Map<string, string>();
    for (const id of exerciseIds) {
      const ctx = await loadBidContext(tx, actor, id, now);
      if (ctx) seen.set(id, exerciseName(ctx.ex));
    }

    const purchaseSource: SupplierExportSource["purchases"] = [...seen].flatMap(([id, name]) => {
      const bought = purchases.filter((p) => p.window.exerciseId === id);
      const taken = downloads.filter((d) => d.window.exerciseId === id);
      if (bought.length === 0 && taken.length === 0) return [];
      // One purchase per window and supplier (@@unique): an exercise has one window, so at most one here.
      const p = bought[0] ?? null;
      return [{ exerciseName: name, row: p, attempts: p ? p.attempts : [], downloads: taken }];
    });

    const projectDocuments = await readProjectDocuments(tx, actor, settings.org.name);
    const kickOffMeetings = await readKickOffMeetings(tx, actor);
    const workItems = await readWorkItems(tx, actor);

    const src: SupplierExportSource = {
      organisationName: settings.org.name,
      accountId: actor.accountId,
      supplier,
      lists: listsOf(lists),
      contacts: contacts.map(({ account, ...row }) => ({ row, open: true, account: account ?? null })),
      declarations,
      bank: bank.map(({ attachments, ...row }) => ({ row, files: attachments.map((a) => a.version) })),
      documents: documents.map(({ values, attachments, ...row }) => ({ row, values, files: attachments.map((a) => a.version) })),
      standing: standing ? standingView(standing.reading, (d) => formatDate(d)) : null,
      standingChanges,
      applications: applications.map(({ decisions, ...row }) => ({ row, decisions: decisions.map(({ items, ...d }) => ({ row: d, items })) })),
      purchases: purchaseSource,
      projectDocuments,
      kickOffMeetings,
      workItems,
      bidReceipts: receipts.flatMap((r) => (seen.has(r.exerciseId) ? [{ row: r.row, exerciseName: seen.get(r.exerciseId)!, receivedAt: r.receivedAt, late: r.late, keyFingerprint: r.keyFingerprint }] : [])),
    };

    const timeZone = actor.organisationTimeZone;
    // The office as the export names it: blank reads as "the procurement office" (`leftOutWords`), the wording the portal already uses. Nothing is configured to name it otherwise yet.
    const e = buildSupplierExport(src, { generatedAt: now, timeZone, officeName: "" });
    const json = exportJson(e);
    // The organisation's day names the file; with no zone set, the UTC day (a file name, not a recorded day).
    const fileName = exportFileName(e, (timeZone ? dayIn(now, timeZone) : null) ?? now.toISOString().slice(0, 10));
    const sha256 = form === "FILE" ? createHash("sha256").update(Buffer.from(json, "utf8")).digest("hex") : null;

    const row = await tx.supplierDataExport.create({
      data: { organisationId: actor.organisationId, supplierId: actor.supplierId, accountId: actor.accountId, sessionId: actor.sessionId, form, sectionCounts: exportSectionCounts(e), sha256, generatedAt: now },
      select: { id: true },
    });
    await writeAudit(tx, { organisationId: actor.organisationId, entity: SUPPLIER_ENTITY.dataExport, entityId: row.id, entityLabel: `${reference} · Data export`, actor: auditActorOf(actor) }, "CREATE", exportAuditChanges(e, form, sha256));

    const liveLinks = new Map<string, true>();
    for (const s of e.sections) for (const r of s.rows) for (const f of r.files ?? []) liveLinks.set(f.versionId, true);
    return { export: e, json, fileName, liveLinks };
  }, TX);
}
