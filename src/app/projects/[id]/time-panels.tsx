import { ActGate } from "@/components/act-gate";
import { DataList, type Row } from "@/components/data-list";
import { CalendarIcon, ClockIcon, FileIcon, ScaleIcon, WalletIcon } from "@/components/icons";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { MoreText } from "@/components/ui/more-text";
import { MoreActions } from "@/components/ui/more-actions";
import { KeyValues } from "@/components/ui/stat";
import { actStatusFault, actStatusText } from "@/lib/contract/act-status";
import type { LoadedContract } from "@/lib/contract/repo";
import type { ContractStatus } from "@/lib/contract/types";
import { dayOrNull as day } from "@/lib/dates";
import { formatDate } from "@/lib/format";
import { formatMoney, senFromDecimal } from "@/lib/money";
import type { HiddenAct } from "@/lib/supervision/authority";
import { EOT_STATE_TONE, EOT_STATE_WORDS } from "@/lib/time/claim-state";
import { lossStateOf, type TimeView } from "@/lib/time/view";

import { DelayNoticeDrawer, OpenClaimDrawer, RaiseAgreementDrawer, RecordLossDrawer, RecordPeriodDrawer, SendLossDrawer, SendPeriodDrawer, ValueLossDrawer, type Option } from "./time-editors";

/**
 * The Project stage's Time tab (Phase 2 close-out stage A; plan closeout-plan.md §3.1): the date for completion and its versions, delay notices,
 * extension-of-time claims (each opens its page), loss and expense, and the contract period where the type offers it. One primary action per card;
 * the rest in MoreActions. Each drawer is offered only where the act's family is allowed and the signed-in representative's letter covers it.
 */
