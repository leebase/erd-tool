import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

import { DB } from "../src/data/constants.js";
import { snowflakeTypes } from "../src/data/datatypes.js";
import { exportSQL } from "../src/utils/exportSQL/index.js";
import {
  parseSnowflakeDDLToCanonicalProject,
  parseSnowflakeDDLToDiagram,
  renderCanonicalSnowflakeDDL,
} from "../src/erdTool/projectAdapter.js";

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const desktopBridgePath = path.join(
  repositoryRoot,
  "src",
  "erdTool",
  "desktopBridge.js",
);
const controlPanelPath = path.join(
  repositoryRoot,
  "src",
  "components",
  "EditorHeader",
  "ControlPanel.jsx",
);
const exportModalPath = path.join(
  repositoryRoot,
  "src",
  "components",
  "EditorHeader",
  "Modal",
  "Modal.jsx",
);

// Static model fixture: using JSON text ensures each test gets an independent,
// serializable diagram equivalent to one loaded from an offline project file.
const snowflakeDiagramFixtureJson = JSON.stringify({
  database: DB.SNOWFLAKE,
  title: "retail export",
  tables: [
    {
      id: "product-table",
      name: "product catalog",
      x: 40,
      y: 80,
      comment: "Products sold by Lee's shop",
      namespace: {
        id: "fixture-namespace",
        catalog: "analytics",
        schema: "retail-data",
      },
      fields: [
        {
          id: "product-id",
          name: "2sku",
          type: "VARCHAR",
          size: 64,
          default: "",
          check: "",
          primary: true,
          unique: false,
          notNull: true,
          increment: false,
          comment: "",
        },
        {
          id: "product-created",
          name: "created at",
          type: "TIMESTAMP_NTZ",
          size: 9,
          default: "CURRENT_TIMESTAMP()",
          check: "",
          primary: false,
          unique: false,
          notNull: true,
          increment: false,
          comment: "",
        },
        {
          id: "product-active",
          name: "active?",
          type: "BOOLEAN",
          default: "TRUE",
          check: "",
          primary: false,
          unique: false,
          notNull: true,
          increment: false,
          comment: "",
        },
        {
          id: "product-image",
          name: "image hash",
          type: "BINARY",
          size: 16,
          default: "",
          check: "",
          primary: false,
          unique: true,
          notNull: false,
          increment: false,
          comment: "",
        },
      ],
      indices: [],
      uniqueConstraints: [],
    },
    {
      id: "order-table",
      name: "order-items",
      x: 360,
      y: 80,
      comment: "",
      namespace: {
        id: "fixture-namespace",
        catalog: "analytics",
        schema: "retail-data",
      },
      fields: [
        {
          id: "order-id",
          name: "order$id",
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
          id: "order-product-id",
          name: "product sku",
          type: "VARCHAR",
          size: 64,
          default: "",
          check: "",
          primary: false,
          unique: false,
          notNull: true,
          increment: false,
          comment: "",
        },
        {
          id: "order-amount",
          name: "amount $",
          type: "NUMBER",
          size: "12,2",
          default: "0",
          check: "",
          primary: false,
          unique: false,
          notNull: true,
          increment: false,
          comment: "",
        },
        {
          id: "order-date",
          name: "sold on",
          type: "DATE",
          default: "",
          check: "",
          primary: false,
          unique: false,
          notNull: false,
          increment: false,
          comment: "",
        },
        {
          id: "order-ratio",
          name: "tax ratio",
          type: "FLOAT",
          default: "",
          check: "",
          primary: false,
          unique: false,
          notNull: false,
          increment: false,
          comment: "",
        },
      ],
      indices: [],
      uniqueConstraints: [],
    },
  ],
  relationships: [
    {
      id: "order-product-relationship",
      name: "fk order product",
      startTableId: "order-table",
      startFieldId: "order-product-id",
      endTableId: "product-table",
      endFieldId: "product-id",
      fields: [
        {
          startFieldId: "order-product-id",
          endFieldId: "product-id",
        },
      ],
      cardinality: "many_to_one",
      updateConstraint: "No action",
      deleteConstraint: "No action",
    },
  ],
  types: [],
  enums: [],
  transform: { pan: { x: 0, y: 0 }, zoom: 1 },
});

