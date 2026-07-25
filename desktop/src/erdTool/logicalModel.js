import { dbToTypes } from "../data/datatypes.js";
import { Cardinality, DB, defaultBlue } from "../data/constants.js";

const MAX_TABLES = 200;
const MAX_COLUMNS_PER_TABLE = 300;
const MAX_RELATIONSHIPS = 500;
const SAFE_NAME = /^[A-Za-z_][A-Za-z0-9_$]*$/;
const SNOWFLAKE_NAME = /^[A-Z_][A-Z0-9_$]*$/;
const CARDINALITIES = new Set(Object.values(Cardinality));
const ROOT_KEYS = ["summary", "tables", "relationships"];
const TABLE_KEYS = ["key", "name", "comment", "columns"];
const COLUMN_KEYS = [
  "key",
  "name",
  "type",
  "nullable",
  "primary",
  "unique",
  "default",
  "comment",
];
const RELATIONSHIP_KEYS = [
  "key",
  "name",
  "sourceTableKey",
  "sourceColumnKeys",
  "targetTableKey",
  "targetColumnKeys",
  "cardinality",
];

function fail(message) {
  throw new Error(`[LLM_INVALID_PROPOSAL] ${message}`);
}

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function exactKeys(value, expected, label) {
  if (!isRecord(value)) fail(`${label} must be an object`);
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (
    actual.length !== wanted.length ||
    actual.some((key, index) => key !== wanted[index])
  ) {
    fail(`${label} has unexpected or missing fields`);
  }
}

function stringValue(value, label, { empty = false, max = 500 } = {}) {
  if (typeof value !== "string") fail(`${label} must be a string`);
  const normalized = value.trim();
  if (!empty && !normalized) fail(`${label} must not be blank`);
  if (normalized.length > max) fail(`${label} is too long`);
  return normalized;
}

function keyValue(value, label) {
  const key = stringValue(value, label, { max: 300 });
  if (
    [...key].some((character) => {
      const code = character.charCodeAt(0);
      return code <= 31 || code === 127;
    })
  ) {
    fail(`${label} contains control characters`);
  }
  return key;
}

function nameValue(value, label, database) {
  const name = stringValue(value, label, { max: 255 });
  const pattern = database === DB.SNOWFLAKE ? SNOWFLAKE_NAME : SAFE_NAME;
  if (!pattern.test(name)) {
    fail(
      database === DB.SNOWFLAKE
        ? `${label} must be a legal uppercase Snowflake identifier`
        : `${label} must be a legal unquoted database identifier`,
    );
  }
  return name;
}

function booleanValue(value, label) {
  if (typeof value !== "boolean") fail(`${label} must be a boolean`);
  return value;
}

function supportedType(value, database, label) {
  const text = stringValue(value, label, { max: 120 }).toUpperCase();
  const match = /^([A-Z][A-Z0-9_]*)(?:\(\s*([0-9]+(?:\s*,\s*[0-9]+)?)\s*\))?$/.exec(
    text,
  );
  if (!match) fail(`${label} is not a supported type expression`);
  const family = match[1];
  if (!dbToTypes[database]?.[family]) {
    fail(`${label} uses unsupported ${database} type ${family}`);
  }
  return match[2]
    ? `${family}(${match[2].replace(/\s+/g, "")})`
    : family;
}

function unique(values, label) {
  const seen = new Set();
  for (const value of values) {
    if (seen.has(value)) fail(`${label} contains duplicate ${value}`);
    seen.add(value);
  }
}

function validateColumn(column, database, tableIndex, columnIndex) {
  const label = `tables[${tableIndex}].columns[${columnIndex}]`;
  exactKeys(column, COLUMN_KEYS, label);
  return {
    key: keyValue(column.key, `${label}.key`),
    name: nameValue(column.name, `${label}.name`, database),
    type: supportedType(column.type, database, `${label}.type`),
    nullable: booleanValue(column.nullable, `${label}.nullable`),
    primary: booleanValue(column.primary, `${label}.primary`),
    unique: booleanValue(column.unique, `${label}.unique`),
    default: stringValue(column.default, `${label}.default`, {
      empty: true,
      max: 1000,
    }),
    comment: stringValue(column.comment, `${label}.comment`, {
      empty: true,
      max: 4000,
    }),
  };
}

