/**
 * What the document screens read (plan §6), so the panel, the drawer and the
 * configuration lists render what the rules decide and never restate them: each row
 * carries its download decision, each owner its state per purpose (`ownerState` on the
 * same `owner-facts` mapping the acts use under their locks). Reads only; never bytes.
 */

import { db } from "@/lib/db";

import { downloadDecision } from "./access";
import { detachFault, ownerState, purposeFits, reliedOn, reliedOnAttachment, repinFault, type OwnerFacts } from "./attach";
import { isLive } from "./evidence";
import { accessReasonText, ACCESS_STATEMENT, documentFaultText, DOWNLOAD_REFUSAL_TEXT, exitWords, FINGERPRINT_STATEMENT } from "./labels";
import { effectiveCap } from "./limits";
import { addendumFacts, awardFacts, CANCELLATION_OWNER_SELECT, cancellationOwnerFacts, cancellationOwnerLabel, bqVersionFacts, contractFacts, delegationFacts, evaluationBidderFacts, evaluationFacts, evaluationMeetingFacts, exerciseFacts, PUBLICATION_FACTS_SELECT, publicationFactsOf, exerciseMethodFlags, extensionFacts, meetingFacts, openingFacts, PANEL_FACTS_SELECT, panelFacts, supplierApplicationFacts, supplierDocumentFacts, tenderPackPartFacts, VARIATION_INSTRUCTION_FACTS_SELECT, variationInstructionFacts, variationInstructionLabel, withdrawalFacts, DELAY_NOTICE_FACTS_SELECT, delayNoticeFacts, delayNoticeLabel, EOT_CLAIM_FACTS_SELECT, eotClaimFacts, eotClaimLabel, PROJECT_DOCUMENT_VERSION_FACTS_SELECT, projectDocumentVersionLabel } from "./owner-facts";
import { SUPPLIER_APPLICATION_FACTS_SELECT, SUPPLIER_DOCUMENT_FACTS_SELECT, supplierApplicationLabel, supplierDocumentLabel } from "@/lib/suppliers/lock";
import { CONTRACT_FACTS_SELECT, contractLabel } from "@/lib/contract/repo";
import { PACK_PART_FACTS_SELECT, packPartLabel } from "@/lib/tender-docs/owner";
import { ADDENDUM_FACTS_SELECT, addendumLabel } from "@/lib/window/lock";
import { OPENING_FACTS_SELECT, openingLabel } from "@/lib/opening/lock";
import { EVALUATION_BIDDER_FACTS_SELECT, EVALUATION_FACTS_SELECT, EVALUATION_MEETING_FACTS_SELECT, evaluationBidderLabel, evaluationLabel, evaluationMeetingLabel } from "@/lib/evaluation/lock";
import { EXTENSION_FACTS_SELECT, extensionLabel, WITHDRAWAL_FACTS_SELECT, withdrawalLabel } from "@/lib/bids/lock";
import { type OwnerRef } from "./repo";
import { attachTargets, ownerHref } from "./targets";
import { retentionOf, documentOrg, loadStorePolicy } from "./service";
import { asksBeforeOpening } from "./applicant-scan";
import { deploymentCeiling, malwareScanner } from "./store";
import { ATTACHMENT_PURPOSES, OWNER_COLUMN, type AttachmentPurpose } from "./types";
import { currentVersion } from "./versioning";

const versionSelect = {
  id: true, versionNo: true, sha256: true, byteSize: true, mediaType: true, originalFilename: true, receivedOn: true, storedAt: true, scanState: true, withdrawnAt: true, withdrawnReason: true, note: true,
  recordedBy: { select: { id: true, name: true } },
  // ADR 0041 D3: a version an applicant sent with an online application, not signed in, is named by the application, never as a supplier's account.
  recordedByPortalApplicationId: true,
} as const;

