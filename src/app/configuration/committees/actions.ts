"use server";

import { revalidatePath } from "next/cache";
import { END_DAY_LABEL } from "@/lib/effective-text";

import type { FormState } from "@/components/record-editor";
import { auditedCreate, auditedUpdate, writeAudit } from "@/lib/audit/record";
import { diffFields } from "@/lib/audit/diff";
import { committeePanelFaults, committeePanelToSave, OPENING_CONFIG_FAULT_TEXT, type CommitteePanelDraft } from "@/lib/opening/config";
import { db } from "@/lib/db";
import { isLoopKey } from "@/lib/evaluation/loop";
import { periodsOverlap } from "@/lib/effective";
import { compareAmounts } from "@/lib/money";
import { checkPeriod, FormReader } from "@/lib/validate";
import { checkAlternateLink } from "@/lib/committee/sitting";
import { inProgressSittingRefusal } from "@/lib/committee/sittings";
import { requireStaff, toAuditActor } from "@/app/_auth/actor";
import type { OrgScope } from "@/lib/org-scope";

const PROVENANCE = ["STATED", "OBSERVED", "ASSUMED"] as const;
const ACTIONS = ["APPROVES", "RECOMMENDS", "CONSENTS", "DECIDES"] as const;
const POSITIONS = ["CHAIRMAN", "DEPUTY_CHAIRMAN", "MEMBER", "SECRETARY"] as const;
const VOTING_RULES = ["SIMPLE_MAJORITY", "UNANIMOUS"] as const;
const KINDS = ["LOOP", "TERMINAL"] as const;
const PATH = "/configuration/committees";

async function organisationId(scope: OrgScope): Promise<string | null> {
  const org = await db.organisation.findUnique({
    where: { id: scope.organisationId },
    select: { id: true },
  });
  return org?.id ?? null;
}

const NO_ORG: FormState = {
  ok: false,
  message: "No organisation is configured. Run npm run setup before adding records.",
};

