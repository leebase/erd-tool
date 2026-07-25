import { DB } from "../data/constants.js";
import {
  canonicalProjectToDiagram,
  isSnowflakeDefaultExpression,
} from "./projectAdapter.js";

const PROJECT_VERSION = "1";
const MODEL_VERSION = "1";
const FALLBACK_X_STEP = 280;
const FALLBACK_Y = 80;
const IDENTIFIER_RE = /^[A-Z_][A-Z0-9_$]*$/;
const TYPE_FAMILIES = new Set([
  "NUMBER",
  "FLOAT",
  "VARCHAR",
  "DATE",
  "TIMESTAMP_NTZ",
  "BOOLEAN",
  "BINARY",
]);
const RESOURCE_TYPES = new Set([
  "snowflake_database",
  "snowflake_schema",
  "snowflake_table",
  "snowflake_table_constraint",
]);
const TABLE_RESOURCE_KEYS = new Set([
  "database",
  "schema",
  "name",
  "comment",
  "column",
]);
const COLUMN_KEYS = new Set(["name", "type", "nullable", "comment", "default"]);
const TABLE_CONSTRAINT_KEYS = new Set([
  "name",
  "type",
  "table_id",
  "columns",
  "enforced",
  "foreign_key_properties",
]);
const PROJECT_KEYS = new Set([
  "project_version",
  "physical_model",
  "diagram_layout",
  "drawdb_document",
]);

function fail(message) {
  throw new Error(message);
}

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function sortById(items) {
  return [...items].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

function namespaceId(catalog, schema) {
  return `namespace:${catalog}.${schema}`;
}

function tableId(catalog, schema, tableName) {
  return `table:${catalog}.${schema}.${tableName}`;
}

function columnId(catalog, schema, tableName, columnName) {
  return `column:${catalog}.${schema}.${tableName}.${columnName}`;
}

function constraintId(catalog, schema, tableName, constraintName) {
  return `constraint:${catalog}.${schema}.${tableName}.${constraintName}`;
}

function relationshipId(catalog, schema, tableName, constraintName) {
  return `relationship:${catalog}.${schema}.${tableName}.${constraintName}`;
}

function objectKey(catalog, schema, tableName) {
  return `${catalog}\0${schema}\0${tableName}`;
}

function requireIdentifier(value, label) {
  if (typeof value !== "string" || !IDENTIFIER_RE.test(value)) {
    fail(`${label} must be an uppercase unquoted Snowflake identifier`);
  }
  return value;
}

function requireOptionalString(value, label) {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string") fail(`${label} must be a string`);
  return value;
}

function requireString(value, label) {
  if (typeof value !== "string" || !value.trim()) {
    fail(`${label} must be a nonblank string`);
  }
  return value;
}

function requireBoolean(value, label) {
  if (typeof value !== "boolean") fail(`${label} must be a boolean`);
  return value;
}

function requireOnlyKeys(value, allowed, label) {
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) fail(`unsupported Terraform ${label} attribute ${key}`);
  }
}

function canonicalTypeText(family, { precision, scale, length }) {
  switch (family) {
    case "NUMBER":
      return `NUMBER(${precision}, ${scale})`;
    case "VARCHAR":
      return `VARCHAR(${length})`;
    case "DATE":
      return "DATE";
    case "TIMESTAMP_NTZ":
      return `TIMESTAMP_NTZ(${precision})`;
    case "BOOLEAN":
      return "BOOLEAN";
    case "FLOAT":
      return "FLOAT";
    case "BINARY":
      return `BINARY(${length})`;
    default:
      fail(`unsupported type family ${family}`);
  }
}

function assertTypeBounds(family, { precision, scale, length }, label) {
  if (family === "NUMBER") {
    if (!Number.isInteger(precision) || !Number.isInteger(scale)) {
      fail(`${label}: NUMBER requires integer precision and scale`);
    }
    if (length !== null) fail(`${label}: length must be null for NUMBER`);
    if (precision < 1 || precision > 38) {
      fail(`${label}: precision must be between 1 and 38 for NUMBER`);
    }
    const maxScale = Math.min(37, precision);
    if (scale < 0 || scale > maxScale) {
      fail(`${label}: scale must be between 0 and ${maxScale} for NUMBER`);
    }
    return;
  }
  if (family === "VARCHAR") {
    if (!Number.isInteger(length)) fail(`${label}: VARCHAR requires length`);
    if (precision !== null || scale !== null) {
      fail(`${label}: precision and scale must be null for VARCHAR`);
    }
    if (length < 1 || length > 16777216) {
      fail(`${label}: length must be between 1 and 16777216 for VARCHAR`);
    }
    return;
  }
  if (family === "TIMESTAMP_NTZ") {
    if (!Number.isInteger(precision)) {
      fail(`${label}: TIMESTAMP_NTZ requires precision`);
    }
    if (scale !== null || length !== null) {
      fail(`${label}: scale and length must be null for TIMESTAMP_NTZ`);
    }
    if (precision < 0 || precision > 9) {
      fail(`${label}: precision must be between 0 and 9 for TIMESTAMP_NTZ`);
    }
    return;
  }
  if (family === "BINARY") {
    if (!Number.isInteger(length)) fail(`${label}: BINARY requires length`);
    if (precision !== null || scale !== null) {
      fail(`${label}: precision and scale must be null for BINARY`);
    }
    if (length < 1 || length > 8388608) {
      fail(`${label}: length must be between 1 and 8388608 for BINARY`);
    }
    return;
  }
  if (family === "DATE" || family === "BOOLEAN" || family === "FLOAT") {
    if (precision !== null || scale !== null || length !== null) {
      fail(`${label}: ${family} must not include parameters`);
    }
    return;
  }
  fail(`unsupported type family ${family}`);
}

