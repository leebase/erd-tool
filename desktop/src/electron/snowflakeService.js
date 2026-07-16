import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";

import snowflake from "snowflake-sdk";
import { parse as parseToml } from "smol-toml";

const MAXIMUM_SELECTION_SIZE = 500;
const QUERY_TIMEOUT_MS = 90_000;
const CONNECT_TIMEOUT_MS = 150_000;
const CANONICAL_IDENTIFIER = /^[A-Z_][A-Z0-9_$]*$/;
const SNOWFLAKE_TYPE_ALIASES = new Map([
  ["DECIMAL", "NUMBER"],
  ["DEC", "NUMBER"],
  ["NUMERIC", "NUMBER"],
  ["INT", "NUMBER"],
  ["INTEGER", "NUMBER"],
  ["BIGINT", "NUMBER"],
  ["SMALLINT", "NUMBER"],
  ["FIXED", "NUMBER"],
  ["TEXT", "VARCHAR"],
  ["STRING", "VARCHAR"],
  ["REAL", "FLOAT"],
  ["DOUBLE", "FLOAT"],
  ["DOUBLE PRECISION", "FLOAT"],
]);
const PROFILE_KEYS = new Set([
  "account",
  "user",
  "username",
  "authenticator",
  "private_key_file",
  "privateKeyPath",
  "warehouse",
  "role",
  "database",
  "schema",
]);

function fail(code, message) {
  throw new Error(`[${code}] ${message}`);
}

function record(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    fail("SNOWFLAKE_INVALID_REQUEST", `${label} must be an object.`);
  }
  return value;
}

function exactKeys(value, allowed, label) {
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) {
      fail(
        "SNOWFLAKE_INVALID_REQUEST",
        `${label} contains an unexpected field: ${key}.`,
      );
    }
  }
}

function requiredText(value, label, maximum = 255) {
  if (typeof value !== "string" || !value.trim()) {
    fail("SNOWFLAKE_INVALID_REQUEST", `${label} is required.`);
  }
  const result = value.trim();
  if (result.length > maximum) {
    fail("SNOWFLAKE_INVALID_REQUEST", `${label} is too long.`);
  }
  return result;
}

function optionalText(value, label, maximum = 255) {
  if (value === undefined || value === null || value === "") return undefined;
  return requiredText(value, label, maximum);
}

function quoteIdentifier(value, label) {
  const identifier = requiredText(value, label);
  return `"${identifier.replaceAll('"', '""')}"`;
}

function requireCanonicalIdentifier(value, label) {
  const identifier = requiredText(value, label);
  if (!CANONICAL_IDENTIFIER.test(identifier)) {
    fail(
      "SNOWFLAKE_UNSUPPORTED_IDENTIFIER",
      `${label} ${JSON.stringify(identifier)} is not an uppercase unquoted Snowflake identifier supported by the current model.`,
    );
  }
  return identifier;
}

function normalizeRow(row) {
  return Object.fromEntries(
    Object.entries(row ?? {}).map(([key, value]) => [key.toLowerCase(), value]),
  );
}

function normalizeColumnType(column) {
  const dataType = String(column.data_type ?? "").toUpperCase();
  return {
    ...column,
    data_type: SNOWFLAKE_TYPE_ALIASES.get(dataType) ?? dataType,
  };
}

function safeErrorMessage(error, fallback, homeDirectory) {
  const raw = typeof error?.message === "string" ? error.message : fallback;
  const withoutSecrets = raw
    .replace(/(password|token|private[_ ]?key)\s*[=:]\s*[^\s,;]+/gi, "$1=[redacted]")
    .replaceAll(homeDirectory, "~")
    .replace(/[\r\n\t]+/g, " ")
    .trim()
    .slice(0, 600);
  return withoutSecrets || fallback;
}

function resolveHome(value, homeDirectory) {
  if (typeof value !== "string") return value;
  if (value === "~") return homeDirectory;
  if (value.startsWith("~/")) return path.join(homeDirectory, value.slice(2));
  return value;
}

