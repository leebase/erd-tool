import { app, BrowserWindow, Menu, dialog, ipcMain, shell } from "electron";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { canonicalProjectToDiagram } from "../erdTool/projectAdapter.js";
import { createSnowflakeService } from "./snowflakeService.js";

const electronOutputDirectory = __dirname;
const preloadPath = path.join(electronOutputDirectory, "preload.cjs");
const externalUrlPattern =
  /^https:\/\/(?:drawdb-io\.github\.io|github\.com|discord\.gg|x\.com)\//;
const sourceCodeUrl = ["https:", "", "github.com", "leebase", "erd-tool"].join(
  "/",
);
const licenseUrl = `${sourceCodeUrl}/blob/main/LICENSE_SCOPE.md`;
const projectFileFilters = [
  {
    name: "ERD Tool projects",
    extensions: ["erd.json", "json"],
  },
];
const ddlFileFilters = [{ name: "Snowflake SQL", extensions: ["sql"] }];
const maximumProjectBytes = 25 * 1024 * 1024;
const maximumDdlBytes = 25 * 1024 * 1024;
const autoArrangeChannel = "diagram:auto-arrange-request";
let currentProjectPath: string | null = null;
const trustedProjectRenderers = new WeakSet<object>();
const snowflakeService = createSnowflakeService({
  openExternalBrowser: (url: string) => {
    void shell.openExternal(url);
  },
});

type ProjectSaveRequest = {
  contents: string;
  suggestedName: string;
};

type DdlExportRequest = {
  contents: string;
  suggestedName: string;
};

function projectError(action: "open" | "save"): Error {
  const code =
    action === "open" ? "PROJECT_OPEN_FAILED" : "PROJECT_SAVE_FAILED";
  return new Error(
    `[${code}] Could not ${action} the ERD Tool project. Check the file and permissions, then try again.`,
  );
}

function ddlExportError(): Error {
  return new Error(
    "[DDL_EXPORT_FAILED] Could not export the Snowflake DDL. Check the destination permissions, then try again.",
  );
}

function assertTrustedProjectSender(event: Electron.IpcMainInvokeEvent): void {
  if (
    !trustedProjectRenderers.has(event.sender) ||
    event.senderFrame === null ||
    event.senderFrame !== event.sender.mainFrame
  ) {
    throw new Error("[PROJECT_ACCESS_DENIED] Untrusted project-file request.");
  }
}

function validateIpcRecord(
  payload: unknown,
  allowedKeys: string[],
  label: string,
): Record<string, unknown> {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error(`[SNOWFLAKE_INVALID_REQUEST] ${label} must be an object.`);
  }
  const value = payload as Record<string, unknown>;
  const unexpected = Object.keys(value).filter(
    (key) => !allowedKeys.includes(key),
  );
  if (unexpected.length) {
    throw new Error(
      `[SNOWFLAKE_INVALID_REQUEST] ${label} contains an unexpected field: ${unexpected[0]}.`,
    );
  }
  return value;
}

function validateProjectContents(contents: unknown): string {
  if (typeof contents !== "string") {
    throw new Error("project contents must be a string");
  }
  if (Buffer.byteLength(contents, "utf8") > maximumProjectBytes) {
    throw new Error("project is larger than the 25 MB limit");
  }

  let project: unknown;
  try {
    project = JSON.parse(contents);
  } catch {
    throw new Error("project is not valid JSON");
  }

  if (!project || typeof project !== "object" || Array.isArray(project)) {
    throw new Error("project root must be an object");
  }
  // The shared reader is authoritative for the complete versioned DTO. It
  // validates exact canonical nested fields and intentionally accepts legacy
  // v1 projects which omit diagram_layout.
  canonicalProjectToDiagram(project);
  // Persist only a fresh serialization of the validated value. JSON.parse
  // resolves duplicate properties, so returning the renderer-supplied bytes
  // could otherwise retain shadowed, unvalidated credential data.
  const normalized = `${JSON.stringify(project, null, 2)}\n`;
  if (Buffer.byteLength(normalized, "utf8") > maximumProjectBytes) {
    throw new Error("project is larger than the 25 MB limit");
  }
  return normalized;
}