export async function saveCommittee(_prev: FormState, data: FormData): Promise<FormState> {
  const actor = await requireStaff();
  const orgId = await organisationId(actor);
  if (!orgId) return NO_ORG;

  const id = String(data.get("id") ?? "");
  const existing = await db.committee.findMany({
    where: { organisationId: orgId },
    select: { id: true, code: true },
  });
  const current = id ? existing.find((e) => e.id === id) : undefined;
  if (id && !current) return { ok: false, message: "That committee no longer exists." };

  const r = new FormReader(data);
  // The code is set once and never edited: records elsewhere join on it. The edit
  // drawer does not offer it, so it is read from the stored record — the form has no
  // such field, and writing its absence would blank the thing everything points at.
  const code = current
    ? current.code
    : r.code("code", "Code", { taken: existing.map((e) => e.code) });

  // Null quorum means nobody has set one. That is not a quorum of zero, and
  // assessQuorum will not certify a sitting under it — so the field stays optional
  // and its provenance is only asked for once a number exists.
  const quorum = r.int("quorum", "Quorum", { min: 1 });
  const quorumProvenance = r.optionalText("quorumProvenance");
  if (quorum != null && !quorumProvenance) {
    r.reject("quorumProvenance", "Say where the quorum came from, or leave the quorum unset.");
  }

  // The Secretariat is an office the organisation holds, checked here rather than
  // trusted from the form: an unknown code would refuse every tabling later with no
  // clue why. Unset is allowed and means tabling is refused until one is chosen.
  const secretariatRoleCode = r.optionalText("secretariatRoleCode");
  if (secretariatRoleCode) {
    const office = await db.authorityRole.findFirst({
      where: { organisationId: orgId, code: secretariatRoleCode },
      select: { id: true },
    });
    if (!office) r.reject("secretariatRoleCode", "That office is not one of the organisation's offices.");
  }

  // Unset means no rule has been written down, and no matter can be decided under
  // it. A rule, once set, says where it came from.
  const votingRule = r.choice("votingRule", "Voting rule", VOTING_RULES);
  const votingRuleProvenance = r.choice("votingRuleProvenance", "Where the voting rule came from", PROVENANCE);
  if (votingRule && !votingRuleProvenance) {
    r.reject("votingRuleProvenance", "Say where the voting rule came from, or leave the rule unset.");
  }

  // Whether an alternate may vote in place of a recused member: RSAJ policy, shipped
  // unset. Only "no" can be chosen today: "yes" needs a per-matter stand-in while the
  // holder is present, which is not built, and a half-built "yes" would let a
  // recused holder decide by attending whether their seat votes.
  const altRaw = r.optionalText("alternateMayVoteForRecused");
  const alternateMayVoteForRecused = altRaw === "no" ? false : null;
  if (altRaw === "yes") {
    r.reject(
      "alternateMayVoteForRecused",
      "Not available yet: an alternate voting for a recused member who is present needs a per-matter stand-in, which is not built.",
    );
  } else if (altRaw && altRaw !== "no") {
    r.reject("alternateMayVoteForRecused", "Not one of the available options.");
  }
  const alternateMayVoteForRecusedProvenance = r.choice(
    "alternateMayVoteForRecusedProvenance",
    "Where this came from",
    PROVENANCE,
  );
  if (alternateMayVoteForRecused != null && !alternateMayVoteForRecusedProvenance) {
    r.reject("alternateMayVoteForRecusedProvenance", "Say where this came from, or leave it unset.");
  }

  const aliases = [
    ...new Set(
      String(data.get("aliases") ?? "")
        .split("\n")
        .map((a) => a.trim())
        .filter(Boolean),
    ),
  ];
  const retiredOn = r.date("retiredOn", "Retired on");

  const valueScopeMin = r.money("valueScopeMin", "Value scope from");
  const valueScopeMax = r.money("valueScopeMax", "Value scope to");
  if (valueScopeMin && valueScopeMax && compareAmounts(valueScopeMax, valueScopeMin) <= 0) {
    r.reject("valueScopeMax", "The upper bound must be above the lower.");
  }

  const v = {
    code,
    nameEn: r.text("nameEn", "Name", { required: true, max: 160 }),
    nameMs: r.optionalText("nameMs"),
    mandate: r.text("mandate", "Mandate", { required: true, max: 600 }),
    governingSource: r.text("governingSource", "Source", { required: true, max: 240 }),
    action: r.choice("action", "Acts by", ACTIONS, { required: true }),
    isExternal: r.bool("isExternal"),
    quorum,
    quorumProvenance: quorum == null ? null : (quorumProvenance as "STATED" | null),
    compositionProvenance: r.optionalText("compositionProvenance") as "STATED" | null,
    valueScopeMin,
    valueScopeMax,
    notes: r.text("notes", "Notes", { max: 2000 }),
    aliases,
    retiredOn,
    secretariatRoleCode,
    votingRule,
    votingRuleProvenance: votingRule ? votingRuleProvenance : null,
    alternateMayVoteForRecused,
    alternateMayVoteForRecusedProvenance: alternateMayVoteForRecused == null ? null : alternateMayVoteForRecusedProvenance,
    // What this body calls a carried decision (ruling CO-2: an RSAJ committee would say
    // "Perlu"). Unset reads "Carried", never a borrowed word.
    carriedLabelEn: r.optionalText("carriedLabelEn"),
    carriedLabelMs: r.optionalText("carriedLabelMs"),
  };

  const parsed = r.finish(v);
  if (!parsed.ok) return { ok: false, errors: parsed.errors };

  const ctx = {
    actor: toAuditActor(actor),
    organisationId: orgId,
    entity: "Committee",
    entityLabel: v.nameEn,
    reason: String(data.get("reason") ?? ""),
  };
  const write = { ...v, action: v.action! };

  if (!id) {
    await auditedCreate(ctx, v, (tx) =>
      tx.committee.create({ data: { organisationId: orgId, ...write } }),
    );
  } else {
    const before = await db.committee.findUnique({ where: { id, organisationId: actor.organisationId } });
    if (!before) return { ok: false, message: "That committee no longer exists." };
    await auditedUpdate(
      { ...ctx, entityId: id },
      {
        ...before,
        valueScopeMin: before.valueScopeMin?.toString() ?? null,
        valueScopeMax: before.valueScopeMax?.toString() ?? null,
      },
      v,
      (tx) => tx.committee.update({ where: { id, organisationId: actor.organisationId }, data: write }),
    );
  }

  revalidatePath(PATH);
  return { ok: true };
}

