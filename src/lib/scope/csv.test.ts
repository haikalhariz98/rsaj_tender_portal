import { describe, expect, it } from "vitest";

import { formatSen, parseSen } from "@/lib/money";

import { bqTotals, type FrozenBq } from "./bq";
import { bqCsvFilename, bqToCsv, csvCell, decodeCsv, importSummary, parseBqCsv, parseCsv } from "./csv";
import { CSV_FAULT_CODES, csvFaultText, keyedMismatchText } from "./labels";
import type { BqLine } from "./types";

const sen = (s: string) => parseSen(s);
const codes = (fs: { code: string }[]) => fs.map((f) => f.code);
const blocks = (fs: { code: string; level: string }[]) => fs.filter((f) => f.level === "block").map((f) => f.code);

/**
 * The worked example a finance officer can check by hand (plan §3, example 2; SK011 §7.2.4
 * BWV and FR-EST-002). A test fixture only (X-10 d), never demo data.
 *
 *   1  Preliminaries                      1 item    × 45,000.00 =  45,000.00
 *   2  Pipe laying                    1,250.5 m     ×    182.40 = 228,091.20
 *   3  Excavation under road (prov.)    310 m³    ×     65.75 =  20,382.50
 *   4  Prime cost sum: valves             1 sum     × 18,000.00 =  18,000.00
 *   5  Provisional sum: utilities         1 sum     ×  6,500.00 =   6,500.00
 *                                                       Total    317,973.70
 *   Builders' works (total less PC and provisional sums)          293,473.70
 *   Firm value, provisional quantities left out                   297,591.20
 */
const EXAMPLE = [
  "Section,Section title,Item,Description,Unit,Kind,Quantity,Rate,Amount,Provisional",
  "1,Preliminaries,1.1,Preliminaries,item,Measured work,1,45000.00,45000.00,No",
  "2,Pipe laying,2.1,\"Supply and lay 300mm pipe, class C\",m,Measured work,1250.5,182.40,228091.20,No",
  "2,Pipe laying,2.2,Excavation under road,m3,Measured work,310,65.75,20382.50,Yes",
  "3,Sums,3.1,Valves (prime cost sum),sum,Prime cost sum,1,18000.00,18000.00,No",
  "3,Sums,3.2,Utilities diversion (provisional sum),sum,Provisional sum,1,6500.00,6500.00,No",
].join("\r\n");

describe("the worked example, read from CSV", () => {
  const p = parseBqCsv(EXAMPLE);
  const lines = p.sections.flatMap((s) => s.items);

  it("reads three sections and five lines, with no fault and no mismatch", () => {
    expect(p.faults).toEqual([]);
    expect(p.keyedMismatches).toEqual([]);
    expect(p.sections.map((s) => [s.number, s.title, s.items.length])).toEqual([["1", "Preliminaries", 1], ["2", "Pipe laying", 2], ["3", "Sums", 2]]);
    expect(lines[1]).toEqual({ itemRef: "2.1", description: "Supply and lay 300mm pipe, class C", unit: "m", kind: "MEASURED", quantity: "1250.5", rate: sen("182.40"), provisional: false });
    expect(p.priced).toBe(true);
  });
  it("totals to the sen as the bill works them out", () => {
    const t = bqTotals(lines, true);
    expect(formatSen(t.total)).toBe(formatSen(sen("317973.70")));
    expect(t.buildersWorks).toBe(sen("293473.70"));
    expect(t.provisionalQuantities).toBe(sen("20382.50"));
    expect(t.firmValue).toBe(sen("297591.20"));
    expect(t.provisionalSharePct).toBe("6.4101");
    expect(importSummary(p)).toEqual({ sections: 3, lines: 5, priced: true, total: sen("317973.70"), incompleteLines: 0 });
  });
  it("a typed amount that differs is reported with its line and ignored", () => {
    const wrong = EXAMPLE.replace("228091.20", "228091.00");
    const q = parseBqCsv(wrong);
    expect(q.faults).toEqual([]);
    expect(q.keyedMismatches).toEqual([{ line: 3, keyed: sen("228091.00"), computed: sen("228091.20") }]);
    expect(bqTotals(q.sections.flatMap((s) => s.items), true).total).toBe(sen("317973.70"));
    expect(keyedMismatchText(q.keyedMismatches[0])).toMatch(/^Line 3: the file says .*228,091\.00.*228,091\.20.*ignored\.$/);
  });
  it("round trips: exported priced, read back, the same lines and totals", () => {
    const frozen: FrozenBq = { versionNo: 1, sections: p.sections };
    const back = parseBqCsv(bqToCsv(frozen, { priced: true }));
    expect(back.faults).toEqual([]);
    expect(back.keyedMismatches).toEqual([]);
    expect(back.sections).toEqual(p.sections);
    expect(bqTotals(back.sections.flatMap((s) => s.items), true)).toEqual(bqTotals(lines, true));
  });
  it("the unpriced export has no Rate or Amount column, and reads back with every line unpriced", () => {
    const csv = bqToCsv({ versionNo: 1, sections: p.sections }, { priced: false });
    const header = csv.replace(/^﻿/, "").split("\r\n")[0];
    expect(header).toBe("Section,Section title,Item,Description,Unit,Kind,Quantity,Provisional");
    expect(csv).not.toMatch(/182\.40|228091|45000/);
    const back = parseBqCsv(csv);
    expect(back.faults).toEqual([]);
    expect(back.priced).toBe(false);
    expect(back.sections.flatMap((s) => s.items).every((i) => i.rate == null)).toBe(true);
    expect(importSummary(back).incompleteLines).toBe(5);
  });
});

