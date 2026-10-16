"use server";

import { revalidatePath } from "next/cache";

import { exerciseIsHidden } from "@/app/_auth/sulit";
import { requireStaff, staffForAct, toAuditActor } from "@/app/_auth/actor";
import { beginAct } from "@/app/_auth/act";
import type { FormState } from "@/components/record-editor";
import type { Prisma } from "@/generated/prisma/client";
import { diffFields } from "@/lib/audit/diff";
import { BID_ENTITY, statusField } from "@/lib/bids/audit-view";
import { loadRecorders, recorderKey } from "@/lib/auth/attribution-recorders";
import { lockedAtOrAfterClosing } from "@/lib/bids/box";
import { moveExercise } from "@/lib/method/move";
import { liveSaleOf, restrictionFinding, saleFinding } from "@/lib/opening/findings";
import { authorisationFields, onlineOpenedBidFields, OPENING_ENTITY } from "@/lib/opening/audit-view";
import { registerRestrictionOf } from "@/lib/opening/restriction-read";
import { authorisationsRequired, panelOf, policyOf, stateOf } from "@/lib/opening/repo";
import { blocking, type Finding } from "@/lib/opening/types";
import { authorisationFaults, unsealState } from "@/lib/opening/unseal";
import { commitUnseal, forwardShares, gatherHeldShares, loadUnsealKeys, prepareUnseal, rollDigestOf, shredExerciseReleases, shredReleases, type OpenedFindings } from "@/lib/opening/unseal-store";
import { eligibilityAtOpening } from "@/lib/suppliers/standing-repo";
import { isRestrictionReading, restrictionReadingWords } from "@/lib/suppliers/restriction-register";
import { restrictionLabel } from "@/lib/opening/labels";
import type { OnlineBidRules } from "@/lib/bids/online/types";
import { releasePlan } from "@/lib/sealing/release";
import { logCeremonyEvent } from "@/lib/sealing/store";
import { zero } from "@/lib/sealing/types";
import { logAdministratorRefusal, logSealedRefusal, officerActRate, recordIdOrNull, unlockOwnKey, unlockRefusalWords } from "@/lib/sealing/unlock-store";

import { audit, exerciseIdOf, label, Refusal } from "../window/shared";
import { GONE_OPENING, inOpening, refuse, stampNow } from "./in-opening";
import { ONLINE_PASSPHRASE_REQUIRED, ONLINE_PASSPHRASE_TOO_LONG } from "./online-words";
import { frozenRuleOf, readingJson } from "./restriction";

/**
 * The online unseal (ADR 0036 D3, D10; build plan step 13). Every named opening officer authorises, each in their own sign-in with the sign-in password asked again (step-up) and with their own
 * unseal passphrase. An officer who is not the last seals the shares they hold to each officer still to act (`ShareRelease`, kept in the database so the unseal survives a restart); the last
 * recombines the exercise key, opens the manifest of each in-time submission, checks it against its row and the roll frozen at the start, lists the bidder, creates the offer with its price NULL,
 * opens the submission and its envelope, and seals every data key to each named officer. One transaction per authorisation: an authorisation, its releases and its audit rows commit together.
 *
 * The order of what is asked, and why: the password first (a stolen session alone cannot guess a passphrase), then the pepper (a pepper this copy does not hold is not a wrong passphrase and is
 * never counted), then the key's lockout, then the unwrap, outside the transaction. A refusal is written as a REFUSED access event outside the transaction, after the session was checked.
 */

const MAX_PASSPHRASE_CHARACTERS = 1024;
const text = (data: FormData, name: string) => (typeof data.get(name) === "string" ? (data.get(name) as string) : "");