function validateTable(table, database, index) {
  const label = `tables[${index}]`;
  exactKeys(table, TABLE_KEYS, label);
  if (!Array.isArray(table.columns) || table.columns.length === 0) {
    fail(`${label}.columns must contain at least one column`);
  }
  if (table.columns.length > MAX_COLUMNS_PER_TABLE) {
    fail(`${label}.columns exceeds the ${MAX_COLUMNS_PER_TABLE} column limit`);
  }
  const columns = table.columns.map((column, columnIndex) =>
    validateColumn(column, database, index, columnIndex),
  );
  unique(
    columns.map((column) => column.key),
    `${label}.columns keys`,
  );
  unique(
    columns.map((column) => column.name.toUpperCase()),
    `${label}.columns names`,
  );
  return {
    key: keyValue(table.key, `${label}.key`),
    name: nameValue(table.name, `${label}.name`, database),
    comment: stringValue(table.comment, `${label}.comment`, {
      empty: true,
      max: 4000,
    }),
    columns,
  };
}

function validateRelationship(relationship, database, index) {
  const label = `relationships[${index}]`;
  exactKeys(relationship, RELATIONSHIP_KEYS, label);
  if (
    !Array.isArray(relationship.sourceColumnKeys) ||
    !Array.isArray(relationship.targetColumnKeys) ||
    relationship.sourceColumnKeys.length === 0 ||
    relationship.sourceColumnKeys.length !==
      relationship.targetColumnKeys.length
  ) {
    fail(`${label} must map equally sized non-empty column arrays`);
  }
  const cardinality = stringValue(
    relationship.cardinality,
    `${label}.cardinality`,
    { max: 30 },
  );
  if (!CARDINALITIES.has(cardinality)) {
    fail(`${label}.cardinality is unsupported`);
  }
  const normalized = {
    key: keyValue(relationship.key, `${label}.key`),
    name: nameValue(relationship.name, `${label}.name`, database),
    sourceTableKey: keyValue(
      relationship.sourceTableKey,
      `${label}.sourceTableKey`,
    ),
    sourceColumnKeys: relationship.sourceColumnKeys.map((value, columnIndex) =>
      keyValue(value, `${label}.sourceColumnKeys[${columnIndex}]`),
    ),
    targetTableKey: keyValue(
      relationship.targetTableKey,
      `${label}.targetTableKey`,
    ),
    targetColumnKeys: relationship.targetColumnKeys.map((value, columnIndex) =>
      keyValue(value, `${label}.targetColumnKeys[${columnIndex}]`),
    ),
    cardinality,
  };
  unique(normalized.sourceColumnKeys, `${label}.sourceColumnKeys`);
  unique(normalized.targetColumnKeys, `${label}.targetColumnKeys`);
  return normalized;
}

