import { PencilIcon } from "@/components/icons";
import { RecordEditor, type Field } from "@/components/record-editor";
import { actorField } from "@/lib/auth/actor-field";
import { buttonClass } from "@/components/ui/button";
import { READER_OFFICE_LABEL } from "@/lib/evaluation/readers";
import { ASPECT_KIND_LABEL, CAPITAL_BASE_LABEL, INPUT_LABEL, OUTCOME_LABEL, ROUTE_LABEL, SCALE_LABEL, SHORTLIST_RULE_LABEL, SIDE_LABEL, STAGE_KIND_LABEL } from "@/lib/evaluation/labels";
import { ASPECT_KINDS, BAND_OUTCOMES, CAPITAL_BASES, COMPUTED_INPUTS, CRITERION_SCALES, EVALUATION_ROUTES, SHORTLIST_RULES, SIDES, STAGE_KINDS } from "@/lib/evaluation/types";

import {
  discardDraft,
  adoptModelDraft,
  issueModel,
  newModelVersion,
  removeBand,
  removeBandSet,
  removeCriterion,
  removeFactor,
  removeStage,
  retireAspect,
  retireModel,
  saveAspect,
  saveBand,
  saveBandSet,
  saveBasisRoute,
  saveCriterion,
  saveEvaluationPolicy,
  saveFactor,
  saveMethodModel,
  saveModel,
  saveStage,
} from "./actions";

/**
 * The drawers of Configuration › Evaluation models. Fields are data; every rule is the action's and
 * the pure checks behind it (`src/lib/evaluation/config.ts`, `modelFaults` at issue). No field carries a
 * default: every number is the customer's, with where it came from. Codes are typed once, when a row is
 * created, as keys; they are never shown after.
 */

type Option = { value: string; label: string };
type Values = Record<string, string | boolean | null>;
const hidden = (name: string): Field => ({ kind: "hidden", name });
const secondary = buttonClass("secondary", "sm");
const ghost = buttonClass("ghost", "sm");
const PROVENANCE: Option[] = [
  { value: "STATED", label: "Stated — written in a governing document" },
  { value: "OBSERVED", label: "Observed — seen in practice, such as an issued report" },
  { value: "ASSUMED", label: "Assumed — a working reading, needs sign-off" },
];
const YES_NO = (yes: string, no: string): Option[] => [
  { value: "yes", label: yes },
  { value: "no", label: no },
];
const opts = <T extends string>(xs: readonly T[], label: Readonly<Record<T, string>>): Option[] => xs.map((x) => ({ value: x, label: label[x] }));
const codeField = (hint = "A configuration key. Never shown on a screen."): Field => ({ kind: "text", name: "code", label: "Code", required: true, mono: true, hint });
const sourceFields: Field[] = [
  { kind: "select", name: "provenance", label: "Where this came from", required: true, placeholder: "Choose", options: PROVENANCE },
  { kind: "text", name: "governingSource", label: "Source", hint: "The clause, form or report it comes from." },
];
const edit = (label: string) => ({ label: `Edit ${label}`, iconOnly: <PencilIcon size={15} /> });

// ------------------------------------------------------------------ models

export function ModelDrawer({ model }: { model?: { id: string; values: Values; label: string } }) {
  return (
    <RecordEditor
      title={model ? `Edit ${model.label}` : "Start an evaluation model"}
      description={model ? "The draft's name, route and source. Its stages, criteria and bands are below." : "A model starts as a draft, version 1. Its stages, criteria and bands are added next; it is offered on an exercise's Window card once issued."}
      columns={2}
      fields={[
        hidden("id"),
        ...(model ? [] : [codeField()]),
        { kind: "text", name: "nameEn", label: "Name", required: true },
        { kind: "text", name: "nameMs", label: "Name (Malay)" },
        { kind: "select", name: "route", label: "Route", required: true, placeholder: "Choose", options: opts(EVALUATION_ROUTES, ROUTE_LABEL), hint: "An exercise pins a model of its contract basis's route." },
        ...sourceFields,
        { kind: "textarea", name: "notes", label: "Notes" },
      ]}
      values={model ? { id: model.id, ...model.values } : undefined}
      action={saveModel}
      submitLabel={model ? "Save" : "Start the draft"}
      trigger={model ? { label: "Edit", className: secondary } : { label: "Start a model", icon: true }}
      size="lg"
    />
  );
}

