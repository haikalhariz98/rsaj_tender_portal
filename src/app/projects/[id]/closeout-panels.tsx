import Link from "next/link";

import { ActGate } from "@/components/act-gate";
import { DataList, type Row } from "@/components/data-list";
import { CalendarIcon, CheckIcon, ClipboardIcon, ShieldCheckIcon, ShieldIcon } from "@/components/icons";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { EmptyState, Meter } from "@/components/ui/feedback";
import { MoreActions } from "@/components/ui/more-actions";
import { KeyValues } from "@/components/ui/stat";
import { STATUS_WORDS } from "@/lib/certificate/labels";
import { defectState, isOpenLine, overdue, withdrawnCount, type FrozenLine } from "@/lib/closeout/defects";
import { dlpDaysLeft } from "@/lib/closeout/dlp";
import { DEFECT_STATE_TONE, DEFECT_STATE_WORDS, SECURITY_FORM_WORDS, withdrawnWords } from "@/lib/closeout/labels";
import { defectFactsOf, dlpOfRow, scheduleRectifyBy } from "@/lib/closeout/load";
import type { CloseoutView } from "@/lib/closeout/view";
import { actStatusBlocker } from "@/lib/contract/act-status";
import type { LoadedContract } from "@/lib/contract/repo";
import type { ContractStatus } from "@/lib/contract/types";
import { dayPlus, daysFrom, storedDay } from "@/lib/dates";
import { db } from "@/lib/db";
import { pickableDefectItems } from "@/lib/work/load";
import { formatDate } from "@/lib/format";
import type { ClockPlan } from "@/lib/inbox/clock-plan";
import { formatMoney, senFromDecimal } from "@/lib/money";
import { paymentFaultText } from "@/lib/payment/labels";
import { releaseOf } from "@/lib/payment/retention";
import { heldOnLatest } from "@/lib/payment/assemble";
import { interimsInProgressOf, issuedInterims, releaseStateOf } from "@/lib/payment/load";
import type { HiddenAct } from "@/lib/supervision/authority";

import { AddDefectDrawer, DefectActDrawer, PickDefectItemsDrawer, RaiseCmgdDrawer, RaiseCpcDrawer, RaiseScheduleDrawer, RemoveDefectDrawer, ReturnSecurityDrawer, type Option } from "./closeout-editors";
import { ReleaseDrawer } from "./payment-editors";

/**
 * The close-out stage's tabs (Phase 2 close-out stage B; plan closeout-plan.md §3.2): Completion (the CPC, the defects liability period, the CMGD,
 * retention and securities) and Defects (every line, and the Schedule of Defects once the period has ended). Each card's drawers sit under its
 * family's gate, and each drawer is offered only where the signed-in representative's letter covers it. The component renders what it is given.
 */

type Props = { l: LoadedContract; v: CloseoutView; people: Option[]; today: string | null; hidden: readonly HiddenAct[] };

const sub = "text-[12.5px] text-ink-3";
const zone = (today: string | null) => (today ? null : "Set the organisation's time zone first.");
/// A domain row's certificate, as a link to its page: its number once issued, else its stage.
const certLink = (contractId: string, row: { certificate: { id: string; number: string | null; status: string } }) => (
  <Link href={`/projects/${contractId}/certificates/${row.certificate.id}`}>{row.certificate.number ?? STATUS_WORDS[row.certificate.status as keyof typeof STATUS_WORDS]?.en ?? "Open"}</Link>
);
const EVENT_SETTING_WORDS: Readonly<Record<string, string>> = { MAKING_GOOD: "At making good", FINAL_PAYMENT: "With the final payment" };
const TOLD_WORDS: Readonly<Record<ClockPlan["state"], string>> = { RULE_SET: "", NO_RULE: "No one is told: no notification rule", RULE_OFF: "No one is told: the notification rule is off", NO_TIME_ZONE: "Not judged: time zone not set" };

