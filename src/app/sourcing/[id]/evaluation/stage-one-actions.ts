"use server";

import { revalidatePath } from "next/cache";

import type { FormState } from "@/components/record-editor";
import { diffFields } from "@/lib/audit/diff";
import { TABLING_FAULT_MESSAGE } from "@/lib/committee/labels";
import { sittingPermits } from "@/lib/committee/meeting";
import { lockSittingIn } from "@/lib/committee/sittings";
import { checkTabling, secretariatHoldersOn } from "@/lib/committee/tabling";
import { dayToDate } from "@/lib/dates";
import { formatDate } from "@/lib/format";
import { lockEvaluationRows } from "@/lib/evaluation/lock";
import { loadEvaluationContext, stageMattersAcross } from "@/lib/evaluation/repo";
import { stageOneSubject, stageOneTablingFaults } from "@/lib/evaluation/stage-one";
import { openActFaults } from "@/lib/evaluation/state";
import { EVALUATION_STAGE_DOMAIN } from "@/lib/evaluation/types";
import { lockOpeningRows } from "@/lib/opening/lock";
import { ORGANISATION_CODE } from "@/lib/org";
import { loadRoster } from "@/lib/people/load";
import { FormReader } from "@/lib/validate";

import { audit, exerciseIdOf, inWindow } from "../window/shared";
import { evLabel, GONE_BIDDER, refuse } from "./shared";
import { requireStaff, toAuditActor } from "@/app/_auth/actor";

/**
 * Table a two-stage tender's first-stage matter for one bidder (FR-EVL-005) at a sitting of the
 * committee the pinned model's first stage names. Locks: requisition → exercise → window → openings,
 * then the sitting, then the evaluations (`src/lib/evaluation/lock.ts`: every act reaching the
 * evaluations from a sitting takes the sitting first). The committee's decision there is the act; the
 * matter carries no amount. Tabled on the Secretariat's holder's behalf, not signed.
 */
export async function tableStageOneMatter(_prev: FormState, data: FormData): Promise<FormState> {
  const actor = await requireStaff();
  const r = new FormReader(data);
  const bidderId = r.text("bidderId", "Bid", { required: true });
  const meetingId = r.text("meetingId", "Sitting", { required: true });
  const tabledByPersonId = r.optionalText("tabledByPersonId");
  if (r.failed) return { ok: false, errors: r.errors };
  const roster = await loadRoster(ORGANISATION_CODE);
  const result = await inWindow(exerciseIdOf(data), async (tx, l) => {
    await lockOpeningRows(tx, l.ex.id);
    const s = await lockSittingIn(tx, meetingId, roster);
    if (!s) return { ok: false, errors: { meetingId: "That sitting no longer exists." } };
    await lockEvaluationRows(tx, l.ex.id);
    const c = await loadEvaluationContext(l, tx);
    const e = c.current;
    const af = openActFaults({ exerciseStatus: l.ex.status, state: e?.state ?? null });
    if (af.length) return refuse(af);
    const f = c.facts!;
    const b = f.bidders.find((x) => x.id === bidderId);
    if (!b) return GONE_BIDDER;
    const first = f.model.stages.find((x) => x.kind === "COMMITTEE_DECISION") ?? null;
    const row = e!.bidders.find((x) => x.id === bidderId)!;
    const fs = stageOneTablingFaults({
      twoStage: f.model.route === "TWO_STAGE" && !!first,
      committeeCode: first?.committeeCode ?? null,
      sitting: { committeeCode: s.meeting.committee.code, frozen: !sittingPermits(s.meeting.status, "TABLE") },
      excluded: !!b.excludedReason,
      // R-1: the bidder's matters across the versions it was carried through; a new version resets nothing.
      matters: stageMattersAcross(row, c.bidderRows).filter((m) => !m.withdrawn).map((m) => m.outcome),
    });
    if (fs.length) return refuse(fs);
    const code = s.meeting.committee.secretariatRoleCode;
    const tabling = checkTabling({ secretariatRoleCode: code, tabledByPersonId, holderIdsOnDate: secretariatHoldersOn(s.roster, code, s.today).map((h) => h.id), tablingDay: s.today });
    if (!tabling.ok) {
      return tabling.fault === "NOT_TABLED" || tabling.fault === "NOT_SECRETARIAT_HOLDER" ? { ok: false, errors: { tabledByPersonId: TABLING_FAULT_MESSAGE[tabling.fault] } } : { ok: false, message: `Nothing was saved: ${TABLING_FAULT_MESSAGE[tabling.fault]}` };
    }
    const subject = stageOneSubject(l.ex.title, b.listingNo);
    const sequence = s.meeting.decisions.reduce((n, d) => Math.max(n, d.sequence), 0) + 1;
    // The committee decides the first stage itself: its decision is the act.
    const m = await tx.committeeDecision.create({ data: { meetingId: s.meeting.id, subject, domain: EVALUATION_STAGE_DOMAIN, matterKind: "EVALUATION_STAGE", matterRef: l.ex.reference, evaluationBidderId: b.id, act: "A", tabledByPersonId, tabledAt: dayToDate(s.today!), sequence } });
    await audit(tx, toAuditActor(actor), l.org.id, "CommitteeDecision", m.id, evLabel(l, e!.version, subject), "CREATE", diffFields(null, { matter: subject, bid: `No. ${b.listingNo}`, sitting: s.meeting.reference, committee: s.meeting.committee.nameEn, tabledBy: tabledByPersonId ? (s.names[tabledByPersonId] ?? null) : null, tabledOn: formatDate(s.today!), recordedOnBehalf: "yes" }));
    return { ok: true, message: `Tabled at ${s.meeting.reference}. The committee decides it there.` };
  });
  if (result.ok) {
    revalidatePath("/committees");
    revalidatePath(`/committees/${meetingId}`);
  }
  return result;
}