function publicProfile(name, options, isDefault) {
  return {
    name,
    isDefault,
    account: options.account ?? "",
    username: options.username ?? options.user ?? "",
    authenticator: options.authenticator ?? "SNOWFLAKE",
    warehouse: options.warehouse ?? "",
    role: options.role ?? "",
    database: options.database ?? "",
    schema: options.schema ?? "",
  };
}

function readProfileFiles({ fsModule, homeDirectory, configPaths }) {
  const paths =
    configPaths ??
    [
      path.join(homeDirectory, ".snowflake", "config.toml"),
      path.join(homeDirectory, ".snowflake", "connections.toml"),
    ];
  const profiles = new Map();
  let defaultProfileName = null;

  for (const configPath of paths) {
    if (!fsModule.existsSync(configPath)) continue;
    let parsed;
    try {
      parsed = parseToml(fsModule.readFileSync(configPath, "utf8"));
    } catch (error) {
      fail(
        "SNOWFLAKE_PROFILE_READ_FAILED",
        `Could not read ${path.basename(configPath)}: ${safeErrorMessage(error, "invalid TOML", homeDirectory)}`,
      );
    }

    const isCliConfig = path.basename(configPath) === "config.toml";
    const source = isCliConfig ? parsed.connections : parsed;
    if (isCliConfig && typeof parsed.default_connection_name === "string") {
      defaultProfileName = parsed.default_connection_name;
    }
    if (!source || typeof source !== "object" || Array.isArray(source)) continue;

    for (const [name, rawOptions] of Object.entries(source)) {
      if (!rawOptions || typeof rawOptions !== "object" || Array.isArray(rawOptions)) {
        continue;
      }
      const allowedOptions = Object.fromEntries(
        Object.entries(rawOptions).filter(([key]) => PROFILE_KEYS.has(key)),
      );
      if (typeof allowedOptions.private_key_file === "string") {
        allowedOptions.private_key_file = resolveHome(
          allowedOptions.private_key_file,
          homeDirectory,
        );
      }
      if (typeof allowedOptions.privateKeyPath === "string") {
        allowedOptions.privateKeyPath = resolveHome(
          allowedOptions.privateKeyPath,
          homeDirectory,
        );
      }
      profiles.set(name, allowedOptions);
    }
  }

  return { profiles, defaultProfileName };
}

function manualConnectionOptions(payload, openExternalBrowser) {
  exactKeys(
    payload,
    new Set([
      "mode",
      "account",
      "username",
      "authenticator",
      "password",
      "warehouse",
      "role",
      "privateKeyPath",
      "privateKeyPass",
    ]),
    "manual connection",
  );
  const authenticator = optionalText(payload.authenticator, "authenticator") ?? "SNOWFLAKE";
  const supported = new Set([
    "SNOWFLAKE",
    "USERNAME_PASSWORD_MFA",
    "EXTERNALBROWSER",
    "SNOWFLAKE_JWT",
  ]);
  if (!supported.has(authenticator)) {
    fail(
      "SNOWFLAKE_INVALID_REQUEST",
      `Authenticator ${JSON.stringify(authenticator)} is not supported.`,
    );
  }

  const options = {
    account: requiredText(payload.account, "account"),
    username: requiredText(payload.username, "username"),
    authenticator,
    warehouse: optionalText(payload.warehouse, "warehouse"),
    role: optionalText(payload.role, "role"),
  };
  if (authenticator === "SNOWFLAKE" || authenticator === "USERNAME_PASSWORD_MFA") {
    options.password = requiredText(payload.password, "password", 4096);
  } else if (authenticator === "SNOWFLAKE_JWT") {
    options.privateKeyPath = resolveHome(
      requiredText(payload.privateKeyPath, "private key path", 4096),
      os.homedir(),
    );
    options.privateKeyPass = optionalText(
      payload.privateKeyPass,
      "private key passphrase",
      4096,
    );
  } else {
    options.openExternalBrowserCallback = openExternalBrowser;
  }
  return options;
}

