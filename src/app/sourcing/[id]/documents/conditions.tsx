import { CheckIcon, GavelIcon, UsersIcon } from "@/components/icons";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Callout } from "@/components/ui/feedback";
import { capFirst } from "@/lib/tender-docs/frozen-view";
import type { ConditionsTab, LiveConditions } from "@/lib/tender-docs/read-conditions";

import { AddRequirementDrawer, ConfirmAssuranceDrawer, OverrideClauseDrawer, PermitDrawer, RemoveAssuranceDrawer, RemoveOverrideDrawer, RemoveRequirementDrawer, RestrictionDrawer } from "./conditions-editors";

/**
 * The Tender documents tab's increment-2 cards: the tender's conditions (who may bid, the
 * restriction, the regulator permit), assurance and the mandatory clauses. Words only, from
 * `conditionsTab`; every act is the shared drawer, disabled with its reason where refused.
 */

const tone = (l: string) => (l === "block" ? "err" : l === "info" ? "info" : "warn") as "err" | "warn" | "info";
const NOT_SET = "Not set";
const Value = ({ v }: { v: string }) => (v === NOT_SET ? <Badge tone="warn">Not set</Badge> : <span className="break-words">{v}</span>);

function Findings({ items }: { items: { level: string; text: string }[] }) {
  if (!items.length) return null;
  return (
    <ul className="flex flex-col gap-2">
      {items.map((f, i) => (
        <li key={i}>
          <Callout tone={tone(f.level)}>{f.text}</Callout>
        </li>
      ))}
    </ul>
  );
}

function Row({ title, value, action, children }: { title: string; value?: React.ReactNode; action?: React.ReactNode; children?: React.ReactNode }) {
  return (
    <li className="flex flex-col gap-2 px-4 py-3">
      <span className="flex flex-col gap-1.5 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:gap-x-4">
        <span className="min-w-0 text-[13.5px] font-semibold break-words text-ink">{title}</span>
        <span className="flex min-w-0 flex-wrap items-center gap-2 text-[13px] text-ink-2">
          {value}
          {action}
        </span>
      </span>
      {children}
    </li>
  );
}

/**
 * Which cards the exercise shows: a draft exercise has no pack yet and shows only the tender's
 * conditions (they are editable from the draft, BD-64-32); a frozen pack shows what it froze.
 */
export function ConditionsCards({ c, packless }: { c: ConditionsTab; packless: boolean }) {
  if (c.mode === "frozen") return <FrozenCards c={c} />;
  if (c.mode === "before") return <BeforeCards c={c} />;
  return <LiveCards c={c} packless={packless} />;
}

type Frozen = Extract<ConditionsTab, { mode: "frozen" }>;
type Before = Extract<ConditionsTab, { mode: "before" }>;

const Registrations = ({ groups }: { groups: { number: number; heading: string; items: { id?: string; body: string; qualifiers: string | null }[] }[] }) =>
  groups.length === 0 ? (
    <p className="rounded-2xl border border-dashed border-line px-4 py-3 text-[13px] text-ink-2">
      <Badge tone="warn">Not set</Badge> <span className="ml-1">No registration is recorded, so the notice has no eligibility block.</span>
    </p>
  ) : (
    <ul className="divide-y divide-line/70 rounded-2xl border border-line">
      {groups.map((g) => (
        <li key={g.number} className="flex flex-col gap-1.5 px-4 py-3">
          <span className="text-[12px] font-semibold text-ink-3">{g.heading}</span>
          <ul className="flex flex-col gap-1.5">
            {g.items.map((r) => (
              <li key={r.id ?? r.body} className="min-w-0 text-[13.5px] break-words text-ink">
                <span className="font-semibold">{capFirst(r.body)}</span>
                {r.qualifiers && <span className="text-ink-2"> · {r.qualifiers}</span>}
              </li>
            ))}
          </ul>
        </li>
      ))}
    </ul>
  );

