import { DataList } from "@/components/data-list";
import { ClockIcon, ShieldIcon } from "@/components/icons";
import { Badge, Chip } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Callout, EmptyState } from "@/components/ui/feedback";
import { KeyValues } from "@/components/ui/stat";
import { formatDate, formatOrgDateTime } from "@/lib/format";
import type { estimateTab } from "@/lib/scope/read";

import { AmendEstimateDrawer, LodgeEstimateDrawer, PrepareEstimateDrawer, RetainCopyDrawer, VoidEstimateDrawer } from "./editors";

type Data = NonNullable<Awaited<ReturnType<typeof estimateTab>>>;
type Estimate = NonNullable<Data["live"]>;

/**
 * Company estimate: a sealed record. This screen never holds the figure or an amendment
 * reason: the read model omits both, and every place they would show reads "Sealed". The
 * figure is seen only in the browser while it is typed, then absent from every page,
 * response and address.
 */
export function EstimateSection({ d }: { d: Data }) {
  const exerciseId = d.exercise.id;
  const people = d.people.map((p) => ({ value: p.id, label: p.name }));
  const e = d.live;
  return (
    <div className="flex flex-col gap-6">
      <Callout tone="warn" title="Sealed on screen, not yet in storage">{d.statement}</Callout>

      {!e ? (
        <Card>
          <CardHeader
            icon={<ShieldIcon size={17} />}
            title={<span className="inline-flex flex-wrap items-center gap-2">Company estimate <Chip tone="err">{d.badge}</Chip></span>}
            subtitle="Prepared by one officer, amended with reasons, lodged into the sealed set before the bids are opened."
          />
          <EmptyState size="sm" title="No company estimate yet" action={<PrepareEstimateDrawer exerciseId={exerciseId} people={people} allowed={d.prepare} />}>
            {d.voided.length > 0 ? "The earlier estimate was voided. A new officer prepares a fresh one from version 1." : "Prepare it before the tender documents go for approval, where the sourcing method asks for one."}
          </EmptyState>
        </Card>
      ) : (
        <Live e={e} d={d} exerciseId={exerciseId} people={people} />
      )}

      {d.voided.length > 0 && (
        <Card>
          <CardHeader icon={<ClockIcon size={17} />} title="Voided estimates" subtitle="Kept on record. Their versions stay sealed." />
          <CardBody>
            <ul className="divide-y divide-line/70 rounded-2xl border border-line">
              {d.voided.map((v) => (
                <li key={v.id} className="flex flex-col gap-1 px-4 py-3">
                  <span className="text-[13.5px] font-semibold break-words text-ink">
                    Prepared by {v.preparerName}, {v.currentVersionNo === 1 ? "one version" : `${v.currentVersionNo} versions`}, voided
                  </span>
                  <span className="text-[13px] break-words text-ink-2">{v.voidReason || "No reason recorded."}</span>
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>
      )}
    </div>
  );
}

function Live({ e, d, exerciseId, people }: { e: Estimate; d: Data; exerciseId: string; people: { value: string; label: string }[] }) {
  const lodged = e.state === "Lodged";
  const closed = e.state === "Void" || e.state === "Disclosed at opening";
  return (
    <>
      <Card>
        <CardHeader
          icon={<ShieldIcon size={17} />}
          title={<span className="inline-flex flex-wrap items-center gap-2">Company estimate <Chip tone="err">{d.badge}</Chip></span>}
          subtitle="The figure is never shown here. What is recorded is who, when and how many versions."
          actions={<Badge tone={lodged ? "ok" : "info"} dot>{e.state}</Badge>}
        />
        <CardBody className="flex flex-col gap-5">
          {e.lodgementBehind && (
            <Callout tone="warn">The estimate was amended after version {e.lodgedVersionNo} was lodged. The lodged copy is behind: lodge the current version.</Callout>
          )}
          <KeyValues
            columns={3}
            items={[
              { label: "Prepared by", value: e.preparer },
              { label: "Prepared on", value: e.preparedOn ? formatDate(e.preparedOn) : "—" },
              { label: "Current version", value: String(e.currentVersionNo) },
              { label: "Lodged version", value: e.lodgedVersionNo ? `Version ${e.lodgedVersionNo}` : "Not lodged yet" },
              // The place on the estimate is the last copy recorded, which is of the version named.
              { label: "Retained copy", value: e.retainedVersionNo != null ? `Version ${e.retainedVersionNo}, at ${e.retainedPlace ?? "a place not recorded"}` : "Not recorded" },
            ]}
          />
          {!closed && (
            <div className="flex flex-wrap items-start gap-3 border-t border-line pt-5">
              <AmendEstimateDrawer exerciseId={exerciseId} estimateId={e.id} preparerName={e.preparerName} preparerPersonId={e.preparerPersonId} versionNo={e.currentVersionNo} allowed={e.actions.amend} />
              {(!lodged || e.lodgementBehind) && <LodgeEstimateDrawer exerciseId={exerciseId} estimateId={e.id} versionNo={e.currentVersionNo} people={people} allowed={e.actions.lodge} again={e.lodgementBehind} />}
              {e.retainedCopyDue && <RetainCopyDrawer exerciseId={exerciseId} estimateId={e.id} people={people} allowed={e.actions.retain} versionNo={e.lodgedVersionNo} />}
              <VoidEstimateDrawer exerciseId={exerciseId} estimateId={e.id} preparerName={e.preparerName} people={people} allowed={e.actions.void} />
            </div>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader icon={<ClockIcon size={17} />} title="Lead time" subtitle="How long before closing the last version has to be made." actions={<Badge tone={e.lead.badge.tone} dot>{e.lead.badge.label}</Badge>} />
        <CardBody className="flex flex-col gap-1.5">
          <p className="text-[13.5px] text-ink">{e.lead.text}</p>
          <p className="text-[12.5px] text-ink-3">{e.lead.reading}</p>
        </CardBody>
      </Card>

      <Card className="overflow-hidden">
        <CardHeader icon={<ShieldIcon size={17} />} title="Versions" subtitle="Each is kept, sealed. A version made after the first needs a reason, sealed with its figure." divided={false} />
        <DataList
          flat
          selectable={false}
          searchable={false}
          toolbar={false}
          exportName="estimate-versions"
          emptyTitle="No versions"
          columns={[
            { key: "no", label: "Version", width: "14%", mobile: "primary" },
            { key: "on", label: "Prepared on", width: "20%", nowrap: true, mobile: "meta" },
            { key: "by", label: "Prepared by", width: "26%", mobile: "meta" },
            { key: "value", label: "Figure", width: "16%", mobile: "meta" },
            { key: "reason", label: "Reason", mobile: "meta" },
          ]}
          rows={e.versions.map((v) => ({
            id: String(v.versionNo),
            search: `${v.versionNo} ${v.preparer}`,
            cells: {
              no: { kind: "text", text: `Version ${v.versionNo}` },
              on: { kind: "text", text: formatDate(v.preparedOn) },
              by: { kind: "text", text: v.preparer },
              value: { kind: "chip", text: v.value, tone: "err" },
              reason: v.reason ? { kind: "chip", text: v.reason, tone: "err" } : { kind: "text", text: "None needed for the first version", dim: true },
            },
          }))}
        />
      </Card>

      <Card>
        <CardHeader icon={<ClockIcon size={17} />} title="Custody" subtitle="Who prepared, lodged and kept each copy. Recorded on behalf of, not signed: nobody signs in yet." />
        <CardBody>
          {e.events.length === 0 ? (
            <EmptyState size="sm" title="No custody events yet" />
          ) : (
            <ol className="divide-y divide-line/70 rounded-2xl border border-line">
              {e.events.map((x) => (
                <li key={x.id} className="flex flex-col gap-0.5 px-4 py-3">
                  <span className="flex flex-wrap items-baseline justify-between gap-x-3">
                    <span className="text-[13.5px] font-semibold text-ink">
                      {x.kind}
                      {x.versionNo ? `, version ${x.versionNo}` : ""}
                      {x.copyNo ? `, copy ${x.copyNo}` : ""}
                    </span>
                    <span className="text-[12.5px] text-ink-3">{formatOrgDateTime(x.at, d.timeZone)}</span>
                  </span>
                  {(x.by || x.capacity) && <span className="text-[13px] break-words text-ink-2">{[x.by, x.capacity].filter(Boolean).join(" · ")}</span>}
                  {x.note && <span className="text-[13px] break-words text-ink-2">{x.note}</span>}
                </li>
              ))}
            </ol>
          )}
        </CardBody>
      </Card>
    </>
  );
}
