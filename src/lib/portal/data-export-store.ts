import { createHash } from "node:crypto";

import { db } from "@/lib/db";
import { writeAudit } from "@/lib/audit/record";
import { OWN_RECORD, writeSupplierSulitEvent } from "@/lib/auth/creditor-access-store";
import type { SupplierActor } from "@/lib/auth/types";
import { loadOwnBidReceipts } from "@/lib/bids/online/my-bids-store";
import { w, type Words } from "@/lib/contract/labels";
import { dayIn } from "@/lib/dates";
import { formatDate } from "@/lib/format";
import { auditActorOf } from "@/lib/portal/bids/signup-store";
import { loadBidContext } from "@/lib/portal/bids/context-store";
import { loadBankTab } from "@/lib/portal/company/company-store";
import { standingView } from "@/lib/portal/company/standing-view";
import { loadRegistrationSettings } from "@/lib/portal/registration/context-store";
import { SUPPLIER_ENTITY } from "@/lib/suppliers/audit-view";
import { CONTACT_FIELDS } from "@/lib/suppliers/contact-fields";
import { buildSupplierExport, exportAuditChanges, exportFileName, exportJson, exportSectionCounts, type ExportLists, type SupplierExport, type SupplierExportSource } from "@/lib/suppliers/data-export";
import { inColumns } from "@/lib/suppliers/data-export-fields";
import { standingOf } from "@/lib/suppliers/standing-repo";

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

/// A list's values by code, as their words. A value with no Malay name reads in English in both, as the lists are kept today.
function listsOf(values: readonly { list: string; code: string; nameEn: string; nameMs: string | null }[]): ExportLists {
  const of = (kind: string): Record<string, Words> => Object.fromEntries(values.filter((v) => v.list === kind).map((v) => [v.code, w(v.nameEn, v.nameMs?.trim() ? v.nameMs : v.nameEn)]));
  return Object.fromEntries(Object.entries(LIST_KINDS).map(([key, kind]) => [key, of(kind)])) as unknown as ExportLists;
}

const exerciseName = (ex: { reference: string; title: string }) => `${ex.title} (${ex.reference})`;

export async function exportSupplierData(actor: SupplierActor, form: "FILE" | "PAGE", now: Date = new Date()): Promise<SupplierDataExportResult | null> {
  return db.$transaction(async (tx) => {
    const own = { organisationId: actor.organisationId, supplierId: actor.supplierId };
    const settings = await loadRegistrationSettings(tx, actor.organisationId);
    const supplier = await tx.supplier.findFirst({ where: { id: actor.supplierId, organisationId: actor.organisationId }, select: inColumns("Supplier") });
    if (!settings || !supplier) return null;
    const reference = String(supplier.reference ?? "");

    const [lists, contacts, declarations, documents, standingChanges, applications] = await Promise.all([
      tx.supplierListValue.findMany({ where: { organisationId: actor.organisationId, list: { in: Object.values(LIST_KINDS) } }, select: { list: true, code: true, nameEn: true, nameMs: true } }),
      // As `loadContactsSummary`: the contacts not retired, the primary first.
      tx.supplierContact.findMany({ where: { ...own, retiredOn: null }, orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }], select: { ...inColumns("SupplierContact"), account: { select: inColumns("SupplierAccount") } } }),
      // As `loadDeclarationsSummary`: every declaration signed on one of the supplier's applications.
      tx.registrationDeclaration.findMany({ where: { organisationId: actor.organisationId, application: { supplierId: actor.supplierId } }, orderBy: [{ signedAt: "asc" }, { kind: "asc" }], select: inColumns("RegistrationDeclaration") }),
      // As `loadDocumentsTab` and `companyDocument`: every document of the supplier, with its codes and its live files (attached, not withdrawn).
      tx.supplierDocument.findMany({
        where: own,
        orderBy: [{ lodgedOn: "asc" }, { id: "asc" }],
        select: {
          ...inColumns("SupplierDocument"),
          values: { orderBy: { codeSnapshot: "asc" }, select: inColumns("SupplierDocumentValue") },
          attachments: { where: { purpose: "SUPPLIER_DOCUMENT", detachedAt: null, version: { withdrawnAt: null } }, select: { version: { select: inColumns("DocumentVersion") } } },
        },
      }),
      tx.standingEvent.findMany({ where: own, orderBy: [{ effectiveOn: "asc" }, { recordedAt: "asc" }], select: inColumns("StandingEvent") }),
      // As `loadRegistrationStatus` (which reads outside this transaction): the supplier's applications, newest first, each with its outcomes and the items asked for.
      tx.supplierApplication.findMany({
        where: own,
        orderBy: [{ receivedOn: "desc" }, { createdAt: "desc" }],
        select: {
          ...inColumns("SupplierApplication"),
          decisions: { orderBy: { decidedAt: "desc" }, select: { ...inColumns("ApplicationDecision"), items: { orderBy: { id: "asc" }, select: inColumns("ResubmissionItem") } } },
        },
      }),
    ]);

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
    const [purchases, downloads, receipts] = await Promise.all([
      tx.documentPurchase.findMany({ where: own, orderBy: { createdAt: "asc" }, select: { ...inColumns("DocumentPurchase"), window: { select: { exerciseId: true } }, attempts: { orderBy: { attemptNo: "asc" }, select: inColumns("PaymentAttempt") } } }),
      tx.purchaseDownload.findMany({ where: own, orderBy: { downloadedAt: "asc" }, select: { ...inColumns("PurchaseDownload"), window: { select: { exerciseId: true } } } }),
      loadOwnBidReceipts(tx, actor),
    ]);
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

    const src: SupplierExportSource = {
      organisationName: settings.org.name,
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