/// A pack with approval or approved: every card is what was frozen, with no control and no live finding (C1).
function FrozenCards({ c }: { c: Frozen }) {
  const f = c.frozen;
  return (
    <>
      <Card id="conditions" className="scroll-mt-24 overflow-hidden">
        <CardHeader icon={<UsersIcon size={17} />} title="Tender conditions" subtitle={`As frozen with version ${f.version}, judged ${f.judgedOn}. They change only in a new version, after a return.`} />
        <CardBody className="flex flex-col gap-5">
          <div>
            <p className="mb-2 text-[12px] font-semibold text-ink-3">Registrations bidders must hold</p>
            <Registrations groups={f.groups.map((g) => ({ ...g, items: g.items }))} />
            {f.notice && <p className="mt-2 text-[12.5px] text-ink-3">{f.notice}.</p>}
          </div>
          <ul className="divide-y divide-line/70 rounded-2xl border border-line">
            <Row title={f.restriction.question} value={<Value v={f.restriction.answer} />}>
              {f.restriction.stampEn != null && (
                <span className="text-[12.5px] break-words text-ink-3">
                  Stamped on every generated document: {f.restriction.stampEn === NOT_SET ? "English wording not set" : `“${f.restriction.stampEn}”`}
                  {f.restriction.stampMs ? ` · “${f.restriction.stampMs}”` : ""}
                </span>
              )}
            </Row>
            <Row title="Needs the regulator's permit" value={<Value v={f.permit.answer} />}>
              {f.permit.type != null && <span className="text-[12.5px] text-ink-3">Permit type: {f.permit.type === NOT_SET ? "not chosen" : f.permit.type}</span>}
            </Row>
          </ul>
          {f.tableDocument.length > 0 && (
            <div>
              <p className="mb-2 text-[12px] font-semibold text-ink-3">In the Tender Table Document</p>
              <ul className="flex list-disc flex-col gap-1 pl-5 text-[13.5px] text-ink">
                {f.tableDocument.map((t) => (
                  <li key={t}>{t}</li>
                ))}
              </ul>
            </div>
          )}
        </CardBody>
      </Card>

      <Card id="assurance" className="scroll-mt-24 overflow-hidden">
        <CardHeader icon={<CheckIcon size={17} />} title="Assurance" subtitle="Who confirmed the documents before they went for approval, and the day." actions={<Badge tone={f.assurance.required === NOT_SET ? "warn" : "neutral"}>{f.assurance.required === NOT_SET ? "Policy was not set" : f.assurance.required}</Badge>} />
        <CardBody>
          {f.assurance.rows.length === 0 ? (
            <p className="text-[13px] text-ink-2">{f.assurance.required === NOT_SET ? "The policy was not set when the documents were frozen." : "No confirmation was needed."}</p>
          ) : (
            <ul className="divide-y divide-line/70 rounded-2xl border border-line">
              {f.assurance.rows.map((x) => (
                <Row key={x.label} title={x.label} value={x.by ? <Badge tone="ok" dot>Confirmed</Badge> : <Badge tone="warn">Not confirmed</Badge>}>
                  {x.by && (
                    <span className="text-[12.5px] break-words text-ink-3">
                      {x.by} · {x.on}
                    </span>
                  )}
                </Row>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>

      <Card id="clauses" className="scroll-mt-24 overflow-hidden">
        <CardHeader icon={<GavelIcon size={17} />} title="Mandatory clauses" subtitle="The clauses every agreement carries, as frozen with this version." />
        <CardBody>
          {f.clauses.length === 0 ? (
            <p className="text-[13px] text-ink-2">No clause was required when the documents were frozen.</p>
          ) : (
            <ul className="divide-y divide-line/70 rounded-2xl border border-line">
              {f.clauses.map((x) => (
                <Row key={x.title} title={x.title} value={<Badge tone={x.override ? "neutral" : "ok"}>{x.status}</Badge>}>
                  <span className="text-[12.5px] text-ink-3">{x.version}</span>
                  {x.override && <span className="text-[12.5px] break-words text-ink-3">{x.override}</span>}
                </Row>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>
    </>
  );
}

/// A pack frozen before the conditions were recorded with it: the callout, and the recorded answers, with no finding.
function BeforeCards({ c }: { c: Before }) {
  return (
    <Card id="conditions" className="scroll-mt-24 overflow-hidden">
      <CardHeader icon={<UsersIcon size={17} />} title="Tender conditions" subtitle={`Version ${c.version} was frozen before they were recorded with it.`} />
      <CardBody className="flex flex-col gap-5">
        <Callout tone="info">{c.before}</Callout>
        <div>
          <p className="mb-2 text-[12px] font-semibold text-ink-3">Registrations bidders must hold</p>
          <Registrations groups={c.groups} />
        </div>
        <ul className="divide-y divide-line/70 rounded-2xl border border-line">
          <Row title={c.restriction.question} value={<Value v={c.restriction.answer} />} />
          <Row title="Needs the regulator's permit" value={<Value v={c.permit.answer} />}>
            {c.permit.type != null && <span className="text-[12.5px] text-ink-3">Permit type: {c.permit.type === NOT_SET ? "not chosen" : c.permit.type}</span>}
          </Row>
        </ul>
      </CardBody>
    </Card>
  );
}

function LiveCards({ c, packless }: { c: LiveConditions; packless: boolean }) {
  return (
    <>
      <Card id="conditions" className="scroll-mt-24 overflow-hidden">
        <CardHeader
          icon={<UsersIcon size={17} />}
          title="Tender conditions"
          subtitle="Who may bid, whether the tender is restricted, and the regulator's permit. Unanswered is never read as no."
          actions={<AddRequirementDrawer exerciseId={c.exerciseId} allowed={c.eligibility.noBodies ? { allowed: false, reason: c.eligibility.noBodies } : c.edit} bodies={c.eligibility.bodyOptions} groups={c.eligibility.groupOptions} typeTest={c.eligibility.typeTest} />}
        />
        <CardBody className="flex flex-col gap-5">
          <div>
            <p className="mb-2 text-[12px] font-semibold text-ink-3">Registrations bidders must hold</p>
            {c.eligibility.groups.length === 0 ? (
              <p className="rounded-2xl border border-dashed border-line px-4 py-3 text-[13px] text-ink-2">
                <Badge tone="warn">Not set</Badge> <span className="ml-1">No registration is recorded, so the notice has no eligibility block.</span>
              </p>
            ) : (
              <ul className="divide-y divide-line/70 rounded-2xl border border-line">
                {c.eligibility.groups.map((g) => (
                  <li key={g.number} className="flex flex-col gap-1.5 px-4 py-3">
                    <span className="text-[12px] font-semibold text-ink-3">{g.heading}</span>
                    <ul className="flex flex-col gap-1.5">
                      {g.items.map((r) => (
                        <li key={r.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
                          <span className="min-w-0 text-[13.5px] break-words text-ink">
                            <span className="font-semibold">{capFirst(r.body)}</span>
                            {r.qualifiers && <span className="text-ink-2"> · {r.qualifiers}</span>}
                          </span>
                          <RemoveRequirementDrawer exerciseId={c.exerciseId} id={r.id} label={capFirst(r.body)} allowed={c.edit} />
                        </li>
                      ))}
                    </ul>
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-2 text-[12.5px] text-ink-3">
              The notice states each registration must be valid from the day tendering starts to the closing day: the days proposed when the documents are submitted. The contract type&apos;s registration test: {c.eligibility.typeTest}.
            </p>
          </div>
          <ul className="divide-y divide-line/70 rounded-2xl border border-line">
            <Row title={c.restriction.question} value={<Value v={c.restriction.answer} />} action={<RestrictionDrawer exerciseId={c.exerciseId} question={c.restriction.question} raw={c.restriction.raw} allowed={c.edit} />}>
              {c.restriction.answer === "Yes" && (
                <span className="text-[12.5px] break-words text-ink-3">
                  Stamped on every generated document: {c.restriction.stampEn === NOT_SET ? "English wording not set" : `“${c.restriction.stampEn}”`}
                  {c.restriction.stampMs !== NOT_SET ? ` · “${c.restriction.stampMs}”` : ""}
                </span>
              )}
            </Row>
            <Row title="Needs the regulator's permit" value={<Value v={c.permit.answer} />} action={<PermitDrawer exerciseId={c.exerciseId} raw={c.permit.raw} rawPermit={c.permit.rawPermit} options={c.permit.options} list={c.permit.list} allowed={c.edit} />}>
              {c.permit.permit != null && (
                <span className="text-[12.5px] text-ink-3">
                  Permit type: {c.permit.permit === NOT_SET ? "not chosen" : c.permit.permit}
                </span>
              )}
            </Row>
          </ul>
          <Findings items={[...c.eligibility.findings, ...c.restriction.findings, ...c.permit.findings]} />
        </CardBody>
      </Card>

      {!packless && (
        <>
          <Card id="assurance" className="scroll-mt-24 overflow-hidden">
            <CardHeader
              icon={<CheckIcon size={17} />}
              title="Assurance"
              subtitle="Named officers confirm the documents before they go for approval, each with the day."
              actions={<Badge tone={c.assurance.required === NOT_SET ? "warn" : "neutral"}>{c.assurance.required === NOT_SET ? "Policy not set" : c.assurance.required}</Badge>}
            />
            <CardBody className="flex flex-col gap-4">
              {c.assurance.policyNotSet && <Callout tone="warn">{c.assurance.policyNotSet}</Callout>}
              <p className="text-[12.5px] text-ink-3">A confirmation is not withdrawn by later edits to the parts. If the documents changed after it was recorded, remove it and confirm again.</p>
              <ul className="divide-y divide-line/70 rounded-2xl border border-line">
                {c.assurance.rows.map((r) => (
                  <Row
                    key={r.kind}
                    title={r.label}
                    value={r.confirmation ? <Badge tone="ok" dot>Confirmed</Badge> : r.notNeeded ? <span className="text-ink-3">Not needed</span> : <Badge tone="warn">Not confirmed</Badge>}
                    action={r.confirmation ? <RemoveAssuranceDrawer exerciseId={c.exerciseId} id={r.confirmation.id} label={r.label} allowed={c.assurance.remove} /> : r.notNeeded ? null : <ConfirmAssuranceDrawer exerciseId={c.exerciseId} kind={r.kind} label={r.label} people={c.people} allowed={r.record} today={c.today} />}
                  >
                    {r.confirmation && (
                      <span className="text-[12.5px] break-words text-ink-3">
                        {r.confirmation.by} · {r.confirmation.on}
                        {r.confirmation.note ? ` · “${r.confirmation.note}”` : ""}
                      </span>
                    )}
                    {r.notNeeded && <span className="text-[12.5px] text-ink-3">{r.notNeeded}</span>}
                  </Row>
                ))}
              </ul>
            </CardBody>
          </Card>

          <Card id="clauses" className="scroll-mt-24 overflow-hidden">
            <CardHeader icon={<GavelIcon size={17} />} title="Mandatory clauses" subtitle="Clauses every agreement carries. Leaving one out needs a legal endorsement." />
            <CardBody className="flex flex-col gap-4">
              <p className="text-[12.5px] text-ink-3">Who may give an endorsement is not checked, because no policy names them. The person named and the reason are recorded on behalf of, not signed.</p>
              {c.clauses.none ? (
                <p className="text-[13px] text-ink-2">{c.clauses.none}</p>
              ) : (
                <ul className="divide-y divide-line/70 rounded-2xl border border-line">
                  {c.clauses.rows.map((r) => (
                    <Row
                      key={r.code}
                      title={r.title}
                      value={<Badge tone={r.tone}>{r.status}</Badge>}
                      action={r.override ? <RemoveOverrideDrawer exerciseId={c.exerciseId} id={r.override.id} title={r.title} allowed={c.clauses.remove} /> : r.record && r.status === "Missing" ? <OverrideClauseDrawer exerciseId={c.exerciseId} clauseCode={r.code} title={r.title} people={c.people} allowed={r.record} /> : null}
                    >
                      <span className="text-[12.5px] text-ink-3">{r.version}</span>
                      {r.override && <span className="text-[12.5px] break-words text-ink-3">Endorsed by {r.override.by}: “{r.override.reason}”</span>}
                      {r.findings.map((f) => (
                        <span key={f} className="text-[12.5px] break-words text-amber-800">{f}</span>
                      ))}
                    </Row>
                  ))}
                </ul>
              )}
            </CardBody>
          </Card>
        </>
      )}
    </>
  );
}