function parseDataType(value) {
  const text = requireString(value, "column.type").trim();
  const match = text.match(/^([A-Z_][A-Z0-9_$]*)(?:\s*\(([^()]*)\))?$/i);
  if (!match) fail(`unsupported Terraform Snowflake data type ${text}`);
  const family = match[1].toUpperCase();
  if (!TYPE_FAMILIES.has(family)) {
    fail(`unsupported Terraform Snowflake data type ${family}`);
  }
  const args =
    match[2] === undefined
      ? []
      : match[2].split(",").map((part) => part.trim());
  let precision = null;
  let scale = null;
  let length = null;
  if (family === "NUMBER") {
    if (args.length !== 2) fail("NUMBER requires precision and scale");
    precision = Number(args[0]);
    scale = Number(args[1]);
  } else if (family === "VARCHAR" || family === "BINARY") {
    if (args.length !== 1) fail(`${family} requires length`);
    length = Number(args[0]);
  } else if (family === "TIMESTAMP_NTZ") {
    if (args.length !== 1) fail("TIMESTAMP_NTZ requires precision");
    precision = Number(args[0]);
  } else if (args.length !== 0) {
    fail(`${family} does not support parameters`);
  }
  assertTypeBounds(family, { precision, scale, length }, `data type ${family}`);
  return {
    family,
    text: canonicalTypeText(family, { precision, scale, length }),
    precision,
    scale,
    length,
  };
}

function decodeQuotedString(source, start) {
  let value = "";
  let index = start + 1;
  while (index < source.length) {
    const char = source[index];
    if (char === '"') {
      return { value, end: index + 1 };
    }
    if (char === "$" && source[index + 1] === "$" && source[index + 2] === "{") {
      value += "${";
      index += 3;
      continue;
    }
    if (char === "%" && source[index + 1] === "%" && source[index + 2] === "{") {
      value += "%{";
      index += 3;
      continue;
    }
    if (char === "$" && source[index + 1] === "{") {
      fail("unsupported Terraform string interpolation");
    }
    if (char === "%" && source[index + 1] === "{") {
      fail("unsupported Terraform template directive");
    }
    if (char === "\\") {
      const next = source[index + 1];
      if (next === undefined) fail("unterminated Terraform string");
      if (next === "n") value += "\n";
      else if (next === "r") value += "\r";
      else if (next === "t") value += "\t";
      else value += next;
      index += 2;
      continue;
    }
    value += char;
    index += 1;
  }
  fail("unterminated Terraform string");
}

function tokenize(source) {
  const tokens = [];
  let index = 0;
  while (index < source.length) {
    const char = source[index];
    if (/\s/.test(char)) {
      index += 1;
      continue;
    }
    if (char === "#") {
      while (index < source.length && source[index] !== "\n") index += 1;
      continue;
    }
    if (char === "/" && source[index + 1] === "/") {
      index += 2;
      while (index < source.length && source[index] !== "\n") index += 1;
      continue;
    }
    if (char === "/" && source[index + 1] === "*") {
      const end = source.indexOf("*/", index + 2);
      if (end < 0) fail("unterminated Terraform block comment");
      index = end + 2;
      continue;
    }
    if ('{}[]=,.'.includes(char)) {
      tokens.push({ type: char, value: char });
      index += 1;
      continue;
    }
    if (char === '"') {
      const decoded = decodeQuotedString(source, index);
      tokens.push({ type: "string", value: decoded.value });
      index = decoded.end;
      continue;
    }
    const match = source.slice(index).match(/^[A-Za-z0-9_$-]+/);
    if (!match) fail("unsupported Terraform token");
    tokens.push({ type: "word", value: match[0] });
    index += match[0].length;
  }
  return tokens;
}

class HclParser {
  constructor(tokens) {
    this.tokens = tokens;
    this.index = 0;
  }

  peek(offset = 0) {
    return this.tokens[this.index + offset] ?? null;
  }

  take(type) {
    const token = this.peek();
    if (!token || token.type !== type) {
      fail(`malformed Terraform HCL: expected ${type}`);
    }
    this.index += 1;
    return token;
  }

  takeWord() {
    const token = this.peek();
    if (!token || (token.type !== "word" && token.type !== "string")) {
      fail("malformed Terraform HCL: expected identifier");
    }
    this.index += 1;
    return token.value;
  }

  parse() {
    const body = this.parseBody(null);
    if (this.peek()) fail("malformed Terraform HCL: trailing tokens");
    return body;
  }

