import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DRAWDB_ROOT = path.resolve(__dirname, "../..");
const DIST_DIR = path.join(DRAWDB_ROOT, "dist");

function resolveErdToolRepo() {
  if (process.env.ERD_TOOL_REPO) {
    return path.resolve(process.env.ERD_TOOL_REPO);
  }
  return path.resolve(DRAWDB_ROOT, "../erd-tool");
}

function erdToolAvailable(repoRoot) {
  return (
    fs.existsSync(repoRoot) &&
    fs.existsSync(path.join(repoRoot, "src", "erd_tool", "cli.py")) &&
    fs.existsSync(
      path.join(repoRoot, "docs", "fixtures", "snowflake_round_trip_v1.sql"),
    )
  );
}

function getFreePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      server.close((error) => {
        if (error) reject(error);
        else resolve(port);
      });
    });
    server.on("error", reject);
  });
}

function runCommand(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: ["ignore", "pipe", "pipe"],
      ...options,
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
      } else {
        reject(
          new Error(
            `${command} ${args.join(" ")} failed (${code}): ${stderr || stdout}`,
          ),
        );
      }
    });
  });
}

async function waitForServer(url, timeoutMs = 30000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const response = await fetch(url);
      if (response.ok || response.status === 404) {
        return;
      }
    } catch {
      // retry
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(`Timed out waiting for server at ${url}`);
}

function terminateProcess(child) {
  return new Promise((resolve) => {
    if (!child || child.exitCode !== null || child.killed) {
      resolve();
      return;
    }
    const finish = () => resolve();
    child.once("exit", finish);
    child.kill("SIGTERM");
    setTimeout(() => {
      if (child.exitCode === null && !child.killed) {
        child.kill("SIGKILL");
      }
    }, 2000);
  });
}

async function chooseSnowflake(page) {
  const snowflake = page.getByText("Snowflake", { exact: true });
  await snowflake.first().waitFor({ timeout: 15000 });
  await snowflake.first().click();
  const confirm = page.getByRole("button", { name: /confirm/i });
  if (await confirm.isVisible().catch(() => false)) {
    await confirm.click();
  }
}

async function renameCustomerTable(page) {
  await page.evaluate(() => {
    const inputs = [...document.querySelectorAll("input")];
    const nameField = inputs.find((input) => input.value === "CUSTOMER");
    if (!nameField) {
      throw new Error("Could not find CUSTOMER name input");
    }
    const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      "value",
    ).set;
    nativeInputValueSetter.call(nameField, "CLIENT");
    nameField.dispatchEvent(new Event("input", { bubbles: true }));
    nameField.dispatchEvent(new Event("change", { bubbles: true }));
    nameField.dispatchEvent(new Event("blur", { bubbles: true }));
  });
  await page.waitForFunction(
    () => document.body.innerText.includes("CLIENT"),
    null,
    { timeout: 10000 },
  );
}

const erdToolRepo = resolveErdToolRepo();
const skipReason = erdToolAvailable(erdToolRepo)
  ? false
  : `sibling erd-tool repo not found at ${erdToolRepo}`;

