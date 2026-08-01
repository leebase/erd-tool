import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { layoutDiagram } from "./elkLayout.js";

function sampleTables() {
  return [
    {
      id: "table:A",
      name: "A",
      x: 0,
      y: 0,
      fields: [
        { id: "col:a1", name: "ID", type: "NUMBER" },
        { id: "col:a2", name: "NAME", type: "VARCHAR" },
      ],
      comment: "keep-me",
      color: "#175e7a",
    },
    {
      id: "table:B",
      name: "B",
      x: 0,
      y: 0,
      fields: [{ id: "col:b1", name: "A_ID", type: "NUMBER" }],
      comment: "",
      color: "#175e7a",
    },
  ];
}

function sampleRelationships() {
  return [
    {
      id: "rel:1",
      startTableId: "table:B",
      endTableId: "table:A",
      startFieldId: "col:b1",
      endFieldId: "col:a1",
      fields: [{ startFieldId: "col:b1", endFieldId: "col:a1" }],
    },
  ];
}

describe("layoutDiagram", () => {
  it("layouts a two-table relationship with finite distinct coordinates and no mutation", async () => {
    const tables = sampleTables();
    const relationships = sampleRelationships();
    const before = structuredClone(tables);

    const laidOut = await layoutDiagram(tables, relationships);

    assert.equal(laidOut.length, 2);
    assert.notEqual(laidOut[0].x, laidOut[1].x);
    assert.ok(Number.isFinite(laidOut[0].x));
    assert.ok(Number.isFinite(laidOut[0].y));
    assert.ok(Number.isFinite(laidOut[1].x));
    assert.ok(Number.isFinite(laidOut[1].y));
    assert.equal(laidOut[0].id, "table:A");
    assert.equal(laidOut[0].fields.length, 2);
    assert.equal(laidOut[0].comment, "keep-me");
    assert.deepEqual(tables, before);
    assert.deepEqual(relationships, sampleRelationships());
  });

  it("handles empty and single-table diagrams", async () => {
    assert.deepEqual(await layoutDiagram([], []), []);

    const single = [
      {
        id: "table:ONLY",
        name: "ONLY",
        x: 5,
        y: 5,
        fields: [{ id: "c1", name: "ID", type: "NUMBER" }],
      },
    ];
    const before = structuredClone(single);
    const laidOut = await layoutDiagram(single, []);
    assert.equal(laidOut.length, 1);
    assert.ok(Number.isFinite(laidOut[0].x));
    assert.ok(Number.isFinite(laidOut[0].y));
    assert.deepEqual(single, before);
  });
});