/// Why the person looking may not issue it, in words (they made it, or nobody is on record as having), and the draft's makers. Null where they may.
export function IssueModelDrawer({ id, label, blocks, warnings, blocked }: { id: string; label: string; blocks: string[]; warnings: string[]; blocked: string | null }) {
  return (
    <RecordEditor
      title={`Issue ${label}`}
      description="Frozen on this version. Exercises pin it when published. Changes are a new version."
      fields={[
        hidden("id"),
        ...(warnings.length ? [{ kind: "note", text: `It may be issued with: ${warnings.join(" ")}` } as Field] : []),
        // Issuing is signed: the password is asked again, every time. The issuer is never one of the people who made the draft.
        actorField("EvaluationModel.issuedBy", { name: "personId" }),
      ]}
      values={{ id }}
      action={issueModel}
      submitLabel="Issue"
      submitBlock={blocked ?? (blocks.length ? blocks.join(" ") : undefined)}
      trigger={{ label: "Issue", className: buttonClass("primary", "sm") }}
      size="md"
    />
  );
}

/// Take over a draft nobody is on record as having made, so that a different person issues it.
export function AdoptModelDraftDrawer({ id, label }: { id: string; label: string }) {
  return (
    <RecordEditor
      title={`Adopt ${label}`}
      description="Nobody made this draft. Adopting makes you its maker. You cannot then issue it."
      fields={[hidden("id")]}
      values={{ id }}
      action={adoptModelDraft}
      submitLabel="Adopt draft"
      reason={{ label: "Why are you adopting it?" }}
      trigger={{ label: "Adopt draft", className: buttonClass("secondary", "sm") }}
      size="sm"
    />
  );
}

export function RetireModelDrawer({ id, label }: { id: string; label: string }) {
  return (
    <RecordEditor
      title={`Retire ${label}`}
      description="No longer offered. Exercises that pinned it keep it."
      fields={[hidden("id")]}
      values={{ id }}
      action={retireModel}
      submitLabel="Retire"
      destructive={{ reasonLabel: "Why is it being retired?" }}
      trigger={{ label: "Retire", className: buttonClass("destructive", "sm") }}
      size="sm"
    />
  );
}

export function DiscardDraftDrawer({ id, label }: { id: string; label: string }) {
  return (
    <RecordEditor
      title={`Discard ${label}`}
      description="Removes the draft. It was never pinned. Its trail is kept."
      fields={[hidden("id")]}
      values={{ id }}
      action={discardDraft}
      submitLabel="Discard"
      destructive={{ reasonLabel: "Why is the draft discarded?" }}
      trigger={{ label: "Discard", className: buttonClass("destructive", "sm") }}
      size="sm"
    />
  );
}

export function NewVersionDrawer({ id, label }: { id: string; label: string }) {
  return (
    <RecordEditor
      title={`New version of ${label}`}
      description="Starts a draft copied row by row. This version stays as issued."
      fields={[hidden("id")]}
      values={{ id }}
      action={newModelVersion}
      submitLabel="Start the new version"
      trigger={{ label: "New version", className: secondary }}
      size="sm"
    />
  );
}

// ------------------------------------------------------------------ stages

