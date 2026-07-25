import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import { DB } from "../src/data/constants.js";
import { exportSQL } from "../src/utils/exportSQL/index.js";
import { importSQL } from "../src/utils/importSQL/index.js";
import {
  canonicalProjectToDiagram,
  diagramToCanonicalProject,
} from "../src/erdTool/projectAdapter.js";

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const terraformRoundTripPath = path.join(
  repositoryRoot,
  "src",
  "erdTool",
  "terraformRoundTrip.js",
);
const controlPanelPath = path.join(
  repositoryRoot,
  "src",
  "components",
  "EditorHeader",
  "ControlPanel.jsx",
);
const importModalPath = path.join(
  repositoryRoot,
  "src",
  "components",
  "EditorHeader",
  "Modal",
  "Modal.jsx",
);
const importSourcePath = path.join(
  repositoryRoot,
  "src",
  "components",
  "EditorHeader",
  "Modal",
  "ImportSource.jsx",
);
const desktopBridgePath = path.join(
  repositoryRoot,
  "src",
  "erdTool",
  "desktopBridge.js",
);
const electronMainPath = path.join(
  repositoryRoot,
  "src",
  "electron",
  "main.ts",
);

async function loadTerraformRoundTrip() {
  const module = await import("../src/erdTool/terraformRoundTrip.js");
  for (const exportName of [
    "terraformHclToCanonicalProject",
    "terraformHclToDiagram",
    "canonicalProjectToTerraformHcl",
  ]) {
    assert.equal(
      typeof module[exportName],
      "function",
      `src/erdTool/terraformRoundTrip.js must export ${exportName}()`,
    );
  }
  return module;
}

const supportedTerraformModule = `
terraform {
  required_providers {
    snowflake = {
      source  = "snowflakedb/snowflake"
      version = "~> 2.18"
    }
  }
}

resource "snowflake_database" "analytics" {
  name = "ANALYTICS"
}

resource "snowflake_schema" "core" {
  database = snowflake_database.analytics.name
  name     = "CORE"
}

resource "snowflake_schema" "mart" {
  database = snowflake_database.analytics.name
  name     = "MART"
}

resource "snowflake_table" "customer" {
  database = snowflake_schema.core.database
  schema   = snowflake_schema.core.name
  name     = "CUSTOMER"
  comment  = "Customer dimension"

  column {
    name     = "CUSTOMER_ID"
    type     = "NUMBER(38, 0)"
    nullable = false
    comment  = "surrogate key"
  }

  column {
    name     = "EMAIL"
    type     = "VARCHAR(320)"
    nullable = false
    comment  = "natural key"
  }

  column {
    name     = "ACTIVE"
    type     = "BOOLEAN"
    nullable = false

    default {
      constant = "TRUE"
    }
  }

  column {
    name     = "CREATED_AT"
    type     = "TIMESTAMP_NTZ(9)"
    nullable = false

    default {
      expression = "CURRENT_TIMESTAMP()"
    }
  }
}

resource "snowflake_table" "order_header" {
  database = snowflake_schema.mart.database
  schema   = snowflake_schema.mart.name
  name     = "ORDER_HEADER"
  comment  = "Order facts"

  column {
    name     = "ORDER_ID"
    type     = "NUMBER(38, 0)"
    nullable = false
  }

  column {
    name     = "CUSTOMER_ID"
    type     = "NUMBER(38, 0)"
    nullable = false
  }

  column {
    name     = "ORDER_DATE"
    type     = "DATE"
    nullable = false
  }

  column {
    name     = "ORDER_AMOUNT"
    type     = "NUMBER(12, 2)"
    nullable = false

    default {
      constant = "0"
    }
  }
}

resource "snowflake_table_constraint" "pk_customer" {
  name     = "PK_CUSTOMER"
  type     = "PRIMARY KEY"
  table_id = snowflake_table.customer.fully_qualified_name
  columns  = ["CUSTOMER_ID"]
  enforced = false
}

resource "snowflake_table_constraint" "uq_customer_email" {
  name     = "UQ_CUSTOMER_EMAIL"
  type     = "UNIQUE"
  table_id = snowflake_table.customer.fully_qualified_name
  columns  = ["EMAIL"]
  enforced = false
}

resource "snowflake_table_constraint" "pk_order_header" {
  name     = "PK_ORDER_HEADER"
  type     = "PRIMARY KEY"
  table_id = snowflake_table.order_header.fully_qualified_name
  columns  = ["ORDER_ID"]
  enforced = false
}

resource "snowflake_table_constraint" "fk_order_header_customer" {
  name     = "FK_ORDER_HEADER_CUSTOMER"
  type     = "FOREIGN KEY"
  table_id = snowflake_table.order_header.fully_qualified_name
  columns  = ["CUSTOMER_ID"]
  enforced = false

  foreign_key_properties {
    references {
      table_id = snowflake_table.customer.fully_qualified_name
      columns  = ["CUSTOMER_ID"]
    }
  }
}
`;

