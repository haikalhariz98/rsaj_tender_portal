/// The longest a page subtitle may be before it is cut and an information button
/// carries the rest. scripts/check-ui.mjs holds literal subtitles to the same number.
export const SUBTITLE_LIMIT = 90;

/// Cut `text` to at most `limit` characters, at the last word boundary at or before
/// the limit. Trailing punctuation that would dangle before the ellipsis is dropped.
/// A single word longer than the limit is cut hard at the limit.
export function cutAtWord(text: string, limit: number = SUBTITLE_LIMIT): { text: string; cut: boolean } {
  const whole = text.trim();
  if (whole.length <= limit) return { text: whole, cut: false };
  // A space right after the limit means the first `limit` characters end on a word.
  const head = whole.slice(0, limit + 1);
  const boundary = head.search(/\s\S*$/);
  const kept = boundary > 0 ? head.slice(0, boundary) : whole.slice(0, limit);
  const trimmed = kept.replace(/[\s,;:.–—-]+$/u, "");
  return { text: trimmed || kept, cut: true };
}
