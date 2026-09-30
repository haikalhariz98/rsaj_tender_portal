import { ChartIcon, ClipboardIcon, FileIcon, ShieldIcon } from "@/components/icons";
import { HistoryButton } from "@/components/history-drawer";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Callout, EmptyState } from "@/components/ui/feedback";
import { PageHeader } from "@/components/ui/page-header";
import { ProvenanceBadge } from "@/components/ui/provenance";
import { KeyValues } from "@/components/ui/stat";
import { db } from "@/lib/db";
import { SOURCE_LABEL, SPLIT_KEY_LABEL, TIER_LABEL } from "@/lib/requisition/labels";
import { loadControls, loadPolicy, requisitionOrg } from "@/lib/requisition/repo";

import { EditCheckSource, EditErpFormat, EditPolicy } from "./editors";

export const dynamic = "force-dynamic";

/// A setting's value, or "Not set" and what that stops.
function Setting({ value, unset, action }: { value: React.ReactNode | null; unset: string; action?: React.ReactNode }) {
  if (value != null) return <>{value}</>;
  return (
    <span className="flex flex-col items-start gap-1.5">
      <Badge tone="warn">Not set</Badge>
      <span className="text-[12.5px] text-ink-3">{unset}</span>
      {action}
    </span>
  );
}

/// A regular expression, said in words: the configured description, else that a shape
/// is set. The pattern itself is a configuration key and stays in the editor.
function shapeInWords(f: { description: string | null; example: string | null }) {
  return f.description?.trim() || "Checked against a set shape";
}

/**
 * Requisition controls: the customer's policy for requisitions. Every control ships
 * unset (6.1 rulings OD-3, OD-7, OD-8, OD-10), and each unset one says here what it
 * stops or what the portal does instead.
 */
