"use server";

import type { FormState } from "@/components/record-editor";
import { Prisma } from "@/generated/prisma/client";
import { diffFields, snapshotFields } from "@/lib/audit/diff";
import { dayToDate, storedDay } from "@/lib/dates";
import { formatDate } from "@/lib/format";
import { WITHDRAWN_ON_CHANGE, exerciseRouteMatter, nameRoutesOf } from "@/lib/method/approval";
import { moveExercise } from "@/lib/method/move";
import { NAME_APPROVAL_DOMAIN } from "@/lib/method/types";
import { isPublished } from "@/lib/window/phase";
import { parseSen, senToDecimalString } from "@/lib/money";
import { deliveryFaults } from "@/lib/window/addendum";
import { ENTITY, deliveryFields, feeLineFields, partyFields, windowFields } from "@/lib/window/audit-view";
import { loadBidMethodRule } from "@/lib/bids/repo";
import { BID_RULES_KEY, bidRulesSnapshot } from "@/lib/bids/rule-snapshot";
import { policySnapshot } from "@/lib/window/dates";
import { publicationFault, windowEditFault } from "@/lib/window/edit";
import { lineAmount } from "@/lib/window/fee";
import { approvedNameRoute, inviteeEditFault, regKey, routesWithdrawnByListChange } from "@/lib/window/invitees";
import { judgePublish, nameRoutesWithLists, pathOf, proposedInvitees } from "@/lib/window/judge";
import { windowFindingText } from "@/lib/window/labels";
import { DELIVERY_METHODS, FEE_COST_KINDS, type DeliveryMethod, type FeeCostKind } from "@/lib/window/types";
import { FormReader } from "@/lib/validate";
import { chooseFaults } from "@/lib/evaluation/pin";

import { activePerson, audit, CHANGED, exerciseIdOf, inWindow, label, NO_WINDOW, NO_ZONE, refuse, Refusal, notes } from "./shared";
import { physicalItemsApply, saleModeWords, takeSaleModeFaults } from "@/lib/window/sale-mode";
import { toAuditActor, staffForAct } from "@/app/_auth/actor";
import { beginAct } from "@/app/_auth/act";
import type { AuditActor } from "@/lib/auth/types";

/**
 * Writes for 6.5's window (plan §4.1–4.3): the notice's items and the fee with its basis, the
 * invitee list (a change withdraws the name route, ADR 0015), the channels' publications, the
 * publication itself (→ ADVERTISED / INVITED, with the advertisement day and every rule value
 * frozen) and the letters' delivery. Locking and refusing are `shared.ts`'s.
 */

// ------------------------------------------------------------------ the window's items

/**
 * Save the notice's items, the purchase days and the fee (FR-ADV-003, 006–008). The first save
 * writes the window, its path taken from the method (advertised or invited); the closing itself is
 * never touched here (X-2): it was recorded at approval for tendering and moves only by an applied
 * closing change.
 */
