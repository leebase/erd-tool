import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const packagePath = path.join(repositoryRoot, "package.json");
const packageLockPath = path.join(repositoryRoot, "package-lock.json");
const viteElectronConfigPath = path.join(
  repositoryRoot,
  "vite.electron.config.js",
);
const mainPath = path.join(repositoryRoot, "src", "electron", "main.ts");
const preloadPath = path.join(repositoryRoot, "src", "electron", "preload.ts");
const linuxIconPath = path.join(repositoryRoot, "build", "icon.png");
const windowsIconPath = path.join(repositoryRoot, "build", "icon.ico");
const macIconPath = path.join(repositoryRoot, "build", "icon.icns");
const packagingConfigCandidates = [
  "electron-builder.json",
  "electron-builder.json5",
  "electron-builder.yml",
  "electron-builder.yaml",
  "electron-builder.config.js",
  "electron-builder.config.cjs",
  "electron-builder.config.mjs",
  "electron-forge.config.js",
  "electron-forge.config.cjs",
  "electron-forge.config.mjs",
];
const forbiddenRuntimeTools =
  /\b(?:python|python3|py|vite\s+preview|vite\s+--host|vite\s+--listen|npm\s+run\s+(?:dev|preview)|localhost|127\.0\.0\.1|0\.0\.0\.0|::1)\b/i;
const credentialPattern =
  /(?:password|passwd|secret|token|credential|private[_-]?key|session[_-]?key|access[_-]?key|api[_-]?key|client[_-]?secret|refresh[_-]?token)/i;

function readText(relativePath) {
  return fs.readFileSync(path.join(repositoryRoot, relativePath), "utf8");
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function readPngSize(filePath) {
  const buffer = fs.readFileSync(filePath);
  assert.equal(buffer.subarray(0, 8).toString("hex"), "89504e470d0a1a0a");
  assert.equal(buffer.subarray(12, 16).toString("ascii"), "IHDR");
  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20),
  };
}

function existingPackagingConfigFiles() {
  return packagingConfigCandidates.filter((candidate) =>
    fs.existsSync(path.join(repositoryRoot, candidate)),
  );
}

function getPackageJson() {
  return readJson(packagePath);
}

function getPackagingSource(packageJson = getPackageJson()) {
  const externalConfigFiles = existingPackagingConfigFiles();
  const sources = [];

  if (packageJson.build && typeof packageJson.build === "object") {
    sources.push({
      name: "package.json#build",
      parsed: packageJson.build,
      text: JSON.stringify(packageJson.build, null, 2),
    });
  }

  if (packageJson.config?.forge && typeof packageJson.config.forge === "object") {
    sources.push({
      name: "package.json#config.forge",
      parsed: packageJson.config.forge,
      text: JSON.stringify(packageJson.config.forge, null, 2),
    });
  }

  for (const fileName of externalConfigFiles) {
    sources.push({
      name: fileName,
      parsed: undefined,
      text: readText(fileName),
    });
  }

  assert.ok(
    sources.length > 0,
    "SS-012 must define Electron packaging config in package.json or a dedicated packaging config file",
  );

  return sources;
}

function stringify(value) {
  return JSON.stringify(value ?? {}, null, 2);
}

function collectValues(value) {
  if (Array.isArray(value)) {
    return value.flatMap((item) => collectValues(item));
  }
  if (value && typeof value === "object") {
    return Object.entries(value).flatMap(([key, item]) => [
      key,
      ...collectValues(item),
    ]);
  }
  return [String(value)];
}

function packageManagerScripts(packageJson = getPackageJson()) {
  return Object.entries(packageJson.scripts ?? {}).map(([name, command]) => ({
    name,
    command: String(command),
  }));
}

function packagingScripts(packageJson = getPackageJson()) {
  return packageManagerScripts(packageJson).filter(({ name, command }) =>
    /(?:pack|package|dist|installer|electron-builder|electron-forge|make|publish|release|ss012|desktop)/i.test(
      `${name} ${command}`,
    ),
  );
}

function findTargetConfig(source, platformNames) {
  if (source.parsed && typeof source.parsed === "object") {
    const directTarget = platformNames
      .map((platformName) => source.parsed[platformName])
      .find(Boolean);
    if (directTarget) return directTarget;
  }

  const text = source.text;
  const platformPattern = new RegExp(
    `\\b(?:${platformNames.join("|")})\\b`,
    "i",
  );
  return platformPattern.test(text) ? text : undefined;
}