describe("parseCsv: RFC 4180", () => {
  it("quoted cells, doubled quotes, commas and line breaks inside quotes, CRLF or LF, a byte-order mark", () => {
    const r = parseCsv('﻿a,"b, c","say ""hi"""\r\n"two\nlines",x,\n');
    expect(r.faults).toEqual([]);
    expect(r.records).toEqual([
      { line: 1, cells: ["a", "b, c", 'say "hi"'] },
      { line: 2, cells: ["two\nlines", "x", ""] },
    ]);
  });
  it("a blank line is not a record; a lone CR ends one", () => {
    expect(parseCsv("a,b\n\nc,d\re,f").records.map((r) => r.cells)).toEqual([["a", "b"], ["c", "d"], ["e", "f"]]);
  });
  it("an unclosed quote and a stray quote are refused with their line", () => {
    expect(parseCsv('a,b\n"open,c').faults).toEqual([{ code: "UNTERMINATED_QUOTE", level: "block", line: 2 }]);
    expect(parseCsv('a,b\nx"y,c').faults).toEqual([{ code: "STRAY_QUOTE", level: "block", line: 2 }]);
    expect(parseCsv('a,b\n"x"y,c').faults).toEqual([{ code: "STRAY_QUOTE", level: "block", line: 2 }]);
  });
  it("UTF-8 only; the mark is taken off", () => {
    expect(decodeCsv(new TextEncoder().encode("﻿a,b"))).toEqual({ text: "a,b" });
    expect(decodeCsv(new Uint8Array([0x61, 0x2c, 0xff, 0xfe]))).toEqual({ fault: { code: "NOT_UTF8", level: "block" } });
  });
});

