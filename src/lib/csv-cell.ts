/**
 * One cell of a CSV file, written so a spreadsheet cannot run it.
 *
 * A cell that starts with `=`, `+`, `-`, `@`, a tab or a carriage return is read by a spreadsheet as
 * a formula, whatever quotes surround it. Quotes are CSV syntax, not protection. Any text a stranger
 * can type (a registered name on the public application form) can reach an officer's export, so every
 * file the product writes goes through here. A guarded cell gets a leading apostrophe, which a
 * spreadsheet shows as plain text.
 */

/// The text with a formula-looking start guarded.
export const guardCsvText = (value: string): string => (/^[=+\-@\t\r]/.test(value) ? `'${value}` : value);

/// A cell as written: guarded, and quoted where it holds a comma, quote or line break.
export function csvCell(value: string): string {
  const guarded = guardCsvText(value);
  return /[",\r\n]/.test(guarded) ? `"${guarded.replace(/"/g, '""')}"` : guarded;
}

/// A cell as written, always quoted (the lists' export): guarded first.
export const quotedCsvCell = (value: string): string => `"${guardCsvText(value).replace(/"/g, '""')}"`;

/// A list's export: the header and the rows, every cell quoted and guarded, CRLF between lines.
export const listToCsv = (header: readonly string[], rows: readonly (readonly string[])[]): string => [header, ...rows].map((cells) => cells.map(quotedCsvCell).join(",")).join("\r\n");
