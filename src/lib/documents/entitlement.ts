import type { Tx } from "@/lib/audit/record";
import { creditorDecision, creditorNamedFacts, creditorPermissionState, portalCreditorNamedFacts } from "@/lib/auth/creditor-access-store";
import type { RoutedNamedFacts } from "@/lib/auth/sulit-access";
import { evaluationOfficeBases } from "@/lib/auth/evaluation-readers-store";
import { refusalWords, type SulitDecision } from "@/lib/auth/sulit-access";
import {
  decisionForFields,
  exerciseAccessFacts,
  organisationPermissionState,
  writeSulitEvents,
  type SulitEventRow,
  type SulitReader,
} from "@/lib/auth/sulit-store";
import { db } from "@/lib/db";
import type { SulitScope } from "@/lib/sulit-fields";

import { exerciseOfOwner } from "./hidden";
import { scopeOfOwner } from "./owner-scope";
import { OWNER_COLUMN, OWNER_KINDS, type OwnerKind } from "./types";

/**
 * Who may open the bytes of a SULIT document (OD-2, NFR-SEC-001, NFR-AUD-004; Phase 3b). A document is filed once and attached to the records it is evidence for, and a
 * record's own rule says who may read its SULIT values (`sulitAccess`): so a document is opened by whoever may read one of the records it hangs on, by the scope of
 * that record. The tender papers of an exercise are read by the people named on the exercise; a contract's statutory declaration, a supplier's scan and a requisition's
 * papers by the roles the organisation has chosen (`sulit.read.organisation`, undecided until it chooses). An administrator is never entitled, and neither is a loader run.
 *
 * A document that hangs on no record is judged as a record that keeps no list of who is named: only the organisation-wide permission opens it.
 *
 * Reads and writes the log: every bytes access a request decides is a `SulitAccessEvent` for the record it was judged by, allowed or refused, and `logRead: false` is
 * for a screen that only needs to know whether to offer the link (listing a document is not opening it).
 */

/// The record a document's bytes are judged by.
export interface DocumentSubject {
  scope: SulitScope;
  /// Set when the record is an exercise's (the scope is then `exercise` or `evaluation`, judged by who is named on the exercise).
  exerciseId: string | null;
  entity: string;
  id: string;
  label: string;
}

/// What each owner kind is, for the log.
const ENTITY_OF: Readonly<Record<OwnerKind, string>> = {
  meeting: "Meeting",
  exercise: "SourcingExercise",
  award: "Award",
  delegation: "Delegation",
  specificationPanel: "SpecificationPanel",
  bqVersion: "BqVersion",
  tenderPackPart: "TenderPackPart",
  addendum: "Addendum",
  bidWithdrawal: "BidWithdrawal",
  validityExtension: "ValidityExtension",
  opening: "Opening",
  evaluation: "Evaluation",
  evaluationMeeting: "EvaluationMeeting",
  evaluationBidder: "EvaluationBidder",
  supplierDocument: "SupplierDocument",
  supplierApplication: "SupplierApplication",
  contract: "Contract",
  variationInstruction: "VariationInstruction",
  standingEvent: "StandingEvent",
  delayNotice: "DelayNotice",
  eotClaim: "EotClaim",
  registrationDraftDocument: "RegistrationDraftDocument",
  creditorProfile: "CreditorProfile",
  onlineBidFile: "OnlineBidFile",
  portalApplicationDocument: "PortalApplicationDocument",
  portalApplicationCreditor: "PortalApplicationCreditor",
  projectDocumentVersion: "ProjectDocumentVersion",
};

/// The record an owner of documents is judged as (read without a lock).
export async function subjectOfOwner(client: Tx | typeof db, kind: OwnerKind, id: string): Promise<DocumentSubject> {
  const exerciseId = await exerciseOfOwner(kind, id, client);
  const scope = scopeOfOwner(kind, exerciseId);
  if (exerciseId) {
    const ex = await client.sourcingExercise.findUnique({ where: { id: exerciseId }, select: { reference: true } });
    return { scope, exerciseId, entity: "SourcingExercise", id: exerciseId, label: ex?.reference ?? "" };
  }
  // ADR 0042 D7: a Project workspace version's files are judged as its contract's, by the contract's own scope.
  if (kind === "projectDocumentVersion") {
    const v = await client.projectDocumentVersion.findUnique({ where: { id }, select: { document: { select: { contractId: true, contract: { select: { number: true } } } } } });
    if (v) return { scope, exerciseId: null, entity: "Contract", id: v.document.contractId, label: v.document.contract.number };
  }
  return { scope, exerciseId: null, entity: ENTITY_OF[kind], id, label: ENTITY_OF[kind] };
}

