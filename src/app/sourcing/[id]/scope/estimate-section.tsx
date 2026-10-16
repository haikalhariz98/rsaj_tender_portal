import { Accordion } from "@/components/accordion";
import { DataList } from "@/components/data-list";
import { ClockIcon, ShieldIcon } from "@/components/icons";
import { Badge, Chip } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
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
      {!e ? (
        <Card id="company-estimate" className="scroll-mt-24">
          <CardHeader
            icon={<ShieldIcon size={17} />}
            title={<span className="inline-flex flex-wrap items-center gap-2">Company estimate <Chip tone="err">{d.badge}</Chip></span>}
            subtitle="Prepared by one officer, amended with reasons, lodged into the sealed set before the bids are opened."
          />
          <EmptyState
            size="sm"
            title={d.empty.title}
            action={
              <span className="flex flex-wrap items-center justify-center gap-3">
                {d.empty.state === "RULE_NOT_SET" && <ButtonLink href={d.configHref} size="sm" variant="secondary">Set it under Configuration</ButtonLink>}
                <PrepareEstimateDrawer exerciseId={exerciseId} people={people} allowed={d.prepare} />
              </span>
            }
          >
            {d.empty.body}
          </EmptyState>
        </Card>
      ) : (
        <Live e={e} d={d} exerciseId={exerciseId} />
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

function Live({ e, d, exerciseId }: { e: Estimate; d: Data; exerciseId: string }) {
  const lodged = e.state === "Lodged";
  const closed = e.state === "Void" || e.state === "Disclosed at opening";
  return (
    <>
      <Card id="company-estimate" className="scroll-mt-24">
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
          {e.relodge && (
            <Callout tone="warn">
              The key this estimate was sealed under has changed, so version {e.lodgedVersionNo} no longer counts as lodged and an opening cannot start. The officer who lodged it lodges the same version again, with a reason. Nothing is done for them.
            </Callout>
          )}
          {e.online && !lodged && !e.sealedKeyReady && (
            <Callout tone="info">This exercise takes bids online, so a sealed copy of the estimate is lodged under its key. The estimate itself is still held unencrypted in the database. The key does not exist yet: every named opening officer sets their own share first, under Scope and estimate, Opening officers.</Callout>
          )}
          {(e.lead.badge.tone === "err" || e.lead.badge.tone === "warn") && !closed && <Callout tone={e.lead.badge.tone}>{e.lead.text}</Callout>}
          <KeyValues
            columns={3}
            items={[
              { label: "Prepared by", value: e.preparer },
              { label: "Started on", value: e.startedOn ? formatDate(e.startedOn) : "—" },
              { label: "Current version", value: `Version ${e.currentVersionNo}${e.currentVersionOn ? `, made on ${formatDate(e.currentVersionOn)}` : ""}` },
              { label: "Lodged version", value: e.lodgedVersionNo ? `Version ${e.lodgedVersionNo}` : "Not lodged yet" },
              // The place on the estimate is the last copy recorded, which is of the version named.
              { label: "Retained copy", value: e.retainedVersionNo != null ? `Version ${e.retainedVersionNo}, at ${e.retainedPlace ?? "a place not recorded"}` : "Not recorded" },
            ]}
          />
          {!closed && (
            <div className="flex flex-wrap items-start gap-3 border-t border-line pt-5">
              <AmendEstimateDrawer exerciseId={exerciseId} estimateId={e.id} preparerName={e.preparerName} versionNo={e.currentVersionNo} lodged={lodged} allowed={e.actions.amend} />
              {(!lodged || e.lodgementBehind || e.relodge) && <LodgeEstimateDrawer exerciseId={exerciseId} estimateId={e.id} versionNo={e.currentVersionNo} allowed={e.actions.lodge} again={e.lodgementBehind} relodge={e.relodge} online={e.online} />}
              {e.retainedCopyDue && <RetainCopyDrawer exerciseId={exerciseId} estimateId={e.id} allowed={e.actions.retain} versionNo={e.lodgedVersionNo} />}
              <VoidEstimateDrawer exerciseId={exerciseId} estimateId={e.id} preparerName={e.preparerName} allowed={e.actions.void} />
            </div>
          )}
        </CardBody>
      </Card>

      <Accordion title="History" meta={`${e.versions.length === 1 ? "1 version" : `${e.versions.length} versions`}, lead time, custody`}>
        <div className="flex flex-col gap-6 p-5">
          <section aria-labelledby="estimate-lead" className="flex flex-col gap-1.5">
            <h3 id="estimate-lead" className="flex flex-wrap items-center gap-2 text-[13.5px] font-semibold text-ink">
              Lead time <Badge tone={e.lead.badge.tone} dot>{e.lead.badge.label}</Badge>
            </h3>
            <p className="text-[12.5px] text-ink-3">How long before closing the last version has to be made.</p>
            <p className="text-[13.5px] text-ink">{e.lead.text}</p>
            <p className="text-[13.5px] text-ink">{e.lead.configured}</p>
            <p className="text-[12.5px] text-ink-3">{e.lead.reading}</p>
          </section>

          <section aria-labelledby="estimate-versions" className="flex flex-col gap-2">
            <h3 id="estimate-versions" className="text-[13.5px] font-semibold text-ink">Versions</h3>
            <p className="text-[12.5px] text-ink-3">Each is kept, sealed. A version made after the first needs a reason, sealed with its figure.</p>
            <div className="overflow-hidden rounded-2xl border border-line">
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
            </div>
          </section>

          <section aria-labelledby="estimate-custody" className="flex flex-col gap-2">
            <h3 id="estimate-custody" className="text-[13.5px] font-semibold text-ink">Custody</h3>
            <p className="text-[12.5px] text-ink-3">Who prepared, lodged and kept each copy.</p>
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
          </section>
        </div>
      </Accordion>
    </>
  );
}