/// An owner's facts, read for display (no lock). Null when the owner does not exist.
export async function readOwner(organisationId: string, ref: OwnerRef): Promise<{ facts: OwnerFacts; label: string } | null> {
  const org = await documentOrg(organisationId);
  if (!org) return null;
  switch (ref.kind) {
    case "meeting": {
      const m = await db.meeting.findFirst({ where: { id: ref.id, committee: { organisationId: org.id } }, select: { status: true, reference: true } });
      return m ? { facts: meetingFacts(m), label: m.reference } : null;
    }
    case "exercise": {
      const ex = await db.sourcingExercise.findFirst({ where: { id: ref.id, organisationId: org.id }, select: { status: true, reference: true, sourcingMethodCode: true, classificationSnapshot: true, ...PUBLICATION_FACTS_SELECT, window: { select: { path: true } }, awards: { select: { status: true, approvalInstances: { where: { domain: "appointment", status: "PENDING" }, select: { id: true } } } } } });
      if (!ex) return null;
      const configured = ex.sourcingMethodCode ? await db.sourcingMethod.findFirst({ where: { organisationId: org.id, code: ex.sourcingMethodCode }, select: { requiresDossier: true, requiresCoordinationRecord: true } }) : null;
      return { facts: exerciseFacts(ex, ex.awards.map((a) => ({ status: a.status, openAppointmentRoutes: a.approvalInstances.length })), exerciseMethodFlags(ex.classificationSnapshot, configured), ex.window, publicationFactsOf(ex)), label: ex.reference };
    }
    case "award": {
      const a = await db.award.findFirst({ where: { id: ref.id, organisationId: org.id }, select: { status: true, instrumentKind: true, returnScanSnapshot: true, reference: true } });
      return a ? { facts: awardFacts(a), label: a.reference } : null;
    }
    case "delegation": {
      const d = await db.delegation.findFirst({ where: { id: ref.id, organisationId: org.id }, select: { effectiveTo: true, fromPerson: { select: { name: true } }, toPerson: { select: { name: true } } } });
      return d ? { facts: delegationFacts(d, org.today), label: `Delegation · ${d.fromPerson.name} to ${d.toPerson.name}` } : null;
    }
    case "specificationPanel": {
      const p = await db.specificationPanel.findFirst({ where: { id: ref.id, organisationId: org.id }, select: { ...PANEL_FACTS_SELECT, exercise: { select: { status: true, reference: true, specPanelUsed: true } } } });
      return p ? { facts: panelFacts(p), label: `${p.exercise.reference} · Specification panel` } : null;
    }
    case "bqVersion": {
      const v = await db.bqVersion.findFirst({ where: { id: ref.id, organisationId: org.id }, select: { status: true, versionNo: true, exercise: { select: { status: true, reference: true, onScreenBillUsed: true } } } });
      return v ? { facts: bqVersionFacts(v), label: `${v.exercise.reference} · Bill of quantities, version ${v.versionNo}` } : null;
    }
    case "tenderPackPart": {
      const p = await db.tenderPackPart.findFirst({ where: { id: ref.id, organisationId: org.id }, select: PACK_PART_FACTS_SELECT });
      return p ? { facts: tenderPackPartFacts(p), label: packPartLabel(p) } : null;
    }
    case "addendum": {
      const a = await db.addendum.findFirst({ where: { id: ref.id, organisationId: org.id }, select: ADDENDUM_FACTS_SELECT });
      return a ? { facts: addendumFacts(a), label: addendumLabel(a) } : null;
    }
    case "bidWithdrawal": {
      const w = await db.bidWithdrawal.findFirst({ where: { id: ref.id, organisationId: org.id }, select: WITHDRAWAL_FACTS_SELECT });
      return w ? { facts: withdrawalFacts(w), label: withdrawalLabel(w) } : null;
    }
    case "validityExtension": {
      const x = await db.validityExtension.findFirst({ where: { id: ref.id, organisationId: org.id }, select: EXTENSION_FACTS_SELECT });
      return x ? { facts: extensionFacts(x), label: extensionLabel(x) } : null;
    }
    case "opening": {
      const o = await db.opening.findFirst({ where: { id: ref.id, organisationId: org.id }, select: OPENING_FACTS_SELECT });
      return o ? { facts: openingFacts(o), label: openingLabel(o) } : null;
    }
    case "evaluation": {
      const e = await db.evaluation.findFirst({ where: { id: ref.id, organisationId: org.id }, select: EVALUATION_FACTS_SELECT });
      return e ? { facts: evaluationFacts(e), label: evaluationLabel(e) } : null;
    }
    case "evaluationMeeting": {
      const m = await db.evaluationMeeting.findFirst({ where: { id: ref.id, organisationId: org.id }, select: EVALUATION_MEETING_FACTS_SELECT });
      return m ? { facts: evaluationMeetingFacts(m), label: evaluationMeetingLabel(m) } : null;
    }
    case "evaluationBidder": {
      const b = await db.evaluationBidder.findFirst({ where: { id: ref.id, organisationId: org.id }, select: EVALUATION_BIDDER_FACTS_SELECT });
      return b ? { facts: evaluationBidderFacts(b), label: evaluationBidderLabel(b) } : null;
    }
    case "supplierDocument": {
      const d = await db.supplierDocument.findFirst({ where: { id: ref.id, organisationId: org.id }, select: SUPPLIER_DOCUMENT_FACTS_SELECT });
      return d ? { facts: supplierDocumentFacts(d), label: supplierDocumentLabel(d) } : null;
    }
    case "supplierApplication": {
      const a = await db.supplierApplication.findFirst({ where: { id: ref.id, organisationId: org.id }, select: SUPPLIER_APPLICATION_FACTS_SELECT });
      return a ? { facts: supplierApplicationFacts(a), label: supplierApplicationLabel(a) } : null;
    }
    case "contract": {
      const c = await db.contract.findFirst({ where: { id: ref.id, organisationId: org.id }, select: CONTRACT_FACTS_SELECT });
      return c ? { facts: contractFacts(c), label: contractLabel(c) } : null;
    }
    case "variationInstruction": {
      const i = await db.variationInstruction.findFirst({ where: { id: ref.id, organisationId: org.id }, select: VARIATION_INSTRUCTION_FACTS_SELECT });
      return i ? { facts: variationInstructionFacts(i), label: variationInstructionLabel(i) } : null;
    }
    case "standingEvent": {
      const e = await db.standingEvent.findFirst({ where: { id: ref.id, organisationId: org.id }, select: CANCELLATION_OWNER_SELECT });
      return e ? { facts: cancellationOwnerFacts(e), label: cancellationOwnerLabel(e) } : null;
    }
    case "delayNotice": {
      const n = await db.delayNotice.findFirst({ where: { id: ref.id, organisationId: org.id }, select: DELAY_NOTICE_FACTS_SELECT });
      return n ? { facts: delayNoticeFacts(n), label: delayNoticeLabel(n) } : null;
    }
    case "eotClaim": {
      const c = await db.eotClaim.findFirst({ where: { id: ref.id, organisationId: org.id }, select: EOT_CLAIM_FACTS_SELECT });
      return c ? { facts: eotClaimFacts(c), label: eotClaimLabel(c) } : null;
    }
    // Phase 4b: the supplier's own uploads are not attached to from the staff's shared panel.
    case "registrationDraftDocument":
    case "creditorProfile":
    case "onlineBidFile":
    // ADR 0041 D2: what an online application holds is not attached to from the staff's shared panel.
    case "portalApplicationDocument":
    case "portalApplicationCreditor":
    // ADR 0042 D8: a project document's files are pinned by the workspace act that makes the version.
    case "projectDocumentVersion":
    // ADR 0045 D1: an online return's scans are pinned by the contractor's submit act only.
    case "awardOnlineReturn":
      return null;
  }
}

/**
 * Everything the shared attachment panel shows for one owner: per purpose that suits
 * it, whether it is open, not ready or frozen (with the words why), and every
 * attachment, live and past, with its document, pinned version, the document's latest
 * version and whether the pinned one may be downloaded (and if not, why).
 */
