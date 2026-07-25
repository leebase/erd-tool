import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, it } from "node:test";

import { createConnectionProfileStore } from "../src/electron/connectionProfiles.js";
import { createSnowflakeService } from "../src/electron/snowflakeService.js";

const temporaryDirectories = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

function temporaryDirectory() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "drawdb-connections-"));
  temporaryDirectories.push(directory);
  return directory;
}

function fakeSafeStorage() {
  return {
    isEncryptionAvailable() {
      return true;
    },
    encryptString(value) {
      return Buffer.from(`secure:${value}`, "utf8");
    },
    decryptString(value) {
      return value.toString("utf8").replace(/^secure:/, "");
    },
  };
}

function fakeSnowflakeDriver() {
  const observed = { connectionOptions: null, destroyed: 0 };
  const connection = {
    connect(callback) {
      queueMicrotask(() => callback());
    },
    execute({ sqlText, complete }) {
      queueMicrotask(() => {
        if (sqlText.startsWith("SELECT CURRENT_ACCOUNT")) {
          complete(undefined, {}, [
            {
              ACCOUNT: "ACME",
              USERNAME: "LEE",
              ROLE: "ANALYST",
              WAREHOUSE: "COMPUTE_WH",
            },
          ]);
        } else {
          complete(undefined, {}, []);
        }
      });
      return { cancel(callback) { callback?.(); } };
    },
    destroy(callback) {
      observed.destroyed += 1;
      callback?.();
    },
  };
  return {
    observed,
    createConnection(options) {
      observed.connectionOptions = options;
      return connection;
    },
  };
}

