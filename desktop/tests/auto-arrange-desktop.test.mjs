import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const mainPath = path.join(repositoryRoot, "src", "electron", "main.ts");
const preloadPath = path.join(repositoryRoot, "src", "electron", "preload.ts");
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

describe("SS-006 desktop auto-arrange command", () => {
  it("registers Auto Arrange as a native Electron menu command", () => {
    const main = fs.readFileSync(mainPath, "utf8");

    assert.match(
      main,
      /import\s*\{[^}]*\bMenu\b[^}]*\}\s*from\s*["']electron["']/,
    );
    assert.match(main, /const autoArrangeChannel = "diagram:auto-arrange-request"/);
    assert.match(main, /function sendAutoArrangeToActiveDiagram\(\)/);
    assert.match(main, /BrowserWindow\.getFocusedWindow\(\)/);
    assert.match(main, /BrowserWindow\.getAllWindows\(\)\[0\]/);
    assert.match(main, /webContents\.send\(autoArrangeChannel\)/);
    assert.match(main, /function registerApplicationMenu\(\)/);
    assert.match(main, /Menu\.setApplicationMenu\(Menu\.buildFromTemplate\(template\)\)/);
    assert.match(main, /label:\s*"Diagram"/);
    assert.match(main, /label:\s*"Auto Arrange"/);
    assert.match(main, /accelerator:\s*"CmdOrCtrl\+Shift\+L"/);
    assert.match(main, /click:\s*sendAutoArrangeToActiveDiagram/);
    assert.match(
      main,
      /registerDdlExportHandler\(\);\s*registerSnowflakeHandlers\(\);\s*registerApplicationMenu\(\);\s*createWindow\(\);/,
    );
  });

  it("invokes renderer layout through a fixed preload event, not a generic IPC bridge", async () => {
    const preload = fs.readFileSync(preloadPath, "utf8");
    const bridge = fs.readFileSync(desktopBridgePath, "utf8");
    const actions = fs.readFileSync(erdToolActionsPath, "utf8");

    assert.match(preload, /ipcRenderer\.on\(autoArrangeChannel/);
    assert.match(
      preload,
      /window\.dispatchEvent\(new Event\(autoArrangeEvent\)\)/,
    );
    assert.doesNotMatch(preload, /exposeInMainWorld\([^)]*ipcRenderer/);
    assert.doesNotMatch(preload, /sendSync|postMessage|invoke\(\s*(?:channel|\.\.\.)/);

    assert.match(bridge, /DESKTOP_AUTO_ARRANGE_REQUEST/);
    assert.match(bridge, /onDesktopAutoArrangeRequest/);
    assert.match(bridge, /requestDesktopAutoArrange/);
    assert.doesNotMatch(bridge, /(?:from\s*|require\s*\()\s*["']electron["']/);

    assert.match(actions, /data-testid="erd-auto-layout"/);
    assert.match(actions, /onClick=\{runAutoLayout\}/);
    assert.match(actions, /onDesktopAutoArrangeRequest/);
    assert.match(actions, /autoLayoutRef\.current = runAutoLayout/);
    assert.match(actions, /void autoLayoutRef\.current\?\.\(\)/);
    assert.match(actions, /await layoutDiagram\(tables, relationships\)/);

    const previousWindow = globalThis.window;
    const target = new EventTarget();
    globalThis.window = {
      addEventListener: target.addEventListener.bind(target),
      removeEventListener: target.removeEventListener.bind(target),
      dispatchEvent: target.dispatchEvent.bind(target),
    };
    const calls = [];

    try {
      const moduleUrl = `${pathToFileURL(desktopBridgePath)}?ss006-auto-arrange`;
      const bridgeModule = await import(moduleUrl);
      const unsubscribe = bridgeModule.onDesktopAutoArrangeRequest(() => {
        calls.push("arrange");
      });

      bridgeModule.requestDesktopAutoArrange();
      unsubscribe();
      bridgeModule.requestDesktopAutoArrange();

      assert.deepEqual(calls, ["arrange"]);
    } finally {
      if (previousWindow === undefined) delete globalThis.window;
      else globalThis.window = previousWindow;
    }
  });

  it("is safe when no project window or diagram tables are active", () => {
    const main = fs.readFileSync(mainPath, "utf8");
    const actions = fs.readFileSync(erdToolActionsPath, "utf8");

    assert.match(main, /if \(!window \|\| window\.isDestroyed\(\)\) return;/);
    assert.match(actions, /if \(!tables\.length\) \{\s*return;\s*\}/);
    assert.match(actions, /if \(layout\.readOnly\) \{\s*Toast\.error\("Editor is read-only"\);\s*return;/);
    assert.doesNotMatch(main, /loadURL|vite|preview|python|child_process/);
    assert.doesNotMatch(actions, /(?:from\s*|require\s*\()\s*["']electron["']/);
  });
});
