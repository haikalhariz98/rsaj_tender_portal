"use client";

import { cx } from "@/components/ui/cx";

import { ProposePermission } from "../changes/editors";

/**
 * The product's own permissions in the permissions grid (ADR 0034 D8, Phase 2c). Each is a closed list in code; which role holds which is the organisation's,
 * with three states and no more: GRANTED, WITHHELD, and UNDECIDED, which is the organisation not having decided, is refused, and is shown as undecided and
 * never as withheld. A cell is not a toggle: changing it proposes a change, which a different person with the permission to grant decides.
 */

export type Decision = "GRANTED" | "WITHHELD" | "UNDECIDED";

export interface ProductPermissions {
  keys: { key: string; label: string; lets: string; grantable: boolean }[];
  decisions: { permissionKey: string; roleCode: string; decision: "GRANTED" | "WITHHELD" }[];
  /// Proposals waiting for a second person, by key and role.
  pending: { permissionKey: string; roleCode: string }[];
  /// The signed-in person holds the permission that grants permissions: only they are offered a change.
  canPropose: boolean;
}

const WORDS: Record<Decision, string> = { GRANTED: "Granted", WITHHELD: "Withheld", UNDECIDED: "Undecided" };
const TONE: Record<Decision, string> = {
  GRANTED: "border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100",
  WITHHELD: "border-rose-200 bg-rose-50 text-rose-800 hover:bg-rose-100",
  UNDECIDED: "border-dashed border-ink-4 bg-transparent text-ink-3 hover:bg-sunken",
};
const PILL = "inline-flex h-7 items-center rounded-full border px-2.5 text-[12px] font-semibold transition cursor-pointer";

export const decisionOf = (p: ProductPermissions, key: string, roleCode: string): Decision => p.decisions.find((d) => d.permissionKey === key && d.roleCode === roleCode)?.decision ?? "UNDECIDED";

/// One permission's row, across the roles that can be held.
export function ProductPermissionRow({ permission, columns, product }: { permission: ProductPermissions["keys"][number]; columns: { code: string; nameEn: string }[]; product: ProductPermissions }) {
  const rowHeader = (
    <th
      scope="row"
      title={permission.lets}
      className="sticky left-0 z-10 border-r border-b border-line/70 bg-surface py-2.5 pr-4 pl-5 text-left font-medium text-ink transition group-hover:bg-brand-50 max-md:static max-md:block max-md:border-r-0 max-md:pb-1 max-md:break-words sm:pl-6"
    >
      {permission.label}
      <span className="mt-0.5 block text-[12px] font-normal text-ink-3">{permission.lets}</span>
    </th>
  );
  if (!permission.grantable) {
    return (
      <tr className="group">
        {rowHeader}
        <td colSpan={Math.max(columns.length, 1)} className="border-b border-line/70 px-3 py-2.5 text-[12.5px] text-ink-3 max-md:block max-md:px-5">
          Held only through the administrator flag. It is never granted to a role.
        </td>
      </tr>
    );
  }
  return (
    <tr className="group">
      {rowHeader}
      {columns.map((o) => {
        const decision = decisionOf(product, permission.key, o.code);
        const waiting = product.pending.some((p) => p.permissionKey === permission.key && p.roleCode === o.code);
        return (
          <td
            key={o.code}
            className="border-b border-line/70 px-2 py-2.5 text-center transition group-hover:bg-brand-50/40 max-md:flex max-md:items-center max-md:justify-between max-md:gap-3 max-md:border-b-0 max-md:py-1.5 max-md:pr-5 max-md:pl-5 max-md:text-left"
          >
            <span className="min-w-0 text-[13px] text-ink-2 md:hidden">{o.nameEn}</span>
            <span className="inline-flex flex-col items-center gap-0.5 max-md:items-end">
              {product.canPropose ? (
                <ProposePermission
                  permissionKey={permission.key}
                  permissionLabel={permission.label}
                  roleCode={o.code}
                  roleName={o.nameEn}
                  current={WORDS[decision]}
                  trigger={{ label: WORDS[decision], className: cx(PILL, TONE[decision]), ariaLabel: `${permission.label}, ${o.nameEn}: ${WORDS[decision]}. Propose a change.` }}
                />
              ) : (
                <span className={cx(PILL, "cursor-default", TONE[decision].split(" hover:")[0])}>{WORDS[decision]}</span>
              )}
              {waiting && <span className="text-[11px] text-ink-3">Change waiting</span>}
            </span>
          </td>
        );
      })}
    </tr>
  );
}
