/**
 * Putting a merge field into a template's text from a picker (6.4 review U1): the field goes at
 * the cursor, or replaces the selection, and a clause (a paragraph of its own when printed) is
 * set apart from the text around it by a blank line. Pure, so the rule is tested without a
 * browser.
 */

export interface Inserted {
  text: string;
  /// Where the cursor goes: just after what was put in.
  cursor: number;
}

/// Insert `snippet` into `text` between `start` and `end` (the selection). `paragraph` sets it apart from its neighbours by a blank line.
export function insertSnippet(text: string, start: number, end: number, snippet: string, paragraph: boolean): Inserted {
  const from = Math.max(0, Math.min(start, text.length));
  const to = Math.max(from, Math.min(end, text.length));
  const before = text.slice(0, from);
  const after = text.slice(to);
  const lead = !paragraph || before === "" || before.endsWith("\n\n") ? "" : before.endsWith("\n") ? "\n" : "\n\n";
  const tail = !paragraph || after === "" || after.startsWith("\n\n") ? "" : after.startsWith("\n") ? "\n" : "\n\n";
  const put = `${lead}${snippet}${tail}`;
  return { text: `${before}${put}${after}`, cursor: before.length + lead.length + snippet.length };
}