export async function saveWindow(_prev: FormState, data: FormData): Promise<FormState> {
  const txGuard = await staffForAct("TRANSACTION");
  if (!txGuard.ok) return txGuard.state;
  const actor = txGuard.actor;
  const exerciseId = exerciseIdOf(data);
  const r = new FormReader(data);
  const inspectionPlace = r.text("inspectionPlace", "Where the documents are inspected", { max: 400 });
  const purchasePlace = r.text("purchasePlace", "Where the documents are bought", { max: 400 });
  const inspectionHours = r.text("inspectionHours", "Inspection and purchase hours", { max: 400 });
  const purchaseFrom = r.date("purchaseFromDay", "First day of sale");
  const purchaseClose = r.date("purchaseCloseDay", "Last day of sale");
  const fee = r.money("feeAmount", "Document fee");
  const feePaymentMethods = r.text("feePaymentMethods", "How the fee is paid", { max: 400 });
  const submissionPlace = r.text("submissionPlace", "Where tenders are submitted", { max: 400 });
  const closingTimeReason = r.text("closingTimeReason", "Why the closing time differs", { max: 2000 });
  // 6.15a (FR-ADV-017): whether the notice offers special permission; not stated is null, never "offered".
  const offer = r.choice("specialPermissionOffered", "Special permission", ["yes", "no", "unset"] as const);
  const specialPermissionOffered = offer === "yes" ? true : offer === "no" ? false : null;
  if (purchaseFrom && purchaseClose && purchaseFrom > purchaseClose) r.reject("purchaseCloseDay", windowFindingText({ code: "PURCHASE_DAYS_OUT_OF_ORDER", level: "block" }));
  if (r.failed) return { ok: false, errors: r.errors };
  return inWindow(actor, exerciseId, async (tx, l, d) => {
    const ef = windowEditFault(l.ex.status, l.ex.packKindSnapshot);
    if (ef) return refuse([ef]);
    // SR-10 (ruling 16): an exercise sold online has no places, hours or payment counter. The form does not carry them, and the columns are left as they are: they stay, unread.
    const physical = physicalItemsApply(l.ex.saleMode) ? { inspectionPlace, purchasePlace, inspectionHours, feePaymentMethods, submissionPlace } : {};
    const after = { ...physical, purchaseFromDay: purchaseFrom, purchaseCloseDay: purchaseClose, feeAmount: fee, closingTimeReason, specialPermissionOffered };
    if (!d.window) {
      const { method } = pathOf(d);
      if (!method) return refuse([{ code: "PATH_NOT_SET", level: "block" }]);
      const w = await tx.exerciseWindow.create({ data: { organisationId: l.org.id, exerciseId, path: method, ...after } });
      await audit(tx, toAuditActor(actor), l.org.id, ENTITY.window, w.id, label(l, "Invitation window"), "CREATE", diffFields(null, windowFields({ inspectionPlace: "", purchasePlace: "", inspectionHours: "", feePaymentMethods: "", submissionPlace: "", ...after, path: method })));
      return { ok: true };
    }
    const w = d.window;
    await tx.exerciseWindow.update({ where: { id: w.id, organisationId: actor.organisationId }, data: after });
    await audit(tx, toAuditActor(actor), l.org.id, ENTITY.window, w.id, label(l, "Invitation window"), "UPDATE", diffFields(windowFields(w), windowFields({ ...w, ...after })));
    return { ok: true };
  });
}

/**
 * Take the organisation's setting for how this exercise's documents are sold (SR-10, ruling 16, G1). Allowed only while the pin is not set and before the exercise
 * is published; it copies what Configuration says now, once, and is not a free choice. A pin that is set is never changed. One audited act, with the exercise locked
 * and the setting read under the lock.
 */
export async function takeSaleMode(_prev: FormState, data: FormData): Promise<FormState> {
  const txGuard = await staffForAct("TRANSACTION");
  if (!txGuard.ok) return txGuard.state;
  const actor = txGuard.actor;
  const exerciseId = exerciseIdOf(data);
  return inWindow(actor, exerciseId, async (tx, l, d) => {
    const faults = takeSaleModeFaults({ status: l.ex.status, published: isPublished(l.ex.status) || !!d.window?.publishedAt, pin: l.ex.saleMode, setting: d.sale.saleMode });
    if (faults.length) return refuse(faults);
    await tx.sourcingExercise.update({ where: { id: exerciseId, organisationId: actor.organisationId }, data: { saleMode: d.sale.saleMode } });
    await audit(tx, toAuditActor(actor), l.org.id, "SourcingExercise", exerciseId, label(l, "How the documents are sold"), "UPDATE", diffFields({ howDocumentsAreSold: saleModeWords(l.ex.saleMode) }, { howDocumentsAreSold: saleModeWords(d.sale.saleMode) }), "Took the organisation's setting");
    return { ok: true };
  });
}

