/**
 * What the document screens read (plan §6), so the panel, the drawer and the
 * configuration lists render what the rules decide and never restate them: each row
 * carries its download decision, each owner its state per purpose (`ownerState` on the
 * same `owner-facts` mapping the acts use under their locks). Reads only; never bytes.
 */

import { storedDay } from "@/lib/dates";
import { db } from "@/lib/db";

import { downloadDecision } from "./access";
import { ownerState, purposeFits, type OwnerFacts } from "./attach";
import { isLive } from "./evidence";
import { ACCESS_STATEMENT, documentFaultText, DOWNLOAD_REFUSAL_TEXT, EXIT_TEXT, FINGERPRINT_STATEMENT } from "./labels";
import { effectiveCap } from "./limits";
import { awardFacts, delegationFacts, exerciseFacts, meetingFacts } from "./owner-facts";
import { type OwnerRef } from "./repo";
import { retentionOf, documentOrg, loadStorePolicy } from "./service";
import { deploymentCeiling } from "./store";
import { ATTACHMENT_PURPOSES, OWNER_COLUMN, type AttachmentPurpose } from "./types";
import { currentVersion } from "./versioning";

const versionSelect = {
  id: true, versionNo: true, sha256: true, byteSize: true, mediaType: true, originalFilename: true, receivedOn: true, storedAt: true, scanState: true, withdrawnAt: true, withdrawnReason: true, note: true,
  recordedBy: { select: { id: true, name: true } },
} as const;

/// An owner's facts, read for display (no lock). Null when the owner does not exist.
export async function readOwner(ref: OwnerRef): Promise<{ facts: OwnerFacts; label: string } | null> {
  const org = await documentOrg();
  if (!org) return null;
  switch (ref.kind) {
    case "meeting": {
      const m = await db.meeting.findFirst({ where: { id: ref.id, committee: { organisationId: org.id } }, select: { status: true, reference: true } });
      return m ? { facts: meetingFacts(m), label: m.reference } : null;
    }
    case "exercise": {
      const ex = await db.sourcingExercise.findFirst({ where: { id: ref.id, organisationId: org.id }, select: { status: true, reference: true, awards: { select: { status: true, approvalInstances: { where: { domain: "appointment", status: "PENDING" }, select: { id: true } } } } } });
      return ex ? { facts: exerciseFacts(ex, ex.awards.map((a) => ({ status: a.status, openAppointmentRoutes: a.approvalInstances.length }))), label: ex.reference } : null;
    }
    case "award": {
      const a = await db.award.findFirst({ where: { id: ref.id, organisationId: org.id }, select: { status: true, instrumentKind: true, returnScanSnapshot: true, reference: true } });
      return a ? { facts: awardFacts(a), label: a.reference } : null;
    }
    case "delegation": {
      const d = await db.delegation.findFirst({ where: { id: ref.id, organisationId: org.id }, select: { effectiveTo: true, fromPerson: { select: { name: true } }, toPerson: { select: { name: true } } } });
      return d ? { facts: delegationFacts(d, org.today ?? storedDay(new Date())), label: `Delegation · ${d.fromPerson.name} to ${d.toPerson.name}` } : null;
    }
  }
}

/**
 * Everything the shared attachment panel shows for one owner: per purpose that suits
 * it, whether it is open, not ready or frozen (with the words why), and every
 * attachment, live and past, with its document, pinned version, the document's latest
 * version and whether the pinned one may be downloaded (and if not, why).
 */
export async function ownerPanel(ref: OwnerRef) {
  const owner = await readOwner(ref);
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
    return { purpose, state: st.state, reason: st.state === "OPEN" ? null : EXIT_TEXT[st.exit], live: rows.filter((r) => r.purpose === purpose && isLive(r)).length };
  });
  const items = rows.map((r) => {
    const d = r.version.document;
    const decision = downloadDecision({ classification: d.classificationSnapshot, scanState: r.version.scanState });
    const latest = currentVersion(d.versions);
    return {
      attachmentId: r.id,
      purpose: r.purpose as AttachmentPurpose,
      live: isLive(r),
      attachedAt: r.attachedAt,
      detachedAt: r.detachedAt,
      detachReason: r.detachReason,
      document: { id: d.id, title: d.title, className: d.documentClass.nameEn, classification: d.classificationSnapshot, standingHold: d.holds[0] ?? null },
      version: { ...r.version, byteSize: r.version.byteSize.toString(), document: undefined },
      newerVersion: latest && latest.id !== r.version.id && latest.versionNo > r.version.versionNo && latest.withdrawnAt == null ? { id: latest.id, versionNo: latest.versionNo } : null,
      download: decision.allow ? { allowed: true as const, href: `/api/documents/versions/${r.version.id}` } : { allowed: false as const, reason: DOWNLOAD_REFUSAL_TEXT[decision.reason].replace(/ The request was refused and logged\.$/, "") },
    };
  });
  return { owner: { ...ref, label: owner.label, facts: owner.facts }, purposes, items, statement: ACCESS_STATEMENT };
}