/// `entitled`: whether the reader may open the SULIT bytes of this owner's documents (`ownerBytesEntitled`, OD-2): a SULIT version's link is offered only to them.
export async function ownerPanel(organisationId: string, ref: OwnerRef, entitled: boolean) {
  const owner = await readOwner(organisationId, ref);
  if (!owner) return null;
  const rows = await db.documentAttachment.findMany({
    where: { [OWNER_COLUMN[ref.kind]]: ref.id },
    orderBy: [{ attachedAt: "asc" }, { id: "asc" }],
    include: {
      version: {
        select: {
          ...versionSelect,
          document: {
            select: {
              id: true, title: true, status: true, classificationSnapshot: true, documentClass: { select: { nameEn: true } },
              versions: { select: { id: true, versionNo: true, withdrawnAt: true }, orderBy: { versionNo: "desc" } },
              holds: { where: { releasedAt: null }, select: { id: true, reason: true } },
            },
          },
        },
      },
    },
  });
  const purposes = ATTACHMENT_PURPOSES.filter((p) => purposeFits(p, owner.facts)).map((purpose) => {
    const st = ownerState(purpose, owner.facts);
    return { purpose, state: st.state, reason: st.state === "OPEN" ? null : exitWords(st), live: rows.filter((r) => r.purpose === purpose && isLive(r)).length };
  });
  const liveOf = (purpose: string) => rows.filter((x) => x.purpose === purpose && isLive(x)).length;
  // A disabled act and a refused one give the same reason: the same rule, asked without a reason typed yet.
  const refusal = (fs: readonly { code: string; level: "block" | "warn" | "info" }[]) => {
    const f = fs.find((x) => x.code !== "REASON_REQUIRED");
    return f ? { allowed: false as const, reason: documentFaultText(f) } : { allowed: true as const };
  };
  const scannerConfigured = malwareScanner().configured;
  const items = rows.map((r) => {
    const d = r.version.document;
    const purpose = r.purpose as AttachmentPurpose;
    const offPast = r.detachedAt != null;
    const decision = downloadDecision({ classification: d.classificationSnapshot, scanState: r.version.scanState, entitled });
    const latest = currentVersion(d.versions);
    return {
      attachmentId: r.id,
      purpose,
      live: isLive(r),
      /// Null once it is off the record. Otherwise whether it may come off, and if not why.
      detach: offPast ? null : refusal(detachFault({ purpose, owner: owner.facts, reason: "-", reliedOn: reliedOnAttachment(r, () => reliedOn(purpose, owner.facts, liveOf(purpose), r.versionId)) })),
      /// Null once it is off the record. Otherwise whether a new version of the document may replace this pin, and if not why.
      newVersion: offPast ? null : refusal(repinFault({ purpose, owner: owner.facts, reason: "-", attachment: { detachedAt: r.detachedAt, versionId: r.versionId, documentId: d.id }, to: { id: "next", documentId: d.id, withdrawnAt: null } })),
      attachedAt: r.attachedAt,
      detachedAt: r.detachedAt,
      detachReason: r.detachReason,
      document: { id: d.id, title: d.title, className: d.documentClass.nameEn, classification: d.classificationSnapshot, standingHold: d.holds[0] ?? null },
      version: { ...r.version, byteSize: r.version.byteSize.toString(), document: undefined },
      newerVersion: latest && latest.id !== r.version.id && latest.versionNo > r.version.versionNo && latest.withdrawnAt == null ? { id: latest.id, versionNo: latest.versionNo } : null,
      // RSEC-2: a stranger's file, with no scanner, is opened only once the shared question is answered.
      download: decision.allow ? { allowed: true as const, href: `/api/documents/versions/${r.version.id}`, unscanned: asksBeforeOpening(r.version, scannerConfigured) } : { allowed: false as const, reason: DOWNLOAD_REFUSAL_TEXT[decision.reason].replace(/ The request was refused and logged\.$/, "") },
    };
  });
  return { owner: { ...ref, label: owner.label, facts: owner.facts }, purposes, items, statement: ACCESS_STATEMENT };
}