/// Add or change a line of the fee's cost basis. The amount is the lib's (`lineAmount`), never the form's.
export async function saveFeeLine(_prev: FormState, data: FormData): Promise<FormState> {
  const txGuard = await staffForAct("TRANSACTION");
  if (!txGuard.ok) return txGuard.state;
  const actor = txGuard.actor;
  const exerciseId = exerciseIdOf(data);
  const lineId = String(data.get("lineId") ?? "") || null;
  const r = new FormReader(data);
  const kind = r.choice("kind", "Cost", FEE_COST_KINDS, { required: true }) as FeeCostKind | null;
  const description = r.text("description", "Description", { max: 400 });
  const quantity = r.optionalText("quantity");
  const unitCost = r.money("unitCost", "Unit cost");
  const lump = r.money("amount", "Amount");
  if (r.failed || !kind) return { ok: false, errors: r.errors };
  const computed = lineAmount({ quantity, unitCost: unitCost ? parseSen(unitCost) : null, lump: lump ? parseSen(lump) : null });
  if ("fault" in computed) return { ok: false, errors: { [computed.fault === "QUANTITY_NOT_VALID" ? "quantity" : "amount"]: windowFindingText({ code: computed.fault, level: "block" }) } };
  return inWindow(actor, exerciseId, async (tx, l, d) => {
    const ef = windowEditFault(l.ex.status, l.ex.packKindSnapshot);
    if (ef) return refuse([ef]);
    if (!d.window) return NO_WINDOW;
    const row = { kind, description, quantity: quantity?.trim() ? quantity.trim().replace(/,/g, "") : null, unitCost, amount: senToDecimalString(computed.amount) };
    if (lineId) {
      const before = d.window.feeLines.find((x) => x.id === lineId);
      if (!before) return { ok: false, message: "That line is no longer on the basis." };
      await tx.windowFeeLine.update({ where: { id: lineId, organisationId: actor.organisationId }, data: row });
      await audit(tx, toAuditActor(actor), l.org.id, ENTITY.feeLine, lineId, label(l, "Fee basis"), "UPDATE", diffFields(feeLineFields(before), feeLineFields(row)));
    } else {
      const created = await tx.windowFeeLine.create({ data: { organisationId: l.org.id, windowId: d.window.id, sortOrder: d.window.feeLines.length, ...row } });
      await audit(tx, toAuditActor(actor), l.org.id, ENTITY.feeLine, created.id, label(l, "Fee basis"), "CREATE", diffFields(null, feeLineFields(row)));
    }
    return { ok: true };
  });
}

export async function removeFeeLine(_prev: FormState, data: FormData): Promise<FormState> {
  const txGuard = await staffForAct("TRANSACTION");
  if (!txGuard.ok) return txGuard.state;
  const actor = txGuard.actor;
  const exerciseId = exerciseIdOf(data);
  const lineId = String(data.get("lineId") ?? "");
  return inWindow(actor, exerciseId, async (tx, l, d) => {
    const ef = windowEditFault(l.ex.status, l.ex.packKindSnapshot);
    if (ef) return refuse([ef]);
    const line = d.window?.feeLines.find((x) => x.id === lineId);
    if (!line) return { ok: false, message: "That line is no longer on the basis." };
    await tx.windowFeeLine.delete({ where: { id: line.id, organisationId: actor.organisationId } });
    await audit(tx, toAuditActor(actor), l.org.id, ENTITY.feeLine, line.id, label(l, "Fee basis"), "DELETE", snapshotFields(feeLineFields(line)));
    return { ok: true };
  });
}

// ------------------------------------------------------------------ the invitee list (ADR 0015)

/// Withdraw every name route pending or approved: it no longer describes the list (BD-19's label).
async function withdrawNameRoutes(tx: Parameters<Parameters<typeof inWindow>[2]>[0], actor: AuditActor, l: Parameters<Parameters<typeof inWindow>[2]>[1], why: string) {
  const routes = nameRoutesOf(l.ex.approvalInstances);
  for (const inst of routesWithdrawnByListChange(routes)) {
    const warning = { code: WITHDRAWN_ON_CHANGE, level: "warn", messageEn: `${why} The route no longer describes the invitee list, so it was withdrawn.` };
    const moved = await tx.approvalInstance.updateMany({ where: { id: inst.id, status: inst.status }, data: { status: "RECALLED", closedAt: new Date(), warnings: [...((inst.warnings as object[]) ?? []), warning] as unknown as Prisma.InputJsonValue } });
    if (moved.count !== 1) throw new Refusal(CHANGED);
    await audit(tx, actor, l.org.id, "ApprovalInstance", inst.id, label(l, exerciseRouteMatter(NAME_APPROVAL_DOMAIN).auditNoun), "UPDATE", diffFields({ status: inst.status }, { status: "RECALLED" }), why);
  }
}