function destroyConnection(connection) {
  return new Promise((resolve) => {
    try {
      connection.destroy(() => resolve());
    } catch {
      resolve();
    }
  });
}

export function createSnowflakeService({
  driver = snowflake,
  fsModule = fs,
  homeDirectory = os.homedir(),
  configPaths,
  createId = randomUUID,
  openExternalBrowser = () => {},
} = {}) {
  if (typeof driver.configure === "function") {
    driver.configure({ logLevel: "OFF", additionalLogToConsole: false });
  }
  const sessions = new Map();

  function loadProfiles() {
    return readProfileFiles({ fsModule, homeDirectory, configPaths });
  }

  function listProfiles() {
    const { profiles, defaultProfileName } = loadProfiles();
    return [...profiles.entries()]
      .map(([name, options]) =>
        publicProfile(name, options, name === defaultProfileName),
      )
      .sort((left, right) =>
        Number(right.isDefault) - Number(left.isDefault) ||
        left.name.localeCompare(right.name),
      );
  }

  function executeRows(connection, sqlText, binds = []) {
    return new Promise((resolve, reject) => {
      let settled = false;
      let statement;
      const timeout = setTimeout(() => {
        if (settled) return;
        settled = true;
        try {
          statement?.cancel?.(() => {});
        } catch {
          // The timeout error remains authoritative even if cancellation fails.
        }
        reject(new Error("Snowflake metadata query timed out."));
      }, QUERY_TIMEOUT_MS);

      try {
        statement = connection.execute({
          sqlText,
          binds,
          complete: (error, _statement, rows = []) => {
            if (settled) return;
            settled = true;
            clearTimeout(timeout);
            if (error) reject(error);
            else resolve(rows.map(normalizeRow));
          },
        });
      } catch (error) {
        settled = true;
        clearTimeout(timeout);
        reject(error);
      }
    });
  }

  function requireSession(sessionId) {
    const id = requiredText(sessionId, "session id");
    const session = sessions.get(id);
    if (!session) {
      fail(
        "SNOWFLAKE_SESSION_EXPIRED",
        "The Snowflake connection is no longer active. Connect again.",
      );
    }
    return session;
  }

  async function connect(payloadValue) {
    const payload = record(payloadValue, "connection request");
    const mode = requiredText(payload.mode, "connection mode");
    let options;
    let profileName = null;

    if (mode === "profile") {
      exactKeys(
        payload,
        new Set(["mode", "profileName", "privateKeyPass"]),
        "profile connection",
      );
      profileName = requiredText(payload.profileName, "profile name");
      const { profiles } = loadProfiles();
      const profile = profiles.get(profileName);
      if (!profile) {
        fail(
          "SNOWFLAKE_PROFILE_NOT_FOUND",
          `Snowflake profile ${JSON.stringify(profileName)} was not found.`,
        );
      }
      options = driver.normalizeConnectionOptions
        ? driver.normalizeConnectionOptions(profile)
        : profile;
      if (payload.privateKeyPass) {
        options.privateKeyPass = requiredText(
          payload.privateKeyPass,
          "private key passphrase",
          4096,
        );
      }
      if (options.authenticator === "EXTERNALBROWSER") {
        options.openExternalBrowserCallback = openExternalBrowser;
      }
    } else if (mode === "manual") {
      options = manualConnectionOptions(payload, openExternalBrowser);
    } else {
      fail(
        "SNOWFLAKE_INVALID_REQUEST",
        `Connection mode ${JSON.stringify(mode)} is not supported.`,
      );
    }

    const connectionOptions = {
      ...options,
      application: "DRAWDB_ERD_TOOL",
      clientSessionKeepAlive: false,
      browserActionTimeout: CONNECT_TIMEOUT_MS,
    };
    let connection;
    try {
      connection = driver.createConnection(connectionOptions);
      await new Promise((resolve, reject) => {
        let settled = false;
        const timeout = setTimeout(() => {
          if (settled) return;
          settled = true;
          reject(new Error("Snowflake sign-in timed out."));
        }, CONNECT_TIMEOUT_MS);
        connection.connect((error) => {
          if (settled) return;
          settled = true;
          clearTimeout(timeout);
          if (error) reject(error);
          else resolve();
        });
      });
      const identityRows = await executeRows(
        connection,
        "SELECT CURRENT_ACCOUNT() AS ACCOUNT, CURRENT_USER() AS USERNAME, CURRENT_ROLE() AS ROLE, CURRENT_WAREHOUSE() AS WAREHOUSE",
      );
      const identity = identityRows[0] ?? {};
      const sessionId = createId();
      sessions.set(sessionId, { connection, profileName });
      return {
        sessionId,
        profileName,
        account: identity.account ?? connectionOptions.account ?? "",
        username: identity.username ?? connectionOptions.username ?? "",
        role: identity.role ?? connectionOptions.role ?? "",
        warehouse: identity.warehouse ?? connectionOptions.warehouse ?? "",
      };
    } catch (error) {
      if (connection) await destroyConnection(connection);
      fail(
        "SNOWFLAKE_CONNECTION_FAILED",
        safeErrorMessage(error, "Could not connect to Snowflake.", homeDirectory),
      );
    }
  }

  async function disconnect(sessionId) {
    const id = requiredText(sessionId, "session id");
    const session = sessions.get(id);
    if (!session) return { disconnected: false };
    sessions.delete(id);
    await destroyConnection(session.connection);
    return { disconnected: true };
  }

  async function listDatabases(sessionId) {
    try {
      const { connection } = requireSession(sessionId);
      const rows = await executeRows(connection, "SHOW DATABASES");
      return rows
        .filter((row) => typeof row.name === "string")
        .map((row) => ({
          name: row.name,
          kind: row.kind ?? "",
          comment: row.comment ?? "",
          supported: CANONICAL_IDENTIFIER.test(row.name),
        }))
        .sort((left, right) => left.name.localeCompare(right.name));
    } catch (error) {
      if (String(error?.message).startsWith("[SNOWFLAKE_")) throw error;
      fail(
        "SNOWFLAKE_DATABASE_LIST_FAILED",
        safeErrorMessage(error, "Could not list Snowflake databases.", homeDirectory),
      );
    }
  }

  async function listSchemas(sessionId, database) {
    try {
      const { connection } = requireSession(sessionId);
      const rows = await executeRows(
        connection,
        `SHOW SCHEMAS IN DATABASE ${quoteIdentifier(database, "database")}`,
      );
      return rows
        .filter((row) => typeof row.name === "string")
        .map((row) => ({
          name: row.name,
          database: row.database_name ?? database,
          comment: row.comment ?? "",
          supported: CANONICAL_IDENTIFIER.test(row.name),
        }))
        .sort((left, right) => left.name.localeCompare(right.name));
    } catch (error) {
      if (String(error?.message).startsWith("[SNOWFLAKE_")) throw error;
      fail(
        "SNOWFLAKE_SCHEMA_LIST_FAILED",
        safeErrorMessage(error, "Could not list Snowflake schemas.", homeDirectory),
      );
    }
  }

  async function listTables(sessionId, database, schema) {
    try {
      const { connection } = requireSession(sessionId);
      const rows = await executeRows(
        connection,
        `SHOW TERSE TABLES IN SCHEMA ${quoteIdentifier(database, "database")}.${quoteIdentifier(schema, "schema")}`,
      );
      return rows
        .filter((row) => typeof row.name === "string")
        .map((row) => ({
          name: row.name,
          database: row.database_name ?? database,
          schema: row.schema_name ?? schema,
          comment: row.comment ?? "",
          rows: row.rows ?? null,
          supported: CANONICAL_IDENTIFIER.test(row.name),
        }))
        .sort((left, right) => left.name.localeCompare(right.name));
    } catch (error) {
      if (String(error?.message).startsWith("[SNOWFLAKE_")) throw error;
      fail(
        "SNOWFLAKE_TABLE_LIST_FAILED",
        safeErrorMessage(error, "Could not list Snowflake tables.", homeDirectory),
      );
    }
  }

  async function reverseEngineer(payloadValue) {
    const payload = record(payloadValue, "reverse-engineering request");
    exactKeys(
      payload,
      new Set(["sessionId", "database", "schema", "tables"]),
      "reverse-engineering request",
    );
    const { connection } = requireSession(payload.sessionId);
    const database = requireCanonicalIdentifier(payload.database, "database");
    const schema = requireCanonicalIdentifier(payload.schema, "schema");
    if (
      !Array.isArray(payload.tables) ||
      payload.tables.length === 0 ||
      payload.tables.length > MAXIMUM_SELECTION_SIZE
    ) {
      fail(
        "SNOWFLAKE_INVALID_REQUEST",
        `Select between 1 and ${MAXIMUM_SELECTION_SIZE} tables.`,
      );
    }
    const tables = [...new Set(payload.tables.map((name) => requireCanonicalIdentifier(name, "table")))];
    const placeholders = tables.map(() => "?").join(", ");
    const tableFilter = `TABLE_SCHEMA = ? AND TABLE_NAME IN (${placeholders})`;
    const tableBinds = [schema, ...tables];
    const informationSchema = `${quoteIdentifier(database, "database")}.INFORMATION_SCHEMA`;

    try {
      const schemata = await executeRows(
        connection,
        `SELECT CATALOG_NAME, SCHEMA_NAME, COMMENT FROM ${informationSchema}.SCHEMATA WHERE SCHEMA_NAME = ?`,
        [schema],
      );
      const tableRows = await executeRows(
        connection,
        `SELECT TABLE_CATALOG, TABLE_SCHEMA, TABLE_NAME, TABLE_TYPE, COMMENT FROM ${informationSchema}.TABLES WHERE ${tableFilter} AND TABLE_TYPE = 'BASE TABLE' ORDER BY TABLE_NAME`,
        tableBinds,
      );
      if (tableRows.length !== tables.length) {
        const found = new Set(tableRows.map((row) => row.table_name));
        const missing = tables.filter((name) => !found.has(name));
        fail(
          "SNOWFLAKE_TABLE_NOT_FOUND",
          `Selected table metadata was not available: ${missing.join(", ")}.`,
        );
      }
      const columns = (
        await executeRows(
        connection,
        `SELECT TABLE_CATALOG, TABLE_SCHEMA, TABLE_NAME, COLUMN_NAME, ORDINAL_POSITION, COLUMN_DEFAULT, IS_NULLABLE, DATA_TYPE, CHARACTER_MAXIMUM_LENGTH, NUMERIC_PRECISION, NUMERIC_SCALE, DATETIME_PRECISION, COMMENT FROM ${informationSchema}.COLUMNS WHERE ${tableFilter} ORDER BY TABLE_NAME, ORDINAL_POSITION`,
        tableBinds,
        )
      ).map(normalizeColumnType);
      const tableConstraints = await executeRows(
        connection,
        `SELECT CONSTRAINT_CATALOG, CONSTRAINT_SCHEMA, CONSTRAINT_NAME, TABLE_CATALOG, TABLE_SCHEMA, TABLE_NAME, CONSTRAINT_TYPE FROM ${informationSchema}.TABLE_CONSTRAINTS WHERE ${tableFilter} AND CONSTRAINT_TYPE IN ('PRIMARY KEY', 'UNIQUE', 'FOREIGN KEY') ORDER BY TABLE_NAME, CONSTRAINT_NAME`,
        tableBinds,
      );
      const keyScope = `${quoteIdentifier(database, "database")}.${quoteIdentifier(schema, "schema")}`;
      const primaryKeyRows = await executeRows(
        connection,
        `SHOW PRIMARY KEYS IN SCHEMA ${keyScope}`,
      );
      const uniqueKeyRows = await executeRows(
        connection,
        `SHOW UNIQUE KEYS IN SCHEMA ${keyScope}`,
      );
      const importedKeyRows = await executeRows(
        connection,
        `SHOW IMPORTED KEYS IN SCHEMA ${keyScope}`,
      );
      const selectedTableNames = new Set(tables);
      const selectedPrimaryAndUniqueRows = [...primaryKeyRows, ...uniqueKeyRows].filter(
        (row) =>
          row.database_name === database &&
          row.schema_name === schema &&
          selectedTableNames.has(row.table_name),
      );
      // The current UI imports one schema at a time. Preserve a foreign key only
      // when both endpoints are selected, so a partial table selection never
      // manufactures a dangling relationship.
      const selectedImportedKeyRows = importedKeyRows.filter(
        (row) =>
          row.fk_database_name === database &&
          row.fk_schema_name === schema &&
          selectedTableNames.has(row.fk_table_name) &&
          row.pk_database_name === database &&
          row.pk_schema_name === schema &&
          selectedTableNames.has(row.pk_table_name),
      );
      const selectedForeignKeyNames = new Set(
        selectedImportedKeyRows.map((row) => row.fk_name),
      );
      const selectedTableConstraints = tableConstraints.filter(
        (constraint) =>
          constraint.constraint_type !== "FOREIGN KEY" ||
          selectedForeignKeyNames.has(constraint.constraint_name),
      );
      const keyColumnUsage = [
        ...selectedPrimaryAndUniqueRows.map((row) => ({
          constraint_catalog: row.database_name,
          constraint_schema: row.schema_name,
          constraint_name: row.constraint_name,
          table_catalog: row.database_name,
          table_schema: row.schema_name,
          table_name: row.table_name,
          column_name: row.column_name,
          ordinal_position: row.key_sequence,
          position_in_unique_constraint: null,
        })),
        ...selectedImportedKeyRows.map((row) => ({
          constraint_catalog: row.fk_database_name,
          constraint_schema: row.fk_schema_name,
          constraint_name: row.fk_name,
          table_catalog: row.fk_database_name,
          table_schema: row.fk_schema_name,
          table_name: row.fk_table_name,
          column_name: row.fk_column_name,
          ordinal_position: row.key_sequence,
          position_in_unique_constraint: row.key_sequence,
        })),
      ].sort(
        (left, right) =>
          left.table_name.localeCompare(right.table_name) ||
          left.constraint_name.localeCompare(right.constraint_name) ||
          left.ordinal_position - right.ordinal_position,
      );
      const referentialByConstraint = new Map();
      for (const row of selectedImportedKeyRows) {
        const key = `${row.fk_database_name}\0${row.fk_schema_name}\0${row.fk_name}`;
        if (!referentialByConstraint.has(key)) {
          referentialByConstraint.set(key, {
            constraint_catalog: row.fk_database_name,
            constraint_schema: row.fk_schema_name,
            constraint_name: row.fk_name,
            unique_constraint_catalog: row.pk_database_name,
            unique_constraint_schema: row.pk_schema_name,
            unique_constraint_name: row.pk_name,
          });
        }
      }
      const referentialConstraints = [...referentialByConstraint.values()].sort(
        (left, right) => left.constraint_name.localeCompare(right.constraint_name),
      );

      return {
        databases: [{ database_name: database }],
        schemata,
        tables: tableRows,
        columns,
        tableConstraints: selectedTableConstraints,
        keyColumnUsage,
        referentialConstraints,
      };
    } catch (error) {
      if (String(error?.message).startsWith("[SNOWFLAKE_")) throw error;
      fail(
        "SNOWFLAKE_REVERSE_ENGINEERING_FAILED",
        safeErrorMessage(
          error,
          "Could not reverse engineer the selected Snowflake tables.",
          homeDirectory,
        ),
      );
    }
  }

  async function disconnectAll() {
    const activeSessions = [...sessions.keys()];
    await Promise.all(activeSessions.map((sessionId) => disconnect(sessionId)));
  }

  return {
    listProfiles,
    connect,
    disconnect,
    disconnectAll,
    listDatabases,
    listSchemas,
    listTables,
    reverseEngineer,
  };
}
