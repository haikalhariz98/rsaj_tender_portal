/**
 * Work items' bounds (stage 3a plan §3.1). Technical constants, not customer policy (the `SUBMISSIONS_PER_WINDOW` precedent): they keep one row and one act
 * to a sane size, since every byte is kept for good. Lengths count code points (`[...s].length`), as Postgres `char_length` does. Pure.
 */

/// A title is a line on a card and a list row; 200 holds any honest one.
export const TITLE_MAX = 200;
/// A description, an RFI's answer or a comment: a long page of text; more is a file.
export const TEXT_MAX = 10_000;
/// A location is a grid line, a level or a room, not a paragraph.
export const LOCATION_MAX = 120;
/// The most files one act pins to an item: the project-document bound (`PROJECT_FILES_PER_VERSION`); more is a script.
export const FILES_PER_ACT = 20;

/// The length a bound is judged on: code points, so an emoji is one, as the database counts it.
export const textLength = (s: string): number => [...s].length;
