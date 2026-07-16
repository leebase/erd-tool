import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { before, describe, it } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build as viteBuild } from "vite";
import {
  canonicalProjectToDiagram,
  diagramToCanonicalProject,
} from "../src/erdTool/projectAdapter.js";

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const mainPath = path.join(repositoryRoot, "src", "electron", "main.ts");
const preloadPath = path.join(repositoryRoot, "src", "electron", "preload.ts");
const packagePath = path.join(repositoryRoot, "package.json");
const appPath = path.join(repositoryRoot, "src", "App.jsx");
const openRoutePath = path.join(repositoryRoot, "src", "utils", "openRoute.js");
const desktopBridgePath = path.join(
  repositoryRoot,
  "src",
  "erdTool",
  "desktopBridge.js",
);
const erdToolActionsPath = path.join(
  repositoryRoot,
  "src",
  "components",
  "ErdToolActions.jsx",
);
const workspacePath = path.join(
  repositoryRoot,
  "src",
  "components",
  "Workspace.jsx",
);
const controlPanelPath = path.join(
  repositoryRoot,
  "src",
  "components",
  "EditorHeader",
  "ControlPanel.jsx",
);
const desktopRendererPath = path.join(repositoryRoot, "dist-desktop");
const electronMainBuildPath = path.join(
  repositoryRoot,
  "dist-electron",
  "main.cjs",
);
const electronPreloadBuildPath = path.join(
  repositoryRoot,
  "dist-electron",
  "preload.cjs",
);
const webRendererPath = path.join(repositoryRoot, "dist");
const forbiddenStartupModules = [
  "child_process",
  "http",
  "https",
  "net",
  "node:child_process",
  "node:http",
  "node:https",
  "node:net",
];

before(async () => {
  const webConfigPath = path.join(repositoryRoot, "vite.config.js");
  await viteBuild({
    root: repositoryRoot,
    configFile: webConfigPath,
    logLevel: "silent",
  });
  await viteBuild({
    root: repositoryRoot,
    configFile: webConfigPath,
    base: "./",
    build: { outDir: "dist-desktop" },
    logLevel: "silent",
  });
  await viteBuild({
    root: repositoryRoot,
    configFile: path.join(repositoryRoot, "vite.electron.config.js"),
    logLevel: "silent",
  });
});

async function startProductionMainWithElectronHarness({
  openDialogResult = { canceled: true, filePaths: [] },
  saveDialogResult = { canceled: true },
  userDataPath,
} = {}) {
  const loadFiles = [];
  const requiredModules = [];
  const windows = [];
  const externalUrls = [];
  const ipcHandlers = new Map();
  const menuTemplates = [];
  const openDialogCalls = [];
  const saveDialogCalls = [];
  const sentMessages = [];
  let readyPromise;

  class BrowserWindow {
    static getAllWindows() {
      return windows;
    }

    static getFocusedWindow() {
      return windows[0] ?? null;
    }

    constructor(options) {
      this.options = options;
      const mainFrame = { parent: null };
      this.webContents = {
        mainFrame,
        navigationHandlers: {},
        windowOpenHandler: undefined,
        on: (eventName, callback) => {
          this.webContents.navigationHandlers[eventName] = callback;
        },
        setWindowOpenHandler: (callback) => {
          this.webContents.windowOpenHandler = callback;
        },
        send: (channel, payload) => {
          sentMessages.push({ channel, payload });
        },
      };
      windows.push(this);
    }

    isDestroyed() {
      return false;
    }

    loadFile(filePath, options) {
      loadFiles.push({ filePath, options });
      return Promise.resolve();
    }
  }

  const electron = {
    app: {
      on() {},
      quit() {},
      resourcesPath: path.join(repositoryRoot, "unused-test-resources"),
      whenReady() {
        return {
          then(callback) {
            readyPromise = Promise.resolve().then(callback);
            return readyPromise;
          },
        };
      },
      ...(userDataPath
        ? {
            getPath(name) {
              assert.equal(name, "userData");
              return userDataPath;
            },
          }
        : {}),
    },
    BrowserWindow,
    dialog: {
      showOpenDialog(...args) {
        openDialogCalls.push(args);
        if (openDialogResult instanceof Error) {
          return Promise.reject(openDialogResult);
        }
        return Promise.resolve(openDialogResult);
      },
      showSaveDialog(...args) {
        saveDialogCalls.push(args);
        if (saveDialogResult instanceof Error) {
          return Promise.reject(saveDialogResult);
        }
        return Promise.resolve(saveDialogResult);
      },
    },
    Menu: {
      buildFromTemplate(template) {
        menuTemplates.push(template);
        return { template };
      },
      setApplicationMenu(menu) {
        menuTemplates.push(menu.template);
      },
    },
    ipcMain: {
      handle(channel, handler) {
        assert.equal(
          ipcHandlers.has(channel),
          false,
          `IPC channel must only be registered once: ${channel}`,
        );
        ipcHandlers.set(channel, handler);
      },
    },
    shell: {
      openExternal(url) {
        externalUrls.push(url);
        return Promise.resolve();
      },
    },
  };

  const artifactRequire = createRequire(electronMainBuildPath);
  const harnessRequire = (specifier) => {
    requiredModules.push(specifier);
    if (specifier === "electron") return electron;
    if (forbiddenStartupModules.includes(specifier)) {
      throw new Error(
        `Production startup attempted to load a forbidden runtime module: ${specifier}`,
      );
    }
    return artifactRequire(specifier);
  };
  const mainModule = { exports: {} };
  const mainSource = fs.readFileSync(electronMainBuildPath, "utf8");
  const executeMain = new Function(
    "require",
    "module",
    "exports",
    "__dirname",
    "__filename",
    mainSource,
  );

  const originalResourcesPath = process.resourcesPath;
  process.resourcesPath = path.join(repositoryRoot, "unused-test-resources");
  try {
    executeMain(
      harnessRequire,
      mainModule,
      mainModule.exports,
      path.dirname(electronMainBuildPath),
      electronMainBuildPath,
    );
    await readyPromise;
  } finally {
    if (originalResourcesPath === undefined) {
      delete process.resourcesPath;
    } else {
      process.resourcesPath = originalResourcesPath;
    }
  }

  return {
    externalUrls,
    ipcHandlers,
    loadFiles,
    menuTemplates,
    openDialogCalls,
    requiredModules,
    saveDialogCalls,
    sentMessages,
    windows,
  };
}