/**
 * A seat on a committee.
 *
 * Held one of two ways and exactly one must be set: ex officio by whoever holds an
 * office, or by named appointment. A seat with neither cannot resolve to anybody at
 * the sitting; a seat with both is two different rules for the same chair.
 */
export async function saveMember(_prev: FormState, data: FormData): Promise<FormState> {
  const actor = await requireStaff();
  const orgId = await organisationId(actor);
  if (!orgId) return NO_ORG;

  const id = String(data.get("id") ?? "");
  const committeeId = String(data.get("committeeId") ?? "");

  const r = new FormReader(data);
  const personId = r.optionalText("personId");
  const seatRoleCode = r.optionalText("seatRoleCode");
  const seatLabel = r.optionalText("seatLabel");

  if (!personId && !seatRoleCode) {
    r.reject(
      "seatRoleCode",
      "A seat is held either by an office or by a named person. Choose one.",
    );
  }
  if (personId && seatRoleCode) {
    r.reject(
      "seatRoleCode",
      "A seat cannot be both ex officio and a named appointment. Clear one of them.",
    );
  }

  const effectiveFrom = r.date("effectiveFrom", "Held from", { required: true });
  const effectiveTo = r.date("effectiveTo", END_DAY_LABEL);
  checkPeriod(r, effectiveFrom, effectiveTo);

  const position = r.choice("position", "Position", POSITIONS, { required: true });
  const isAlternate = r.bool("isAlternate");
  // An alternate may be tied to the seat it covers. Left empty, it covers any seat of
  // its position. Only an alternate carries the link, and only to a seat of the same
  // committee that is not itself an alternate.
  const alternateForId = isAlternate ? r.optionalText("alternateForId") : null;
  if (alternateForId) {
    const target = await db.committeeMember.findFirst({
      where: { id: alternateForId, committeeId, committee: { organisationId: actor.organisationId } },
      select: { id: true, position: true, isAlternate: true },
    });
    const link = checkAlternateLink({ selfId: id || null, target });
    if (!link.ok) {
      r.reject(
        "alternateForId",
        {
          NOT_A_SEAT_OF_THIS_COMMITTEE: "That seat is not a seat of this committee.",
          CHAIR_HAS_NO_ALTERNATE: "Nobody stands in for the chairman, so the chair has no alternate.",
          OWN_ALTERNATE: "A seat cannot be its own alternate.",
        }[link.fault],
      );
    }
  }

  // One chairman at a time. Two would make the minute unsignable.
  if (position === "CHAIRMAN" && !isAlternate && effectiveFrom && !r.failed) {
    const siblings = await db.committeeMember.findMany({
      where: { committeeId, position: "CHAIRMAN", isAlternate: false, ...(id ? { NOT: { id } } : {}) },
    });
    const clash = siblings.find((s) => periodsOverlap(s, { effectiveFrom, effectiveTo }));
    if (clash) {
      r.reject("position", "This committee already has a chairman over part of that period.");
    }
  }

  const v = {
    committeeId,
    personId,
    seatRoleCode,
    seatLabel,
    position: position ?? "MEMBER",
    isAlternate,
    alternateForId,
    provenance: r.choice("provenance", "Provenance", PROVENANCE, { required: true }),
    appointmentRef: r.optionalText("appointmentRef"),
    effectiveFrom: effectiveFrom ?? new Date(),
    effectiveTo,
  };

  const parsed = r.finish(v);
  if (!parsed.ok) return { ok: false, errors: parsed.errors };

  const committee = await db.committee.findFirst({
    where: { id: committeeId, organisationId: orgId },
    select: { code: true, nameEn: true },
  });
  if (!committee) return { ok: false, message: "That committee no longer exists." };

  const write = { ...v, position: v.position, provenance: v.provenance! };

  // A seat whose period covers a sitting in progress may not move who sits there in a
  // way that voids a recorded vote or a decided matter (send-back 9.4).
  const sitting = await inProgressSittingRefusal(actor, {
    committeeIds: [committeeId],
    seats: (_c, seats) => {
      const next = { ...write, id: id || "proposed-seat" };
      return id ? seats.map((x) => (x.id === id ? { ...x, ...next } : x)) : [...seats, next];
    },
  });
  if (sitting) return { ok: false, message: sitting };

  const ctx = {
    actor: toAuditActor(actor),
    organisationId: orgId,
    entity: "CommitteeMember",
    entityLabel: `${committee.nameEn} seat`,
    reason: String(data.get("reason") ?? ""),
  };

  if (!id) {
    await auditedCreate(ctx, v, (tx) => tx.committeeMember.create({ data: write }));
  } else {
    const before = await db.committeeMember.findUnique({ where: { id, committee: { organisationId: actor.organisationId } } });
    if (!before) return { ok: false, message: "That seat no longer exists." };
    await auditedUpdate({ ...ctx, entityId: id }, before, v, (tx) =>
      tx.committeeMember.update({ where: { id, committee: { organisationId: actor.organisationId } }, data: write }),
    );
  }

  revalidatePath(PATH);
  revalidatePath(`${PATH}/${committee.code}`);
  return { ok: true };
}

