import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { diffFields, rowFieldLabel } from "@/lib/audit/diff";
import { auditCsv } from "@/lib/audit/export";

import { supplierFieldName } from "./audit-view";

/**
 * Residual 4: rows written before 6.15a fix S-1 hold endsOn = the last blacklisted day (included) with
 * freeFrom beside it. History read both as "Free from" and the export read that endsOn as "Ends on (not
 * included)": both wrong for such a row. A row carrying freeFrom has its endsOn labelled "Last blacklisted
 * day"; a row written since S-1 is unchanged.
 */

const legacy = diffFields(null, { standing: "Blacklisted", effectiveOn: "2026-09-24", endsOn: "2031-09-23", freeFrom: "2031-09-24" });
const current = diffFields(null, { standing: "Blacklisted", effectiveOn: "2026-10-03", lastBlacklistedDay: "2031-10-02", endsOn: "2031-10-03" });
const row = (changes: unknown) => ({ id: "e1", at: new Date("2026-10-03T02:00:00Z"), entity: "StandingEvent", entityId: "b", entityLabel: "VND-0005 · Blacklisting", action: "CREATE", changes, reason: "", unattributed: true, actorName: null });

describe("an endsOn written before S-1 is the last day (residual 4)", () => {
  it("the export's bytes: the legacy row's endsOn is the last blacklisted day; the current row's the exclusive end", () => {
    const legacyCsv = auditCsv([row(legacy)], "Asia/Kuala_Lumpur");
    expect(legacyCsv).toBe(
      "Entry,Recorded at (UTC),Organisation's day,Record type,Record,Record id,Action,Changes,Reason,Recorded by\r\n" +
        'e1,2026-10-03T02:00:00.000Z,2026-10-03,Standing event,VND-0005 · Blacklisting,b,CREATE,"[{""field"":""Standing"",""before"":null,""after"":""Blacklisted""},{""field"":""Effective on"",""before"":null,""after"":""2026-09-24""},{""field"":""Last blacklisted day"",""before"":null,""after"":""2031-09-23""},{""field"":""Free from"",""before"":null,""after"":""2031-09-24""}]",,Not attributed: no sign-in\r\n',
    );
    const currentCsv = auditCsv([row(current)], "Asia/Kuala_Lumpur");
    expect(currentCsv).toContain('{""field"":""Last blacklisted day"",""before"":null,""after"":""2031-10-02""},{""field"":""Ends on (not included)"",""before"":null,""after"":""2031-10-03""}');
  });

  it("History, on the supplier's record and in the shared drawer", () => {
    const fields = legacy.map((c) => c.field);
    expect(supplierFieldName("endsOn", fields)).toBe("Last blacklisted day");
    expect(supplierFieldName("freeFrom", fields)).toBe("Free from");
    expect(supplierFieldName("endsOn", current.map((c) => c.field))).toBe("Free from");
    expect(rowFieldLabel("endsOn", fields)).toBe("Last blacklisted day");
    expect(rowFieldLabel("endsOn", ["effectiveTo", "endsOn"])).toBe("Ends on (not included)");
    expect(readFileSync("src/components/history-drawer.tsx", "utf8")).toMatch(/rowFieldLabel\(c\.field, e\.changes\.map/);
    expect(readFileSync("src/app/suppliers/[id]/page.tsx", "utf8")).toMatch(/supplierFieldName\(ch\.field, e\.changes\.map/);
  });
});