export function StageDrawer({ modelId, stage, committees, offices }: { modelId: string; stage?: { id: string; label: string; values: Values }; committees: Option[]; offices: Option[] }) {
  return (
    <RecordEditor
      title={stage ? `Edit ${stage.label}` : "Add a stage"}
      description="A stage in order. A pass mark decides an exact figure. Leave unused fields empty."
      columns={2}
      fields={[
        hidden("modelId"),
        hidden("stageId"),
        ...(stage ? [] : [codeField()]),
        { kind: "number", name: "order", label: "Order", required: true, min: 1 },
        { kind: "text", name: "labelEn", label: "Name", required: true },
        { kind: "text", name: "labelMs", label: "Name (Malay)" },
        { kind: "select", name: "kind", label: "What the stage does", required: true, placeholder: "Choose", options: opts(STAGE_KINDS, STAGE_KIND_LABEL) },
        { kind: "select", name: "side", label: "Who evaluates it", required: true, placeholder: "Choose", options: opts(SIDES, SIDE_LABEL) },
        { kind: "number", name: "unlocksAfterOrder", label: "Opens after the stage of order", min: 1, hint: "Scores are refused until that stage is submitted." },
        { kind: "text", name: "maxMarks", label: "Total marks", hint: "A scored stage: what its top-level criteria sum to." },
        { kind: "text", name: "passMark", label: "Pass mark (%)", hint: "Empty: no pass mark." },
        { kind: "select", name: "passInclusive", label: "A figure exactly on the pass mark", placeholder: "Not set", options: YES_NO("Passes", "Fails") },
        { kind: "select", name: "mustPass", label: "Failing it puts the bidder out", placeholder: "Not set", options: YES_NO("Yes", "No") },
        { kind: "text", name: "compositeWeight", label: "Weight in the composite (%)" },
        { kind: "select", name: "committeeCode", label: "Committee deciding it", placeholder: "None", options: committees, hint: "A two-stage tender's first stage." },
        { kind: "select", name: "shortlistRule", label: "Shortlist rule", placeholder: "None", options: opts(SHORTLIST_RULES, SHORTLIST_RULE_LABEL) },
        { kind: "number", name: "shortlistMin", label: "Fewest shortlisted", min: 1 },
        { kind: "number", name: "shortlistMax", label: "Most shortlisted", min: 1 },
        { kind: "select", name: "shortlistOfficeCode", label: "Office deciding the shortlist", placeholder: "None", options: offices },
        { kind: "select", name: "capitalBase", label: "Minimum capital is a percentage of", placeholder: "None", options: opts(CAPITAL_BASES, CAPITAL_BASE_LABEL) },
        ...sourceFields,
      ]}
      values={{ modelId, stageId: stage?.id ?? null, ...(stage?.values ?? {}) }}
      action={saveStage}
      submitLabel={stage ? "Save" : "Add the stage"}
      trigger={stage ? edit(stage.label) : { label: "Add a stage", icon: true, className: secondary }}
      size="lg"
    />
  );
}

export function RemoveStageDrawer({ modelId, stageId, label }: { modelId: string; stageId: string; label: string }) {
  return (
    <RecordEditor
      title={`Remove ${label}`}
      description="Removes the stage with its criteria and factors."
      fields={[hidden("modelId"), hidden("stageId")]}
      values={{ modelId, stageId }}
      action={removeStage}
      submitLabel="Remove"
      danger
      trigger={{ label: "Remove", className: ghost, ariaLabel: `Remove ${label}` }}
      size="sm"
    />
  );
}

// ------------------------------------------------------------------ criteria, factors

export function CriterionDrawer({ modelId, stageId, stageLabel, criterion, groups, bandSets }: { modelId: string; stageId: string; stageLabel: string; criterion?: { id: string; label: string; values: Values }; groups: Option[]; bandSets: Option[] }) {
  return (
    <RecordEditor
      title={criterion ? `Edit ${criterion.label}` : `Add a criterion to ${stageLabel}`}
      description="What is marked, passed or banded. A group's criteria sum to its own marks."
      columns={2}
      fields={[
        hidden("modelId"),
        hidden("stageId"),
        hidden("criterionId"),
        ...(criterion ? [] : [codeField()]),
        { kind: "number", name: "order", label: "Order", required: true, min: 1 },
        { kind: "select", name: "parentCode", label: "In the group", placeholder: "None: at the top", options: groups },
        { kind: "text", name: "labelEn", label: "Name", required: true },
        { kind: "text", name: "labelMs", label: "Name (Malay)" },
        { kind: "select", name: "scale", label: "How it is judged", required: true, placeholder: "Choose", options: opts(CRITERION_SCALES, SCALE_LABEL) },
        { kind: "text", name: "maxMarks", label: "Most marks", hint: "Marks entered, or a group." },
        { kind: "select", name: "computedInput", label: "The figure it is worked from", placeholder: "None", options: opts(COMPUTED_INPUTS.filter((x) => x !== "NONE"), INPUT_LABEL) },
        { kind: "select", name: "bandSetCode", label: "Band set", placeholder: "None", options: bandSets },
        { kind: "switch", name: "needsNamedContractor", label: "Judged only with a named contractor" },
        ...sourceFields,
      ]}
      values={{ modelId, stageId, criterionId: criterion?.id ?? null, ...(criterion?.values ?? {}) }}
      action={saveCriterion}
      submitLabel={criterion ? "Save" : "Add the criterion"}
      trigger={criterion ? edit(criterion.label) : { label: "Add a criterion", icon: true, className: secondary }}
      size="lg"
    />
  );
}