/// The document drawer: versions, where it is attached, holds, access events and its trail.
/// `entitled`: whether the reader may open the bytes of this document if it is SULIT (`documentBytesAccess`, OD-2).
export async function documentDrawer(organisationId: string, documentId: string, entitled: boolean) {
  const org = await documentOrg(organisationId);
  if (!org) return null;
  const d = await db.document.findFirst({
    where: { id: documentId, organisationId: org.id },
    include: {
      documentClass: { select: { id: true, nameEn: true, classification: true } },
      versions: {
        orderBy: { versionNo: "desc" },
        select: {
          ...versionSelect,
          attachments: { select: { id: true, purpose: true, attachedAt: true, detachedAt: true, detachReason: true, meetingId: true, exerciseId: true, awardId: true, delegationId: true, specificationPanelId: true, meeting: { select: { reference: true } }, exercise: { select: { reference: true } }, award: { select: { reference: true } }, delegation: { select: { fromPerson: { select: { name: true } }, toPerson: { select: { name: true } } } }, specificationPanel: { select: { exerciseId: true, exercise: { select: { reference: true } } } }, bqVersionId: true, bqVersion: { select: { versionNo: true, exerciseId: true, exercise: { select: { reference: true } } } }, tenderPackPartId: true, tenderPackPart: { select: PACK_PART_FACTS_SELECT }, addendumId: true, addendum: { select: ADDENDUM_FACTS_SELECT }, bidWithdrawalId: true, bidWithdrawal: { select: WITHDRAWAL_FACTS_SELECT }, validityExtensionId: true, validityExtension: { select: EXTENSION_FACTS_SELECT }, openingId: true, opening: { select: OPENING_FACTS_SELECT }, evaluationId: true, evaluation: { select: EVALUATION_FACTS_SELECT }, evaluationMeetingId: true, evaluationMeeting: { select: EVALUATION_MEETING_FACTS_SELECT }, evaluationBidderId: true, evaluationBidder: { select: EVALUATION_BIDDER_FACTS_SELECT }, supplierDocumentId: true, supplierDocument: { select: SUPPLIER_DOCUMENT_FACTS_SELECT }, supplierApplicationId: true, supplierApplication: { select: SUPPLIER_APPLICATION_FACTS_SELECT }, contractId: true, contract: { select: CONTRACT_FACTS_SELECT }, variationInstructionId: true, variationInstruction: { select: VARIATION_INSTRUCTION_FACTS_SELECT }, standingEventId: true, standingEvent: { select: CANCELLATION_OWNER_SELECT }, delayNoticeId: true, delayNotice: { select: DELAY_NOTICE_FACTS_SELECT }, eotClaimId: true, eotClaim: { select: EOT_CLAIM_FACTS_SELECT }, creditorProfileId: true, creditorProfile: { select: { version: true, supplierId: true, supplier: { select: { reference: true } } } }, portalApplicationDocumentId: true, portalApplicationDocument: { select: { typeLabelSnapshot: true, portalApplication: { select: { id: true, reference: true } } } }, portalApplicationCreditorId: true, portalApplicationCreditor: { select: { portalApplication: { select: { id: true, reference: true } } } }, projectDocumentVersionId: true, projectDocumentVersion: { select: PROJECT_DOCUMENT_VERSION_FACTS_SELECT } } },
          accessEvents: { orderBy: { at: "desc" }, take: 50, select: { id: true, kind: true, reasonCode: true, at: true, actorSystemLabel: true, actorPerson: { select: { name: true } } } },
        },
      },
      holds: { orderBy: { placedAt: "desc" }, include: { placedBy: { select: { name: true } }, releasedBy: { select: { name: true } } } },
    },
  });
  if (!d) return null;
  const retention = retentionOf(d.retentionSnapshot);
  const authority = retention?.disposalAuthorityRoleCode
    ? await db.authorityRole.findFirst({ where: { organisationId: org.id, code: retention.disposalAuthorityRoleCode }, select: { nameEn: true } })
    : null;
  const people = await db.person.findMany({ where: { organisationId: org.id, isActive: true }, orderBy: { name: "asc" }, select: { id: true, name: true } });
  const ids = [d.id, ...d.versions.map((v) => v.id), ...d.versions.flatMap((v) => v.attachments.map((a) => a.id)), ...d.holds.map((h) => h.id)];
  const history = await db.auditEntry.findMany({ where: { organisationId: org.id, entityId: { in: ids } }, orderBy: { at: "desc" }, take: 200 });
  const ownerLabel = (a: (typeof d.versions)[number]["attachments"][number]) =>
    a.meeting?.reference ?? a.exercise?.reference ?? a.award?.reference ?? (a.delegation ? `Delegation · ${a.delegation.fromPerson.name} to ${a.delegation.toPerson.name}` : a.specificationPanel ? `${a.specificationPanel.exercise.reference} · Specification panel` : a.bqVersion ? `${a.bqVersion.exercise.reference} · Bill of quantities, version ${a.bqVersion.versionNo}` : a.tenderPackPart ? packPartLabel(a.tenderPackPart) : a.addendum ? addendumLabel(a.addendum) : a.bidWithdrawal ? withdrawalLabel(a.bidWithdrawal) : a.validityExtension ? extensionLabel(a.validityExtension) : a.opening ? openingLabel(a.opening) : a.evaluation ? evaluationLabel(a.evaluation) : a.evaluationMeeting ? evaluationMeetingLabel(a.evaluationMeeting) : a.evaluationBidder ? evaluationBidderLabel(a.evaluationBidder) : a.supplierDocument ? supplierDocumentLabel(a.supplierDocument) : a.supplierApplication ? supplierApplicationLabel(a.supplierApplication) : a.contract ? contractLabel(a.contract) : a.variationInstruction ? variationInstructionLabel(a.variationInstruction) : a.standingEvent ? cancellationOwnerLabel(a.standingEvent) : a.delayNotice ? delayNoticeLabel(a.delayNotice) : a.eotClaim ? eotClaimLabel(a.eotClaim) : a.creditorProfile ? `${a.creditorProfile.supplier.reference} · Creditor's profile, version ${a.creditorProfile.version}` : a.portalApplicationDocument ? `${a.portalApplicationDocument.portalApplication.reference} · ${a.portalApplicationDocument.typeLabelSnapshot}` : a.portalApplicationCreditor ? `${a.portalApplicationCreditor.portalApplication.reference} · Bank details` : a.projectDocumentVersion ? projectDocumentVersionLabel(a.projectDocumentVersion) : "A record");
  const hrefOf = (a: (typeof d.versions)[number]["attachments"][number]) =>
    a.meetingId ? ownerHref("meeting", a.meetingId)
      : a.exerciseId ? ownerHref("exercise", a.exerciseId)
      : a.awardId ? ownerHref("award", a.awardId)
      : a.delegationId ? ownerHref("delegation", a.delegationId)
      : a.specificationPanelId ? ownerHref("specificationPanel", a.specificationPanelId, a.specificationPanel?.exerciseId)
      : a.bqVersionId ? ownerHref("bqVersion", a.bqVersionId, a.bqVersion?.exerciseId)
      : a.tenderPackPartId ? ownerHref("tenderPackPart", a.tenderPackPartId, a.tenderPackPart?.pack.exerciseId)
      : a.addendumId ? ownerHref("addendum", a.addendumId, a.addendum?.window.exerciseId)
      : a.bidWithdrawalId ? ownerHref("bidWithdrawal", a.bidWithdrawalId, a.bidWithdrawal?.exerciseId)
      : a.validityExtensionId ? ownerHref("validityExtension", a.validityExtensionId, a.validityExtension?.exerciseId)
      : a.openingId ? ownerHref("opening", a.openingId, a.opening?.exerciseId)
      : a.evaluationId ? ownerHref("evaluation", a.evaluationId, a.evaluation?.exerciseId)
      : a.evaluationMeetingId ? ownerHref("evaluationMeeting", a.evaluationMeetingId, a.evaluationMeeting?.evaluation.exerciseId)
      : a.evaluationBidderId ? ownerHref("evaluationBidder", a.evaluationBidderId, a.evaluationBidder?.evaluation.exerciseId)
      : a.supplierDocumentId ? ownerHref("supplierDocument", a.supplierDocumentId, a.supplierDocument?.supplierId)
      : a.supplierApplicationId ? ownerHref("supplierApplication", a.supplierApplicationId, a.supplierApplication?.supplierId)
      : a.contractId ? ownerHref("contract", a.contractId)
      : a.variationInstructionId && a.variationInstruction ? ownerHref("variationInstruction", a.variationInstructionId, `${a.variationInstruction.variation.contractId}/variations/${a.variationInstruction.variation.id}`)
      : a.standingEventId && a.standingEvent ? ownerHref("standingEvent", a.standingEventId, a.standingEvent.supplierId)
      : a.delayNoticeId && a.delayNotice ? ownerHref("delayNotice", a.delayNoticeId, a.delayNotice.contractId)
      : a.eotClaimId && a.eotClaim ? ownerHref("eotClaim", a.eotClaimId, a.eotClaim.contractId)
      // ADR 0041: what an online application holds is read on its page; a supplier's bank statement on its creditor tab.
      : a.creditorProfile ? `/suppliers/${a.creditorProfile.supplierId}?tab=creditor&version=${a.creditorProfile.version}`
      : a.portalApplicationDocument ? `/suppliers/online/${a.portalApplicationDocument.portalApplication.id}?tab=documents`
      : a.portalApplicationCreditor ? `/suppliers/online/${a.portalApplicationCreditor.portalApplication.id}?tab=bank`
      : a.projectDocumentVersionId && a.projectDocumentVersion ? ownerHref("projectDocumentVersion", a.projectDocumentVersionId, `${a.projectDocumentVersion.document.contractId}/documents/${a.projectDocumentVersion.document.id}`)
      : "/configuration/documents";
  return {
    id: d.id,
    title: d.title,
    status: d.status,
    documentClass: d.documentClass,
    classification: d.classificationSnapshot,
    retention,
    /// The office a disposal needs, by name: "A role no longer configured" if it has gone.
    disposalAuthority: retention?.disposalAuthorityRoleCode ? (authority?.nameEn ?? "An office no longer configured") : null,
    people,
    createdAt: d.createdAt,
    filedAt: d.filedAt,
    versions: d.versions.map((v) => {
      const scannerConfigured = malwareScanner().configured;
      const decision = downloadDecision({ classification: d.classificationSnapshot, scanState: v.scanState, entitled });
      return {
        ...v,
        byteSize: v.byteSize.toString(),
        download: decision.allow ? { allowed: true as const, href: `/api/documents/versions/${v.id}`, unscanned: asksBeforeOpening(v, scannerConfigured) } : { allowed: false as const, reason: DOWNLOAD_REFUSAL_TEXT[decision.reason].replace(/ The request was refused and logged\.$/, "") },
        accessEvents: v.accessEvents.map((e) => ({ id: e.id, kind: e.kind, at: e.at, reason: accessReasonText(e.reasonCode), by: e.actorPerson?.name ?? e.actorSystemLabel ?? null })),
        attachments: v.attachments.map((a) => ({ id: a.id, purpose: a.purpose, attachedAt: a.attachedAt, detachedAt: a.detachedAt, detachReason: a.detachReason, owner: ownerLabel(a), href: hrefOf(a) })),
      };
    }),
    holds: d.holds,
    history: history.map((e) => ({ id: e.id, entity: e.entity, entityLabel: e.entityLabel, action: e.action, at: e.at, reason: e.reason, changes: (e.changes ?? []) as unknown as { field: string; before: string | null; after: string | null }[] })),
    statements: { access: ACCESS_STATEMENT, fingerprint: FINGERPRINT_STATEMENT },
  };
}

