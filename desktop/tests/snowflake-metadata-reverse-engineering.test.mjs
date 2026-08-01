import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  canonicalProjectToDiagram,
  diagramToCanonicalProject,
} from "../src/erdTool/projectAdapter.js";

async function loadSnowflakeMetadataMapper() {
  return import("../src/erdTool/snowflakeMetadata.js");
}

function mockedSnowflakeMetadata() {
  return {
    // These values model an Electron-main connection envelope. SS-009 mapping
    // must consume only structural metadata and never serialize connection data.
    connection: {
      account: "xy12345.us-central1.gcp",
      user: "LEE",
      password: "correct horse battery staple",
      token: "session-token-should-not-leak",
      privateKey: "-----BEGIN PRIVATE KEY-----\nsecret\n-----END PRIVATE KEY-----",
      warehouse: "COMPUTE_WH",
      role: "ENTITYADMIN",
    },
    databases: [
      { database_name: "ANALYTICS", comment: "analytics warehouse" },
      { database_name: "OPS", comment: "operations warehouse" },
    ],
    schemata: [
      { catalog_name: "ANALYTICS", schema_name: "CORE", comment: "raw core" },
      { catalog_name: "ANALYTICS", schema_name: "MART", comment: "modeled mart" },
      { catalog_name: "OPS", schema_name: "SECURITY", comment: "security events" },
    ],
    tables: [
      {
        table_catalog: "ANALYTICS",
        table_schema: "CORE",
        table_name: "CUSTOMER",
        table_type: "BASE TABLE",
        comment: "Customer dimension",
      },
      {
        table_catalog: "ANALYTICS",
        table_schema: "MART",
        table_name: "ORDER_FACT",
        table_type: "BASE TABLE",
        comment: "Order facts",
      },
      {
        table_catalog: "OPS",
        table_schema: "SECURITY",
        table_name: "ALERT_EVENT",
        table_type: "BASE TABLE",
        comment: "Security alert stream",
      },
    ],
    columns: [
      column("ANALYTICS", "CORE", "CUSTOMER", "CUSTOMER_ID", 1, "NUMBER", {
        numeric_precision: 38,
        numeric_scale: 0,
        is_nullable: "NO",
        comment: "surrogate key",
      }),
      column("ANALYTICS", "CORE", "CUSTOMER", "EMAIL", 2, "VARCHAR", {
        character_maximum_length: 320,
        is_nullable: "NO",
        comment: "natural key",
      }),
      column("ANALYTICS", "CORE", "CUSTOMER", "ACTIVE", 3, "BOOLEAN", {
        is_nullable: "NO",
        column_default: "TRUE",
      }),
      column("ANALYTICS", "CORE", "CUSTOMER", "CREATED_AT", 4, "TIMESTAMP_NTZ", {
        datetime_precision: 9,
        is_nullable: "NO",
        column_default: "CURRENT_TIMESTAMP()",
      }),
      column("ANALYTICS", "MART", "ORDER_FACT", "ORDER_ID", 1, "NUMBER", {
        numeric_precision: 38,
        numeric_scale: 0,
        is_nullable: "NO",
      }),
      column("ANALYTICS", "MART", "ORDER_FACT", "CUSTOMER_ID", 2, "NUMBER", {
        numeric_precision: 38,
        numeric_scale: 0,
        is_nullable: "NO",
      }),
      column("ANALYTICS", "MART", "ORDER_FACT", "ORDER_DATE", 3, "DATE", {
        is_nullable: "NO",
      }),
      column("ANALYTICS", "MART", "ORDER_FACT", "ORDER_AMOUNT", 4, "NUMBER", {
        numeric_precision: 12,
        numeric_scale: 2,
        is_nullable: "NO",
        column_default: "0",
      }),
      column("ANALYTICS", "MART", "ORDER_FACT", "TAX_RATE", 5, "FLOAT", {
        is_nullable: "YES",
      }),
      column("OPS", "SECURITY", "ALERT_EVENT", "EVENT_ID", 1, "VARCHAR", {
        character_maximum_length: 64,
        is_nullable: "NO",
      }),
      column("OPS", "SECURITY", "ALERT_EVENT", "PAYLOAD_HASH", 2, "BINARY", {
        character_maximum_length: 32,
        is_nullable: "YES",
      }),
    ],
    tableConstraints: [
      constraint("ANALYTICS", "CORE", "CUSTOMER", "PK_CUSTOMER", "PRIMARY KEY"),
      constraint("ANALYTICS", "CORE", "CUSTOMER", "UQ_CUSTOMER_EMAIL", "UNIQUE"),
      constraint("ANALYTICS", "MART", "ORDER_FACT", "PK_ORDER_FACT", "PRIMARY KEY"),
      constraint(
        "ANALYTICS",
        "MART",
        "ORDER_FACT",
        "FK_ORDER_FACT_CUSTOMER",
        "FOREIGN KEY",
      ),
      constraint("OPS", "SECURITY", "ALERT_EVENT", "PK_ALERT_EVENT", "PRIMARY KEY"),
    ],
    keyColumnUsage: [
      keyUsage("ANALYTICS", "CORE", "CUSTOMER", "PK_CUSTOMER", "CUSTOMER_ID", 1),
      keyUsage("ANALYTICS", "CORE", "CUSTOMER", "UQ_CUSTOMER_EMAIL", "EMAIL", 1),
      keyUsage("ANALYTICS", "MART", "ORDER_FACT", "PK_ORDER_FACT", "ORDER_ID", 1),
      keyUsage(
        "ANALYTICS",
        "MART",
        "ORDER_FACT",
        "FK_ORDER_FACT_CUSTOMER",
        "CUSTOMER_ID",
        1,
      ),
      keyUsage("OPS", "SECURITY", "ALERT_EVENT", "PK_ALERT_EVENT", "EVENT_ID", 1),
    ],
    referentialConstraints: [
      {
        constraint_catalog: "ANALYTICS",
        constraint_schema: "MART",
        constraint_name: "FK_ORDER_FACT_CUSTOMER",
        unique_constraint_catalog: "ANALYTICS",
        unique_constraint_schema: "CORE",
        unique_constraint_name: "PK_CUSTOMER",
      },
    ],
  };
}