function validateSaveRequest(payload: unknown): ProjectSaveRequest {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error("project save request must be an object");
  }
  const record = payload as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  if (
    keys.length !== 2 ||
    keys[0] !== "contents" ||
    keys[1] !== "suggestedName"
  ) {
    throw new Error("project save request has unexpected fields");
  }
  if (typeof record.suggestedName !== "string") {
    throw new Error("suggested project name must be a string");
  }
  const suggestedName = path.basename(record.suggestedName).trim();
  if (!suggestedName || suggestedName.length > 255) {
    throw new Error("suggested project name is invalid");
  }
  return {
    contents: validateProjectContents(record.contents),
    suggestedName,
  };
}

function validateDdlExportRequest(payload: unknown): DdlExportRequest {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error("DDL export request must be an object");
  }
  const record = payload as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  if (
    keys.length !== 2 ||
    keys[0] !== "contents" ||
    keys[1] !== "suggestedName"
  ) {
    throw new Error("DDL export request has unexpected fields");
  }
  if (typeof record.contents !== "string" || !record.contents.trim()) {
    throw new Error("DDL export contents must be a non-empty string");
  }
  if (Buffer.byteLength(record.contents, "utf8") > maximumDdlBytes) {
    throw new Error("DDL export is larger than the 25 MB limit");
  }
  if (typeof record.suggestedName !== "string") {
    throw new Error("suggested DDL name must be a string");
  }
  const suggestedName = path.basename(record.suggestedName).trim();
  if (
    !suggestedName ||
    suggestedName.length > 255 ||
    path.extname(suggestedName).toLowerCase() !== ".sql"
  ) {
    throw new Error("suggested DDL name must end in .sql");
  }
  return { contents: record.contents, suggestedName };
}

function writeProjectAtomically(filePath: string, contents: string): void {
  const temporaryPath = path.join(
    path.dirname(filePath),
    `.${path.basename(filePath)}.${process.pid}.${Date.now()}.tmp`,
  );
  try {
    fs.writeFileSync(temporaryPath, contents, {
      encoding: "utf8",
      flag: "wx",
    });
    fs.renameSync(temporaryPath, filePath);
  } finally {
    if (fs.existsSync(temporaryPath)) {
      fs.rmSync(temporaryPath, { force: true });
    }
  }
}

function recordRecentProject(filePath: string): void {
  // Some test/minimal Electron hosts do not provide getPath. Recent metadata is
  // a convenience and must never make an otherwise successful project I/O fail.
  if (typeof app.getPath !== "function") return;
  try {
    const metadataPath = path.join(
      app.getPath("userData"),
      "recent-projects.json",
    );
    let recent: string[] = [];
    if (fs.existsSync(metadataPath)) {
      const stored = JSON.parse(fs.readFileSync(metadataPath, "utf8"));
      if (Array.isArray(stored)) {
        recent = stored.filter(
          (item): item is string => typeof item === "string",
        );
      }
    }
    recent = [filePath, ...recent.filter((item) => item !== filePath)].slice(
      0,
      10,
    );
    fs.mkdirSync(path.dirname(metadataPath), { recursive: true });
    fs.writeFileSync(
      metadataPath,
      `${JSON.stringify(recent, null, 2)}\n`,
      "utf8",
    );
  } catch {
    // Project files remain usable even if optional recent-file metadata fails.
  }
}

async function chooseAndSaveProject(
  request: ProjectSaveRequest,
): Promise<{ canceled: true } | { canceled: false; filePath: string }> {
  const result = await dialog.showSaveDialog({
    title: "Save ERD Tool Project",
    defaultPath: request.suggestedName,
    filters: projectFileFilters,
  });
  if (result.canceled || !result.filePath) return { canceled: true };

  try {
    writeProjectAtomically(result.filePath, request.contents);
  } catch {
    throw projectError("save");
  }
  currentProjectPath = result.filePath;
  recordRecentProject(result.filePath);
  return { canceled: false, filePath: result.filePath };
}

