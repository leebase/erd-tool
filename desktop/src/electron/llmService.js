import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { Buffer } from "node:buffer";
import {
  logicalModelJsonSchema,
  validateLogicalModel,
} from "../erdTool/logicalModel.js";

export const DEFAULT_LLM_MODEL = "gpt-5.6-sol";
const RESPONSES_URL = "https://api.openai.com/v1/responses";
const SECRET_FILE = "llm-credentials.json";
const MAX_PROMPT_LENGTH = 10_000;
const MAX_MODEL_BYTES = 2 * 1024 * 1024;
const REQUEST_TIMEOUT_MS = 60_000;

const instructions = `Create a reviewable database schema proposal.

Success means:
- return the complete desired logical model using the supplied JSON schema
- preserve every existing table, column, and relationship unless the user explicitly asks to remove or replace it
- reuse the exact key of every existing object that remains
- give new objects stable keys beginning with "new:"
- use legal unquoted identifiers for the selected database; Snowflake identifiers must be uppercase
- use only data types already represented by the current database
- keep relationship column arrays aligned and reference keys present in the proposed model
- put no credentials, connection settings, SQL, prose outside the schema, or executable instructions in the result

The result is only a proposal. The application will validate it and require explicit user acceptance before changing the diagram.`;

function serviceError(code, message) {
  return new Error(`[${code}] ${message}`);
}

function exactRecord(value, keys, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw serviceError("LLM_INVALID_REQUEST", `${label} must be an object.`);
  }
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (
    actual.length !== expected.length ||
    actual.some((key, index) => key !== expected[index])
  ) {
    throw serviceError(
      "LLM_INVALID_REQUEST",
      `${label} has unexpected or missing fields.`,
    );
  }
  return value;
}

function requireEncryption(safeStorage) {
  if (
    !safeStorage ||
    typeof safeStorage.isEncryptionAvailable !== "function" ||
    !safeStorage.isEncryptionAvailable() ||
    typeof safeStorage.encryptString !== "function" ||
    typeof safeStorage.decryptString !== "function"
  ) {
    throw serviceError(
      "LLM_SECURE_STORAGE_UNAVAILABLE",
      "Secure credential storage is unavailable on this device.",
    );
  }
}

function atomicWrite(filePath, contents) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  try {
    fs.writeFileSync(temporaryPath, contents, {
      encoding: "utf8",
      flag: "wx",
      mode: 0o600,
    });
    fs.renameSync(temporaryPath, filePath);
  } finally {
    if (fs.existsSync(temporaryPath)) fs.rmSync(temporaryPath, { force: true });
  }
}

function parseResponseText(response) {
  for (const output of response?.output ?? []) {
    if (output?.type !== "message") continue;
    for (const content of output.content ?? []) {
      if (content?.type === "refusal") {
        throw serviceError(
          "LLM_REQUEST_REFUSED",
          "The model declined this schema request.",
        );
      }
      if (content?.type === "output_text" && typeof content.text === "string") {
        return content.text;
      }
    }
  }
  if (typeof response?.output_text === "string") return response.output_text;
  throw serviceError(
    "LLM_INVALID_RESPONSE",
    "The model returned no schema proposal.",
  );
}

function providerError(status) {
  if (status === 401 || status === 403) {
    return serviceError(
      "LLM_AUTHENTICATION_FAILED",
      "The OpenAI API key was rejected.",
    );
  }
  if (status === 429) {
    return serviceError(
      "LLM_RATE_LIMITED",
      "The schema service is busy or has reached its usage limit.",
    );
  }
  if (status >= 500) {
    return serviceError(
      "LLM_PROVIDER_UNAVAILABLE",
      "The schema service is temporarily unavailable.",
    );
  }
  return serviceError(
    "LLM_PROVIDER_ERROR",
    "The schema service could not complete this request.",
  );
}