function mockedCompositeForeignKeyMetadata() {
  const metadata = JSON.parse(JSON.stringify(mockedSnowflakeMetadata()));
  metadata.tables.push(
    {
      table_catalog: "ANALYTICS",
      table_schema: "CORE",
      table_name: "ENTITY",
      table_type: "BASE TABLE",
      comment: "Tenant-scoped entity",
    },
    {
      table_catalog: "ANALYTICS",
      table_schema: "MART",
      table_name: "SUBSCRIPTION",
      table_type: "BASE TABLE",
      comment: "Subscription fact",
    },
  );
  metadata.columns.push(
    column("ANALYTICS", "CORE", "ENTITY", "TENANT_ID", 1, "NUMBER", {
      numeric_precision: 38,
      numeric_scale: 0,
      is_nullable: "NO",
    }),
    column("ANALYTICS", "CORE", "ENTITY", "ENTITY_ID", 2, "NUMBER", {
      numeric_precision: 38,
      numeric_scale: 0,
      is_nullable: "NO",
    }),
    column("ANALYTICS", "MART", "SUBSCRIPTION", "SUBSCRIPTION_ID", 1, "NUMBER", {
      numeric_precision: 38,
      numeric_scale: 0,
      is_nullable: "NO",
    }),
    column("ANALYTICS", "MART", "SUBSCRIPTION", "ENTITY_ID", 2, "NUMBER", {
      numeric_precision: 38,
      numeric_scale: 0,
      is_nullable: "NO",
    }),
    column("ANALYTICS", "MART", "SUBSCRIPTION", "TENANT_ID", 3, "NUMBER", {
      numeric_precision: 38,
      numeric_scale: 0,
      is_nullable: "NO",
    }),
  );
  metadata.tableConstraints.push(
    constraint(
      "ANALYTICS",
      "CORE",
      "ENTITY",
      "UQ_ENTITY_TENANT_ENTITY",
      "UNIQUE",
    ),
    constraint(
      "ANALYTICS",
      "MART",
      "SUBSCRIPTION",
      "PK_SUBSCRIPTION",
      "PRIMARY KEY",
    ),
    constraint(
      "ANALYTICS",
      "MART",
      "SUBSCRIPTION",
      "FK_SUBSCRIPTION_ENTITY",
      "FOREIGN KEY",
    ),
  );
  metadata.keyColumnUsage.push(
    keyUsage(
      "ANALYTICS",
      "CORE",
      "ENTITY",
      "UQ_ENTITY_TENANT_ENTITY",
      "TENANT_ID",
      1,
    ),
    keyUsage(
      "ANALYTICS",
      "CORE",
      "ENTITY",
      "UQ_ENTITY_TENANT_ENTITY",
      "ENTITY_ID",
      2,
    ),
    keyUsage(
      "ANALYTICS",
      "MART",
      "SUBSCRIPTION",
      "PK_SUBSCRIPTION",
      "SUBSCRIPTION_ID",
      1,
    ),
    {
      ...keyUsage(
        "ANALYTICS",
        "MART",
        "SUBSCRIPTION",
        "FK_SUBSCRIPTION_ENTITY",
        "ENTITY_ID",
        1,
      ),
      position_in_unique_constraint: 2,
    },
    {
      ...keyUsage(
        "ANALYTICS",
        "MART",
        "SUBSCRIPTION",
        "FK_SUBSCRIPTION_ENTITY",
        "TENANT_ID",
        2,
      ),
      position_in_unique_constraint: 1,
    },
  );
  metadata.referentialConstraints.push({
    constraint_catalog: "ANALYTICS",
    constraint_schema: "MART",
    constraint_name: "FK_SUBSCRIPTION_ENTITY",
    unique_constraint_catalog: "ANALYTICS",
    unique_constraint_schema: "CORE",
    unique_constraint_name: "UQ_ENTITY_TENANT_ENTITY",
  });
  return metadata;
}