export function RemoveCriterionDrawer({ modelId, criterionId, label }: { modelId: string; criterionId: string; label: string }) {
  return (
    <RecordEditor title={`Remove ${label}`} description="The criterion comes off the stage. The draft's trail keeps it." fields={[hidden("modelId"), hidden("criterionId")]} values={{ modelId, criterionId }} action={removeCriterion} submitLabel="Remove" danger trigger={{ label: "Remove", className: ghost, ariaLabel: `Remove ${label}` }} size="sm" />
  );
}

export function FactorDrawer({ modelId, stageId, stageLabel, factor }: { modelId: string; stageId: string; stageLabel: string; factor?: { id: string; label: string; values: Values } }) {
  return (
    <RecordEditor
      title={factor ? `Edit ${factor.label}` : `Add a factor to ${stageLabel}`}
      description="The percentage of the base a bidder must hold, by how the contract is let."
      columns={2}
      fields={[hidden("modelId"), hidden("stageId"), hidden("factorId"), ...(factor ? [] : [codeField()]), { kind: "text", name: "labelEn", label: "Name", required: true }, { kind: "text", name: "labelMs", label: "Name (Malay)" }, { kind: "text", name: "factorPct", label: "Percentage", required: true }, ...sourceFields]}
      values={{ modelId, stageId, factorId: factor?.id ?? null, ...(factor?.values ?? {}) }}
      action={saveFactor}
      submitLabel={factor ? "Save" : "Add the factor"}
      trigger={factor ? edit(factor.label) : { label: "Add a factor", icon: true, className: secondary }}
      size="md"
    />
  );
}

export function RemoveFactorDrawer({ modelId, factorId, label }: { modelId: string; factorId: string; label: string }) {
  return <RecordEditor title={`Remove ${label}`} description="The factor comes off the stage." fields={[hidden("modelId"), hidden("factorId")]} values={{ modelId, factorId }} action={removeFactor} submitLabel="Remove" danger trigger={{ label: "Remove", className: ghost, ariaLabel: `Remove ${label}` }} size="sm" />;
}

// ------------------------------------------------------------------ band sets and bands

export function BandSetDrawer({ modelId, set }: { modelId: string; set?: { id: string; label: string; values: Values } }) {
  return (
    <RecordEditor
      title={set ? `Edit ${set.label}` : "Add a band set"}
      description="Bands a worked figure falls in. Each model has its own."
      fields={[hidden("modelId"), hidden("setId"), ...(set ? [] : [codeField()]), { kind: "text", name: "nameEn", label: "Name", required: true }, ...sourceFields]}
      values={{ modelId, setId: set?.id ?? null, ...(set?.values ?? {}) }}
      action={saveBandSet}
      submitLabel={set ? "Save" : "Add the band set"}
      trigger={set ? edit(set.label) : { label: "Add a band set", icon: true, className: secondary }}
      size="md"
    />
  );
}

export function RemoveBandSetDrawer({ modelId, setId, label }: { modelId: string; setId: string; label: string }) {
  return <RecordEditor title={`Remove ${label}`} description="The band set and its bands come off the draft." fields={[hidden("modelId"), hidden("setId")]} values={{ modelId, setId }} action={removeBandSet} submitLabel="Remove" danger trigger={{ label: "Remove", className: ghost, ariaLabel: `Remove ${label}` }} size="sm" />;
}