/// Propose a contractor for invitation. A change of the list withdraws the name route.
export async function proposeInvitee(_prev: FormState, data: FormData): Promise<FormState> {
  const txGuard = await staffForAct("TRANSACTION");
  if (!txGuard.ok) return txGuard.state;
  const actor = txGuard.actor;
  const exerciseId = exerciseIdOf(data);
  const r = new FormReader(data);
  const name = r.text("name", "Contractor", { required: true, max: 240 });
  const registrationNo = r.text("registrationNo", "Registration number", { required: true, max: 80 });
  const address = r.text("address", "Address", { max: 1000 });
  const phone = r.text("phone", "Telephone", { max: 60 });
  const fax = r.text("fax", "Fax", { max: 60 });
  const email = r.text("email", "Email", { max: 200 });
  if (r.failed) return { ok: false, errors: r.errors };
  return inWindow(actor, exerciseId, async (tx, l, d) => {
    const f = inviteeEditFault(l.ex.status);
    if (f) return refuse([f]);
    if (pathOf(d).method === "ADVERTISED") return refuse([{ code: "NOT_INVITED_PATH", level: "block" }]);
    if (d.parties.some((p) => regKey(p.registrationNo) === regKey(registrationNo))) return { ok: false, errors: { registrationNo: windowFindingText({ code: "DUPLICATE", level: "block" }) } };
    const row = { source: "PROPOSED_INVITEE" as const, name, registrationNo, address, phone, fax, email };
    const party = await tx.exerciseParty.create({ data: { organisationId: l.org.id, exerciseId, ...row } });
    await audit(tx, toAuditActor(actor), l.org.id, ENTITY.party, party.id, label(l, `Invitee ${name}`), "CREATE", diffFields(null, partyFields(row)));
    await withdrawNameRoutes(tx, toAuditActor(actor), l, `${name} was added to the invitee list.`);
    return { ok: true };
  });
}

/// Take a proposed contractor off the list, with a reason. Not once invited; not one with records.
export async function removeInvitee(_prev: FormState, data: FormData): Promise<FormState> {
  const txGuard = await staffForAct("TRANSACTION");
  if (!txGuard.ok) return txGuard.state;
  const actor = txGuard.actor;
  const exerciseId = exerciseIdOf(data);
  const partyId = String(data.get("partyId") ?? "");
  const reason = String(data.get("reason") ?? "").trim();
  if (!reason) return { ok: false, errors: { reason: windowFindingText({ code: "REASON_REQUIRED", level: "block" }) } };
  return inWindow(actor, exerciseId, async (tx, l, d) => {
    const f = inviteeEditFault(l.ex.status);
    if (f) return refuse([f]);
    const p = d.parties.find((x) => x.id === partyId);
    if (!p || p.source !== "PROPOSED_INVITEE") return refuse([{ code: "NOT_A_PROPOSED_INVITEE", level: "block" }]);
    const letters = await tx.invitationLetter.count({ where: { partyId } });
    const sales = await tx.documentSale.count({ where: { partyId } });
    const attendance = await tx.siteEventAttendance.count({ where: { partyId } });
    if (letters + sales + attendance > 0) return refuse([{ code: "PARTY_HAS_RECORDS", level: "block" }]);
    await tx.exerciseParty.delete({ where: { id: p.id, organisationId: actor.organisationId } });
    await audit(tx, toAuditActor(actor), l.org.id, ENTITY.party, p.id, label(l, `Invitee ${p.name}`), "DELETE", snapshotFields(partyFields(p)), reason);
    await withdrawNameRoutes(tx, toAuditActor(actor), l, `${p.name} was taken off the invitee list: ${reason}`);
    return { ok: true };
  });
}

// ------------------------------------------------------------------ publications (FR-ADV-001)

