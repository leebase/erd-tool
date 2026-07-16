import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  canonicalProjectToDiagram,
  diagramToCanonicalProject,
  renderCanonicalSnowflakeDDL,
  toSnowflakeIdentifier,
} from "./projectAdapter.js";

function twoTableProject(overrides = {}) {
  const physical_model = {
    model_version: "1",
    name: "demo-model",
    namespaces: [
      {
        id: "namespace:ANALYTICS.CORE",
        catalog: "ANALYTICS",
        schema: "CORE",
      },
    ],
    tables: [
      {
        id: "table:ANALYTICS.CORE.CUSTOMER",
        namespace_id: "namespace:ANALYTICS.CORE",
        name: "CUSTOMER",
        kind: "table",
        columns: [
          {
            id: "column:ANALYTICS.CORE.CUSTOMER.CUSTOMER_ID",
            name: "CUSTOMER_ID",
            ordinal: 1,
            data_type: {
              family: "NUMBER",
              text: "NUMBER(38, 0)",
              precision: 38,
              scale: 0,
              length: null,
            },
            nullable: false,
            default: null,
            comment: null,
          },
          {
            id: "column:ANALYTICS.CORE.CUSTOMER.CUSTOMER_NAME",
            name: "CUSTOMER_NAME",
            ordinal: 2,
            data_type: {
              family: "VARCHAR",
              text: "VARCHAR(200)",
              precision: null,
              scale: null,
              length: 200,
            },
            nullable: false,
            default: null,
            comment: "display name",
          },
          {
            id: "column:ANALYTICS.CORE.CUSTOMER.EMAIL",
            name: "EMAIL",
            ordinal: 3,
            data_type: {
              family: "VARCHAR",
              text: "VARCHAR(320)",
              precision: null,
              scale: null,
              length: 320,
            },
            nullable: false,
            default: null,
            comment: null,
          },
        ],
        constraints: [
          {
            id: "constraint:ANALYTICS.CORE.CUSTOMER.PK_CUSTOMER",
            name: "PK_CUSTOMER",
            kind: "primary_key",
            columns: ["column:ANALYTICS.CORE.CUSTOMER.CUSTOMER_ID"],
            referenced_table_id: null,
            referenced_columns: [],
          },
          {
            id: "constraint:ANALYTICS.CORE.CUSTOMER.UQ_CUSTOMER_EMAIL",
            name: "UQ_CUSTOMER_EMAIL",
            kind: "unique",
            columns: ["column:ANALYTICS.CORE.CUSTOMER.EMAIL"],
            referenced_table_id: null,
            referenced_columns: [],
          },
        ],
        comment: null,
      },
      {
        id: "table:ANALYTICS.CORE.ORDER_HEADER",
        namespace_id: "namespace:ANALYTICS.CORE",
        name: "ORDER_HEADER",
        kind: "table",
        columns: [
          {
            id: "column:ANALYTICS.CORE.ORDER_HEADER.ORDER_ID",
            name: "ORDER_ID",
            ordinal: 1,
            data_type: {
              family: "NUMBER",
              text: "NUMBER(38, 0)",
              precision: 38,
              scale: 0,
              length: null,
            },
            nullable: false,
            default: null,
            comment: null,
          },
          {
            id: "column:ANALYTICS.CORE.ORDER_HEADER.CUSTOMER_ID",
            name: "CUSTOMER_ID",
            ordinal: 2,
            data_type: {
              family: "NUMBER",
              text: "NUMBER(38, 0)",
              precision: 38,
              scale: 0,
              length: null,
            },
            nullable: false,
            default: null,
            comment: null,
          },
          {
            id: "column:ANALYTICS.CORE.ORDER_HEADER.ORDER_DATE",
            name: "ORDER_DATE",
            ordinal: 3,
            data_type: {
              family: "DATE",
              text: "DATE",
              precision: null,
              scale: null,
              length: null,
            },
            nullable: false,
            default: null,
            comment: null,
          },
        ],
        constraints: [
          {
            id: "constraint:ANALYTICS.CORE.ORDER_HEADER.FK_ORDER_HEADER_CUSTOMER",
            name: "FK_ORDER_HEADER_CUSTOMER",
            kind: "foreign_key",
            columns: ["column:ANALYTICS.CORE.ORDER_HEADER.CUSTOMER_ID"],
            referenced_table_id: "table:ANALYTICS.CORE.CUSTOMER",
            referenced_columns: [
              "column:ANALYTICS.CORE.CUSTOMER.CUSTOMER_ID",
            ],
          },
          {
            id: "constraint:ANALYTICS.CORE.ORDER_HEADER.PK_ORDER_HEADER",
            name: "PK_ORDER_HEADER",
            kind: "primary_key",
            columns: ["column:ANALYTICS.CORE.ORDER_HEADER.ORDER_ID"],
            referenced_table_id: null,
            referenced_columns: [],
          },
        ],
        comment: null,
      },
    ],
    relationships: [
      {
        id: "relationship:ANALYTICS.CORE.ORDER_HEADER.FK_ORDER_HEADER_CUSTOMER",
        name: "FK_ORDER_HEADER_CUSTOMER",
        source_table_id: "table:ANALYTICS.CORE.ORDER_HEADER",
        source_column_ids: [
          "column:ANALYTICS.CORE.ORDER_HEADER.CUSTOMER_ID",
        ],
        target_table_id: "table:ANALYTICS.CORE.CUSTOMER",
        target_column_ids: [
          "column:ANALYTICS.CORE.CUSTOMER.CUSTOMER_ID",
        ],
        cardinality: "many_to_one",
      },
    ],
  };

  return {
    project_version: "1",
    physical_model,
    diagram_layout: {
      nodes: {
        "table:ANALYTICS.CORE.CUSTOMER": { x: 40, y: 80 },
        "table:ANALYTICS.CORE.ORDER_HEADER": { x: 360, y: 120 },
      },
      viewport: { x: 10, y: 20, zoom: 1.25 },
    },
    ...overrides,
  };
}

describe("toSnowflakeIdentifier", () => {
  it("normalizes legal unquoted Snowflake identifiers", () => {
    assert.equal(toSnowflakeIdentifier("customer"), "CUSTOMER");
    assert.equal(toSnowflakeIdentifier(" order-header "), "_ORDER_HEADER_");
    assert.equal(toSnowflakeIdentifier("123bad"), "_123BAD");
    assert.equal(toSnowflakeIdentifier("a$b"), "A$B");
  });

  it("maps every source character without trimming; spaces and NBSP become underscores", () => {
    assert.equal(toSnowflakeIdentifier(" A "), "_A_");
    assert.equal(toSnowflakeIdentifier("\u00A0Straße\u00A0"), "_STRA_E_");
    assert.equal(toSnowflakeIdentifier("Straße"), "STRA_E");
    assert.equal(toSnowflakeIdentifier("Strasse"), "STRASSE");
  });

  it("fails on empty normalization", () => {
    assert.throws(() => toSnowflakeIdentifier(""), /empty|identifier/i);
  });
});

describe("canonicalProjectToDiagram", () => {
  it("imports a two-table canonical project with stable ids and field flags", () => {
    const diagram = canonicalProjectToDiagram(twoTableProject());

    assert.equal(diagram.title, "demo-model");
    assert.equal(diagram.tables.length, 2);
    assert.equal(diagram.relationships.length, 1);

    const customer = diagram.tables.find(
      (t) => t.id === "table:ANALYTICS.CORE.CUSTOMER",
    );
    const order = diagram.tables.find(
      (t) => t.id === "table:ANALYTICS.CORE.ORDER_HEADER",
    );
    assert.ok(customer);
    assert.ok(order);
    assert.equal(customer.x, 40);
    assert.equal(customer.y, 80);
    assert.equal(order.x, 360);
    assert.equal(order.y, 120);

    const idField = customer.fields.find(
      (f) => f.id === "column:ANALYTICS.CORE.CUSTOMER.CUSTOMER_ID",
    );
    const emailField = customer.fields.find(
      (f) => f.id === "column:ANALYTICS.CORE.CUSTOMER.EMAIL",
    );
    const nameField = customer.fields.find(
      (f) => f.id === "column:ANALYTICS.CORE.CUSTOMER.CUSTOMER_NAME",
    );
    assert.equal(idField.primary, true);
    assert.equal(idField.notNull, true);
    assert.equal(idField.increment, false);
    assert.equal(idField.check, "");
    assert.equal(idField.type, "NUMBER");
    assert.equal(idField.size, "38,0");
    assert.equal(emailField.unique, true);
    assert.equal(nameField.comment, "display name");
    assert.equal(nameField.size, 200);

    assert.deepEqual(customer.namespace, {
      id: "namespace:ANALYTICS.CORE",
      catalog: "ANALYTICS",
      schema: "CORE",
    });
    assert.equal(customer.physical_model, undefined);
    assert.equal(customer.namespaces, undefined);

    const rel = diagram.relationships[0];
    assert.equal(rel.startTableId, "table:ANALYTICS.CORE.ORDER_HEADER");
    assert.equal(rel.endTableId, "table:ANALYTICS.CORE.CUSTOMER");
    assert.equal(
      rel.startFieldId,
      "column:ANALYTICS.CORE.ORDER_HEADER.CUSTOMER_ID",
    );
    assert.equal(
      rel.endFieldId,
      "column:ANALYTICS.CORE.CUSTOMER.CUSTOMER_ID",
    );
    assert.deepEqual(rel.fields, [
      {
        startFieldId: "column:ANALYTICS.CORE.ORDER_HEADER.CUSTOMER_ID",
        endFieldId: "column:ANALYTICS.CORE.CUSTOMER.CUSTOMER_ID",
      },
    ]);
    assert.equal(rel.cardinality, "many_to_one");
    assert.equal(rel.updateConstraint, "No action");
    assert.equal(rel.deleteConstraint, "No action");

    assert.deepEqual(diagram.transform, {
      pan: { x: 10, y: 20 },
      zoom: 1.25,
    });
  });

  it("loads missing diagram_layout as empty nodes and default viewport", () => {
    const project = twoTableProject();
    delete project.diagram_layout;
    const diagram = canonicalProjectToDiagram(project);
    assert.equal(typeof diagram.tables[0].x, "number");
    assert.equal(typeof diagram.tables[0].y, "number");
    assert.deepEqual(diagram.transform, {
      pan: { x: 0, y: 0 },
      zoom: 1,
    });
  });

  it("rejects unknown project versions and forbidden credential fields", () => {
    assert.throws(
      () =>
        canonicalProjectToDiagram({
          ...twoTableProject(),
          project_version: "2",
        }),
      /project_version|version/i,
    );
    assert.throws(
      () =>
        canonicalProjectToDiagram({
          ...twoTableProject(),
          warehouse: "WH",
        }),
      /warehouse|unexpected|forbidden|unknown/i,
    );
    assert.throws(
      () =>
        canonicalProjectToDiagram({
          ...twoTableProject({
            physical_model: {
              ...twoTableProject().physical_model,
              account: "xy12345",
            },
          }),
        }),
      /account|forbidden|unexpected|unknown/i,
    );
  });

  it("rejects unresolved relationship ids and accepts multiple namespaces", () => {
    const multi = twoSchemaProject();
    const diagram = canonicalProjectToDiagram(multi);
    assert.equal(diagram.tables.length, 3);
    assert.deepEqual(
      diagram.tables.find((t) => t.id === "table:ANALYTICS.CORE.CUSTOMER").namespace,
      { id: "namespace:ANALYTICS.CORE", catalog: "ANALYTICS", schema: "CORE" },
    );
    assert.deepEqual(
      diagram.tables.find((t) => t.id === "table:ANALYTICS.MART.CUSTOMER").namespace,
      { id: "namespace:ANALYTICS.MART", catalog: "ANALYTICS", schema: "MART" },
    );

    const badRel = twoTableProject();
    badRel.physical_model.relationships[0].target_table_id =
      "table:ANALYTICS.CORE.MISSING";
    assert.throws(
      () => canonicalProjectToDiagram(badRel),
      /unresolved|unknown|reference/i,
    );
  });
});

