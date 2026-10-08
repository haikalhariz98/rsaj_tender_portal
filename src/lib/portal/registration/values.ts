/**
 * A registration value as a screen names it: always "code — name", never the code alone (AGENTS.md rule 5; ruling 3 of the CPD registration rulings). Pure.
 */

export const valueLabel = (v: { code: string; nameEn: string }): string => `${v.code} — ${v.nameEn}`;