function column(catalog, schema, table, name, ordinal, dataType, overrides = {}) {
  return {
    table_catalog: catalog,
    table_schema: schema,
    table_name: table,
    column_name: name,
    ordinal_position: ordinal,
    data_type: dataType,
    is_nullable: "YES",
    column_default: null,
    numeric_precision: null,
    numeric_scale: null,
    character_maximum_length: null,
    datetime_precision: null,
    comment: null,
    ...overrides,
  };
}

function constraint(catalog, schema, table, name, type) {
  return {
    table_catalog: catalog,
    table_schema: schema,
    table_name: table,
    constraint_catalog: catalog,
    constraint_schema: schema,
    constraint_name: name,
    constraint_type: type,
  };
}

function keyUsage(catalog, schema, table, constraintName, columnName, ordinal) {
  return {
    table_catalog: catalog,
    table_schema: schema,
    table_name: table,
    constraint_catalog: catalog,
    constraint_schema: schema,
    constraint_name: constraintName,
    column_name: columnName,
    ordinal_position: ordinal,
  };
}

function type(family, text, precision = null, scale = null, length = null) {
  return { family, text, precision, scale, length };
}

function expectedCanonicalProject() {
  const namespaces = [
    { id: "namespace:ANALYTICS.CORE", catalog: "ANALYTICS", schema: "CORE" },
    { id: "namespace:ANALYTICS.MART", catalog: "ANALYTICS", schema: "MART" },
    { id: "namespace:OPS.SECURITY", catalog: "OPS", schema: "SECURITY" },
  ];

  const tables = [
    {
      id: "table:ANALYTICS.CORE.CUSTOMER",
      namespace_id: "namespace:ANALYTICS.CORE",
      name: "CUSTOMER",
      kind: "table",
      columns: [
        modelColumn("ANALYTICS", "CORE", "CUSTOMER", "CUSTOMER_ID", 1, type("NUMBER", "NUMBER(38, 0)", 38, 0), false, null, "surrogate key"),
        modelColumn("ANALYTICS", "CORE", "CUSTOMER", "EMAIL", 2, type("VARCHAR", "VARCHAR(320)", null, null, 320), false, null, "natural key"),
        modelColumn("ANALYTICS", "CORE", "CUSTOMER", "ACTIVE", 3, type("BOOLEAN", "BOOLEAN"), false, "TRUE", null),
        modelColumn("ANALYTICS", "CORE", "CUSTOMER", "CREATED_AT", 4, type("TIMESTAMP_NTZ", "TIMESTAMP_NTZ(9)", 9), false, "CURRENT_TIMESTAMP()", null),
      ],
      constraints: [
        modelConstraint("ANALYTICS", "CORE", "CUSTOMER", "PK_CUSTOMER", "primary_key", ["CUSTOMER_ID"]),
        modelConstraint("ANALYTICS", "CORE", "CUSTOMER", "UQ_CUSTOMER_EMAIL", "unique", ["EMAIL"]),
      ],
      comment: "Customer dimension",
    },
    {
      id: "table:ANALYTICS.MART.ORDER_FACT",
      namespace_id: "namespace:ANALYTICS.MART",
      name: "ORDER_FACT",
      kind: "table",
      columns: [
        modelColumn("ANALYTICS", "MART", "ORDER_FACT", "ORDER_ID", 1, type("NUMBER", "NUMBER(38, 0)", 38, 0), false),
        modelColumn("ANALYTICS", "MART", "ORDER_FACT", "CUSTOMER_ID", 2, type("NUMBER", "NUMBER(38, 0)", 38, 0), false),
        modelColumn("ANALYTICS", "MART", "ORDER_FACT", "ORDER_DATE", 3, type("DATE", "DATE"), false),
        modelColumn("ANALYTICS", "MART", "ORDER_FACT", "ORDER_AMOUNT", 4, type("NUMBER", "NUMBER(12, 2)", 12, 2), false, "0"),
        modelColumn("ANALYTICS", "MART", "ORDER_FACT", "TAX_RATE", 5, type("FLOAT", "FLOAT"), true),
      ],
      constraints: [
        {
          ...modelConstraint("ANALYTICS", "MART", "ORDER_FACT", "FK_ORDER_FACT_CUSTOMER", "foreign_key", ["CUSTOMER_ID"]),
          referenced_table_id: "table:ANALYTICS.CORE.CUSTOMER",
          referenced_columns: ["column:ANALYTICS.CORE.CUSTOMER.CUSTOMER_ID"],
        },
        modelConstraint("ANALYTICS", "MART", "ORDER_FACT", "PK_ORDER_FACT", "primary_key", ["ORDER_ID"]),
      ],
      comment: "Order facts",
    },
    {
      id: "table:OPS.SECURITY.ALERT_EVENT",
      namespace_id: "namespace:OPS.SECURITY",
      name: "ALERT_EVENT",
      kind: "table",
      columns: [
        modelColumn("OPS", "SECURITY", "ALERT_EVENT", "EVENT_ID", 1, type("VARCHAR", "VARCHAR(64)", null, null, 64), false),
        modelColumn("OPS", "SECURITY", "ALERT_EVENT", "PAYLOAD_HASH", 2, type("BINARY", "BINARY(32)", null, null, 32), true),
      ],
      constraints: [
        modelConstraint("OPS", "SECURITY", "ALERT_EVENT", "PK_ALERT_EVENT", "primary_key", ["EVENT_ID"]),
      ],
      comment: "Security alert stream",
    },
  ];

  return {
    project_version: "1",
    physical_model: {
      model_version: "1",
      name: "mocked-snowflake-metadata",
      namespaces,
      tables,
      relationships: [
        {
          id: "relationship:ANALYTICS.MART.ORDER_FACT.FK_ORDER_FACT_CUSTOMER",
          name: "FK_ORDER_FACT_CUSTOMER",
          source_table_id: "table:ANALYTICS.MART.ORDER_FACT",
          source_column_ids: ["column:ANALYTICS.MART.ORDER_FACT.CUSTOMER_ID"],
          target_table_id: "table:ANALYTICS.CORE.CUSTOMER",
          target_column_ids: ["column:ANALYTICS.CORE.CUSTOMER.CUSTOMER_ID"],
          cardinality: "many_to_one",
        },
      ],
    },
    diagram_layout: {
      nodes: {
        "table:ANALYTICS.CORE.CUSTOMER": { x: 0, y: 80 },
        "table:ANALYTICS.MART.ORDER_FACT": { x: 280, y: 80 },
        "table:OPS.SECURITY.ALERT_EVENT": { x: 560, y: 80 },
      },
      viewport: { x: 0, y: 0, zoom: 1 },
    },
  };
}