  parseBody(endToken) {
    const entries = [];
    while (this.peek() && this.peek().type !== endToken) {
      const name = this.takeWord();
      if (this.peek()?.type === "=") {
        this.take("=");
        entries.push({ kind: "attribute", name, value: this.parseValue() });
        continue;
      }

      const labels = [];
      while (this.peek() && this.peek().type !== "{") {
        labels.push(this.takeWord());
      }
      this.take("{");
      entries.push({
        kind: "block",
        type: name,
        labels,
        body: this.parseBody("}"),
      });
      this.take("}");
    }
    return entries;
  }

  parseValue() {
    const token = this.peek();
    if (!token) fail("malformed Terraform HCL: expected value");
    if (token.type === "string") {
      this.index += 1;
      return token.value;
    }
    if (token.type === "word") {
      this.index += 1;
      const parts = [token.value];
      while (this.peek()?.type === ".") {
        this.take(".");
        parts.push(this.takeWord());
      }
      const text = parts.join(".");
      if (parts.length === 1) {
        if (text === "true") return true;
        if (text === "false") return false;
        if (/^[+-]?\d+(?:\.\d+)?$/.test(text)) return Number(text);
      }
      return { type: "reference", parts, text };
    }
    if (token.type === "[") {
      this.take("[");
      const values = [];
      while (this.peek() && this.peek().type !== "]") {
        values.push(this.parseValue());
        if (this.peek()?.type === ",") this.take(",");
      }
      this.take("]");
      return values;
    }
    if (token.type === "{") {
      this.take("{");
      const object = {};
      while (this.peek() && this.peek().type !== "}") {
        const key = this.takeWord();
        this.take("=");
        if (Object.prototype.hasOwnProperty.call(object, key)) {
          fail(`duplicate Terraform object key ${key}`);
        }
        object[key] = this.parseValue();
        if (this.peek()?.type === ",") this.take(",");
      }
      this.take("}");
      return object;
    }
    fail(`malformed Terraform HCL: unexpected ${token.type}`);
  }
}

function entriesToObject(entries, label) {
  const object = {};
  for (const entry of entries) {
    if (entry.kind === "attribute") {
      if (Object.prototype.hasOwnProperty.call(object, entry.name)) {
        fail(`duplicate Terraform attribute ${entry.name} in ${label}`);
      }
      object[entry.name] = entry.value;
    } else {
      if (!Object.prototype.hasOwnProperty.call(object, entry.type)) {
        object[entry.type] = [];
      }
      if (!Array.isArray(object[entry.type])) {
        fail(`Terraform ${label} mixes attribute and block ${entry.type}`);
      }
      object[entry.type].push(entry);
    }
  }
  return object;
}

function normalizeTerraformInput(input) {
  if (typeof input === "string") return input;
  if (Array.isArray(input)) {
    const seen = new Set();
    return [...input]
      .map((file, index) => {
        if (!isPlainObject(file)) fail(`Terraform file ${index} must be an object`);
        const filePath = requireString(file.path, `Terraform file ${index}.path`);
        if (seen.has(filePath)) fail(`duplicate Terraform file path ${filePath}`);
        seen.add(filePath);
        return {
          path: filePath,
          contents: requireString(file.contents, `Terraform file ${index}.contents`),
        };
      })
      .sort((a, b) => a.path.localeCompare(b.path))
      .map((file) => file.contents)
      .join("\n");
  }
  fail("Terraform input must be HCL text or an array of module files");
}

function rejectTerraformState(source) {
  const trimmed = source.trim();
  if (!trimmed.startsWith("{")) return;
  try {
    const parsed = JSON.parse(trimmed);
    if (
      isPlainObject(parsed) &&
      ("terraform_version" in parsed ||
        "resources" in parsed ||
        "outputs" in parsed ||
        "lineage" in parsed ||
        "serial" in parsed)
    ) {
      fail("Terraform state/tfstate files are not project data and are not imported");
    }
  } catch (error) {
    if (/Terraform state|tfstate/.test(error.message)) throw error;
  }
}

function parseHcl(source) {
  const hcl = normalizeTerraformInput(source);
  if (!hcl.trim()) fail("Terraform HCL must be nonblank");
  rejectTerraformState(hcl);
  return new HclParser(tokenize(hcl)).parse();
}

function valueToString(value, label) {
  if (typeof value === "string") return value;
  if (isPlainObject(value) && value.type === "reference") {
    fail(`ambiguous or unsupported Terraform expression ${value.text} in ${label}`);
  }
  fail(`${label} must be a literal string`);
}

function valueToIdentifier(value, label) {
  return requireIdentifier(valueToString(value, label), label);
}

function valueToStringArray(value, label) {
  if (!Array.isArray(value) || value.length === 0) {
    fail(`${label} must be a non-empty Terraform string array`);
  }
  return value.map((item, index) => valueToIdentifier(item, `${label}[${index}]`));
}

function resourceRef(value, expectedType, expectedAttribute, label) {
  if (!isPlainObject(value) || value.type !== "reference") {
    return null;
  }
  const [type, name, attribute] = value.parts;
  if (
    value.parts.length !== 3 ||
    type !== expectedType ||
    attribute !== expectedAttribute
  ) {
    fail(`unsupported Terraform reference ${value.text} in ${label}`);
  }
  return name;
}