/// The records a document hangs on now, once each, as the records that judge its bytes. A detached attachment judges nothing: a grant that outlived its detach would let
/// someone attach a document to a record they are named on, open it, and take it off again (review of Phase 3b).
export async function subjectsOfDocument(client: Tx | typeof db, documentId: string): Promise<DocumentSubject[]> {
  const rows = await client.documentAttachment.findMany({ where: { version: { documentId }, detachedAt: null }, select: Object.fromEntries(OWNER_KINDS.map((k) => [OWNER_COLUMN[k], true])) as Record<string, true> });
  const seen = new Map<string, { kind: OwnerKind; id: string }>();
  for (const r of rows as unknown as Record<string, string | null>[]) {
    for (const k of OWNER_KINDS) {
      const id = r[OWNER_COLUMN[k]];
      if (id) seen.set(`${k}:${id}`, { kind: k, id });
    }
  }
  const out = new Map<string, DocumentSubject>();
  for (const { kind, id } of seen.values()) {
    const s = await subjectOfOwner(client, kind, id);
    out.set(`${s.entity}:${s.id}`, s);
  }
  if (out.size === 0) {
    const d = await client.document.findUnique({ where: { id: documentId }, select: { title: true } });
    return [{ scope: "requisition", exerciseId: null, entity: "Document", id: documentId, label: d?.title ?? "A document" }];
  }
  return [...out.values()];
}

export interface BytesAccess {
  /// Whether the actor may open the bytes.
  entitled: boolean;
  /// The decision that granted, or (all refused) the first refusal, with the record it was for.
  decision: SulitDecision;
  /// In words, why it was refused (English), or null.
  refusal: string | null;
}

/**
 * The actor's standing with a SULIT document's bytes: granted if any record it hangs on admits them. Each record judged is written to the access log (unless
 * `logRead` is false). Judged in the caller’s client, so a download that is refused inside a transaction keeps its row if the transaction commits.
 */
export async function documentBytesAccess(client: Tx, actor: SulitReader, documentId: string, opts: { logRead?: boolean } = {}): Promise<BytesAccess> {
  const subjects = await subjectsOfDocument(client, documentId);
  const permission = await organisationPermissionState(client, actor);
  const exerciseFacts = await exerciseAccessFacts(client, actor.organisationId, subjects.flatMap((s) => (s.exerciseId ? [s.exerciseId] : [])));
  // The Secretariat and Internal Audit read what hangs on an evaluation (ruling of 2026-10-08 on log line 1735).
  const offices = actor.system ? new Map() : await evaluationOfficeBases(client, actor, subjects.flatMap((s) => (s.exerciseId && s.scope === "evaluation" ? [s.exerciseId] : [])));
  // A supplier's bank statement (Phase 4b) is judged by who is named on the profile's route, and by the grant of reading creditor profiles, not by the organisation-wide permission.
  const creditors = subjects.filter((s) => s.scope === "creditorProfile");
  const creditorFacts = creditors.length ? await creditorFactsOf(client, actor.organisationId, creditors) : new Map<string, RoutedNamedFacts>();
  const creditorPermission = creditors.length ? await creditorPermissionState(client, actor) : null;
  const rows: SulitEventRow[] = [];
  let first: SulitDecision | null = null;
  let granted: SulitDecision | null = null;
  for (const s of subjects) {
    if (s.scope === "creditorProfile") {
      const facts = creditorFacts.get(s.id);
      // A profile that is not the organisation's is not one the actor can be named on.
      const decision: SulitDecision = facts ? creditorDecision(actor, facts, creditorPermission!, ["documentBytes"]) : { state: "WITHHELD", basis: "FIELD_NOT_FOR_THIS_RECORD" };
      rows.push({ scope: s.scope, entity: s.entity, entityId: s.id, entityLabel: s.label, fields: ["documentBytes"], decision });
      first ??= decision;
      if (decision.state === "GRANTED") {
        granted = decision;
        break;
      }
      continue;
    }
    const f = s.exerciseId ? exerciseFacts.get(s.exerciseId) : null;
    // A record that is not the organisation’s is not one the actor can be named on.
    const decision: SulitDecision = s.exerciseId && !f ? { state: "WITHHELD", basis: "FIELD_NOT_FOR_THIS_RECORD" } : decisionForFields(actor, s.scope, ["documentBytes"], { restricted: f?.restricted ?? false, named: f?.named ?? null, evaluationOffice: s.exerciseId ? (offices.get(s.exerciseId) ?? null) : null }, permission).decision;
    rows.push({ scope: s.scope, entity: s.entity, entityId: s.id, entityLabel: s.label, fields: ["documentBytes"], decision });
    first ??= decision;
    if (decision.state === "GRANTED") {
      granted = decision;
      break;
    }
  }
  if (opts.logRead !== false) await writeSulitEvents(client, actor, rows);
  const decision = granted ?? first ?? ({ state: "WITHHELD", basis: "FIELD_NOT_FOR_THIS_RECORD" } as SulitDecision);
  const lastScope = subjects[subjects.length - 1]?.scope ?? "requisition";
  return { entitled: granted != null, decision, refusal: decision.state === "WITHHELD" ? refusalWords(decision.basis, lastScope).en : null };
}