const expectedTerraformHcl = `terraform {
  required_providers {
    snowflake = {
      source  = "snowflakedb/snowflake"
      version = ">= 2.0.0"
    }
  }
}

resource "snowflake_database" "analytics" {
  name = "ANALYTICS"
}

resource "snowflake_schema" "analytics_core" {
  database = snowflake_database.analytics.name
  name     = "CORE"
}

resource "snowflake_schema" "analytics_mart" {
  database = snowflake_database.analytics.name
  name     = "MART"
}

resource "snowflake_table" "analytics_core_customer" {
  database = snowflake_schema.analytics_core.database
  schema   = snowflake_schema.analytics_core.name
  name     = "CUSTOMER"
  comment  = "Customer dimension"

  column {
    name     = "CUSTOMER_ID"
    type     = "NUMBER(38, 0)"
    nullable = false
    comment  = "surrogate key"
  }

  column {
    name     = "EMAIL"
    type     = "VARCHAR(320)"
    nullable = false
    comment  = "natural key"
  }

  column {
    name     = "ACTIVE"
    type     = "BOOLEAN"
    nullable = false

    default {
      constant = "TRUE"
    }
  }

  column {
    name     = "CREATED_AT"
    type     = "TIMESTAMP_NTZ(9)"
    nullable = false

    default {
      expression = "CURRENT_TIMESTAMP()"
    }
  }
}

resource "snowflake_table" "analytics_mart_order_header" {
  database = snowflake_schema.analytics_mart.database
  schema   = snowflake_schema.analytics_mart.name
  name     = "ORDER_HEADER"
  comment  = "Order facts"

  column {
    name     = "ORDER_ID"
    type     = "NUMBER(38, 0)"
    nullable = false
  }

  column {
    name     = "CUSTOMER_ID"
    type     = "NUMBER(38, 0)"
    nullable = false
  }

  column {
    name     = "ORDER_DATE"
    type     = "DATE"
    nullable = false
  }

  column {
    name     = "ORDER_AMOUNT"
    type     = "NUMBER(12, 2)"
    nullable = false

    default {
      constant = "0"
    }
  }
}

resource "snowflake_table_constraint" "analytics_core_customer_pk_customer" {
  name     = "PK_CUSTOMER"
  type     = "PRIMARY KEY"
  table_id = snowflake_table.analytics_core_customer.fully_qualified_name
  columns  = ["CUSTOMER_ID"]
  enforced = false
}

resource "snowflake_table_constraint" "analytics_core_customer_uq_customer_email" {
  name     = "UQ_CUSTOMER_EMAIL"
  type     = "UNIQUE"
  table_id = snowflake_table.analytics_core_customer.fully_qualified_name
  columns  = ["EMAIL"]
  enforced = false
}

resource "snowflake_table_constraint" "analytics_mart_order_header_fk_order_header_customer" {
  name     = "FK_ORDER_HEADER_CUSTOMER"
  type     = "FOREIGN KEY"
  table_id = snowflake_table.analytics_mart_order_header.fully_qualified_name
  columns  = ["CUSTOMER_ID"]
  enforced = false

  foreign_key_properties {
    references {
      table_id = snowflake_table.analytics_core_customer.fully_qualified_name
      columns  = ["CUSTOMER_ID"]
    }
  }
}

resource "snowflake_table_constraint" "analytics_mart_order_header_pk_order_header" {
  name     = "PK_ORDER_HEADER"
  type     = "PRIMARY KEY"
  table_id = snowflake_table.analytics_mart_order_header.fully_qualified_name
  columns  = ["ORDER_ID"]
  enforced = false
}
`;

function type(family, text, precision = null, scale = null, length = null) {
  return { family, text, precision, scale, length };
}

function modelColumn(
  catalog,
  schema,
  table,
  name,
  ordinal,
  dataType,
  nullable,
  defaultValue = null,
  comment = null,
) {
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
    columns: columnNames.map(
      (columnName) => `column:${catalog}.${schema}.${table}.${columnName}`,
    ),
    referenced_table_id: null,
    referenced_columns: [],
  };
}