/// Vacating a seat ends its period. Votes already cast from it must keep resolving.
export async function vacateSeat(_prev: FormState, data: FormData): Promise<FormState> {
  const actor = await requireStaff();
  const orgId = await organisationId(actor);
  if (!orgId) return NO_ORG;

  const id = String(data.get("id") ?? "");
  const reason = String(data.get("reason") ?? "").trim();
  if (!reason) return { ok: false, errors: { reason: "A reason is required." } };

  const before = await db.committeeMember.findUnique({
    where: { id, committee: { organisationId: actor.organisationId } },
    include: { committee: { select: { code: true, nameEn: true } } },
  });
  if (!before) return { ok: false, message: "That seat no longer exists." };
  if (before.effectiveTo) return { ok: false, message: "That seat is already vacated." };

  const effectiveTo = new Date();
  const sitting = await inProgressSittingRefusal(actor, {
    committeeIds: [before.committeeId],
    seats: (_c, seats) => seats.map((x) => (x.id === id ? { ...x, effectiveTo } : x)),
  });
  if (sitting) return { ok: false, message: sitting };
  await auditedUpdate(
    {
      actor: toAuditActor(actor),
      organisationId: orgId,
      entity: "CommitteeMember",
      entityId: id,
      entityLabel: `${before.committee.nameEn} seat`,
      reason,
    },
    { effectiveTo: null },
    { effectiveTo },
    (tx) => tx.committeeMember.update({ where: { id, committee: { organisationId: actor.organisationId } }, data: { effectiveTo } }),
  );

  revalidatePath(PATH);
  revalidatePath(`${PATH}/${before.committee.code}`);
  return { ok: true };
}

// ------------------------------------------------------ not-approved outcomes

/**
 * What a matter not carried does next, as the organisation's policy names it.
 *
 * None is shipped (ruling 5.5): they are one customer's options, not a product
 * default. Until one is configured a matter voted down cannot be recorded.
 */
