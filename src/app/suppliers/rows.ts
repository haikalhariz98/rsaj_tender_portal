import type { Row } from "@/components/data-list";
import { daysFrom, storedDay, dayOrNull as day } from "@/lib/dates";
import { formatDate } from "@/lib/format";
import { stateCounts, type documentStates } from "@/lib/suppliers/documents";
import type { worstBand } from "@/lib/suppliers/expiry";
import { APPLICATION_KIND_LABEL, CHANNEL_LABEL, DOCUMENT_STATE_LABEL, ERP_NOT_SYNCED, EXPIRY_BAND_LABEL, EXPIRY_BAND_TONE, QUEUE_STATE_LABEL, QUEUE_STATE_TONE, standingTone, standingWords, SUPPLIER_STATUS_LABEL, SUPPLIER_STATUS_TONE } from "@/lib/suppliers/labels";
import type { listSuppliers } from "@/lib/suppliers/repo";
import { queueState, type QueueState } from "@/lib/suppliers/review";
import type { standing } from "@/lib/suppliers/standing";
import type { ApplicationKind, SupplierStatus } from "@/lib/suppliers/types";

type Listed = NonNullable<Awaited<ReturnType<typeof listSuppliers>>>;
type Suppliers = Listed["suppliers"];
type Applications = Listed["queue"];

/// What each supplier on the page is read as (standing, document states, expiry band), derived on the organisation's day and never stored.
export interface RegisterContext {
  readings: ReadonlyMap<string, { states: ReturnType<typeof documentStates>; standing: ReturnType<typeof standing> | null; worst: ReturnType<typeof worstBand> }>;
  answered: ReadonlySet<string>;
  today: string | null;
}

const TONE = { ok: "ok", warn: "warn", err: "err", info: "info", neutral: undefined, brand: "brand" } as const;
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/**
 * The register's and the applications queue's rows, built once for the page and for the export route (7.6). No column is SULIT (no bank or creditor field, no
 * document content), so `forExport` changes nothing; it is taken so every list's builder is called alike.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- no SULIT column: the export builds the same rows
export function buildRegisterRows(suppliers: Suppliers, cx: RegisterContext, _opts: { forExport: boolean }): Row[] {
  const { readings, answered, today } = cx;
  return suppliers.map((s) => {
    const status = s.status as SupplierStatus;
    const rd = readings.get(s.id)!;
    const states = rd.states;
    const counts = stateCounts(states);
    const issues = (["MISSING", "EXPIRED", "NOT_IN_ORDER", "NOT_CHECKED", "NOT_YET_VALID"] as const).filter((k) => counts[k]);
    const open = s.applications[0];
    return {
      id: s.id,
      views: [...(status === "REGISTERED" ? ["registered"] : []), ...(status === "APPLICANT" ? ["applicants"] : []), ...(rd.standing && rd.standing.standing !== "ACTIVE" && rd.standing.standing !== "NOT_REGISTERED" ? ["barred"] : []), ...(status === "REGISTERED" && !s.erpVendorCode ? ["unsynced"] : []), ...(issues.length ? ["attention"] : [])],
      search: [s.registeredName, s.reference, s.registrationNo, SUPPLIER_STATUS_LABEL[status].en].join(" "),
      sortKeys: { supplier: s.registeredName },
      cells: {
        supplier: { kind: "link", text: s.registeredName, href: `/suppliers/${s.id}`, sub: `${s.reference} · ${s.registrationNo}` },
        status: rd.standing && status === "REGISTERED" ? { kind: "chips", items: [{ text: standingWords(rd.standing).en, tone: TONE[standingTone(rd.standing)] }] } : { kind: "badge", text: SUPPLIER_STATUS_LABEL[status].en, tone: TONE[SUPPLIER_STATUS_TONE[status]] },
        documents: {
          kind: "chips",
          items: !today
            ? [{ text: "Not judged: the organisation's time zone is not set", tone: "warn" as const }]
            : [
                ...(issues.length
                  ? issues.map((k) => ({ text: `${counts[k]} ${DOCUMENT_STATE_LABEL[k].en.toLowerCase()}`, tone: k === "NOT_CHECKED" || k === "NOT_YET_VALID" ? ("warn" as const) : ("err" as const) }))
                  : [{ text: states.length ? "In order" : "None lodged", tone: states.length ? ("ok" as const) : ("warn" as const) }]),
                ...(rd.worst && rd.worst !== "EXPIRED" && rd.worst !== "NO_EXPIRY" ? [{ text: `Expiry: ${EXPIRY_BAND_LABEL[rd.worst].en.toLowerCase()}`, tone: TONE[EXPIRY_BAND_TONE[rd.worst]] }] : []),
              ],
        },
        where: {
          kind: "chips",
          items: [
            ...(open ? [{ text: `${APPLICATION_KIND_LABEL[open.kind as ApplicationKind].en}: ${QUEUE_STATE_LABEL[queueState({ ...open, resubmitBy: day(open.resubmitBy), answeredOnTime: answered.has(open.id) }, today)].en.toLowerCase()}`, tone: "brand" as const }] : []),
            ...(status === "REGISTERED" ? [s.erpVendorCode ? { text: `Vendor code ${s.erpVendorCode}`, tone: "ok" as const } : { text: ERP_NOT_SYNCED.en, tone: "warn" as const }] : []),
          ],
        },
      },
    };
  });
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars -- no SULIT column: the export builds the same rows
export function buildApplicationRows(applications: Applications, cx: { answered: ReadonlySet<string>; today: string | null }, _opts: { forExport: boolean }): Row[] {
  const { answered, today } = cx;
  return applications.map((a) => {
    const s = a.supplier;
    const st: QueueState = queueState({ ...a, resubmitBy: day(a.resubmitBy), answeredOnTime: answered.has(a.id) }, today);
    const received = storedDay(a.receivedOn);
    const age = today ? daysFrom(received, today) : null;
    return {
      id: a.id,
      views: [st === "WITH_APPROVAL" ? "approval" : st === "LAPSED" ? "lapsed" : st === "RESUBMISSION_REQUESTED" ? "resubmission" : "received"],
      search: [s.registeredName, s.reference, APPLICATION_KIND_LABEL[a.kind as ApplicationKind].en, CHANNEL_LABEL[a.channel].en, QUEUE_STATE_LABEL[st].en].join(" "),
      sortKeys: { received },
      cells: {
        supplier: { kind: "link", text: s.registeredName, href: `/suppliers/${s.id}?tab=applications`, sub: `${s.reference} · ${APPLICATION_KIND_LABEL[a.kind as ApplicationKind].en} · ${CHANNEL_LABEL[a.channel].en}` },
        received: { kind: "stack", title: formatDate(received), sub: age == null ? "Days not counted: no time zone" : age === 0 ? "Today" : `${plural(age, "day", "days")} ago` },
        state: { kind: "badge", text: QUEUE_STATE_LABEL[st].en, tone: TONE[QUEUE_STATE_TONE[st]] },
        deadline: { kind: "text", text: a.resubmitBy && a.status === "RESUBMISSION_REQUESTED" ? `Resubmit by ${formatDate(day(a.resubmitBy))}` : "—", dim: !a.resubmitBy },
      },
    };
  });
}
