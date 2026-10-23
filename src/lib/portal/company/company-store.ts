import type { Prisma } from "@/generated/prisma/client";
import type { Tx } from "@/lib/audit/record";
import { CREDITOR_PROFILE_FIELDS, creditorEventRow, OWN_RECORD, writeSupplierSulitEvent } from "@/lib/auth/creditor-access-store";
import type { SupplierActor } from "@/lib/auth/types";
import { storedDay } from "@/lib/dates";
import { formatBytes, mediaLabel } from "@/lib/documents/labels";
import { loadRegistrationSettings, typeConfig } from "@/lib/portal/registration/context-store";
import { loadUploadSettings } from "@/lib/portal/registration/upload-settings";
import { creditorSummaryOf, loadCompanySummary, loadCreditorRows } from "@/lib/portal/registration/summary-store";
import { acceptNote, uploadClosedWords } from "@/lib/portal/registration/view";
import { bumiputeraNeedsAttention } from "@/lib/suppliers/bumiputera";
import { documentState } from "@/lib/suppliers/documents";
import { documentFacts, loadSupplierConfig } from "@/lib/suppliers/repo";
import { exerciseOrg } from "@/lib/method/repo";
import { loadOpportunities, loadOpportunity } from "@/lib/portal/repo";
import type { Verdict } from "@/lib/suppliers/eligibility";
import { eligibilityOf, standingOf } from "@/lib/suppliers/standing-repo";
import type { SupplierStatus } from "@/lib/suppliers/types";

import { bankState, type BankState } from "./bank";
import { attentionCount, documentRows, requestView, type ExpiryPolicy } from "./documents";
import { conditionViews, failingFirst } from "./eligibility-view";
import { standingView } from "./standing-view";
import type { CompanyDocument, OpenRequestFacts } from "./types";
import { inOrder } from "@/lib/series";

/**
 * What the supplier's own Company workspace reads (Phase 4c). Every read names the SESSION's supplier and organisation (`actor`): nothing here takes a supplier from a request, and no row of
 * another supplier can come back. One loader per tab, so a tab loads only its own slice. Reads only, in the caller's client; the writes are `replace-store.ts` and `bank-store.ts`.
 */

/// What a supplier's document is read with: its codes (as they were named), and the live files of its scan.
export const DOCUMENT_INCLUDE = {
  values: { select: { registrationValueId: true, kind: true, codeSnapshot: true, labelSnapshot: true }, orderBy: { codeSnapshot: "asc" } },
  attachments: { where: { purpose: "SUPPLIER_DOCUMENT" }, select: { detachedAt: true, version: { select: { withdrawnAt: true, scanState: true } } } },
} satisfies Prisma.SupplierDocumentInclude;

type DocumentRow = Prisma.SupplierDocumentGetPayload<{ include: typeof DOCUMENT_INCLUDE }>;

export function companyDocument(d: DocumentRow): CompanyDocument {
  const live = d.attachments.filter((a) => a.detachedAt == null && a.version.withdrawnAt == null);
  return {
    ...documentFacts(d),
    title: d.title,
    reference: d.reference,
    issuingAuthority: d.issuingAuthority,
    ratePercent: d.ratePercent ? d.ratePercent.toString() : null,
    codes: d.values.map((v) => `${v.codeSnapshot} — ${v.labelSnapshot}`),
    codeValues: d.values.map((v) => ({ id: v.registrationValueId, kind: v.kind, label: `${v.codeSnapshot} — ${v.labelSnapshot}` })),
    files: live.length,
    notScanned: live.some((a) => a.version.scanState === "NOT_SCANNED"),
    lodgedBySupplier: d.recordedBySupplierAccountId != null,
    applicationId: d.applicationId,
    answersItemId: d.answersItemId,
  };
}

/// The office's open request for this supplier: its application waiting for the supplier (resubmission requested, no lapse recorded), with the latest request's items, as the officer wrote them.
export async function loadOpenRequest(client: Tx, actor: SupplierActor): Promise<OpenRequestFacts | null> {
  const app = await client.supplierApplication.findFirst({
    where: { supplierId: actor.supplierId, organisationId: actor.organisationId, status: "RESUBMISSION_REQUESTED", lapsedRecordedAt: null },
    orderBy: [{ receivedOn: "desc" }, { createdAt: "desc" }],
    select: {
      id: true,
      resubmitBy: true,
      decisions: { where: { outcome: "RESUBMIT" }, orderBy: { decidedAt: "desc" }, take: 1, select: { id: true, remarks: true, decidedOn: true, items: { orderBy: { id: "asc" }, select: { id: true, labelSnapshot: true, remarks: true, supplierDocumentId: true, documentTypeId: true } } } },
    },
  });
  const decision = app?.decisions[0];
  if (!app || !decision) return null;
  return {
    applicationId: app.id,
    decisionId: decision.id,
    remarks: decision.remarks,
    resubmitBy: app.resubmitBy ? storedDay(app.resubmitBy) : null,
    decidedOn: storedDay(decision.decidedOn),
    items: decision.items.map((it) => ({ id: it.id, label: it.labelSnapshot, remarks: it.remarks, documentId: it.supplierDocumentId, typeId: it.documentTypeId })),
  };
}