function registerProjectFileHandlers(): void {
  ipcMain.handle("project:open", async (event) => {
    assertTrustedProjectSender(event);
    try {
      const result = await dialog.showOpenDialog({
        title: "Open ERD Tool Project",
        properties: ["openFile"],
        filters: projectFileFilters,
      });
      if (result.canceled || !result.filePaths[0]) return { canceled: true };

      const filePath = result.filePaths[0];
      const contents = validateProjectContents(
        fs.readFileSync(filePath, "utf8"),
      );
      currentProjectPath = filePath;
      recordRecentProject(filePath);
      return { canceled: false, filePath, contents };
    } catch {
      throw projectError("open");
    }
  });

  ipcMain.handle("project:save", async (_event, payload: unknown) => {
    assertTrustedProjectSender(_event);
    try {
      const request = validateSaveRequest(payload);
      if (!currentProjectPath) return await chooseAndSaveProject(request);
      writeProjectAtomically(currentProjectPath, request.contents);
      recordRecentProject(currentProjectPath);
      return { canceled: false, filePath: currentProjectPath };
    } catch {
      throw projectError("save");
    }
  });

  ipcMain.handle("project:save-as", async (_event, payload: unknown) => {
    assertTrustedProjectSender(_event);
    try {
      return await chooseAndSaveProject(validateSaveRequest(payload));
    } catch {
      throw projectError("save");
    }
  });
}

function registerDdlExportHandler(): void {
  ipcMain.handle("ddl:export", async (event, payload: unknown) => {
    assertTrustedProjectSender(event);
    try {
      const request = validateDdlExportRequest(payload);
      const result = await dialog.showSaveDialog({
        title: "Export Snowflake DDL",
        defaultPath: request.suggestedName,
        filters: ddlFileFilters,
      });
      if (result.canceled || !result.filePath) return { canceled: true };

      const filePath =
        path.extname(result.filePath).toLowerCase() === ".sql"
          ? result.filePath
          : `${result.filePath}.sql`;
      writeProjectAtomically(filePath, request.contents);
      return { canceled: false, filePath };
    } catch {
      throw ddlExportError();
    }
  });
}

function registerSnowflakeHandlers(): void {
  ipcMain.handle("snowflake:profiles", (event) => {
    assertTrustedProjectSender(event);
    return snowflakeService.listProfiles();
  });
  ipcMain.handle("snowflake:connect", async (event, payload: unknown) => {
    assertTrustedProjectSender(event);
    return await snowflakeService.connect(payload);
  });
  ipcMain.handle("snowflake:disconnect", async (event, payload: unknown) => {
    assertTrustedProjectSender(event);
    const request = validateIpcRecord(payload, ["sessionId"], "disconnect request");
    return await snowflakeService.disconnect(request.sessionId);
  });
  ipcMain.handle("snowflake:list-databases", async (event, payload: unknown) => {
    assertTrustedProjectSender(event);
    const request = validateIpcRecord(payload, ["sessionId"], "database-list request");
    return await snowflakeService.listDatabases(request.sessionId);
  });
  ipcMain.handle("snowflake:list-schemas", async (event, payload: unknown) => {
    assertTrustedProjectSender(event);
    const request = validateIpcRecord(
      payload,
      ["sessionId", "database"],
      "schema-list request",
    );
    return await snowflakeService.listSchemas(
      request.sessionId,
      request.database,
    );
  });
  ipcMain.handle("snowflake:list-tables", async (event, payload: unknown) => {
    assertTrustedProjectSender(event);
    const request = validateIpcRecord(
      payload,
      ["sessionId", "database", "schema"],
      "table-list request",
    );
    return await snowflakeService.listTables(
      request.sessionId,
      request.database,
      request.schema,
    );
  });
  ipcMain.handle("snowflake:reverse-engineer", async (event, payload: unknown) => {
    assertTrustedProjectSender(event);
    return await snowflakeService.reverseEngineer(payload);
  });
}