function directRef(value, label) {
  if (!isPlainObject(value) || value.type !== "reference") return null;
  if (value.parts.length !== 3) {
    fail(`unsupported Terraform reference ${value.text} in ${label}`);
  }
  return {
    resourceType: value.parts[0],
    resourceName: value.parts[1],
    attribute: value.parts[2],
    text: value.text,
  };
}

function requireUnlabeledBlock(block, label) {
  if (block.labels.length) fail(`Terraform ${label} blocks must not have labels`);
}

function blockList(object, key) {
  const value = object[key];
  if (value === undefined) return [];
  if (!Array.isArray(value)) fail(`Terraform ${key} must be a block list`);
  return value;
}

function collectResourceBlocks(entries) {
  const resources = [];
  for (const entry of entries) {
    if (entry.kind !== "block") {
      fail(`unsupported top-level Terraform attribute ${entry.name}`);
    }
    if (entry.type === "terraform") {
      const object = entriesToObject(entry.body, "terraform");
      for (const key of Object.keys(object)) {
        if (key === "backend" || key === "cloud") {
          fail("Terraform backend/state configuration is not imported");
        }
        if (key !== "required_providers") {
          fail(`unsupported Terraform terraform block ${key}`);
        }
      }
      if (object.required_providers !== undefined && !Array.isArray(object.required_providers)) {
        fail("Terraform required_providers must be a block list");
      }
      if (object.backend) {
        fail("Terraform backend/state configuration is not imported");
      }
      continue;
    }
    if (entry.type === "provider") {
      fail("Terraform provider configuration is not imported because it may contain credentials");
    }
    if (entry.type !== "resource") {
      fail(`unsupported Terraform block ${entry.type}`);
    }
    if (entry.labels.length !== 2) {
      fail("Terraform resource blocks must have type and name labels");
    }
    const [type, name] = entry.labels;
    if (!RESOURCE_TYPES.has(type)) {
      fail(`unsupported Terraform resource ${type}`);
    }
    resources.push({ type, name, object: entriesToObject(entry.body, type) });
  }
  return resources;
}

function indexResources(resources) {
  const byType = new Map();
  for (const resource of resources) {
    if (!byType.has(resource.type)) byType.set(resource.type, new Map());
    const scoped = byType.get(resource.type);
    if (scoped.has(resource.name)) {
      fail(`duplicate Terraform resource ${resource.type}.${resource.name}`);
    }
    scoped.set(resource.name, resource);
  }
  return byType;
}

function resourceByName(index, type, name, label) {
  const resource = index.get(type)?.get(name);
  if (!resource) fail(`unresolved Terraform reference ${type}.${name} in ${label}`);
  return resource;
}

function buildDatabases(index) {
  const databases = new Map();
  for (const resource of index.get("snowflake_database")?.values() ?? []) {
    const object = resource.object;
    for (const key of Object.keys(object)) {
      if (key !== "name") fail(`unsupported Terraform snowflake_database attribute ${key}`);
    }
    const catalog = valueToIdentifier(object.name, "snowflake_database.name");
    if ([...databases.values()].some((name) => name === catalog)) {
      fail(`duplicate Snowflake database ${catalog}`);
    }
    databases.set(resource.name, catalog);
  }
  return databases;
}

function resolveDatabaseValue(value, databases, schemas, index, label) {
  const ref = directRef(value, label);
  if (!ref) return valueToIdentifier(value, label);
  if (ref.resourceType === "snowflake_database" && ref.attribute === "name") {
    return databases.get(ref.resourceName) ??
      valueToIdentifier(
        resourceByName(index, "snowflake_database", ref.resourceName, label).object.name,
        label,
      );
  }
  if (ref.resourceType === "snowflake_schema" && ref.attribute === "database") {
    const schema = schemas.get(ref.resourceName);
    if (!schema) fail(`unresolved Terraform reference ${value.text} in ${label}`);
    return schema.catalog;
  }
  fail(`unsupported Terraform reference ${value.text} in ${label}`);
}

function buildSchemas(index, databases) {
  const schemaDefinitions = new Map();
  const schemas = new Map();
  const physicalNamespaces = new Map();

  for (const resource of index.get("snowflake_schema")?.values() ?? []) {
    const object = resource.object;
    for (const key of Object.keys(object)) {
      if (key !== "database" && key !== "name") {
        fail(`unsupported Terraform snowflake_schema attribute ${key}`);
      }
    }
    const schema = valueToIdentifier(object.name, "snowflake_schema.name");
    schemaDefinitions.set(resource.name, { object, schema });
  }

  const resolveSchema = (resourceName, referenceLabel, stack = []) => {
    if (schemas.has(resourceName)) return schemas.get(resourceName);
    if (stack.includes(resourceName)) {
      fail(`cyclic Terraform schema database reference ${resourceName}`);
    }
    const definition = schemaDefinitions.get(resourceName);
    if (!definition) {
      fail(`unresolved Terraform reference snowflake_schema.${resourceName} in ${referenceLabel}`);
    }
    const ref = directRef(definition.object.database, "snowflake_schema.database");
    let catalog;
    if (
      ref?.resourceType === "snowflake_schema" &&
      ref.attribute === "database"
    ) {
      catalog = resolveSchema(ref.resourceName, ref.text, [
        ...stack,
        resourceName,
      ]).catalog;
    } else {
      catalog = resolveDatabaseValue(
        definition.object.database,
        databases,
        schemas,
        index,
        "snowflake_schema.database",
      );
    }
    const schema = definition.schema;
    const id = namespaceId(catalog, schema);
    if (physicalNamespaces.has(id)) fail(`duplicate Snowflake schema ${catalog}.${schema}`);
    const namespace = { id, catalog, schema };
    physicalNamespaces.set(id, namespace);
    schemas.set(resourceName, namespace);
    return namespace;
  };

  for (const resourceName of schemaDefinitions.keys()) {
    resolveSchema(resourceName, `snowflake_schema.${resourceName}`);
  }

  return { schemas, namespaces: sortById([...physicalNamespaces.values()]) };
}