describe("parseBqCsv: every rule refuses on its own, with its line, and nothing is half-read", () => {
  const H = "Section,Section title,Item,Description,Unit,Kind,Quantity,Rate,Amount,Provisional";
  const one = (row: string) => parseBqCsv(`${H}\n${row}`);
  it("the header", () => {
    expect(blocks(parseBqCsv("").faults)).toEqual(["EMPTY_FILE"]);
    expect(blocks(parseBqCsv("x,y\n1,2").faults)).toEqual(["NO_HEADER"]);
    expect(blocks(parseBqCsv("Section,Description\n1,a").faults)).toEqual(["COLUMN_MISSING"]);
    expect(blocks(parseBqCsv("Section,Description,Quantity,quantity\n1,a,1,1").faults)).toEqual(["COLUMN_REPEATED"]);
    expect(blocks(parseBqCsv(H).faults)).toEqual(["NO_LINES"]);
    // An unknown column only warns, and is ignored.
    const p = parseBqCsv("section , DESCRIPTION,Quantity,Colour\n1,Pipe,2,red");
    expect(blocks(p.faults)).toEqual([]);
    expect(codes(p.faults)).toEqual(["COLUMN_UNKNOWN"]);
    expect(p.sections[0]).toEqual({ number: "1", title: "Section 1", items: [{ itemRef: "", description: "Pipe", unit: "", kind: "MEASURED", quantity: "2", rate: null, provisional: false }] });
    expect(p.priced).toBe(false);
  });
  it("each cell", () => {
    expect(one("1,A,1.1,Pipe,m,Measured work,1,2.00,,No,extra").faults.map((f) => [f.code, f.line])).toEqual([["WRONG_CELL_COUNT", 2]]);
    expect(blocks(one(",A,1.1,Pipe,m,,1,2.00,,").faults)).toEqual(["SECTION_REQUIRED"]);
    expect(blocks(one("1,A,1.1,,m,,1,2.00,,").faults)).toEqual(["DESCRIPTION_REQUIRED"]);
    expect(blocks(one("1,A,1.1,Pipe,m,Labour,1,2.00,,").faults)).toEqual(["KIND_UNKNOWN"]);
    expect(blocks(one("1,A,1.1,Pipe,m,,1.2345,2.00,,").faults)).toEqual(["QUANTITY_INVALID"]);
    expect(blocks(one("1,A,1.1,Pipe,m,,-1,2.00,,").faults)).toEqual(["QUANTITY_INVALID"]);
    expect(blocks(one("1,A,1.1,Pipe,m,,1,2.005,,").faults)).toEqual(["RATE_INVALID"]);
    expect(blocks(one("1,A,1.1,Pipe,m,,1,-2.00,,").faults)).toEqual(["RATE_INVALID"]);
    expect(blocks(one("1,A,1.1,Pipe,m,,1,2.00,,maybe").faults)).toEqual(["PROVISIONAL_UNKNOWN"]);
    expect(blocks(one("1,A,1.1,Pipe,m,Prime cost sum,1,2.00,,Yes").faults)).toEqual(["PROVISIONAL_NOT_MEASURED"]);
    // An amount that is not an amount is not compared; it warns and is ignored.
    expect(codes(one("1,A,1.1,Pipe,m,,1,2.00,lots,").faults)).toEqual(["AMOUNT_INVALID"]);
  });
  it("one title per section", () => {
    const p = parseBqCsv(`${H}\n1,Works,1.1,Pipe,m,,1,2.00,,\n1,Other,1.2,Valve,no,,1,3.00,,`);
    expect(p.faults).toEqual([{ code: "SECTION_TITLE_DIFFERS", level: "block", line: 3, data: { section: "1", first: 2 } }]);
  });
  it("blank kind is measured work, blank provisional is no, a blank rate leaves the line unpriced, thousands separators are read", () => {
    const p = one('1,A,1.1,Pipe,m,,"1,250.5",182.40,,');
    expect(p.faults).toEqual([]);
    expect(p.sections[0].items[0]).toMatchObject({ kind: "MEASURED", quantity: "1250.5", rate: sen("182.40"), provisional: false });
  });
  it("every finding reads in words with its line, and none shows a code", () => {
    for (const code of CSV_FAULT_CODES) {
      const t = csvFaultText({ code, level: "block", line: 7, data: { column: "Rate", kind: "x", quantity: "x", rate: "x", amount: "x", provisional: "x", section: "1", first: 2, found: 3, expected: 4 } });
      expect(t, code).toMatch(/^Line 7: /);
      expect(t, code).not.toMatch(/[A-Z]{2,}_[A-Z_]+/);
      expect(t, code).not.toBe("Line 7: This line was refused.");
    }
  });
});