function sendAutoArrangeToActiveDiagram(): void {
  const window =
    BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0];
  if (!window || window.isDestroyed()) return;
  window.webContents.send(autoArrangeChannel);
}

function registerApplicationMenu(): void {
  const template: Electron.MenuItemConstructorOptions[] = [
    ...(process.platform === "darwin"
      ? [
          {
            label: app.name,
            submenu: [
              { role: "about" },
              { type: "separator" },
              { role: "quit" },
            ],
          } satisfies Electron.MenuItemConstructorOptions,
        ]
      : []),
    {
      label: "File",
      submenu: [{ role: "close" }],
    },
    {
      label: "Edit",
      submenu: [
        { role: "undo" },
        { role: "redo" },
        { type: "separator" },
        { role: "cut" },
        { role: "copy" },
        { role: "paste" },
      ],
    },
    {
      label: "Diagram",
      submenu: [
        {
          label: "Auto Arrange",
          accelerator: "CmdOrCtrl+Shift+L",
          click: sendAutoArrangeToActiveDiagram,
        },
      ],
    },
    {
      label: "View",
      submenu: [
        { role: "reload" },
        { role: "toggleDevTools" },
        { type: "separator" },
        { role: "resetZoom" },
        { role: "zoomIn" },
        { role: "zoomOut" },
        { type: "separator" },
        { role: "togglefullscreen" },
      ],
    },
    {
      label: "Help",
      submenu: [
        {
          label: "View Source Code",
          click: () => void shell.openExternal(sourceCodeUrl),
        },
        {
          label: "Licenses and Notices",
          click: () => void shell.openExternal(licenseUrl),
        },
      ],
    },
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function resolveRendererEntry(): string {
  const rendererCandidates = [
    path.join(electronOutputDirectory, "..", "dist-desktop"),
    path.join(electronOutputDirectory, "..", "desktop-build"),
    path.join(electronOutputDirectory, "dist-desktop"),
    path.join(process.resourcesPath, "dist-desktop"),
  ];

  const rendererDirectory = rendererCandidates.find((candidate) =>
    fs.existsSync(path.join(candidate, "index.html")),
  );

  if (!rendererDirectory) {
    throw new Error(
      "ERD Tool desktop renderer build was not found. Run npm run build:desktop before launching Electron.",
    );
  }

  return path.join(rendererDirectory, "index.html");
}

function createWindow(): BrowserWindow {
  const rendererEntry = resolveRendererEntry();
  const rendererDocumentUrl = pathToFileURL(rendererEntry).href;
  const window = new BrowserWindow({
    width: 1280,
    height: 800,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      preload: preloadPath,
    },
  });
  trustedProjectRenderers.add(window.webContents);
  window.webContents.on("destroyed", () => {
    void snowflakeService.disconnectAll();
  });

  window.webContents.on("will-navigate", (event, url) => {
    let isApplicationDocument = false;
    try {
      const navigationUrl = new URL(url);
      navigationUrl.hash = "";
      isApplicationDocument = navigationUrl.href === rendererDocumentUrl;
    } catch {
      // Invalid URLs are denied below.
    }
    if (isApplicationDocument) return;
    event.preventDefault();
    if (externalUrlPattern.test(url)) {
      void shell.openExternal(url);
    }
  });

  window.webContents.setWindowOpenHandler(({ url }) => {
    if (externalUrlPattern.test(url)) {
      void shell.openExternal(url);
    }
    return { action: "deny" };
  });

  void window.loadFile(rendererEntry, { hash: "/editor" });
  return window;
}

app.whenReady().then(() => {
  registerProjectFileHandlers();
  registerDdlExportHandler();
  registerSnowflakeHandlers();
  registerApplicationMenu();
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("before-quit", () => {
  void snowflakeService.disconnectAll();
});