export async function saveNotApprovedOutcome(_prev: FormState, data: FormData): Promise<FormState> {
  const actor = await requireStaff();
  const orgId = await organisationId(actor);
  if (!orgId) return NO_ORG;

  const id = String(data.get("id") ?? "");
  const existing = await db.notApprovedOutcome.findMany({
    where: { organisationId: orgId },
    select: { id: true, code: true, returnsToStage: true },
  });
  const current = id ? existing.find((e) => e.id === id) : undefined;
  if (id && !current) return { ok: false, message: "That outcome no longer exists." };

  const r = new FormReader(data);
  const code = current
    ? current.code
    : r.code("code", "Code", { taken: existing.map((e) => e.code) });
  const kind = r.choice("kind", "What it does", KINDS, { required: true });
  const returnsToStage = kind === "LOOP" ? r.optionalText("returnsToStage") : null;
  // 6.8 (E-8): one of the evaluation's stages; a stage typed before them is kept only as it was.
  if (returnsToStage && !isLoopKey(returnsToStage) && returnsToStage !== current?.returnsToStage) r.reject("returnsToStage", "Choose one of the evaluation's stages.");
  const committeeId = r.optionalText("committeeId");
  if (committeeId) {
    const c = await db.committee.findFirst({ where: { id: committeeId, organisationId: orgId }, select: { id: true } });
    if (!c) r.reject("committeeId", "That committee no longer exists.");
  }

  const v = {
    code,
    nameEn: r.text("nameEn", "Name", { required: true, max: 160 }),
    nameMs: r.optionalText("nameMs"),
    kind,
    returnsToStage,
    committeeId,
    governingSource: r.text("governingSource", "Source", { max: 240 }),
    provenance: r.choice("provenance", "Provenance", PROVENANCE, { required: true }),
    sortOrder: r.int("sortOrder", "Order", { min: 0 }) ?? 0,
  };
  const parsed = r.finish(v);
  if (!parsed.ok) return { ok: false, errors: parsed.errors };

  const write = { ...v, kind: v.kind!, provenance: v.provenance! };
  const ctx = {
    actor: toAuditActor(actor),
    organisationId: orgId,
    entity: "NotApprovedOutcome",
    entityLabel: v.nameEn,
    reason: String(data.get("reason") ?? ""),
  };
  if (!id) {
    await auditedCreate(ctx, v, (tx) => tx.notApprovedOutcome.create({ data: { organisationId: orgId, ...write } }));
  } else {
    const before = await db.notApprovedOutcome.findUnique({
      where: { id, organisationId: actor.organisationId },
      include: { _count: { select: { decisions: true } } },
    });
    if (!before) return { ok: false, message: "That outcome no longer exists." };
    // A decision cites it: changing it would rewrite what was recorded. Retire it and
    // add a new one instead.
    if (before._count.decisions > 0) {
      return {
        ok: false,
        message: `This outcome has been used by ${before._count.decisions} recorded ${before._count.decisions === 1 ? "decision" : "decisions"}, so it cannot be changed. Retire it and add a new one.`,
      };
    }
    const { _count: _unused, ...row } = before;
    void _unused;
    await auditedUpdate({ ...ctx, entityId: id }, row, v, (tx) =>
      tx.notApprovedOutcome.update({ where: { id, organisationId: actor.organisationId }, data: write }),
    );
  }
  revalidatePath(PATH);
  return { ok: true };
}

/// Retire an outcome. Decisions already recorded against it keep citing it.
export async function retireNotApprovedOutcome(_prev: FormState, data: FormData): Promise<FormState> {
  const actor = await requireStaff();
  const orgId = await organisationId(actor);
  if (!orgId) return NO_ORG;
  const id = String(data.get("id") ?? "");
  const reason = String(data.get("reason") ?? "").trim();
  if (!reason) return { ok: false, errors: { reason: "A reason is required." } };

  const before = await db.notApprovedOutcome.findFirst({ where: { id, organisationId: orgId } });
  if (!before) return { ok: false, message: "That outcome no longer exists." };
  if (before.retiredOn) return { ok: false, message: "That outcome is already retired." };

  const retiredOn = new Date();
  await auditedUpdate(
    { actor: toAuditActor(actor), organisationId: orgId, entity: "NotApprovedOutcome", entityId: id, entityLabel: before.nameEn, reason },
    { retiredOn: null },
    { retiredOn },
    (tx) => tx.notApprovedOutcome.update({ where: { id, organisationId: actor.organisationId }, data: { retiredOn } }),
  );
  revalidatePath(PATH);
  return { ok: true };
}

