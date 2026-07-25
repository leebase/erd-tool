import {
  canonicalProjectToDiagram,
  diagramToCanonicalProject,
  toSnowflakeIdentifier,
} from "./projectAdapter.js";
import { exportSQL } from "../utils/exportSQL/index.js";

const NATIVE_PROJECT_SAVE_REQUEST = "drawdb:native-project-save-request";
const NATIVE_PROJECT_SAVE_AS_REQUEST = "drawdb:native-project-save-as-request";
const NATIVE_PROJECT_OPEN_REQUEST = "drawdb:native-project-open-request";
const DESKTOP_AUTO_ARRANGE_REQUEST =
  "drawdb:desktop-auto-arrange-request";
const CONNECTIONS_MANAGE_REQUEST = "drawdb:connections-manage-request";
const CONNECTIONS_REVERSE_ENGINEER_REQUEST =
  "drawdb:connections-reverse-engineer-request";
const CONNECTIONS_FORWARD_ENGINEER_REQUEST =
  "drawdb:connections-forward-engineer-request";

function projectFilesApi() {
  return globalThis.window?.drawdbDesktop?.projectFiles ?? null;
}

function ddlExportApi() {
  return globalThis.window?.drawdbDesktop?.ddlExport ?? null;
}

function snowflakeApi() {
  return globalThis.window?.drawdbDesktop?.snowflake ?? null;
}

function connectionsApi() {
  return globalThis.window?.drawdbDesktop?.connections ?? null;
}

function llmApi() {
  return globalThis.window?.drawdbDesktop?.llm ?? null;
}

function saveRequest(diagram) {
  const project = diagramToCanonicalProject(diagram);
  let basename = "erd-project";
  try {
    basename = toSnowflakeIdentifier(String(diagram.title || basename));
  } catch {
    // Keep a stable fallback for titles which cannot form an identifier.
  }
  return {
    contents: `${JSON.stringify(project, null, 2)}\n`,
    suggestedName: `${basename}.erd.json`,
  };
}

export function hasDesktopProjectFiles() {
  const api = projectFilesApi();
  return Boolean(api?.open && api?.save && api?.saveAs);
}

export function hasDesktopDdlExport() {
  return typeof ddlExportApi()?.save === "function";
}

export function hasDesktopSnowflake() {
  const api = snowflakeApi();
  return Boolean(
    api?.listProfiles &&
      api?.connect &&
      api?.disconnect &&
      api?.listDatabases &&
      api?.listSchemas &&
      api?.listTables &&
      api?.reverseEngineer,
  );
}

export function hasDesktopConnections() {
  const api = connectionsApi();
  return Boolean(
    api?.list &&
      api?.create &&
      api?.update &&
      api?.duplicate &&
      api?.delete &&
      api?.test &&
      api?.forwardEngineer,
  );
}

export function hasDesktopLlm() {
  const api = llmApi();
  return Boolean(
    api?.status &&
      api?.setApiKey &&
      api?.clearApiKey &&
      api?.proposeSchema,
  );
}

function requireLlmApi() {
  const api = llmApi();
  if (!hasDesktopLlm()) {
    throw new Error(
      "Conversational schema authoring is available in the desktop app",
    );
  }
  return api;
}

export async function getDesktopLlmStatus() {
  const status = await requireLlmApi().status();
  if (
    !status ||
    typeof status.configured !== "boolean" ||
    typeof status.model !== "string"
  ) {
    throw new Error("Schema provider returned an invalid status");
  }
  return status;
}

export async function setDesktopLlmApiKey(apiKey) {
  return requireLlmApi().setApiKey(apiKey);
}

export async function clearDesktopLlmApiKey() {
  return requireLlmApi().clearApiKey();
}

export async function proposeDesktopSchema(request) {
  const result = await requireLlmApi().proposeSchema(request);
  if (
    !result ||
    typeof result !== "object" ||
    !result.proposal ||
    typeof result.model !== "string"
  ) {
    throw new Error("Schema provider returned an invalid proposal");
  }
  return result;
}

function requireConnectionsApi() {
  const api = connectionsApi();
  if (!hasDesktopConnections()) {
    throw new Error("Saved connections are unavailable outside the desktop app");
  }
  return api;
}

export async function listDesktopConnections() {
  const profiles = await requireConnectionsApi().list();
  if (!Array.isArray(profiles)) {
    throw new Error("Connection profile discovery returned an invalid result");
  }
  return profiles;
}

export async function createDesktopConnection(profile) {
  return requireConnectionsApi().create(profile);
}