/// The document drawer: versions, where it is attached, holds, access events and its trail.
export async function documentDrawer(documentId: string) {
  const org = await documentOrg();
  if (!org) return null;
  const d = await db.document.findFirst({
    where: { id: documentId, organisationId: org.id },
    include: {
      documentClass: { select: { id: true, nameEn: true, classification: true } },
      versions: {
        orderBy: { versionNo: "desc" },
        select: {
          ...versionSelect,
          attachments: { select: { id: true, purpose: true, attachedAt: true, detachedAt: true, detachReason: true, meetingId: true, exerciseId: true, awardId: true, delegationId: true, meeting: { select: { reference: true } }, exercise: { select: { reference: true } }, award: { select: { reference: true } }, delegation: { select: { fromPerson: { select: { name: true } }, toPerson: { select: { name: true } } } } } },
          accessEvents: { orderBy: { at: "desc" }, take: 50, select: { id: true, kind: true, reasonCode: true, at: true } },
        },
      },
      holds: { orderBy: { placedAt: "desc" }, include: { placedBy: { select: { name: true } }, releasedBy: { select: { name: true } } } },
    },
  });
  if (!d) return null;
  const ids = [d.id, ...d.versions.map((v) => v.id), ...d.versions.flatMap((v) => v.attachments.map((a) => a.id)), ...d.holds.map((h) => h.id)];
  const history = await db.auditEntry.findMany({ where: { organisationId: org.id, entityId: { in: ids } }, orderBy: { at: "desc" }, take: 200 });
  const ownerLabel = (a: (typeof d.versions)[number]["attachments"][number]) =>
    a.meeting?.reference ?? a.exercise?.reference ?? a.award?.reference ?? (a.delegation ? `Delegation · ${a.delegation.fromPerson.name} to ${a.delegation.toPerson.name}` : "A record");
  const ownerHref = (a: (typeof d.versions)[number]["attachments"][number]) =>
    a.meetingId ? `/committees/${a.meetingId}` : a.exerciseId ? `/sourcing/${a.exerciseId}` : a.awardId ? `/awards/${a.awardId}` : "/configuration/users";
  return {
    id: d.id,
    title: d.title,
    status: d.status,
    documentClass: d.documentClass,
    classification: d.classificationSnapshot,
    retention: retentionOf(d.retentionSnapshot),
    createdAt: d.createdAt,
    filedAt: d.filedAt,
    versions: d.versions.map((v) => {
      const decision = downloadDecision({ classification: d.classificationSnapshot, scanState: v.scanState });
      return {
        ...v,
        byteSize: v.byteSize.toString(),
        download: decision.allow ? { allowed: true as const, href: `/api/documents/versions/${v.id}` } : { allowed: false as const, reason: DOWNLOAD_REFUSAL_TEXT[decision.reason].replace(/ The request was refused and logged\.$/, "") },
        attachments: v.attachments.map((a) => ({ id: a.id, purpose: a.purpose, attachedAt: a.attachedAt, detachedAt: a.detachedAt, detachReason: a.detachReason, owner: ownerLabel(a), href: ownerHref(a) })),
      };
    }),
    holds: d.holds,
    history: history.map((e) => ({ id: e.id, entity: e.entity, entityLabel: e.entityLabel, action: e.action, at: e.at, reason: e.reason, changes: (e.changes ?? []) as unknown as { field: string; before: string | null; after: string | null }[] })),
    statements: { access: ACCESS_STATEMENT, fingerprint: FINGERPRINT_STATEMENT },
  };
}

/// "Received, not filed": staged documents, oldest first. Never deleted automatically.
export async function stagedDocuments() {
  const org = await documentOrg();
  if (!org) return [];
  return db.document.findMany({
    where: { organisationId: org.id, status: "STAGED" },
    orderBy: { createdAt: "asc" },
    select: { id: true, title: true, createdAt: true, classificationSnapshot: true, documentClass: { select: { nameEn: true } }, versions: { select: { versionNo: true, originalFilename: true, recordedBy: { select: { name: true } } }, orderBy: { versionNo: "desc" }, take: 1 } },
  });
}

/// The legal holds standing, newest first.
export async function standingHolds() {
  const org = await documentOrg();
  if (!org) return [];
  return db.legalHold.findMany({ where: { organisationId: org.id, releasedAt: null }, orderBy: { placedAt: "desc" }, include: { document: { select: { id: true, title: true } }, placedBy: { select: { name: true } } } });
}

/**
 * What the upload control needs: the classes to choose from (OD-7), the allowed types
 * and the cap in force, the deployment ceiling shown as a technical limit — or the
 * words that say uploads are refused and where to set what is missing.
 */
export async function uploadContext() {
  const org = await documentOrg();
  if (!org) return null;
  const [classes, policy] = await Promise.all([
    db.documentClass.findMany({ where: { organisationId: org.id }, orderBy: [{ sortOrder: "asc" }, { nameEn: "asc" }], select: { id: true, nameEn: true, classification: true } }),
    loadStorePolicy(org.id),
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
    allowedMediaTypes: policy.allowedMediaTypes,
    maxBytes: policy.maxBytes?.toString() ?? null,
    ceiling: "ceiling" in ceiling ? ceiling.ceiling.toString() : null,
    cap: "cap" in cap ? { bytes: cap.cap.toString(), from: cap.from } : null,
    refusals,
    timeZoneSet: org.timeZone != null,
    statement: ACCESS_STATEMENT,
  };
}
