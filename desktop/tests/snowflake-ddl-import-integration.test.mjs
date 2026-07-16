import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import { DB } from "../src/data/constants.js";
import { importSQL } from "../src/utils/importSQL/index.js";

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const controlPanelPath = path.join(
  repositoryRoot,
  "src",
  "components",
  "EditorHeader",
  "ControlPanel.jsx",
);
const importSourcePath = path.join(
  repositoryRoot,
  "src",
  "components",
  "EditorHeader",
  "Modal",
  "ImportSource.jsx",
);

const supportedSnowflakeDdl = `CREATE DATABASE IF NOT EXISTS ANALYTICS;
CREATE SCHEMA IF NOT EXISTS ANALYTICS.CORE;

CREATE TABLE ANALYTICS.CORE.CUSTOMER (
    CUSTOMER_ID NUMBER(38, 0) NOT NULL,
    EMAIL VARCHAR(320) NOT NULL COMMENT 'natural key',
    ACTIVE BOOLEAN NOT NULL DEFAULT TRUE,
    CREATED_AT TIMESTAMP_NTZ(9) NOT NULL DEFAULT CURRENT_TIMESTAMP(),
    CONSTRAINT PK_CUSTOMER PRIMARY KEY (CUSTOMER_ID) NOT ENFORCED,
    CONSTRAINT UQ_CUSTOMER_EMAIL UNIQUE (EMAIL) NOT ENFORCED
) COMMENT='customer dimension';

CREATE TABLE ANALYTICS.CORE.ORDER_HEADER (
    ORDER_ID NUMBER(38, 0) NOT NULL,
    CUSTOMER_ID NUMBER(38, 0) NOT NULL,
    ORDER_DATE DATE NOT NULL,
    ORDER_TOTAL NUMBER(12, 2) NOT NULL DEFAULT 0,
    CONSTRAINT PK_ORDER_HEADER PRIMARY KEY (ORDER_ID) NOT ENFORCED
);

ALTER TABLE ANALYTICS.CORE.ORDER_HEADER ADD CONSTRAINT FK_ORDER_HEADER_CUSTOMER FOREIGN KEY (CUSTOMER_ID) REFERENCES ANALYTICS.CORE.CUSTOMER (CUSTOMER_ID) NOT ENFORCED;
`;

function tableByName(diagram, name) {
  const table = diagram.tables.find((candidate) => candidate.name === name);
  assert.ok(table, `expected table ${name}`);
  return table;
}