function loadProductionPreloadWithElectronHarness() {
  const exposed = new Map();
  const invocations = [];
  const listeners = [];
  const electron = {
    contextBridge: {
      exposeInMainWorld(name, value) {
        exposed.set(name, value);
      },
    },
    ipcRenderer: {
      invoke(channel, payload) {
        invocations.push({ channel, payload });
        return Promise.resolve({ channel, payload });
      },
      on(channel, listener) {
        listeners.push({ channel, listener });
      },
    },
  };
  const artifactRequire = createRequire(electronPreloadBuildPath);
  const preloadModule = { exports: {} };
  const preloadSource = fs.readFileSync(electronPreloadBuildPath, "utf8");
  const executePreload = new Function(
    "require",
    "module",
    "exports",
    "__dirname",
    "__filename",
    preloadSource,
  );

  executePreload(
    (specifier) =>
      specifier === "electron" ? electron : artifactRequire(specifier),
    preloadModule,
    preloadModule.exports,
    path.dirname(electronPreloadBuildPath),
    electronPreloadBuildPath,
  );

  return { exposed, invocations, listeners };
}

function canonicalOfflineProject(title = "offline-project") {
  return diagramToCanonicalProject({
    title,
    tables: [],
    relationships: [],
    transform: { pan: { x: 18, y: 24 }, zoom: 1.1 },
  });
}

function completeDrawdbProject(title = "complete-offline-project") {
  return diagramToCanonicalProject({
    database: "mysql",
    title,
    tables: [
      {
        id: "table-1",
        name: "customers",
        x: 40,
        y: 80,
        fields: [{ id: "field-1", name: "id", type: "INT", primary: true }],
        indices: [],
        uniqueConstraints: [],
        color: "#175e7a",
        collapsed: true,
      },
    ],
    relationships: [],
    notes: [{ id: 0, title: "Remember", content: "offline", x: 3, y: 4 }],
    areas: [{ id: 0, name: "Core", x: 0, y: 0, width: 500, height: 300 }],
    types: [{ id: "type-1", name: "money", fields: [] }],
    enums: [{ id: "enum-1", name: "status", values: ["ACTIVE"] }],
    transform: { pan: { x: 18, y: 24 }, zoom: 1.1 },
  });
}

function getIpcHandler(runtime, channel) {
  const handler = runtime.ipcHandlers.get(channel);
  assert.equal(
    typeof handler,
    "function",
    `Electron main must register the ${channel} handler`,
  );
  return (payload) =>
    handler(
      {
        sender: runtime.windows[0]?.webContents,
        senderFrame: runtime.windows[0]?.webContents.mainFrame,
      },
      payload,
    );
}

