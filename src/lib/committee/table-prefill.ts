/**
 * What a record's "table it at a sitting" link carries to the sitting's Table-a-matter drawer
 * (6.2 sent-back condition 3, NFR-SEC-002). Pure.
 *
 * The link carries words and keys only, never a figure: a requisition's amount is its
 * department estimate, which is SULIT, and a URL is copied into browser history, server logs
 * and referrers. The link names the record by id instead (`requisitionId`, `awardId`), and the
 * sitting page reads the amount on the server from that record (`tablingAmount` in repo.ts).
 */

/// The query keys copied into the drawer as typed. `amount` is not one of them.
export const TABLE_PREFILL_KEYS = ["subject", "domain", "act", "matterKind", "matterRef"] as const;

/// The record a link names for its amount, read on the server.
export type TablingSource = { kind: "requisition"; id: string } | { kind: "award"; id: string } | null;

/// The drawer's values from a sitting page's query, where it was asked to open (`table=1`).
/// An `amount` in the query is ignored, so an old bookmarked link cannot fill one in.
export function tablePrefillFromQuery(sp: Readonly<Record<string, string | undefined>>): { values: Record<string, string>; source: TablingSource } | null {
  if (sp.table !== "1") return null;
  const values = Object.fromEntries(TABLE_PREFILL_KEYS.filter((k) => sp[k]).map((k) => [k, sp[k]!]));
  const source: TablingSource = sp.requisitionId ? { kind: "requisition", id: sp.requisitionId } : sp.awardId ? { kind: "award", id: sp.awardId } : null;
  return { values, source };
}

/// The query a record's link carries: the words, and the record by id. Never an amount.
export function tablingQuery(i: { subject: string; domain: string; act: string; matterKind: string; matterRef: string; source: Exclude<TablingSource, null> }): string {
  const by: Record<string, string> = i.source.kind === "requisition" ? { requisitionId: i.source.id } : { awardId: i.source.id };
  return new URLSearchParams({ tab: "agenda", table: "1", subject: i.subject, domain: i.domain, act: i.act, matterKind: i.matterKind, matterRef: i.matterRef, ...by }).toString();
}