const provWords = (p: string | null) => (p === "STATED" ? "Stated" : p === "OBSERVED" ? "Observed" : p === "ASSUMED" ? "Assumed" : null);

/**
 * A committee's opening panel (6.7 FR-OPN-002, FR-CTE-011, C-6): how many members an opening panel
 * of this body has, and whether it excludes the members of one unit. Each may be left not set: an
 * unset size blocks starting an opening with this committee; an unset independence rule lets a panel
 * be assigned with the warning "panel not checked", frozen on the opening. Its own action and its own
 * drawer, so a change asks for a reason without touching the committee's other settings. Locks the
 * committee's row, judges the draft (`committeePanelFaults`) and writes with its audit row.
 */
export async function saveCommitteePanel(_prev: FormState, data: FormData): Promise<FormState> {
  const actor = await requireStaff();
  const orgId = await organisationId(actor);
  if (!orgId) return NO_ORG;
  const id = String(data.get("id") ?? "");
  const r = new FormReader(data);
  const exclusion = r.choice("panelExclusionRule", "An opening panel excludes a unit", ["yes", "no"] as const);
  const draft: CommitteePanelDraft = {
    panelSize: r.int("panelSize", "Members on an opening panel", { min: 1 }),
    panelSizeProvenance: r.choice("panelSizeProvenance", "Where this came from", PROVENANCE),
    panelExclusionRule: exclusion === "yes" ? true : exclusion === "no" ? false : null,
    panelExcludesUnitCode: r.optionalText("panelExcludesUnitCode"),
    panelExclusionProvenance: r.choice("panelExclusionProvenance", "Where this came from", PROVENANCE),
  };
  if (r.failed) return { ok: false, errors: r.errors };
  const reason = String(data.get("reason") ?? "");
  return db.$transaction(async (tx): Promise<FormState> => {
    await tx.$queryRaw`SELECT id FROM "Committee" WHERE id = ${id} FOR UPDATE`;
    const before = await tx.committee.findFirst({ where: { id, organisationId: orgId }, select: { nameEn: true, panelSize: true, panelSizeProvenance: true, panelExclusionRule: true, panelExcludesUnitCode: true, panelExclusionProvenance: true } });
    if (!before) return { ok: false, message: "That committee no longer exists." };
    const units = await tx.orgUnit.findMany({ where: { organisationId: orgId }, select: { code: true, nameEn: true } });
    const v = committeePanelToSave(draft);
    const { nameEn, ...was } = before;
    const changed = (Object.keys(v) as (keyof typeof v)[]).some((k) => v[k] !== was[k]);
    const faults = committeePanelFaults(draft, { units: units.map((u) => u.code) }, reason, changed);
    if (faults.length) return { ok: false, errors: Object.fromEntries(faults.map((f) => [f.field, OPENING_CONFIG_FAULT_TEXT[f.code]])) };
    if (!changed) return { ok: true };
    await tx.committee.update({ where: { id, organisationId: actor.organisationId }, data: v });
    // Codes never reach History: the unit by its name.
    const words = (c: typeof v) => ({
      openingPanelMembers: c.panelSize ?? "Not set",
      openingPanelMembersFrom: c.panelSize == null ? null : provWords(c.panelSizeProvenance),
      openingPanelExcludes: c.panelExclusionRule == null ? "Not set" : c.panelExclusionRule ? (units.find((u) => u.code === c.panelExcludesUnitCode)?.nameEn ?? "A unit no longer in the structure") : "No unit",
      openingPanelExclusionFrom: c.panelExclusionRule == null ? null : provWords(c.panelExclusionProvenance),
    });
    await writeAudit(tx, { actor: toAuditActor(actor), organisationId: orgId, entity: "Committee", entityId: id, entityLabel: nameEn, reason }, "UPDATE", diffFields(words(was), words(v)));
    revalidatePath(PATH);
    revalidatePath(`${PATH}/[code]`, "page");
    return { ok: true };
  });
}