function supportedCanonicalProject() {
  return {
    project_version: "1",
    physical_model: {
      model_version: "1",
      name: "terraform-retail",
      namespaces: [
        { id: "namespace:ANALYTICS.CORE", catalog: "ANALYTICS", schema: "CORE" },
        { id: "namespace:ANALYTICS.MART", catalog: "ANALYTICS", schema: "MART" },
      ],
      tables: [
        {
          id: "table:ANALYTICS.CORE.CUSTOMER",
          namespace_id: "namespace:ANALYTICS.CORE",
          name: "CUSTOMER",
          kind: "table",
          columns: [
            modelColumn(
              "ANALYTICS",
              "CORE",
              "CUSTOMER",
              "CUSTOMER_ID",
              1,
              type("NUMBER", "NUMBER(38, 0)", 38, 0),
              false,
              null,
              "surrogate key",
            ),
            modelColumn(
              "ANALYTICS",
              "CORE",
              "CUSTOMER",
              "EMAIL",
              2,
              type("VARCHAR", "VARCHAR(320)", null, null, 320),
              false,
              null,
              "natural key",
            ),
            modelColumn(
              "ANALYTICS",
              "CORE",
              "CUSTOMER",
              "ACTIVE",
              3,
              type("BOOLEAN", "BOOLEAN"),
              false,
              "TRUE",
            ),
            modelColumn(
              "ANALYTICS",
              "CORE",
              "CUSTOMER",
              "CREATED_AT",
              4,
              type("TIMESTAMP_NTZ", "TIMESTAMP_NTZ(9)", 9),
              false,
              "CURRENT_TIMESTAMP()",
            ),
          ],
          constraints: [
            modelConstraint("ANALYTICS", "CORE", "CUSTOMER", "PK_CUSTOMER", "primary_key", [
              "CUSTOMER_ID",
            ]),
            modelConstraint("ANALYTICS", "CORE", "CUSTOMER", "UQ_CUSTOMER_EMAIL", "unique", [
              "EMAIL",
            ]),
          ],
          comment: "Customer dimension",
        },
        {
          id: "table:ANALYTICS.MART.ORDER_HEADER",
          namespace_id: "namespace:ANALYTICS.MART",
          name: "ORDER_HEADER",
          kind: "table",
          columns: [
            modelColumn(
              "ANALYTICS",
              "MART",
              "ORDER_HEADER",
              "ORDER_ID",
              1,
              type("NUMBER", "NUMBER(38, 0)", 38, 0),
              false,
            ),
            modelColumn(
              "ANALYTICS",
              "MART",
              "ORDER_HEADER",
              "CUSTOMER_ID",
              2,
              type("NUMBER", "NUMBER(38, 0)", 38, 0),
              false,
            ),
            modelColumn(
              "ANALYTICS",
              "MART",
              "ORDER_HEADER",
              "ORDER_DATE",
              3,
              type("DATE", "DATE"),
              false,
            ),
            modelColumn(
              "ANALYTICS",
              "MART",
              "ORDER_HEADER",
              "ORDER_AMOUNT",
              4,
              type("NUMBER", "NUMBER(12, 2)", 12, 2),
              false,
              "0",
            ),
          ],
          constraints: [
            {
              ...modelConstraint(
                "ANALYTICS",
                "MART",
                "ORDER_HEADER",
                "FK_ORDER_HEADER_CUSTOMER",
                "foreign_key",
                ["CUSTOMER_ID"],
              ),
              referenced_table_id: "table:ANALYTICS.CORE.CUSTOMER",
              referenced_columns: [
                "column:ANALYTICS.CORE.CUSTOMER.CUSTOMER_ID",
              ],
            },
            modelConstraint(
              "ANALYTICS",
              "MART",
              "ORDER_HEADER",
              "PK_ORDER_HEADER",
              "primary_key",
              ["ORDER_ID"],
            ),
          ],
          comment: "Order facts",
        },
      ],
      relationships: [
        {
          id: "relationship:ANALYTICS.MART.ORDER_HEADER.FK_ORDER_HEADER_CUSTOMER",
          name: "FK_ORDER_HEADER_CUSTOMER",
          source_table_id: "table:ANALYTICS.MART.ORDER_HEADER",
          source_column_ids: [
            "column:ANALYTICS.MART.ORDER_HEADER.CUSTOMER_ID",
          ],
          target_table_id: "table:ANALYTICS.CORE.CUSTOMER",
          target_column_ids: ["column:ANALYTICS.CORE.CUSTOMER.CUSTOMER_ID"],
          cardinality: "many_to_one",
        },
      ],
    },
    diagram_layout: {
      nodes: {
        "table:ANALYTICS.CORE.CUSTOMER": { x: 0, y: 80 },
        "table:ANALYTICS.MART.ORDER_HEADER": { x: 280, y: 80 },
      },
      viewport: { x: 0, y: 0, zoom: 1 },
    },
  };
}

function moduleFiles() {
  const firstTable = supportedTerraformModule.indexOf(
    'resource "snowflake_table" "customer"',
  );
  const firstConstraint = supportedTerraformModule.indexOf(
    'resource "snowflake_table_constraint"',
  );
  assert.ok(firstTable > 0);
  assert.ok(firstConstraint > firstTable);

  return [
    {
      path: "01-namespaces.tf",
      contents: supportedTerraformModule.slice(0, firstTable),
    },
    {
      path: "02-tables.tf",
      contents: supportedTerraformModule.slice(firstTable, firstConstraint),
    },
    {
      path: "03-constraints.tf",
      contents: supportedTerraformModule.slice(firstConstraint),
    },
  ];
}

function terraformStateFixture() {
  return JSON.stringify(
    {
      version: 4,
      terraform_version: "1.9.0",
      serial: 7,
      lineage: "state-must-not-import",
      outputs: {
        password: { value: "[REDACTED_STATE_OUTPUT]", sensitive: true },
      },
      resources: [
        {
          mode: "managed",
          type: "snowflake_table",
          name: "customer",
          instances: [
            {
              attributes: {
                id: "ANALYTICS|CORE|CUSTOMER",
                database: "ANALYTICS",
                schema: "CORE",
                name: "CUSTOMER",
              },
            },
          ],
        },
      ],
    },
    null,
    2,
  );
}