export function BandDrawer({ modelId, setId, setLabel, band }: { modelId: string; setId: string; setLabel: string; band?: { id: string; label: string; values: Values } }) {
  const edgeIn = YES_NO("In this band", "In the next band");
  return (
    <RecordEditor
      title={band ? `Edit ${band.label}` : `Add a band to ${setLabel}`}
      description="An empty edge is open. Say whether a value on each edge is in."
      columns={2}
      fields={[
        hidden("modelId"),
        hidden("setId"),
        hidden("bandId"),
        { kind: "text", name: "labelEn", label: "Name", required: true },
        { kind: "text", name: "labelMs", label: "Name (Malay)" },
        { kind: "text", name: "lower", label: "From" },
        { kind: "select", name: "lowerInclusive", label: "A value exactly on it is", placeholder: "Not set", options: edgeIn },
        { kind: "text", name: "upper", label: "To" },
        { kind: "select", name: "upperInclusive", label: "A value exactly on it is", placeholder: "Not set", options: edgeIn },
        { kind: "switch", name: "lowerIsFloor", label: "The lower edge is the minimum capital" },
        { kind: "switch", name: "upperIsFloor", label: "The upper edge is the minimum capital" },
        { kind: "select", name: "outcome", label: "What a value in it means", required: true, placeholder: "Choose", options: opts(BAND_OUTCOMES, OUTCOME_LABEL) },
        { kind: "number", name: "sortOrder", label: "Order", min: 0 },
      ]}
      values={{ modelId, setId, bandId: band?.id ?? null, ...(band?.values ?? {}) }}
      action={saveBand}
      submitLabel={band ? "Save" : "Add the band"}
      trigger={band ? edit(band.label) : { label: "Add a band", icon: true, className: secondary }}
      size="lg"
    />
  );
}

export function RemoveBandDrawer({ modelId, bandId, label }: { modelId: string; bandId: string; label: string }) {
  return <RecordEditor title={`Remove ${label}`} description="The band comes off the set." fields={[hidden("modelId"), hidden("bandId")]} values={{ modelId, bandId }} action={removeBand} submitLabel="Remove" danger trigger={{ label: "Remove", className: ghost, ariaLabel: `Remove ${label}` }} size="sm" />;
}

// ------------------------------------------------------------------ aspects, policy, bases, methods

export function AspectDrawer({ aspect }: { aspect?: { id: string; label: string; values: Values } }) {
  return (
    <RecordEditor
      title={aspect ? `Edit ${aspect.label}` : "Add an aspect"}
      description="An aspect each bidder is assessed on. Models freeze the aspects at issue."
      columns={2}
      fields={[
        hidden("id"),
        ...(aspect ? [] : [codeField()]),
        { kind: "select", name: "kind", label: "What it assesses", required: true, placeholder: "Choose", options: opts(ASPECT_KINDS, ASPECT_KIND_LABEL) },
        { kind: "text", name: "labelEn", label: "Name", required: true },
        { kind: "text", name: "labelMs", label: "Name (Malay)" },
        { kind: "select", name: "requiredOnRoute", label: "Required on", placeholder: "Not required", options: opts(EVALUATION_ROUTES, ROUTE_LABEL) },
        { kind: "number", name: "sortOrder", label: "Order", min: 0 },
        ...sourceFields,
      ]}
      values={aspect ? { id: aspect.id, ...aspect.values } : undefined}
      action={saveAspect}
      submitLabel={aspect ? "Save" : "Add the aspect"}
      trigger={aspect ? edit(aspect.label) : { label: "Add an aspect", icon: true, className: secondary }}
      size="lg"
    />
  );
}

export function RetireAspectDrawer({ id, label }: { id: string; label: string }) {
  return (
    <RecordEditor title={`Retire ${label}`} description="It is no longer frozen into a model issued from today. Issued models keep it." fields={[hidden("id")]} values={{ id }} action={retireAspect} submitLabel="Retire" destructive={{ reasonLabel: "Why is it being retired?" }} trigger={{ label: "Retire", className: buttonClass("destructive", "sm") }} size="sm" />
  );
}