function numberType() {
  return {
    family: "NUMBER",
    text: "NUMBER(38, 0)",
    precision: 38,
    scale: 0,
    length: null,
  };
}

function twoSchemaProject() {
  const physical_model = {
    model_version: "1",
    name: "two-schema-model",
    namespaces: [
      {
        id: "namespace:ANALYTICS.CORE",
        catalog: "ANALYTICS",
        schema: "CORE",
      },
      {
        id: "namespace:ANALYTICS.MART",
        catalog: "ANALYTICS",
        schema: "MART",
      },
    ],
    tables: [
      {
        id: "table:ANALYTICS.CORE.CUSTOMER",
        namespace_id: "namespace:ANALYTICS.CORE",
        name: "CUSTOMER",
        kind: "table",
        columns: [
          {
            id: "column:ANALYTICS.CORE.CUSTOMER.CUSTOMER_ID",
            name: "CUSTOMER_ID",
            ordinal: 1,
            data_type: numberType(),
            nullable: false,
            default: null,
            comment: null,
          },
        ],
        constraints: [
          {
            id: "constraint:ANALYTICS.CORE.CUSTOMER.PK_CUSTOMER",
            name: "PK_CUSTOMER",
            kind: "primary_key",
            columns: ["column:ANALYTICS.CORE.CUSTOMER.CUSTOMER_ID"],
            referenced_table_id: null,
            referenced_columns: [],
          },
        ],
        comment: null,
      },
      {
        id: "table:ANALYTICS.MART.CUSTOMER",
        namespace_id: "namespace:ANALYTICS.MART",
        name: "CUSTOMER",
        kind: "table",
        columns: [
          {
            id: "column:ANALYTICS.MART.CUSTOMER.CUSTOMER_ID",
            name: "CUSTOMER_ID",
            ordinal: 1,
            data_type: numberType(),
            nullable: false,
            default: null,
            comment: null,
          },
        ],
        constraints: [
          {
            id: "constraint:ANALYTICS.MART.CUSTOMER.PK_CUSTOMER",
            name: "PK_CUSTOMER",
            kind: "primary_key",
            columns: ["column:ANALYTICS.MART.CUSTOMER.CUSTOMER_ID"],
            referenced_table_id: null,
            referenced_columns: [],
          },
        ],
        comment: null,
      },
      {
        id: "table:ANALYTICS.MART.ORDER_FACT",
        namespace_id: "namespace:ANALYTICS.MART",
        name: "ORDER_FACT",
        kind: "table",
        columns: [
          {
            id: "column:ANALYTICS.MART.ORDER_FACT.ORDER_ID",
            name: "ORDER_ID",
            ordinal: 1,
            data_type: numberType(),
            nullable: false,
            default: null,
            comment: null,
          },
          {
            id: "column:ANALYTICS.MART.ORDER_FACT.CUSTOMER_ID",
            name: "CUSTOMER_ID",
            ordinal: 2,
            data_type: numberType(),
            nullable: false,
            default: null,
            comment: null,
          },
        ],
        constraints: [
          {
            id: "constraint:ANALYTICS.MART.ORDER_FACT.FK_ORDER_FACT_CUSTOMER",
            name: "FK_ORDER_FACT_CUSTOMER",
            kind: "foreign_key",
            columns: ["column:ANALYTICS.MART.ORDER_FACT.CUSTOMER_ID"],
            referenced_table_id: "table:ANALYTICS.CORE.CUSTOMER",
            referenced_columns: [
              "column:ANALYTICS.CORE.CUSTOMER.CUSTOMER_ID",
            ],
          },
          {
            id: "constraint:ANALYTICS.MART.ORDER_FACT.PK_ORDER_FACT",
            name: "PK_ORDER_FACT",
            kind: "primary_key",
            columns: ["column:ANALYTICS.MART.ORDER_FACT.ORDER_ID"],
            referenced_table_id: null,
            referenced_columns: [],
          },
        ],
        comment: null,
      },
    ],
    relationships: [
      {
        id: "relationship:ANALYTICS.MART.ORDER_FACT.FK_ORDER_FACT_CUSTOMER",
        name: "FK_ORDER_FACT_CUSTOMER",
        source_table_id: "table:ANALYTICS.MART.ORDER_FACT",
        source_column_ids: [
          "column:ANALYTICS.MART.ORDER_FACT.CUSTOMER_ID",
        ],
        target_table_id: "table:ANALYTICS.CORE.CUSTOMER",
        target_column_ids: [
          "column:ANALYTICS.CORE.CUSTOMER.CUSTOMER_ID",
        ],
        cardinality: "many_to_one",
      },
    ],
  };

  return {
    project_version: "1",
    physical_model,
    diagram_layout: {
      nodes: {
        "table:ANALYTICS.CORE.CUSTOMER": { x: 40, y: 80 },
        "table:ANALYTICS.MART.CUSTOMER": { x: 40, y: 280 },
        "table:ANALYTICS.MART.ORDER_FACT": { x: 360, y: 120 },
      },
      viewport: { x: 0, y: 0, zoom: 1 },
    },
  };
}

function legacyTwoTableDiagramWithoutNamespace() {
  return {
    title: "legacy-snowflake",
    tables: [
      {
        id: "cust-1",
        name: "customer",
        x: 40,
        y: 80,
        comment: "",
        fields: [
          {
            id: "cust-id",
            name: "customer_id",
            type: "NUMBER",
            size: "38,0",
            default: "",
            check: "",
            primary: true,
            unique: false,
            notNull: true,
            increment: false,
            comment: "",
          },
        ],
      },
      {
        id: "ord-1",
        name: "order_header",
        x: 360,
        y: 120,
        comment: "",
        fields: [
          {
            id: "ord-id",
            name: "order_id",
            type: "NUMBER",
            size: "38,0",
            default: "",
            check: "",
            primary: true,
            unique: false,
            notNull: true,
            increment: false,
            comment: "",
          },
          {
            id: "ord-cust-id",
            name: "customer_id",
            type: "NUMBER",
            size: "38,0",
            default: "",
            check: "",
            primary: false,
            unique: false,
            notNull: true,
            increment: false,
            comment: "",
          },
        ],
      },
    ],
    relationships: [
      {
        id: "rel-1",
        name: "fk_order_header_customer",
        startTableId: "ord-1",
        endTableId: "cust-1",
        startFieldId: "ord-cust-id",
        endFieldId: "cust-id",
        fields: [{ startFieldId: "ord-cust-id", endFieldId: "cust-id" }],
        cardinality: "many_to_one",
        updateConstraint: "No action",
        deleteConstraint: "No action",
      },
    ],
    transform: { pan: { x: 0, y: 0 }, zoom: 1 },
  };
}