async function supplierOf(client: Tx, actor: SupplierActor) {
  return client.supplier.findFirst({
    where: { id: actor.supplierId, organisationId: actor.organisationId },
    select: { id: true, reference: true, registeredName: true, status: true, registeredOn: true },
  });
}

// ------------------------------------------------------------------ the Documents tab

export async function loadDocumentsTab(client: Tx, actor: SupplierActor) {
  const settings = await loadRegistrationSettings(client, actor.organisationId);
  const today = settings?.org.today ?? null;
  const [supplier, config, docRows, request, uploads] = await inOrder(
    () => supplierOf(client, actor),
    () => loadSupplierConfig(actor.organisationId, client),
    () => client.supplierDocument.findMany({ where: { supplierId: actor.supplierId, organisationId: actor.organisationId }, include: DOCUMENT_INCLUDE, orderBy: [{ lodgedOn: "asc" }, { id: "asc" }] }),
    () => loadOpenRequest(client, actor),
    () => settings ? loadUploadSettings(client, actor.organisationId, settings) : null);
  if (!supplier || !settings) return null;
  const docs = docRows.map(companyDocument);
  const policy: ExpiryPolicy = {
    criticalDays: config.policy?.criticalDays ?? null,
    warningDays: config.policy?.warningDays ?? null,
    upcomingDays: config.policy?.upcomingDays ?? null,
    reminderOffsets: config.reminderOffsets,
  };
  const status = supplier.status as SupplierStatus;
  const closed = uploads ? uploadClosedWords(uploads.store, uploads.document, "document") : "Uploads are closed: the portal is not set up.";
  const view = today && request ? requestView(request, docs, today) : null;
  const rows = today ? documentRows({ types: config.types.map((t) => typeConfig(t, today)), docs, today, policy, supplierStatus: status, request: view, uploadClosed: closed }) : [];
  return {
    today,
    supplier: { reference: supplier.reference, name: supplier.registeredName, status },
    rows,
    request: view,
    attention: attentionCount(rows),
    /// What the office tells a supplier of how its documents are checked (FR-VND-004), in its own words; null while not set.
    notice: config.policy?.verificationNoticeEn?.trim() ? config.policy.verificationNoticeEn.trim() : null,
    help: { email: config.policy?.helpEmail ?? null, phone: config.policy?.helpPhone ?? null },
    policy,
    /// Whether the rule that tells when a reminder falls due is in place (the document-expiry rule, on).
    reminderRule: config.expiryRule?.isActive === true && config.reminderOffsets.length > 0,
    uploadClosed: closed,
    accept: uploads ? acceptNote(uploads.store, mediaLabel, formatBytes) : null,
    /// The registration codes a body offers, by the document type that carries them: the form searches them on the server.
    bodies: config.bodies.map((b) => ({ id: b.id, label: b.labelEn })),
    types: config.types.filter((t) => t.retiredOn == null || (today != null && storedDay(t.retiredOn) > today)).map((t) => ({ id: t.id, name: t.nameEn, bodyId: t.bodyId, valueKinds: t.valueKinds as string[], expires: t.expires, recordsRate: t.recordsRate === true, repeatable: t.repeatable === true })),
  };
}
// ------------------------------------------------------------------ the Overview tab

export async function loadOverviewTab(client: Tx, actor: SupplierActor, day: (d: string) => string) {
  const settings = await loadRegistrationSettings(client, actor.organisationId);
  const today = settings?.org.today ?? null;
  const supplier = await supplierOf(client, actor);
  if (!supplier || !settings) return null;
  const stage = supplier.status === "REGISTERED" ? "REGISTER" : "APPLICATION";
  const [company, documents, standing, bank] = await inOrder(
    () => loadCompanySummary(client, { organisationId: actor.organisationId, supplierId: actor.supplierId }, stage),
    () => loadDocumentsTab(client, actor),
    () => today ? standingOf(actor.supplierId, actor.organisationId, today, client) : null,
    () => loadBankState(client, actor));
  // The evidence document of the Bumiputera status, with its expiry: the one in force of the type the organisation named.
  const policyRow = await client.supplierPolicy.findUnique({ where: { organisationId: actor.organisationId }, select: { restrictionEvidenceTypeId: true } });
  const evidenceTypeId = policyRow?.restrictionEvidenceTypeId ?? null;
  let evidenceExpiry: string | null = null;
  let evidenceState: string | null = null;
  if (evidenceTypeId && today) {
    const evidence = (await client.supplierDocument.findMany({ where: { supplierId: actor.supplierId, organisationId: actor.organisationId, typeId: evidenceTypeId }, include: DOCUMENT_INCLUDE })).map(companyDocument);
    const st = documentState(evidence, today);
    evidenceExpiry = st.effective?.expiresOn ?? null;
    evidenceState = st.state;
  }
  return {
    today,
    supplier: { reference: supplier.reference, name: supplier.registeredName, status: supplier.status as SupplierStatus, registeredOn: supplier.registeredOn ? storedDay(supplier.registeredOn) : null },
    company,
    standing: standing ? standingView(standing.reading, day) : null,
    attention: documents?.attention ?? { expired: 0, critical: 0, waitingForYou: 0 },
    request: documents?.request ?? null,
    bank,
    bumiputera: company ? { reading: company.bumiputera, flagged: bumiputeraNeedsAttention(company.bumiputera), evidenceExpiry, evidenceState } : null,
  };
}
// ------------------------------------------------------------------ the Bank details tab