describe("ERD Tool browser flow", { timeout: 180000 }, () => {
  it(
    "imports, renames, layouts, exports DDL, and round-trips project JSON",
    { skip: skipReason },
    async () => {
      assert.ok(
        fs.existsSync(DIST_DIR),
        `expected built frontend at ${DIST_DIR}; run npm run build first`,
      );

      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "drawdb-browser-"));
      const projectPath = path.join(tempDir, "fixture.erd.json");
      const fixtureSql = path.join(tempDir, "two_schema.sql");
      fs.writeFileSync(
        fixtureSql,
        [
          "CREATE DATABASE IF NOT EXISTS ANALYTICS;",
          "CREATE SCHEMA IF NOT EXISTS ANALYTICS.CORE;",
          "CREATE SCHEMA IF NOT EXISTS ANALYTICS.MART;",
          "",
          "CREATE TABLE ANALYTICS.CORE.CUSTOMER (",
          "    CUSTOMER_ID NUMBER(38, 0) NOT NULL,",
          "    CUSTOMER_NAME VARCHAR(200) NOT NULL,",
          "    CONSTRAINT PK_CUSTOMER PRIMARY KEY (CUSTOMER_ID)",
          ");",
          "",
          "CREATE TABLE ANALYTICS.MART.ORDER_FACT (",
          "    ORDER_ID NUMBER(38, 0) NOT NULL,",
          "    CUSTOMER_ID NUMBER(38, 0) NOT NULL,",
          "    ORDER_DATE DATE NOT NULL,",
          "    CONSTRAINT PK_ORDER_FACT PRIMARY KEY (ORDER_ID),",
          "    CONSTRAINT FK_ORDER_FACT_CUSTOMER FOREIGN KEY (CUSTOMER_ID)",
          "        REFERENCES ANALYTICS.CORE.CUSTOMER (CUSTOMER_ID)",
          ");",
          "",
        ].join("\n"),
      );

      await runCommand(
        "python3",
        [
          "-m",
          "erd_tool.cli",
          "snowflake-import",
          fixtureSql,
          "--name",
          "browser-demo",
          "--output",
          projectPath,
        ],
        {
          cwd: erdToolRepo,
          env: {
            ...process.env,
            PYTHONPATH: path.join(erdToolRepo, "src"),
          },
        },
      );

      const projectJson = fs.readFileSync(projectPath, "utf8");
      const imported = JSON.parse(projectJson);
      assert.equal(imported.physical_model.namespaces.length, 2);
      assert.deepEqual(
        imported.physical_model.namespaces.map((ns) => ns.id).sort(),
        ["namespace:ANALYTICS.CORE", "namespace:ANALYTICS.MART"],
      );
      assert.equal(imported.physical_model.tables.length, 2);
      assert.equal(imported.physical_model.relationships.length, 1);
      assert.ok(
        imported.physical_model.tables.some(
          (table) => table.id === "table:ANALYTICS.CORE.CUSTOMER",
        ),
      );
      assert.ok(
        imported.physical_model.tables.some(
          (table) => table.id === "table:ANALYTICS.MART.ORDER_FACT",
        ),
      );

      const port = await getFreePort();
      const baseUrl = `http://127.0.0.1:${port}`;
      const server = spawn(
        "python3",
        [
          "-m",
          "erd_tool.cli",
          "serve",
          "--frontend-dir",
          DIST_DIR,
          "--host",
          "127.0.0.1",
          "--port",
          String(port),
        ],
        {
          cwd: erdToolRepo,
          env: {
            ...process.env,
            PYTHONPATH: path.join(erdToolRepo, "src"),
          },
          stdio: ["ignore", "pipe", "pipe"],
        },
      );

      let browser;
      const pageErrors = [];
      const consoleErrors = [];

      try {
        await waitForServer(`${baseUrl}/`);

        browser = await chromium.launch({ headless: true });
        const context = await browser.newContext({ acceptDownloads: true });
        await context.addInitScript(() => {
          indexedDB.deleteDatabase("drawDB");
        });
        const page = await context.newPage();
        page.on("pageerror", (error) => {
          pageErrors.push(String(error?.message || error));
        });
        page.on("console", (message) => {
          if (message.type() === "error") {
            const text = message.text();
            if (
              /favicon|React DevTools|Download the React DevTools|404 \(File not found\)|Failed to load resource/i.test(
                text,
              )
            ) {
              return;
            }
            consoleErrors.push(text);
          }
        });

        await page.goto(`${baseUrl}/editor`, { waitUntil: "domcontentloaded" });
        await chooseSnowflake(page);

        await page.getByTestId("erd-open-project").click();
        await page.getByTestId("erd-project-json").fill(projectJson);
        await page.getByTestId("erd-load-project-json").click();
        await page.getByText("CUSTOMER", { exact: true }).first().waitFor({
          timeout: 15000,
        });
        assert.ok(
          (await page.getByText("CUSTOMER", { exact: true }).count()) >= 1,
        );
        assert.ok(
          (await page.getByText("ORDER_FACT", { exact: true }).count()) >= 1,
        );

        const customerHeader = page
          .locator(".semi-collapse-header")
          .filter({ hasText: "CUSTOMER" });
        if ((await customerHeader.count()) > 0) {
          await customerHeader.first().click();
        }
        await renameCustomerTable(page);

        await page.getByTestId("erd-auto-layout").click();
        await page.waitForTimeout(1500);

        await page.getByTestId("erd-show-ddl").click();
        const ddl = await page.getByTestId("erd-ddl-output").innerText();
        assert.match(ddl, /CREATE SCHEMA IF NOT EXISTS ANALYTICS\.CORE;/);
        assert.match(ddl, /CREATE SCHEMA IF NOT EXISTS ANALYTICS\.MART;/);
        assert.match(ddl, /CREATE TABLE ANALYTICS\.CORE\.CLIENT\b/);
        assert.match(ddl, /CREATE TABLE ANALYTICS\.MART\.ORDER_FACT\b/);
        assert.match(ddl, /REFERENCES ANALYTICS\.CORE\.CLIENT\b/);
        assert.match(ddl, /NOT ENFORCED/);
        assert.equal(ddl.includes("RELY"), false);
        await page
          .locator(".semi-modal")
          .filter({ has: page.getByTestId("erd-ddl-output") })
          .getByRole("button", { name: /^close$/i })
          .click();

        const downloadPromise = page.waitForEvent("download", {
          timeout: 15000,
        });
        await page.getByTestId("erd-save-project").click();
        const download = await downloadPromise;
        const savedPath = path.join(tempDir, await download.suggestedFilename());
        await download.saveAs(savedPath);
        const savedJson = fs.readFileSync(savedPath, "utf8");
        const savedProject = JSON.parse(savedJson);
        assert.deepEqual(
          savedProject.physical_model.namespaces.map((ns) => ns.id).sort(),
          ["namespace:ANALYTICS.CORE", "namespace:ANALYTICS.MART"],
        );
        assert.ok(
          savedProject.physical_model.tables.some(
            (table) => table.name === "CLIENT" && table.namespace_id === "namespace:ANALYTICS.CORE",
          ),
        );
        assert.ok(
          savedProject.physical_model.tables.some(
            (table) =>
              table.name === "ORDER_FACT" &&
              table.namespace_id === "namespace:ANALYTICS.MART",
          ),
        );
        const clientNode =
          savedProject.diagram_layout.nodes["table:ANALYTICS.CORE.CLIENT"];
        assert.ok(clientNode);
        assert.equal(typeof clientNode.x, "number");
        assert.equal(typeof clientNode.y, "number");

        await page.getByTestId("erd-open-project").click();
        await page.getByTestId("erd-project-json").fill(savedJson);
        await page.getByTestId("erd-load-project-json").click();
        await page.getByText("CLIENT", { exact: true }).first().waitFor({
          timeout: 15000,
        });
        assert.ok((await page.getByText("CLIENT", { exact: true }).count()) >= 1);
        assert.ok(
          (await page.getByText("ORDER_FACT", { exact: true }).count()) >= 1,
        );

        const unexpected = [...pageErrors, ...consoleErrors].filter(
          (message) =>
            !/ResizeObserver loop|Non-Error promise rejection/i.test(message),
        );
        assert.deepEqual(
          unexpected,
          [],
          `Unexpected browser errors:\n${unexpected.join("\n")}`,
        );
      } finally {
        if (browser) {
          await browser.close();
        }
        await terminateProcess(server);
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    },
  );
});
