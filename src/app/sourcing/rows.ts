import type { Row } from "@/components/data-list";
import type { StaffActor } from "@/lib/auth/types";
import type { Sulit } from "@/lib/auth/sulit-access";
import { nameRoutesOf } from "@/lib/method/approval";
import { boundaryShown } from "@/lib/method/boundary-reading";
import { EXERCISE_STATUS_LABEL, EXERCISE_STATUS_TONE, REGIME_SHORT, TERM } from "@/lib/method/labels";
import { judgedViewIds, tooManyToJudge } from "@/lib/method/judged-views";
import { loadMethodConfig, type listExercises } from "@/lib/method/repo";
import type { ExerciseStatus, Regime } from "@/lib/method/types";
import { windowColumns } from "@/lib/window/read";
import { hiddenExercises, sulitExerciseValues } from "@/app/_auth/sulit";

/// The value column's cell: the figure where the reader may read it, and "Withheld" with the reason where not.
const valueCell = (v: Sulit<number> | undefined): Row["cells"][string] => (v && v.state === "GRANTED" ? { kind: "money", value: v.value } : { kind: "withheld", words: v?.state === "WITHHELD" ? v.words.en : "This value is not shown." });

export { judgedViewIds, tooManyToJudge };

const TONE = { brand: "brand", info: "info", ok: "ok", neutral: undefined } as const;

/**
 * The exercises list's rows, built once for the page and for the export route. The department estimate is SULIT: each row's is judged for this reader
 * and the access logged (ADR 0034 D14). "On the boundary" states the estimate, so it is said only for the rows whose estimate the reader may read. With
 * `forExport` no SULIT column is built, no grant is asked (so nothing is logged for a value not written), and the boundary chip, which states the estimate, is left out.
 */
export async function buildExerciseRows(actor: StaffActor, all: Awaited<ReturnType<typeof listExercises>>["rows"], opts: { forExport: boolean }): Promise<Row[]> {
  // The list already left the restricted ones out; asked again here (once a request), so that no row built from another caller's set can carry one.
  const hidden = new Set(await hiddenExercises(actor));
  const rows = all.filter((r) => !hidden.has(r.id));
  const byId = new Map(rows.map((r) => [r.id, r]));
  const values = opts.forExport ? new Map<string, Sulit<number>>() : await sulitExerciseValues(actor, rows.map((r) => ({ id: r.id, reference: r.reference })), "estimatedValue", (id) => Number(byId.get(id)!.estimatedValue.toString()), "exercise", { list: true });
  const [cfg, win] = await Promise.all([loadMethodConfig(actor.organisationId), windowColumns(actor.organisationId, rows.map((r) => r.id))]);
  const methodName = (c: string) => cfg.config.methods.find((m) => m.code === c)?.nameEn ?? "A method no longer configured";
  const typeName = (c: string | null) => (c ? (cfg.config.types.find((t) => t.code === c)?.nameEn ?? "A type no longer configured") : "Not set");
  const onBoundary = (r: (typeof rows)[number]) => !opts.forExport && boundaryShown(r.onBoundary, values.get(r.id)?.state === "GRANTED");
  return rows.map((r) => {
    const status = r.status as ExerciseStatus;
    const nameOpen = status !== "CANCELLED" && nameRoutesOf(r.approvalInstances).some((i) => i.status === "PENDING");
    const nameApproved = status !== "CANCELLED" && nameRoutesOf(r.approvalInstances).some((i) => i.status === "APPROVED");
    const w = win.get(r.id);
    return {
      id: r.id,
      search: r.reference,
      cells: {
        title: { kind: "link", text: r.title, href: `/sourcing/${r.id}`, sub: `${r.reference} · ${methodName(r.sourcingMethodCode)}` },
        method: { kind: "stack", title: methodName(r.sourcingMethodCode), sub: typeName(r.contractTypeCode) },
        ...(opts.forExport ? {} : { value: valueCell(values.get(r.id)) }),
        window: { kind: "stack", title: r.closingAt ? w?.closing ?? "—" : status === "CANCELLED" ? "No closing" : "Not set yet", sub: r.closingAt ? w?.phase : status === "CANCELLED" ? "Cancelled before one was set" : undefined },
        status: { kind: "badge", text: EXERCISE_STATUS_LABEL[status], tone: TONE[EXERCISE_STATUS_TONE[status]] },
        checks: {
          kind: "chips",
          items: [
            { text: r.regime ? REGIME_SHORT[r.regime as Regime] : "Regime not determined", tone: "brand" as const },
            ...(onBoundary(r) ? [{ text: r.boundaryRuled ? "On the boundary" : "On the boundary · not ruled", tone: "warn" as const }] : []),
            ...(nameOpen ? [{ text: `${TERM.nameApproval} in progress`, tone: "brand" as const }] : nameApproved ? [{ text: `${TERM.nameApproval} given`, tone: "ok" as const }] : []),
            ...(r.restricted ? [{ text: "Restricted to its named people", tone: "warn" as const }] : []),
          ],
        },
      },
    };
  });
}