/// Record an advertised exercise's publication on a channel, by the signed-in officer (Phase 2b).
export async function recordPublication(_prev: FormState, data: FormData): Promise<FormState> {
  const txGuard = await staffForAct("TRANSACTION");
  if (!txGuard.ok) return txGuard.state;
  const actor = txGuard.actor;
  const exerciseId = exerciseIdOf(data);
  const r = new FormReader(data);
  const channelId = r.text("channelId", "Channel", { required: true });
  const on = r.date("publishedOn", "Published on", { required: true });
  const reference = r.text("reference", "Title and edition, board or address", { max: 400 });
  if (r.failed || !on) return { ok: false, errors: r.errors };
  const begun = await beginAct(actor, data, "PublicationRecord.recordedBy", { personField: "recordedByPersonId" });
  if (!begun.ok) return begun.state;
  const act = begun.act;
  const personId = act.subjectPersonId;
  return inWindow(actor, exerciseId, async (tx, l, d) => {
    if (!l.org.today) return NO_ZONE;
    if (!d.window) return NO_WINDOW;
    const person = await activePerson(tx, l.org.id, personId);
    const channel = d.channels.find((c) => c.id === channelId) ?? null;
    const fs = publicationFault({
      status: l.ex.status,
      path: pathOf(d).path,
      channel,
      alreadyRecorded: d.window.publications.some((p) => p.channelId === channelId),
      publishedOn: storedDay(on),
      approvedOn: l.ex.approvedForTenderingAt ? storedDay(l.ex.approvedForTenderingAt) : null,
      today: l.org.today,
      personActive: !!person,
    });
    if (fs.length) return fs.length === 1 && fs[0].code === "PERSON_REQUIRED" ? { ok: false, errors: { recordedByPersonId: windowFindingText(fs[0]) } } : refuse(fs, "Not recorded:");
    const row = await tx.publicationRecord.create({ data: { organisationId: l.org.id, windowId: d.window.id, channelId, channelName: channel!.nameEn, publishedOn: on, reference, recordedByPersonId: person!.id } });
    await audit(tx, toAuditActor(actor), l.org.id, ENTITY.publication, row.id, label(l, `Publication · ${channel!.nameEn}`), "CREATE", diffFields(null, { channel: channel!.nameEn, publishedOn: formatDate(storedDay(on)), reference: reference || null, recordedBy: person!.name }));
    await act.write(tx, row.id);
    return { ok: true };
  });
}

/// Remove a publication recorded in error, with a reason, before the exercise is published.
export async function removePublication(_prev: FormState, data: FormData): Promise<FormState> {
  const txGuard = await staffForAct("TRANSACTION");
  if (!txGuard.ok) return txGuard.state;
  const actor = txGuard.actor;
  const exerciseId = exerciseIdOf(data);
  const publicationId = String(data.get("publicationId") ?? "");
  const reason = String(data.get("reason") ?? "").trim();
  if (!reason) return { ok: false, errors: { reason: windowFindingText({ code: "REASON_REQUIRED", level: "block" }) } };
  return inWindow(actor, exerciseId, async (tx, l, d) => {
    if (isPublished(l.ex.status)) return refuse([{ code: "WINDOW_PUBLISHED", level: "block" }]);
    const p = d.window?.publications.find((x) => x.id === publicationId);
    if (!p) return { ok: false, message: "That publication is no longer recorded." };
    await tx.publicationRecord.delete({ where: { id: p.id, organisationId: actor.organisationId } });
    await audit(tx, toAuditActor(actor), l.org.id, ENTITY.publication, p.id, label(l, `Publication · ${p.channelName}`), "DELETE", snapshotFields({ channel: p.channelName, publishedOn: formatDate(storedDay(p.publishedOn)), reference: p.reference || null }), reason);
    return { ok: true };
  });
}

// ------------------------------------------------------------------ publication (→ ADVERTISED / INVITED)

/**
 * Publish the window (FR-ADV-001–008; FR-MTD-008 on the invited path). Every rule is re-judged on
 * the locked rows (`judgePublish`); nothing blocking, then in one act: the advertisement day (the
 * channels' under the policy's rule, or today for the letters), every rule value with its
 * provenance (`policySnapshot`), the notice's text or each invitee's letter frozen (ADR 0008), and
 * the exercise moved by its one act (`via: PUBLICATION`). Warnings are said, never refused.
 */