function resolveTableNamespace(object, databases, schemas, index) {
  const schemaRef = resourceRef(
    object.schema,
    "snowflake_schema",
    "name",
    "snowflake_table.schema",
  );
  const databaseRef = directRef(object.database, "snowflake_table.database");
  if (
    schemaRef &&
    databaseRef?.resourceType === "snowflake_schema" &&
    databaseRef.attribute === "database" &&
    databaseRef.resourceName !== schemaRef
  ) {
    fail("ambiguous Terraform table namespace references different schemas");
  }
  if (schemaRef) {
    const namespace = schemas.get(schemaRef);
    if (!namespace) fail(`unresolved Terraform reference snowflake_schema.${schemaRef}`);
    const catalog = resolveDatabaseValue(
      object.database,
      databases,
      schemas,
      index,
      "snowflake_table.database",
    );
    if (catalog !== namespace.catalog) {
      fail("ambiguous Terraform table namespace references different databases");
    }
    return namespace;
  }
  const catalog = resolveDatabaseValue(
    object.database,
    databases,
    schemas,
    index,
    "snowflake_table.database",
  );
  const schema = valueToIdentifier(object.schema, "snowflake_table.schema");
  return { id: namespaceId(catalog, schema), catalog, schema };
}

function buildColumn(block, namespace, tableName, ordinal) {
  if (block.labels.length) fail("Terraform column blocks must not have labels");
  const object = entriesToObject(block.body, "column");
  requireOnlyKeys(object, COLUMN_KEYS, "column");
  const name = valueToIdentifier(object.name, "column.name");
  const defaultBlocks = blockList(object, "default");
  if (defaultBlocks.length > 1) fail(`column ${name} has multiple default blocks`);
  let defaultValue = null;
  if (defaultBlocks.length === 1) {
    requireUnlabeledBlock(defaultBlocks[0], "default");
    const defaultObject = entriesToObject(defaultBlocks[0].body, "default");
    const keys = Object.keys(defaultObject);
    if (
      keys.length !== 1 ||
      (keys[0] !== "constant" && keys[0] !== "expression")
    ) {
      fail(`unsupported Terraform default block on column ${name}`);
    }
    defaultValue = valueToString(defaultObject[keys[0]], `column ${name} default`);
  }
  return {
    id: columnId(namespace.catalog, namespace.schema, tableName, name),
    name,
    ordinal,
    data_type: parseDataType(valueToString(object.type, "column.type")),
    nullable:
      object.nullable === undefined
        ? true
        : requireBoolean(object.nullable, "column.nullable"),
    default: defaultValue,
    comment: requireOptionalString(object.comment, "column.comment"),
  };
}

function buildTables(index, databases, schemas, namespaces) {
  const namespaceById = new Map(namespaces.map((namespace) => [namespace.id, namespace]));
  const tables = [];
  const tablesByResourceName = new Map();
  const tablesByObjectKey = new Map();
  for (const resource of index.get("snowflake_table")?.values() ?? []) {
    const object = resource.object;
    requireOnlyKeys(object, TABLE_RESOURCE_KEYS, "snowflake_table");
    const namespace = resolveTableNamespace(object, databases, schemas, index);
    if (!namespaceById.has(namespace.id)) {
      namespaceById.set(namespace.id, namespace);
    }
    const name = valueToIdentifier(object.name, "snowflake_table.name");
    const key = objectKey(namespace.catalog, namespace.schema, name);
    if (tablesByObjectKey.has(key)) {
      fail(`duplicate Snowflake table ${namespace.catalog}.${namespace.schema}.${name}`);
    }
    const columnBlocks = blockList(object, "column");
    if (columnBlocks.length === 0) fail(`Terraform table ${name} must have columns`);
    const columns = columnBlocks.map((block, index) =>
      buildColumn(block, namespace, name, index + 1),
    );
    if (new Set(columns.map((column) => column.name)).size !== columns.length) {
      fail(`duplicate Terraform column in table ${name}`);
    }
    const table = {
      id: tableId(namespace.catalog, namespace.schema, name),
      namespace_id: namespace.id,
      name,
      kind: "table",
      columns,
      constraints: [],
      comment: requireOptionalString(object.comment, "snowflake_table.comment"),
    };
    tables.push(table);
    tablesByResourceName.set(resource.name, table);
    tablesByObjectKey.set(key, table);
  }
  return {
    namespaces: sortById([...namespaceById.values()]),
    tables,
    tablesByResourceName,
    tablesByObjectKey,
  };
}