/**
 * Whether attaching this document to a record is refused because it is SULIT and the actor may not already open it (OD-2; review of Phase 3b). Attaching puts the document
 * on the record, and the record's own people then judge its bytes: without this, anyone named on any exercise could name a SULIT version (its id is shown in a drawer
 * even where the link is withheld) and so give themselves the file. A document that hangs on no record, live or past, and was filed only by the actor is a fresh upload
 * nobody else has been shown, and is theirs to attach; one that someone else staged is judged like any other. The judgement is logged unless `logRead` is false.
 */
export async function sulitAttachRefused(client: Tx, actor: SulitReader, documentId: string, opts: { logRead?: boolean } = {}): Promise<boolean> {
  const doc = await client.document.findUnique({ where: { id: documentId }, select: { classificationSnapshot: true } });
  if (!doc || doc.classificationSnapshot !== "SULIT") return false;
  // A fresh upload nobody has been shown is the uploader's to attach, and only the uploader's: a version's id is listed to other officers, so an upload someone else staged is not.
  const unattached = (await client.documentAttachment.count({ where: { version: { documentId } } })) === 0;
  if (unattached && actor.personId && (await client.documentVersion.count({ where: { documentId, NOT: { recordedByPersonId: actor.personId } } })) === 0) return false;
  return !(await documentBytesAccess(client, actor, documentId, opts)).entitled;
}

/// Who is named on each bank-details record a statement hangs on, by the record's id: a supplier's creditor profile (`creditorNamedFacts`), or the bank details held on a whole online
/// application (ADR 0041, `portalCreditorNamedFacts`, by the application). A record that is not this organisation's has no entry, and is withheld from everyone.
async function creditorFactsOf(client: Tx, organisationId: string, subjects: readonly { entity: string; id: string }[]): Promise<Map<string, RoutedNamedFacts>> {
  const out = new Map<string, RoutedNamedFacts>();
  const profileIds = subjects.filter((s) => s.entity !== "PortalApplicationCreditor").map((s) => s.id);
  const heldIds = subjects.filter((s) => s.entity === "PortalApplicationCreditor").map((s) => s.id);
  if (profileIds.length) for (const [k, v] of await creditorNamedFacts(client, organisationId, await client.creditorProfile.findMany({ where: { id: { in: profileIds }, organisationId }, select: { id: true, supplierId: true, verifiedByPersonId: true } }))) out.set(k, v);
  if (heldIds.length) {
    const held = await client.portalApplicationCreditor.findMany({ where: { id: { in: heldIds }, organisationId }, select: { id: true, portalApplicationId: true } });
    const facts = await portalCreditorNamedFacts(client, organisationId, held.map((h) => h.portalApplicationId));
    for (const h of held) {
      const f = facts.get(h.portalApplicationId);
      if (f) out.set(h.id, f);
    }
  }
  return out;
}

/// Whether the actor may open the SULIT bytes of documents attached to this owner: the owner's own record judges (a panel lists many documents of one owner). Nothing is logged: showing a link is not opening a file.
export async function ownerBytesEntitled(client: Tx, actor: SulitReader, kind: OwnerKind, id: string): Promise<boolean> {
  const s = await subjectOfOwner(client, kind, id);
  if (s.scope === "creditorProfile") {
    const facts = (await creditorFactsOf(client, actor.organisationId, [s])).get(s.id);
    if (!facts) return false;
    return creditorDecision(actor, facts, await creditorPermissionState(client, actor), ["documentBytes"]).state === "GRANTED";
  }
  const permission = await organisationPermissionState(client, actor);
  const f = s.exerciseId ? (await exerciseAccessFacts(client, actor.organisationId, [s.exerciseId])).get(s.exerciseId) : null;
  if (s.exerciseId && !f) return false;
  const office = s.exerciseId && s.scope === "evaluation" && !actor.system ? ((await evaluationOfficeBases(client, actor, [s.exerciseId])).get(s.exerciseId) ?? null) : null;
  return decisionForFields(actor, s.scope, ["documentBytes"], { restricted: f?.restricted ?? false, named: f?.named ?? null, evaluationOffice: office }, permission).decision.state === "GRANTED";
}