export function CompletionPanel({ l, v, people, today, hidden, told }: Props & { told: ClockPlan | null }) {
  const id = l.contract.id;
  const status = l.contract.status as ContractStatus;
  // Each card's acts belong to one family of the act × status table, asked by name; its drawers sit under that card's gate.
  const completion = actStatusBlocker("COMPLETION", status) ?? zone(today);
  const makingGood = actStatusBlocker("MAKING_GOOD", status) ?? zone(today);
  const retentionGate = actStatusBlocker("RETENTION_RELEASE", status) ?? zone(today);
  const securityGate = actStatusBlocker("SECURITY_RELEASE", status) ?? zone(today);
  const pc = v.rows.cpc;
  const dlp = pc ? dlpOfRow(pc) : null;
  const pcIssued = pc?.certificate.status === "ISSUED";
  const cmgd = v.rows.cmgd;
  const frozen = (cmgd?.frozenLines as FrozenLine[] | null) ?? null;
  const withdrawn = withdrawnWords(withdrawnCount(frozen ?? defectFactsOf(v.rows).map((d) => ({ state: defectState(d.events).state }))));
  const dlpEnded = !!dlp && dlp.applies === true && !!today && today >= dlp.endExclusive;
  const balanceRelease = v.p.retentionReleases.find((x) => x.kind === "RELEASED_BALANCE") ?? null;
  const held = heldOnLatest(issuedInterims(v.p));
  const rs = releaseStateOf(v.p);
  const balanceBlock = !held ? paymentFaultText({ code: "NO_ISSUED_INTERIM", level: "block" }) : (zone(today) ?? (releaseOf({ kind: "RELEASED_BALANCE", held: held.held, already: rs.already, firstReleasePct: null, asBuiltHandedOver: true, balanceEvent: v.events.retention, firstReleased: rs.firstReleased, inProgress: interimsInProgressOf(v.p) }).faults.map(paymentFaultText).join(" ") || null));
  const setting = v.events.retention.state === "NOT_SET" ? "Not set" : (EVENT_SETTING_WORDS[v.cfg.policy?.retentionBalanceReleaseAt ?? ""] ?? "Not set");
  const securityRows: Row[] = v.securities.map(({ s, faults, label }) => ({
    id: s.id,
    search: label,
    cells: {
      security: { kind: "stack", title: label, sub: SECURITY_FORM_WORDS[s.form] },
      value: { kind: "money", sen: senFromDecimal(s.value).toString() },
      state: s.release
        ? { kind: "stack", title: `Returned ${formatDate(storedDay(s.release.returnedOn))}`, sub: s.release.certificateId ? `On the certificate of making good defects ${s.release.certificate?.number ?? ""}`.trim() : s.release.trigger === "ADVANCE_RECOUPED" ? "Advance fully recouped" : "" }
        : s.kind === "DESIGN_GUARANTEE_BOND"
          ? { kind: "chips", items: [{ text: "Survives the close", tone: "info" }] }
          : { kind: "chips", items: [{ text: faults.length || securityGate ? "Held" : "To return", tone: faults.length || securityGate ? undefined : "warn" }] },
    },
  }));
  const returnable = v.securities.filter((x) => x.returnable).map((x) => ({ value: x.s.id, label: x.label }));
  return (
    <div className="flex flex-col gap-6">
      <ActGate blocker={completion}>
        <Card id="completion" className="overflow-hidden">
          <CardHeader icon={<CheckIcon size={17} />} title="Practical completion" info={{ label: "About practical completion", text: "Certified after the passing joint inspection. A contract with sections or an IT contract is not certified here yet." }} actions={!pc && !hidden.includes("SO_ONLY") ? <RaiseCpcDrawer id={id} people={people} today={today} blocker={completion} /> : undefined} />
          {pc ? (
            <CardBody>
              <KeyValues
                columns={2}
                items={[
                  { label: "Completed on", value: formatDate(storedDay(pc.completionDate)) },
                  { label: "Certificate", value: certLink(id, pc) },
                  { label: "Joint inspection", value: formatDate(storedDay(pc.inspectedOn)) },
                  { label: "Attended", value: pc.attendees.join(", ") || "Not recorded" },
                  { label: "Why complete", value: pc.testReasons },
                ]}
              />
            </CardBody>
          ) : (
            <EmptyState size="sm" title="Not certified" />
          )}
        </Card>
      </ActGate>

      <Card className="overflow-hidden">
        <CardHeader icon={<CalendarIcon size={17} />} title="Defects liability period" subtitle={dlp?.applies === true && told && told.state !== "RULE_SET" ? TOLD_WORDS[told.state] : undefined} />
        <CardBody>
          {!pc || !dlp ? (
            <p className={sub}>Starts at practical completion.</p>
          ) : dlp.applies !== true ? (
            <p className={sub}>None applies. Next is the final account.</p>
          ) : (
            <div className="flex flex-col gap-4">
              <KeyValues columns={3} items={[{ label: "Starts", value: formatDate(dlp.start) }, { label: "Ends", value: formatDate(dayPlus(dlp.endExclusive, -1)) }, { label: "Days left", value: cmgd?.certificate.status === "ISSUED" ? "Made good" : today ? String(dlpDaysLeft(dlp.endExclusive, today)) : "Not judged" }]} />
              {today && cmgd?.certificate.status !== "ISSUED" && <Meter percent={Math.min(100, Math.max(0, Math.round((daysFrom(dlp.start, today) / Math.max(1, daysFrom(dlp.start, dlp.endExclusive))) * 100)))} label="The defects liability period elapsed" />}
            </div>
          )}
        </CardBody>
      </Card>

      <ActGate blocker={makingGood}>
        <Card id="making-good" className="overflow-hidden">
          <CardHeader icon={<ShieldCheckIcon size={17} />} title="Making good of defects" actions={!cmgd && dlpEnded && pcIssued && v.facts.defects.open === 0 && !hidden.includes("SO_ONLY") ? <RaiseCmgdDrawer id={id} people={people} today={today} blocker={makingGood} /> : undefined} />
          {cmgd ? (
            <CardBody>
              <KeyValues columns={2} items={[{ label: "Made good on", value: formatDate(storedDay(cmgd.madeGoodOn)) }, { label: "Certificate", value: certLink(id, cmgd) }, { label: "Final inspection", value: formatDate(storedDay(cmgd.finalInspectionOn)) }, { label: "Defects", value: withdrawn ?? "All made good" }]} />
            </CardBody>
          ) : (
            <EmptyState size="sm" title={dlp?.applies === false ? "Not needed: no defects liability period" : v.facts.defects.open > 0 && dlpEnded ? `${v.facts.defects.open} defects still open` : "Not certified"} />
          )}
        </Card>
      </ActGate>

      <ActGate blocker={retentionGate}>
        <Card id="retention" className="overflow-hidden">
          <CardHeader icon={<ShieldIcon size={17} />} title="Retention" subtitle={`Balance: ${setting}`} actions={pcIssued && !balanceRelease && !hidden.includes("PRINCIPAL_OR_SO") ? <ReleaseDrawer id={id} release="RELEASED_BALANCE" label="Release the retention balance" people={people} today={today} blocker={balanceBlock} /> : undefined} />
          <CardBody>
            <KeyValues
              columns={3}
              items={[
                { label: "Held", value: formatMoney(v.retention.held) },
                { label: "First release", value: formatMoney(v.retention.first) },
                { label: "Balance", value: balanceRelease ? `Released ${formatDate(storedDay(balanceRelease.releasedOn))}${cmgd?.certificate.status === "ISSUED" ? ` on the certificate of making good defects ${cmgd.certificate.number ?? ""}`.trimEnd() : ""}` : formatMoney(v.retention.balance) },
                // Ruling 1b: held again by interims issued after the balance, paid on the final certificate.
                ...(v.retention.sinceBalance > 0n ? [{ label: "Held since the balance was released", value: `${formatMoney(v.retention.sinceBalance)}, paid on the final certificate` }] : []),
              ]}
            />
          </CardBody>
        </Card>
      </ActGate>

      <ActGate blocker={securityGate}>
        <Card id="securities" className="overflow-hidden">
          <CardHeader icon={<ClipboardIcon size={17} />} title="Securities" actions={pcIssued && !hidden.includes("PRINCIPAL_OR_SO") && v.securities.some((x) => !x.s.release) ? <ReturnSecurityDrawer id={id} securities={returnable} people={people} today={today} blocker={securityGate} /> : undefined} divided={false} />
          <DataList flat selectable={false} toolbar={false} searchable={false} paging={false} exportName="securities" emptyTitle="No securities" columns={[{ key: "security", label: "Security", mobile: "primary" }, { key: "value", label: "Value", width: "160px", numeric: true, mobile: "meta" }, { key: "state", label: "Status", width: "280px", mobile: "meta" }]} rows={securityRows} />
        </Card>
      </ActGate>
    </div>
  );
}