function resolveTableIdValue(value, tablesByResourceName, tablesByObjectKey, label) {
  const ref = directRef(value, label);
  if (ref) {
    if (
      ref.resourceType !== "snowflake_table" ||
      ref.attribute !== "fully_qualified_name"
    ) {
      fail(`unsupported Terraform reference ${value.text} in ${label}`);
    }
    const table = tablesByResourceName.get(ref.resourceName);
    if (!table) fail(`unresolved Terraform reference ${value.text}`);
    return table;
  }
  const parts = valueToString(value, label).split(".");
  if (parts.length !== 3) fail(`${label} must be a three-part table name`);
  const [catalog, schema, tableName] = parts.map((part) =>
    requireIdentifier(part, label),
  );
  const table = tablesByObjectKey.get(objectKey(catalog, schema, tableName));
  if (!table) fail(`unresolved Terraform table reference ${catalog}.${schema}.${tableName}`);
  return table;
}

function columnIdsForNames(table, names, label) {
  return names.map((name) => {
    const column = table.columns.find((candidate) => candidate.name === name);
    if (!column) fail(`${label} references unknown column ${name}`);
    return column.id;
  });
}

function buildConstraint(resource, tablesByResourceName, tablesByObjectKey) {
  const object = resource.object;
  requireOnlyKeys(object, TABLE_CONSTRAINT_KEYS, "snowflake_table_constraint");
  const sourceTable = resolveTableIdValue(
    object.table_id,
    tablesByResourceName,
    tablesByObjectKey,
    "snowflake_table_constraint.table_id",
  );
  const name = valueToIdentifier(object.name, "snowflake_table_constraint.name");
  const rawType = valueToString(object.type, "snowflake_table_constraint.type").toUpperCase();
  const kind = new Map([
    ["PRIMARY KEY", "primary_key"],
    ["UNIQUE", "unique"],
    ["FOREIGN KEY", "foreign_key"],
  ]).get(rawType);
  if (!kind) fail(`unsupported Terraform table constraint type ${rawType}`);
  if (object.enforced !== undefined && object.enforced !== false) {
    fail("unsupported Terraform enforced table constraints; only enforced = false is imported");
  }
  const columns = columnIdsForNames(
    sourceTable,
    valueToStringArray(object.columns, "snowflake_table_constraint.columns"),
    `constraint ${name}`,
  );
  const constraint = {
    id: constraintIdForTable(sourceTable, name),
    name,
    kind,
    columns,
    referenced_table_id: null,
    referenced_columns: [],
  };
  const fkBlocks = blockList(object, "foreign_key_properties");
  if (kind !== "foreign_key") {
    if (fkBlocks.length) {
      fail(`unsupported Terraform foreign_key_properties on ${rawType} constraint`);
    }
    return { sourceTable, constraint };
  }
  if (fkBlocks.length !== 1) {
    fail(`FOREIGN KEY constraint ${name} requires one foreign_key_properties block`);
  }
  requireUnlabeledBlock(fkBlocks[0], "foreign_key_properties");
  const fkObject = entriesToObject(fkBlocks[0].body, "foreign_key_properties");
  requireOnlyKeys(fkObject, new Set(["references"]), "foreign_key_properties");
  const references = blockList(fkObject, "references");
  if (references.length !== 1) {
    fail(`FOREIGN KEY constraint ${name} requires one references block`);
  }
  requireUnlabeledBlock(references[0], "references");
  const referenceObject = entriesToObject(references[0].body, "references");
  for (const key of Object.keys(referenceObject)) {
    if (key !== "table_id" && key !== "columns") {
      fail(`unsupported Terraform references attribute ${key}`);
    }
  }
  const targetTable = resolveTableIdValue(
    referenceObject.table_id,
    tablesByResourceName,
    tablesByObjectKey,
    "references.table_id",
  );
  constraint.referenced_table_id = targetTable.id;
  constraint.referenced_columns = columnIdsForNames(
    targetTable,
    valueToStringArray(referenceObject.columns, "references.columns"),
    `constraint ${name}`,
  );
  if (constraint.columns.length !== constraint.referenced_columns.length) {
    fail(`FOREIGN KEY constraint ${name} column counts must match`);
  }
  return { sourceTable, constraint };
}

function tableParts(table) {
  const match = table.id.match(
    /^table:([A-Z_][A-Z0-9_$]*)\.([A-Z_][A-Z0-9_$]*)\.([A-Z_][A-Z0-9_$]*)$/,
  );
  if (!match) fail(`invalid table id ${table.id}`);
  return { catalog: match[1], schema: match[2], tableName: match[3] };
}

function constraintIdForTable(table, constraintName) {
  const { catalog, schema, tableName } = tableParts(table);
  return constraintId(catalog, schema, tableName, constraintName);
}