export async function updateDesktopConnection(profileId, profile) {
  return requireConnectionsApi().update(profileId, profile);
}

export async function duplicateDesktopConnection(profileId) {
  return requireConnectionsApi().duplicate(profileId);
}

export async function deleteDesktopConnection(profileId) {
  return requireConnectionsApi().delete(profileId);
}

export async function testDesktopConnection(profileId) {
  return requireConnectionsApi().test(profileId);
}

export async function forwardEngineerDesktopConnection(request) {
  return requireConnectionsApi().forwardEngineer(request);
}

function requireSnowflakeApi() {
  const api = snowflakeApi();
  if (!hasDesktopSnowflake()) {
    throw new Error("Live Snowflake connections are unavailable outside the desktop app");
  }
  return api;
}

export async function listDesktopSnowflakeProfiles() {
  const profiles = await requireSnowflakeApi().listProfiles();
  if (!Array.isArray(profiles)) {
    throw new Error("Snowflake profile discovery returned an invalid result");
  }
  return profiles;
}

export async function connectDesktopSnowflake(request) {
  const result = await requireSnowflakeApi().connect(request);
  if (typeof result?.sessionId !== "string" || !result.sessionId) {
    throw new Error("Snowflake connection returned an invalid session");
  }
  return result;
}

export async function disconnectDesktopSnowflake(sessionId) {
  return requireSnowflakeApi().disconnect(sessionId);
}

export async function listDesktopSnowflakeDatabases(sessionId) {
  const databases = await requireSnowflakeApi().listDatabases(sessionId);
  if (!Array.isArray(databases)) {
    throw new Error("Snowflake database discovery returned an invalid result");
  }
  return databases;
}

export async function listDesktopSnowflakeSchemas(sessionId, database) {
  const schemas = await requireSnowflakeApi().listSchemas(sessionId, database);
  if (!Array.isArray(schemas)) {
    throw new Error("Snowflake schema discovery returned an invalid result");
  }
  return schemas;
}

export async function listDesktopSnowflakeTables(
  sessionId,
  database,
  schema,
) {
  const tables = await requireSnowflakeApi().listTables(
    sessionId,
    database,
    schema,
  );
  if (!Array.isArray(tables)) {
    throw new Error("Snowflake table discovery returned an invalid result");
  }
  return tables;
}

export async function reverseEngineerDesktopSnowflake(request) {
  const metadata = await requireSnowflakeApi().reverseEngineer(request);
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    throw new Error("Snowflake reverse engineering returned invalid metadata");
  }
  return metadata;
}

export async function exportDesktopSnowflakeDDL(
  diagram,
  generatedContents,
  suggestedBasename,
) {
  const api = ddlExportApi();
  if (typeof api?.save !== "function") {
    throw new Error("Native DDL export is unavailable");
  }
  if (diagram?.database !== "snowflake") {
    throw new Error("Native Snowflake DDL export requires a Snowflake diagram");
  }

  const contents = generatedContents ?? exportSQL(diagram);
  if (typeof contents !== "string" || !contents.trim()) {
    throw new Error("Snowflake export produced empty DDL");
  }

  const basenameSource = String(
    suggestedBasename || diagram.title || "SNOWFLAKE_DDL",
  )
    .trim()
    .replace(/\.sql$/i, "")
    .slice(0, 251);
  let basename = "SNOWFLAKE_DDL";
  try {
    basename = toSnowflakeIdentifier(basenameSource);
  } catch {
    // Keep a stable, portable fallback for invalid or empty file names.
  }
  const result = await api.save({
    contents,
    suggestedName: `${basename}.sql`,
  });
  if (result?.canceled === true) return { canceled: true };
  if (
    result?.canceled !== false ||
    typeof result.filePath !== "string" ||
    !result.filePath
  ) {
    throw new Error("Native DDL export returned an invalid result");
  }
  return { canceled: false, filePath: result.filePath };
}

