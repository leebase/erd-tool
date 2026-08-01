import ELK from "elkjs/lib/elk.bundled.js";
import {
  tableFieldHeight,
  tableHeaderHeight,
  tableWidth,
} from "../data/constants.js";

const ELK_OPTIONS = Object.freeze({
  "elk.algorithm": "layered",
  "elk.direction": "RIGHT",
  "elk.spacing.nodeNode": "80",
  "elk.layered.spacing.nodeNodeBetweenLayers": "100",
  "elk.layered.nodePlacement.bk.fixedAlignment": "BALANCED",
  "elk.edgeRouting": "ORTHOGONAL",
  "elk.padding": "[top=24,left=24,bottom=24,right=24]",
});

function nodeHeight(fieldCount) {
  return tableHeaderHeight + Math.max(fieldCount, 1) * tableFieldHeight;
}

/**
 * Layout tables with pinned elkjs layered options.
 * Returns a new table array; does not mutate inputs.
 */
export async function layoutDiagram(tables, relationships) {
  const inputTables = Array.isArray(tables) ? tables : [];
  const inputRelationships = Array.isArray(relationships) ? relationships : [];

  if (inputTables.length === 0) {
    return [];
  }

  const elk = new ELK();
  const graph = {
    id: "erd-root",
    layoutOptions: { ...ELK_OPTIONS },
    children: inputTables.map((table) => ({
      id: String(table.id),
      width: tableWidth,
      height: nodeHeight((table.fields || []).length),
    })),
    edges: inputRelationships.map((rel, index) => ({
      id: String(rel.id ?? `edge-${index}`),
      sources: [String(rel.startTableId)],
      targets: [String(rel.endTableId)],
    })),
  };

  const layout = await elk.layout(graph);
  const positions = new Map(
    (layout.children || []).map((child) => [
      child.id,
      {
        x: child.x,
        y: child.y,
      },
    ]),
  );

  return inputTables.map((table) => {
    const position = positions.get(String(table.id));
    const x = position && Number.isFinite(position.x) ? position.x : 0;
    const y = position && Number.isFinite(position.y) ? position.y : 0;
    return {
      ...table,
      fields: Array.isArray(table.fields) ? table.fields.map((field) => ({ ...field })) : [],
      x,
      y,
    };
  });
}