function modelColumn(catalog, schema, table, name, ordinal, dataType, nullable, defaultValue = null, comment = null) {
  return {
    id: `column:${catalog}.${schema}.${table}.${name}`,
    name,
    ordinal,
    data_type: dataType,
    nullable,
    default: defaultValue,
    comment,
  };
}

function modelConstraint(catalog, schema, table, name, kind, columnNames) {
  return {
    id: `constraint:${catalog}.${schema}.${table}.${name}`,
    name,
    kind,
    columns: columnNames.map((columnName) => `column:${catalog}.${schema}.${table}.${columnName}`),
    referenced_table_id: null,
    referenced_columns: [],
  };
}

function assertNoSecretMaterial(value) {
  const serialized = JSON.stringify(value);
  for (const forbidden of [
    "correct horse battery staple",
    "session-token-should-not-leak",
    "BEGIN PRIVATE KEY",
    "xy12345.us-central1.gcp",
    "COMPUTE_WH",
    "ENTITYADMIN",
  ]) {
    assert.equal(serialized.includes(forbidden), false, forbidden);
  }
  assert.doesNotMatch(
    serialized,
    /"?(?:account|warehouse|role|connection|credential|credentials|password|token|privateKey|private_key|session)"?\s*:/i,
  );
}

describe("SS-009 mocked Snowflake metadata reverse engineering", () => {
  it("maps mocked INFORMATION_SCHEMA rows into a deterministic canonical project", async () => {
    const { snowflakeMetadataToCanonicalProject } =
      await loadSnowflakeMetadataMapper();

    assert.equal(typeof snowflakeMetadataToCanonicalProject, "function");

    const project = snowflakeMetadataToCanonicalProject(
      mockedSnowflakeMetadata(),
      { name: "mocked-snowflake-metadata" },
    );

    assert.deepEqual(project, expectedCanonicalProject());
    assert.deepEqual(
      snowflakeMetadataToCanonicalProject(mockedSnowflakeMetadata(), {
        name: "mocked-snowflake-metadata",
      }),
      project,
    );
    assertNoSecretMaterial(project);
  });

  it("converts metadata into drawDB diagram tables, fields, relationships, comments, and stable ids", async () => {
    const { snowflakeMetadataToDiagram } = await loadSnowflakeMetadataMapper();

    assert.equal(typeof snowflakeMetadataToDiagram, "function");

    const diagram = snowflakeMetadataToDiagram(mockedSnowflakeMetadata(), {
      title: "mocked-snowflake-metadata",
    });

    assert.equal(diagram.database, "snowflake");
    assert.equal(diagram.title, "mocked-snowflake-metadata");
    assert.deepEqual(
      diagram.tables.map((table) => table.id),
      [
        "table:ANALYTICS.CORE.CUSTOMER",
        "table:ANALYTICS.MART.ORDER_FACT",
        "table:OPS.SECURITY.ALERT_EVENT",
      ],
    );

    const customer = diagram.tables.find((table) => table.name === "CUSTOMER");
    const order = diagram.tables.find((table) => table.name === "ORDER_FACT");
    const alert = diagram.tables.find((table) => table.name === "ALERT_EVENT");

    assert.equal(customer.comment, "Customer dimension");
    assert.deepEqual(customer.namespace, {
      id: "namespace:ANALYTICS.CORE",
      catalog: "ANALYTICS",
      schema: "CORE",
    });
    assert.deepEqual(
      customer.fields.map(({ id, name, type, size, primary, unique, notNull, default: defaultValue, comment }) => ({
        id,
        name,
        type,
        size,
        primary,
        unique,
        notNull,
        default: defaultValue,
        comment,
      })),
      [
        {
          id: "column:ANALYTICS.CORE.CUSTOMER.CUSTOMER_ID",
          name: "CUSTOMER_ID",
          type: "NUMBER",
          size: "38,0",
          primary: true,
          unique: false,
          notNull: true,
          default: "",
          comment: "surrogate key",
        },
        {
          id: "column:ANALYTICS.CORE.CUSTOMER.EMAIL",
          name: "EMAIL",
          type: "VARCHAR",
          size: 320,
          primary: false,
          unique: true,
          notNull: true,
          default: "",
          comment: "natural key",
        },
        {
          id: "column:ANALYTICS.CORE.CUSTOMER.ACTIVE",
          name: "ACTIVE",
          type: "BOOLEAN",
          size: undefined,
          primary: false,
          unique: false,
          notNull: true,
          default: "TRUE",
          comment: "",
        },
        {
          id: "column:ANALYTICS.CORE.CUSTOMER.CREATED_AT",
          name: "CREATED_AT",
          type: "TIMESTAMP_NTZ",
          size: 9,
          primary: false,
          unique: false,
          notNull: true,
          default: "CURRENT_TIMESTAMP()",
          comment: "",
        },
      ],
    );

    assert.deepEqual(alert.fields.map(({ name, type, size }) => ({ name, type, size })), [
      { name: "EVENT_ID", type: "VARCHAR", size: 64 },
      { name: "PAYLOAD_HASH", type: "BINARY", size: 32 },
    ]);

    assert.equal(
      order.fields.find((field) => field.name === "ORDER_DATE").type,
      "DATE",
    );
    assert.equal(
      order.fields.find((field) => field.name === "ORDER_AMOUNT").size,
      "12,2",
    );
    assert.equal(
      order.fields.find((field) => field.name === "TAX_RATE").type,
      "FLOAT",
    );

    assert.deepEqual(diagram.relationships, [
      {
        id: "relationship:ANALYTICS.MART.ORDER_FACT.FK_ORDER_FACT_CUSTOMER",
        name: "FK_ORDER_FACT_CUSTOMER",
        startTableId: "table:ANALYTICS.MART.ORDER_FACT",
        startFieldId: "column:ANALYTICS.MART.ORDER_FACT.CUSTOMER_ID",
        endTableId: "table:ANALYTICS.CORE.CUSTOMER",
        endFieldId: "column:ANALYTICS.CORE.CUSTOMER.CUSTOMER_ID",
        fields: [
          {
            startFieldId: "column:ANALYTICS.MART.ORDER_FACT.CUSTOMER_ID",
            endFieldId: "column:ANALYTICS.CORE.CUSTOMER.CUSTOMER_ID",
          },
        ],
        cardinality: "many_to_one",
        updateConstraint: "No action",
        deleteConstraint: "No action",
      },
    ]);

    assert.deepEqual(diagram.transform, { pan: { x: 0, y: 0 }, zoom: 1 });
    assertNoSecretMaterial(diagram);
  });

  it("produces a saved-project representation that can reopen in the editor and remains secret-free", async () => {
    const { snowflakeMetadataToDiagram } = await loadSnowflakeMetadataMapper();
    const diagram = snowflakeMetadataToDiagram(mockedSnowflakeMetadata(), {
      title: "mocked-snowflake-metadata",
    });

    const savedProject = diagramToCanonicalProject(diagram);
    const reopenedDiagram = canonicalProjectToDiagram(
      JSON.parse(JSON.stringify(savedProject)),
    );

    const { drawdb_document, ...savedCanonicalProjection } = savedProject;
    assert.deepEqual(savedCanonicalProjection, expectedCanonicalProject());
    assert.equal(drawdb_document.database, "snowflake");
    assert.equal(drawdb_document.title, "mocked-snowflake-metadata");
    assert.deepEqual(
      drawdb_document.tables.map((table) => table.id),
      diagram.tables.map((table) => table.id),
    );
    assert.equal(reopenedDiagram.database, "snowflake");
    assert.deepEqual(
      reopenedDiagram.relationships.map((relationship) => relationship.id),
      ["relationship:ANALYTICS.MART.ORDER_FACT.FK_ORDER_FACT_CUSTOMER"],
    );
    assertNoSecretMaterial(savedProject);
    assertNoSecretMaterial(reopenedDiagram);
  });

  it("uses Snowflake unique-constraint positions when mapping composite foreign keys", async () => {
    const { snowflakeMetadataToCanonicalProject, snowflakeMetadataToDiagram } =
      await loadSnowflakeMetadataMapper();

    const project = snowflakeMetadataToCanonicalProject(
      mockedCompositeForeignKeyMetadata(),
      { name: "mocked-composite-snowflake-metadata" },
    );
    const subscription = project.physical_model.tables.find(
      (table) => table.id === "table:ANALYTICS.MART.SUBSCRIPTION",
    );
    const foreignKey = subscription.constraints.find(
      (constraint) => constraint.name === "FK_SUBSCRIPTION_ENTITY",
    );

    assert.deepEqual(foreignKey.columns, [
      "column:ANALYTICS.MART.SUBSCRIPTION.ENTITY_ID",
      "column:ANALYTICS.MART.SUBSCRIPTION.TENANT_ID",
    ]);
    assert.deepEqual(foreignKey.referenced_columns, [
      "column:ANALYTICS.CORE.ENTITY.ENTITY_ID",
      "column:ANALYTICS.CORE.ENTITY.TENANT_ID",
    ]);

    const diagram = snowflakeMetadataToDiagram(
      mockedCompositeForeignKeyMetadata(),
      { title: "mocked-composite-snowflake-metadata" },
    );
    const relationship = diagram.relationships.find(
      (rel) => rel.name === "FK_SUBSCRIPTION_ENTITY",
    );

    assert.deepEqual(relationship.fields, [
      {
        startFieldId: "column:ANALYTICS.MART.SUBSCRIPTION.ENTITY_ID",
        endFieldId: "column:ANALYTICS.CORE.ENTITY.ENTITY_ID",
      },
      {
        startFieldId: "column:ANALYTICS.MART.SUBSCRIPTION.TENANT_ID",
        endFieldId: "column:ANALYTICS.CORE.ENTITY.TENANT_ID",
      },
    ]);
    assertNoSecretMaterial(project);
    assertNoSecretMaterial(diagram);
  });
});