export function PolicyDrawer({ values, series, offices, templates }: { values: Values; series: Option[]; offices: Option[]; templates: Option[] }) {
  return (
    <RecordEditor
      title="Evaluation policy"
      description="Not set holds back the act. An evaluation keeps its starting policy."
      columns={2}
      fields={[
        { kind: "select", name: "reportSeriesKey", label: "Report reference series", placeholder: "Not set", options: series },
        { kind: "number", name: "scoreDecimals", label: "Decimal places a score is judged at", min: 0, hint: "The figure shown is the figure judged against a pass mark; rounded half up." },
        { kind: "select", name: "scoreDecimalsProvenance", label: "Where the decimal places came from", placeholder: "Not set", options: PROVENANCE },
        { kind: "select", name: "anonymisedScoring", label: "Anonymise the technical scoring stage", placeholder: "Not set", options: [{ value: "ON", label: "On" }, { value: "OFF", label: "Off" }], hint: "On: each bid reads as Bidder n while it is scored, and is named only for a criterion that needs the named contractor, the reveal logged. Not set shows the names." },
        { kind: "select", name: "anonymisedScoringProvenance", label: "Where that choice came from", placeholder: "Not set", options: PROVENANCE },
        { kind: "select", name: "checkerRoleCode", label: "Office checking the Kertas Cadangan", placeholder: "Not set", options: offices },
        { kind: "select", name: "recommenderRoleCode", label: "Office recommending it", placeholder: "Not set", options: offices },
        { kind: "select", name: "secretariatRoleCode", label: READER_OFFICE_LABEL.secretariatRoleCode, placeholder: "Not set", options: offices, hint: "Reads evaluations (FR-EVL-014), nothing more. Not the office that holds the estimate's copies." },
        { kind: "select", name: "secretariatRoleProvenance", label: "Where that choice came from", placeholder: "Not set", options: PROVENANCE },
        { kind: "select", name: "internalAuditRoleCode", label: READER_OFFICE_LABEL.internalAuditRoleCode, placeholder: "Not set", options: offices, hint: "Reads evaluations (FR-EVL-014), nothing more. Not the estimate-audit office, which means custody of the estimate." },
        { kind: "select", name: "internalAuditRoleProvenance", label: "Where that choice came from", placeholder: "Not set", options: PROVENANCE },
        { kind: "select", name: "reportTemplateId", label: "Report template", placeholder: "Not set", options: templates },
        { kind: "select", name: "proposalTemplateId", label: "Kertas Cadangan template", placeholder: "Not set", options: templates },
        { kind: "text", name: "governingSource", label: "Source" },
        { kind: "textarea", name: "notes", label: "Notes" },
      ]}
      values={values}
      action={saveEvaluationPolicy}
      submitLabel="Save"
      trigger={{ label: "Edit the policy", className: secondary }}
      size="lg"
    />
  );
}

export function BasisRouteDrawer({ id, label, values }: { id: string; label: string; values: Values }) {
  return (
    <RecordEditor
      title={`Evaluation route of ${label}`}
      description="The route a basis is evaluated by. Not set: exercises on it are not published."
      fields={[hidden("id"), { kind: "select", name: "evaluationRoute", label: "Evaluation route", placeholder: "Not set", options: opts(EVALUATION_ROUTES, ROUTE_LABEL) }, { kind: "select", name: "evaluationRouteProvenance", label: "Where this came from", placeholder: "Not set", options: PROVENANCE }]}
      values={{ id, ...values }}
      action={saveBasisRoute}
      submitLabel="Save"
      trigger={edit(label)}
      size="md"
    />
  );
}

export function MethodModelDrawer({ id, label, value, models }: { id: string; label: string; value: string | null; models: Option[] }) {
  return (
    <RecordEditor
      title={`Usual model for ${label}`}
      description="A suggestion only. The officer chooses."
      fields={[hidden("id"), { kind: "select", name: "defaultEvaluationModelCode", label: "Usual evaluation model", placeholder: "None", options: models }]}
      values={{ id, defaultEvaluationModelCode: value }}
      action={saveMethodModel}
      submitLabel="Save"
      trigger={edit(label)}
      size="md"
    />
  );
}
