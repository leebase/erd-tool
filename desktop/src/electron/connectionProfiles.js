import fs from "node:fs";
import path from "node:path";
import { Buffer } from "node:buffer";
import process from "node:process";
import { randomUUID } from "node:crypto";

const STORE_VERSION = 1;
const PROVIDERS = new Set(["snowflake", "sqlite"]);
const SECRET_FIELDS = new Set(["password", "privateKeyPass"]);
const MAXIMUM_SQL_BYTES = 25 * 1024 * 1024;

const PROVIDER_CAPABILITIES = Object.freeze({
  snowflake: Object.freeze({
    reverseEngineering: true,
    forwardEngineering: Object.freeze({ exportDdl: true, deployDdl: false }),
  }),
  sqlite: Object.freeze({
    reverseEngineering: false,
    forwardEngineering: Object.freeze({ exportDdl: true, deployDdl: false }),
  }),
});

const SETTINGS_KEYS = Object.freeze({
  snowflake: new Set([
    "account",
    "username",
    "authenticator",
    "warehouse",
    "role",
    "database",
    "schema",
    "privateKeyPath",
  ]),
  sqlite: new Set(["databasePath"]),
});

function fail(code, message) {
  throw new Error(`[${code}] ${message}`);
}

function record(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    fail("CONNECTION_PROFILE_INVALID", `${label} must be an object.`);
  }
  return value;
}

function optionalText(value, label, maximum = 4096) {
  if (value === undefined || value === null || value === "") return "";
  if (typeof value !== "string") {
    fail("CONNECTION_PROFILE_INVALID", `${label} must be a string.`);
  }
  const result = value.trim();
  if (result.length > maximum) {
    fail("CONNECTION_PROFILE_INVALID", `${label} is too long.`);
  }
  return result;
}

function requiredText(value, label, maximum = 255) {
  const result = optionalText(value, label, maximum);
  if (!result) {
    fail("CONNECTION_PROFILE_INVALID", `${label} is required.`);
  }
  return result;
}

function exactKeys(value, allowed, label) {
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) {
      fail(
        "CONNECTION_PROFILE_INVALID",
        `${label} contains an unexpected field: ${key}.`,
      );
    }
  }
}

function nowIso() {
  return new Date().toISOString();
}

function clonePublicProfile(profile) {
  return {
    id: profile.id,
    provider: profile.provider,
    name: profile.name,
    settings: { ...profile.settings },
    capabilities: JSON.parse(JSON.stringify(profile.capabilities)),
    createdAt: profile.createdAt,
    updatedAt: profile.updatedAt,
  };
}

function sanitizeSettings(provider, value) {
  const settings = record(value ?? {}, "profile settings");
  exactKeys(settings, SETTINGS_KEYS[provider], `${provider} settings`);

  if (provider === "snowflake") {
    const authenticator =
      optionalText(settings.authenticator, "authenticator") || "EXTERNALBROWSER";
    const supportedAuthenticators = new Set([
      "EXTERNALBROWSER",
      "SNOWFLAKE",
      "USERNAME_PASSWORD_MFA",
      "SNOWFLAKE_JWT",
    ]);
    if (!supportedAuthenticators.has(authenticator)) {
      fail(
        "CONNECTION_PROFILE_INVALID",
        `Snowflake authenticator ${JSON.stringify(authenticator)} is not supported.`,
      );
    }
    return {
      account: requiredText(settings.account, "Snowflake account"),
      username: requiredText(settings.username, "Snowflake username"),
      authenticator,
      warehouse: optionalText(settings.warehouse, "Snowflake warehouse"),
      role: optionalText(settings.role, "Snowflake role"),
      database: optionalText(settings.database, "Snowflake database"),
      schema: optionalText(settings.schema, "Snowflake schema"),
      privateKeyPath: optionalText(
        settings.privateKeyPath,
        "Snowflake private-key path",
        4096,
      ),
    };
  }

  return {
    databasePath: requiredText(settings.databasePath, "SQLite database path", 4096),
  };
}

function sanitizeSecrets(provider, value) {
  const source = record(value ?? {}, "profile secrets");
  exactKeys(source, SECRET_FIELDS, "profile secrets");
  if (provider !== "snowflake") return {};

  const password = optionalText(source.password, "Snowflake password", 4096);
  const privateKeyPass = optionalText(
    source.privateKeyPass,
    "Snowflake private-key passphrase",
    4096,
  );
  return {
    ...(password ? { password } : {}),
    ...(privateKeyPass ? { privateKeyPass } : {}),
  };
}

function validateProfilePayload(payloadValue, { partial = false } = {}) {
  const payload = record(payloadValue, "connection profile");
  exactKeys(
    payload,
    new Set(["id", "provider", "name", "settings", "secrets"]),
    "connection profile",
  );
  const provider =
    partial && payload.provider === undefined
      ? undefined
      : requiredText(payload.provider, "provider");
  if (provider !== undefined && !PROVIDERS.has(provider)) {
    fail(
      "CONNECTION_PROVIDER_UNSUPPORTED",
      `Connection provider ${JSON.stringify(provider)} is not supported.`,
    );
  }
  return {
    provider,
    name:
      partial && payload.name === undefined
        ? undefined
        : requiredText(payload.name, "profile name"),
    settings:
      provider && payload.settings !== undefined
        ? sanitizeSettings(provider, payload.settings)
        : undefined,
    secrets:
      provider && payload.secrets !== undefined
        ? sanitizeSecrets(provider, payload.secrets)
        : undefined,
  };
}