export function validateLogicalModel(value, database = DB.SNOWFLAKE) {
  if (!dbToTypes[database]) fail(`database ${database} is unsupported`);
  exactKeys(value, ROOT_KEYS, "proposal");
  if (!Array.isArray(value.tables) || !Array.isArray(value.relationships)) {
    fail("tables and relationships must be arrays");
  }
  if (value.tables.length > MAX_TABLES) {
    fail(`tables exceeds the ${MAX_TABLES} table limit`);
  }
  if (value.relationships.length > MAX_RELATIONSHIPS) {
    fail(`relationships exceeds the ${MAX_RELATIONSHIPS} relationship limit`);
  }

  const tables = value.tables.map((table, index) =>
    validateTable(table, database, index),
  );
  const relationships = value.relationships.map((relationship, index) =>
    validateRelationship(relationship, database, index),
  );
  unique(
    tables.map((table) => table.key),
    "table keys",
  );
  unique(
    tables.map((table) => table.name.toUpperCase()),
    "table names",
  );
  unique(
    relationships.map((relationship) => relationship.key),
    "relationship keys",
  );

  const tablesByKey = new Map(tables.map((table) => [table.key, table]));
  for (const relationship of relationships) {
    const source = tablesByKey.get(relationship.sourceTableKey);
    const target = tablesByKey.get(relationship.targetTableKey);
    if (!source || !target) {
      fail(`relationship ${relationship.key} references an unknown table`);
    }
    const sourceColumns = new Set(source.columns.map((column) => column.key));
    const targetColumns = new Set(target.columns.map((column) => column.key));
    if (
      relationship.sourceColumnKeys.some((key) => !sourceColumns.has(key)) ||
      relationship.targetColumnKeys.some((key) => !targetColumns.has(key))
    ) {
      fail(`relationship ${relationship.key} references an unknown column`);
    }
  }

  return {
    summary: stringValue(value.summary, "summary", { max: 1000 }),
    tables,
    relationships,
  };
}

function typeText(field) {
  const family = String(field.type || "").toUpperCase();
  const size = String(field.size || "").trim();
  return size ? `${family}(${size.replace(/\s+/g, "")})` : family;
}

export function diagramToLogicalModel(diagram) {
  const value = {
    summary: "Current diagram",
    tables: (diagram.tables ?? []).map((table) => ({
      key: String(table.id),
      name: String(table.name),
      comment: String(table.comment ?? ""),
      columns: (table.fields ?? []).map((field) => ({
        key: String(field.id),
        name: String(field.name),
        type: typeText(field),
        nullable: !field.notNull,
        primary: Boolean(field.primary),
        unique: Boolean(field.unique),
        default: String(field.default ?? ""),
        comment: String(field.comment ?? ""),
      })),
    })),
    relationships: (diagram.relationships ?? []).map((relationship) => {
      const fields =
        Array.isArray(relationship.fields) && relationship.fields.length
          ? relationship.fields
          : [
              {
                startFieldId: relationship.startFieldId,
                endFieldId: relationship.endFieldId,
              },
            ];
      return {
        key: String(relationship.id),
        name: String(relationship.name || `REL_${relationship.id}`),
        sourceTableKey: String(relationship.startTableId),
        sourceColumnKeys: fields.map((pair) => String(pair.startFieldId)),
        targetTableKey: String(relationship.endTableId),
        targetColumnKeys: fields.map((pair) => String(pair.endFieldId)),
        cardinality: CARDINALITIES.has(relationship.cardinality)
          ? relationship.cardinality
          : Cardinality.MANY_TO_ONE,
      };
    }),
  };
  return validateLogicalModel(value, diagram.database);
}

function comparable(value) {
  return JSON.stringify(value);
}

export function diffLogicalModels(currentValue, proposedValue, database) {
  const current = validateLogicalModel(currentValue, database);
  const proposed = validateLogicalModel(proposedValue, database);
  const changes = [];
  const currentTables = new Map(current.tables.map((table) => [table.key, table]));
  const proposedTables = new Map(
    proposed.tables.map((table) => [table.key, table]),
  );

  for (const table of proposed.tables) {
    const before = currentTables.get(table.key);
    if (!before) {
      changes.push({ kind: "add", object: "table", key: table.key, label: table.name });
      continue;
    }
    if (
      before.name !== table.name ||
      before.comment !== table.comment ||
      comparable(before.columns) !== comparable(table.columns)
    ) {
      changes.push({
        kind: "change",
        object: "table",
        key: table.key,
        label: table.name,
      });
    }
  }
  for (const table of current.tables) {
    if (!proposedTables.has(table.key)) {
      changes.push({
        kind: "remove",
        object: "table",
        key: table.key,
        label: table.name,
      });
    }
  }

  const currentRelationships = new Map(
    current.relationships.map((relationship) => [
      relationship.key,
      relationship,
    ]),
  );
  const proposedRelationships = new Map(
    proposed.relationships.map((relationship) => [
      relationship.key,
      relationship,
    ]),
  );
  for (const relationship of proposed.relationships) {
    const before = currentRelationships.get(relationship.key);
    changes.push(
      !before
        ? {
            kind: "add",
            object: "relationship",
            key: relationship.key,
            label: relationship.name,
          }
        : comparable(before) !== comparable(relationship)
          ? {
              kind: "change",
              object: "relationship",
              key: relationship.key,
              label: relationship.name,
            }
          : null,
    );
  }
  for (const relationship of current.relationships) {
    if (!proposedRelationships.has(relationship.key)) {
      changes.push({
        kind: "remove",
        object: "relationship",
        key: relationship.key,
        label: relationship.name,
      });
    }
  }
  return changes.filter(Boolean);
}

