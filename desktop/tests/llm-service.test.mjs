import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import {
  createLlmService,
  DEFAULT_LLM_MODEL,
} from "../src/electron/llmService.js";

function testDirectory(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "drawdb-llm-"));
  t.after(() => {
    fs.rmSync(directory, { recursive: true, force: true });
  });
  return directory;
}

function safeStorage(available = true) {
  return {
    isEncryptionAvailable: () => available,
    encryptString: (value) => Buffer.from(`cipher:${value}`, "utf8"),
    decryptString: (value) =>
      value.toString("utf8").replace(/^cipher:/, ""),
  };
}

function currentModel() {
  return {
    summary: "Current diagram",
    tables: [],
    relationships: [],
  };
}

function proposal() {
  return {
    summary: "Create a customer table",
    tables: [
      {
        key: "new:customer",
        name: "CUSTOMER",
        comment: "",
        columns: [
          {
            key: "new:customer-id",
            name: "CUSTOMER_ID",
            type: "NUMBER(38,0)",
            nullable: false,
            primary: true,
            unique: false,
            default: "",
            comment: "",
          },
        ],
      },
    ],
    relationships: [],
  };
}

describe("SS-014 OpenAI desktop service", () => {
  it("stores the API key only as safeStorage ciphertext and never returns it", (t) => {
    const directory = testDirectory(t);
    const service = createLlmService({
      app: { getPath: () => directory },
      safeStorage: safeStorage(),
      fetchImpl: async () => {
        throw new Error("not used");
      },
    });
    const result = service.setApiKey({ apiKey: "unit-test-api-token" });
    assert.deepEqual(result, {
      configured: true,
      model: DEFAULT_LLM_MODEL,
    });
    const credentialText = fs.readFileSync(
      path.join(directory, "llm-credentials.json"),
      "utf8",
    );
    assert.equal(credentialText.includes("unit-test-api-token"), false);
    assert.equal(JSON.stringify(result).includes("unit-test-api-token"), false);
    assert.deepEqual(service.clearApiKey(), {
      configured: false,
      model: DEFAULT_LLM_MODEL,
    });
  });

  it("uses Responses structured outputs without storing provider responses", async (t) => {
    const directory = testDirectory(t);
    let observed;
    const service = createLlmService({
      app: { getPath: () => directory },
      safeStorage: safeStorage(),
      fetchImpl: async (url, options) => {
        observed = { url, options };
        return {
          ok: true,
          status: 200,
          async json() {
            return {
              model: "gpt-5.6-sol-2026-07-01",
              output: [
                {
                  type: "message",
                  content: [
                    {
                      type: "output_text",
                      text: JSON.stringify(proposal()),
                    },
                  ],
                },
              ],
            };
          },
        };
      },
    });
    service.setApiKey({ apiKey: "unit-test-api-token" });
    const result = await service.propose({
      prompt: "Create a customer table",
      database: "snowflake",
      currentModel: currentModel(),
    });
    assert.equal(observed.url, "https://api.openai.com/v1/responses");
    assert.equal(
      observed.options.headers.Authorization,
      "Bearer unit-test-api-token",
    );
    const body = JSON.parse(observed.options.body);
    assert.equal(body.model, DEFAULT_LLM_MODEL);
    assert.deepEqual(body.reasoning, { effort: "low" });
    assert.equal(body.store, false);
    assert.equal(body.text.format.type, "json_schema");
    assert.equal(body.text.format.strict, true);
    assert.equal(observed.options.body.includes("unit-test-api-token"), false);
    assert.equal(result.proposal.tables[0].name, "CUSTOMER");
    assert.equal(result.model, "gpt-5.6-sol-2026-07-01");
  });

  it("fails closed when OS encryption is unavailable", (t) => {
    const directory = testDirectory(t);
    const service = createLlmService({
      app: { getPath: () => directory },
      safeStorage: safeStorage(false),
      fetchImpl: async () => ({ ok: true }),
    });
    assert.throws(
      () => service.setApiKey({ apiKey: "unit-test-api-token" }),
      /LLM_SECURE_STORAGE_UNAVAILABLE/,
    );
  });

  it("sanitizes provider errors and leaves proposal state to the renderer", async (t) => {
    const directory = testDirectory(t);
    const service = createLlmService({
      app: { getPath: () => directory },
      safeStorage: safeStorage(),
      fetchImpl: async () => ({
        ok: false,
        status: 401,
        async json() {
          return { error: { message: "raw provider secret details" } };
        },
      }),
    });
    service.setApiKey({ apiKey: "unit-test-api-token" });
    await assert.rejects(
      service.propose({
        prompt: "Create a customer table",
        database: "snowflake",
        currentModel: currentModel(),
      }),
      (error) =>
        /LLM_AUTHENTICATION_FAILED/.test(error.message) &&
        !error.message.includes("raw provider") &&
        !error.message.includes("unit-test-api-token"),
    );
  });
});