describe("Electron runtime scaffold", () => {
  it("has dedicated TypeScript main and preload entries", () => {
    assert.equal(fs.existsSync(mainPath), true);
    assert.equal(fs.existsSync(preloadPath), true);

    const main = fs.readFileSync(mainPath, "utf8");
    assert.match(main, /preload:\s*preloadPath/);
  });

  it("exposes deterministic desktop build and launch scripts", () => {
    const packageJson = JSON.parse(fs.readFileSync(packagePath, "utf8"));

    assert.equal(packageJson.main, "dist-electron/main.cjs");
    assert.equal(
      packageJson.scripts["build:desktop-renderer"],
      "vite build --base ./ --outDir dist-desktop",
    );
    assert.equal(
      packageJson.scripts["build:electron"],
      "vite build --config vite.electron.config.js",
    );
    assert.equal(
      packageJson.scripts["build:desktop"],
      "npm run build:desktop-renderer && npm run build:electron",
    );
    assert.equal(
      packageJson.scripts["start:electron"],
      "npm run build:desktop && electron .",
    );
    assert.equal(
      packageJson.scripts["verify:ss002"],
      "npm run test && npm run lint && npm run build && npm run build:desktop",
    );
    assert.doesNotMatch(packageJson.scripts["start:electron"], /vite|preview/);
    assert.doesNotMatch(packageJson.scripts["verify:ss002"], /python/i);
  });

  it("loads the production renderer directly from its local file", () => {
    const main = fs.readFileSync(mainPath, "utf8");

    assert.match(main, /resolveRendererEntry/);
    assert.match(main, /"dist-desktop"/);
    assert.match(main, /"desktop-build"/);
    assert.match(main, /"index\.html"/);
    assert.match(main, /\.loadFile\(rendererEntry, \{ hash: "\/editor" \}\)/);
    assert.doesNotMatch(main, /protocol|\.loadURL\s*\(/);
    assert.doesNotMatch(main, /https?:\/\//);
  });

  it("uses hash-safe route URLs for file-loaded desktop windows", () => {
    const app = fs.readFileSync(appPath, "utf8");
    const openRoute = fs.readFileSync(openRoutePath, "utf8");
    const controlPanel = fs.readFileSync(
      path.join(
        repositoryRoot,
        "src",
        "components",
        "EditorHeader",
        "ControlPanel.jsx",
      ),
      "utf8",
    );
    const modal = fs.readFileSync(
      path.join(
        repositoryRoot,
        "src",
        "components",
        "EditorHeader",
        "Modal",
        "Modal.jsx",
      ),
      "utf8",
    );
    const templates = fs.readFileSync(
      path.join(repositoryRoot, "src", "pages", "Templates.jsx"),
      "utf8",
    );

    assert.match(
      app,
      /window\.location\.protocol === "file:"[\s\S]*HashRouter/,
    );
    assert.match(openRoute, /window\.location\.protocol !== "file:"/);
    assert.match(openRoute, /window\.location\.pathname/);
    assert.match(openRoute, /#\$\{normalizedRoute\}/);
    assert.match(controlPanel, /openRoute\("\/editor"\)/);
    assert.match(controlPanel, /openRoute\("\/bug-report"\)/);
    assert.match(
      modal,
      /openRoute\("\/editor\/templates\/" \+ selectedTemplateId\)/,
    );
    assert.match(templates, /openRoute\("\/editor\/templates\/" \+ id\)/);
  });

  it("fails clearly instead of opening a missing local renderer file", () => {
    const main = fs.readFileSync(mainPath, "utf8");

    assert.match(main, /fs\.existsSync/);
    assert.match(main, /rendererCandidates\.find/);
    assert.match(main, /desktop renderer build was not found/);
  });

  it("keeps renderer Node access disabled and isolation enabled", () => {
    const main = fs.readFileSync(mainPath, "utf8");

    assert.match(main, /contextIsolation:\s*true/);
    assert.match(main, /nodeIntegration:\s*false/);
    assert.match(main, /sandbox:\s*true/);
  });

  it("denies unexpected navigation and opens allowlisted external URLs outside Electron", async () => {
    const runtime = await startProductionMainWithElectronHarness();
    const [window] = runtime.windows;
    const willNavigate = window.webContents.navigationHandlers["will-navigate"];
    const windowOpen = window.webContents.windowOpenHandler;

    assert.equal(typeof willNavigate, "function");
    assert.equal(typeof windowOpen, "function");

    const allowedNavigation = {
      prevented: false,
      preventDefault() {
        this.prevented = true;
      },
    };
    willNavigate(
      allowedNavigation,
      `${pathToFileURL(path.join(desktopRendererPath, "index.html")).href}#/editor`,
    );
    assert.equal(allowedNavigation.prevented, false);

    const unrelatedLocalNavigation = {
      prevented: false,
      preventDefault() {
        this.prevented = true;
      },
    };
    willNavigate(unrelatedLocalNavigation, "file:///tmp/untrusted.html");
    assert.equal(unrelatedLocalNavigation.prevented, true);

    const blockedNavigation = {
      prevented: false,
      preventDefault() {
        this.prevented = true;
      },
    };
    willNavigate(blockedNavigation, "https://example.com/");
    assert.equal(blockedNavigation.prevented, true);
    assert.deepEqual(runtime.externalUrls, []);

    const externalNavigation = {
      prevented: false,
      preventDefault() {
        this.prevented = true;
      },
    };
    willNavigate(
      externalNavigation,
      "https://github.com/drawdb-io/drawdb/issues",
    );
    assert.equal(externalNavigation.prevented, true);
    assert.deepEqual(runtime.externalUrls, [
      "https://github.com/drawdb-io/drawdb/issues",
    ]);

    assert.deepEqual(
      windowOpen({ url: "file:///tmp/drawdb/index.html#/editor" }),
      {
        action: "deny",
      },
    );
    assert.deepEqual(
      windowOpen({ url: "https://drawdb-io.github.io/docs/shortcuts" }),
      { action: "deny" },
    );
    assert.deepEqual(runtime.externalUrls, [
      "https://github.com/drawdb-io/drawdb/issues",
      "https://drawdb-io.github.io/docs/shortcuts",
    ]);
  });

  it("keeps the preload bridge limited to fixed file IPC channels", () => {
    const preload = fs.readFileSync(preloadPath, "utf8");

    assert.match(preload, /contextBridge\.exposeInMainWorld/);
    assert.match(preload, /Object\.freeze/);
    assert.match(preload, /ipcRenderer\.invoke\("project:open"\)/);
    assert.match(preload, /ipcRenderer\.invoke\("project:save"/);
    assert.match(preload, /ipcRenderer\.invoke\("project:save-as"/);
    assert.match(preload, /ipcRenderer\.invoke\("ddl:export"/);
    assert.match(preload, /ipcRenderer\.invoke\("snowflake:profiles"/);
    assert.match(preload, /ipcRenderer\.invoke\("snowflake:connect"/);
    assert.match(preload, /ipcRenderer\.invoke\("snowflake:disconnect"/);
    assert.match(preload, /ipcRenderer\.invoke\("snowflake:list-databases"/);
    assert.match(preload, /ipcRenderer\.invoke\("snowflake:list-schemas"/);
    assert.match(preload, /ipcRenderer\.invoke\("snowflake:list-tables"/);
    assert.match(preload, /ipcRenderer\.invoke\("snowflake:reverse-engineer"/);
    assert.match(preload, /ipcRenderer\.on\(autoArrangeChannel/);
    assert.doesNotMatch(
      preload,
      /ipcRenderer\.(?:send|sendSync|postMessage)/,
    );
    assert.doesNotMatch(preload, /invoke\(\s*(?:channel|\.\.\.)/);
    assert.doesNotMatch(preload, /require\s*\(|node:fs/);
  });

  it("starts the production build from file URLs without a web server", async () => {
    const runtime = await startProductionMainWithElectronHarness();

    assert.deepEqual(runtime.loadFiles, [
      {
        filePath: path.join(desktopRendererPath, "index.html"),
        options: { hash: "/editor" },
      },
    ]);
    assert.equal(runtime.windows.length, 1);
    assert.deepEqual(
      runtime.requiredModules.filter((specifier) =>
        forbiddenStartupModules.includes(specifier),
      ),
      [],
    );

    const desktopIndex = fs.readFileSync(
      path.join(desktopRendererPath, "index.html"),
      "utf8",
    );
    const assetUrls = [
      ...desktopIndex.matchAll(/(?:src|href)="(\.\/assets\/[^"]+)"/g),
    ].map(([, assetUrl]) => {
      const entryUrl = pathToFileURL(
        path.join(desktopRendererPath, "index.html"),
      );
      entryUrl.hash = "/editor";
      return new URL(assetUrl, entryUrl).toString();
    });
    assert.ok(
      assetUrls.length > 0,
      "desktop index should contain relative built assets",
    );
    for (const url of assetUrls) {
      assert.equal(new URL(url).protocol, "file:");
      assert.equal(
        fileURLToPath(url).startsWith(`${desktopRendererPath}${path.sep}`),
        true,
      );
      assert.equal(
        fs.existsSync(fileURLToPath(url)),
        true,
        `desktop asset should exist: ${url}`,
      );
      assert.doesNotMatch(
        url,
        /^https?:\/\/(?:localhost|127(?:\.\d+){3}|\[?::1\]?)(?::|\/|$)/i,
      );
    }
  });

  it("uses hash routing for file URLs and keeps BrowserRouter for the web", () => {
    const app = fs.readFileSync(appPath, "utf8");
    const webIndex = fs.readFileSync(
      path.join(webRendererPath, "index.html"),
      "utf8",
    );
    const desktopIndex = fs.readFileSync(
      path.join(desktopRendererPath, "index.html"),
      "utf8",
    );

    assert.match(
      app,
      /import\s*\{[^}]*BrowserRouter[^}]*\}\s*from\s*["']react-router-dom["']/,
    );
    assert.match(app, /window\.location\.protocol === "file:"/);
    assert.match(app, /<HashRouter>/);
    assert.match(app, /<BrowserRouter>/);
    assert.match(app, /<Route path="\/editor" element=\{<Editor\s*\/>\}\s*\/>/);
    assert.match(webIndex, /(?:src|href)="\/assets\//);
    assert.doesNotMatch(webIndex, /(?:src|href)="\.\/assets\//);
    assert.match(desktopIndex, /(?:src|href)="\.\/assets\//);
  });

  it("keeps Electron process artifacts isolated from renderer outputs", () => {
    const rendererFiles = fs
      .readdirSync(path.join(repositoryRoot, "src"), {
        recursive: true,
        withFileTypes: true,
      })
      .filter(
        (entry) =>
          entry.isFile() &&
          /\.[cm]?[jt]sx?$/.test(entry.name) &&
          !entry.parentPath.startsWith(
            path.join(repositoryRoot, "src", "electron"),
          ),
      );

    for (const entry of rendererFiles) {
      const sourcePath = path.join(entry.parentPath, entry.name);
      const source = fs.readFileSync(sourcePath, "utf8");
      assert.doesNotMatch(
        source,
        /(?:from\s*|import\s*\(|require\s*\()\s*["']electron["']/,
        `renderer source must not import Electron: ${sourcePath}`,
      );
      assert.doesNotMatch(
        source,
        /(?:from\s*|import\s*\(|require\s*\()\s*["'][^"']*(?:src\/)?electron\//,
        `renderer source must not import Electron process code: ${sourcePath}`,
      );
    }

    assert.deepEqual(
      fs.readdirSync(path.dirname(electronMainBuildPath)).sort(),
      ["main.cjs", "preload.cjs"],
    );
    assert.equal(fs.existsSync(path.join(webRendererPath, "index.html")), true);
    assert.equal(
      fs.existsSync(path.join(desktopRendererPath, "index.html")),
      true,
    );
  });
});

describe("SS-004 native project file bridge contract", () => {
  it("keeps native dialogs and filesystem access in Electron main", async () => {
    const main = fs.readFileSync(mainPath, "utf8");
    const runtime = await startProductionMainWithElectronHarness();

    assert.match(main, /\bdialog\b/);
    assert.match(main, /\bipcMain\b/);
    assert.match(main, /node:fs/);
    assert.deepEqual([...runtime.ipcHandlers.keys()].sort(), [
      "ddl:export",
      "project:open",
      "project:save",
      "project:save-as",
      "snowflake:connect",
      "snowflake:disconnect",
      "snowflake:list-databases",
      "snowflake:list-schemas",
      "snowflake:list-tables",
      "snowflake:profiles",
      "snowflake:reverse-engineer",
    ]);
  });

  it("exposes only a frozen, narrow project API from preload", async () => {
    const { exposed, invocations } = loadProductionPreloadWithElectronHarness();
    const desktopApi = exposed.get("drawdbDesktop");

    assert.ok(desktopApi, "preload must expose window.drawdbDesktop");
    assert.equal(Object.isFrozen(desktopApi), true);
    assert.deepEqual(Object.keys(desktopApi).sort(), [
      "ddlExport",
      "projectFiles",
      "runtimeVersion",
      "snowflake",
    ]);
    assert.equal(desktopApi.runtimeVersion, 2);
    assert.equal(Object.isFrozen(desktopApi.projectFiles), true);
    assert.equal(Object.isFrozen(desktopApi.ddlExport), true);
    assert.equal(Object.isFrozen(desktopApi.snowflake), true);
    assert.deepEqual(Object.keys(desktopApi.ddlExport), ["save"]);
    assert.deepEqual(Object.keys(desktopApi.projectFiles).sort(), [
      "open",
      "save",
      "saveAs",
    ]);
    assert.deepEqual(Object.keys(desktopApi.snowflake).sort(), [
      "connect",
      "disconnect",
      "listDatabases",
      "listProfiles",
      "listSchemas",
      "listTables",
      "reverseEngineer",
    ]);
    assert.equal("invoke" in desktopApi, false);
    assert.equal("ipcRenderer" in desktopApi, false);
    assert.equal("readFile" in desktopApi, false);
    assert.equal("writeFile" in desktopApi, false);

    const saveRequest = {
      contents: '{"project_version":"1"}\n',
      suggestedName: "model.erd.json",
    };
    await desktopApi.projectFiles.open();
    await desktopApi.projectFiles.save(saveRequest);
    await desktopApi.projectFiles.saveAs(saveRequest);
    const ddlRequest = {
      contents: "CREATE TABLE T (ID NUMBER);\n",
      suggestedName: "model.sql",
    };
    await desktopApi.ddlExport.save(ddlRequest);
    const connectRequest = {
      mode: "profile",
      profileName: "erd-tool",
    };
    await desktopApi.snowflake.listProfiles();
    await desktopApi.snowflake.connect(connectRequest);
    await desktopApi.snowflake.listDatabases("session-1");
    await desktopApi.snowflake.listSchemas("session-1", "CHINOOK");
    await desktopApi.snowflake.listTables(
      "session-1",
      "CHINOOK",
      "PUBLIC",
    );
    await desktopApi.snowflake.reverseEngineer({
      sessionId: "session-1",
      database: "CHINOOK",
      schema: "PUBLIC",
      tables: ["ARTIST"],
    });
    await desktopApi.snowflake.disconnect("session-1");
    assert.deepEqual(invocations, [
      { channel: "project:open", payload: undefined },
      { channel: "project:save", payload: saveRequest },
      { channel: "project:save-as", payload: saveRequest },
      { channel: "ddl:export", payload: ddlRequest },
      { channel: "snowflake:profiles", payload: undefined },
      { channel: "snowflake:connect", payload: connectRequest },
      {
        channel: "snowflake:list-databases",
        payload: { sessionId: "session-1" },
      },
      {
        channel: "snowflake:list-schemas",
        payload: { sessionId: "session-1", database: "CHINOOK" },
      },
      {
        channel: "snowflake:list-tables",
        payload: {
          sessionId: "session-1",
          database: "CHINOOK",
          schema: "PUBLIC",
        },
      },
      {
        channel: "snowflake:reverse-engineer",
        payload: {
          sessionId: "session-1",
          database: "CHINOOK",
          schema: "PUBLIC",
          tables: ["ARTIST"],
        },
      },
      {
        channel: "snowflake:disconnect",
        payload: { sessionId: "session-1" },
      },
    ]);
  });

  it("integrates the desktop bridge with the existing canonical serializer", () => {
    assert.equal(fs.existsSync(desktopBridgePath), true);
    const bridge = fs.readFileSync(desktopBridgePath, "utf8");
    assert.match(bridge, /diagramToCanonicalProject/);
    assert.match(bridge, /canonicalProjectToDiagram/);
    assert.match(bridge, /JSON\.stringify/);
    assert.match(bridge, /JSON\.parse/);
    assert.match(bridge, /drawdbDesktop/);
    assert.match(bridge, /api\.(?:open|save|saveAs)/);
    assert.doesNotMatch(
      bridge,
      /(?:from\s*|require\s*\()\s*["'](?:node:)?fs["']/,
    );
    assert.doesNotMatch(bridge, /(?:from\s*|require\s*\()\s*["']electron["']/);
  });

  it("separates native documents from browser and cloud persistence", () => {
    const actions = fs.readFileSync(erdToolActionsPath, "utf8");
    const workspace = fs.readFileSync(workspacePath, "utf8");
    const controlPanel = fs.readFileSync(controlPanelPath, "utf8");

    assert.match(actions, /if \(native\) \{\s*onNativeDocumentChange\(\)/);
    assert.match(
      actions,
      /if \(desktopProjectFiles\) \{\s*onNativeDocumentChange\(\)/,
    );
    assert.match(
      actions,
      /applyDiagram\(result\.diagram, \{ native: true \}\)/,
    );
    assert.match(actions, /diagramToCanonicalProject\(currentDiagram\(\)\)/);
    assert.match(actions, /setSaveState\(State\.SAVED\)/);
    assert.doesNotMatch(
      actions.match(/const applyDiagram[\s\S]*?const loadProjectText/)?.[0] ??
        "",
      /State\.SAVING/,
    );
    assert.match(workspace, /diagramSource === "native"/);
    assert.match(workspace, /setDiagramSource\("native"\)/);
    assert.match(
      workspace,
      /if \(diagramSource === "native"\) \{\s*requestDesktopProjectSave\(\);\s*return;/,
    );
    assert.match(
      controlPanel,
      /if \(isNativeDocument\) \{\s*requestDesktopProjectSave\(\);\s*return;/,
    );
    assert.match(actions, /confirmNativeDocumentReplacement/);
    assert.match(actions, /await confirmNativeDocumentReplacement\(\)/);
    assert.match(actions, /This native ERD project has unsaved changes/);
    assert.match(actions, /Discard unsaved changes/);
    assert.match(actions, /onDesktopProjectSaveRequest/);
    assert.match(actions, /onDesktopProjectSaveAsRequest/);
    assert.match(actions, /onDesktopProjectOpenRequest/);
    assert.match(
      actions,
      /onNativeDocumentChange\(\);\s*setHasNativeProjectPath\(true\);/,
    );
    assert.match(
      controlPanel,
      /if \(hasDesktopProjectFiles\(\)\) \{\s*requestDesktopProjectOpen\(\);\s*return;/,
    );
    assert.match(
      controlPanel,
      /if \(isNativeDocument\) \{\s*requestDesktopProjectSaveAs\(\);\s*return;/,
    );
    assert.match(actions, /currentNativeRevision !== savedNativeRevision/);
    assert.match(
      actions,
      /setSavedNativeRevision\(diagramRevision\(diagram\)\)/,
    );
    assert.match(actions, /setSaveState\(State\.DIRTY\)/);
    assert.match(controlPanel, /case State\.DIRTY:/);
    assert.match(
      workspace,
      /saveState === State\.SAVING\) setSaveState\(State\.DIRTY\)/,
    );
  });

  it("rejects project-file IPC from any untrusted renderer", async () => {
    const runtime = await startProductionMainWithElectronHarness();
    const handler = runtime.ipcHandlers.get("project:open");

    await assert.rejects(handler({ sender: {} }), /PROJECT_ACCESS_DENIED/);
    assert.equal(runtime.openDialogCalls.length, 0);
  });

  it("rejects project-file IPC from subframes in the trusted window", async () => {
    const runtime = await startProductionMainWithElectronHarness();
    const handler = runtime.ipcHandlers.get("project:open");

    await assert.rejects(
      handler({
        sender: runtime.windows[0].webContents,
        senderFrame: { parent: runtime.windows[0].webContents.mainFrame },
      }),
      /PROJECT_ACCESS_DENIED/,
    );
    assert.equal(runtime.openDialogCalls.length, 0);
  });

  it("routes the editor save command to the registered native writer", async () => {
    const previousWindow = globalThis.window;
    const nativeWindow = new EventTarget();
    globalThis.window = nativeWindow;
    try {
      const bridge = await import(
        `${pathToFileURL(desktopBridgePath)}?save-event`
      );
      let requests = 0;
      const unsubscribe = bridge.onDesktopProjectSaveRequest(() => {
        requests += 1;
      });

      bridge.requestDesktopProjectSave();
      assert.equal(requests, 1);
      unsubscribe();
      bridge.requestDesktopProjectSave();
      assert.equal(requests, 1);
    } finally {
      if (previousWindow === undefined) delete globalThis.window;
      else globalThis.window = previousWindow;
    }
  });

  it("routes the established Save As command to the native writer", async () => {
    const previousWindow = globalThis.window;
    const nativeWindow = new EventTarget();
    globalThis.window = nativeWindow;
    try {
      const bridge = await import(
        `${pathToFileURL(desktopBridgePath)}?save-as-event`
      );
      let requests = 0;
      const unsubscribe = bridge.onDesktopProjectSaveAsRequest(() => {
        requests += 1;
      });

      bridge.requestDesktopProjectSaveAs();
      assert.equal(requests, 1);
      unsubscribe();
      bridge.requestDesktopProjectSaveAs();
      assert.equal(requests, 1);

      let openRequests = 0;
      const unsubscribeOpen = bridge.onDesktopProjectOpenRequest(() => {
        openRequests += 1;
      });
      bridge.requestDesktopProjectOpen();
      assert.equal(openRequests, 1);
      unsubscribeOpen();
      bridge.requestDesktopProjectOpen();
      assert.equal(openRequests, 1);
    } finally {
      if (previousWindow === undefined) delete globalThis.window;
      else globalThis.window = previousWindow;
    }
  });

  it("executes renderer serialization and deserialization through the narrow bridge", async () => {
    const invocations = [];
    const openedProject = completeDrawdbProject("opened-offline");
    const previousWindow = globalThis.window;
    globalThis.window = {
      drawdbDesktop: {
        projectFiles: {
          open: async () => ({
            canceled: false,
            filePath: "/tmp/opened.erd.json",
            contents: `${JSON.stringify(openedProject)}\n`,
          }),
          save: async (request) => {
            invocations.push({ operation: "save", request });
            return { canceled: false, filePath: "/tmp/saved.erd.json" };
          },
          saveAs: async (request) => {
            invocations.push({ operation: "saveAs", request });
            return { canceled: false, filePath: "/tmp/saved-as.erd.json" };
          },
        },
      },
    };

    try {
      const bridge = await import(
        `${pathToFileURL(desktopBridgePath)}?runtime`
      );
      const diagram = canonicalProjectToDiagram(openedProject);
      assert.equal(diagram.database, "mysql");
      assert.equal(diagram.notes[0].content, "offline");
      assert.equal(diagram.areas[0].name, "Core");
      assert.equal(diagram.types[0].name, "money");
      assert.equal(diagram.enums[0].name, "status");
      assert.equal(bridge.hasDesktopProjectFiles(), true);
      assert.deepEqual((await bridge.openDesktopProject()).diagram, diagram);
      await bridge.saveDesktopProject(diagram);
      await bridge.saveDesktopProjectAs(diagram);

      assert.deepEqual(
        invocations.map(({ operation }) => operation),
        ["save", "saveAs"],
      );
      for (const { request } of invocations) {
        assert.deepEqual(JSON.parse(request.contents), openedProject);
        assert.match(request.suggestedName, /\.erd\.json$/);
        assert.doesNotMatch(request.contents, /credential|password|secret/i);
      }
    } finally {
      if (previousWindow === undefined) delete globalThis.window;
      else globalThis.window = previousWindow;
    }
  });

  it("opens JSON selected by the native dialog and returns its contents", async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "drawdb-open-"));
    const projectPath = path.join(tempDir, "offline.erd.json");
    const contents = `${JSON.stringify(canonicalOfflineProject(), null, 2)}\n`;
    fs.writeFileSync(projectPath, contents, "utf8");

    try {
      const runtime = await startProductionMainWithElectronHarness({
        openDialogResult: { canceled: false, filePaths: [projectPath] },
      });
      const result = await getIpcHandler(runtime, "project:open")();

      assert.deepEqual(result, {
        canceled: false,
        filePath: projectPath,
        contents,
      });
      assert.equal(runtime.openDialogCalls.length, 1);
      const openOptions = runtime.openDialogCalls[0].at(-1);
      assert.ok(
        openOptions.filters.some(
          (filter) =>
            /drawdb|erd|project/i.test(filter.name) &&
            filter.extensions.includes("erd.json") &&
            filter.extensions.includes("json"),
        ),
        "open dialog must advertise both .erd.json and .json project files",
      );
      assert.equal(runtime.saveDialogCalls.length, 0);
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("opens compatible canonical v1 projects without diagram layout", async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "drawdb-open-v1-"));
    const projectPath = path.join(tempDir, "legacy.erd.json");
    const project = canonicalOfflineProject("legacy-no-layout");
    delete project.diagram_layout;
    const contents = `${JSON.stringify(project)}\n`;
    fs.writeFileSync(projectPath, contents, "utf8");

    try {
      const runtime = await startProductionMainWithElectronHarness({
        openDialogResult: { canceled: false, filePaths: [projectPath] },
      });
      const result = await getIpcHandler(runtime, "project:open")();
      assert.equal(result.canceled, false);
      assert.equal(result.filePath, projectPath);
      assert.deepEqual(JSON.parse(result.contents), project);
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("saves through a native dialog, saves again to the main-owned path, and reopens offline", async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "drawdb-save-"));
    const projectPath = path.join(tempDir, "offline.erd.json");
    const userDataPath = path.join(tempDir, "electron-user-data");
    const initialContents = `${JSON.stringify(completeDrawdbProject(), null, 2)}\n`;
    const updatedContents = `${JSON.stringify(
      completeDrawdbProject("offline-project-updated"),
      null,
      2,
    )}\n`;

    try {
      const runtime = await startProductionMainWithElectronHarness({
        openDialogResult: { canceled: false, filePaths: [projectPath] },
        saveDialogResult: { canceled: false, filePath: projectPath },
        userDataPath,
      });
      const saveAs = getIpcHandler(runtime, "project:save-as");
      const save = getIpcHandler(runtime, "project:save");
      const open = getIpcHandler(runtime, "project:open");

      assert.deepEqual(
        await saveAs({
          contents: initialContents,
          suggestedName: "offline.erd.json",
        }),
        { canceled: false, filePath: projectPath },
      );
      assert.equal(fs.readFileSync(projectPath, "utf8"), initialContents);

      assert.deepEqual(
        await save({
          contents: updatedContents,
          suggestedName: "ignored-after-save-as.erd.json",
        }),
        { canceled: false, filePath: projectPath },
      );
      assert.equal(runtime.saveDialogCalls.length, 1);
      assert.equal(fs.readFileSync(projectPath, "utf8"), updatedContents);

      assert.deepEqual(await open(), {
        canceled: false,
        filePath: projectPath,
        contents: updatedContents,
      });
      assert.deepEqual(
        JSON.parse(updatedContents),
        completeDrawdbProject("offline-project-updated"),
      );
      assert.deepEqual(
        JSON.parse(
          fs.readFileSync(
            path.join(userDataPath, "recent-projects.json"),
            "utf8",
          ),
        ),
        [projectPath],
      );
      assert.equal("recentProjects" in JSON.parse(updatedContents), false);
      assert.deepEqual(
        runtime.requiredModules.filter((specifier) =>
          forbiddenStartupModules.includes(specifier),
        ),
        [],
      );
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("reopens a saved project in a fresh offline Electron runtime", async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "drawdb-restart-"));
    const projectPath = path.join(tempDir, "restart.erd.json");
    const project = completeDrawdbProject("fresh-process-offline");
    try {
      const writer = await startProductionMainWithElectronHarness({
        saveDialogResult: { canceled: false, filePath: projectPath },
      });
      await getIpcHandler(
        writer,
        "project:save-as",
      )({
        contents: JSON.stringify(project),
        suggestedName: "restart.erd.json",
      });

      const reader = await startProductionMainWithElectronHarness({
        openDialogResult: { canceled: false, filePaths: [projectPath] },
      });
      const reopened = await getIpcHandler(reader, "project:open")();
      assert.deepEqual(JSON.parse(reopened.contents), project);
      assert.deepEqual(
        reader.requiredModules.filter((specifier) =>
          forbiddenStartupModules.includes(specifier),
        ),
        [],
      );
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("treats canceled open and save dialogs as no-op results", async () => {
    const runtime = await startProductionMainWithElectronHarness();

    assert.deepEqual(await getIpcHandler(runtime, "project:open")(), {
      canceled: true,
    });
    assert.deepEqual(
      await getIpcHandler(
        runtime,
        "project:save-as",
      )({
        contents: `${JSON.stringify(canonicalOfflineProject())}\n`,
        suggestedName: "canceled.erd.json",
      }),
      { canceled: true },
    );
    assert.equal(runtime.openDialogCalls.length, 1);
    assert.equal(runtime.saveDialogCalls.length, 1);
  });

  it("propagates useful project read errors to the renderer", async () => {
    const missingPath = path.join(
      os.tmpdir(),
      `drawdb-missing-${process.pid}-${Date.now()}.erd.json`,
    );
    const runtime = await startProductionMainWithElectronHarness({
      openDialogResult: { canceled: false, filePaths: [missingPath] },
    });

    await assert.rejects(getIpcHandler(runtime, "project:open")(), (error) => {
      assert.match(error.message, /PROJECT_OPEN_FAILED/);
      assert.doesNotMatch(
        error.message,
        new RegExp(path.basename(missingPath)),
      );
      assert.doesNotMatch(error.message, /ENOENT|no such file/i);
      return true;
    });
  });

  it("sanitizes native open-dialog failures", async () => {
    const runtime = await startProductionMainWithElectronHarness({
      openDialogResult: new Error("native dialog exploded at /secret/path"),
    });
    await assert.rejects(getIpcHandler(runtime, "project:open")(), (error) => {
      assert.match(error.message, /PROJECT_OPEN_FAILED/);
      assert.doesNotMatch(error.message, /exploded|secret\/path/i);
      return true;
    });
  });

  it("propagates useful project write errors without reporting a save", async () => {
    const tempDir = fs.mkdtempSync(
      path.join(os.tmpdir(), "drawdb-write-error-"),
    );
    try {
      const runtime = await startProductionMainWithElectronHarness({
        saveDialogResult: { canceled: false, filePath: tempDir },
      });
      await assert.rejects(
        getIpcHandler(
          runtime,
          "project:save-as",
        )({
          contents: `${JSON.stringify(canonicalOfflineProject())}\n`,
          suggestedName: "offline.erd.json",
        }),
        (error) => {
          assert.match(error.message, /PROJECT_SAVE_FAILED/);
          assert.doesNotMatch(error.message, new RegExp(tempDir));
          assert.doesNotMatch(error.message, /EISDIR|ENOTDIR/i);
          return true;
        },
      );
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("rejects credentials before project contents can be persisted", async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "drawdb-secret-"));
    const projectPath = path.join(tempDir, "must-not-exist.erd.json");
    const unsafeProject = {
      ...completeDrawdbProject(),
    };
    unsafeProject.drawdb_document.tables[0].credentials = {
      password: "never-write-this",
    };

    try {
      const runtime = await startProductionMainWithElectronHarness({
        saveDialogResult: { canceled: false, filePath: projectPath },
      });
      await assert.rejects(
        getIpcHandler(
          runtime,
          "project:save-as",
        )({
          contents: `${JSON.stringify(unsafeProject)}\n`,
          suggestedName: "unsafe.erd.json",
        }),
        /credential|password|secret|project/i,
      );
      assert.equal(fs.existsSync(projectPath), false);
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("normalizes duplicate keys so shadowed credentials are never persisted or returned", async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "drawdb-shadowed-"));
    const projectPath = path.join(tempDir, "safe.erd.json");
    const project = completeDrawdbProject("duplicate-key-safe");
    const shadowed = `{"drawdb_document":{"password":"never-write-this"},${JSON.stringify(project).slice(1)}`;
    try {
      const writer = await startProductionMainWithElectronHarness({
        saveDialogResult: { canceled: false, filePath: projectPath },
      });
      await getIpcHandler(
        writer,
        "project:save-as",
      )({
        contents: shadowed,
        suggestedName: "safe.erd.json",
      });
      const saved = fs.readFileSync(projectPath, "utf8");
      assert.deepEqual(JSON.parse(saved), project);
      assert.doesNotMatch(saved, /never-write-this|password/i);

      fs.writeFileSync(projectPath, shadowed, "utf8");
      const reader = await startProductionMainWithElectronHarness({
        openDialogResult: { canceled: false, filePaths: [projectPath] },
      });
      const opened = await getIpcHandler(reader, "project:open")();
      assert.deepEqual(JSON.parse(opened.contents), project);
      assert.doesNotMatch(opened.contents, /never-write-this|password/i);
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("round-trips legitimate credential-like database identifiers", async () => {
    const tempDir = fs.mkdtempSync(
      path.join(os.tmpdir(), "drawdb-identifiers-"),
    );
    const projectPath = path.join(tempDir, "identifiers.erd.json");
    const tables = ["ACCOUNT", "ROLE", "SESSION", "WAREHOUSE"].map(
      (name, index) => ({
        id: `table-${index}`,
        name,
        x: index * 240,
        y: 80,
        fields: [
          {
            id: `field-${index}`,
            name: "ID",
            type: "NUMBER",
            size: "38,0",
            default: "",
            check: "",
            primary: true,
            unique: false,
            unsigned: false,
            notNull: true,
            increment: false,
            comment: "",
          },
        ],
        comment: "",
        indices: [],
        uniqueConstraints: [],
        color: "#175e7a",
        namespace: {
          id: "namespace:MODEL.PUBLIC",
          catalog: "MODEL",
          schema: "PUBLIC",
        },
      }),
    );
    const project = diagramToCanonicalProject({
      database: "snowflake",
      title: "identifier-map-roundtrip",
      tables,
      relationships: [],
      notes: [],
      areas: [],
      types: [],
      enums: [],
      transform: { pan: { x: 0, y: 0 }, zoom: 1 },
    });
    try {
      const runtime = await startProductionMainWithElectronHarness({
        saveDialogResult: { canceled: false, filePath: projectPath },
        openDialogResult: { canceled: false, filePaths: [projectPath] },
      });
      await getIpcHandler(
        runtime,
        "project:save-as",
      )({
        contents: JSON.stringify(project),
        suggestedName: "identifiers.erd.json",
      });
      const reopened = await getIpcHandler(runtime, "project:open")();
      assert.deepEqual(JSON.parse(reopened.contents), project);
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("rejects malformed authoritative drawDB DTO values", async () => {
    const invalidProject = completeDrawdbProject("malformed-dto");
    invalidProject.drawdb_document.tables[0].id = { bad: true };
    invalidProject.drawdb_document.tables[0].name = 123;
    invalidProject.drawdb_document.tables[0].x = "40";
    invalidProject.drawdb_document.tables[0].fields[0] = { id: "field-only" };
    const runtime = await startProductionMainWithElectronHarness({
      saveDialogResult: {
        canceled: false,
        filePath: "/unused/invalid.erd.json",
      },
    });
    await assert.rejects(
      getIpcHandler(
        runtime,
        "project:save-as",
      )({
        contents: JSON.stringify(invalidProject),
        suggestedName: "invalid.erd.json",
      }),
      /PROJECT_SAVE_FAILED/,
    );
    assert.equal(runtime.saveDialogCalls.length, 0);
  });

  it("rejects unknown nested canonical fields before persistence", async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "drawdb-schema-"));
    const projectPath = path.join(tempDir, "must-not-exist.erd.json");
    const invalidProject = canonicalOfflineProject();
    invalidProject.physical_model.unexpected = true;

    try {
      const runtime = await startProductionMainWithElectronHarness({
        saveDialogResult: { canceled: false, filePath: projectPath },
      });
      await assert.rejects(
        getIpcHandler(
          runtime,
          "project:save-as",
        )({
          contents: `${JSON.stringify(invalidProject)}\n`,
          suggestedName: "invalid.erd.json",
        }),
        (error) => {
          assert.match(error.message, /PROJECT_SAVE_FAILED/);
          assert.doesNotMatch(error.message, /unexpected|physical_model/i);
          return true;
        },
      );
      assert.equal(runtime.saveDialogCalls.length, 0);
      assert.equal(fs.existsSync(projectPath), false);
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("rejects unknown nested drawDB fields before persistence", async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "drawdb-dto-"));
    const projectPath = path.join(tempDir, "must-not-exist.erd.json");
    const invalidProject = completeDrawdbProject();
    invalidProject.drawdb_document.tables[0].rendererOnlyState = true;

    try {
      const runtime = await startProductionMainWithElectronHarness({
        saveDialogResult: { canceled: false, filePath: projectPath },
      });
      await assert.rejects(
        getIpcHandler(
          runtime,
          "project:save-as",
        )({
          contents: `${JSON.stringify(invalidProject)}\n`,
          suggestedName: "invalid.erd.json",
        }),
        /PROJECT_SAVE_FAILED/,
      );
      assert.equal(runtime.saveDialogCalls.length, 0);
      assert.equal(fs.existsSync(projectPath), false);
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });
});

describe("SS-005 native Snowflake DDL export contract", () => {
  it("writes generated DDL through a native .sql save dialog", async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "drawdb-ddl-"));
    const selectedPath = path.join(tempDir, "retail-export");
    const expectedPath = `${selectedPath}.sql`;
    const contents = "CREATE TABLE RETAIL (ID NUMBER);\n";

    try {
      const runtime = await startProductionMainWithElectronHarness({
        saveDialogResult: { canceled: false, filePath: selectedPath },
      });
      const result = await getIpcHandler(runtime, "ddl:export")({
        contents,
        suggestedName: "RETAIL_EXPORT.sql",
      });

      assert.deepEqual(result, { canceled: false, filePath: expectedPath });
      assert.equal(fs.readFileSync(expectedPath, "utf8"), contents);
      assert.equal(runtime.saveDialogCalls.length, 1);
      const saveOptions = runtime.saveDialogCalls[0].at(-1);
      assert.equal(saveOptions.title, "Export Snowflake DDL");
      assert.equal(saveOptions.defaultPath, "RETAIL_EXPORT.sql");
      assert.ok(
        saveOptions.filters.some((filter) =>
          filter.extensions.includes("sql"),
        ),
      );
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("cancels without writing and sanitizes invalid export requests", async () => {
    const runtime = await startProductionMainWithElectronHarness();
    const handler = getIpcHandler(runtime, "ddl:export");

    assert.deepEqual(
      await handler({
        contents: "CREATE TABLE T (ID NUMBER);\n",
        suggestedName: "T.sql",
      }),
      { canceled: true },
    );
    await assert.rejects(
      handler({ contents: "", suggestedName: "not-sql.txt" }),
      (error) => {
        assert.match(error.message, /DDL_EXPORT_FAILED/);
        assert.doesNotMatch(error.message, /contents|suggestedName|not-sql/i);
        return true;
      },
    );
    assert.equal(runtime.saveDialogCalls.length, 1);
  });

  it("rejects DDL export IPC from untrusted renderers", async () => {
    const runtime = await startProductionMainWithElectronHarness();
    const handler = runtime.ipcHandlers.get("ddl:export");

    await assert.rejects(
      handler(
        { sender: {}, senderFrame: null },
        {
          contents: "CREATE TABLE T (ID NUMBER);\n",
          suggestedName: "T.sql",
        },
      ),
      /PROJECT_ACCESS_DENIED/,
    );
    assert.equal(runtime.saveDialogCalls.length, 0);
  });
});