/// The supplier's bank-detail versions as the rules read them (the existence and state of each, never a value).
export async function loadBankState(client: Tx, actor: SupplierActor): Promise<BankState> {
  const rows = await client.creditorProfile.findMany({ where: { supplierId: actor.supplierId, organisationId: actor.organisationId }, select: { version: true, submittedAt: true, verification: true } });
  return bankState(rows.map((r) => ({ version: r.version, sent: r.submittedAt != null, verification: r.verification })));
}

/**
 * The supplier's own bank details: the version in force, the one waiting or found not in order, and their statements, read through the supplier's own gate (always granted, as its own
 * record, and always logged with its account as the actor). The values go to the supplier's own screen only.
 */
export async function loadBankTab(client: Tx, actor: SupplierActor) {
  const rows = (await loadCreditorRows(client, { organisationId: actor.organisationId, supplierId: actor.supplierId })).filter((r) => r.submittedAt != null);
  const state = bankState(rows.map((r) => ({ version: r.version, sent: true, verification: r.verification })));
  const shown = rows.filter((r) => r.version === state.inForce?.version || r.version === state.waiting?.version || r.version === state.notInOrder?.version);
  for (const r of shown) await writeSupplierSulitEvent(client, actor, creditorEventRow({ id: r.id, label: "Creditor's profile" }, CREDITOR_PROFILE_FIELDS, OWN_RECORD));
  const summaries: { row: (typeof shown)[number]; summary: Awaited<ReturnType<typeof creditorSummaryOf>> }[] = [];
  // One at a time: the client may be a transaction, which holds a single connection.
  for (const r of shown) summaries.push({ row: r, summary: await creditorSummaryOf(client, actor.organisationId, r) });
  return { state, versions: summaries };
}

// ------------------------------------------------------------------ the Eligibility tab

/// How many open opportunities are judged on one page. Each judgement reads the exercise and the supplier's documents, so the list is bounded; the page says when it shows fewer than are open.
export const ELIGIBILITY_PAGE = 30;

export interface EligibilityRow {
  id: string;
  reference: string;
  title: string;
  closing: string | null;
  verdict: Verdict;
  /// The first condition that is not a pass, in words, for the list; the page for the exercise lists them all.
  because: string | null;
}

/**
 * The supplier's own eligibility for the exercises open to everyone (FR-VND-011, after 615-C1): each open opportunity, judged by `eligibilityOf` (the rule the office's screens and a bid's
 * opening use) for THIS supplier. Only the exercises the public may read are listed (`isPublicOpportunity`, through the public read), so a confidential or invited exercise is never named
 * here; one the supplier could not read is not found. A supplier not yet on the register is judged too, and the first condition says so.
 */
export async function loadEligibilityTab(client: Tx, actor: SupplierActor): Promise<{ today: string | null; rows: EligibilityRow[]; open: number; ready: boolean }> {
  const org = await exerciseOrg(actor.organisationId, client);
  if (!org || !org.today) return { today: null, rows: [], open: 0, ready: false };
  const { ready, opportunities } = await loadOpportunities();
  const open = opportunities.filter((o) => o.state === "OPEN").sort((a, b) => (a.closingDay ?? "9999").localeCompare(b.closingDay ?? "9999") || a.reference.localeCompare(b.reference));
  const rows: EligibilityRow[] = [];
  for (const o of open.slice(0, ELIGIBILITY_PAGE)) {
    const e = await eligibilityOf(actor.supplierId, o.id, { id: org.id, timeZone: org.timeZone, today: org.today }, client);
    if (!e) continue;
    const first = failingFirst(conditionViews(e.eligibility.rows)).find((c) => c.result !== "PASS" && c.result !== "PASS_BY_PERMISSION");
    rows.push({ id: o.id, reference: o.reference, title: o.title, closing: o.closing, verdict: e.eligibility.verdict, because: first ? `${first.label}: ${first.reason}` : null });
  }
  return { today: org.today, rows, open: open.length, ready };
}

/// One exercise's conditions for the signed-in supplier, or null where the exercise is not one the public may read (the page answers both the same way).
export async function loadEligibilityFor(client: Tx, actor: SupplierActor, exerciseId: string) {
  const org = await exerciseOrg(actor.organisationId, client);
  if (!org || !org.today) return null;
  const o = await loadOpportunity(exerciseId);
  if (!o || o.state === "CANCELLED") return null;
  const e = await eligibilityOf(actor.supplierId, exerciseId, { id: org.id, timeZone: org.timeZone, today: org.today }, client);
  if (!e) return null;
  return { verdict: e.eligibility.verdict, conditions: failingFirst(conditionViews(e.eligibility.rows)), judgedOn: org.today };
}
