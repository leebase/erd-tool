import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  applyLogicalModel,
  diagramToLogicalModel,
  diffLogicalModels,
  validateLogicalModel,
} from "../src/erdTool/logicalModel.js";

function snowflakeDiagram() {
  return {
    database: "snowflake",
    tables: [
      {
        id: "customer",
        name: "CUSTOMER",
        x: 120,
        y: 80,
        locked: false,
        namespace: {
          id: "namespace:ANALYTICS.CORE",
          catalog: "ANALYTICS",
          schema: "CORE",
        },
        fields: [
          {
            id: "customer-id",
            name: "CUSTOMER_ID",
            type: "NUMBER",
            size: "38,0",
            primary: true,
            unique: false,
            notNull: true,
            default: "",
            comment: "",
          },
        ],
        comment: "Customers",
        indices: [],
        uniqueConstraints: [],
        color: "#175e7a",
        collapsed: false,
      },
    ],
    relationships: [],
  };
}

function proposedModel() {
  return {
    summary: "Add customer email and orders",
    tables: [
      {
        key: "customer",
        name: "CUSTOMER",
        comment: "Customer accounts",
        columns: [
          {
            key: "customer-id",
            name: "CUSTOMER_ID",
            type: "NUMBER(38,0)",
            nullable: false,
            primary: true,
            unique: false,
            default: "",
            comment: "",
          },
          {
            key: "new:customer-email",
            name: "EMAIL",
            type: "VARCHAR(320)",
            nullable: false,
            primary: false,
            unique: true,
            default: "",
            comment: "Login email",
          },
        ],
      },
      {
        key: "new:orders",
        name: "ORDER_HEADER",
        comment: "",
        columns: [
          {
            key: "new:order-id",
            name: "ORDER_ID",
            type: "NUMBER(38,0)",
            nullable: false,
            primary: true,
            unique: false,
            default: "",
            comment: "",
          },
          {
            key: "new:order-customer-id",
            name: "CUSTOMER_ID",
            type: "NUMBER(38,0)",
            nullable: false,
            primary: false,
            unique: false,
            default: "",
            comment: "",
          },
        ],
      },
    ],
    relationships: [
      {
        key: "new:orders-customer",
        name: "FK_ORDER_CUSTOMER",
        sourceTableKey: "new:orders",
        sourceColumnKeys: ["new:order-customer-id"],
        targetTableKey: "customer",
        targetColumnKeys: ["customer-id"],
        cardinality: "many_to_one",
      },
    ],
  };
}

describe("SS-014 logical schema proposals", () => {
  it("projects a diagram into a credential-free strict logical model", () => {
    const model = diagramToLogicalModel(snowflakeDiagram());
    assert.equal(model.tables[0].key, "customer");
    assert.equal(model.tables[0].columns[0].type, "NUMBER(38,0)");
    assert.equal(JSON.stringify(model).includes("password"), false);
    assert.deepEqual(Object.keys(model).sort(), [
      "relationships",
      "summary",
      "tables",
    ]);
  });

  it("preserves existing ids and layout while applying accepted additions and changes", () => {
    let sequence = 0;
    const result = applyLogicalModel(snowflakeDiagram(), proposedModel(), {
      idFactory: (kind) => `${kind}-${++sequence}`,
    });
    assert.equal(result.tables.length, 2);
    assert.equal(result.tables[0].id, "customer");
    assert.equal(result.tables[0].x, 120);
    assert.equal(result.tables[0].y, 80);
    assert.equal(result.tables[0].comment, "Customer accounts");
    assert.equal(result.tables[0].fields[0].id, "customer-id");
    assert.equal(result.tables[0].fields[1].name, "EMAIL");
    assert.equal(result.tables[0].fields[1].unique, true);
    assert.deepEqual(result.tables[1].namespace, {
      id: "namespace:ANALYTICS.CORE",
      catalog: "ANALYTICS",
      schema: "CORE",
    });
    assert.equal(result.relationships.length, 1);
    assert.equal(
      result.relationships[0].startTableId,
      result.tables[1].id,
    );
    assert.equal(result.relationships[0].endTableId, "customer");
    assert.equal(
      result.relationships[0].fields[0].endFieldId,
      "customer-id",
    );
  });

  it("computes reviewable add/change/remove diffs before mutation", () => {
    const current = diagramToLogicalModel(snowflakeDiagram());
    const changes = diffLogicalModels(
      current,
      proposedModel(),
      "snowflake",
    );
    assert.deepEqual(
      changes.map(({ kind, object, label }) => ({ kind, object, label })),
      [
        { kind: "change", object: "table", label: "CUSTOMER" },
        { kind: "add", object: "table", label: "ORDER_HEADER" },
        {
          kind: "add",
          object: "relationship",
          label: "FK_ORDER_CUSTOMER",
        },
      ],
    );
  });

  it("fails closed for unknown fields, unsupported types, duplicates, and dangling references", () => {
    const unknown = proposedModel();
    unknown.secret = "do not accept";
    assert.throws(
      () => validateLogicalModel(unknown, "snowflake"),
      /unexpected or missing fields/,
    );

    const unsupported = proposedModel();
    unsupported.tables[1].columns[0].type = "VARIANT";
    assert.throws(
      () => validateLogicalModel(unsupported, "snowflake"),
      /unsupported snowflake type VARIANT/,
    );

    const duplicate = proposedModel();
    duplicate.tables[1].name = "CUSTOMER";
    assert.throws(
      () => validateLogicalModel(duplicate, "snowflake"),
      /duplicate CUSTOMER/,
    );

    const dangling = proposedModel();
    dangling.relationships[0].targetColumnKeys = ["missing"];
    assert.throws(
      () => validateLogicalModel(dangling, "snowflake"),
      /unknown column/,
    );

    const invalidRelationshipName = proposedModel();
    invalidRelationshipName.relationships[0].name = "fk_order_customer";
    assert.throws(
      () => validateLogicalModel(invalidRelationshipName, "snowflake"),
      /uppercase/,
    );
  });

  it("drops retained indexes or unique constraints when their columns are removed", () => {
    const diagram = snowflakeDiagram();
    diagram.tables[0].indices = [
      {
        id: "idx-customer-id",
        name: "IDX_CUSTOMER_ID",
        unique: false,
        fields: ["customer-id"],
      },
    ];
    diagram.tables[0].uniqueConstraints = [
      {
        id: "uq-customer-id",
        name: "UQ_CUSTOMER_ID",
        fields: ["customer-id"],
      },
    ];
    const proposal = proposedModel();
    proposal.tables[0].columns = [proposal.tables[0].columns[1]];
    proposal.relationships = [];

    const result = applyLogicalModel(diagram, proposal, {
      idFactory: (kind, key) => `${kind}:${key}`,
    });

    assert.deepEqual(result.tables[0].indices, []);
    assert.deepEqual(result.tables[0].uniqueConstraints, []);
  });
});