export default async function RequisitionControlsPage() {
  const org = await requisitionOrg();
  if (!org) {
    return (
      <>
        <PageHeader title="Requisition controls" subtitle="Endorsement tiers, the splitting check, budget re-checks and registration." />
        <Card>
          <EmptyState title="No organisation is configured">Run the setup first.</EmptyState>
        </Card>
      </>
    );
  }
  const [policy, controls, formats, offices] = await Promise.all([
    loadPolicy(org.id),
    loadControls(org.id),
    db.codeFormat.findMany({ where: { organisationId: org.id, key: { in: ["erp_requisition_no", "erp_note_no"] } } }),
    db.authorityRole.findMany({ where: { organisationId: org.id, isCommittee: false }, orderBy: [{ sortOrder: "asc" }, { nameEn: "asc" }], select: { code: true, nameEn: true } }),
  ]);
  const justifier = policy.splitJustifyingRoleCode ? (offices.find((o) => o.code === policy.splitJustifyingRoleCode)?.nameEn ?? "An office no longer configured") : null;
  const unset = [
    policy.endorsementTiers.length === 0,
    policy.erpReferenceRequired == null,
    policy.budgetRecheckDays == null,
    policy.splittingWindowDays == null,
    policy.splittingMatchOn.length === 0,
    policy.splittingAggregateAcrossYear == null,
    policy.splitJustifyingRoleCode == null,
    controls.budgetCheckSource == null,
  ].filter(Boolean).length;
  const format = (key: string) => formats.find((f) => f.key === key) ?? null;

  return (
    <>
      <PageHeader
        title="Requisition controls"
        badge={unset > 0 ? <Badge tone="warn" dot>{`${unset} not set`}</Badge> : <Badge tone="ok" dot>All set</Badge>}
        subtitle="Whose endorsement a requisition needs, when it registers, where its budget check comes from, and how a split is caught."
        meta={[
          <span key="p" className="inline-flex items-center gap-1.5">
            Where these controls come from <ProvenanceBadge value={policy.provenance} />
          </span>,
        ]}
        actions={
          <>
            {policy.id && <HistoryButton entity="RequisitionPolicy" entityId={policy.id} label="Requisition controls" />}
            <EditPolicy policy={policy} notes={policy.notes} offices={offices} />
          </>
        }
      />

      <div className="flex flex-col gap-6">
        {(policy.splittingWindowDays == null || policy.splittingMatchOn.length === 0 || policy.splittingAggregateAcrossYear == null) && (
          <Callout tone="warn" title="The splitting check is not set" action={<EditPolicy policy={policy} notes={policy.notes} offices={offices} label="Set it" quiet />}>
            No governing document says when two requisitions are one requirement split in pieces. Until the window, the related
            fields and whether the financial year aggregates are all set, every requisition is submitted with its splitting check recorded as not assessed, and approvers see that.
            It is never shown as clear.
          </Callout>
        )}

        <Card>
          <CardHeader icon={<ShieldIcon size={17} />} title="Endorsement" subtitle="Whose endorsement a requisition needs before it is registered." />
          <CardBody>
            <KeyValues
              items={[
                {
                  label: "Tiers whose heads endorse",
                  value: (
                    <Setting
                      value={policy.endorsementTiers.length ? policy.endorsementTiers.map((t) => TIER_LABEL[t]).join(", then ") : null}
                      unset="No requisition can be endorsed, so none can be registered or submitted. Nothing is assumed."
                      action={<EditPolicy policy={policy} notes={policy.notes} offices={offices} label="Set it" quiet />}
                    />
                  ),
                },
              ]}
            />
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            icon={<FileIcon size={17} />}
            title="Registration"
            subtitle="The finance system's requisition and note numbers are consumed here, never issued."
          />
          <CardBody className="flex flex-col gap-5">
            <KeyValues
              columns={2}
              items={[
                {
                  label: "Registration needs the finance system's numbers",
                  value: (
                    <Setting
                      value={policy.erpReferenceRequired == null ? null : policy.erpReferenceRequired ? "Yes — both numbers before registering" : "No — they are recorded when known"}
                      unset="Registration is refused until this is decided."
                      action={<EditPolicy policy={policy} notes={policy.notes} offices={offices} label="Set it" quiet />}
                    />
                  ),
                },
              ]}
            />
            <div className="grid gap-4 border-t border-line pt-5 md:grid-cols-2">
              {(
                [
                  ["erp_requisition_no", "Finance system requisition no."],
                  ["erp_note_no", "Requisition note no."],
                ] as const
              ).map(([key, label]) => {
                const f = format(key);
                return (
                  <div key={key} className="flex min-w-0 flex-col gap-2 rounded-2xl border border-line bg-sunken/60 p-4">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[13px] font-semibold text-ink-2">{label}</span>
                      <EditErpFormat formatKey={key} label={label} current={f ? { pattern: f.pattern, example: f.example, description: f.description, provenance: f.provenance } : null} />
                    </div>
                    {f ? (
                      <div className="min-w-0 text-[13px] text-ink-2">
                        <span className="block">{shapeInWords(f)}</span>
                        {f.example && (
                          <span className="block text-ink-3">
                            For example <span className="font-mono">{f.example}</span>
                          </span>
                        )}
                        <span className="mt-1 block">
                          <ProvenanceBadge value={f.provenance} />
                        </span>
                      </div>
                    ) : (
                      <Setting value={null} unset="The number is recorded as typed and not checked against any shape." />
                    )}
                  </div>
                );
              })}
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            icon={<ChartIcon size={17} />}
            title="Budget check"
            subtitle="Where the figures come from and when they go stale."
            actions={
              <>
                <EditCheckSource source={controls.budgetCheckSource} />
                <ButtonLink href="/configuration/budget?tab=controls" size="sm" variant="secondary">
                  Budget controls
                </ButtonLink>
              </>
            }
          />
          <CardBody>
            <KeyValues
              columns={2}
              items={[
                {
                  label: "Source",
                  value: (
                    <Setting
                      value={controls.budgetCheckSource ? SOURCE_LABEL[controls.budgetCheckSource] : null}
                      unset="No budget check can run, so nothing can be submitted. It never falls back to either source."
                    />
                  ),
                },
                {
                  label: "Re-checked on submission when older than",
                  value: <Setting value={policy.budgetRecheckDays == null ? null : `${policy.budgetRecheckDays} days`} unset="A check never goes stale, and is not re-run on submission." action={<EditPolicy policy={policy} notes={policy.notes} offices={offices} label="Set it" quiet />} />,
                },
                {
                  label: "Over budget (Budget controls)",
                  value: (
                    <Setting
                      value={
                        controls.availabilityCheck === "advisory"
                          ? "Routes to the over-budget approvers on its own, with a warning"
                          : controls.availabilityCheck === "blocking"
                            ? "Held until the officer invokes the over-budget route"
                            : null
                      }
                      unset="Held until the officer invokes the over-budget route, and the trail says the control was not set."
                    />
                  ),
                },
                {
                  label: "Commit on approval (Budget controls)",
                  value: (
                    <Setting
                      value={controls.commitOnApproval == null ? null : controls.commitOnApproval ? "Yes — approval writes the commitment" : "No"}
                      unset="Approval writes no commitment, and the requisition says so."
                    />
                  ),
                },
              ]}
            />
          </CardBody>
        </Card>

        <Card>
          <CardHeader icon={<ClipboardIcon size={17} />} title="Anti-splitting" subtitle="When two requisitions count as one requirement split below a threshold." />
          <CardBody>
            <KeyValues
              columns={2}
              items={[
                { label: "Window", value: <Setting value={policy.splittingWindowDays == null ? null : `${policy.splittingWindowDays} days`} unset="Not assessed on any requisition." action={<EditPolicy policy={policy} notes={policy.notes} offices={offices} label="Set it" quiet />} /> },
                {
                  label: "Related when they share",
                  value: (
                    <Setting
                      value={policy.splittingMatchOn.length ? policy.splittingMatchOn.map((k) => SPLIT_KEY_LABEL[k]).join(", ") : null}
                      unset="Not assessed on any requisition."
                      action={<EditPolicy policy={policy} notes={policy.notes} offices={offices} label="Set it" quiet />}
                    />
                  ),
                },
                {
                  label: "Whole financial year",
                  value: (
                    <Setting
                      value={policy.splittingAggregateAcrossYear == null ? null : policy.splittingAggregateAcrossYear ? "Also related across the financial year" : "The window only"}
                      unset="Not assessed on any requisition: whether the year aggregates is policy too."
                      action={<EditPolicy policy={policy} notes={policy.notes} offices={offices} label="Set it" quiet />}
                    />
                  ),
                },
                {
                  label: "Who may justify a possible split",
                  value: (
                    <Setting
                      value={justifier ? `Someone holding the ${justifier} office directly for the requesting department — never a delegate, the requester or an endorser` : null}
                      unset="No flag can be justified, so a flagged requisition cannot be finally approved."
                      action={<EditPolicy policy={policy} notes={policy.notes} offices={offices} label="Set it" quiet />}
                    />
                  ),
                },
                { label: "Flagged requisitions", value: "Need a recorded justification before their final approval." },
              ]}
            />
          </CardBody>
        </Card>

        {policy.notes && (
          <Card>
            <CardHeader title="Notes" />
            <CardBody className="text-[14px] whitespace-pre-line text-ink-2">{policy.notes}</CardBody>
          </Card>
        )}
      </div>
    </>
  );
}