export async function publishWindow(_prev: FormState, data: FormData): Promise<FormState> {
  const txGuard = await staffForAct("TRANSACTION");
  if (!txGuard.ok) return txGuard.state;
  const actor = txGuard.actor;
  const exerciseId = exerciseIdOf(data);
  return inWindow(actor, exerciseId, async (tx, l, d) => {
    if (!l.org.today) return NO_ZONE;
    if (!d.window) return NO_WINDOW;
    const j = judgePublish(d, l.ex, l.org);
    const blocks = j.result.findings.filter((f) => f.level === "block");
    if (blocks.length) return refuse(blocks, "Not published:");
    const now = new Date();
    const day = j.result.advertisementDay!;
    const floor = d.floors.find((f) => f.regime === l.ex.regime) ?? null;
    // 6.6 CR-2: the method's three bid-receipt rules, with provenance, frozen with the window; the
    // bids tab, its actions and the 6.10/6.11 hooks read them from here once published.
    const bidRules = bidRulesSnapshot(await loadBidMethodRule(l.org.id, l.ex.sourcingMethodCode, tx));
    const snapshot = policySnapshot(d.policy, d.calendar, d.channels, floor ? { regime: floor.regime, minimum: senToDecimalString(floor.minimum), provenance: floor.provenance } : null, {
      path: j.path,
      advertisementDay: day,
      [BID_RULES_KEY]: bidRules,
      warnings: j.result.findings.filter((f) => f.level !== "block").map((f) => ({ level: f.level, text: windowFindingText(f) })),
    });
    const w = d.window;
    // 6.8 (E-2, FR-EVL-006): the chosen model's issued content is copied onto the exercise in this act,
    // stamped with the publication's own moment; nothing evaluates from the model's rows after it.
    const m = d.evaluation.model!;
    const pinned = await tx.sourcingExercise.updateMany({ where: { id: exerciseId, evaluationModelId: m.id, evaluationModelPinnedAt: null }, data: { evaluationModelSnapshot: m.contentSnapshot as Prisma.InputJsonValue, evaluationModelPinnedAt: now } });
    if (pinned.count !== 1) throw new Refusal(CHANGED);
    await audit(tx, toAuditActor(actor), l.org.id, "SourcingExercise", exerciseId, `${l.ex.reference} · ${l.ex.title}`, "UPDATE", diffFields({ evaluationModelPinned: null }, { evaluationModelPinned: `${m.nameEn}, version ${m.version}` }));
    if (j.path === "ADVERTISED") {
      const t = d.templates.notice!;
      await tx.exerciseWindow.update({ where: { id: w.id, organisationId: actor.organisationId }, data: { advertisementDay: dayToDate(day), publishedAt: now, policySnapshot: snapshot as unknown as Prisma.InputJsonValue, noticeText: j.notice!.text, noticeTemplateCode: t.code, noticeTemplateBodyVersion: t.bodyVersion } });
      await audit(tx, toAuditActor(actor), l.org.id, ENTITY.window, w.id, label(l, "Invitation window"), "UPDATE", diffFields({ advertisedOn: null }, { advertisedOn: formatDate(day), notice: `${t.nameEn}, text version ${t.bodyVersion}`, rulesRecorded: "yes" }));
      await moveExercise(tx, l.ex, "ADVERTISED", { today: l.org.today, via: "PUBLICATION", publishFaults: 0 });
      await audit(tx, toAuditActor(actor), l.org.id, "SourcingExercise", exerciseId, `${l.ex.reference} · ${l.ex.title}`, "UPDATE", diffFields({ status: l.ex.status }, { status: "ADVERTISED" }));
    } else {
      const t = d.templates.invitation!;
      const route = d.method?.requiresNameApproval ? approvedNameRoute(nameRoutesWithLists(l.ex, d.invitees)) : null;
      for (const letter of j.letters) {
        const row = await tx.invitationLetter.create({
          data: {
            organisationId: l.org.id,
            windowId: w.id,
            partyId: letter.party.id,
            nameRouteId: route?.id ?? null,
            templateId: t.id,
            templateCode: t.code,
            templateBodyVersion: t.bodyVersion,
            language: letter.rendered.language!,
            fields: letter.rendered.fields as unknown as Prisma.InputJsonValue,
            renderedText: letter.rendered.text!,
            frozenAt: now,
          },
        });
        await audit(tx, toAuditActor(actor), l.org.id, ENTITY.letter, row.id, label(l, `Letter of invitation · ${letter.party.name}`), "CREATE", diffFields(null, { invitee: letter.party.name, frozenFrom: `${t.nameEn}, text version ${t.bodyVersion}`, language: letter.rendered.language === "MS" ? "Malay" : "English" }));
      }
      await tx.exerciseWindow.update({ where: { id: w.id, organisationId: actor.organisationId }, data: { advertisementDay: dayToDate(day), publishedAt: now, policySnapshot: snapshot as unknown as Prisma.InputJsonValue } });
      await audit(tx, toAuditActor(actor), l.org.id, ENTITY.window, w.id, label(l, "Invitation window"), "UPDATE", diffFields({ invitedOn: null }, { invitedOn: formatDate(day), letters: j.letters.length, rulesRecorded: "yes" }));
      await moveExercise(tx, l.ex, "INVITED", { today: l.org.today, via: "PUBLICATION", publishFaults: 0 });
      await audit(tx, toAuditActor(actor), l.org.id, "SourcingExercise", exerciseId, `${l.ex.reference} · ${l.ex.title}`, "UPDATE", diffFields({ status: l.ex.status }, { status: "INVITED" }));
    }
    const said = notes(j.result.findings.filter((f) => f.level === "warn"));
    return { ok: true, message: `${j.path === "ADVERTISED" ? "Advertised" : `Invited: ${proposedInvitees(d.parties).length} letters issued`}.${said ? ` ${said}` : ""}` };
  });
}