function credentialBearingProviderFixture() {
  return `
provider "snowflake" {
  account_name = "[REDACTED_ACCOUNT]"
  user         = "[REDACTED_USER]"
  password     = "[REDACTED_PASSWORD]"
  token        = "[REDACTED_TOKEN]"
  private_key  = "[REDACTED_PRIVATE_KEY]"
}

resource "snowflake_database" "analytics" {
  name = "ANALYTICS"
}
`;
}

function assertNoSecretMaterial(value) {
  const serialized = typeof value === "string" ? value : JSON.stringify(value);
  for (const forbidden of [
    "[REDACTED_PASSWORD]",
    "[REDACTED_TOKEN]",
    "[REDACTED_PRIVATE_KEY]",
    "[REDACTED_STATE_OUTPUT]",
    "[REDACTED_ACCOUNT]",
    "[REDACTED_USER]",
  ]) {
    assert.equal(serialized.includes(forbidden), false, forbidden);
  }
  assert.doesNotMatch(
    serialized,
    /"(?:password|private_key|token|backend|tfstate)"\s*:/i,
  );
}

function terraformSemanticSnapshot(project) {
  const model = project.physical_model;
  return {
    namespaces: model.namespaces.map((namespace) => ({
      id: namespace.id,
      catalog: namespace.catalog,
      schema: namespace.schema,
    })),
    tables: model.tables.map((table) => ({
      id: table.id,
      namespace_id: table.namespace_id,
      name: table.name,
      kind: table.kind,
      comment: table.comment,
      columns: table.columns.map((column) => ({
        id: column.id,
        name: column.name,
        ordinal: column.ordinal,
        data_type: column.data_type,
        nullable: column.nullable,
        default: column.default,
        comment: column.comment,
      })),
      constraints: table.constraints.map((constraint) => ({
        id: constraint.id,
        name: constraint.name,
        kind: constraint.kind,
        columns: constraint.columns,
        referenced_table_id: constraint.referenced_table_id,
        referenced_columns: constraint.referenced_columns,
      })),
    })),
    relationships: model.relationships.map((relationship) => ({
      id: relationship.id,
      name: relationship.name,
      source_table_id: relationship.source_table_id,
      source_column_ids: relationship.source_column_ids,
      target_table_id: relationship.target_table_id,
      target_column_ids: relationship.target_column_ids,
      cardinality: relationship.cardinality,
    })),
  };
}

function assertSupportedTerraformSemantics(project) {
  const snapshot = terraformSemanticSnapshot(project);
  assert.deepEqual(snapshot.namespaces, [
    { id: "namespace:ANALYTICS.CORE", catalog: "ANALYTICS", schema: "CORE" },
    { id: "namespace:ANALYTICS.MART", catalog: "ANALYTICS", schema: "MART" },
  ]);
  assert.deepEqual(
    snapshot.tables.map((table) => ({
      id: table.id,
      namespace_id: table.namespace_id,
      name: table.name,
      columnNames: table.columns.map((column) => column.name),
      constraintKinds: table.constraints.map((constraint) => constraint.kind),
    })),
    [
      {
        id: "table:ANALYTICS.CORE.CUSTOMER",
        namespace_id: "namespace:ANALYTICS.CORE",
        name: "CUSTOMER",
        columnNames: ["CUSTOMER_ID", "EMAIL", "ACTIVE", "CREATED_AT"],
        constraintKinds: ["primary_key", "unique"],
      },
      {
        id: "table:ANALYTICS.MART.ORDER_HEADER",
        namespace_id: "namespace:ANALYTICS.MART",
        name: "ORDER_HEADER",
        columnNames: ["ORDER_ID", "CUSTOMER_ID", "ORDER_DATE", "ORDER_AMOUNT"],
        constraintKinds: ["foreign_key", "primary_key"],
      },
    ],
  );
  assert.deepEqual(snapshot.relationships, [
    {
      id: "relationship:ANALYTICS.MART.ORDER_HEADER.FK_ORDER_HEADER_CUSTOMER",
      name: "FK_ORDER_HEADER_CUSTOMER",
      source_table_id: "table:ANALYTICS.MART.ORDER_HEADER",
      source_column_ids: ["column:ANALYTICS.MART.ORDER_HEADER.CUSTOMER_ID"],
      target_table_id: "table:ANALYTICS.CORE.CUSTOMER",
      target_column_ids: ["column:ANALYTICS.CORE.CUSTOMER.CUSTOMER_ID"],
      cardinality: "many_to_one",
    },
  ]);
}

function reorderedCanonicalProject() {
  const project = supportedCanonicalProject();
  project.physical_model.namespaces.reverse();
  project.physical_model.tables.reverse();
  for (const table of project.physical_model.tables) {
    table.constraints.reverse();
  }
  project.diagram_layout.nodes = {
    "table:ANALYTICS.MART.ORDER_HEADER": { x: 999, y: 999 },
    "table:ANALYTICS.CORE.CUSTOMER": { x: -100, y: -100 },
  };
  return project;
}

function sqliteRegressionFixture() {
  return {
    database: DB.SQLITE,
    tables: [
      {
        id: "users",
        name: "users",
        comment: "",
        fields: [{ id: "user-id", name: "id", type: "INTEGER", primary: true }],
        indices: [],
        uniqueConstraints: [],
      },
    ],
    references: [],
  };
}

