import { PAYMENT_ROUTE_LABEL } from "@/lib/method/labels";

/// A payment route has its own words ("Delivery order and invoice"): the generic rule below would drop the "and".
export const inWords = (c: string, v: unknown) => c === "paymentRoute" && typeof v === "string" && Object.hasOwn(PAYMENT_ROUTE_LABEL, v) ? PAYMENT_ROUTE_LABEL[v as keyof typeof PAYMENT_ROUTE_LABEL] : inWordsGeneric(c, v);
const inWordsGeneric = (c: string, v: unknown) => (typeof v === "string" && /^[A-Z][A-Z0-9_]+$/.test(v) && !/^(name|label)/.test(c) ? v.charAt(0) + v.slice(1).toLowerCase().replace(/_/g, " ") : v);
