/**
 * An amount in words, in English and Malay (6.13 Part A step 4: FR-PAD-002, the adjustment certificate's
 * reconciliation "stated also in words with an addition or omission direction"). The ringgit and the sen are each
 * said in whole words, never a float: the amount arrives in sen. Pure.
 */

import type { Sen } from "@/lib/money";

const EN_ONES = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen"];
const EN_TENS = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];
const EN_SCALES: [bigint, string][] = [
  [1_000_000_000_000n, "trillion"],
  [1_000_000_000n, "billion"],
  [1_000_000n, "million"],
  [1_000n, "thousand"],
];

function enBelowThousand(n: number): string {
  const out: string[] = [];
  if (n >= 100) {
    out.push(`${EN_ONES[Math.floor(n / 100)]} hundred`);
    n %= 100;
    if (n > 0) out.push("and");
  }
  if (n >= 20) out.push(EN_TENS[Math.floor(n / 10)] + (n % 10 ? `-${EN_ONES[n % 10]}` : ""));
  else if (n > 0) out.push(EN_ONES[n]);
  return out.join(" ");
}

/// A whole number in English words ("one million two hundred and three thousand and forty").
export function englishWords(value: bigint): string {
  if (value === 0n) return "zero";
  const parts: string[] = [];
  let rest = value;
  for (const [scale, name] of EN_SCALES) {
    if (rest >= scale) {
      parts.push(`${enBelowThousand(Number(rest / scale))} ${name}`);
      rest %= scale;
    }
  }
  if (rest > 0n) parts.push((parts.length && rest < 100n ? "and " : "") + enBelowThousand(Number(rest)));
  return parts.join(" ");
}

const MS_ONES = ["kosong", "satu", "dua", "tiga", "empat", "lima", "enam", "tujuh", "lapan", "sembilan"];
const MS_SCALES: [bigint, string, string][] = [
  [1_000_000_000_000n, "trilion", "setrilion"],
  [1_000_000_000n, "bilion", "sebilion"],
  [1_000_000n, "juta", "sejuta"],
  [1_000n, "ribu", "seribu"],
];

function msBelowThousand(n: number): string {
  const out: string[] = [];
  const h = Math.floor(n / 100);
  if (h === 1) out.push("seratus");
  else if (h > 1) out.push(`${MS_ONES[h]} ratus`);
  n %= 100;
  if (n === 10) out.push("sepuluh");
  else if (n === 11) out.push("sebelas");
  else if (n > 11 && n < 20) out.push(`${MS_ONES[n - 10]} belas`);
  else if (n >= 20) out.push(`${MS_ONES[Math.floor(n / 10)]} puluh` + (n % 10 ? ` ${MS_ONES[n % 10]}` : ""));
  else if (n > 0) out.push(MS_ONES[n]);
  return out.join(" ");
}

/// A whole number in Malay words ("satu juta dua ratus tiga ribu empat puluh"; one thousand is "seribu").
export function malayWords(value: bigint): string {
  if (value === 0n) return "kosong";
  const parts: string[] = [];
  let rest = value;
  for (const [scale, name, one] of MS_SCALES) {
    if (rest >= scale) {
      const k = rest / scale;
      parts.push(k === 1n ? one : `${msBelowThousand(Number(k))} ${name}`);
      rest %= scale;
    }
  }
  if (rest > 0n) parts.push(msBelowThousand(Number(rest)));
  return parts.join(" ");
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/// An amount in sen, in words: "Ringgit Malaysia three million … and sen sixty-seven only".
export function amountInWords(sen: Sen, lang: "en" | "ms"): string {
  const abs = sen < 0n ? -sen : sen;
  const ringgit = abs / 100n;
  const cents = abs % 100n;
  if (lang === "en") return `Ringgit Malaysia ${englishWords(ringgit)}${cents > 0n ? ` and sen ${englishWords(cents)}` : ""} only`.replace(/^./, (c) => c.toUpperCase());
  return cap(`Ringgit Malaysia ${malayWords(ringgit)}${cents > 0n ? ` dan sen ${malayWords(cents)}` : ""} sahaja`);
}