/// How many records of a kind the attach choice lists at most. More is said, never quietly cut.
export const TARGET_CAP = 200;

/**
 * The records a received document can be attached to, of one kind, newest first, each with
 * the purposes that suit it and whether they are open (`attachTargets`). `total` is how many
 * records of the kind there are, so a list that is cut says so.
 */
/// `hidden`: the restricted exercises the reader may not see; they, their awards and their panels are not offered (FR-MTD-007).
export async function attachTargetsOf(organisationId: string, kind: OwnerRef["kind"], hidden: readonly string[]) {
  const org = await documentOrg(organisationId);
  if (!org) return { records: [], total: 0 };
  const take = TARGET_CAP;
  // The `where` fragment that leaves out whatever hangs on a hidden exercise. Their labels carry its reference, so a kind is filtered here, not only the ones that name an exercise.
  const out = hidden.length ? { notIn: [...hidden] } : undefined;
  switch (kind) {
    case "meeting": {
      const where = { committee: { organisationId: org.id } };
      const [rows, total] = await Promise.all([db.meeting.findMany({ where, orderBy: { meetingDate: "desc" }, take, select: { id: true, status: true, reference: true } }), db.meeting.count({ where })]);
      return { records: attachTargets(rows.map((m) => ({ id: m.id, label: m.reference, facts: meetingFacts(m) }))), total };
    }
    case "exercise": {
      const where = { organisationId: org.id, ...(hidden.length ? { id: { notIn: [...hidden] } } : {}) };
      const [rows, total, methods] = await Promise.all([
        db.sourcingExercise.findMany({ where, orderBy: { createdAt: "desc" }, take, select: { id: true, status: true, reference: true, title: true, sourcingMethodCode: true, classificationSnapshot: true, ...PUBLICATION_FACTS_SELECT, window: { select: { path: true } }, awards: { select: { status: true, approvalInstances: { where: { domain: "appointment", status: "PENDING" }, select: { id: true } } } } } }),
        db.sourcingExercise.count({ where }),
        db.sourcingMethod.findMany({ where: { organisationId: org.id }, select: { code: true, requiresDossier: true, requiresCoordinationRecord: true } }),
      ]);
      return {
        records: attachTargets(
          rows.map((ex) => ({
            id: ex.id,
            label: `${ex.reference} · ${ex.title}`,
            // The same facts the attach act reads under its lock, method included.
            facts: exerciseFacts(ex, ex.awards.map((a) => ({ status: a.status, openAppointmentRoutes: a.approvalInstances.length })), exerciseMethodFlags(ex.classificationSnapshot, methods.find((m) => m.code === ex.sourcingMethodCode) ?? null), ex.window, publicationFactsOf(ex)),
          })),
        ),
        total,
      };
    }
    case "award": {
      const where = { organisationId: org.id, ...(hidden.length ? { exerciseId: { notIn: [...hidden] } } : {}) };
      const [rows, total] = await Promise.all([db.award.findMany({ where, orderBy: { createdAt: "desc" }, take, select: { id: true, status: true, instrumentKind: true, returnScanSnapshot: true, reference: true, awardeeName: true } }), db.award.count({ where })]);
      return { records: attachTargets(rows.map((a) => ({ id: a.id, label: `${a.reference} · ${a.awardeeName}`, facts: awardFacts(a) }))), total };
    }
    case "delegation": {
      const where = { organisationId: org.id };
      const today = org.today;
      const [rows, total] = await Promise.all([db.delegation.findMany({ where, orderBy: { effectiveFrom: "desc" }, take, select: { id: true, effectiveTo: true, fromPerson: { select: { name: true } }, toPerson: { select: { name: true } } } }), db.delegation.count({ where })]);
      return { records: attachTargets(rows.map((d) => ({ id: d.id, label: `${d.fromPerson.name} to ${d.toPerson.name}`, facts: delegationFacts(d, today) }))), total };
    }
    case "specificationPanel": {
      const where = { organisationId: org.id, ...(hidden.length ? { exerciseId: { notIn: [...hidden] } } : {}) };
      const [rows, total] = await Promise.all([
        db.specificationPanel.findMany({ where, orderBy: { exercise: { createdAt: "desc" } }, take, select: { id: true, ...PANEL_FACTS_SELECT, exerciseId: true, exercise: { select: { status: true, reference: true, title: true, specPanelUsed: true } } } }),
        db.specificationPanel.count({ where }),
      ]);
      return { records: attachTargets(rows.map((p) => ({ id: p.id, label: `${p.exercise.reference} · ${p.exercise.title}`, href: ownerHref("specificationPanel", p.id, p.exerciseId), facts: panelFacts(p) }))), total };
    }
    case "bqVersion":
      // Q-3: a bill's file is attached only by importing it there (OWNER_ACT_PURPOSES), so
      // no bill is offered as a place to attach a received document.
      return { records: [], total: 0 };
    case "tenderPackPart": {
      // 6.4: the uploaded parts of draft packs, newest pack first, in print order.
      const where = { organisationId: org.id, source: { in: ["UPLOAD", "TEMPLATE", "BQ_UNPRICED"] as ("UPLOAD" | "TEMPLATE" | "BQ_UNPRICED")[] }, pack: { status: "DRAFT" as const, ...(out ? { exerciseId: out } : {}) } };
      const [rows, total] = await Promise.all([
        db.tenderPackPart.findMany({ where, orderBy: [{ pack: { createdAt: "desc" } }, { sortOrder: "asc" }], take, select: { id: true, ...PACK_PART_FACTS_SELECT } }),
        db.tenderPackPart.count({ where }),
      ]);
      return { records: attachTargets(rows.map((p) => ({ id: p.id, label: packPartLabel(p), href: ownerHref("tenderPackPart", p.id, p.pack.exerciseId), facts: tenderPackPartFacts(p) }))), total };
    }
    case "addendum": {
      // 6.5: draft addenda, newest first: an issued one stands on the copy it was issued on.
      const where = { organisationId: org.id, status: "DRAFT" as const, ...(out ? { window: { exerciseId: out } } : {}) };
      const [rows, total] = await Promise.all([
        db.addendum.findMany({ where, orderBy: { createdAt: "desc" }, take, select: { id: true, ...ADDENDUM_FACTS_SELECT } }),
        db.addendum.count({ where }),
      ]);
      return { records: attachTargets(rows.map((a) => ({ id: a.id, label: addendumLabel(a), href: ownerHref("addendum", a.id, a.window.exerciseId), facts: addendumFacts(a) }))), total };
    }
    case "bidWithdrawal": {
      // 6.6: withdrawals on exercises not cancelled, newest first.
      const where = { organisationId: org.id, exercise: { status: { not: "CANCELLED" as const } }, ...(out ? { exerciseId: out } : {}) };
      const [rows, total] = await Promise.all([
        db.bidWithdrawal.findMany({ where, orderBy: { createdAt: "desc" }, take, select: { id: true, ...WITHDRAWAL_FACTS_SELECT } }),
        db.bidWithdrawal.count({ where }),
      ]);
      return { records: attachTargets(rows.map((w) => ({ id: w.id, label: withdrawalLabel(w), href: ownerHref("bidWithdrawal", w.id, w.exerciseId), facts: withdrawalFacts(w) }))), total };
    }
    case "validityExtension": {
      // 6.6: extensions not yet applied, newest first: an applied one stands on its consent.
      const where = { organisationId: org.id, appliedAt: null, ...(out ? { exerciseId: out } : {}) };
      const [rows, total] = await Promise.all([
        db.validityExtension.findMany({ where, orderBy: { createdAt: "desc" }, take, select: { id: true, ...EXTENSION_FACTS_SELECT } }),
        db.validityExtension.count({ where }),
      ]);
      return { records: attachTargets(rows.map((x) => ({ id: x.id, label: extensionLabel(x), href: ownerHref("validityExtension", x.id, x.exerciseId), facts: extensionFacts(x) }))), total };
    }
    case "opening": {
      // 6.7: finalised openings, newest first: a signed schedule is attached only once its opening is.
      const where = { organisationId: org.id, finalisedAt: { not: null }, ...(out ? { exerciseId: out } : {}) };
      const [rows, total] = await Promise.all([
        db.opening.findMany({ where, orderBy: { finalisedAt: "desc" }, take, select: { id: true, ...OPENING_FACTS_SELECT } }),
        db.opening.count({ where }),
      ]);
      return { records: attachTargets(rows.map((o) => ({ id: o.id, label: openingLabel(o), href: ownerHref("opening", o.id, o.exerciseId), facts: openingFacts(o) }))), total };
    }
    case "evaluation": {
      // 6.8: evaluation versions in force (open or issued), newest first.
      const where = { organisationId: org.id, state: { in: ["OPEN" as const, "ISSUED" as const] }, ...(out ? { exerciseId: out } : {}) };
      const [rows, total] = await Promise.all([
        db.evaluation.findMany({ where, orderBy: { startedAt: "desc" }, take, select: { id: true, ...EVALUATION_FACTS_SELECT } }),
        db.evaluation.count({ where }),
      ]);
      return { records: attachTargets(rows.map((e) => ({ id: e.id, label: evaluationLabel(e), href: ownerHref("evaluation", e.id, e.exerciseId), facts: evaluationFacts(e) }))), total };
    }
    case "evaluationMeeting": {
      // 6.8: meetings not closed, on open evaluations, newest first.
      const where = { organisationId: org.id, closedAt: null, evaluation: { state: "OPEN" as const, ...(out ? { exerciseId: out } : {}) } };
      const [rows, total] = await Promise.all([
        db.evaluationMeeting.findMany({ where, orderBy: { openedAt: "desc" }, take, select: { id: true, ...EVALUATION_MEETING_FACTS_SELECT } }),
        db.evaluationMeeting.count({ where }),
      ]);
      return { records: attachTargets(rows.map((m) => ({ id: m.id, label: evaluationMeetingLabel(m), href: ownerHref("evaluationMeeting", m.id, m.evaluation.exerciseId), facts: evaluationMeetingFacts(m) }))), total };
    }
    case "evaluationBidder": {
      // 6.8: bids on open evaluations, by listing number.
      const where = { organisationId: org.id, evaluation: { state: "OPEN" as const, ...(out ? { exerciseId: out } : {}) } };
      const [rows, total] = await Promise.all([
        db.evaluationBidder.findMany({ where, orderBy: [{ evaluation: { startedAt: "desc" } }, { openedBid: { listingNo: "asc" } }], take, select: { id: true, ...EVALUATION_BIDDER_FACTS_SELECT } }),
        db.evaluationBidder.count({ where }),
      ]);
      return { records: attachTargets(rows.map((b) => ({ id: b.id, label: evaluationBidderLabel(b), href: ownerHref("evaluationBidder", b.id, b.evaluation.exerciseId), facts: evaluationBidderFacts(b) }))), total };
    }
    case "supplierDocument": {
      // 6.15: documents not renewed, newest first.
      const where = { organisationId: org.id, renewedBy: { is: null } };
      const [rows, total] = await Promise.all([
        db.supplierDocument.findMany({ where, orderBy: [{ lodgedOn: "desc" }, { id: "asc" }], take, select: { id: true, ...SUPPLIER_DOCUMENT_FACTS_SELECT } }),
        db.supplierDocument.count({ where }),
      ]);
      return { records: attachTargets(rows.map((d) => ({ id: d.id, label: supplierDocumentLabel(d), href: ownerHref("supplierDocument", d.id, d.supplierId), facts: supplierDocumentFacts(d) }))), total };
    }
    case "supplierApplication": {
      // 6.15: open applications, newest first.
      const where = { organisationId: org.id, status: { in: ["RECEIVED" as const, "RESUBMISSION_REQUESTED" as const] }, lapsedRecordedAt: null };
      const [rows, total] = await Promise.all([
        db.supplierApplication.findMany({ where, orderBy: [{ receivedOn: "desc" }, { id: "asc" }], take, select: { id: true, ...SUPPLIER_APPLICATION_FACTS_SELECT } }),
        db.supplierApplication.count({ where }),
      ]);
      return { records: attachTargets(rows.map((a) => ({ id: a.id, label: supplierApplicationLabel(a), href: ownerHref("supplierApplication", a.id, a.supplierId), facts: supplierApplicationFacts(a) }))), total };
    }
    case "contract": {
      // 6.12: contracts being formed or executed, newest first (a cancelled one keeps what it has).
      const where = { organisationId: org.id, status: { notIn: ["CANCELLED" as const, "NUMBER_ALLOCATED" as const] } };
      const [rows, total] = await Promise.all([
        db.contract.findMany({ where, orderBy: [{ numberedOn: "desc" }, { id: "asc" }], take, select: { id: true, ...CONTRACT_FACTS_SELECT } }),
        db.contract.count({ where }),
      ]);
      return { records: attachTargets(rows.map((c) => ({ id: c.id, label: contractLabel(c), href: ownerHref("contract", c.id), facts: contractFacts(c) }))), total };
    }
    case "standingEvent": {
      // 6.15 (615-C2): registrations cancelled, not withdrawn, newest first.
      const where = { organisationId: org.id, kind: "REGISTRATION_CANCELLED" as const, withdrawnAt: null };
      const [rows, total] = await Promise.all([
        db.standingEvent.findMany({ where, orderBy: [{ recordedAt: "desc" }, { id: "asc" }], take, select: { id: true, ...CANCELLATION_OWNER_SELECT } }),
        db.standingEvent.count({ where }),
      ]);
      return { records: attachTargets(rows.map((e) => ({ id: e.id, label: cancellationOwnerLabel(e), href: ownerHref("standingEvent", e.id, e.supplierId), facts: cancellationOwnerFacts(e) }))), total };
    }
    case "variationInstruction": {
      // 6.13 (FR-VAR-015): instructions that stand (not void) on a variation not closed, of a contract not cancelled, newest first.
      const where = { organisationId: org.id, certificate: { status: { not: "VOID" as const } }, variation: { status: { not: "CLOSED" as const }, contract: { status: { not: "CANCELLED" as const } } } };
      const [rows, total] = await Promise.all([
        db.variationInstruction.findMany({ where, orderBy: [{ recordedAt: "desc" }, { id: "asc" }], take, select: { id: true, ...VARIATION_INSTRUCTION_FACTS_SELECT } }),
        db.variationInstruction.count({ where }),
      ]);
      return { records: attachTargets(rows.map((i) => ({ id: i.id, label: variationInstructionLabel(i), href: ownerHref("variationInstruction", i.id, `${i.variation.contractId}/variations/${i.variation.id}`), facts: variationInstructionFacts(i) }))), total };
    }
    case "delayNotice": {
      // 6.13 Part B run 1b: delay notices of contracts not cancelled, newest first.
      const where = { organisationId: org.id, contract: { status: { not: "CANCELLED" as const } } };
      const [rows, total] = await Promise.all([
        db.delayNotice.findMany({ where, orderBy: [{ recordedAt: "desc" }, { id: "asc" }], take, select: { id: true, ...DELAY_NOTICE_FACTS_SELECT } }),
        db.delayNotice.count({ where }),
      ]);
      return { records: attachTargets(rows.map((n) => ({ id: n.id, label: delayNoticeLabel(n), href: ownerHref("delayNotice", n.id, n.contractId), facts: delayNoticeFacts(n) }))), total };
    }
    case "eotClaim": {
      // 6.13 Part B run 1b: EOT claims not yet determined or closed, of contracts not cancelled, newest first.
      const where = { organisationId: org.id, entitlement: null, matter: { closedAt: null }, contract: { status: { not: "CANCELLED" as const } } };
      const [rows, total] = await Promise.all([
        db.eotClaim.findMany({ where, orderBy: [{ recordedAt: "desc" }, { id: "asc" }], take, select: { id: true, ...EOT_CLAIM_FACTS_SELECT } }),
        db.eotClaim.count({ where }),
      ]);
      return { records: attachTargets(rows.map((c) => ({ id: c.id, label: eotClaimLabel(c), href: ownerHref("eotClaim", c.id, c.contractId), facts: eotClaimFacts(c) }))), total };
    }
    // Phase 4b: nothing is attached to the supplier's own uploads from the staff's shared choice.
    case "registrationDraftDocument":
    case "creditorProfile":
    case "onlineBidFile":
    case "portalApplicationDocument":
    case "portalApplicationCreditor":
    case "projectDocumentVersion":
    case "awardOnlineReturn":
      return { records: [], total: 0 };
  }
}