function parseStoreFile(fsModule, filePath, fallback) {
  if (!fsModule.existsSync(filePath)) return fallback;
  const parsed = JSON.parse(fsModule.readFileSync(filePath, "utf8"));
  return parsed && typeof parsed === "object" && !Array.isArray(parsed)
    ? parsed
    : fallback;
}

function writeJson(fsModule, filePath, value) {
  fsModule.mkdirSync(path.dirname(filePath), { recursive: true });
  fsModule.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

export function createConnectionProfileStore({
  app,
  safeStorage,
  fsModule = fs,
  createId = randomUUID,
  userDataPath,
} = {}) {
  const root =
    userDataPath ??
    (typeof app?.getPath === "function"
      ? app.getPath("userData")
      : path.join(process.cwd(), ".drawdb-user-data"));
  const profilesPath = path.join(root, "connection-profiles.json");
  const secretsPath = path.join(root, "connection-profile-secrets.json");

  function readProfiles() {
    const stored = parseStoreFile(fsModule, profilesPath, {
      version: STORE_VERSION,
      profiles: [],
    });
    return Array.isArray(stored.profiles)
      ? stored.profiles
          .filter((profile) => profile && typeof profile === "object")
          .filter((profile) => PROVIDERS.has(profile.provider))
          .map((profile) => ({
            id: String(profile.id),
            provider: profile.provider,
            name: String(profile.name),
            settings: sanitizeSettings(profile.provider, profile.settings ?? {}),
            capabilities: PROVIDER_CAPABILITIES[profile.provider],
            createdAt: String(profile.createdAt || nowIso()),
            updatedAt: String(profile.updatedAt || profile.createdAt || nowIso()),
          }))
      : [];
  }

  function writeProfiles(profiles) {
    writeJson(fsModule, profilesPath, {
      version: STORE_VERSION,
      profiles: profiles.map((profile) => ({
        id: profile.id,
        provider: profile.provider,
        name: profile.name,
        settings: profile.settings,
        capabilities: profile.capabilities,
        createdAt: profile.createdAt,
        updatedAt: profile.updatedAt,
      })),
    });
  }

  function readSecrets() {
    const stored = parseStoreFile(fsModule, secretsPath, {
      version: STORE_VERSION,
      secrets: {},
    });
    return stored.secrets && typeof stored.secrets === "object"
      ? stored.secrets
      : {};
  }

  function writeSecrets(secrets) {
    writeJson(fsModule, secretsPath, { version: STORE_VERSION, secrets });
  }

  function encryptSecret(value) {
    if (!value) return undefined;
    if (
      !safeStorage ||
      typeof safeStorage.isEncryptionAvailable !== "function" ||
      !safeStorage.isEncryptionAvailable()
    ) {
      fail(
        "CONNECTION_SECRET_STORAGE_UNAVAILABLE",
        "OS-backed secure storage is unavailable. Secrets were not saved.",
      );
    }
    return safeStorage.encryptString(value).toString("base64");
  }

  function decryptSecret(value) {
    if (!value) return "";
    return safeStorage.decryptString(Buffer.from(value, "base64"));
  }

  function updateProfileSecrets(profileId, secretsValue) {
    if (secretsValue === undefined) return;
    const encrypted = {};
    for (const [key, value] of Object.entries(secretsValue)) {
      const encryptedValue = encryptSecret(value);
      if (encryptedValue) encrypted[key] = encryptedValue;
    }
    const secrets = readSecrets();
    if (Object.keys(encrypted).length) {
      secrets[profileId] = encrypted;
    } else {
      delete secrets[profileId];
    }
    writeSecrets(secrets);
  }

  function listProfiles() {
    return readProfiles()
      .map(clonePublicProfile)
      .sort(
        (left, right) =>
          left.provider.localeCompare(right.provider) ||
          left.name.localeCompare(right.name),
      );
  }

  function createProfile(payloadValue) {
    const payload = validateProfilePayload(payloadValue);
    const profiles = readProfiles();
    const timestamp = nowIso();
    const profile = {
      id: createId(),
      provider: payload.provider,
      name: payload.name,
      settings: payload.settings,
      capabilities: PROVIDER_CAPABILITIES[payload.provider],
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    profiles.push(profile);
    updateProfileSecrets(profile.id, payload.secrets ?? {});
    writeProfiles(profiles);
    return clonePublicProfile(profile);
  }

  function updateProfile(profileIdValue, payloadValue) {
    const profileId = requiredText(profileIdValue, "profile id");
    const profiles = readProfiles();
    const index = profiles.findIndex((profile) => profile.id === profileId);
    if (index < 0) {
      fail("CONNECTION_PROFILE_NOT_FOUND", "Connection profile was not found.");
    }
    const existing = profiles[index];
    const payload = validateProfilePayload(
      { provider: existing.provider, ...record(payloadValue, "connection profile") },
      { partial: true },
    );
    if (payload.provider && payload.provider !== existing.provider) {
      fail(
        "CONNECTION_PROVIDER_UNSUPPORTED",
        "Connection profile provider cannot be changed.",
      );
    }
    const profile = {
      ...existing,
      name: payload.name ?? existing.name,
      settings: payload.settings ?? existing.settings,
      updatedAt: nowIso(),
    };
    profiles[index] = profile;
    writeProfiles(profiles);
    updateProfileSecrets(profile.id, payload.secrets);
    return clonePublicProfile(profile);
  }

  function duplicateProfile(profileIdValue) {
    const profileId = requiredText(profileIdValue, "profile id");
    const profiles = readProfiles();
    const source = profiles.find((profile) => profile.id === profileId);
    if (!source) {
      fail("CONNECTION_PROFILE_NOT_FOUND", "Connection profile was not found.");
    }
    const timestamp = nowIso();
    const profile = {
      ...source,
      id: createId(),
      name: `${source.name} copy`,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    profiles.push(profile);
    writeProfiles(profiles);
    const secrets = readSecrets();
    if (secrets[source.id]) {
      secrets[profile.id] = { ...secrets[source.id] };
      writeSecrets(secrets);
    }
    return clonePublicProfile(profile);
  }

  function deleteProfile(profileIdValue) {
    const profileId = requiredText(profileIdValue, "profile id");
    const profiles = readProfiles();
    const nextProfiles = profiles.filter((profile) => profile.id !== profileId);
    if (nextProfiles.length === profiles.length) {
      fail("CONNECTION_PROFILE_NOT_FOUND", "Connection profile was not found.");
    }
    writeProfiles(nextProfiles);
    const secrets = readSecrets();
    delete secrets[profileId];
    writeSecrets(secrets);
    return { deleted: true };
  }

  function getProfile(profileIdValue) {
    const profileId = requiredText(profileIdValue, "profile id");
    const profile = readProfiles().find((item) => item.id === profileId);
    if (!profile) {
      fail("CONNECTION_PROFILE_NOT_FOUND", "Connection profile was not found.");
    }
    return profile;
  }

  function resolveSnowflakeConnection(profileIdValue) {
    const profile = getProfile(profileIdValue);
    if (profile.provider !== "snowflake") {
      fail(
        "CONNECTION_PROVIDER_UNSUPPORTED",
        "The selected connection is not a Snowflake profile.",
      );
    }
    const secretRecord = readSecrets()[profile.id] ?? {};
    const secrets = Object.fromEntries(
      Object.entries(secretRecord).map(([key, value]) => [
        key,
        decryptSecret(value),
      ]),
    );
    return {
      mode: "manual",
      ...profile.settings,
      ...(secrets.password ? { password: secrets.password } : {}),
      ...(secrets.privateKeyPass
        ? { privateKeyPass: secrets.privateKeyPass }
        : {}),
    };
  }

  function testProfile(profileIdValue) {
    const profile = getProfile(profileIdValue);
    if (profile.provider === "sqlite") {
      const exists = fsModule.existsSync(profile.settings.databasePath);
      return {
        ok: exists,
        provider: profile.provider,
        message: exists
          ? "SQLite database file is available."
          : "SQLite database file was not found.",
      };
    }
    return {
      ok: true,
      provider: profile.provider,
      message: "Snowflake profile is saved. Use reverse engineering to open a live session.",
    };
  }

  function forwardEngineer(payloadValue) {
    const payload = record(payloadValue, "forward-engineering request");
    exactKeys(
      payload,
      new Set(["profileId", "contents", "database"]),
      "forward-engineering request",
    );
    const profile = getProfile(payload.profileId);
    if (profile.provider !== payload.database) {
      fail(
        "CONNECTION_PROFILE_DATABASE_MISMATCH",
        "The selected connection provider does not match the open diagram.",
      );
    }
    if (!profile.capabilities.forwardEngineering.exportDdl) {
      fail(
        "CONNECTION_FORWARD_UNSUPPORTED",
        "This connection does not support DDL export.",
      );
    }
    if (
      typeof payload.contents !== "string" ||
      !payload.contents.trim() ||
      Buffer.byteLength(payload.contents, "utf8") > MAXIMUM_SQL_BYTES
    ) {
      fail("CONNECTION_PROFILE_INVALID", "DDL contents are invalid.");
    }
    return {
      action: "export",
      deployDdl: profile.capabilities.forwardEngineering.deployDdl,
      provider: profile.provider,
      profileId: profile.id,
    };
  }

  return {
    paths: { profilesPath, secretsPath },
    listProfiles,
    createProfile,
    updateProfile,
    duplicateProfile,
    deleteProfile,
    getProfile,
    resolveSnowflakeConnection,
    testProfile,
    forwardEngineer,
  };
}