function buildRelationships(tables) {
  return sortById(
    tables.flatMap((table) => {
      const { catalog, schema, tableName } = tableParts(table);
      return table.constraints
        .filter((constraint) => constraint.kind === "foreign_key")
        .map((constraint) => ({
          id: relationshipId(catalog, schema, tableName, constraint.name),
          name: constraint.name,
          source_table_id: table.id,
          source_column_ids: constraint.columns,
          target_table_id: constraint.referenced_table_id,
          target_column_ids: constraint.referenced_columns,
          cardinality: "many_to_one",
        }));
    }),
  );
}

function validateCanonicalProject(project) {
  canonicalProjectToDiagram(project);
  return project;
}

export function terraformHclToCanonicalProject(input, options = {}) {
  const entries = parseHcl(input);
  const resources = collectResourceBlocks(entries);
  const index = indexResources(resources);
  const databases = buildDatabases(index);
  const { schemas, namespaces: schemaNamespaces } = buildSchemas(index, databases);
  const {
    namespaces,
    tables,
    tablesByResourceName,
    tablesByObjectKey,
  } = buildTables(index, databases, schemas, schemaNamespaces);

  for (const resource of index.get("snowflake_table_constraint")?.values() ?? []) {
    const { sourceTable, constraint } = buildConstraint(
      resource,
      tablesByResourceName,
      tablesByObjectKey,
    );
    sourceTable.constraints.push(constraint);
  }

  const canonicalTables = sortById(
    tables.map((table) => ({
      ...table,
      constraints: sortById(table.constraints),
    })),
  );
  const physical_model = {
    model_version: MODEL_VERSION,
    name:
      typeof options.name === "string" && options.name.trim()
        ? options.name.trim()
        : "terraform-import",
    namespaces,
    tables: canonicalTables,
    relationships: buildRelationships(canonicalTables),
  };
  const nodes = {};
  canonicalTables.forEach((table, index) => {
    nodes[table.id] = { x: index * FALLBACK_X_STEP, y: FALLBACK_Y };
  });
  return validateCanonicalProject({
    project_version: PROJECT_VERSION,
    physical_model,
    diagram_layout: {
      nodes,
      viewport: { x: 0, y: 0, zoom: 1 },
    },
  });
}

export function terraformHclToDiagram(input, options = {}) {
  const project = terraformHclToCanonicalProject(input, {
    name:
      typeof options.title === "string" && options.title.trim()
        ? options.title.trim()
        : options.name,
  });
  return {
    ...canonicalProjectToDiagram(project),
    database: DB.SNOWFLAKE,
    notes: [],
    areas: [],
    types: [],
    enums: [],
  };
}

function terraformLabel(value) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^([0-9])/, "_$1")
    .replace(/^$/, "_");
}

function labelMap(items, getParts) {
  const labels = new Map();
  const used = new Set();
  for (const item of items) {
    const base = terraformLabel(getParts(item).join("_"));
    let label = base;
    let suffix = 2;
    while (used.has(label)) {
      label = `${base}_${suffix}`;
      suffix += 1;
    }
    used.add(label);
    labels.set(item.id, label);
  }
  return labels;
}

function hclString(value) {
  return `"${String(value)
    .replaceAll("\\", "\\\\")
    .replaceAll('"', '\\"')
    .replaceAll("\n", "\\n")
    .replaceAll("\r", "\\r")
    .replaceAll("\t", "\\t")
    .replaceAll("${", () => "$${")
    .replaceAll("%{", () => "%%{")}"`;
}

function defaultBlockKind(value) {
  if (isSnowflakeDefaultExpression(value)) return "expression";
  return "constant";
}

function tableById(model, tableObjectId) {
  const table = model.tables.find((candidate) => candidate.id === tableObjectId);
  if (!table) fail(`unknown table id ${tableObjectId}`);
  return table;
}

function validateProjectOrModel(projectOrModel) {
  const normalizeModel = (model) => ({
    ...model,
    namespaces: sortById(model.namespaces ?? []),
    tables: sortById(model.tables ?? []).map((table) => ({
      ...table,
      constraints: sortById(table.constraints ?? []),
    })),
    relationships: sortById(model.relationships ?? []),
  });

  if (
    isPlainObject(projectOrModel) &&
    "physical_model" in projectOrModel &&
    "project_version" in projectOrModel
  ) {
    const unexpected = Object.keys(projectOrModel).filter(
      (key) => !PROJECT_KEYS.has(key),
    );
    if (unexpected.length) {
      fail(`project has unexpected field ${unexpected.sort().join(", ")}`);
    }
    const model = normalizeModel(projectOrModel.physical_model);
    const nodes = {};
    for (const table of model.tables) {
      nodes[table.id] = projectOrModel.diagram_layout?.nodes?.[table.id] ?? {
        x: 0,
        y: 0,
      };
    }
    canonicalProjectToDiagram({
      project_version: projectOrModel.project_version,
      physical_model: model,
      diagram_layout: {
        nodes,
        viewport: projectOrModel.diagram_layout?.viewport ?? {
          x: 0,
          y: 0,
          zoom: 1,
        },
      },
    });
    return model;
  }
  const model = normalizeModel(projectOrModel);
  const nodes = {};
  for (const table of model?.tables ?? []) {
    nodes[table.id] = { x: 0, y: 0 };
  }
  canonicalProjectToDiagram({
    project_version: PROJECT_VERSION,
    physical_model: model,
    diagram_layout: {
      nodes,
      viewport: { x: 0, y: 0, zoom: 1 },
    },
  });
  return model;
}