function splitType(text) {
  const match = /^([A-Z][A-Z0-9_]*)(?:\(([^)]+)\))?$/.exec(text);
  return { family: match[1], size: match[2] ?? "" };
}

function defaultNamespace(tables) {
  const existing = tables.find((table) => table.namespace)?.namespace;
  if (existing) return { ...existing };
  return {
    id: "namespace:MODEL.PUBLIC",
    catalog: "MODEL",
    schema: "PUBLIC",
  };
}

export function applyLogicalModel(diagram, proposedValue, options = {}) {
  const database = diagram.database;
  const proposal = validateLogicalModel(proposedValue, database);
  const idFactory =
    options.idFactory ??
    (() => {
      throw new Error("[LLM_INVALID_PROPOSAL] idFactory is required");
    });
  const currentTables = new Map(
    (diagram.tables ?? []).map((table) => [String(table.id), table]),
  );
  const currentRelationships = new Map(
    (diagram.relationships ?? []).map((relationship) => [
      String(relationship.id),
      relationship,
    ]),
  );
  const tableKeyToId = new Map();
  const columnKeyToId = new Map();
  const namespace = defaultNamespace(diagram.tables ?? []);

  const tables = proposal.tables.map((logicalTable, tableIndex) => {
    const current = currentTables.get(logicalTable.key);
    const tableId = current?.id ?? idFactory("table", logicalTable.key);
    tableKeyToId.set(logicalTable.key, tableId);
    const currentFields = new Map(
      (current?.fields ?? []).map((field) => [String(field.id), field]),
    );
    const fields = logicalTable.columns.map((logicalColumn) => {
      const existing = currentFields.get(logicalColumn.key);
      const fieldId =
        existing?.id ?? idFactory("column", `${logicalTable.key}:${logicalColumn.key}`);
      columnKeyToId.set(
        `${logicalTable.key}\u0000${logicalColumn.key}`,
        fieldId,
      );
      const { family, size } = splitType(logicalColumn.type);
      return {
        ...(existing ?? {}),
        id: fieldId,
        name: logicalColumn.name,
        type: family,
        size,
        default: logicalColumn.default,
        check: existing?.check ?? "",
        primary: logicalColumn.primary,
        unique: logicalColumn.unique,
        notNull: !logicalColumn.nullable,
        increment: false,
        comment: logicalColumn.comment,
      };
    });
    const retainedFieldIds = new Set(fields.map((field) => String(field.id)));
    const retainsExistingFields = (entry) =>
      Array.isArray(entry?.fields) &&
      entry.fields.length > 0 &&
      entry.fields.every((fieldId) =>
        retainedFieldIds.has(String(fieldId)),
      );
    return {
      ...(current ?? {}),
      id: tableId,
      name: logicalTable.name,
      x: current?.x ?? 80 + (tableIndex % 4) * 280,
      y: current?.y ?? 80 + Math.floor(tableIndex / 4) * 260,
      locked: current?.locked ?? false,
      fields,
      comment: logicalTable.comment,
      indices: (current?.indices ?? []).filter(retainsExistingFields),
      uniqueConstraints: (current?.uniqueConstraints ?? []).filter(
        retainsExistingFields,
      ),
      color: current?.color ?? defaultBlue,
      collapsed: current?.collapsed ?? false,
      ...(database === DB.SNOWFLAKE
        ? { namespace: current?.namespace ? { ...current.namespace } : { ...namespace } }
        : {}),
    };
  });

  const relationships = proposal.relationships.map((logicalRelationship) => {
    const current = currentRelationships.get(logicalRelationship.key);
    const id =
      current?.id ?? idFactory("relationship", logicalRelationship.key);
    const startTableId = tableKeyToId.get(logicalRelationship.sourceTableKey);
    const endTableId = tableKeyToId.get(logicalRelationship.targetTableKey);
    const fields = logicalRelationship.sourceColumnKeys.map(
      (sourceColumnKey, index) => ({
        startFieldId: columnKeyToId.get(
          `${logicalRelationship.sourceTableKey}\u0000${sourceColumnKey}`,
        ),
        endFieldId: columnKeyToId.get(
          `${logicalRelationship.targetTableKey}\u0000${logicalRelationship.targetColumnKeys[index]}`,
        ),
      }),
    );
    return {
      ...(current ?? {}),
      id,
      name: logicalRelationship.name,
      startTableId,
      startFieldId: fields[0].startFieldId,
      endTableId,
      endFieldId: fields[0].endFieldId,
      fields,
      cardinality: logicalRelationship.cardinality,
      updateConstraint: current?.updateConstraint ?? "No action",
      deleteConstraint: current?.deleteConstraint ?? "No action",
    };
  });

  return { tables, relationships, summary: proposal.summary };
}