export async function authoriseOnlineUnseal(_prev: FormState, data: FormData): Promise<FormState> {
  const guard = await staffForAct("UNSEAL");
  if (!guard.ok) {
    // An administrator account does not open bids; the refusal is logged once the session is known (a refusal before it is the edge's to log).
    const who = await requireStaff();
    await logAdministratorRefusal({ organisationId: who.organisationId, accountId: who.accountId, exerciseId: exerciseIdOf(data), kind: "AUTHORISE", staffPersonId: who.personId, recordId: text(data, "openingId") });
    return guard.state;
  }
  const actor = guard.actor;
  const exerciseId = exerciseIdOf(data);
  const openingId = text(data, "openingId");
  const passphrase = text(data, "passphrase");

  // 20bb: the account's rate is counted before anything is looked up or tried.
  const limited = await officerActRate({ organisationId: actor.organisationId, accountId: actor.accountId, exerciseId, kind: "AUTHORISE", staffPersonId: actor.personId, recordId: recordIdOrNull(openingId) });
  if (limited) return { ok: false, message: limited };
  if (passphrase.length === 0) return { ok: false, errors: { passphrase: ONLINE_PASSPHRASE_REQUIRED } };
  if (passphrase.length > MAX_PASSPHRASE_CHARACTERS) return { ok: false, errors: { passphrase: ONLINE_PASSPHRASE_TOO_LONG } };

  // The sign-in password, asked again. A wrong one counts towards the sign-in lockout and is written on its own.
  const begun = await beginAct(actor, data, "OpeningAuthorisation.person", { personField: "personId", onBehalf: false, document: { entity: "Opening", id: openingId } });
  if (!begun.ok) {
    await logSealedRefusal({ organisationId: actor.organisationId, exerciseId, kind: "AUTHORISE", staffPersonId: actor.personId, reasonCode: "STEP_UP_REFUSED", recordId: recordIdOrNull(openingId) });
    return begun.state;
  }
  const act = begun.act;
  const now = stampNow();

  // A restricted exercise the officer may not see reads as one that is not there, before any passphrase is derived or counted (FR-MTD-007).
  if (await exerciseIsHidden(actor, exerciseId)) return GONE_OPENING;
  const unlocked = await unlockOwnKey({ organisationId: actor.organisationId, exerciseId, personId: actor.personId, passphrase, kind: "AUTHORISE", now, recordId: recordIdOrNull(openingId) });
  if (!unlocked.ok) return { ok: false, message: unlockRefusalWords(unlocked) };
  const refusal = { code: null as string | null };
  try {
    const out = await inOpening(actor, exerciseId, now, async (tx, l, c) => {
      const stop = (fs: readonly Finding[], code: string): FormState => {
        refusal.code = code;
        return refuse(fs);
      };
      const o = c.openings.find((x) => x.id === openingId) ?? null;
      if (!o) {
        refusal.code = "NOT_FOUND";
        return GONE_OPENING;
      }
      if (l.ex.submissionChannel !== "ONLINE") return stop([{ code: "NOT_ONLINE", level: "block" }], "NOT_ONLINE");
      const state = stateOf(o, l.ex.status);
      const keysRead = await loadUnsealKeys(tx, l.org.id, l.ex.id);
      if (!keysRead.ok) {
        // The split can no longer be used (the officers changed since the key was made): the shares already forwarded are shredded with the refusal.
        if (keysRead.fault === "KEY_OFFICERS_MISMATCH") await shredExerciseReleases(tx, { organisationId: l.org.id, exerciseId: l.ex.id, now });
        return stop([{ code: keysRead.fault, level: "block" }], keysRead.fault);
      }
      const keys = keysRead.keys;
      const me = keys.officers.find((x) => x.personId === actor.personId);
      if (!me) return stop([{ code: "NOT_NAMED_OFFICER", level: "block" }], "NOT_NAMED_OFFICER");
      // The key unlocked is the live one: the officer may have set a new share between the unlock and the lock this transaction holds.
      if (me.officerKeyId !== unlocked.officerKeyId) return stop([{ code: "OFFICER_KEY_CHANGED", level: "block" }], "OFFICER_KEY_CHANGED");
      const panelPeople = new Set(o.panel.map((p) => p.personId));
      if (panelPeople.size !== keys.officers.length || keys.officers.some((x) => !panelPeople.has(x.personId))) return stop([{ code: "NOT_ON_PANEL_ONLINE", level: "block" }], "NOT_ON_PANEL_ONLINE");
      const required = authorisationsRequired(o);

      const keyedBy = await loadRecorders(tx, l.org.id, [{ entity: "OpeningAuthorisation", slot: "person", ids: o.authorisations.map((a) => a.id) }]);
      const auths = o.authorisations.map((a) => ({ ...a, recordedByPersonId: keyedBy.get(recorderKey({ entity: "OpeningAuthorisation", slot: "person", id: a.id })) ?? null }));
      const fs = authorisationFaults({ state, panel: panelOf(o), auths, personId: actor.personId, recorderId: act.recorderId, now, closing: l.ex.closingAt, boxLocked: lockedAtOrAfterClosing(c.events, l.ex.closingAt), online: true, required });
      if (blocking(fs).length) return stop(fs, fs[0].code);
      const roll = (o.kind === "MAIN" ? o : c.main)?.receiptRoll ?? null;
      if (!state.unsealed && roll === null) return stop([{ code: "ROLL_NOT_FROZEN", level: "block" }], "ROLL_NOT_FROZEN");

      const seat = o.panel.find((p) => p.personId === actor.personId) ?? null;
      const person = { name: actor.personName };
      const row = await tx.openingAuthorisation.create({ data: { organisationId: l.org.id, openingId: o.id, personId: actor.personId, panelMemberId: seat?.id ?? null, sittingNo: state.sittingNo, recordedAt: now } });
      const after = unsealState(state.sittingNo, [...o.authorisations, { personId: actor.personId, sittingNo: state.sittingNo, recordedAt: now, lapsedAt: null }], panelOf(o), required);
      const opens = !state.unsealed && after.count === required;
      await act.write(tx, row.id, { document: { entity: "Opening", id: o.id } });
      await audit(tx, toAuditActor(actor), l.org.id, OPENING_ENTITY.authorisation, row.id, label(l, o.kind === "MAIN" ? "Opening" : `Supplementary opening ${o.sequenceNo - 1}`), "CREATE", diffFields(null, authorisationFields({ person: person.name, at: now, sittingNo: state.sittingNo, opensTheBox: opens, seat: seat?.seatLabelSnapshot ?? null }, l.org.timeZone)));
      await logCeremonyEvent(tx, { organisationId: l.org.id, exerciseId: l.ex.id, kind: "AUTHORISE", staffPersonId: actor.personId, recordId: row.id, at: now });

      // A resumed sitting, after the unseal: the officer has proved their passphrase and nothing is opened again, so no share is forwarded.
      if (state.unsealed) return { ok: true, message: after.state === "AUTHORISED" ? "Recorded. The sitting is authorised: the opening may continue." : `Recorded. ${required - after.count} of the ${required} named officers have still to authorise this sitting.` };

      const gathered = await gatherHeldShares(tx, { organisationId: l.org.id, exerciseId: l.ex.id, openingId: o.id, sittingNo: state.sittingNo, keys, officerKeyId: me.officerKeyId, privateKey: unlocked.privateKey });
      if (!gathered.ok) throw new Refusal(stop([{ code: gathered.fault, level: "block" }], gathered.fault));
      try {
        const authorisedRows = auths.filter((a) => a.sittingNo === state.sittingNo && a.lapsedAt == null).map((a) => keys.officers.find((x) => x.personId === a.personId)?.rosterRowId).filter((x): x is string => !!x);
        const plan = releasePlan({ namedOfficerRowIds: keys.officers.map((x) => x.rosterRowId), authorisedRowIds: authorisedRows, actorRowId: me.rosterRowId });
        if (!plan.last) {
          const forwarded = await forwardShares(tx, { organisationId: l.org.id, exerciseId: l.ex.id, openingId: o.id, authorisationId: row.id, keys, fromOfficerKeyId: me.officerKeyId, held: gathered.held, to: plan.forwardTo, now });
          await shredReleases(tx, { organisationId: l.org.id, openingId: o.id, ids: gathered.incoming, as: "used", now });
          await audit(tx, toAuditActor(actor), l.org.id, "ShareRelease", row.id, label(l, "Shares forwarded"), "CREATE", diffFields(null, { forwardedTo: `${forwarded} officer${forwarded === 1 ? "" : "s"} still to authorise` }));
          return { ok: true, message: `Recorded. ${plan.forwardTo.length} of the ${required} named officers have still to authorise before the bids are unsealed. Every named officer is needed.` };
        }

        // The last authorisation. Everything is read and checked before anything is written.
        const snap = policyOf(o.policySnapshot);
        const salePartyIds = new Set(c.sales.filter((s) => !s.voided).map((s) => s.partyId));
        const prepared = await prepareUnseal(tx, {
          organisationId: l.org.id, exerciseId: l.ex.id,
          opening: { kind: o.kind, id: o.id, admissionEnvelopeId: o.admissionDecision?.bidEnvelopeId ?? null },
          roll, keys, held: gathered.held, rules: (l.ex.onlineBidRules as OnlineBidRules | null) ?? null,
          parties: c.parties.map((p) => ({ id: p.id, name: p.name, vendorId: p.vendorId })), salePartyIds,
        });
        if (!prepared.ok) {
          const findings: Finding[] = prepared.faults.map((f) => ({ code: f.fault, level: "block", ...(f.sequence !== undefined ? { data: { sequence: f.sequence } } : {}) }));
          throw new Refusal(stop(findings, prepared.faults[0].fault));
        }

        // Order matters (PA022, PA021): the unseal first, so a submission may move to OPENED in this transaction; then the offers, with no price.
        await tx.opening.update({ where: { id: o.id, organisationId: actor.organisationId }, data: { unsealedAt: now } });
        const findingsFor = async (partyId: string): Promise<OpenedFindings> => {
          const party = c.parties.find((p) => p.id === partyId)!;
          const sale = saleFinding(partyId, c.sales, snap.path, c.invitedPartyIds);
          const liveSale = liveSaleOf(partyId, c.sales);
          const fromRegister = snap.restrictedTender === true && liveSale?.purchaseSupplierId ? await registerRestrictionOf(tx, l.org, { day: c.closingDay, at: l.ex.closingAt }, liveSale.purchaseSupplierId, now, frozenRuleOf(o.bids)) : null;
          if (fromRegister && "fault" in fromRegister) {
            refusal.code = "RESTRICTION_FAULT";
            throw new Refusal(refuse([fromRegister.fault]));
          }
          const restriction = fromRegister ?? restrictionFinding(snap.restrictedTender, liveSale, c.closingDay);
          if ("fault" in restriction) {
            refusal.code = "RESTRICTION_FAULT";
            throw new Refusal(refuse([restriction.fault]));
          }
          const eligibility = party.vendorId ? await eligibilityAtOpening(tx, l.org, party.vendorId, l.ex.id) : null;
          return {
            saleFinding: sale, restrictionFinding: restriction.finding,
            restrictionReading: fromRegister && "reading" in fromRegister ? readingJson(fromRegister.reading) : null,
            eligibility: eligibility ? (eligibility as unknown as Prisma.InputJsonValue) : null,
          };
        };
        const records = await commitUnseal(tx, { organisationId: l.org.id, exerciseId: l.ex.id, openingId: o.id, plan: prepared.plan, now, existingListingNos: c.openings.flatMap((x) => x.bids.map((b) => b.listingNo)), alternativesPermitted: snap.alternativesPermitted, findingsFor });
        await shredReleases(tx, { organisationId: l.org.id, openingId: o.id, as: "used", now });

        await audit(tx, toAuditActor(actor), l.org.id, OPENING_ENTITY.opening, o.id, label(l, o.kind === "MAIN" ? "Opening" : `Supplementary opening ${o.sequenceNo - 1}`), "UPDATE", diffFields({ unsealed: null, bidsOpened: null, bidsWaiting: null, listDigest: null, grantsMade: null }, { unsealed: authorisationFields({ person: person.name, at: now, sittingNo: state.sittingNo, opensTheBox: true }, l.org.timeZone).at, bidsOpened: records.length, bidsWaiting: prepared.plan.waiting, listDigest: rollDigestOf(roll), grantsMade: grantsWords(prepared.plan, keys.officers.length) }));
        for (const r of records) {
          const planned = prepared.plan.open.find((b) => b.onlineBidId === r.onlineBidId)!;
          const env = c.envelopes.find((e) => e.id === planned.envelopeId)!;
          // The same trail paper writes for the same change: the envelope RECEIVED to OPENED with its bidder (masked for anyone but the named officers until finalising, 20c), and the submission's own move.
          await audit(tx, toAuditActor(actor), l.org.id, BID_ENTITY.envelope, env.id, label(l, `Envelope ${env.sequence}`), "UPDATE", diffFields({ ...statusField("RECEIVED"), bidder: null }, { ...statusField("OPENED"), bidder: r.partyName }));
          await audit(tx, toAuditActor(actor), l.org.id, "OnlineBid", r.onlineBidId, label(l, "online submission opened"), "UPDATE", diffFields({ status: "Standing" }, { status: "Opened" }));
          await audit(tx, toAuditActor(actor), l.org.id, OPENING_ENTITY.bid, r.openedBidId, label(l, `Offer ${r.listingNo}`), "CREATE",
            diffFields(null, { ...onlineOpenedBidFields({ listingNo: r.listingNo, envelope: `Envelope ${env.sequence}`, bidder: r.partyName, alternative: r.alternativeStatus, parentListingNo: r.parentListingNo, sale: r.findings.saleFinding, restriction: r.findings.restrictionFinding, at: now }, l.org.timeZone), ...(isRestrictionReading(r.findings.restrictionReading) ? { restriction: restrictionLabel(r.findings.restrictionFinding, r.findings.restrictionReading), restrictionReading: restrictionReadingWords(r.findings.restrictionReading) } : {}) }));
        }
        if (o.kind === "MAIN") {
          await moveExercise(tx, l.ex, "OPENING_IN_PROGRESS", { today: l.org.today, via: "UNSEAL", authorisations: after.count });
          await audit(tx, toAuditActor(actor), l.org.id, "SourcingExercise", l.ex.id, `${l.ex.reference} · ${l.ex.title}`, "UPDATE", diffFields({ status: l.ex.status }, { status: "OPENING_IN_PROGRESS" }));
        }
        const late = prepared.plan.waiting;
        return { ok: true, message: `Recorded. Every named officer has authorised: the bids are unsealed and ${records.length} ${records.length === 1 ? "was" : "were"} opened.${late ? ` ${late} received after the closing ${late === 1 ? "waits" : "wait"} for the committee and a supplementary opening.` : ""} Each price is read when the opening is finalised.` };
      } finally {
        for (const h of gathered.held) zero(h.share);
      }
    });
    if (out.ok) {
      revalidatePath(`/sourcing/${exerciseId}`);
      revalidatePath("/sourcing");
    } else if (refusal.code) await logSealedRefusal({ organisationId: actor.organisationId, exerciseId, kind: "AUTHORISE", staffPersonId: actor.personId, reasonCode: refusal.code, recordId: recordIdOrNull(openingId) });
    return out;
  } finally {
    zero(unlocked.privateKey);
  }
}

/// The grants the unseal sealed to each officer, in words for the opening's audit row: a count, never a key or a record id.
function grantsWords(plan: { open: { grants: unknown[] }[]; estimateGrants: unknown[] }, officers: number): string {
  const total = plan.open.reduce((n, b) => n + b.grants.length, 0) + plan.estimateGrants.length;
  return officers > 0 ? `${total / officers} for each of ${officers} officers (${total} in all)` : `${total} in all`;
}