export function TimePanel({ l, v, people, today, hidden }: { l: LoadedContract; v: TimeView; people: Option[]; today: string | null; hidden: readonly HiddenAct[] }) {
  const id = l.contract.id;
  const status = l.contract.status as ContractStatus;
  const zone = !today ? "Set the organisation's time zone first." : null;
  const said = (f: ReturnType<typeof actStatusFault>) => (f ? actStatusText(f) : zone);
  // Each card's acts belong to one family of the act × status table, asked by name; its drawers sit under that card's gate.
  const eot = said(actStatusFault("EOT", status));
  const loss = said(actStatusFault("LOSS_EXPENSE", status));
  const period = said(actStatusFault("PERIOD_EXTENSION", status));
  const original = v.versions[0]?.dateForCompletion ?? null;
  const offersEot = v.instrument !== "CONTRACT_PERIOD";
  const offersPeriod = v.instrument === "CONTRACT_PERIOD" || v.instrument === "BOTH";

  const versionRows: Row[] = v.versions.map((x) => ({
    id: x.id,
    search: `${x.version} ${x.writtenBy ?? ""}`,
    cells: {
      date: { kind: "text", text: x.dateForCompletion ? formatDate(x.dateForCompletion) : "Not set" },
      by: { kind: "stack", title: x.reason === "EXTENSION_OF_TIME" ? "Extension of time" : x.reason === "PERIOD_EXTENSION" ? "Extension of the contract period" : x.version === 1 ? "Original" : "Correction", sub: x.writtenBy ? `${x.writtenBy}${x.days ? `, ${x.days} days` : ""}` : `Version ${x.version}` },
      on: { kind: "text", text: x.recordedOn ? formatDate(x.recordedOn) : "", dim: true },
    },
  }));
  const noticeRows: Row[] = v.notices.map((n) => ({
    id: n.id,
    search: n.cause,
    cells: {
      received: { kind: "text", text: formatDate(day(n.receivedOn)) },
      path: { kind: "text", text: n.path === "SO_DIRECTION" ? "S.O.'s direction" : "Contractor's notice" },
      cause: { kind: "text", text: n.cause },
    },
  }));
  const claimRows: Row[] = [...v.claims].reverse().map(({ m, c, state }) => {
    const granted = [...c.extensions].reverse().find((x) => x.certificate.status !== "VOID");
    const tone = EOT_STATE_TONE[state];
    return {
      id: c.id,
      search: `${m.reference ?? ""} ${c.cause} ${EOT_STATE_WORDS[state]}`,
      cells: {
        claim: { kind: "link", text: m.reference ? `Claim ${m.reference}` : "Claim (not yet numbered)", href: `/projects/${id}/eot/${c.id}`, sub: c.cause },
        state: { kind: "chips", items: [{ text: EOT_STATE_WORDS[state], ...(tone ? { tone } : {}) }] },
        claimed: { kind: "text", text: `${c.proposedDays} days` },
        granted: granted ? { kind: "text", text: `${granted.grantedDays} days` } : { kind: "text", text: "None", dim: true },
      },
    };
  });
  const lossRows: Row[] = v.losses.map((x) => ({
    id: x.id,
    search: x.claim?.matter.reference ?? "",
    cells: {
      claim: { kind: "stack", title: x.matter?.reference ? `Loss and expense ${x.matter.reference}` : "Loss and expense", sub: x.claim ? `On claim ${x.claim.matter.reference ?? "(not yet numbered)"}` : "On its own" },
      claimed: { kind: "text", text: formatMoney(senFromDecimal(x.claimed)) },
      valued: x.valued == null ? { kind: "text", text: "Not valued", dim: true } : { kind: "text", text: formatMoney(senFromDecimal(x.valued)) },
      state: { kind: "chips", items: [{ text: lossStateOf(x) }] },
    },
  }));
  const lossOpts = (pick: (x: TimeView["losses"][number]) => boolean): Option[] => v.losses.filter(pick).map((x) => ({ value: x.id, label: `${formatMoney(senFromDecimal(x.claimed))} claimed${x.claim ? ` on ${x.claim.matter.reference ?? "a claim"}` : ""}` }));
  const toValue = lossOpts((x) => !x.matterId);
  const toSend = lossOpts((x) => x.valued != null && (!x.matter || (!x.matter.closedAt && x.matter.routes.at(-1)?.status !== "PENDING" && !x.matter.approvedRouteId)));
  const periodOpts = (pick: (p: TimeView["periods"][number]) => boolean): Option[] => v.periods.filter(pick).map((p) => ({ value: p.x.id, label: `To ${formatDate(day(p.x.newExpiry))}${p.m.reference ? ` (${p.m.reference})` : ""}` }));

  return (
      <div className="flex flex-col gap-6">
        <Card className="overflow-hidden">
          <CardHeader icon={<CalendarIcon size={17} />} title="Completion date" divided />
          <CardBody>
            <KeyValues columns={2} items={[{ label: "Original", value: original ? formatDate(original) : "Not set" }, { label: "Current", value: v.current ? formatDate(v.current) : "Not set" }]} />
          </CardBody>
          {v.versions.length > 1 && (
            <DataList flat selectable={false} toolbar={false} searchable={false} paging={false} exportName="completion-date" columns={[{ key: "date", label: "Date for completion", mobile: "primary" }, { key: "by", label: "By", mobile: "meta" }, { key: "on", label: "Recorded", width: "140px", mobile: "meta" }]} rows={versionRows} />
          )}
        </Card>

        <ActGate blocker={eot}>
        <Card className="overflow-hidden">
          <CardHeader icon={<FileIcon size={17} />} title="Delay notices" actions={hidden.includes("CONTRACTOR_COMMUNICATION") ? undefined : <DelayNoticeDrawer id={id} people={people} today={today} blocker={eot} />} divided={false} />
          <DataList flat selectable={false} toolbar={v.notices.length > 5} searchPlaceholder="Search by cause" exportName="delay-notices" emptyTitle="No delay notices" columns={[{ key: "received", label: "Received", width: "140px", mobile: "meta" }, { key: "path", label: "How", width: "180px", mobile: "meta" }, { key: "cause", label: "Cause", mobile: "primary" }]} rows={noticeRows} />
        </Card>

        {offersEot && (
          <Card className="overflow-hidden">
            <CardHeader
              icon={<ClockIcon size={17} />}
              title="Extensions of time"
              actions={hidden.includes("CONTRACTOR_COMMUNICATION") ? undefined : <OpenClaimDrawer id={id} people={people} notices={v.notices.map((n) => ({ value: n.id, label: `${formatDate(day(n.receivedOn))}: ${n.cause.slice(0, 60)}` }))} programmes={v.programmes.map((p) => ({ value: p.id, label: `Revision ${p.revision}` }))} blocker={eot} />}
              divided={false}
            />
            <DataList flat selectable={false} toolbar={v.claims.length > 5} searchPlaceholder="Search by number or cause" exportName="extension-of-time-claims" emptyTitle="No claims" rowAction={{ label: "Open", hrefTemplate: `/projects/${id}/eot/{id}` }} rowOpens columns={[{ key: "claim", label: "Claim", mobile: "primary" }, { key: "state", label: "Status", width: "200px", mobile: "meta" }, { key: "claimed", label: "Claimed", width: "120px", numeric: true, mobile: "meta" }, { key: "granted", label: "Granted", width: "120px", numeric: true, mobile: "meta" }]} rows={claimRows} />
          </Card>
        )}
        </ActGate>

        <ActGate blocker={loss}>
        <Card className="overflow-hidden">
          <CardHeader
            icon={<WalletIcon size={17} />}
            title="Loss and expense"
            actions={
              hidden.includes("CONTRACTOR_COMMUNICATION") && hidden.includes("VALUATION") ? undefined : (
                <MoreActions label="Loss and expense actions">
                  {hidden.includes("CONTRACTOR_COMMUNICATION") ? null : <RecordLossDrawer id={id} people={people} claims={v.claims.map(({ m, c }) => ({ value: c.id, label: m.reference ? `Claim ${m.reference}` : `Claim of ${formatDate(day(c.recordedAt))}` }))} blocker={loss} />}
                  {hidden.includes("VALUATION") ? null : <ValueLossDrawer id={id} losses={toValue} people={people} today={today} blocker={loss} />}
                  {hidden.includes("CONTRACTOR_COMMUNICATION") ? null : <SendLossDrawer id={id} losses={toSend} people={people} blocker={loss} />}
                </MoreActions>
              )
            }
            divided={false}
          />
          <DataList flat selectable={false} toolbar={false} searchable={false} exportName="loss-and-expense" emptyTitle="No loss-and-expense claims" columns={[{ key: "claim", label: "Claim", mobile: "primary" }, { key: "claimed", label: "Claimed", width: "140px", numeric: true, mobile: "meta" }, { key: "valued", label: "Valued", width: "140px", numeric: true, mobile: "meta" }, { key: "state", label: "Status", width: "180px", mobile: "meta" }]} rows={lossRows} />
        </Card>
        </ActGate>

        {offersPeriod && (
          <ActGate blocker={period}>
          <Card className="overflow-hidden">
            <CardHeader
              icon={<ScaleIcon size={17} />}
              title={<span className="inline-flex items-center gap-1.5">Contract period <MoreText text="Extended by a supplementary agreement once its extension is approved." label="About the contract period" /></span>}
              actions={
                hidden.includes("CONTRACTOR_COMMUNICATION") ? undefined : (
                  <span className="flex items-center gap-2">
                    <RecordPeriodDrawer id={id} people={people} blocker={period} />
                    <MoreActions label="Contract period actions">
                      <SendPeriodDrawer id={id} extensions={periodOpts((p) => !p.approved && !p.m.closedAt && p.m.routes.at(-1)?.status !== "PENDING")} people={people} blocker={period} />
                      {hidden.includes("SO_ONLY") ? null : <RaiseAgreementDrawer id={id} extensions={periodOpts((p) => p.approved && !p.x.agreements.some((a) => a.certificate.status !== "VOID"))} people={people} blocker={period} />}
                    </MoreActions>
                  </span>
                )
              }
              divided={false}
            />
            <DataList
              flat
              selectable={false}
              toolbar={false}
              searchable={false}
              exportName="contract-period"
              emptyTitle="No extensions of the contract period"
              columns={[{ key: "to", label: "New expiry", mobile: "primary" }, { key: "state", label: "Status", width: "220px", mobile: "meta" }]}
              rows={v.periods.map((p) => {
                const agreement = p.x.agreements.find((a) => a.certificate.status !== "VOID");
                return { id: p.x.id, search: "", cells: { to: { kind: "stack", title: formatDate(day(p.x.newExpiry)), sub: `From ${formatDate(day(p.x.currentExpiry))}` }, state: { kind: "chips", items: [{ text: agreement ? (agreement.certificate.status === "ISSUED" ? "Agreed" : "Agreement raised") : p.approved ? "Approved" : p.m.closedAt ? "Closed" : p.m.routes.at(-1)?.status === "PENDING" ? "Awaiting approval" : "Recorded" }] } } };
              })}
            />
          </Card>
          </ActGate>
        )}
      </div>
  );
}