const expectedSnowflakeDdl = `CREATE DATABASE IF NOT EXISTS ANALYTICS;
CREATE SCHEMA IF NOT EXISTS ANALYTICS.RETAIL_DATA;

CREATE TABLE ANALYTICS.RETAIL_DATA.ORDER_ITEMS (
    ORDER$ID NUMBER(38, 0) NOT NULL,
    PRODUCT_SKU VARCHAR(64) NOT NULL,
    AMOUNT_$ NUMBER(12, 2) NOT NULL DEFAULT 0,
    SOLD_ON DATE,
    TAX_RATIO FLOAT,
    CONSTRAINT PK_ORDER_ITEMS PRIMARY KEY (ORDER$ID) NOT ENFORCED
);

CREATE TABLE ANALYTICS.RETAIL_DATA.PRODUCT_CATALOG (
    _2SKU VARCHAR(64) NOT NULL,
    CREATED_AT TIMESTAMP_NTZ(9) NOT NULL DEFAULT CURRENT_TIMESTAMP(),
    ACTIVE_ BOOLEAN NOT NULL DEFAULT TRUE,
    IMAGE_HASH BINARY(16),
    CONSTRAINT PK_PRODUCT_CATALOG PRIMARY KEY (_2SKU) NOT ENFORCED,
    CONSTRAINT UQ_PRODUCT_CATALOG_IMAGE_HASH UNIQUE (IMAGE_HASH) NOT ENFORCED
) COMMENT='Products sold by Lee''s shop';

ALTER TABLE ANALYTICS.RETAIL_DATA.ORDER_ITEMS ADD CONSTRAINT FK_ORDER_PRODUCT FOREIGN KEY (PRODUCT_SKU) REFERENCES ANALYTICS.RETAIL_DATA.PRODUCT_CATALOG (_2SKU) NOT ENFORCED;
`;

function snowflakeDiagramFixture() {
  return JSON.parse(snowflakeDiagramFixtureJson);
}

function sqliteRegressionFixture() {
  return {
    database: DB.SQLITE,
    tables: [
      {
        id: "users",
        name: "users",
        comment: "",
        fields: [
          {
            id: "user-id",
            name: "id",
            type: "INTEGER",
            default: "",
            check: "",
            primary: true,
            unique: false,
            notNull: true,
            comment: "",
          },
        ],
        indices: [],
        uniqueConstraints: [],
      },
    ],
    references: [],
  };
}

function snowflakeDefaultLiteralFixture() {
  const fields = [
    ["numeric integer", "NUMBER", "42", "38,0"],
    ["numeric decimal", "NUMBER", "-3.50", "12,2"],
    ["numeric exponent", "FLOAT", "1.25e-3"],
    ["boolean true", "BOOLEAN", "TRUE"],
    ["boolean false", "BOOLEAN", "false"],
    ["keyword null", "VARCHAR", "NULL", 64],
    ["keyword current date", "DATE", "CURRENT_DATE"],
    ["function timestamp", "TIMESTAMP_NTZ", "CURRENT_TIMESTAMP()", 9],
    ["function uuid", "VARCHAR", "UUID_STRING()", 64],
    ["function to date", "DATE", "TO_DATE('2026-07-15')"],
    ["function spaced timestamp", "TIMESTAMP_NTZ", "  current_timestamp( )  ", 9],
    [
      "function nested dateadd",
      "TIMESTAMP_NTZ",
      "DATEADD('day', 1, CURRENT_TIMESTAMP())",
      9,
    ],
    ["ordinary string", "VARCHAR", "O'Reilly", 64],
    ["date string", "DATE", "2026-07-15"],
    ["timestamp string", "TIMESTAMP_NTZ", "2026-07-15 10:30:00", 9],
    ["ambiguous function", "VARCHAR", "CURRENT_TIMESTAMPED()", 64],
    ["function trailing token", "VARCHAR", "CURRENT_TIMESTAMP() + 1", 64],
    ["function extra close", "VARCHAR", "UUID_STRING())", 64],
    ["function cast suffix", "VARCHAR", "TO_DATE('2026-07-15')::DATE", 64],
    ["function malformed call", "VARCHAR", "TO_DATE('2026-07-15'", 64],
    ["ambiguous boolean", "VARCHAR", "TRUE STORY", 64],
    ["ambiguous number", "VARCHAR", "1.2.3", 64],
  ].map(([name, type, defaultValue, size], index) => ({
    id: `default-${index}`,
    name,
    type,
    size,
    default: defaultValue,
    check: "",
    primary: index === 0,
    unique: false,
    notNull: index === 0,
    increment: false,
    comment: "",
  }));

  return {
    database: DB.SNOWFLAKE,
    title: "default literal cases",
    tables: [
      {
        id: "default-table",
        name: "default cases",
        x: 0,
        y: 0,
        comment: "",
        namespace: {
          id: "default-namespace",
          catalog: "analytics",
          schema: "defaults",
        },
        fields,
        indices: [],
        uniqueConstraints: [],
      },
    ],
    relationships: [],
    types: [],
    enums: [],
    transform: { pan: { x: 0, y: 0 }, zoom: 1 },
  };
}

