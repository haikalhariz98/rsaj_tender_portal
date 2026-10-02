"use server";

import { revalidatePath } from "next/cache";

import type { FormState } from "@/components/record-editor";
import { withLockedAward } from "@/lib/award/repo";
import { toSecond } from "@/lib/bids/lateness";
import { recordAwardCheck, recordAwardReceived, startAwardSheet } from "@/lib/certificate/award-sheet";
import { CertificateRefusal } from "@/lib/certificate/write";
import { dayOf, storedDay } from "@/lib/dates";
import { FormReader } from "@/lib/validate";

/**
 * The award's pre-award routing sheet (6.14 increment 1, rulings condition; flagged against accepted 6.11).
 * Each act reads the server's clock once on entry, locks the requisition, the exercise and the award
 * (`withLockedAward`), and calls the sheet's helper, which re-runs the rule, writes and audits in the same
 * transaction. Nothing here touches the appointment route or the award's own record.
 */

const GONE: FormState = { ok: false, message: "That award no longer exists." };
const NO_ZONE: FormState = { ok: false, message: "Set the organisation's time zone under Configuration › Organisation first: every act here records the organisation's day, never UTC's." };

async function inAwardSheet(awardId: string, now: Date, fn: (tx: Parameters<Parameters<typeof withLockedAward>[1]>[0], l: Parameters<Parameters<typeof withLockedAward>[1]>[1], today: string) => Promise<void>): Promise<FormState> {
  let result: FormState | null;
  try {
    result = await withLockedAward(awardId, async (tx, l) => {
      const today = dayOf(now, l.org.timeZone);
      if (!today) return NO_ZONE;
      await fn(tx, l, today);
      return { ok: true };
    });
  } catch (e) {
    if (e instanceof CertificateRefusal) return { ok: false, message: e.message, errors: e.errors };
    throw e;
  }
  if (result?.ok) revalidatePath(`/awards/${awardId}`);
  return result ?? GONE;
}

const idOf = (data: FormData) => String(data.get("id") ?? "");

export async function startAwardRoutingSheet(_prev: FormState, data: FormData): Promise<FormState> {
  const now = toSecond(new Date());
  const r = new FormReader(data);
  const typeId = r.text("typeId", "Routing sheet", { required: true });
  if (r.failed) return { ok: false, errors: r.errors };
  return inAwardSheet(idOf(data), now, (tx, l, today) => startAwardSheet(tx, l, typeId, now, today));
}

export async function recordAwardRoutingReceived(_prev: FormState, data: FormData): Promise<FormState> {
  const now = toSecond(new Date());
  const r = new FormReader(data);
  const received = r.date("receivedOn", "Received on (DATE 1)", { required: true });
  if (r.failed || !received) return { ok: false, errors: r.errors };
  return inAwardSheet(idOf(data), now, (tx, l, today) => recordAwardReceived(tx, l, storedDay(received), now, today));
}

export async function recordAwardRoutingCheck(_prev: FormState, data: FormData): Promise<FormState> {
  const now = toSecond(new Date());
  const r = new FormReader(data);
  const defOrder = r.int("defOrder", "Check", { min: 1, required: true });
  const personId = r.text("personId", "Recorded for", { required: true });
  const on = r.date("on", "On", { required: true });
  const note = r.text("note", "Note", { max: 2000 });
  if (r.failed || defOrder == null || !on) return { ok: false, errors: r.errors };
  return inAwardSheet(idOf(data), now, (tx, l, today) => recordAwardCheck(tx, l, defOrder, personId, storedDay(on), note, now, today));
}
