"use server";

import { revalidatePath } from "next/cache";

import { attributionRefusalState, beginAct } from "@/app/_auth/act";
import { staffForAct } from "@/app/_auth/actor";
import type { FormState } from "@/components/record-editor";
import type { StaffActor } from "@/lib/auth/types";
import { toSecond } from "@/lib/bids/lateness";
import { actStatusFault, actStatusText } from "@/lib/contract/act-status";
import { withLockedContract } from "@/lib/contract/repo";
import type { ContractStatus } from "@/lib/contract/types";
import { dayOf, instantAt } from "@/lib/dates";
import { kickOffRefusalText } from "@/lib/project-docs/kick-off";
import { changeMeeting, recordMeetingHeld, scheduleMeeting, type Arrangement } from "@/lib/project-docs/kick-off-store";
import { pinConflictRefusal, WorkspaceRefused, type WorkspaceCtx } from "@/lib/project-docs/store";
import { FormReader } from "@/lib/validate";

/**
 * The kick-off meeting's staff acts (ADR 0042 D10, PW-18, PW-29; plan step 7 §8.2): schedule it, change it before it is held, record it held with its attendance and
 * minutes in one act. Each is the signed-in officer's own act: who is asking (an administrator account is refused, NFR-SEC-004), the form read once, the clock read once,
 * the attribution begun BEFORE the contract is locked (scheduling and recording it held; a change writes no Person column and begins none), then the contract's lock and its
 * act x status row (PROJECT_WORKSPACE: open from Executed through Terminated, so scheduling before execution is refused), then the core in
 * `src/lib/project-docs/kick-off-store.ts`, which asks PW-5, locks the meeting and judges it. This file restates no rule.
 *
 * The minutes' files are never posted here: each is staged first through the staff upload route (`/api/documents`, `stagedFor=project-document`), and the form posts their
 * `stagedVersionId`s. A Server Action body is capped at 1 MB (ADR 0011 D5). The meeting never writes the Integrity Pact briefing (PW-18): that stays `recordBriefing`.
 */

const GONE: FormState = { ok: false, message: "That contract no longer exists." };
const NO_ZONE = "Time zone not set. An administrator sets it under Configuration › Organisation.";

/// The contract, locked (requisition, exercise, award, contract: `withLockedContract`), the PROJECT_WORKSPACE row asked first, then the act.
async function inContract(actor: StaffActor, contractId: string, now: Date, fn: (c: WorkspaceCtx) => Promise<FormState>): Promise<FormState> {
  let orgName = "the organisation";
  let result: FormState | null;
  try {
    result = await withLockedContract(actor.organisationId, contractId, async (tx, l) => {
      orgName = l.org.name;
      // The act x status table, first and under the lock: the meeting is held from Executed (PW-18), and the workspace is shut before execution, when cancelled, and when closed.
      const shut = actStatusFault("PROJECT_WORKSPACE", l.contract.status as ContractStatus);
      if (shut) return { ok: false, message: actStatusText(shut) };
      // The organisation's day, never UTC's.
      const today = dayOf(now, l.org.timeZone);
      if (!today) return { ok: false, message: NO_ZONE };
      return fn({ tx, l, now, today });
    });
  } catch (e) {
    if (e instanceof WorkspaceRefused) return { ok: false, message: e.said ?? kickOffRefusalText(e.faults, orgName) };
    const attribution = attributionRefusalState(e);
    if (attribution) return attribution;
    // PW-37: the one-pin index, caught here, outside the aborted transaction, and said as the locked re-read would.
    const pin = pinConflictRefusal(e);
    if (pin) return { ok: false, message: kickOffRefusalText(pin.faults, orgName) };
    throw e;
  }
  if (result?.ok) {
    revalidatePath("/projects");
    revalidatePath(`/projects/${contractId}`);
    revalidatePath("/", "layout");
  }
  return result ?? GONE;
}

// ------------------------------------------------------------------ the form, read once

const ID = { required: true, max: 100 } as const;
const failed = (r: FormReader): { ok: false; state: FormState } => ({ ok: false, state: { ok: false, errors: r.errors } });
const many = (values: FormDataEntryValue[]): string[] => values.flatMap((v) => (typeof v === "string" && v.trim() ? [v.trim()] : []));