/// "Received, not filed": staged documents, oldest first. Never deleted automatically.
export async function stagedDocuments(organisationId: string) {
  const org = await documentOrg(organisationId);
  if (!org) return [];
  return db.document.findMany({
    where: { organisationId: org.id, status: "STAGED" },
    orderBy: { createdAt: "asc" },
    select: { id: true, title: true, createdAt: true, classificationSnapshot: true, documentClass: { select: { nameEn: true } }, versions: { select: { id: true, versionNo: true, withdrawnAt: true, originalFilename: true, recordedBy: { select: { name: true } }, recordedByPortalApplicationId: true }, orderBy: { versionNo: "desc" } } },
  });
}

/// The legal holds standing, newest first.
export async function standingHolds(organisationId: string) {
  const org = await documentOrg(organisationId);
  if (!org) return [];
  return db.legalHold.findMany({ where: { organisationId: org.id, releasedAt: null }, orderBy: { placedAt: "desc" }, include: { document: { select: { id: true, title: true } }, placedBy: { select: { name: true } } } });
}

/**
 * What the upload control needs: the classes to choose from (OD-7), the allowed types
 * and the cap in force, the deployment ceiling shown as a technical limit — or the
 * words that say uploads are refused and where to set what is missing.
 */
export async function uploadContext(organisationId: string) {
  const org = await documentOrg(organisationId);
  if (!org) return null;
  const [classes, policy, people] = await Promise.all([
    db.documentClass.findMany({ where: { organisationId: org.id }, orderBy: [{ sortOrder: "asc" }, { nameEn: "asc" }], select: { id: true, nameEn: true, classification: true } }),
    loadStorePolicy(org.id),
    db.person.findMany({ where: { organisationId: org.id, isActive: true }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);
  const ceiling = deploymentCeiling();
  const cap = effectiveCap(policy, ceiling);
  const refusals = [
    ...(classes.length ? [] : [documentFaultText({ code: "CLASSES_NOT_CONFIGURED", level: "block" })]),
    ...(policy.allowedMediaTypes.length ? [] : [documentFaultText({ code: "TYPES_NOT_SET", level: "block" })]),
    ...("fault" in cap ? [documentFaultText({ code: cap.fault, level: "block" })] : []),
  ];
  return {
    classes,
    /// Who may be named as recording an upload: active people on record.
    people,
    allowedMediaTypes: policy.allowedMediaTypes,
    maxBytes: policy.maxBytes?.toString() ?? null,
    ceiling: "ceiling" in ceiling ? ceiling.ceiling.toString() : null,
    cap: "cap" in cap ? { bytes: cap.cap.toString(), from: cap.from } : null,
    refusals,
    timeZoneSet: org.timeZone != null,
    statement: ACCESS_STATEMENT,
  };
}