describe("diagramToCanonicalProject", () => {
  it("migrates legacy diagrams without namespace to MODEL.PUBLIC ids and DDL", () => {
    const diagram = legacyTwoTableDiagramWithoutNamespace();
    const exported = diagramToCanonicalProject(diagram);
    const model = exported.physical_model;

    assert.deepEqual(model.namespaces, [
      {
        id: "namespace:MODEL.PUBLIC",
        catalog: "MODEL",
        schema: "PUBLIC",
      },
    ]);
    assert.ok(model.tables.some((t) => t.id === "table:MODEL.PUBLIC.CUSTOMER"));
    assert.ok(
      model.tables.some((t) => t.id === "table:MODEL.PUBLIC.ORDER_HEADER"),
    );
    assert.equal(
      model.relationships[0].id,
      "relationship:MODEL.PUBLIC.ORDER_HEADER.FK_ORDER_HEADER_CUSTOMER",
    );
    assert.equal(
      model.relationships[0].source_table_id,
      "table:MODEL.PUBLIC.ORDER_HEADER",
    );
    assert.equal(
      model.relationships[0].target_table_id,
      "table:MODEL.PUBLIC.CUSTOMER",
    );

    const ddl = renderCanonicalSnowflakeDDL(exported);
    assert.match(ddl, /CREATE DATABASE IF NOT EXISTS MODEL;/);
    assert.match(ddl, /CREATE SCHEMA IF NOT EXISTS MODEL\.PUBLIC;/);
    assert.match(ddl, /CREATE TABLE MODEL\.PUBLIC\.CUSTOMER \(/);
    assert.match(ddl, /CREATE TABLE MODEL\.PUBLIC\.ORDER_HEADER \(/);
    assert.match(
      ddl,
      /ALTER TABLE MODEL\.PUBLIC\.ORDER_HEADER ADD CONSTRAINT FK_ORDER_HEADER_CUSTOMER FOREIGN KEY \(CUSTOMER_ID\) REFERENCES MODEL\.PUBLIC\.CUSTOMER \(CUSTOMER_ID\) NOT ENFORCED;/,
    );
  });

  it("rejects mixed namespace presence clearly", () => {
    const diagram = legacyTwoTableDiagramWithoutNamespace();
    diagram.tables[0].namespace = {
      id: "namespace:ANALYTICS.CORE",
      catalog: "ANALYTICS",
      schema: "CORE",
    };
    assert.throws(
      () => diagramToCanonicalProject(diagram),
      /mixed namespace presence/i,
    );
  });

  it("round-trips multi-schema projects with same table names and cross-schema FKs", () => {
    const original = twoSchemaProject();
    const diagram = canonicalProjectToDiagram(original);
    assert.equal(
      diagram.tables.filter((t) => t.name === "CUSTOMER").length,
      2,
    );
    assert.deepEqual(
      new Set(diagram.tables.map((t) => t.namespace.schema)),
      new Set(["CORE", "MART"]),
    );

    const exported = diagramToCanonicalProject({
      title: diagram.title,
      tables: diagram.tables,
      relationships: diagram.relationships,
      transform: diagram.transform,
    });
    assert.deepEqual(exported.physical_model.namespaces, [
      {
        id: "namespace:ANALYTICS.CORE",
        catalog: "ANALYTICS",
        schema: "CORE",
      },
      {
        id: "namespace:ANALYTICS.MART",
        catalog: "ANALYTICS",
        schema: "MART",
      },
    ]);
    assert.ok(
      exported.physical_model.tables.some(
        (t) => t.id === "table:ANALYTICS.CORE.CUSTOMER",
      ),
    );
    assert.ok(
      exported.physical_model.tables.some(
        (t) => t.id === "table:ANALYTICS.MART.CUSTOMER",
      ),
    );
    const rel = exported.physical_model.relationships[0];
    assert.equal(
      rel.id,
      "relationship:ANALYTICS.MART.ORDER_FACT.FK_ORDER_FACT_CUSTOMER",
    );
    assert.equal(rel.source_table_id, "table:ANALYTICS.MART.ORDER_FACT");
    assert.equal(rel.target_table_id, "table:ANALYTICS.CORE.CUSTOMER");
    assert.deepEqual(rel.target_column_ids, [
      "column:ANALYTICS.CORE.CUSTOMER.CUSTOMER_ID",
    ]);

    const again = diagramToCanonicalProject({
      title: diagram.title,
      tables: canonicalProjectToDiagram(exported).tables,
      relationships: canonicalProjectToDiagram(exported).relationships,
      transform: canonicalProjectToDiagram(exported).transform,
    });
    assert.deepEqual(again.physical_model, exported.physical_model);
  });

  it("rejects duplicate ids for namespaces, tables, columns, constraints, and relationships", () => {
    const dupNs = twoTableProject();
    dupNs.physical_model.namespaces = [
      {
        id: "namespace:ANALYTICS.CORE",
        catalog: "ANALYTICS",
        schema: "CORE",
      },
      {
        id: "namespace:ANALYTICS.CORE",
        catalog: "ANALYTICS",
        schema: "CORE",
      },
    ];
    assert.throws(() => canonicalProjectToDiagram(dupNs), /unique ids|namespace/i);

    const dupTable = twoTableProject();
    dupTable.physical_model.tables[1] = structuredClone(
      dupTable.physical_model.tables[0],
    );
    assert.throws(() => canonicalProjectToDiagram(dupTable), /unique ids|sorted/i);

    const dupColumn = twoTableProject();
    dupColumn.physical_model.tables[0].columns[1] = structuredClone(
      dupColumn.physical_model.tables[0].columns[0],
    );
    dupColumn.physical_model.tables[0].columns[1].ordinal = 2;
    assert.throws(() => canonicalProjectToDiagram(dupColumn), /unique ids/i);

    const dupConstraint = twoTableProject();
    const customer = dupConstraint.physical_model.tables[0];
    customer.constraints.push(structuredClone(customer.constraints[0]));
    customer.constraints = [...customer.constraints].sort((a, b) =>
      a.id < b.id ? -1 : a.id > b.id ? 1 : 0,
    );
    assert.throws(() => canonicalProjectToDiagram(dupConstraint), /unique ids/i);

    const dupRel = twoSchemaProject();
    dupRel.physical_model.relationships.push(
      structuredClone(dupRel.physical_model.relationships[0]),
    );
    assert.throws(() => canonicalProjectToDiagram(dupRel), /unique ids|sorted|inconsistent/i);
  });

  it("rejects empty or mismatched FK and relationship endpoints", () => {
    const emptyConstraintCols = twoTableProject();
    emptyConstraintCols.physical_model.tables[0].constraints[0].columns = [];
    assert.throws(
      () => canonicalProjectToDiagram(emptyConstraintCols),
      /non-empty|columns/i,
    );

    const emptyFkRefs = twoTableProject();
    const order = emptyFkRefs.physical_model.tables[1];
    const fk = order.constraints.find((c) => c.kind === "foreign_key");
    fk.referenced_columns = [];
    emptyFkRefs.physical_model.relationships[0].target_column_ids = [];
    assert.throws(
      () => canonicalProjectToDiagram(emptyFkRefs),
      /referenced_columns|non-empty|length/i,
    );

    const mismatchedFk = twoTableProject();
    const mismatchedOrder = mismatchedFk.physical_model.tables[1];
    const mismatched = mismatchedOrder.constraints.find(
      (c) => c.kind === "foreign_key",
    );
    mismatched.referenced_columns = [
      "column:ANALYTICS.CORE.CUSTOMER.CUSTOMER_ID",
      "column:ANALYTICS.CORE.CUSTOMER.EMAIL",
    ];
    mismatchedFk.physical_model.relationships[0].target_column_ids = [
      ...mismatched.referenced_columns,
    ];
    assert.throws(
      () => canonicalProjectToDiagram(mismatchedFk),
      /match|length/i,
    );

    const emptyRelSource = twoTableProject();
    emptyRelSource.physical_model.relationships[0].source_column_ids = [];
    assert.throws(
      () => canonicalProjectToDiagram(emptyRelSource),
      /source_column_ids|non-empty|inconsistent/i,
    );

    const emptyRelTarget = twoTableProject();
    emptyRelTarget.physical_model.relationships[0].target_column_ids = [];
    assert.throws(
      () => canonicalProjectToDiagram(emptyRelTarget),
      /target_column_ids|non-empty|length|inconsistent/i,
    );

    const mismatchedRel = twoTableProject();
    mismatchedRel.physical_model.relationships[0].target_column_ids.push(
      "column:ANALYTICS.CORE.CUSTOMER.EMAIL",
    );
    assert.throws(
      () => canonicalProjectToDiagram(mismatchedRel),
      /length|match|inconsistent/i,
    );
  });

  it("rebuilds ids and references after rename edits", () => {
    const diagram = canonicalProjectToDiagram(twoTableProject());
    const customer = diagram.tables.find((t) => t.name === "CUSTOMER");
    customer.name = "client";
    const nameField = customer.fields.find((f) => f.name === "CUSTOMER_NAME");
    nameField.name = "client_name";

    const exported = diagramToCanonicalProject({
      title: diagram.title,
      tables: diagram.tables,
      relationships: diagram.relationships,
      transform: diagram.transform,
    });

    assert.equal(exported.project_version, "1");
    const model = exported.physical_model;
    assert.equal(model.model_version, "1");
    assert.ok(model.tables.some((t) => t.id === "table:ANALYTICS.CORE.CLIENT"));
    assert.ok(
      model.tables.some((t) =>
        t.columns.some(
          (c) => c.id === "column:ANALYTICS.CORE.CLIENT.CLIENT_NAME",
        ),
      ),
    );
    const rel = model.relationships[0];
    assert.equal(rel.target_table_id, "table:ANALYTICS.CORE.CLIENT");
    assert.deepEqual(rel.target_column_ids, [
      "column:ANALYTICS.CORE.CLIENT.CUSTOMER_ID",
    ]);
  });

  it("keeps diagram_layout separate from physical_model", () => {
    const diagram = canonicalProjectToDiagram(twoTableProject());
    const exported = diagramToCanonicalProject({
      title: diagram.title,
      tables: diagram.tables,
      relationships: diagram.relationships,
      transform: diagram.transform,
    });

    assert.ok(exported.diagram_layout);
    assert.ok(exported.diagram_layout.nodes);
    assert.ok(exported.diagram_layout.viewport);
    assert.equal(exported.physical_model.x, undefined);
    assert.equal(exported.physical_model.y, undefined);
    assert.equal(exported.physical_model.viewport, undefined);
    assert.equal(exported.physical_model.color, undefined);
    assert.equal(exported.physical_model.collapsed, undefined);
    assert.equal(exported.physical_model.history, undefined);
    assert.equal(exported.physical_model.nodes, undefined);

    for (const table of exported.physical_model.tables) {
      assert.equal(table.x, undefined);
      assert.equal(table.y, undefined);
      assert.equal(table.color, undefined);
      assert.equal(table.collapsed, undefined);
    }
  });

  it("JSON round-trips and preserves semantic values when names are unchanged", () => {
    const original = twoTableProject();
    const diagram = canonicalProjectToDiagram(original);
    const exported = diagramToCanonicalProject({
      title: diagram.title,
      tables: diagram.tables,
      relationships: diagram.relationships,
      transform: diagram.transform,
    });

    const reloaded = JSON.parse(JSON.stringify(exported));
    const again = canonicalProjectToDiagram(reloaded);
    const second = diagramToCanonicalProject({
      title: again.title,
      tables: again.tables,
      relationships: again.relationships,
      transform: again.transform,
    });

    assert.deepEqual(second.physical_model, exported.physical_model);
    assert.equal(
      second.physical_model.tables[0].columns[0].name,
      "CUSTOMER_ID",
    );
    assert.equal(
      second.physical_model.relationships[0].name,
      "FK_ORDER_HEADER_CUSTOMER",
    );
  });

  it("fails on normalized name collisions", () => {
    const diagram = canonicalProjectToDiagram(twoTableProject());
    const customer = diagram.tables.find((t) => t.name === "CUSTOMER");
    customer.fields[1].name = "customer-id";
    customer.fields[0].name = "CUSTOMER_ID";
    assert.throws(
      () =>
        diagramToCanonicalProject({
          title: diagram.title,
          tables: diagram.tables,
          relationships: diagram.relationships,
          transform: diagram.transform,
        }),
      /collision|duplicate|conflict/i,
    );
  });

  it("preserves non-conventional PK and single-unique names across byte-semantic round trip", () => {
    const project = twoTableProject();
    const customer = project.physical_model.tables.find(
      (t) => t.name === "CUSTOMER",
    );
    customer.constraints = [
      {
        id: "constraint:ANALYTICS.CORE.CUSTOMER.PK_CUSTOMER_LEGACY",
        name: "PK_CUSTOMER_LEGACY",
        kind: "primary_key",
        columns: ["column:ANALYTICS.CORE.CUSTOMER.CUSTOMER_ID"],
        referenced_table_id: null,
        referenced_columns: [],
      },
      {
        id: "constraint:ANALYTICS.CORE.CUSTOMER.EMAIL_NATURAL_KEY",
        name: "EMAIL_NATURAL_KEY",
        kind: "unique",
        columns: ["column:ANALYTICS.CORE.CUSTOMER.EMAIL"],
        referenced_table_id: null,
        referenced_columns: [],
      },
    ].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

    const diagram = canonicalProjectToDiagram(project);
    assert.equal(
      diagram.tables.find((t) => t.name === "CUSTOMER").constraintView
        ?.primaryKeyName,
      "PK_CUSTOMER_LEGACY",
    );
    assert.equal(
      diagram.tables.find((t) => t.name === "CUSTOMER").constraintView
        ?.uniqueNames?.[
        "column:ANALYTICS.CORE.CUSTOMER.EMAIL"
      ],
      "EMAIL_NATURAL_KEY",
    );
    assert.equal(diagram.tables[0].physical_model, undefined);

    const customerTable = diagram.tables.find((t) => t.name === "CUSTOMER");
    customerTable.name = "client";
    const emailField = customerTable.fields.find((f) => f.name === "EMAIL");
    emailField.name = "email_addr";

    const exported = diagramToCanonicalProject({
      title: diagram.title,
      tables: diagram.tables,
      relationships: diagram.relationships,
      transform: diagram.transform,
    });
    const exportedCustomer = exported.physical_model.tables.find(
      (t) => t.name === "CLIENT",
    );
    const pk = exportedCustomer.constraints.find(
      (c) => c.kind === "primary_key",
    );
    const uq = exportedCustomer.constraints.find((c) => c.kind === "unique");
    assert.equal(pk.name, "PK_CUSTOMER_LEGACY");
    assert.equal(
      pk.id,
      "constraint:ANALYTICS.CORE.CLIENT.PK_CUSTOMER_LEGACY",
    );
    assert.equal(uq.name, "EMAIL_NATURAL_KEY");
    assert.equal(
      uq.id,
      "constraint:ANALYTICS.CORE.CLIENT.EMAIL_NATURAL_KEY",
    );
    assert.deepEqual(uq.columns, [
      "column:ANALYTICS.CORE.CLIENT.EMAIL_ADDR",
    ]);

    const again = diagramToCanonicalProject({
      title: diagram.title,
      tables: canonicalProjectToDiagram(exported).tables,
      relationships: canonicalProjectToDiagram(exported).relationships,
      transform: canonicalProjectToDiagram(exported).transform,
    });
    assert.deepEqual(again.physical_model, exported.physical_model);
  });

  it("assigns stable projection-local ids for composite unique constraints", () => {
    const project = twoTableProject();
    const customer = project.physical_model.tables.find(
      (t) => t.name === "CUSTOMER",
    );
    customer.constraints.push({
      id: "constraint:ANALYTICS.CORE.CUSTOMER.UQ_NAME_EMAIL",
      name: "UQ_NAME_EMAIL",
      kind: "unique",
      columns: [
        "column:ANALYTICS.CORE.CUSTOMER.CUSTOMER_NAME",
        "column:ANALYTICS.CORE.CUSTOMER.EMAIL",
      ],
      referenced_table_id: null,
      referenced_columns: [],
    });
    customer.constraints = [...customer.constraints].sort((a, b) =>
      a.id < b.id ? -1 : a.id > b.id ? 1 : 0,
    );

    const diagram = canonicalProjectToDiagram(project);
    const imported = diagram.tables.find((t) => t.name === "CUSTOMER");
    assert.equal(imported.uniqueConstraints.length, 1);
    assert.equal(imported.uniqueConstraints[0].name, "UQ_NAME_EMAIL");
    assert.deepEqual(imported.uniqueConstraints[0].fields, [
      "CUSTOMER_NAME",
      "EMAIL",
    ]);
    assert.equal(imported.uniqueConstraints[0].id, 0);

    const exported = diagramToCanonicalProject({
      title: diagram.title,
      tables: diagram.tables,
      relationships: diagram.relationships,
      transform: diagram.transform,
    });
    const exportedCustomer = exported.physical_model.tables.find(
      (t) => t.name === "CUSTOMER",
    );
    const composite = exportedCustomer.constraints.find(
      (c) => c.name === "UQ_NAME_EMAIL",
    );
    assert.ok(composite);
    assert.equal(composite.kind, "unique");
    assert.equal(composite.columns.length, 2);
  });

  it("maps relationship fields by table+field pair and rejects duplicates clearly", () => {
    const diagram = canonicalProjectToDiagram(twoTableProject());
    const customer = diagram.tables.find((t) => t.name === "CUSTOMER");
    const order = diagram.tables.find((t) => t.name === "ORDER_HEADER");
    const sharedFieldId = "shared-field-id";
    const customerPk = customer.fields[0];
    const orderFk = order.fields[1];
    customerPk.id = sharedFieldId;
    orderFk.id = sharedFieldId;
    diagram.relationships[0].startFieldId = sharedFieldId;
    diagram.relationships[0].endFieldId = sharedFieldId;
    diagram.relationships[0].fields = [
      { startFieldId: sharedFieldId, endFieldId: sharedFieldId },
    ];

    const exported = diagramToCanonicalProject({
      title: diagram.title,
      tables: diagram.tables,
      relationships: diagram.relationships,
      transform: diagram.transform,
    });
    const rel = exported.physical_model.relationships[0];
    assert.equal(
      rel.source_column_ids[0],
      "column:ANALYTICS.CORE.ORDER_HEADER.CUSTOMER_ID",
    );
    assert.equal(
      rel.target_column_ids[0],
      "column:ANALYTICS.CORE.CUSTOMER.CUSTOMER_ID",
    );

    const dupTables = structuredClone(diagram);
    dupTables.tables[1].id = dupTables.tables[0].id;
    assert.throws(
      () =>
        diagramToCanonicalProject({
          title: diagram.title,
          tables: dupTables.tables,
          relationships: diagram.relationships,
          transform: diagram.transform,
        }),
      /duplicate table id/i,
    );

    const dupFields = structuredClone(diagram);
    dupFields.tables[0].fields[1].id = dupFields.tables[0].fields[0].id;
    assert.throws(
      () =>
        diagramToCanonicalProject({
          title: diagram.title,
          tables: dupFields.tables,
          relationships: diagram.relationships,
          transform: diagram.transform,
        }),
      /duplicate field id/i,
    );

    const badRel = structuredClone(diagram);
    badRel.relationships[0].startFieldId = "missing-field";
    badRel.relationships[0].fields = [
      { startFieldId: "missing-field", endFieldId: sharedFieldId },
    ];
    assert.throws(
      () =>
        diagramToCanonicalProject({
          title: diagram.title,
          tables: badRel.tables,
          relationships: badRel.relationships,
          transform: diagram.transform,
        }),
      /unresolved|unknown/i,
    );
  });

  it("rejects invalid type bounds and non-positive zoom", () => {
    const diagram = canonicalProjectToDiagram(twoTableProject());
    const customer = diagram.tables.find((t) => t.name === "CUSTOMER");
    const idField = customer.fields.find((f) => f.name === "CUSTOMER_ID");
    idField.size = "39,0";
    assert.throws(
      () =>
        diagramToCanonicalProject({
          title: diagram.title,
          tables: diagram.tables,
          relationships: diagram.relationships,
          transform: diagram.transform,
        }),
      /precision|NUMBER/i,
    );

    idField.size = "10,10";
    const allowedEqualScale = diagramToCanonicalProject({
      title: diagram.title,
      tables: diagram.tables,
      relationships: diagram.relationships,
      transform: diagram.transform,
    });
    const allowedNumber = allowedEqualScale.physical_model.tables
      .find((t) => t.name === "CUSTOMER")
      .columns.find((c) => c.name === "CUSTOMER_ID").data_type;
    assert.equal(allowedNumber.precision, 10);
    assert.equal(allowedNumber.scale, 10);
    assert.equal(allowedNumber.text, "NUMBER(10, 10)");

    idField.size = "38,37";
    const allowedMaxScale = diagramToCanonicalProject({
      title: diagram.title,
      tables: diagram.tables,
      relationships: diagram.relationships,
      transform: diagram.transform,
    });
    assert.equal(
      allowedMaxScale.physical_model.tables
        .find((t) => t.name === "CUSTOMER")
        .columns.find((c) => c.name === "CUSTOMER_ID").data_type.scale,
      37,
    );

    idField.size = "38,38";
    assert.throws(
      () =>
        diagramToCanonicalProject({
          title: diagram.title,
          tables: diagram.tables,
          relationships: diagram.relationships,
          transform: diagram.transform,
        }),
      /scale|NUMBER/i,
    );

    idField.size = "10,11";
    assert.throws(
      () =>
        diagramToCanonicalProject({
          title: diagram.title,
          tables: diagram.tables,
          relationships: diagram.relationships,
          transform: diagram.transform,
        }),
      /scale|NUMBER/i,
    );

    idField.size = "38,0";
    const nameField = customer.fields.find((f) => f.name === "CUSTOMER_NAME");
    nameField.size = 0;
    assert.throws(
      () =>
        diagramToCanonicalProject({
          title: diagram.title,
          tables: diagram.tables,
          relationships: diagram.relationships,
          transform: diagram.transform,
        }),
      /length|VARCHAR/i,
    );

    nameField.size = 200;
    assert.throws(
      () =>
        diagramToCanonicalProject({
          title: diagram.title,
          tables: diagram.tables,
          relationships: diagram.relationships,
          transform: { ...diagram.transform, zoom: 0 },
        }),
      /zoom/i,
    );
    assert.throws(
      () =>
        diagramToCanonicalProject({
          title: diagram.title,
          tables: diagram.tables,
          relationships: diagram.relationships,
          transform: { ...diagram.transform, zoom: Number.NaN },
        }),
      /zoom/i,
    );
  });

  it("exports newly selected Snowflake types using datatype defaultSize", () => {
    // Mirrors snowflakeTypes.NUMBER.defaultSize / TIMESTAMP_NTZ.defaultSize
    // (assigned by TableField when a type is selected).
    const numberDefaultSize = "38,0";
    const timestampNtzDefaultSize = 9;

    const diagram = {
      title: "defaults-model",
      tables: [
        {
          id: "t1",
          name: "SAMPLE",
          x: 0,
          y: 0,
          comment: "",
          fields: [
            {
              id: "f1",
              name: "AMOUNT",
              type: "NUMBER",
              size: numberDefaultSize,
              default: "",
              check: "",
              primary: true,
              unique: false,
              notNull: true,
              increment: false,
              comment: "",
            },
            {
              id: "f2",
              name: "occurred_at",
              type: "TIMESTAMP_NTZ",
              size: timestampNtzDefaultSize,
              default: "",
              check: "",
              primary: false,
              unique: false,
              notNull: false,
              increment: false,
              comment: "",
            },
          ],
        },
      ],
      relationships: [],
      transform: { pan: { x: 0, y: 0 }, zoom: 1 },
    };

    const exported = diagramToCanonicalProject(diagram);
    const columns = exported.physical_model.tables[0].columns;
    assert.deepEqual(columns[0].data_type, {
      family: "NUMBER",
      text: "NUMBER(38, 0)",
      precision: 38,
      scale: 0,
      length: null,
    });
    assert.deepEqual(columns[1].data_type, {
      family: "TIMESTAMP_NTZ",
      text: "TIMESTAMP_NTZ(9)",
      precision: 9,
      scale: null,
      length: null,
    });
  });

  it("allows the same FK name on different source tables and rejects duplicates on one", () => {
    const sharedFk = "FK_SHARED_PARENT";
    const diagram = {
      title: "shared-fk-name",
      tables: [
        {
          id: "parent",
          name: "PARENT",
          x: 0,
          y: 0,
          comment: "",
          fields: [
            {
              id: "p-id",
              name: "PARENT_ID",
              type: "NUMBER",
              size: "38,0",
              default: "",
              check: "",
              primary: true,
              unique: false,
              notNull: true,
              increment: false,
              comment: "",
            },
          ],
        },
        {
          id: "child-a",
          name: "CHILD_A",
          x: 200,
          y: 0,
          comment: "",
          fields: [
            {
              id: "a-id",
              name: "CHILD_A_ID",
              type: "NUMBER",
              size: "38,0",
              default: "",
              check: "",
              primary: true,
              unique: false,
              notNull: true,
              increment: false,
              comment: "",
            },
            {
              id: "a-fk",
              name: "PARENT_ID",
              type: "NUMBER",
              size: "38,0",
              default: "",
              check: "",
              primary: false,
              unique: false,
              notNull: true,
              increment: false,
              comment: "",
            },
          ],
        },
        {
          id: "child-b",
          name: "CHILD_B",
          x: 200,
          y: 200,
          comment: "",
          fields: [
            {
              id: "b-id",
              name: "CHILD_B_ID",
              type: "NUMBER",
              size: "38,0",
              default: "",
              check: "",
              primary: true,
              unique: false,
              notNull: true,
              increment: false,
              comment: "",
            },
            {
              id: "b-fk",
              name: "PARENT_ID",
              type: "NUMBER",
              size: "38,0",
              default: "",
              check: "",
              primary: false,
              unique: false,
              notNull: true,
              increment: false,
              comment: "",
            },
            {
              id: "b-fk-2",
              name: "OTHER_PARENT_ID",
              type: "NUMBER",
              size: "38,0",
              default: "",
              check: "",
              primary: false,
              unique: false,
              notNull: true,
              increment: false,
              comment: "",
            },
          ],
        },
      ],
      relationships: [
        {
          id: "r1",
          name: sharedFk,
          startTableId: "child-a",
          startFieldId: "a-fk",
          endTableId: "parent",
          endFieldId: "p-id",
          cardinality: "n:1",
        },
        {
          id: "r2",
          name: sharedFk,
          startTableId: "child-b",
          startFieldId: "b-fk",
          endTableId: "parent",
          endFieldId: "p-id",
          cardinality: "n:1",
        },
      ],
      transform: { pan: { x: 0, y: 0 }, zoom: 1 },
    };

    const exported = diagramToCanonicalProject(diagram);
    const fkNames = exported.physical_model.relationships.map((r) => r.name);
    assert.deepEqual(fkNames.sort(), [sharedFk, sharedFk]);

    const duplicateOnSameTable = structuredClone(diagram);
    duplicateOnSameTable.relationships.push({
      id: "r3",
      name: sharedFk,
      startTableId: "child-b",
      startFieldId: "b-fk-2",
      endTableId: "parent",
      endFieldId: "p-id",
      cardinality: "n:1",
    });
    assert.throws(
      () =>
        diagramToCanonicalProject({
          title: duplicateOnSameTable.title,
          tables: duplicateOnSameTable.tables,
          relationships: duplicateOnSameTable.relationships,
          transform: duplicateOnSameTable.transform,
        }),
      /constraint collision/i,
    );
  });

  it("rejects invalid imported canonical type bounds", () => {
    const badNumber = twoTableProject();
    badNumber.physical_model.tables[0].columns[0].data_type = {
      family: "NUMBER",
      text: "NUMBER(39, 0)",
      precision: 39,
      scale: 0,
      length: null,
    };
    assert.throws(() => canonicalProjectToDiagram(badNumber), /precision|NUMBER/i);

    const badVarchar = twoTableProject();
    badVarchar.physical_model.tables[0].columns[1].data_type = {
      family: "VARCHAR",
      text: "VARCHAR(0)",
      precision: null,
      scale: null,
      length: 0,
    };
    assert.throws(() => canonicalProjectToDiagram(badVarchar), /length|VARCHAR/i);

    const badTs = twoTableProject();
    const order = badTs.physical_model.tables[1];
    order.columns[2].data_type = {
      family: "TIMESTAMP_NTZ",
      text: "TIMESTAMP_NTZ(10)",
      precision: 10,
      scale: null,
      length: null,
    };
    assert.throws(
      () => canonicalProjectToDiagram(badTs),
      /precision|TIMESTAMP_NTZ/i,
    );

    const badParamless = twoTableProject();
    badParamless.physical_model.tables[1].columns[2].data_type = {
      family: "DATE",
      text: "DATE",
      precision: 1,
      scale: null,
      length: null,
    };
    assert.throws(() => canonicalProjectToDiagram(badParamless), /DATE|null/i);
  });
});

function createTableBodies(sql) {
  return sql
    .split(";")
    .map((statement) => statement.trim())
    .filter((statement) => statement.toUpperCase().startsWith("CREATE TABLE"));
}

function cyclicFkProject() {
  const physical_model = {
    model_version: "1",
    name: "cycle-fk",
    namespaces: [
      {
        id: "namespace:ANALYTICS.CORE",
        catalog: "ANALYTICS",
        schema: "CORE",
      },
    ],
    tables: [
      {
        id: "table:ANALYTICS.CORE.ALPHA",
        namespace_id: "namespace:ANALYTICS.CORE",
        name: "ALPHA",
        kind: "table",
        columns: [
          {
            id: "column:ANALYTICS.CORE.ALPHA.ALPHA_ID",
            name: "ALPHA_ID",
            ordinal: 1,
            data_type: {
              family: "NUMBER",
              text: "NUMBER(38, 0)",
              precision: 38,
              scale: 0,
              length: null,
            },
            nullable: false,
            default: null,
            comment: null,
          },
          {
            id: "column:ANALYTICS.CORE.ALPHA.BETA_ID",
            name: "BETA_ID",
            ordinal: 2,
            data_type: {
              family: "NUMBER",
              text: "NUMBER(38, 0)",
              precision: 38,
              scale: 0,
              length: null,
            },
            nullable: false,
            default: null,
            comment: null,
          },
        ],
        constraints: [
          {
            id: "constraint:ANALYTICS.CORE.ALPHA.FK_ALPHA_BETA",
            name: "FK_ALPHA_BETA",
            kind: "foreign_key",
            columns: ["column:ANALYTICS.CORE.ALPHA.BETA_ID"],
            referenced_table_id: "table:ANALYTICS.CORE.BETA",
            referenced_columns: ["column:ANALYTICS.CORE.BETA.BETA_ID"],
          },
          {
            id: "constraint:ANALYTICS.CORE.ALPHA.PK_ALPHA",
            name: "PK_ALPHA",
            kind: "primary_key",
            columns: ["column:ANALYTICS.CORE.ALPHA.ALPHA_ID"],
            referenced_table_id: null,
            referenced_columns: [],
          },
        ],
        comment: null,
      },
      {
        id: "table:ANALYTICS.CORE.BETA",
        namespace_id: "namespace:ANALYTICS.CORE",
        name: "BETA",
        kind: "table",
        columns: [
          {
            id: "column:ANALYTICS.CORE.BETA.BETA_ID",
            name: "BETA_ID",
            ordinal: 1,
            data_type: {
              family: "NUMBER",
              text: "NUMBER(38, 0)",
              precision: 38,
              scale: 0,
              length: null,
            },
            nullable: false,
            default: null,
            comment: null,
          },
          {
            id: "column:ANALYTICS.CORE.BETA.ALPHA_ID",
            name: "ALPHA_ID",
            ordinal: 2,
            data_type: {
              family: "NUMBER",
              text: "NUMBER(38, 0)",
              precision: 38,
              scale: 0,
              length: null,
            },
            nullable: false,
            default: null,
            comment: null,
          },
        ],
        constraints: [
          {
            id: "constraint:ANALYTICS.CORE.BETA.FK_BETA_ALPHA",
            name: "FK_BETA_ALPHA",
            kind: "foreign_key",
            columns: ["column:ANALYTICS.CORE.BETA.ALPHA_ID"],
            referenced_table_id: "table:ANALYTICS.CORE.ALPHA",
            referenced_columns: ["column:ANALYTICS.CORE.ALPHA.ALPHA_ID"],
          },
          {
            id: "constraint:ANALYTICS.CORE.BETA.PK_BETA",
            name: "PK_BETA",
            kind: "primary_key",
            columns: ["column:ANALYTICS.CORE.BETA.BETA_ID"],
            referenced_table_id: null,
            referenced_columns: [],
          },
        ],
        comment: null,
      },
    ],
    relationships: [
      {
        id: "relationship:ANALYTICS.CORE.ALPHA.FK_ALPHA_BETA",
        name: "FK_ALPHA_BETA",
        source_table_id: "table:ANALYTICS.CORE.ALPHA",
        source_column_ids: ["column:ANALYTICS.CORE.ALPHA.BETA_ID"],
        target_table_id: "table:ANALYTICS.CORE.BETA",
        target_column_ids: ["column:ANALYTICS.CORE.BETA.BETA_ID"],
        cardinality: "many_to_one",
      },
      {
        id: "relationship:ANALYTICS.CORE.BETA.FK_BETA_ALPHA",
        name: "FK_BETA_ALPHA",
        source_table_id: "table:ANALYTICS.CORE.BETA",
        source_column_ids: ["column:ANALYTICS.CORE.BETA.ALPHA_ID"],
        target_table_id: "table:ANALYTICS.CORE.ALPHA",
        target_column_ids: ["column:ANALYTICS.CORE.ALPHA.ALPHA_ID"],
        cardinality: "many_to_one",
      },
    ],
  };

  return {
    project_version: "1",
    physical_model,
    diagram_layout: {
      nodes: {
        "table:ANALYTICS.CORE.ALPHA": { x: 40, y: 80 },
        "table:ANALYTICS.CORE.BETA": { x: 360, y: 120 },
      },
      viewport: { x: 0, y: 0, zoom: 1 },
    },
  };
}

function selfFkProject() {
  const physical_model = {
    model_version: "1",
    name: "self-fk",
    namespaces: [
      {
        id: "namespace:ANALYTICS.CORE",
        catalog: "ANALYTICS",
        schema: "CORE",
      },
    ],
    tables: [
      {
        id: "table:ANALYTICS.CORE.EMPLOYEE",
        namespace_id: "namespace:ANALYTICS.CORE",
        name: "EMPLOYEE",
        kind: "table",
        columns: [
          {
            id: "column:ANALYTICS.CORE.EMPLOYEE.EMPLOYEE_ID",
            name: "EMPLOYEE_ID",
            ordinal: 1,
            data_type: {
              family: "NUMBER",
              text: "NUMBER(38, 0)",
              precision: 38,
              scale: 0,
              length: null,
            },
            nullable: false,
            default: null,
            comment: null,
          },
          {
            id: "column:ANALYTICS.CORE.EMPLOYEE.MANAGER_ID",
            name: "MANAGER_ID",
            ordinal: 2,
            data_type: {
              family: "NUMBER",
              text: "NUMBER(38, 0)",
              precision: 38,
              scale: 0,
              length: null,
            },
            nullable: true,
            default: null,
            comment: null,
          },
        ],
        constraints: [
          {
            id: "constraint:ANALYTICS.CORE.EMPLOYEE.FK_EMPLOYEE_MANAGER",
            name: "FK_EMPLOYEE_MANAGER",
            kind: "foreign_key",
            columns: ["column:ANALYTICS.CORE.EMPLOYEE.MANAGER_ID"],
            referenced_table_id: "table:ANALYTICS.CORE.EMPLOYEE",
            referenced_columns: [
              "column:ANALYTICS.CORE.EMPLOYEE.EMPLOYEE_ID",
            ],
          },
          {
            id: "constraint:ANALYTICS.CORE.EMPLOYEE.PK_EMPLOYEE",
            name: "PK_EMPLOYEE",
            kind: "primary_key",
            columns: ["column:ANALYTICS.CORE.EMPLOYEE.EMPLOYEE_ID"],
            referenced_table_id: null,
            referenced_columns: [],
          },
        ],
        comment: null,
      },
    ],
    relationships: [
      {
        id: "relationship:ANALYTICS.CORE.EMPLOYEE.FK_EMPLOYEE_MANAGER",
        name: "FK_EMPLOYEE_MANAGER",
        source_table_id: "table:ANALYTICS.CORE.EMPLOYEE",
        source_column_ids: ["column:ANALYTICS.CORE.EMPLOYEE.MANAGER_ID"],
        target_table_id: "table:ANALYTICS.CORE.EMPLOYEE",
        target_column_ids: ["column:ANALYTICS.CORE.EMPLOYEE.EMPLOYEE_ID"],
        cardinality: "many_to_one",
      },
    ],
  };

  return {
    project_version: "1",
    physical_model,
    diagram_layout: {
      nodes: {
        "table:ANALYTICS.CORE.EMPLOYEE": { x: 40, y: 80 },
      },
      viewport: { x: 0, y: 0, zoom: 1 },
    },
  };
}

describe("renderCanonicalSnowflakeDDL", () => {
  it("emits informational NOT ENFORCED DDL without RELY", () => {
    const ddl = renderCanonicalSnowflakeDDL(twoTableProject());
    assert.match(ddl, /CREATE DATABASE IF NOT EXISTS ANALYTICS;/);
    assert.match(ddl, /CREATE SCHEMA IF NOT EXISTS ANALYTICS\.CORE;/);
    assert.match(ddl, /CREATE TABLE ANALYTICS\.CORE\.CUSTOMER \(/);
    assert.match(ddl, /PRIMARY KEY \(CUSTOMER_ID\) NOT ENFORCED/);
    assert.match(
      ddl,
      /ALTER TABLE ANALYTICS\.CORE\.ORDER_HEADER ADD CONSTRAINT FK_ORDER_HEADER_CUSTOMER FOREIGN KEY \(CUSTOMER_ID\) REFERENCES ANALYTICS\.CORE\.CUSTOMER \(CUSTOMER_ID\) NOT ENFORCED;/,
    );
    assert.equal(
      createTableBodies(ddl).some((body) => /FOREIGN KEY/i.test(body)),
      false,
    );
    assert.equal(ddl.includes("RELY"), false);
    assert.equal(ddl, renderCanonicalSnowflakeDDL(twoTableProject()));
    assert.ok(ddl.endsWith("\n"));
  });

  it("accepts a physical model directly", () => {
    const ddl = renderCanonicalSnowflakeDDL(twoTableProject().physical_model);
    assert.match(ddl, /CREATE TABLE ANALYTICS\.CORE\.ORDER_HEADER/);
  });

  it("emits cyclic foreign keys as deferred ALTER TABLE statements", () => {
    const project = cyclicFkProject();
    const ddl = renderCanonicalSnowflakeDDL(project);
    const createTables = [...ddl.matchAll(/CREATE TABLE /g)];
    assert.equal(createTables.length, 2);
    assert.match(ddl, /CREATE TABLE ANALYTICS\.CORE\.ALPHA \(/);
    assert.match(ddl, /CREATE TABLE ANALYTICS\.CORE\.BETA \(/);
    assert.equal(
      createTableBodies(ddl).some((body) => /FOREIGN KEY/i.test(body)),
      false,
    );
    assert.equal([...ddl.matchAll(/ALTER TABLE /g)].length, 2);
    assert.match(
      ddl,
      /ALTER TABLE ANALYTICS\.CORE\.ALPHA ADD CONSTRAINT FK_ALPHA_BETA FOREIGN KEY \(BETA_ID\) REFERENCES ANALYTICS\.CORE\.BETA \(BETA_ID\) NOT ENFORCED;/,
    );
    assert.match(
      ddl,
      /ALTER TABLE ANALYTICS\.CORE\.BETA ADD CONSTRAINT FK_BETA_ALPHA FOREIGN KEY \(ALPHA_ID\) REFERENCES ANALYTICS\.CORE\.ALPHA \(ALPHA_ID\) NOT ENFORCED;/,
    );
    assert.match(ddl, /NOT ENFORCED/);
    assert.equal(ddl.includes("RELY"), false);
    assert.equal(ddl, renderCanonicalSnowflakeDDL(project));
  });

  it("emits self-referential foreign keys as deferred ALTER TABLE statements", () => {
    const project = selfFkProject();
    const ddl = renderCanonicalSnowflakeDDL(project);
    assert.equal([...ddl.matchAll(/CREATE TABLE /g)].length, 1);
    assert.match(ddl, /CREATE TABLE ANALYTICS\.CORE\.EMPLOYEE \(/);
    assert.equal(
      createTableBodies(ddl).some((body) => /FOREIGN KEY/i.test(body)),
      false,
    );
    assert.equal([...ddl.matchAll(/ALTER TABLE /g)].length, 1);
    assert.match(
      ddl,
      /ALTER TABLE ANALYTICS\.CORE\.EMPLOYEE ADD CONSTRAINT FK_EMPLOYEE_MANAGER FOREIGN KEY \(MANAGER_ID\) REFERENCES ANALYTICS\.CORE\.EMPLOYEE \(EMPLOYEE_ID\) NOT ENFORCED;/,
    );
    assert.match(ddl, /NOT ENFORCED/);
    assert.equal(ddl.includes("RELY"), false);
    assert.equal(ddl, renderCanonicalSnowflakeDDL(project));
  });

  it("emits multi-schema DDL with qualified cross-schema foreign keys", () => {
    const project = twoSchemaProject();
    const ddl = renderCanonicalSnowflakeDDL(project);
    assert.match(ddl, /CREATE DATABASE IF NOT EXISTS ANALYTICS;/);
    assert.match(ddl, /CREATE SCHEMA IF NOT EXISTS ANALYTICS\.CORE;/);
    assert.match(ddl, /CREATE SCHEMA IF NOT EXISTS ANALYTICS\.MART;/);
    assert.match(ddl, /CREATE TABLE ANALYTICS\.CORE\.CUSTOMER \(/);
    assert.match(ddl, /CREATE TABLE ANALYTICS\.MART\.CUSTOMER \(/);
    assert.match(ddl, /CREATE TABLE ANALYTICS\.MART\.ORDER_FACT \(/);
    assert.equal(
      createTableBodies(ddl).some((body) => /FOREIGN KEY/i.test(body)),
      false,
    );
    assert.match(
      ddl,
      /ALTER TABLE ANALYTICS\.MART\.ORDER_FACT ADD CONSTRAINT FK_ORDER_FACT_CUSTOMER FOREIGN KEY \(CUSTOMER_ID\) REFERENCES ANALYTICS\.CORE\.CUSTOMER \(CUSTOMER_ID\) NOT ENFORCED;/,
    );
    assert.equal(ddl, renderCanonicalSnowflakeDDL(project));
  });

  it("preserves column and table comments with apostrophe doubling", () => {
    const tableComment = "table note: DEFAULT, NOT NULL; commas, and it's quoted";
    const columnComment = "col note: a,b;c'd and NOT NULL / DEFAULT";
    const project = {
      project_version: "1",
      physical_model: {
        model_version: "1",
        name: "comment-round-trip",
        namespaces: [
          {
            id: "namespace:ANALYTICS.CORE",
            catalog: "ANALYTICS",
            schema: "CORE",
          },
        ],
        tables: [
          {
            id: "table:ANALYTICS.CORE.SAMPLE",
            namespace_id: "namespace:ANALYTICS.CORE",
            name: "SAMPLE",
            kind: "table",
            columns: [
              {
                id: "column:ANALYTICS.CORE.SAMPLE.ID",
                name: "ID",
                ordinal: 1,
                data_type: numberType(),
                nullable: false,
                default: null,
                comment: null,
              },
              {
                id: "column:ANALYTICS.CORE.SAMPLE.NOTE",
                name: "NOTE",
                ordinal: 2,
                data_type: {
                  family: "VARCHAR",
                  text: "VARCHAR(100)",
                  precision: null,
                  scale: null,
                  length: 100,
                },
                nullable: true,
                default: null,
                comment: columnComment,
              },
              {
                id: "column:ANALYTICS.CORE.SAMPLE.LABEL",
                name: "LABEL",
                ordinal: 3,
                data_type: {
                  family: "VARCHAR",
                  text: "VARCHAR(100)",
                  precision: null,
                  scale: null,
                  length: 100,
                },
                nullable: false,
                default: "'DEFAULT'",
                comment: "says DEFAULT and NOT NULL, with; punctuation",
              },
            ],
            constraints: [
              {
                id: "constraint:ANALYTICS.CORE.SAMPLE.PK_SAMPLE",
                name: "PK_SAMPLE",
                kind: "primary_key",
                columns: ["column:ANALYTICS.CORE.SAMPLE.ID"],
                referenced_table_id: null,
                referenced_columns: [],
              },
            ],
            comment: tableComment,
          },
        ],
        relationships: [],
      },
    };

    const ddl = renderCanonicalSnowflakeDDL(project);
    assert.match(
      ddl,
      /COMMENT='table note: DEFAULT, NOT NULL; commas, and it''s quoted'/,
    );
    assert.match(
      ddl,
      /COMMENT 'col note: a,b;c''d and NOT NULL \/ DEFAULT'/,
    );
    assert.match(
      ddl,
      /COMMENT 'says DEFAULT and NOT NULL, with; punctuation'/,
    );
    assert.match(ddl, /DEFAULT 'DEFAULT'/);
    assert.match(ddl, /NOTE VARCHAR\(100\) COMMENT /);
    assert.match(ddl, /LABEL VARCHAR\(100\) NOT NULL DEFAULT 'DEFAULT' COMMENT /);
    assert.equal(ddl.includes('COMMENT="'), false);
    assert.equal(ddl, renderCanonicalSnowflakeDDL(project));
  });

  it("preserves embedded double quotes in COMMENT literals", () => {
    const project = {
      project_version: "1",
      physical_model: {
        model_version: "1",
        name: "embedded-dq",
        namespaces: [
          {
            id: "namespace:ANALYTICS.CORE",
            catalog: "ANALYTICS",
            schema: "CORE",
          },
        ],
        tables: [
          {
            id: "table:ANALYTICS.CORE.SAMPLE",
            namespace_id: "namespace:ANALYTICS.CORE",
            name: "SAMPLE",
            kind: "table",
            columns: [
              {
                id: "column:ANALYTICS.CORE.SAMPLE.ID",
                name: "ID",
                ordinal: 1,
                data_type: numberType(),
                nullable: false,
                default: null,
                comment: null,
              },
              {
                id: "column:ANALYTICS.CORE.SAMPLE.NOTE",
                name: "NOTE",
                ordinal: 2,
                data_type: {
                  family: "VARCHAR",
                  text: "VARCHAR(50)",
                  precision: null,
                  scale: null,
                  length: 50,
                },
                nullable: true,
                default: null,
                comment: 'a "b"',
              },
            ],
            constraints: [
              {
                id: "constraint:ANALYTICS.CORE.SAMPLE.PK_SAMPLE",
                name: "PK_SAMPLE",
                kind: "primary_key",
                columns: ["column:ANALYTICS.CORE.SAMPLE.ID"],
                referenced_table_id: null,
                referenced_columns: [],
              },
            ],
            comment: 'table "note"',
          },
        ],
        relationships: [],
      },
    };

    const ddl = renderCanonicalSnowflakeDDL(project);
    assert.match(ddl, /COMMENT 'a "b"'/);
    assert.match(ddl, /COMMENT='table "note"'/);
    assert.equal(ddl, renderCanonicalSnowflakeDDL(project));
  });

  it("renders deterministic empty DDL for empty physical models", () => {
    const ddl = renderCanonicalSnowflakeDDL({
      model_version: "1",
      name: "empty",
      namespaces: [],
      tables: [],
      relationships: [],
    });
    assert.equal(ddl, "\n");
    assert.equal(
      ddl,
      renderCanonicalSnowflakeDDL({
        project_version: "1",
        physical_model: {
          model_version: "1",
          name: "empty",
          namespaces: [],
          tables: [],
          relationships: [],
        },
      }),
    );
  });
});

describe("validatePhysicalModel identifiers", () => {
  it("rejects lowercase, hyphen, leading digit, and whitespace identifiers", () => {
    const lowerCatalog = twoTableProject();
    lowerCatalog.physical_model.namespaces[0] = {
      id: "namespace:analytics.CORE",
      catalog: "analytics",
      schema: "CORE",
    };
    assert.throws(
      () => canonicalProjectToDiagram(lowerCatalog),
      /identifier|catalog/i,
    );

    const hyphenSchema = twoTableProject();
    hyphenSchema.physical_model.namespaces[0] = {
      id: "namespace:ANALYTICS.CORE-1",
      catalog: "ANALYTICS",
      schema: "CORE-1",
    };
    assert.throws(
      () => canonicalProjectToDiagram(hyphenSchema),
      /identifier|schema/i,
    );

    const leadingDigit = twoTableProject();
    leadingDigit.physical_model.tables[0].name = "1BAD";
    leadingDigit.physical_model.tables[0].id = "table:ANALYTICS.CORE.1BAD";
    assert.throws(
      () => canonicalProjectToDiagram(leadingDigit),
      /identifier|name/i,
    );

    const whitespaceColumn = twoTableProject();
    whitespaceColumn.physical_model.tables[0].columns[0].name = " BAD";
    whitespaceColumn.physical_model.tables[0].columns[0].id =
      "column:ANALYTICS.CORE.CUSTOMER. BAD";
    assert.throws(
      () => canonicalProjectToDiagram(whitespaceColumn),
      /identifier|name/i,
    );

    const lowerConstraint = twoTableProject();
    lowerConstraint.physical_model.tables[0].constraints[0].name = "pk_customer";
    lowerConstraint.physical_model.tables[0].constraints[0].id =
      "constraint:ANALYTICS.CORE.CUSTOMER.pk_customer";
    assert.throws(
      () => canonicalProjectToDiagram(lowerConstraint),
      /identifier|name/i,
    );

    const trimmedLookalike = twoTableProject();
    trimmedLookalike.physical_model.tables[0].name = "CUSTOMER ";
    trimmedLookalike.physical_model.tables[0].id = "table:ANALYTICS.CORE.CUSTOMER ";
    assert.throws(
      () => canonicalProjectToDiagram(trimmedLookalike),
      /identifier|name/i,
    );
  });

  it("keeps exact path ids for legal uppercase identifiers", () => {
    const diagram = canonicalProjectToDiagram(twoTableProject());
    assert.equal(diagram.tables[0].id, "table:ANALYTICS.CORE.CUSTOMER");
    assert.equal(
      diagram.tables[0].fields[0].id,
      "column:ANALYTICS.CORE.CUSTOMER.CUSTOMER_ID",
    );
  });
});

describe("empty canonical projects", () => {
  it("loads zero namespaces/tables/relationships to an empty diagram", () => {
    const diagram = canonicalProjectToDiagram({
      project_version: "1",
      physical_model: {
        model_version: "1",
        name: "empty-model",
        namespaces: [],
        tables: [],
        relationships: [],
      },
    });
    assert.equal(diagram.title, "empty-model");
    assert.deepEqual(diagram.tables, []);
    assert.deepEqual(diagram.relationships, []);
    assert.deepEqual(diagram.transform, {
      pan: { x: 0, y: 0 },
      zoom: 1,
    });
  });

  it("saves empty tables and relationships as empty physical model collections", () => {
    const exported = diagramToCanonicalProject({
      title: "empty-model",
      tables: [],
      relationships: [],
      transform: { pan: { x: 3, y: 4 }, zoom: 1.5 },
    });
    assert.deepEqual(exported.physical_model.namespaces, []);
    assert.deepEqual(exported.physical_model.tables, []);
    assert.deepEqual(exported.physical_model.relationships, []);
    assert.deepEqual(exported.diagram_layout, {
      nodes: {},
      viewport: { x: 3, y: 4, zoom: 1.5 },
    });
  });

  it("rejects relationships when tables are empty and nonempty tables without namespaces", () => {
    assert.throws(
      () =>
        diagramToCanonicalProject({
          title: "empty-model",
          tables: [],
          relationships: [
            {
              id: "r1",
              name: "FK_X",
              startTableId: "t1",
              endTableId: "t2",
              startFieldId: "f1",
              endFieldId: "f2",
            },
          ],
          transform: { pan: { x: 0, y: 0 }, zoom: 1 },
        }),
      /relationship|empty|table/i,
    );

    const nonemptyTablesEmptyNamespaces = {
      project_version: "1",
      physical_model: {
        model_version: "1",
        name: "bad",
        namespaces: [],
        tables: [
          {
            id: "table:ANALYTICS.CORE.CUSTOMER",
            namespace_id: "namespace:ANALYTICS.CORE",
            name: "CUSTOMER",
            kind: "table",
            columns: [
              {
                id: "column:ANALYTICS.CORE.CUSTOMER.CUSTOMER_ID",
                name: "CUSTOMER_ID",
                ordinal: 1,
                data_type: numberType(),
                nullable: false,
                default: null,
                comment: null,
              },
            ],
            constraints: [],
            comment: null,
          },
        ],
        relationships: [],
      },
    };
    assert.throws(
      () => canonicalProjectToDiagram(nonemptyTablesEmptyNamespaces),
      /namespace/i,
    );
  });

  it("preserves legacy nonempty all-missing namespace as MODEL.PUBLIC", () => {
    const exported = diagramToCanonicalProject({
      title: "legacy",
      tables: [
        {
          id: 1,
          name: "customer",
          x: 0,
          y: 0,
          comment: "",
          fields: [
            {
              id: "f1",
              name: "id",
              type: "NUMBER",
              size: "38,0",
              default: "",
              primary: true,
              unique: false,
              notNull: true,
              comment: "",
            },
          ],
        },
      ],
      relationships: [],
      transform: { pan: { x: 0, y: 0 }, zoom: 1 },
    });
    assert.deepEqual(exported.physical_model.namespaces, [
      { id: "namespace:MODEL.PUBLIC", catalog: "MODEL", schema: "PUBLIC" },
    ]);
    assert.equal(exported.physical_model.tables[0].id, "table:MODEL.PUBLIC.CUSTOMER");
  });
});

describe("constraint uniqueness and required namespaces", () => {
  it("rejects PRIMARY KEY with duplicate column ids", () => {
    const project = twoTableProject();
    const pk = project.physical_model.tables[0].constraints.find(
      (c) => c.kind === "primary_key",
    );
    pk.columns = [
      "column:ANALYTICS.CORE.CUSTOMER.CUSTOMER_ID",
      "column:ANALYTICS.CORE.CUSTOMER.CUSTOMER_ID",
    ];
    assert.throws(
      () => canonicalProjectToDiagram(project),
      /columns must have unique ids/i,
    );
  });

  it("rejects two primary_key constraints on one table", () => {
    const project = twoTableProject();
    const table = project.physical_model.tables[0];
    table.constraints.push({
      id: "constraint:ANALYTICS.CORE.CUSTOMER.PK_CUSTOMER_ALT",
      name: "PK_CUSTOMER_ALT",
      kind: "primary_key",
      columns: ["column:ANALYTICS.CORE.CUSTOMER.EMAIL"],
      referenced_table_id: null,
      referenced_columns: [],
    });
    table.constraints = [...table.constraints].sort((a, b) =>
      a.id < b.id ? -1 : a.id > b.id ? 1 : 0,
    );
    assert.throws(
      () => canonicalProjectToDiagram(project),
      /at most one primary_key/i,
    );
  });

  it("rejects foreign_key referenced_columns with duplicate ids", () => {
    const project = twoTableProject();
    const order = project.physical_model.tables[1];
    const fk = order.constraints.find((c) => c.kind === "foreign_key");
    order.columns.push({
      id: "column:ANALYTICS.CORE.ORDER_HEADER.CUSTOMER_ID_2",
      name: "CUSTOMER_ID_2",
      ordinal: 4,
      data_type: numberType(),
      nullable: false,
      default: null,
      comment: null,
    });
    fk.columns = [
      "column:ANALYTICS.CORE.ORDER_HEADER.CUSTOMER_ID",
      "column:ANALYTICS.CORE.ORDER_HEADER.CUSTOMER_ID_2",
    ];
    fk.referenced_columns = [
      "column:ANALYTICS.CORE.CUSTOMER.CUSTOMER_ID",
      "column:ANALYTICS.CORE.CUSTOMER.CUSTOMER_ID",
    ];
    const rel = project.physical_model.relationships[0];
    rel.source_column_ids = [...fk.columns];
    rel.target_column_ids = [...fk.referenced_columns];
    assert.throws(
      () => canonicalProjectToDiagram(project),
      /referenced_columns must have unique ids/i,
    );
  });

  it("rejects null catalog or schema on namespace entries", () => {
    assert.throws(
      () =>
        canonicalProjectToDiagram({
          project_version: "1",
          physical_model: {
            model_version: "1",
            name: "null-catalog",
            namespaces: [
              { id: "namespace:null.CORE", catalog: null, schema: "CORE" },
            ],
            tables: [],
            relationships: [],
          },
        }),
      /catalog must be a string|catalog must be a legal|identifier/i,
    );

    assert.throws(
      () =>
        canonicalProjectToDiagram({
          project_version: "1",
          physical_model: {
            model_version: "1",
            name: "null-schema",
            namespaces: [
              {
                id: "namespace:ANALYTICS.null",
                catalog: "ANALYTICS",
                schema: null,
              },
            ],
            tables: [],
            relationships: [],
          },
        }),
      /schema must be a string|schema must be a legal|identifier/i,
    );
  });

  it("rejects namespace-only models when catalog and schema are null", () => {
    assert.throws(
      () =>
        canonicalProjectToDiagram({
          project_version: "1",
          physical_model: {
            model_version: "1",
            name: "ns-only",
            namespaces: [
              { id: "namespace:null.null", catalog: null, schema: null },
            ],
            tables: [],
            relationships: [],
          },
        }),
      /catalog must be a string|catalog must be a legal|identifier/i,
    );
  });

  it("rejects diagram export uniqueConstraints with duplicate column ids", () => {
    assert.throws(
      () =>
        diagramToCanonicalProject({
          title: "dup-uq",
          tables: [
            {
              id: 1,
              name: "SAMPLE",
              x: 0,
              y: 0,
              comment: "",
              namespace: {
                id: "namespace:ANALYTICS.CORE",
                catalog: "ANALYTICS",
                schema: "CORE",
              },
              fields: [
                {
                  id: "f1",
                  name: "A",
                  type: "NUMBER",
                  size: "38,0",
                  default: "",
                  primary: true,
                  unique: false,
                  notNull: true,
                  comment: "",
                },
                {
                  id: "f2",
                  name: "B",
                  type: "NUMBER",
                  size: "38,0",
                  default: "",
                  primary: false,
                  unique: false,
                  notNull: true,
                  comment: "",
                },
              ],
              uniqueConstraints: [{ name: "UQ_DUP", fields: ["A", "A"] }],
            },
          ],
          relationships: [],
          transform: { pan: { x: 0, y: 0 }, zoom: 1 },
        }),
      /unique ids|columns/i,
    );
  });

  it("rejects diagram export relationships with duplicate referenced column ids", () => {
    assert.throws(
      () =>
        diagramToCanonicalProject({
          title: "dup-fk-ref",
          tables: [
            {
              id: 1,
              name: "PARENT",
              x: 0,
              y: 0,
              comment: "",
              namespace: {
                id: "namespace:ANALYTICS.CORE",
                catalog: "ANALYTICS",
                schema: "CORE",
              },
              fields: [
                {
                  id: "p1",
                  name: "ID",
                  type: "NUMBER",
                  size: "38,0",
                  default: "",
                  primary: true,
                  unique: false,
                  notNull: true,
                  comment: "",
                },
              ],
            },
            {
              id: 2,
              name: "CHILD",
              x: 100,
              y: 0,
              comment: "",
              namespace: {
                id: "namespace:ANALYTICS.CORE",
                catalog: "ANALYTICS",
                schema: "CORE",
              },
              fields: [
                {
                  id: "c1",
                  name: "ID",
                  type: "NUMBER",
                  size: "38,0",
                  default: "",
                  primary: true,
                  unique: false,
                  notNull: true,
                  comment: "",
                },
                {
                  id: "c2",
                  name: "P_ID_A",
                  type: "NUMBER",
                  size: "38,0",
                  default: "",
                  primary: false,
                  unique: false,
                  notNull: true,
                  comment: "",
                },
                {
                  id: "c3",
                  name: "P_ID_B",
                  type: "NUMBER",
                  size: "38,0",
                  default: "",
                  primary: false,
                  unique: false,
                  notNull: true,
                  comment: "",
                },
              ],
            },
          ],
          relationships: [
            {
              id: "r1",
              name: "FK_CHILD_PARENT",
              startTableId: 2,
              endTableId: 1,
              fields: [
                { startFieldId: "c2", endFieldId: "p1" },
                { startFieldId: "c3", endFieldId: "p1" },
              ],
            },
          ],
          transform: { pan: { x: 0, y: 0 }, zoom: 1 },
        }),
      /referenced_columns must have unique ids|unique ids/i,
    );
  });
});