describe("SS-005 Snowflake DDL export", () => {
  it("uses drawDB's single-value size editor for timestamp precision", () => {
    assert.equal(snowflakeTypes.NUMBER.hasPrecision, true);
    assert.equal(snowflakeTypes.NUMBER.isSized, false);
    assert.equal(snowflakeTypes.TIMESTAMP_NTZ.hasPrecision, false);
    assert.equal(snowflakeTypes.TIMESTAMP_NTZ.isSized, true);
    assert.equal(snowflakeTypes.TIMESTAMP_NTZ.defaultSize, 9);
  });

  it("renders deterministic fixture-backed Snowflake DDL through drawDB's export selection", () => {
    const diagram = snowflakeDiagramFixture();

    assert.equal(exportSQL(diagram), expectedSnowflakeDdl);
    assert.equal(exportSQL(diagram), exportSQL(snowflakeDiagramFixture()));
    assert.equal(expectedSnowflakeDdl.includes("RELY"), false);
  });

  it("serializes Snowflake default literals without misquoting expressions or unquoting strings", () => {
    const ddl = exportSQL(snowflakeDefaultLiteralFixture());

    assert.match(ddl, /NUMERIC_INTEGER NUMBER\(38, 0\) NOT NULL DEFAULT 42,/);
    assert.match(ddl, /NUMERIC_DECIMAL NUMBER\(12, 2\) DEFAULT -3\.50,/);
    assert.match(ddl, /NUMERIC_EXPONENT FLOAT DEFAULT 1\.25e-3,/);
    assert.match(ddl, /BOOLEAN_TRUE BOOLEAN DEFAULT TRUE,/);
    assert.match(ddl, /BOOLEAN_FALSE BOOLEAN DEFAULT false,/);
    assert.match(ddl, /KEYWORD_NULL VARCHAR\(64\) DEFAULT NULL,/);
    assert.match(ddl, /KEYWORD_CURRENT_DATE DATE DEFAULT CURRENT_DATE,/);
    assert.match(
      ddl,
      /FUNCTION_TIMESTAMP TIMESTAMP_NTZ\(9\) DEFAULT CURRENT_TIMESTAMP\(\),/,
    );
    assert.match(ddl, /FUNCTION_UUID VARCHAR\(64\) DEFAULT UUID_STRING\(\),/);
    assert.match(
      ddl,
      /FUNCTION_TO_DATE DATE DEFAULT TO_DATE\('2026-07-15'\),/,
    );
    assert.match(
      ddl,
      /FUNCTION_SPACED_TIMESTAMP TIMESTAMP_NTZ\(9\) DEFAULT current_timestamp\( \),/,
    );
    assert.match(
      ddl,
      /FUNCTION_NESTED_DATEADD TIMESTAMP_NTZ\(9\) DEFAULT DATEADD\('day', 1, CURRENT_TIMESTAMP\(\)\),/,
    );
    assert.match(ddl, /ORDINARY_STRING VARCHAR\(64\) DEFAULT 'O''Reilly',/);
    assert.match(ddl, /DATE_STRING DATE DEFAULT '2026-07-15',/);
    assert.match(
      ddl,
      /TIMESTAMP_STRING TIMESTAMP_NTZ\(9\) DEFAULT '2026-07-15 10:30:00',/,
    );
    assert.match(
      ddl,
      /AMBIGUOUS_FUNCTION VARCHAR\(64\) DEFAULT 'CURRENT_TIMESTAMPED\(\)',/,
    );
    assert.match(
      ddl,
      /FUNCTION_TRAILING_TOKEN VARCHAR\(64\) DEFAULT 'CURRENT_TIMESTAMP\(\) \+ 1',/,
    );
    assert.match(
      ddl,
      /FUNCTION_EXTRA_CLOSE VARCHAR\(64\) DEFAULT 'UUID_STRING\(\)\)',/,
    );
    assert.match(
      ddl,
      /FUNCTION_CAST_SUFFIX VARCHAR\(64\) DEFAULT 'TO_DATE\(''2026-07-15''\)::DATE',/,
    );
    assert.match(
      ddl,
      /FUNCTION_MALFORMED_CALL VARCHAR\(64\) DEFAULT 'TO_DATE\(''2026-07-15''',/,
    );
    assert.match(ddl, /AMBIGUOUS_BOOLEAN VARCHAR\(64\) DEFAULT 'TRUE STORY',/);
    assert.match(ddl, /AMBIGUOUS_NUMBER VARCHAR\(64\) DEFAULT '1\.2\.3',/);
    assert.equal(ddl, exportSQL(snowflakeDefaultLiteralFixture()));
  });

  it("rejects identifiers and data types outside the existing Snowflake model", () => {
    const tooLongIdentifier = snowflakeDiagramFixture();
    tooLongIdentifier.tables[0].name = "x".repeat(256);
    assert.throws(
      () => exportSQL(tooLongIdentifier),
      /identifier|255|length/i,
    );

    const unsupportedType = snowflakeDiagramFixture();
    unsupportedType.tables[0].fields[0].type = "GEOGRAPHY";
    assert.throws(
      () => exportSQL(unsupportedType),
      /unsupported.*(?:field )?type.*GEOGRAPHY/i,
    );
  });

  it("preserves an existing database target in the shared export dispatcher", () => {
    const ddl = exportSQL(sqliteRegressionFixture());

    assert.match(ddl, /CREATE TABLE IF NOT EXISTS "users"/);
    assert.match(ddl, /"id" INTEGER NOT NULL/);
    assert.match(ddl, /PRIMARY KEY\("id"\)/);
  });

  it("imports generated Snowflake DDL into the canonical model and renders it deterministically", () => {
    const imported = parseSnowflakeDDLToCanonicalProject(expectedSnowflakeDdl, {
      name: "retail-import",
    });

    assert.equal(imported.project_version, "1");
    assert.equal(imported.physical_model.name, "retail-import");
    assert.deepEqual(
      imported.physical_model.namespaces.map((namespace) => namespace.id),
      ["namespace:ANALYTICS.RETAIL_DATA"],
    );
    assert.deepEqual(
      imported.physical_model.tables.map((table) => table.id),
      [
        "table:ANALYTICS.RETAIL_DATA.ORDER_ITEMS",
        "table:ANALYTICS.RETAIL_DATA.PRODUCT_CATALOG",
      ],
    );
    assert.equal(imported.physical_model.relationships.length, 1);
    assert.equal(
      imported.physical_model.tables[1].comment,
      "Products sold by Lee's shop",
    );
    assert.equal(renderCanonicalSnowflakeDDL(imported), expectedSnowflakeDdl);
    assert.equal(
      renderCanonicalSnowflakeDDL(imported),
      renderCanonicalSnowflakeDDL(
        parseSnowflakeDDLToCanonicalProject(renderCanonicalSnowflakeDDL(imported)),
      ),
    );
  });

  it("converts imported Snowflake DDL to an editable drawDB diagram without credentials", () => {
    const diagram = parseSnowflakeDDLToDiagram(expectedSnowflakeDdl, {
      name: "retail-import",
    });

    assert.equal(diagram.database, DB.SNOWFLAKE);
    assert.equal(diagram.title, "retail-import");
    assert.equal(diagram.tables.length, 2);
    assert.equal(diagram.relationships.length, 1);
    assert.equal(diagram.tables[0].namespace.catalog, "ANALYTICS");
    assert.equal(diagram.tables[0].fields[0].type, "NUMBER");
    assert.equal(diagram.tables[0].fields[0].size, "38,0");
    assert.equal(diagram.tables[1].fields[1].default, "CURRENT_TIMESTAMP()");
    assert.deepEqual(Object.keys(diagram).sort(), [
      "areas",
      "database",
      "enums",
      "notes",
      "relationships",
      "tables",
      "title",
      "transform",
      "types",
    ]);
    assert.equal(JSON.stringify(diagram).includes("password"), false);
    assert.equal(exportSQL(diagram), expectedSnowflakeDdl);
  });

  it("fails loudly for Snowflake DDL outside the supported core import contract", () => {
    assert.throws(
      () =>
        parseSnowflakeDDLToCanonicalProject(
          "CREATE TABLE ANALYTICS.CORE.EVENTS (PAYLOAD VARIANT);",
        ),
      /unsupported type family VARIANT/i,
    );
    assert.throws(
      () =>
        parseSnowflakeDDLToCanonicalProject(
          "CREATE TABLE ANALYTICS.CORE.EVENTS (ID NUMBER(38, 0), CONSTRAINT PK_EVENTS PRIMARY KEY (ID) RELY);",
        ),
      /RELY/i,
    );
    assert.throws(
      () =>
        parseSnowflakeDDLToCanonicalProject(
          'CREATE TABLE ANALYTICS.CORE."Events" (ID NUMBER(38, 0));',
        ),
      /quoted identifiers/i,
    );
  });

  it("passes generated Snowflake DDL to the narrow native .sql export bridge", async () => {
    const calls = [];
    const previousWindow = globalThis.window;
    globalThis.window = {
      drawdbDesktop: {
        ddlExport: {
          save: async (request) => {
            calls.push(request);
            return { canceled: false, filePath: "/tmp/RETAIL_EXPORT.sql" };
          },
        },
      },
    };

    try {
      const bridge = await import(
        `${pathToFileURL(desktopBridgePath)}?ss005-native-export`
      );
      assert.equal(typeof bridge.exportDesktopSnowflakeDDL, "function");
      assert.equal(bridge.hasDesktopDdlExport(), true);

      const result = await bridge.exportDesktopSnowflakeDDL(
        snowflakeDiagramFixture(),
      );

      assert.deepEqual(result, {
        canceled: false,
        filePath: "/tmp/RETAIL_EXPORT.sql",
      });
      assert.deepEqual(calls, [
        {
          contents: expectedSnowflakeDdl,
          suggestedName: "RETAIL_EXPORT.sql",
        },
      ]);

      await bridge.exportDesktopSnowflakeDDL(
        snowflakeDiagramFixture(),
        expectedSnowflakeDdl,
        "reviewed-retail-export",
      );
      assert.deepEqual(calls.at(-1), {
        contents: expectedSnowflakeDdl,
        suggestedName: "REVIEWED_RETAIL_EXPORT.sql",
      });
    } finally {
      if (previousWindow === undefined) delete globalThis.window;
      else globalThis.window = previousWindow;
    }
  });

  it("does not advertise a malformed native DDL bridge", async () => {
    const previousWindow = globalThis.window;
    globalThis.window = { drawdbDesktop: { ddlExport: { save: true } } };

    try {
      const bridge = await import(
        `${pathToFileURL(desktopBridgePath)}?ss005-malformed-native-export`
      );
      assert.equal(bridge.hasDesktopDdlExport(), false);
      await assert.rejects(
        bridge.exportDesktopSnowflakeDDL(snowflakeDiagramFixture()),
        /unavailable/i,
      );
    } finally {
      if (previousWindow === undefined) delete globalThis.window;
      else globalThis.window = previousWindow;
    }
  });

  it("keeps native Snowflake export behind drawDB's existing code preview UI", () => {
    const controlPanel = fs.readFileSync(controlPanelPath, "utf8");
    const exportModal = fs.readFileSync(exportModalPath, "utf8");
    const snowflakeExportBranch = controlPanel.slice(
      controlPanel.indexOf("if (database === DB.SNOWFLAKE)"),
      controlPanel.indexOf("openExportModal(MODAL.CODE);", controlPanel.indexOf("if (database === DB.SNOWFLAKE)")) +
        1_000,
    );

    assert.match(snowflakeExportBranch, /openExportModal\(MODAL\.CODE\)/);
    assert.match(
      snowflakeExportBranch,
      /nativeDdl:\s*hasDesktopDdlExport\(\)/,
    );
    assert.match(
      exportModal,
      /case MODAL\.CODE:[\s\S]*exportData\.nativeDdl[\s\S]*await onNativeDdlExport\(exportData\)/,
    );
  });
});