function assertPlatformTarget(source, label, platformNames, expectedTargets) {
  const targetConfig = findTargetConfig(source, platformNames);
  assert.ok(
    targetConfig,
    `${source.name} must define an explicit ${label} packaging target`,
  );

  const values = collectValues(targetConfig).map((value) => value.toLowerCase());
  const hasExpectedTarget = expectedTargets.some((target) =>
    values.some((value) => value.includes(target)),
  );
  assert.ok(
    hasExpectedTarget,
    `${source.name} ${label} target must include one of: ${expectedTargets.join(", ")}`,
  );
}

function packagingText(packageJson = getPackageJson()) {
  return [
    stringify(packageJson.build),
    stringify(packageJson.config?.forge),
    ...existingPackagingConfigFiles().map((fileName) => readText(fileName)),
  ].join("\n");
}

function configuredTargets(platformConfig) {
  return (platformConfig?.target ?? []).map((entry) =>
    typeof entry === "string" ? entry : entry.target,
  );
}

function configuredArchitectures(platformConfig, targetName) {
  const target = (platformConfig?.target ?? []).find(
    (entry) =>
      typeof entry === "object" &&
      entry.target.toLowerCase() === targetName.toLowerCase(),
  );
  return target?.arch ?? [];
}

describe("SS-012 cross-platform packaging configuration", () => {
  it("keeps packaging Electron-based and wired to the existing drawDB desktop entries", () => {
    const packageJson = getPackageJson();
    const packageLock = readJson(packageLockPath);
    const viteElectronConfig = fs.readFileSync(viteElectronConfigPath, "utf8");
    const main = fs.readFileSync(mainPath, "utf8");
    const preload = fs.readFileSync(preloadPath, "utf8");
    const sources = getPackagingSource(packageJson);
    const sourceText = sources.map(({ text }) => text).join("\n");

    assert.equal(packageJson.main, "dist-electron/main.cjs");
    assert.ok(
      packageJson.devDependencies?.electron || packageJson.dependencies?.electron,
      "Electron must remain a project dependency for desktop packaging",
    );
    assert.equal(
      packageLock.packages?.[""]?.devDependencies?.["electron-builder"],
      packageJson.devDependencies?.["electron-builder"],
      "the lockfile must preserve the configured Electron packaging dependency",
    );
    assert.ok(
      packageLock.packages?.["node_modules/electron-builder"]?.version,
      "electron-builder must be reproducibly installed by the lockfile",
    );
    assert.match(
      stringify(packageJson.dependencies) +
        stringify(packageJson.devDependencies) +
        sourceText,
      /electron-(?:builder|forge)|@electron\/forge/i,
      "SS-012 packaging must use Electron packaging tooling",
    );
    assert.match(viteElectronConfig, /src\/electron\/main\.ts/);
    assert.match(viteElectronConfig, /src\/electron\/preload\.ts/);
    assert.match(viteElectronConfig, /outDir:\s*"dist-electron"/);
    assert.match(viteElectronConfig, /formats:\s*\[\s*"cjs"\s*\]/);
    assert.match(main, /loadFile\(rendererEntry,\s*\{\s*hash:\s*"\/editor"\s*\}\)/);
    assert.match(main, /"dist-desktop"/);
    assert.match(preload, /contextBridge\.exposeInMainWorld/);
    assert.doesNotMatch(main, /\.loadURL\s*\(|https?:\/\/localhost|127\.0\.0\.1/);
  });

  it("defines explicit installer targets for macOS, Linux, and Windows", () => {
    const sources = getPackagingSource();
    const combinedSource = {
      name: sources.map(({ name }) => name).join(", "),
      parsed: sources.find(({ parsed }) => parsed)?.parsed,
      text: sources.map(({ text }) => text).join("\n"),
    };

    assertPlatformTarget(combinedSource, "macOS", ["mac", "macos", "darwin"], [
      "dmg",
      "zip",
    ]);
    assertPlatformTarget(combinedSource, "Linux", ["linux"], ["appimage"]);
    assertPlatformTarget(
      combinedSource,
      "Windows",
      ["win", "windows", "win32"],
      ["nsis", "portable"],
    );

    const build = getPackageJson().build;
    assert.deepEqual(configuredTargets(build.mac), ["dmg", "zip"]);
    assert.deepEqual(configuredArchitectures(build.mac, "dmg"), [
      "arm64",
      "x64",
    ]);
    assert.deepEqual(configuredArchitectures(build.mac, "zip"), [
      "arm64",
      "x64",
    ]);
    assert.deepEqual(configuredTargets(build.linux), ["AppImage"]);
    assert.deepEqual(configuredArchitectures(build.linux, "AppImage"), [
      "x64",
    ]);
    assert.deepEqual(configuredTargets(build.win), ["nsis", "portable"]);
    assert.deepEqual(configuredArchitectures(build.win, "nsis"), ["x64"]);
    assert.deepEqual(configuredArchitectures(build.win, "portable"), [
      "x64",
    ]);
  });

  it("uses native app icon resources instead of a wide web logo", () => {
    const build = getPackageJson().build;
    const linuxIcon = readPngSize(linuxIconPath);
    const windowsIcon = fs.readFileSync(windowsIconPath);
    const macIcon = fs.readFileSync(macIconPath);

    assert.equal(build.directories.buildResources, "build");
    assert.equal(build.mac.icon, "build/icon.icns");
    assert.equal(build.linux.icon, "build/icon.png");
    assert.equal(build.win.icon, "build/icon.ico");
    assert.deepEqual(linuxIcon, { width: 512, height: 512 });
    assert.equal(windowsIcon.readUInt16LE(0), 0);
    assert.equal(windowsIcon.readUInt16LE(2), 1);
    assert.equal(windowsIcon.readUInt16LE(4), 1);
    assert.equal(windowsIcon.subarray(22, 30).toString("hex"), "89504e470d0a1a0a");
    assert.equal(macIcon.subarray(0, 4).toString("ascii"), "icns");
    assert.equal(macIcon.readUInt32BE(4), macIcon.length);
    assert.equal(macIcon.subarray(8, 12).toString("ascii"), "ic09");
  });

  it("has packaging scripts that build installers from bundled assets without Python or a local web server", () => {
    const packageJson = getPackageJson();
    const scripts = packagingScripts(packageJson);
    const packageScriptText = scripts
      .map(({ name, command }) => `${name}: ${command}`)
      .join("\n");
    const sourceText = packagingText(packageJson);

    assert.ok(
      scripts.some(({ command }) =>
        /electron-(?:builder|forge)|electron-builder|electron-forge/i.test(command),
      ),
      "SS-012 must expose an installer packaging script",
    );
    assert.match(packageJson.scripts["build:desktop-renderer"], /--base \.\/ --outDir dist-desktop/);
    assert.match(packageJson.scripts["build:electron"], /vite\.electron\.config\.js/);
    assert.match(packageJson.scripts["build:desktop"], /build:desktop-renderer/);
    assert.match(packageJson.scripts["build:desktop"], /build:electron/);
    for (const scriptName of [
      "package:desktop",
      "dist:desktop",
      "dist:desktop:mac",
      "dist:desktop:linux",
      "dist:desktop:win",
    ]) {
      assert.match(
        packageJson.scripts[scriptName],
        /--publish never/,
        `${scriptName} must not publish artifacts`,
      );
    }
    assert.match(sourceText, /dist-desktop/);
    assert.match(sourceText, /dist-electron/);
    assert.doesNotMatch(packageScriptText, forbiddenRuntimeTools);
    assert.doesNotMatch(sourceText, forbiddenRuntimeTools);
  });

  it("does not expose or embed credentials in packaging configuration", () => {
    const packageJson = getPackageJson();
    const sourceText = packagingText(packageJson);
    const sensitiveScriptText = packageManagerScripts(packageJson)
      .filter(({ name }) => /(?:pack|package|dist|installer|electron|desktop|ss012)/i.test(name))
      .map(({ name, command }) => `${name}: ${command}`)
      .join("\n");

    assert.doesNotMatch(sourceText, credentialPattern);
    assert.doesNotMatch(sensitiveScriptText, credentialPattern);
    assert.doesNotMatch(sourceText, /process\.env\.[A-Z0-9_]*(?:PASSWORD|SECRET|TOKEN|KEY|CREDENTIAL)[A-Z0-9_]*/i);
    assert.doesNotMatch(sourceText, /extra(?:Files|Resources)[\s\S]*(?:\.env|credentials?|secrets?)/i);
  });

  it("creates unique artifacts and bundles the required license and source notices", () => {
    const build = getPackageJson().build;
    const requiredNotices = ["LICENSE", "README.md", "THIRD_PARTY_NOTICES.md"];
    const includedFiles = build.files ?? [];
    const extraResourceSources = (build.extraResources ?? []).map(
      (resource) => resource.from,
    );

    assert.equal(build.asar, true);
    assert.equal(build.mac.identity, null, "SS-012 macOS packages stay unsigned");
    assert.equal(build.dmg.sign, false, "SS-012 disk images stay unsigned");
    assert.notEqual(
      build.nsis.artifactName,
      build.portable.artifactName,
      "NSIS and portable Windows targets must not overwrite each other",
    );
    assert.match(build.nsis.artifactName, /-setup\.\$\{ext\}$/);
    assert.match(build.portable.artifactName, /-portable\.\$\{ext\}$/);
    for (const notice of requiredNotices) {
      assert.ok(includedFiles.includes(notice), `${notice} must be packaged`);
      assert.ok(
        extraResourceSources.includes(notice),
        `${notice} must be visible in packaged resources`,
      );
    }
  });
});