describe("SS-013 persistent connection profiles", () => {
  it("persists provider-typed Snowflake and SQLite profiles without plaintext secrets", () => {
    const userDataPath = temporaryDirectory();
    const store = createConnectionProfileStore({
      userDataPath,
      safeStorage: fakeSafeStorage(),
      createId: (() => {
        let counter = 0;
        return () => `profile-${++counter}`;
      })(),
    });

    const snowflake = store.createProfile({
      provider: "snowflake",
      name: "Analytics Snowflake",
      settings: {
        account: "ACME",
        username: "LEE",
        authenticator: "SNOWFLAKE",
        warehouse: "COMPUTE_WH",
        role: "ANALYST",
        database: "CHINOOK",
        schema: "PUBLIC",
      },
      secrets: { password: "super-secret" },
    });
    const sqlite = store.createProfile({
      provider: "sqlite",
      name: "Local SQLite",
      settings: { databasePath: path.join(userDataPath, "local.sqlite") },
      secrets: { password: "ignored" },
    });

    assert.equal(snowflake.id, "profile-1");
    assert.equal(sqlite.provider, "sqlite");
    assert.deepEqual(
      store.listProfiles().map(({ provider }) => provider),
      ["snowflake", "sqlite"],
    );
    assert.equal(
      store.listProfiles()[0].capabilities.reverseEngineering,
      true,
    );
    assert.equal(
      store.listProfiles()[1].capabilities.reverseEngineering,
      false,
    );

    const profilesJson = fs.readFileSync(store.paths.profilesPath, "utf8");
    assert.match(profilesJson, /Analytics Snowflake/);
    assert.match(profilesJson, /Local SQLite/);
    assert.doesNotMatch(profilesJson, /super-secret|password|privateKeyPass/i);

    const secretsJson = fs.readFileSync(store.paths.secretsPath, "utf8");
    assert.match(secretsJson, /c2VjdXJlOnN1cGVyLXNlY3JldA==/);
    assert.doesNotMatch(secretsJson, /super-secret/);

    const reopened = createConnectionProfileStore({
      userDataPath,
      safeStorage: fakeSafeStorage(),
    });
    assert.equal(reopened.listProfiles().length, 2);
    assert.equal(reopened.listProfiles()[0].settings.account, "ACME");
  });

  it("supports CRUD, duplicate, provider settings, and capability-aware forward export", () => {
    const userDataPath = temporaryDirectory();
    const sqlitePath = path.join(userDataPath, "warehouse.sqlite");
    fs.writeFileSync(sqlitePath, "", "utf8");
    const store = createConnectionProfileStore({
      userDataPath,
      safeStorage: fakeSafeStorage(),
      createId: (() => {
        let counter = 0;
        return () => `profile-${++counter}`;
      })(),
    });

    const sqlite = store.createProfile({
      provider: "sqlite",
      name: "Warehouse",
      settings: { databasePath: sqlitePath },
      secrets: {},
    });
    assert.deepEqual(store.testProfile(sqlite.id), {
      ok: true,
      provider: "sqlite",
      message: "SQLite database file is available.",
    });

    const updated = store.updateProfile(sqlite.id, {
      name: "Warehouse Copy Source",
      settings: { databasePath: sqlitePath },
    });
    assert.equal(updated.name, "Warehouse Copy Source");
    const duplicated = store.duplicateProfile(sqlite.id);
    assert.equal(duplicated.name, "Warehouse Copy Source copy");
    assert.notEqual(duplicated.id, sqlite.id);

    assert.deepEqual(
      store.forwardEngineer({
        profileId: sqlite.id,
        database: "sqlite",
        contents: 'CREATE TABLE "A" ("ID" INTEGER);\n',
      }),
      {
        action: "export",
        deployDdl: false,
        provider: "sqlite",
        profileId: sqlite.id,
      },
    );
    assert.equal(store.deleteProfile(sqlite.id).deleted, true);
    assert.equal(store.listProfiles().length, 1);
    assert.throws(
      () =>
        store.forwardEngineer({
          profileId: duplicated.id,
          database: "snowflake",
          contents: "CREATE TABLE A (ID NUMBER);\n",
        }),
      /CONNECTION_PROFILE_DATABASE_MISMATCH/,
    );
  });

  it("resolves saved Snowflake credentials only inside the main-process service", async () => {
    const userDataPath = temporaryDirectory();
    const store = createConnectionProfileStore({
      userDataPath,
      safeStorage: fakeSafeStorage(),
      createId: () => "saved-snowflake",
    });
    store.createProfile({
      provider: "snowflake",
      name: "Saved Snowflake",
      settings: {
        account: "ACME",
        username: "LEE",
        authenticator: "SNOWFLAKE",
        warehouse: "COMPUTE_WH",
        role: "ANALYST",
      },
      secrets: { password: "super-secret" },
    });

    const driver = fakeSnowflakeDriver();
    const service = createSnowflakeService({
      driver,
      createId: () => "session-1",
      savedProfileResolver: (profileId) =>
        store.resolveSnowflakeConnection(profileId),
    });
    const session = await service.connect({
      mode: "savedProfile",
      profileId: "saved-snowflake",
    });

    assert.equal(session.sessionId, "session-1");
    assert.equal(driver.observed.connectionOptions.password, "super-secret");
    assert.doesNotMatch(JSON.stringify(store.listProfiles()), /super-secret/);
    assert.doesNotMatch(JSON.stringify(session), /super-secret|password|token/i);
    await service.disconnect("session-1");
    assert.equal(driver.observed.destroyed, 1);
  });

  it("fails closed when secure storage is unavailable for Snowflake secrets", () => {
    const userDataPath = temporaryDirectory();
    const store = createConnectionProfileStore({
      userDataPath,
      safeStorage: {
        isEncryptionAvailable() {
          return false;
        },
      },
    });

    assert.throws(
      () =>
        store.createProfile({
          provider: "snowflake",
          name: "Blocked",
          settings: {
            account: "ACME",
            username: "LEE",
            authenticator: "SNOWFLAKE",
          },
          secrets: { password: "super-secret" },
        }),
      /CONNECTION_SECRET_STORAGE_UNAVAILABLE/,
    );
  });
});