/**
 * Choose the evaluation model on the Window card (6.8 E-2, FR-EVL-005): an issued version, while the
 * exercise is unpublished and not cancelled. Held on the exercise until publication pins it; its route
 * against the basis's is judged with the publication, so the card and the act give the same reason.
 */
export async function chooseEvaluationModel(_prev: FormState, data: FormData): Promise<FormState> {
  const txGuard = await staffForAct("TRANSACTION");
  if (!txGuard.ok) return txGuard.state;
  const actor = txGuard.actor;
  const exerciseId = exerciseIdOf(data);
  const r = new FormReader(data);
  const modelId = r.text("evaluationModelId", "Evaluation model", { required: true });
  if (r.failed) return { ok: false, errors: r.errors };
  return inWindow(actor, exerciseId, async (tx, l, d) => {
    const row = await tx.evaluationModel.findFirst({ where: { id: modelId, organisationId: l.org.id }, select: { id: true, nameEn: true, version: true, status: true } });
    const fs = chooseFaults({ published: isPublished(l.ex.status) || l.ex.evaluationModelPinnedAt != null, cancelled: l.ex.status === "CANCELLED", model: row ? { status: row.status, name: `${row.nameEn}, version ${row.version}` } : null });
    if (fs.length) return fs[0].code === "EVALUATION_MODEL_NOT_SET" ? { ok: false, errors: { evaluationModelId: windowFindingText(fs[0]) } } : refuse(fs);
    if (l.ex.evaluationModelId === row!.id) return { ok: true };
    const before = d.evaluation.model ? `${d.evaluation.model.nameEn}, version ${d.evaluation.model.version}` : null;
    await tx.sourcingExercise.update({ where: { id: exerciseId, organisationId: actor.organisationId }, data: { evaluationModelId: row!.id } });
    await audit(tx, toAuditActor(actor), l.org.id, "SourcingExercise", exerciseId, `${l.ex.reference} · ${l.ex.title}`, "UPDATE", diffFields({ evaluationModel: before }, { evaluationModel: `${row!.nameEn}, version ${row!.version}` }));
    return { ok: true };
  });
}

/// How a letter of invitation went: recorded, never sent (INT-09 is not built).
export async function recordLetterDelivery(_prev: FormState, data: FormData): Promise<FormState> {
  const txGuard = await staffForAct("TRANSACTION");
  if (!txGuard.ok) return txGuard.state;
  const actor = txGuard.actor;
  const exerciseId = exerciseIdOf(data);
  const letterId = String(data.get("letterId") ?? "");
  const r = new FormReader(data);
  const method = r.choice("method", "Sent by", DELIVERY_METHODS) as DeliveryMethod | null;
  const consignmentRef = r.text("consignmentRef", "Consignment", { max: 120 });
  const sent = r.date("despatchedOn", "Sent on");
  const ack = r.date("acknowledgedOn", "Acknowledged on");
  if (r.failed) return { ok: false, errors: r.errors };
  return inWindow(actor, exerciseId, async (tx, l, d) => {
    const letter = d.window?.letters.find((x) => x.id === letterId);
    if (!letter) return { ok: false, message: "That letter is not on this exercise." };
    if (l.ex.status === "CANCELLED") return refuse([{ code: "EXERCISE_CANCELLED", level: "block" }]);
    const fs = deliveryFaults({ method, despatchedOn: sent ? storedDay(sent) : null, acknowledgedOn: ack ? storedDay(ack) : null }, l.org.today);
    if (fs.length) return refuse(fs, "Not recorded:");
    const after = { method, consignmentRef, despatchedOn: sent, acknowledgedOn: ack };
    await tx.invitationLetter.update({ where: { id: letter.id, organisationId: actor.organisationId }, data: after });
    await audit(tx, toAuditActor(actor), l.org.id, ENTITY.letter, letter.id, label(l, `Letter of invitation · ${letter.party.name}`), "UPDATE", diffFields(deliveryFields(letter), deliveryFields(after)));
    return { ok: true };
  });
}