export function createLlmService({
  app,
  safeStorage,
  fetchImpl = globalThis.fetch,
  model = DEFAULT_LLM_MODEL,
} = {}) {
  if (!app) {
    throw new Error("createLlmService requires an Electron app adapter");
  }
  if (typeof fetchImpl !== "function") {
    throw new Error("createLlmService requires fetch");
  }
  function credentialsPath() {
    if (typeof app.getPath !== "function") {
      throw serviceError(
        "LLM_SECURE_STORAGE_UNAVAILABLE",
        "Secure credential storage is unavailable on this device.",
      );
    }
    return path.join(app.getPath("userData"), SECRET_FILE);
  }

  function status() {
    const filePath =
      typeof app.getPath === "function" ? credentialsPath() : null;
    return {
      configured: Boolean(filePath && fs.existsSync(filePath)),
      model,
    };
  }

  function setApiKey(payload) {
    const request = exactRecord(payload, ["apiKey"], "API key request");
    if (
      typeof request.apiKey !== "string" ||
      !request.apiKey.trim() ||
      request.apiKey.length > 500
    ) {
      throw serviceError(
        "LLM_INVALID_REQUEST",
        "OpenAI API key is missing or invalid.",
      );
    }
    requireEncryption(safeStorage);
    const encryptedApiKey = safeStorage
      .encryptString(request.apiKey.trim())
      .toString("base64");
    const filePath = credentialsPath();
    atomicWrite(
      filePath,
      `${JSON.stringify({ version: 1, encryptedApiKey }, null, 2)}\n`,
    );
    return status();
  }

  function clearApiKey() {
    const filePath = credentialsPath();
    if (fs.existsSync(filePath)) fs.rmSync(filePath, { force: true });
    return status();
  }

  function resolveApiKey() {
    requireEncryption(safeStorage);
    const filePath = credentialsPath();
    if (!fs.existsSync(filePath)) {
      throw serviceError(
        "LLM_NOT_CONFIGURED",
        "Configure an OpenAI API key before generating a schema.",
      );
    }
    try {
      const stored = JSON.parse(fs.readFileSync(filePath, "utf8"));
      if (
        stored?.version !== 1 ||
        typeof stored.encryptedApiKey !== "string" ||
        Object.keys(stored).sort().join(",") !== "encryptedApiKey,version"
      ) {
        throw new Error("invalid credential record");
      }
      return safeStorage.decryptString(
        Buffer.from(stored.encryptedApiKey, "base64"),
      );
    } catch {
      throw serviceError(
        "LLM_CREDENTIAL_READ_FAILED",
        "The saved API key could not be read. Configure it again.",
      );
    }
  }

  async function propose(payload) {
    const request = exactRecord(
      payload,
      ["prompt", "database", "currentModel"],
      "schema proposal request",
    );
    if (
      typeof request.prompt !== "string" ||
      !request.prompt.trim() ||
      request.prompt.length > MAX_PROMPT_LENGTH
    ) {
      throw serviceError(
        "LLM_INVALID_REQUEST",
        `Schema prompt must contain 1-${MAX_PROMPT_LENGTH} characters.`,
      );
    }
    if (typeof request.database !== "string") {
      throw serviceError("LLM_INVALID_REQUEST", "Database is invalid.");
    }
    const currentModel = validateLogicalModel(
      request.currentModel,
      request.database,
    );
    if (Buffer.byteLength(JSON.stringify(currentModel), "utf8") > MAX_MODEL_BYTES) {
      throw serviceError(
        "LLM_INVALID_REQUEST",
        "Current diagram is too large for schema authoring.",
      );
    }

    let apiKey = resolveApiKey();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const response = await fetchImpl(RESPONSES_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        signal: controller.signal,
        body: JSON.stringify({
          model,
          reasoning: { effort: "low" },
          instructions,
          input: JSON.stringify({
            request: request.prompt.trim(),
            database: request.database,
            currentModel,
          }),
          text: {
            format: {
              type: "json_schema",
              name: "database_schema_proposal",
              strict: true,
              schema: logicalModelJsonSchema,
            },
          },
          max_output_tokens: 16_000,
          store: false,
        }),
      });
      if (!response?.ok) throw providerError(Number(response?.status) || 500);
      const providerResponse = await response.json();
      let parsed;
      try {
        parsed = JSON.parse(parseResponseText(providerResponse));
      } catch (error) {
        if (String(error?.message).startsWith("[LLM_")) throw error;
        throw serviceError(
          "LLM_INVALID_RESPONSE",
          "The model returned malformed schema JSON.",
        );
      }
      return {
        proposal: validateLogicalModel(parsed, request.database),
        model: String(providerResponse?.model || model),
      };
    } catch (error) {
      if (error?.name === "AbortError") {
        throw serviceError(
          "LLM_REQUEST_TIMEOUT",
          "The schema request timed out without changing the diagram.",
        );
      }
      if (String(error?.message).startsWith("[LLM_")) throw error;
      throw serviceError(
        "LLM_PROVIDER_UNAVAILABLE",
        "The schema service is unavailable. The diagram was not changed.",
      );
    } finally {
      clearTimeout(timeout);
      apiKey = "";
    }
  }

  return Object.freeze({
    status,
    setApiKey,
    clearApiKey,
    propose,
  });
}
