import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { ACT_SLOTS, slotKey } from "./act-slots";
import { slotColumns } from "./slot-columns";

describe("the column of each person slot", () => {
  it("is the relation's foreign key, read from the schema's text", () => {
    const schema = `model Possession {\n  id String @id\n  recordedByPersonId String\n  recordedBy Person @relation("PossessionBy", fields: [recordedByPersonId], references: [id], onDelete: Restrict)\n}\nmodel Other {\n  id String\n  head Person? @relation(fields: [headPersonId], references: [id])\n}`;
    expect(Object.fromEntries(slotColumns(schema))).toEqual({ "Possession.recordedBy": "recordedByPersonId", "Other.head": "headPersonId" });
  });

  it("finds one for every slot of the registry in the real schema", () => {
    const columns = slotColumns(readFileSync(path.join(process.cwd(), "prisma", "schema.prisma"), "utf8"));
    expect(ACT_SLOTS.map((s) => slotKey(s.entity, s.field)).filter((k) => !columns.has(k))).toEqual([]);
  });
});
