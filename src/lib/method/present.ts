/**
 * An evaluation, in words, for the form's "How this will run" panel (FR-MTD-002). Pure;
 * the route handler returns this and nothing else, so no code reaches the screen.
 */

import { ACT_LABEL } from "@/lib/labels";
import { formatMoney as formatSen } from "@/lib/money";

import type { Evaluation } from "./evaluate";
import { APPOINTMENT_STATE_TEXT, boundarySentence, DERIVATION_TEXT, findingText, NAME_STATE_TEXT, REGIME_LABEL, TAXONOMY_STATE_LABEL, TERMS_STATE_TEXT, TYPE_STATE_LABEL } from "./labels";
import type { Provenance } from "./types";
import type { ApprovedRoute } from "./value";

export interface PresentedRoute {
  status: string;
  rule: string | null;
  steps: { role: string; act: string; actCode: string }[];
  notes: { tone: "warn" | "info" | "err"; text: string }[];
}

export interface Presented {
  value: string;
  regime: string;
  proposed: string;
  method: string | null;
  requisition: { approved: string; preview: string };
  appointment: PresentedRoute;
  nameApproval: PresentedRoute | null;
  terms: { status: string; label: string | null; retention: string; defects: string };
  boundary: { rule: string; onBoundary: boolean; provenance: Provenance; source: string };
  contractType: { status: string; name: string | null; derivation: string; share: string | null };
  taxonomies: { name: string; status: string; value: string | null }[];
  findings: { tone: "err" | "warn" | "info"; text: string }[];
}

const yesNo = (b: boolean | null) => (b == null ? "Not set" : b ? "Applies" : "Does not apply");

export function presentEvaluation(
  ev: Evaluation,
  ctx: {
    name: (code: string) => string;
    typeName: (code: string) => string;
    taxonomyName: (code: string) => string;
    valueName: (taxonomy: string, code: string) => string;
    approved: ApprovedRoute | null;
    boundarySource: string;
  },
): Presented {
  const b = ev.bands;
  const route = (a: typeof b.appointment, statusText: string): PresentedRoute => ({
    status: statusText,
    rule: a.ruleLabel ? `${a.ruleLabel}${a.clause ? ` · ${a.clause}` : ""}` : null,
    steps: a.chain.map((s) => ({ role: ctx.name(s.roleCode), act: ACT_LABEL[s.act] ?? "Acts", actCode: s.act })),
    notes: a.warnings.map((w) => ({ tone: w.level === "err" ? "err" : w.level === "info" ? "info" : "warn", text: w.messageEn })),
  });
  const proposed =
    b.proposed.state === "PROPOSED"
      ? `Proposed in this regime: ${b.options.find((m) => m.code === (b.proposed as { code: string }).code)?.nameEn ?? "a method"}.`
      : b.proposed.state === "UNSET"
        ? "No sourcing method is configured."
        : b.proposed.state === "SEVERAL_DEFAULTS"
          ? "More than one method is marked as this regime's default, so none is proposed."
          : "No method is marked as this regime's default, so none is proposed.";
  return {
    value: formatSen(b.value),
    regime: REGIME_LABEL[b.regime],
    proposed,
    method: b.previewMethod?.nameEn ?? null,
    requisition: {
      approved: ctx.approved
        ? ctx.approved.ruleLabel
          ? `Approved under “${ctx.approved.ruleLabel}”, for ${formatSen(ctx.approved.value)}.`
          : `Approved for ${formatSen(ctx.approved.value)}, as received from outside: not checked against the approval matrix.`
        : "No approved route on record.",
      preview: b.requisition.ruleLabel ? `On this exercise's value alone: “${b.requisition.ruleLabel}”${b.requisition.approverCode ? `, approved by the ${ctx.name(b.requisition.approverCode)}` : ""}.` : "No requisition rule matches this value.",
    },
    appointment: route(b.appointment, b.appointment.state === "RESOLVED" ? (b.appointment.approverCode ? `Approved by the ${ctx.name(b.appointment.approverCode)}` : "Resolved") : APPOINTMENT_STATE_TEXT[b.appointment.state]),
    nameApproval: b.nameApproval ? route(b.nameApproval, b.nameApproval.nameState === "RESOLVED" ? `The name is approved by the ${b.nameApproval.approverCode ? ctx.name(b.nameApproval.approverCode) : "approver"}` : NAME_STATE_TEXT[b.nameApproval.nameState]) : null,
    terms: {
      status: b.terms.state === "APPLIES" ? "Applies" : TERMS_STATE_TEXT[b.terms.state],
      label: b.terms.band?.labelEn ?? null,
      retention: yesNo(b.terms.band?.retentionApplies ?? null),
      defects: yesNo(b.terms.band?.defectsLiabilityApplies ?? null),
    },
    boundary: {
      rule: boundarySentence(b.boundary.operator, String(b.boundary.boundaryValue), b.boundary.provenance),
      onBoundary: b.boundary.onBoundary,
      provenance: b.boundary.provenance,
      source: ctx.boundarySource,
    },
    contractType: {
      status: ev.type.state ? TYPE_STATE_LABEL[ev.type.state] : "Not set",
      name: ev.type.code ? ctx.typeName(ev.type.code) : null,
      derivation: ev.derivation.state === "DERIVED" && ev.derivation.code ? `Derived: ${ctx.typeName(ev.derivation.code)}.` : DERIVATION_TEXT[ev.derivation.state],
      share: ev.derivation.sharePct && Number(ev.derivation.sharePct) < 100 ? `${ev.derivation.sharePct.replace(/(\.\d*?)0+$/, "$1").replace(/\.$/, "")}% of the value is the largest deliverable` : ev.derivation.sharePct ? "One deliverable" : null,
    },
    taxonomies: ev.taxonomies.map((t) => ({
      name: ctx.taxonomyName(t.taxonomyCode),
      status: TAXONOMY_STATE_LABEL[t.state],
      value: t.valueCode ? ctx.valueName(t.taxonomyCode, t.valueCode) : null,
    })),
    findings: ev.findings.map((f) => ({ tone: f.level === "block" ? "err" : f.level === "warn" ? "warn" : "info", text: findingText(f) })),
  };
}