export const logicalModelJsonSchema = Object.freeze({
  type: "object",
  additionalProperties: false,
  required: ROOT_KEYS,
  properties: {
    summary: { type: "string", minLength: 1, maxLength: 1000 },
    tables: {
      type: "array",
      maxItems: MAX_TABLES,
      items: {
        type: "object",
        additionalProperties: false,
        required: TABLE_KEYS,
        properties: {
          key: { type: "string", minLength: 1, maxLength: 300 },
          name: { type: "string", minLength: 1, maxLength: 255 },
          comment: { type: "string", maxLength: 4000 },
          columns: {
            type: "array",
            minItems: 1,
            maxItems: MAX_COLUMNS_PER_TABLE,
            items: {
              type: "object",
              additionalProperties: false,
              required: COLUMN_KEYS,
              properties: {
                key: { type: "string", minLength: 1, maxLength: 300 },
                name: { type: "string", minLength: 1, maxLength: 255 },
                type: { type: "string", minLength: 1, maxLength: 120 },
                nullable: { type: "boolean" },
                primary: { type: "boolean" },
                unique: { type: "boolean" },
                default: { type: "string", maxLength: 1000 },
                comment: { type: "string", maxLength: 4000 },
              },
            },
          },
        },
      },
    },
    relationships: {
      type: "array",
      maxItems: MAX_RELATIONSHIPS,
      items: {
        type: "object",
        additionalProperties: false,
        required: RELATIONSHIP_KEYS,
        properties: {
          key: { type: "string", minLength: 1, maxLength: 300 },
          name: { type: "string", minLength: 1, maxLength: 255 },
          sourceTableKey: { type: "string", minLength: 1, maxLength: 300 },
          sourceColumnKeys: {
            type: "array",
            minItems: 1,
            items: { type: "string", minLength: 1, maxLength: 300 },
          },
          targetTableKey: { type: "string", minLength: 1, maxLength: 300 },
          targetColumnKeys: {
            type: "array",
            minItems: 1,
            items: { type: "string", minLength: 1, maxLength: 300 },
          },
          cardinality: {
            type: "string",
            enum: [...CARDINALITIES],
          },
        },
      },
    },
  },
});