function fieldByName(table, name) {
  const field = table.fields.find((candidate) => candidate.name === name);
  assert.ok(field, `expected field ${table.name}.${name}`);
  return field;
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

describe("SS-008 Snowflake DDL import integration", () => {
  it("exposes Snowflake through drawDB's normal SQL import source workflow", () => {
    const controlPanel = fs.readFileSync(controlPanelPath, "utf8");
    const importSource = fs.readFileSync(importSourcePath, "utf8");
    const sourceImportSection = controlPanel.slice(
      controlPanel.indexOf("import_from_source"),
      controlPanel.indexOf("export_source"),
    );

    for (const database of [
      "DB.MYSQL",
      "DB.POSTGRES",
      "DB.SQLITE",
      "DB.MARIADB",
      "DB.MSSQL",
      "DB.ORACLESQL",
    ]) {
      assert.match(
        sourceImportSection,
        new RegExp(`setImportDb\\(${database}\\)`),
        `${database} must remain selectable from generic SQL import`,
      );
    }

    assert.match(sourceImportSection, /setImportDb\(DB\.SNOWFLAKE\)/);
    assert.match(sourceImportSection, /name:\s*"Snowflake"/);
    assert.match(importSource, /language="sql"/);
    assert.match(importSource, /accept="\.sql"/);
  });

  it("preserves existing database targets while adding Snowflake dispatch", () => {
    const mysqlDiagram = importSQL(
      minimalMySqlCreateTableAst(),
      DB.MYSQL,
      DB.GENERIC,
    );

    assert.equal(mysqlDiagram.tables.length, 1);
    const users = tableByName(mysqlDiagram, "users");
    assert.equal(users.fields.length, 2);
    assert.equal(fieldByName(users, "id").primary, true);
    assert.equal(fieldByName(users, "email").unique, true);
    assert.deepEqual(mysqlDiagram.relationships, []);
  });

  it("maps supported Snowflake DDL into the editable drawDB diagram model", () => {
    const diagram = importSQL(supportedSnowflakeDdl, DB.SNOWFLAKE, DB.SNOWFLAKE);

    assert.equal(diagram.database, DB.SNOWFLAKE);
    assert.equal(diagram.tables.length, 2);
    assert.equal(diagram.relationships.length, 1);

    const customer = tableByName(diagram, "CUSTOMER");
    assert.deepEqual(customer.namespace, {
      id: "namespace:ANALYTICS.CORE",
      catalog: "ANALYTICS",
      schema: "CORE",
    });
    assert.equal(customer.comment, "customer dimension");
    assert.equal(fieldByName(customer, "CUSTOMER_ID").type, "NUMBER");
    assert.equal(fieldByName(customer, "CUSTOMER_ID").size, "38,0");
    assert.equal(fieldByName(customer, "CUSTOMER_ID").primary, true);
    assert.equal(fieldByName(customer, "CUSTOMER_ID").notNull, true);
    assert.equal(fieldByName(customer, "EMAIL").type, "VARCHAR");
    assert.equal(fieldByName(customer, "EMAIL").size, 320);
    assert.equal(fieldByName(customer, "EMAIL").comment, "natural key");
    assert.equal(fieldByName(customer, "EMAIL").unique, true);
    assert.equal(fieldByName(customer, "ACTIVE").default, "TRUE");
    assert.equal(
      fieldByName(customer, "CREATED_AT").default,
      "CURRENT_TIMESTAMP()",
    );

    const orderHeader = tableByName(diagram, "ORDER_HEADER");
    assert.equal(fieldByName(orderHeader, "ORDER_DATE").type, "DATE");
    assert.equal(fieldByName(orderHeader, "ORDER_TOTAL").type, "NUMBER");
    assert.equal(fieldByName(orderHeader, "ORDER_TOTAL").size, "12,2");
    assert.equal(fieldByName(orderHeader, "ORDER_TOTAL").default, "0");

    const relationship = diagram.relationships[0];
    assert.equal(relationship.name, "FK_ORDER_HEADER_CUSTOMER");
    assert.equal(relationship.startTableId, orderHeader.id);
    assert.equal(relationship.endTableId, customer.id);
    assert.equal(
      relationship.startFieldId,
      fieldByName(orderHeader, "CUSTOMER_ID").id,
    );
    assert.equal(
      relationship.endFieldId,
      fieldByName(customer, "CUSTOMER_ID").id,
    );
    assert.deepEqual(relationship.fields, [
      {
        startFieldId: fieldByName(orderHeader, "CUSTOMER_ID").id,
        endFieldId: fieldByName(customer, "CUSTOMER_ID").id,
      },
    ]);
    assert.equal(relationship.cardinality, "many_to_one");

    for (const table of diagram.tables) {
      assert.equal(typeof table.x, "number");
      assert.equal(typeof table.y, "number");
      assert.ok(Array.isArray(table.indices));
      assert.ok(Array.isArray(table.uniqueConstraints));
    }
  });

  it("reports unsupported or malformed Snowflake DDL without crashing", () => {
    for (const ddl of [
      'CREATE TABLE ANALYTICS.CORE."Customer" (ID NUMBER(38, 0));',
      "CREATE TABLE ANALYTICS.CORE.EVENT_LOG (ID VARIANT);",
      "ALTER TABLE ANALYTICS.CORE.ORDER_HEADER ADD CONSTRAINT FK_BROKEN FOREIGN KEY (CUSTOMER_ID) REFERENCES ANALYTICS.CORE.MISSING (ID) NOT ENFORCED;",
      "CREATE TABLE ANALYTICS.CORE.MALFORMED (ID NUMBER(38, 0)",
    ]) {
      assert.throws(
        () => importSQL(ddl, DB.SNOWFLAKE, DB.SNOWFLAKE),
        (error) => {
          assert.ok(error instanceof Error);
          assert.match(error.message, /Snowflake|unsupported|malformed|unknown|unterminated/i);
          assert.doesNotMatch(error.message, /TypeError|undefined is not|Cannot read/i);
          return true;
        },
      );
    }
  });
});
