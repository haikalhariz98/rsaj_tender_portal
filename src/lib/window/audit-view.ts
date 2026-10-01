/**
 * What the window's audit rows say, in words (AGENTS.md rules 4 and 5): money formatted, days as
 * the screens write them, every enum by its label, never a code or an id. The actions write these
 * with their audit rows, in the same transaction; the exercise's History renders them as written.
 * Every row's label starts with the exercise's reference, so its History finds it. Pure.
 */

import { formatDate, formatOrgDateTime } from "@/lib/format";
import { formatMoney, parseSen } from "@/lib/money";
import { storedDay } from "@/lib/dates";

import { ADDENDUM_STATUS_LABEL, CERT_SIGHTED_LABEL, CHECK_STATE_LABEL, CLOSING_CHANGE_KIND_LABEL, DELIVERY_METHOD_LABEL, FEE_COST_KIND_LABEL, PARTY_SOURCE_LABEL, PATH_LABEL, SITE_EVENT_KIND_LABEL } from "./labels";
import type { AddendumStatus, CertSighted, CheckState, ClosingChangeKind, DeliveryMethod, FeeCostKind, PartySource, SiteEventKind, WindowPath } from "./types";

/// The entity names the window's rows are audited under.
export const ENTITY = {
  window: "ExerciseWindow",
  feeLine: "WindowFeeLine",
  publication: "PublicationRecord",
  party: "ExerciseParty",
  letter: "InvitationLetter",
  sale: "DocumentSale",
  event: "SiteEvent",
  attendance: "SiteEventAttendance",
  addendum: "Addendum",
  addendumCopy: "AddendumRecipient",
  change: "ClosingChange",
  cancellation: "WindowCancellation",
  notice: "WindowNotice",
} as const;

/// Every window entity, for the History's and the demo wipe's lists.
export const WINDOW_ENTITIES: readonly string[] = Object.values(ENTITY);

type Dec = { toString(): string } | null | undefined;
const money = (v: Dec) => (v == null ? null : formatMoney(parseSen(v.toString())));
const day = (d: Date | null | undefined) => (d ? formatDate(storedDay(d)) : null);
const yesNo = (b: boolean | null | undefined) => (b == null ? "Not answered" : b ? "Yes" : "No");

/// The window's own fields, as the trail reads them.
export function windowFields(w: {
  path?: WindowPath;
  closingTimeReason: string;
  purchaseFromDay: Date | null;
  purchaseCloseDay: Date | null;
  inspectionPlace: string;
  purchasePlace: string;
  inspectionHours: string;
  feeAmount: Dec;
  feePaymentMethods: string;
  submissionPlace: string;
}) {
  return {
    ...(w.path ? { path: PATH_LABEL[w.path] } : {}),
    closingTimeReason: w.closingTimeReason || null,
    firstDayOfSale: day(w.purchaseFromDay),
    lastDayOfSale: day(w.purchaseCloseDay),
    inspectionPlace: w.inspectionPlace || null,
    purchasePlace: w.purchasePlace || null,
    inspectionHours: w.inspectionHours || null,
    fee: money(w.feeAmount),
    feePaymentMethods: w.feePaymentMethods || null,
    submissionPlace: w.submissionPlace || null,
  };
}

export const feeLineFields = (l: { kind: FeeCostKind; description: string; quantity: Dec; unitCost: Dec; amount: Dec }) => ({
  cost: FEE_COST_KIND_LABEL[l.kind],
  description: l.description || null,
  quantity: l.quantity == null ? null : l.quantity.toString(),
  unitCost: money(l.unitCost),
  amount: money(l.amount),
});

export const partyFields = (p: { source: PartySource; name: string; registrationNo: string; address: string; phone: string; fax: string; email: string }) => ({
  contractor: p.name,
  registrationNo: p.registrationNo,
  cameAs: PARTY_SOURCE_LABEL[p.source],
  address: p.address || null,
  telephone: p.phone || null,
  fax: p.fax || null,
  email: p.email || null,
});

export const saleFields = (s: {
  partyName: string;
  soldOn: Date;
  collectedBy: string;
  authoritySighted: boolean;
  restrictionCertSighted: CertSighted | null;
  restrictionCertValidUntil: Date | null;
  registrationCheck: CheckState;
  suspensionCheck: CheckState;
  amount: Dec;
  paymentMethod: string;
  financeReceiptNo: string | null;
  issuedBy: string;
}) => ({
  purchaser: s.partyName,
  soldOn: day(s.soldOn),
  collectedBy: s.collectedBy,
  authoritySighted: yesNo(s.authoritySighted),
  statusCertificate: s.restrictionCertSighted ? CERT_SIGHTED_LABEL[s.restrictionCertSighted] : null,
  statusCertificateValidUntil: day(s.restrictionCertValidUntil),
  registration: CHECK_STATE_LABEL[s.registrationCheck],
  suspension: CHECK_STATE_LABEL[s.suspensionCheck],
  amount: money(s.amount),
  paymentMethod: s.paymentMethod,
  financeReceipt: s.financeReceiptNo,
  issuedBy: s.issuedBy,
  recordedOnBehalf: "not signed",
});

export const eventFields = (e: { kind: SiteEventKind; startsAt: Date; place: string; mandatory: boolean | null; notes: string }, timeZone: string | null) => ({
  event: SITE_EVENT_KIND_LABEL[e.kind],
  starts: formatOrgDateTime(e.startsAt, timeZone),
  place: e.place,
  mandatory: yesNo(e.mandatory),
  notes: e.notes || null,
});

export const addendumFields = (a: { number: number | null; title: string; whatChanged: string; status: AddendumStatus; issuedOn: Date | null }) => ({
  number: a.number,
  title: a.title,
  whatChanged: a.whatChanged,
  status: ADDENDUM_STATUS_LABEL[a.status],
  issuedOn: day(a.issuedOn),
});

export const deliveryFields = (d: { method: DeliveryMethod | null; consignmentRef: string; despatchedOn: Date | null; acknowledgedOn: Date | null }) => ({
  sentBy: d.method ? DELIVERY_METHOD_LABEL[d.method] : null,
  consignment: d.consignmentRef || null,
  sentOn: day(d.despatchedOn),
  acknowledgedOn: day(d.acknowledgedOn),
});

export const changeFields = (c: { kind: ClosingChangeKind; fromClosingAt: Date; toClosingAt: Date; fromPurchaseCloseDay: Date | null; toPurchaseCloseDay: Date | null; reason: string }, timeZone: string | null) => ({
  change: CLOSING_CHANGE_KIND_LABEL[c.kind],
  closingWas: formatOrgDateTime(c.fromClosingAt, timeZone),
  closingBecomes: formatOrgDateTime(c.toClosingAt, timeZone),
  lastDayOfSaleWas: day(c.fromPurchaseCloseDay),
  lastDayOfSaleBecomes: day(c.toPurchaseCloseDay),
  reason: c.reason,
});
