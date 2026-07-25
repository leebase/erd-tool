import { contextBridge, ipcRenderer } from "electron";

type SaveResult =
  | { canceled: true }
  | { canceled: false; filePath: string };

const autoArrangeChannel = "diagram:auto-arrange-request";
const autoArrangeEvent = "drawdb:desktop-auto-arrange-request";
const connectionManageChannel = "connections:manage-request";
const connectionManageEvent = "drawdb:connections-manage-request";
const connectionReverseEngineerChannel = "connections:reverse-engineer-request";
const connectionReverseEngineerEvent =
  "drawdb:connections-reverse-engineer-request";
const connectionForwardEngineerChannel = "connections:forward-engineer-request";
const connectionForwardEngineerEvent =
  "drawdb:connections-forward-engineer-request";

const projectFiles = Object.freeze({
  open: () => ipcRenderer.invoke("project:open"),
  save: (request: { contents: string; suggestedName: string }) =>
    ipcRenderer.invoke("project:save", request),
  saveAs: (request: { contents: string; suggestedName: string }) =>
    ipcRenderer.invoke("project:save-as", request),
});

const ddlExport = Object.freeze({
  save: (request: {
    contents: string;
    suggestedName: string;
    provider?: "snowflake" | "sqlite";
  }) =>
    ipcRenderer.invoke("ddl:export", request) as Promise<SaveResult>,
});

const connections = Object.freeze({
  list: () => ipcRenderer.invoke("connections:list"),
  create: (profile: Record<string, unknown>) =>
    ipcRenderer.invoke("connections:create", profile),
  update: (profileId: string, profile: Record<string, unknown>) =>
    ipcRenderer.invoke("connections:update", { profileId, profile }),
  duplicate: (profileId: string) =>
    ipcRenderer.invoke("connections:duplicate", { profileId }),
  delete: (profileId: string) =>
    ipcRenderer.invoke("connections:delete", { profileId }),
  test: (profileId: string) =>
    ipcRenderer.invoke("connections:test", { profileId }),
  forwardEngineer: (request: {
    profileId: string;
    database: "snowflake" | "sqlite";
    contents: string;
  }) => ipcRenderer.invoke("connections:forward-engineer", request),
});

const snowflake = Object.freeze({
  listProfiles: () => ipcRenderer.invoke("snowflake:profiles"),
  connect: (request: Record<string, unknown>) =>
    ipcRenderer.invoke("snowflake:connect", request),
  disconnect: (sessionId: string) =>
    ipcRenderer.invoke("snowflake:disconnect", { sessionId }),
  listDatabases: (sessionId: string) =>
    ipcRenderer.invoke("snowflake:list-databases", { sessionId }),
  listSchemas: (sessionId: string, database: string) =>
    ipcRenderer.invoke("snowflake:list-schemas", { sessionId, database }),
  listTables: (sessionId: string, database: string, schema: string) =>
    ipcRenderer.invoke("snowflake:list-tables", {
      sessionId,
      database,
      schema,
    }),
  reverseEngineer: (request: {
    sessionId: string;
    database: string;
    schema: string;
    tables: string[];
  }) => ipcRenderer.invoke("snowflake:reverse-engineer", request),
});

const llm = Object.freeze({
  status: () => ipcRenderer.invoke("llm:status"),
  setApiKey: (apiKey: string) =>
    ipcRenderer.invoke("llm:set-api-key", { apiKey }),
  clearApiKey: () => ipcRenderer.invoke("llm:clear-api-key"),
  proposeSchema: (request: {
    prompt: string;
    database: string;
    currentModel: Record<string, unknown>;
  }) => ipcRenderer.invoke("llm:propose-schema", request),
});

ipcRenderer.on(autoArrangeChannel, () => {
  window.dispatchEvent(new Event(autoArrangeEvent));
});
ipcRenderer.on(connectionManageChannel, () => {
  window.dispatchEvent(new Event(connectionManageEvent));
});
ipcRenderer.on(connectionReverseEngineerChannel, () => {
  window.dispatchEvent(new Event(connectionReverseEngineerEvent));
});
ipcRenderer.on(connectionForwardEngineerChannel, () => {
  window.dispatchEvent(new Event(connectionForwardEngineerEvent));
});

contextBridge.exposeInMainWorld(
  "drawdbDesktop",
  Object.freeze({
    runtimeVersion: 4,
    projectFiles,
    ddlExport,
    connections,
    snowflake,
    llm,
  }),
);
