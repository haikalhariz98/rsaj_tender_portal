export const BUDGET: { pageSubtitle: number; cardSubtitle: number; editorIntro: number; callout: number };
export const CODE_PATTERNS: RegExp[];
export function scanSource(file: string, source: string): { file: string; line: number; rule: string; msg: string }[];