export function canonicalProjectToTerraformHcl(projectOrModel) {
  const model = validateProjectOrModel(projectOrModel);
  const databaseItems = [...new Set(model.namespaces.map((ns) => ns.catalog))]
    .sort()
    .map((catalog) => ({ id: `database:${catalog}`, catalog }));
  const databaseLabels = labelMap(databaseItems, (database) => [database.catalog]);
  const namespaceLabels = labelMap(model.namespaces, (namespace) => [
    namespace.catalog,
    namespace.schema,
  ]);
  const tableLabels = labelMap(model.tables, (table) => {
    const namespace = model.namespaces.find((ns) => ns.id === table.namespace_id);
    if (!namespace) fail(`unknown namespace ${table.namespace_id}`);
    return [namespace.catalog, namespace.schema, table.name];
  });
  const constraintItems = model.tables.flatMap((table) =>
    table.constraints.map((constraint) => ({ ...constraint, table })),
  );
  const constraintLabels = labelMap(constraintItems, (item) => {
    const namespace = model.namespaces.find((ns) => ns.id === item.table.namespace_id);
    if (!namespace) fail(`unknown namespace ${item.table.namespace_id}`);
    return [namespace.catalog, namespace.schema, item.table.name, item.name];
  });

  const lines = [
    "terraform {",
    "  required_providers {",
    "    snowflake = {",
    '      source  = "snowflakedb/snowflake"',
    '      version = ">= 2.0.0"',
    "    }",
    "  }",
    "}",
  ];

  for (const database of databaseItems) {
    lines.push(
      "",
      `resource "snowflake_database" "${databaseLabels.get(database.id)}" {`,
      `  name = ${hclString(database.catalog)}`,
      "}",
    );
  }

  for (const namespace of model.namespaces) {
    lines.push(
      "",
      `resource "snowflake_schema" "${namespaceLabels.get(namespace.id)}" {`,
      `  database = snowflake_database.${databaseLabels.get(`database:${namespace.catalog}`)}.name`,
      `  name     = ${hclString(namespace.schema)}`,
      "}",
    );
  }

  for (const table of model.tables) {
    const namespace = model.namespaces.find((ns) => ns.id === table.namespace_id);
    lines.push(
      "",
      `resource "snowflake_table" "${tableLabels.get(table.id)}" {`,
      `  database = snowflake_schema.${namespaceLabels.get(namespace.id)}.database`,
      `  schema   = snowflake_schema.${namespaceLabels.get(namespace.id)}.name`,
      `  name     = ${hclString(table.name)}`,
    );
    if (table.comment !== null) {
      lines.push(`  comment  = ${hclString(table.comment)}`);
    }
    for (const column of table.columns) {
      lines.push(
        "",
        "  column {",
        `    name     = ${hclString(column.name)}`,
        `    type     = ${hclString(column.data_type.text)}`,
        `    nullable = ${column.nullable ? "true" : "false"}`,
      );
      if (column.comment !== null) {
        lines.push(`    comment  = ${hclString(column.comment)}`);
      }
      if (column.default !== null) {
        lines.push(
          "",
          "    default {",
          `      ${defaultBlockKind(column.default)} = ${hclString(column.default)}`,
          "    }",
        );
      }
      lines.push("  }");
    }
    lines.push("}");
  }

  for (const item of constraintItems) {
    const { table, ...constraint } = item;
    const typeName = new Map([
      ["primary_key", "PRIMARY KEY"],
      ["unique", "UNIQUE"],
      ["foreign_key", "FOREIGN KEY"],
    ]).get(constraint.kind);
    if (!typeName) fail(`unsupported constraint kind ${constraint.kind}`);
    const columns = constraint.columns
      .map((id) => table.columns.find((column) => column.id === id)?.name)
      .map((name) => {
        if (!name) fail(`unknown constraint column in ${constraint.name}`);
        return hclString(name);
      })
      .join(", ");
    lines.push(
      "",
      `resource "snowflake_table_constraint" "${constraintLabels.get(item.id)}" {`,
      `  name     = ${hclString(constraint.name)}`,
      `  type     = ${hclString(typeName)}`,
      `  table_id = snowflake_table.${tableLabels.get(table.id)}.fully_qualified_name`,
      `  columns  = [${columns}]`,
      "  enforced = false",
    );
    if (constraint.kind === "foreign_key") {
      const target = tableById(model, constraint.referenced_table_id);
      const referencedColumns = constraint.referenced_columns
        .map((id) => target.columns.find((column) => column.id === id)?.name)
        .map((name) => {
          if (!name) fail(`unknown referenced column in ${constraint.name}`);
          return hclString(name);
        })
        .join(", ");
      lines.push(
        "",
        "  foreign_key_properties {",
        "    references {",
        `      table_id = snowflake_table.${tableLabels.get(target.id)}.fully_qualified_name`,
        `      columns  = [${referencedColumns}]`,
        "    }",
        "  }",
      );
    }
    lines.push("}");
  }

  return `${lines.join("\n")}\n`;
}