function minimalMySqlCreateTableAst() {
  return {
    type: "create",
    keyword: "table",
    table: [{ table: "users" }],
    create_definitions: [
      {
        resource: "column",
        column: { column: "id" },
        definition: { dataType: "INT", length: 11 },
        nullable: true,
        primary_key: true,
      },
      {
        resource: "column",
        column: { column: "email" },
        definition: { dataType: "VARCHAR", length: 320 },
        nullable: true,
        unique: true,
      },
    ],
    table_options: [],
  };
}

describe("SS-015 Terraform round-trip engineering", () => {
  it("imports deterministic Snowflake Terraform HCL into the canonical physical model", async () => {
    const { terraformHclToCanonicalProject } = await loadTerraformRoundTrip();

    const project = terraformHclToCanonicalProject(supportedTerraformModule, {
      name: "terraform-retail",
    });

    assert.deepEqual(project, supportedCanonicalProject());
    assertSupportedTerraformSemantics(project);
    assert.deepEqual(
      terraformHclToCanonicalProject(supportedTerraformModule, {
        name: "terraform-retail",
      }),
      project,
    );
    assertNoSecretMaterial(project);
  });

  it("imports a multi-file Terraform module representation with the same semantics as a single HCL file", async () => {
    const { terraformHclToCanonicalProject, terraformHclToDiagram } =
      await loadTerraformRoundTrip();

    const fromFiles = terraformHclToCanonicalProject(moduleFiles(), {
      name: "terraform-retail",
    });
    const diagram = terraformHclToDiagram(moduleFiles(), {
      title: "terraform-retail",
    });

    assert.deepEqual(fromFiles, supportedCanonicalProject());
    assertSupportedTerraformSemantics(fromFiles);
    assert.equal(diagram.database, DB.SNOWFLAKE);
    assert.equal(diagram.title, "terraform-retail");
    assert.deepEqual(
      diagram.tables.map((table) => table.id),
      [
        "table:ANALYTICS.CORE.CUSTOMER",
        "table:ANALYTICS.MART.ORDER_HEADER",
      ],
    );
    assert.deepEqual(
      diagram.relationships.map((relationship) => relationship.id),
      ["relationship:ANALYTICS.MART.ORDER_HEADER.FK_ORDER_HEADER_CUSTOMER"],
    );
    assert.equal(
      diagram.tables[0].fields.find((field) => field.name === "EMAIL").unique,
      true,
    );
    assert.equal(
      diagram.tables[1].fields.find((field) => field.name === "CUSTOMER_ID")
        .notNull,
      true,
    );
    assertNoSecretMaterial(diagram);
  });

  it("exports a canonical physical model to deterministic Terraform HCL through validation", async () => {
    const { canonicalProjectToTerraformHcl } = await loadTerraformRoundTrip();
    const project = supportedCanonicalProject();
    const commandCalls = [];

    const hcl = canonicalProjectToTerraformHcl(project, {
      commandRunner(...args) {
        commandCalls.push(args);
        throw new Error("Terraform CLI must not be invoked by export");
      },
    });

    assert.equal(hcl, expectedTerraformHcl);
    assert.equal(canonicalProjectToTerraformHcl(structuredClone(project)), hcl);
    assert.equal(canonicalProjectToTerraformHcl(reorderedCanonicalProject()), hcl);
    assert.deepEqual(commandCalls, []);
    assert.doesNotMatch(hcl, /diagram_layout|viewport|x\s*=|y\s*=/i);
    assertNoSecretMaterial(hcl);

    const invalid = structuredClone(project);
    invalid.physical_model.tables[0].columns[0].data_type = {
      family: "VARIANT",
      text: "VARIANT",
      precision: null,
      scale: null,
      length: null,
    };
    assert.throws(
      () => canonicalProjectToTerraformHcl(invalid),
      /unsupported type family VARIANT/i,
    );
  });

  it("round-trips supported Terraform semantics without changing canonical meaning", async () => {
    const { terraformHclToCanonicalProject, canonicalProjectToTerraformHcl } =
      await loadTerraformRoundTrip();

    const imported = terraformHclToCanonicalProject(supportedTerraformModule, {
      name: "terraform-retail",
    });
    const rendered = canonicalProjectToTerraformHcl(imported);
    const importedAgain = terraformHclToCanonicalProject(rendered, {
      name: "terraform-retail",
    });
    const diagram = canonicalProjectToDiagram(importedAgain);
    const savedAgain = diagramToCanonicalProject(diagram);

    assert.equal(rendered, expectedTerraformHcl);
    assertSupportedTerraformSemantics(imported);
    assertSupportedTerraformSemantics(importedAgain);
    assert.deepEqual(
      terraformSemanticSnapshot(importedAgain),
      terraformSemanticSnapshot(imported),
    );
    assert.deepEqual(importedAgain.physical_model, imported.physical_model);
    assert.deepEqual(savedAgain.physical_model, imported.physical_model);
    assert.equal(diagram.tables.length, 2);
    assert.equal(diagram.relationships.length, 1);
    assertNoSecretMaterial(importedAgain);
    assertNoSecretMaterial(savedAgain);
  });

  it("preserves Terraform default expression classification and escaped template text", async () => {
    const { terraformHclToCanonicalProject, canonicalProjectToTerraformHcl } =
      await loadTerraformRoundTrip();
    const hcl = `
resource "snowflake_database" "analytics" { name = "ANALYTICS" }
resource "snowflake_schema" "core" {
  database = snowflake_database.analytics.name
  name     = "CORE"
}
resource "snowflake_table" "default_cases" {
  database = snowflake_schema.core.database
  schema   = snowflake_schema.core.name
  name     = "DEFAULT_CASES"
  comment  = "literal $\${var.env} and %%{ if false } text"

  column {
    name = "CURRENT_DATE_COL"
    type = "DATE"
    default {
      expression = "CURRENT_DATE"
    }
  }

  column {
    name = "CALL_SHAPED_LITERAL"
    type = "VARCHAR(64)"
    default {
      constant = "ABC(1)"
    }
  }

  column {
    name = "NULL_COL"
    type = "VARCHAR(64)"
    default {
      expression = "NULL"
    }
  }
}
`;

    const imported = terraformHclToCanonicalProject(hcl);
    const rendered = canonicalProjectToTerraformHcl(imported);
    const importedAgain = terraformHclToCanonicalProject(rendered);

    assert.match(
      rendered,
      /CURRENT_DATE_COL[\s\S]*default \{\s*expression = "CURRENT_DATE"\s*\}/,
    );
    assert.match(
      rendered,
      /CALL_SHAPED_LITERAL[\s\S]*default \{\s*constant = "ABC\(1\)"\s*\}/,
    );
    assert.match(
      rendered,
      /NULL_COL[\s\S]*default \{\s*expression = "NULL"\s*\}/,
    );
    assert.match(rendered, /literal \$\$\{var\.env\} and %%\{ if false \} text/);
    assert.equal(
      importedAgain.physical_model.tables[0].comment,
      "literal ${var.env} and %{ if false } text",
    );
    assert.deepEqual(
      terraformSemanticSnapshot(importedAgain),
      terraformSemanticSnapshot(imported),
    );
  });

  it("fails closed for malformed HCL and non-HCL module input", async () => {
    const { terraformHclToCanonicalProject } = await loadTerraformRoundTrip();

    for (const [label, hcl, pattern] of [
      ["blank input", "   \n\t", /nonblank/i],
      [
        "unterminated block",
        'resource "snowflake_database" "analytics" { name = "ANALYTICS"',
        /malformed.*expected|unterminated/i,
      ],
      [
        "unterminated string",
        'resource "snowflake_database" "analytics" { name = "ANALYTICS }',
        /unterminated Terraform string/i,
      ],
      [
        "string interpolation",
        'resource "snowflake_database" "analytics" { name = "${var.database}" }',
        /unsupported Terraform string interpolation/i,
      ],
      [
        "template directive",
        'resource "snowflake_database" "analytics" { name = "%{ if true }ANALYTICS%{ endif }" }',
        /unsupported Terraform template directive/i,
      ],
      [
        "duplicate attribute",
        'resource "snowflake_database" "analytics" { name = "ANALYTICS" name = "ANALYTICS2" }',
        /duplicate Terraform attribute name/i,
      ],
      [
        "function expression",
        'resource "snowflake_database" "analytics" { name = upper("analytics") }',
        /unsupported Terraform token|malformed|expression/i,
      ],
    ]) {
      assert.throws(
        () => terraformHclToCanonicalProject(hcl, { name: label }),
        pattern,
        label,
      );
    }

    assert.throws(
      () =>
        terraformHclToCanonicalProject(
          [
            { path: "main.tf", contents: supportedTerraformModule },
            { path: "main.tf", contents: supportedTerraformModule },
          ],
          { name: "duplicate-files" },
        ),
      /duplicate Terraform file path main\.tf/i,
    );
    assert.throws(
      () =>
        terraformHclToCanonicalProject(
          [{ path: "variables.tf", contents: 'variable "database" {}' }],
          { name: "variables" },
        ),
      /unsupported Terraform block variable/i,
    );
    assert.throws(
      () => terraformHclToCanonicalProject({ contents: supportedTerraformModule }),
      /HCL text or an array of module files/i,
    );
  });

  it("rejects unsupported resources, unsupported expressions, and ambiguous references clearly", async () => {
    const { terraformHclToCanonicalProject } = await loadTerraformRoundTrip();

    for (const [label, hcl, pattern] of [
      [
        "unsupported resource",
        'resource "snowflake_view" "customer_v" { database = "ANALYTICS" schema = "CORE" name = "CUSTOMER_V" statement = "SELECT 1" }',
        /unsupported.*snowflake_view/i,
      ],
      [
        "unsupported data source",
        'data "snowflake_database" "analytics" { name = "ANALYTICS" }',
        /unsupported Terraform block data/i,
      ],
      [
        "unsupported module",
        'module "warehouse" { source = "./warehouse" }',
        /unsupported Terraform block module/i,
      ],
      [
        "unsupported type",
        'resource "snowflake_table" "events" { database = "ANALYTICS" schema = "CORE" name = "EVENTS" column { name = "PAYLOAD" type = "VARIANT" } }',
        /unsupported.*VARIANT/i,
      ],
      [
        "unsupported table option",
        'resource "snowflake_table" "clustered" { database = "ANALYTICS" schema = "CORE" name = "CLUSTERED" cluster_by = ["to_date(CREATED_AT)"] column { name = "ID" type = "NUMBER(38, 0)" } }',
        /unsupported.*cluster_by/i,
      ],
      [
        "unsupported meta argument",
        'resource "snowflake_table" "customer" { database = "ANALYTICS" schema = "CORE" name = "CUSTOMER" count = 2 column { name = "ID" type = "NUMBER(38, 0)" } }',
        /unsupported.*count/i,
      ],
      [
        "ambiguous variable",
        'resource "snowflake_table" "customer" { database = var.database schema = "CORE" name = "CUSTOMER" column { name = "ID" type = "NUMBER(38, 0)" } }',
        /ambiguous|unsupported.*var\.database|variable/i,
      ],
      [
        "boolean identifier literal",
        'resource "snowflake_database" "analytics" { name = true }',
        /snowflake_database\.name must be a literal string/i,
      ],
      [
        "numeric table id literal",
        'resource "snowflake_table" "customer" { database = "ANALYTICS" schema = "CORE" name = 1 column { name = "ID" type = "NUMBER(38, 0)" } }',
        /snowflake_table\.name must be a literal string/i,
      ],
      [
        "ambiguous schema/database mismatch",
        `
resource "snowflake_schema" "core" { database = "ANALYTICS" name = "CORE" }
resource "snowflake_schema" "mart" { database = "ANALYTICS" name = "MART" }
resource "snowflake_table" "customer" {
  database = snowflake_schema.mart.database
  schema   = snowflake_schema.core.name
  name     = "CUSTOMER"
  column { name = "ID" type = "NUMBER(38, 0)" }
}`,
        /ambiguous Terraform table namespace/i,
      ],
      [
        "ambiguous literal database/schema mismatch",
        `
resource "snowflake_database" "analytics" { name = "ANALYTICS" }
resource "snowflake_schema" "core" { database = snowflake_database.analytics.name name = "CORE" }
resource "snowflake_table" "customer" {
  database = "OTHER_DB"
  schema   = snowflake_schema.core.name
  name     = "CUSTOMER"
  column { name = "ID" type = "NUMBER(38, 0)" }
}`,
        /ambiguous Terraform table namespace/i,
      ],
      [
        "unresolved table reference",
        'resource "snowflake_table_constraint" "fk" { name = "FK_BAD" type = "FOREIGN KEY" table_id = snowflake_table.missing.fully_qualified_name columns = ["ID"] foreign_key_properties { references { table_id = snowflake_table.other.fully_qualified_name columns = ["ID"] } } }',
        /unresolved|unknown|reference/i,
      ],
      [
        "labeled default block",
        `
resource "snowflake_table" "customer" {
  database = "ANALYTICS"
  schema   = "CORE"
  name     = "CUSTOMER"
  column {
    name = "ID"
    type = "NUMBER(38, 0)"
    default "unsupported" { constant = "0" }
  }
}`,
        /Terraform default blocks must not have labels/i,
      ],
      [
        "unsupported foreign key property",
        `
resource "snowflake_table" "parent" {
  database = "ANALYTICS"
  schema   = "CORE"
  name     = "PARENT"
  column { name = "ID" type = "NUMBER(38, 0)" }
}
resource "snowflake_table" "child" {
  database = "ANALYTICS"
  schema   = "CORE"
  name     = "CHILD"
  column { name = "PARENT_ID" type = "NUMBER(38, 0)" }
}
resource "snowflake_table_constraint" "fk_child_parent" {
  name     = "FK_CHILD_PARENT"
  type     = "FOREIGN KEY"
  table_id = snowflake_table.child.fully_qualified_name
  columns  = ["PARENT_ID"]
  foreign_key_properties {
    match_type = "FULL"
    references {
      table_id = snowflake_table.parent.fully_qualified_name
      columns  = ["ID"]
    }
  }
}`,
        /unsupported Terraform foreign_key_properties attribute match_type/i,
      ],
    ]) {
      assert.throws(
        () => terraformHclToCanonicalProject(hcl, { name: label }),
        pattern,
        label,
      );
    }
  });

  it("resolves schema database references independent of Terraform file order", async () => {
    const { terraformHclToCanonicalProject } = await loadTerraformRoundTrip();
    const files = [
      {
        path: "20-dependent-schema.tf",
        contents:
          'resource "snowflake_schema" "mart" { database = snowflake_schema.core.database name = "MART" }',
      },
      {
        path: "10-core-schema.tf",
        contents:
          'resource "snowflake_schema" "core" { database = snowflake_database.analytics.name name = "CORE" }',
      },
      {
        path: "00-database.tf",
        contents:
          'resource "snowflake_database" "analytics" { name = "ANALYTICS" }',
      },
      {
        path: "30-table.tf",
        contents:
          'resource "snowflake_table" "orders" { database = snowflake_schema.mart.database schema = snowflake_schema.mart.name name = "ORDERS" column { name = "ID" type = "NUMBER(38, 0)" } }',
      },
    ];

    const project = terraformHclToCanonicalProject(files);

    assert.deepEqual(
      project.physical_model.namespaces.map((namespace) => namespace.id),
      ["namespace:ANALYTICS.CORE", "namespace:ANALYTICS.MART"],
    );
    assert.equal(project.physical_model.tables[0].namespace_id, "namespace:ANALYTICS.MART");
  });

  it("rejects Terraform state and credential-bearing provider data and never emits secrets", async () => {
    const { terraformHclToCanonicalProject, canonicalProjectToTerraformHcl } =
      await loadTerraformRoundTrip();

    assert.throws(
      () =>
        terraformHclToCanonicalProject(terraformStateFixture(), {
          name: "state",
        }),
      /Terraform state|tfstate|not project data/i,
    );
    assert.throws(
      () =>
        terraformHclToCanonicalProject(credentialBearingProviderFixture(), {
          name: "credentials",
        }),
      /credential|secret|provider|password|token|private/i,
    );

    assert.throws(
      () =>
        terraformHclToCanonicalProject(
          `
terraform {
  backend "s3" {
    bucket = "redacted-state-bucket"
    key    = "redacted.tfstate"
  }
}
`,
          { name: "backend" },
        ),
      /backend|state configuration|not imported/i,
    );
    assert.throws(
      () =>
        terraformHclToCanonicalProject(
          `
terraform {
  cloud {
    organization = "redacted"
    workspaces { name = "prod" }
  }
}
`,
          { name: "cloud" },
        ),
      /backend|cloud|state configuration|not imported/i,
    );

    const project = supportedCanonicalProject();
    project.backend = { token: "[REDACTED_STATE_OUTPUT]" };
    assert.throws(
      () => canonicalProjectToTerraformHcl(project),
      /backend|token|unexpected|forbidden|secret/i,
    );

    assertNoSecretMaterial(
      canonicalProjectToTerraformHcl(supportedCanonicalProject()),
    );
    assertNoSecretMaterial(JSON.stringify(supportedCanonicalProject()));
  });

  it("previews Terraform HCL for user review and does not invoke Terraform apply", async () => {
    const { canonicalProjectToTerraformHcl } = await loadTerraformRoundTrip();
    const source = fs.readFileSync(terraformRoundTripPath, "utf8");
    const controlPanelSource = fs.readFileSync(controlPanelPath, "utf8");
    const importModalSource = fs.readFileSync(importModalPath, "utf8");
    const importSourceSource = fs.readFileSync(importSourcePath, "utf8");
    const desktopBridgeSource = fs.readFileSync(desktopBridgePath, "utf8");
    const electronMainSource = fs.readFileSync(electronMainPath, "utf8");
    const commandCalls = [];

    const hcl = canonicalProjectToTerraformHcl(supportedCanonicalProject(), {
      commandRunner(command, args = []) {
        commandCalls.push([command, args]);
        return { status: 0, stdout: "", stderr: "" };
      },
    });

    assert.deepEqual(commandCalls, []);
    assert.doesNotMatch(hcl, /\bterraform\s+apply\b|\bapply\b/i);
    assert.match(controlPanelSource, /name:\s*"Snowflake Terraform"/);
    assert.match(controlPanelSource, /setImportSourceFormat\("terraform"\)/);
    assert.match(controlPanelSource, /name:\s*"Terraform HCL"/);
    assert.match(
      controlPanelSource,
      /openExportModal\(MODAL\.CODE\)[\s\S]*canonicalProjectToTerraformHcl\(project\)[\s\S]*extension:\s*"tf"/,
    );
    assert.match(importModalSource, /terraformHclToDiagram\(ast,\s*\{\s*title\s*\}\)/);
    assert.match(importModalSource, /setDatabase\(nextDatabase\)/);
    assert.match(importSourceSource, /language="hcl"/);
    assert.match(importSourceSource, /accept="\.tf"/);
    assert.doesNotMatch(
      [
        source,
        controlPanelSource,
        importModalSource,
        importSourceSource,
        desktopBridgeSource,
        electronMainSource,
      ].join("\n"),
      /\b(?:spawn|execFile|execFileSync|exec|execSync|apply)\s*\([^)]*terraform/i,
    );
  });

  it("preserves existing drawDB database providers and SQL import/export dispatch", () => {
    const mysqlDiagram = importSQL(
      minimalMySqlCreateTableAst(),
      DB.MYSQL,
      DB.GENERIC,
    );
    const sqliteDdl = exportSQL(sqliteRegressionFixture());

    assert.equal(mysqlDiagram.tables.length, 1);
    assert.equal(mysqlDiagram.tables[0].fields[0].primary, true);
    assert.match(sqliteDdl, /CREATE TABLE IF NOT EXISTS "users"/);
    assert.match(sqliteDdl, /PRIMARY KEY\("id"\)/);
  });
});