/// When (a day and a clock time, read in the organisation's zone inside the lock), where (a place, or a plain-text link), and the agenda. Whether each is there is the rule's to say.
function readArrangement(data: FormData) {
  const r = new FormReader(data);
  const contractId = r.text("contractId", "Contract", ID);
  const meetsOn = r.text("meetsOn", "Day");
  const meetsTime = r.text("meetsTime", "Time");
  const place = r.text("place", "Place");
  const onlineLink = r.text("onlineLink", "Online link");
  const agenda = r.text("agenda", "Agenda");
  return r.failed ? failed(r) : { ok: true as const, value: { contractId, meetsOn, meetsTime, place, onlineLink, agenda } };
}
const arrangement = (v: { meetsOn: string; meetsTime: string; place: string; onlineLink: string; agenda: string }, c: WorkspaceCtx): Arrangement => ({
  meetsAt: instantAt(v.meetsOn, v.meetsTime, c.l.org.timeZone),
  place: v.place,
  onlineLink: v.onlineLink,
  agenda: v.agenda,
});

function readHeld(data: FormData) {
  const r = new FormReader(data);
  const contractId = r.text("contractId", "Contract", ID);
  const heldOn = r.text("heldOn", "Day it was held");
  // Attendees ticked on the organisation's side: who attended, never who acts (KickOffAttendance.person is NOT_AN_ACT).
  const personIds = many(data.getAll("attendeePersonId"));
  const accountIds = many(data.getAll("attendeeAccountId"));
  const otherNames = data.getAll("otherName").flatMap((v) => (typeof v === "string" ? [v] : []));
  const stagedVersionIds = many(data.getAll("stagedVersionId"));
  return r.failed ? failed(r) : { ok: true as const, value: { contractId, heldOn: heldOn || null, personIds, accountIds, otherNames, stagedVersionIds } };
}

// ------------------------------------------------------------------ the acts

/// The contract's one kick-off meeting: when, where (or an online link), and the agenda.
export async function scheduleKickOff(_prev: FormState, data: FormData): Promise<FormState> {
  const guard = await staffForAct("TRANSACTION");
  if (!guard.ok) return guard.state;
  const actor = guard.actor;
  const now = toSecond(new Date());
  const read = readArrangement(data);
  if (!read.ok) return read.state;
  const v = read.value;
  const begun = await beginAct(actor, data, "KickOffMeeting.scheduledBy", { personField: "scheduledByPersonId", onBehalf: false });
  if (!begun.ok) return begun.state;
  const act = begun.act;
  return inContract(actor, v.contractId, now, async (c) => {
    await scheduleMeeting(c, actor, arrangement(v, c), act);
    return { ok: true, message: "Kick-off meeting scheduled." };
  });
}

/// When, where or the agenda, changed before the meeting is held. Audited before and after; it writes no Person column, so it begins no act slot.
export async function changeKickOff(_prev: FormState, data: FormData): Promise<FormState> {
  const guard = await staffForAct("TRANSACTION");
  if (!guard.ok) return guard.state;
  const actor = guard.actor;
  const now = toSecond(new Date());
  const read = readArrangement(data);
  if (!read.ok) return read.state;
  const v = read.value;
  return inContract(actor, v.contractId, now, async (c) => {
    const done = await changeMeeting(c, actor, arrangement(v, c));
    return { ok: true, message: done.changed ? "Kick-off meeting changed." : "Nothing changed." };
  });
}

/// Record it held, in one act (PW-29): the day, who attended (ticked from both sides, and other names), and the minutes (files staged first), all required.
export async function recordKickOffHeld(_prev: FormState, data: FormData): Promise<FormState> {
  const guard = await staffForAct("TRANSACTION");
  if (!guard.ok) return guard.state;
  const actor = guard.actor;
  const now = toSecond(new Date());
  const read = readHeld(data);
  if (!read.ok) return read.state;
  const v = read.value;
  const begun = await beginAct(actor, data, "KickOffMeeting.heldRecordedBy", { personField: "heldRecordedByPersonId", onBehalf: false });
  if (!begun.ok) return begun.state;
  const act = begun.act;
  return inContract(actor, v.contractId, now, async (c) => {
    await recordMeetingHeld(c, actor, { heldOn: v.heldOn, personIds: v.personIds, accountIds: v.accountIds, otherNames: v.otherNames, stagedVersionIds: v.stagedVersionIds }, act);
    return { ok: true, message: "Kick-off meeting recorded as held. The minutes are shared with the contractor." };
  });
}