export async function DefectsPanel({ l, v, people, today, hidden }: Props) {
  const id = l.contract.id;
  const status = l.contract.status as ContractStatus;
  const completion = actStatusBlocker("COMPLETION", status) ?? zone(today);
  const defects = actStatusBlocker("DEFECTS", status) ?? zone(today);
  const pc = v.rows.cpc;
  const dlp = pc ? dlpOfRow(pc) : null;
  const cpcDraft = pc?.certificate.status === "DRAFT";
  const pcIssued = pc?.certificate.status === "ISSUED";
  const scheduleIssued = v.rows.schedule?.certificate.status === "ISSUED";
  const dlpEnded = !!dlp && dlp.applies === true && !!today && today >= dlp.endExclusive;
  const rectifyBy = scheduleRectifyBy(v.rows);
  const facts = defectFactsOf(v.rows);
  const documents = (await db.projectDocument.findMany({ where: { contractId: id, organisationId: l.org.id }, select: { id: true, title: true }, orderBy: { createdAt: "desc" } })).map((d) => ({ value: d.id, label: d.title }));
  const pickable = cpcDraft ? await pickableDefectItems({ organisationId: l.org.id, contractId: id }) : { options: [], total: 0 };
  const observedOf = (lineId: string) => {
    const on = v.rows.lines.find((x) => x.id === lineId)?.observedOn;
    return on ? formatDate(storedDay(on)) : null;
  };
  const rows: Row[] = facts.map((d) => {
    const r = defectState(d.events);
    const late = today ? overdue(d, today, rectifyBy) : false;
    return {
      id: d.id,
      search: `${d.description} ${d.location}`,
      cells: {
        defect: { kind: "stack", title: d.description, sub: [d.location, r.state === "OPEN" && r.returnNote ? `Returned: ${r.returnNote}` : null, r.state === "WITHDRAWN" ? r.withdrawnReason : null].filter(Boolean).join(" · ") || undefined },
        // Ruling 3: a line reported during the period says when it was observed; one reported before the ruling reads "not recorded".
        from: d.source === "PRACTICAL_COMPLETION" ? { kind: "text", text: "Certificate", dim: true } : { kind: "stack", title: "Reported", sub: `Observed ${observedOf(d.id) ?? "not recorded"}` },
        due: { kind: "text", text: formatDate(rectifyBy ?? d.dueOn) },
        state: { kind: "chips", items: [{ text: DEFECT_STATE_WORDS[r.state], tone: DEFECT_STATE_TONE[r.state] }, ...(late ? [{ text: "Overdue", tone: "err" as const }] : [])] },
      },
    };
  });
  const option = (pick: (s: ReturnType<typeof defectState>["state"]) => boolean): Option[] => facts.filter((d) => pick(defectState(d.events).state)).map((d) => ({ value: d.id, label: d.description.slice(0, 80) }));
  const open = option(isOpenLine);
  const reported = option((s) => s === "REPORTED_RECTIFIED");
  const fresh = option((s) => s === "OPEN");
  // The one way a line is added now: to the CPC while it is a draft, or reported during the period until the schedule is issued.
  const adding = cpcDraft ? { onCpc: true, family: "COMPLETION" as const } : pcIssued && dlp?.applies === true && !scheduleIssued ? { onCpc: false, family: "DEFECTS" as const } : null;
  const observe = !hidden.includes("OBSERVATION");
  const lineActs = observe && pcIssued && (open.length > 0);
  return (
    <div className="flex flex-col gap-6">
      <ActGate blocker={adding?.family === "COMPLETION" ? completion : defects}>
        <Card className="overflow-hidden">
          <CardHeader
            icon={<ClipboardIcon size={17} />}
            title="Defects"
            info={{ label: "About defects", text: "The contractor makes every defect good. One it never rectifies is withdrawn with a reason, which the certificate keeps." }}
            actions={
              observe && (adding || lineActs) ? (
                <span className="flex items-center gap-2">
                  {adding && <AddDefectDrawer id={id} onCpc={adding.onCpc} people={people} blocker={adding.family === "COMPLETION" ? completion : defects} main today={today} />}
                  <MoreActions label="Defect actions">
                    {cpcDraft && <PickDefectItemsDrawer id={id} items={pickable.options} total={pickable.total} people={people} blocker={completion} />}
                    {cpcDraft && <RemoveDefectDrawer id={id} lines={facts.map((d) => ({ value: d.id, label: d.description.slice(0, 80) }))} blocker={completion} />}
                    {lineActs && <DefectActDrawer id={id} act="REPORT" lines={fresh} documents={documents} people={people} today={today} blocker={defects} />}
                    {lineActs && <DefectActDrawer id={id} act="ACCEPT" lines={open} people={people} today={today} blocker={defects} />}
                    {lineActs && <DefectActDrawer id={id} act="RETURN" lines={reported} people={people} today={today} blocker={defects} />}
                    {lineActs && <DefectActDrawer id={id} act="WITHDRAW" lines={open} people={people} today={today} blocker={defects} />}
                  </MoreActions>
                </span>
              ) : undefined
            }
            divided={false}
          />
          <DataList flat selectable={false} toolbar={facts.length > 8} searchPlaceholder="Search defects" exportName="defects" emptyTitle={pc ? "No defects" : "Listed at practical completion"} columns={[{ key: "defect", label: "Defect", mobile: "primary" }, { key: "from", label: "From", width: "120px", mobile: "meta" }, { key: "due", label: "Due", width: "130px", mobile: "meta" }, { key: "state", label: "Status", width: "220px", mobile: "meta" }]} rows={rows} />
        </Card>
      </ActGate>

      {dlpEnded && (
        <ActGate blocker={defects}>
          <Card id="schedule" className="overflow-hidden">
            <CardHeader icon={<CalendarIcon size={17} />} title="Schedule of Defects" actions={!v.rows.schedule && open.length > 0 && !hidden.includes("SO_ONLY") ? <RaiseScheduleDrawer id={id} people={people} blocker={defects} /> : undefined} />
            {v.rows.schedule ? (
              <CardBody>
                <KeyValues columns={2} items={[{ label: "Made good by", value: formatDate(storedDay(v.rows.schedule.rectifyBy)) }, { label: "Certificate", value: certLink(id, v.rows.schedule) }, { label: "Listed", value: v.rows.schedule.frozenLines ? String((v.rows.schedule.frozenLines as unknown[]).length) : "At issue" }]} />
              </CardBody>
            ) : (
              <EmptyState size="sm" title={open.length ? `${open.length} defects open` : "Nothing open"} />
            )}
          </Card>
        </ActGate>
      )}
    </div>
  );
}