export async function exportDesktopConnectionDDL(
  diagram,
  profileId,
  generatedContents,
  suggestedBasename,
) {
  const api = ddlExportApi();
  if (typeof api?.save !== "function") {
    throw new Error("Native DDL export is unavailable");
  }
  if (!["snowflake", "sqlite"].includes(diagram?.database)) {
    throw new Error("Saved connection export supports Snowflake and SQLite diagrams");
  }

  const contents = generatedContents ?? exportSQL(diagram);
  if (typeof contents !== "string" || !contents.trim()) {
    throw new Error("DDL export produced empty SQL");
  }
  await forwardEngineerDesktopConnection({
    profileId,
    database: diagram.database,
    contents,
  });

  const basenameSource = String(
    suggestedBasename || diagram.title || `${diagram.database}_ddl`,
  )
    .trim()
    .replace(/\.sql$/i, "")
    .slice(0, 251);
  const basename = basenameSource.replace(/[^A-Za-z0-9_$-]+/g, "_") || "ddl";
  const result = await api.save({
    contents,
    suggestedName: `${basename}.sql`,
    provider: diagram.database,
  });
  if (result?.canceled === true) return { canceled: true };
  if (
    result?.canceled !== false ||
    typeof result.filePath !== "string" ||
    !result.filePath
  ) {
    throw new Error("Native DDL export returned an invalid result");
  }
  return { canceled: false, filePath: result.filePath };
}

export function requestDesktopProjectSave() {
  globalThis.window?.dispatchEvent(new Event(NATIVE_PROJECT_SAVE_REQUEST));
}

export function onDesktopProjectSaveRequest(handler) {
  globalThis.window?.addEventListener(NATIVE_PROJECT_SAVE_REQUEST, handler);
  return () =>
    globalThis.window?.removeEventListener(
      NATIVE_PROJECT_SAVE_REQUEST,
      handler,
    );
}

export function requestDesktopProjectSaveAs() {
  globalThis.window?.dispatchEvent(new Event(NATIVE_PROJECT_SAVE_AS_REQUEST));
}

export function onDesktopProjectSaveAsRequest(handler) {
  globalThis.window?.addEventListener(NATIVE_PROJECT_SAVE_AS_REQUEST, handler);
  return () =>
    globalThis.window?.removeEventListener(
      NATIVE_PROJECT_SAVE_AS_REQUEST,
      handler,
    );
}

export function requestDesktopProjectOpen() {
  globalThis.window?.dispatchEvent(new Event(NATIVE_PROJECT_OPEN_REQUEST));
}

export function onDesktopProjectOpenRequest(handler) {
  globalThis.window?.addEventListener(NATIVE_PROJECT_OPEN_REQUEST, handler);
  return () =>
    globalThis.window?.removeEventListener(
      NATIVE_PROJECT_OPEN_REQUEST,
      handler,
    );
}

export function requestDesktopAutoArrange() {
  globalThis.window?.dispatchEvent(new Event(DESKTOP_AUTO_ARRANGE_REQUEST));
}

export function onDesktopAutoArrangeRequest(handler) {
  globalThis.window?.addEventListener(DESKTOP_AUTO_ARRANGE_REQUEST, handler);
  return () =>
    globalThis.window?.removeEventListener(
      DESKTOP_AUTO_ARRANGE_REQUEST,
      handler,
    );
}

export function onDesktopConnectionsManageRequest(handler) {
  globalThis.window?.addEventListener(CONNECTIONS_MANAGE_REQUEST, handler);
  return () =>
    globalThis.window?.removeEventListener(CONNECTIONS_MANAGE_REQUEST, handler);
}

export function onDesktopConnectionsReverseEngineerRequest(handler) {
  globalThis.window?.addEventListener(
    CONNECTIONS_REVERSE_ENGINEER_REQUEST,
    handler,
  );
  return () =>
    globalThis.window?.removeEventListener(
      CONNECTIONS_REVERSE_ENGINEER_REQUEST,
      handler,
    );
}

export function onDesktopConnectionsForwardEngineerRequest(handler) {
  globalThis.window?.addEventListener(
    CONNECTIONS_FORWARD_ENGINEER_REQUEST,
    handler,
  );
  return () =>
    globalThis.window?.removeEventListener(
      CONNECTIONS_FORWARD_ENGINEER_REQUEST,
      handler,
    );
}

export async function openDesktopProject() {
  const api = projectFilesApi();
  if (!api) throw new Error("Native project files are unavailable");
  const result = await api.open();
  if (result?.canceled) return result;
  return {
    ...result,
    diagram: canonicalProjectToDiagram(JSON.parse(result.contents)),
  };
}

export async function saveDesktopProject(diagram) {
  const api = projectFilesApi();
  if (!api) throw new Error("Native project files are unavailable");
  return api.save(saveRequest(diagram));
}

export async function saveDesktopProjectAs(diagram) {
  const api = projectFilesApi();
  if (!api) throw new Error("Native project files are unavailable");
  return api.saveAs(saveRequest(diagram));
}