describe("formulas never leave as formulas (CSV injection)", () => {
  it("a cell starting = + - @ is written with an apostrophe, and quoted where it must be", () => {
    expect(csvCell("=SUM(A1)")).toBe("'=SUM(A1)");
    expect(csvCell("+60 12")).toBe("'+60 12");
    expect(csvCell("-150mm pipe")).toBe("'-150mm pipe");
    expect(csvCell("@cmd")).toBe("'@cmd");
    expect(csvCell('=HYPERLINK("x","y")')).toBe(`"'=HYPERLINK(""x"",""y"")"`);
    expect(csvCell("plain")).toBe("plain");
  });
  it("and the apostrophe comes off on import", () => {
    const line: BqLine = { itemRef: "-1", description: "=cmd|' /C calc'!A0", unit: "@m", kind: "MEASURED", quantity: "1", rate: sen("1.00"), provisional: false };
    const back = parseBqCsv(bqToCsv({ versionNo: 1, sections: [{ number: "+1", title: "-Works", items: [line] }] }, { priced: true }));
    expect(back.faults).toEqual([]);
    expect(back.sections).toEqual([{ number: "+1", title: "-Works", items: [line] }]);
  });
});

describe("round trip, property: any bill exported and read back is the same bill", () => {
  // A small seeded generator, so the test is the same every run.
  function rng(seed: number) {
    let s = seed >>> 0;
    return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 2 ** 32);
  }
  const PIECES = ["Pipe", "valve, 150mm", 'say "ok"', "two\nlines", "=1+1", "-dash", "@at", "+plus", "Kerja tanah", "über", "  padded", "a,b,c", "'quoted"];
  it("200 generated bills", () => {
    const r = rng(20261001);
    const pick = <T,>(xs: readonly T[]) => xs[Math.floor(r() * xs.length)];
    for (let n = 0; n < 200; n++) {
      const sections = Array.from({ length: 1 + Math.floor(r() * 3) }, (_, si) => ({
        number: String(si + 1),
        title: pick(PIECES).trim() || "T",
        items: Array.from({ length: 1 + Math.floor(r() * 4) }, (_, ii): BqLine => {
          const kind = pick(["MEASURED", "PRIME_COST_SUM", "PROVISIONAL_SUM"] as const);
          return {
            itemRef: `${si + 1}.${ii + 1}`,
            description: `${pick(PIECES)} ${ii}`.trim(),
            unit: pick(["m", "m3", "item", ""]),
            kind,
            quantity: r() < 0.1 ? null : `${Math.floor(r() * 5000)}${r() < 0.5 ? `.${Math.floor(r() * 1000)}`.replace(/0+$/, "").replace(/\.$/, "") : ""}`,
            rate: r() < 0.1 ? null : BigInt(Math.floor(r() * 10_000_000)),
            provisional: kind === "MEASURED" && r() < 0.3,
          };
        }),
      }));
      const priced = r() < 0.7;
      const back = parseBqCsv(bqToCsv({ versionNo: 1, sections }, { priced }));
      // "'quoted" is text that begins with an apostrophe not before a formula sign: kept as is.
      expect(blocks(back.faults), `bill ${n}`).toEqual([]);
      const expected = sections.map((s) => ({ ...s, items: s.items.map((i) => ({ ...i, description: i.description.trim(), rate: priced ? i.rate : null })) }));
      expect(back.sections, `bill ${n}`).toEqual(expected);
      if (priced) expect(bqTotals(back.sections.flatMap((s) => s.items), null), `bill ${n}`).toEqual(bqTotals(sections.flatMap((s) => s.items), null));
    }
  });
});

describe("the file's name", () => {
  it("is the exercise's reference and the version, never an id", () => {
    expect(bqCsvFilename("DEMO/SX/15/2026", 2, false)).toBe("DEMO-SX-15-2026-bill-v2-unpriced.csv");
    expect(bqCsvFilename("DEMO/SX/15/2026", 1, true)).toBe("DEMO-SX-15-2026-bill-v1-priced.csv");
  });
});
