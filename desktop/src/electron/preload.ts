import { contextBridge, ipcRenderer } from "electron";

type SaveResult =
  | { canceled: true }
  | { canceled: false; filePath: string };

const autoArrangeChannel = "diagram:auto-arrange-request";
const autoArrangeEvent = "drawdb:desktop-auto-arrange-request";

const projectFiles = Object.freeze({
  open: () => ipcRenderer.invoke("project:open"),
  save: (request: { contents: string; suggestedName: string }) =>
    ipcRenderer.invoke("project:save", request),
  saveAs: (request: { contents: string; suggestedName: string }) =>
    ipcRenderer.invoke("project:save-as", request),
});

const ddlExport = Object.freeze({
  save: (request: { contents: string; suggestedName: string }) =>
    ipcRenderer.invoke("ddl:export", request) as Promise<SaveResult>,
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

ipcRenderer.on(autoArrangeChannel, () => {
  window.dispatchEvent(new Event(autoArrangeEvent));
});

contextBridge.exposeInMainWorld(
  "drawdbDesktop",
  Object.freeze({ runtimeVersion: 2, projectFiles, ddlExport, snowflake }),
);
